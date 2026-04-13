import { useState, useEffect, useCallback } from "react";

// Wake up HF Space before user hits login/register
async function wakeUpAPI() {
  try { await fetch(`${API_URL}/`); } catch (_) {}
}
// Call on app load
wakeUpAPI();

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG — ONE place to change the API URL
// ═══════════════════════════════════════════════════════════════════════════
// Your HuggingFace Space URL (update if your username changes)
const API_URL = "https://daktari0-infoach-api.hf.space";


// ── JWT stored in memory + localStorage for persistence ──────────────────
let _authToken = null;

// Restore token on page load
try {
  const stored = localStorage.getItem("infoach:token");
  if (stored) _authToken = stored;
} catch (_) {}

function setToken(token) {
  _authToken = token;
  try {
    if (token) localStorage.setItem("infoach:token", token);
    else localStorage.removeItem("infoach:token");
  } catch (_) {}
}

// ── Central API fetch — always uses API_URL + current token ──────────────
async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (_authToken) headers["Authorization"] = `Bearer ${_authToken}`;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });

  if (res.status === 401) {
    setToken(null);
    window.location.reload();
    return null;
  }

  if (!res.ok) {
    let detail = `API error ${res.status}`;
    try {
      const err = await res.json();
      detail = err.detail || detail;
    } catch (_) {}
    throw new Error(detail);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function normalisePhone(phone) {
  return String(phone).trim().replace(/^(?:\+254|254|0)/, "254");
}

async function apiRegister(form) {
  const data = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      phone:     normalisePhone(form.phone),
      name:      form.name,
      password:  form.password,
      persona:   form.persona,
      job_title: form.job_title,
    }),
  });
  setToken(data.token);
  // Cache user for offline
  try {
    localStorage.setItem(`infoach:user:${data.user.phone}`, JSON.stringify(data.user));
  } catch (_) {}
  return data.user;
}

async function apiLogin(phone, password) {
  const normPhone = normalisePhone(phone);
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: normPhone, password }),
  });
  setToken(data.token);
  try {
    localStorage.setItem(`infoach:user:${data.user.phone}`, JSON.stringify(data.user));
  } catch (_) {}
  return data.user;
}

async function apiLoadTxns() {
  try {
    const data = await apiFetch("/transactions?limit=5000");
    return data?.transactions || [];
  } catch (_) {
    return [];
  }
}

async function apiSaveTxns(txns) {
  try {
    await apiFetch("/transactions", {
      method: "POST",
      body: JSON.stringify(
        txns.map((t) => ({
          id:          String(t.id || Date.now()),
          date:        t.date,
          amount:      t.amount,
          balance:     t.balance || 0,
          category:    t.category || "other",
          description: t.description || "",
        }))
      ),
    });
  } catch (_) {}
}

async function apiAnalyze() {
  try {
    return await apiFetch("/coaching/analyze", { method: "POST" });
  } catch (_) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OCCUPATION GROUPS
// ═══════════════════════════════════════════════════════════════════════════
const OCCUPATION_GROUPS = [
  {
    persona: "Daily Hustler",
    label: "Daily Hustler / Msukumo wa Kila Siku",
    description: "Earn money daily from various small activities",
    descSw: "Kupata pesa kila siku kutoka shughuli ndogo ndogo",
    jobs: [
      "Street vendor / Muuzaji mtaani",
      "Hawker / Hawker",
      "Casual labourer / Mfanyakazi wa muda",
      "Delivery rider / Mpiga mbio wa delivery",
      "Car wash / Kuosha magari",
      "Shoe shiner / Mpiga rangi viatu",
      "Porter / Mpeba",
      "Market porter / Mchukuzi wa soko",
      "Other daily work / Kazi nyingine za kila siku",
    ],
  },
  {
    persona: "Small-Scale Trader",
    label: "Small-Scale Trader / Mfanyabiashara Mdogo",
    description: "Sell goods from a stall, shop or market",
    descSw: "Kuuza bidhaa dukani, stendi au sokoni",
    jobs: [
      "Market stall / Stendi ya soko",
      "Vegetable seller / Muuzaji mboga",
      "Fruit seller / Muuzaji matunda",
      "Grocery / Duka la vyakula",
      "Clothes seller / Muuzaji nguo",
      "Butcher / Mchinjaji",
      "Fish monger / Muuzaji samaki",
      "General shop / Duka la jumla",
      "Other trading / Biashara nyingine",
    ],
  },
  {
    persona: "Artisan - Stable",
    label: "Skilled Artisan (Stable) / Fundi (Imara)",
    description: "Skilled trade with regular clients and steady work",
    descSw: "Fundi mwenye wateja wa kawaida na kazi ya uhakika",
    jobs: [
      "Carpenter / Seremala",
      "Electrician / Fundi umeme",
      "Plumber / Fundi bomba",
      "Welder / Fundi chuma",
      "Mechanic / Fundi gari",
      "Mason / Mwashi",
      "Painter / Mpigaji rangi",
      "Tailor (established) / Fundi kushona (imara)",
      "Electronics repair / Fundi elektroniki",
      "Other skilled trade (stable) / Ufundi mwingine (imara)",
    ],
  },
  {
    persona: "Artisan - Struggling",
    label: "Skilled Artisan (Struggling) / Fundi (Anayojitahidi)",
    description: "Skilled work but irregular jobs and unstable income",
    descSw: "Fundi mwenye kazi za nasibu na mapato yasiyotabirika",
    jobs: [
      "Casual artisan / Fundi wa nasibu",
      "Tailor (casual) / Fundi kushona (nasibu)",
      "Shoe repairer / Fundi viatu",
      "Jua Kali artisan / Fundi Jua Kali",
      "Small repairs / Marekebisho madogo",
      "Other skilled trade (struggling) / Ufundi mwingine (anayojitahidi)",
    ],
  },
  {
    persona: "Boda Boda Operator",
    label: "Boda Boda / Pikipiki",
    description: "Motorcycle taxi or delivery operator",
    descSw: "Dereva wa pikipiki au delivery",
    jobs: [
      "Boda boda rider / Dereva wa boda boda",
      "Motorcycle taxi / Teksi ya pikipiki",
      "Motorcycle delivery / Delivery ya pikipiki",
      "Tuk-tuk operator / Dereva wa tuk-tuk",
    ],
  },
  {
    persona: "Agricultural Worker",
    label: "Agricultural Worker / Mkulima",
    description: "Farming, livestock or fishing as main income",
    descSw: "Kilimo, mifugo au uvuvi kama chanzo kikuu cha mapato",
    jobs: [
      "Smallholder farmer / Mkulima mdogo",
      "Livestock keeper / Mfugaji",
      "Fisher / Mvuvi",
      "Farm worker / Mfanyakazi wa shamba",
      "Dairy farmer / Mfugaji wa ng'ombe maziwa",
      "Poultry farmer / Mfugaji wa kuku",
      "Other farming / Kilimo kingine",
    ],
  },
  {
    persona: "Struggling Entrepreneur",
    label: "Entrepreneur / Mjasiriamali",
    description: "Running a small business with employees or fixed costs",
    descSw: "Kuendesha biashara ndogo yenye wafanyakazi au gharama za kudumu",
    jobs: [
      "Small restaurant / Hoteli ndogo",
      "Salon / Saluni",
      "Barbershop / Kinyozi",
      "Mpesa agent / Wakala wa M-PESA",
      "Cyber cafe / Saiber cafe",
      "Printing / Uchapishaji",
      "Wholesale distributor / Msambazaji",
      "Other small business / Biashara nyingine ndogo",
    ],
  },
];

const SAVINGS_TYPES = [
  { value: "none",         label: "None / Hakuna" },
  { value: "mshwari_only", label: "M-Shwari only" },
  { value: "chama_only",   label: "Chama / ROSCA only" },
  { value: "sacco_only",   label: "SACCO only" },
  { value: "multiple",     label: "Multiple / Nyingi" },
];

const BORROW_HABITS = [
  { value: "never",          label: "Never / Kamwe" },
  { value: "emergency_only", label: "Emergency only / Dharura tu" },
  { value: "regular",        label: "Regular / Mara kwa mara" },
  { value: "chronic",        label: "Chronic / Kila wakati" },
];

const FULIZA_ATTITUDES = [
  { value: "refuses",   label: "Refuses / Nakataa" },
  { value: "reluctant", label: "Reluctant / Siko tayari" },
  { value: "pragmatic", label: "Pragmatic / Wakati muhimu" },
  { value: "habitual",  label: "Habitual / Kila siku" },
];

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL ANALYTICS (fallback when API is offline)
// ═══════════════════════════════════════════════════════════════════════════

const LOAN_CATS = new Set([
  "digital_loan_received","fuliza_draw","mshwari_withdrawal",
  "sacco_withdrawal","chama_withdrawal","other","reversal",
]);

function computeFeatures(transactions) {
  if (!transactions || transactions.length === 0) return null;

  const txns = transactions.map((t) => ({ ...t, amount: parseFloat(t.amount) }));

  const byDate = {};
  txns.forEach((t) => {
    const d = (t.date || "").slice(0, 10);
    if (!d || d.length < 10) return;
    const yr = parseInt(d.slice(0, 4));
    if (yr < 2015 || yr > 2030) return;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  const days = Object.keys(byDate).sort();
  if (days.length === 0) return null;

  const dailyEarned = days.map((d) =>
    byDate[d]
      .filter((t) => t.amount > 0 && !LOAN_CATS.has(t.category))
      .reduce((s, t) => s + t.amount, 0)
  );

  const earningDays = dailyEarned.filter((v) => v >= 10);
  const incomeMean  = earningDays.length > 0
    ? earningDays.reduce((a, b) => a + b, 0) / earningDays.length : 0;
  const incomeStd   = earningDays.length > 1
    ? Math.sqrt(earningDays.reduce((s, v) => s + Math.pow(v - incomeMean, 2), 0) / earningDays.length) : 0;
  const incomeCV    = incomeMean > 0 ? incomeStd / incomeMean : 0;
  const earnDaysPct = earningDays.length / days.length;

  const endBalances = days.map((d) => {
    const dt = byDate[d];
    return dt[dt.length - 1].balance || 0;
  });
  const balMean = endBalances.reduce((a, b) => a + b, 0) / endBalances.length;
  const pctZero = endBalances.filter((b) => b <= 50).length / endBalances.length;

  const fulizaTxns   = txns.filter(
    (t) => t.category === "fuliza_draw" || /fuliza/i.test(t.description || "")
  );
  const fulizaPerDay = fulizaTxns.length / Math.max(days.length, 1);

  const totalEarned = earningDays.reduce((a, b) => a + b, 0);
  const DEBT_CATS = new Set([
    "digital_loan_repayment","fuliza_repayment","mshwari_deposit",
    "sacco_contribution","chama_contribution",
  ]);
  const totalSpent = txns
    .filter((t) => t.amount < 0 && !DEBT_CATS.has(t.category))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const spendRatio = totalEarned > 0 ? totalSpent / totalEarned : 1.0;

  const hasMshwari = txns.some((t) => /mshwari/i.test(t.description || "")) ? 1 : 0;
  const hasSacco   = txns.some((t) => /sacco/i.test(t.description || "")) ? 1 : 0;

  return {
    income_mean:    Math.round(incomeMean),
    income_cv:      parseFloat(incomeCV.toFixed(3)),
    earn_days_pct:  parseFloat(earnDaysPct.toFixed(3)),
    bal_mean:       Math.round(balMean),
    pct_zero_bal:   parseFloat(pctZero.toFixed(3)),
    spend_ratio:    parseFloat(spendRatio.toFixed(3)),
    fuliza_per_day: parseFloat(fulizaPerDay.toFixed(2)),
    has_mshwari:    hasMshwari,
    has_sacco:      hasSacco,
    total_earned:   Math.round(totalEarned),
    total_spent:    Math.round(totalSpent),
    n_days:         days.length,
  };
}

function classifyTier(features, persona) {
  if (!features) return { tier: "COPING", num: 3 };
  const { pct_zero_bal, fuliza_per_day, bal_mean, spend_ratio } = features;

  if (persona === "Agricultural Worker") {
    if (pct_zero_bal > 0.50 && fuliza_per_day > 1.5) return { tier: "CRISIS",   num: 1 };
    if (pct_zero_bal > 0.35 || fuliza_per_day > 1.0) return { tier: "STRESSED", num: 2 };
    if (bal_mean > 3000)                              return { tier: "STABLE",   num: 4 };
    return { tier: "COPING", num: 3 };
  }

  if (pct_zero_bal > 0.60 && fuliza_per_day > 3.0)  return { tier: "CRISIS",   num: 1 };
  if (pct_zero_bal > 0.30 || fuliza_per_day > 2.0 || spend_ratio > 1.15)
                                                      return { tier: "STRESSED", num: 2 };
  if (pct_zero_bal < 0.08 && bal_mean > 3000 && spend_ratio < 0.85)
                                                      return { tier: "STABLE",   num: 4 };
  return { tier: "COPING", num: 3 };
}

// Coaching DB (abbreviated — full version in coaching_engine.py on the server)
const COACHING_DB = {
  "Daily Hustler_1": {
    en: "CRISIS: Lock KES 50 in M-Shwari RIGHT NOW before any spending. Avoid Fuliza for 7 days.",
    sw: "DHARURA: Funga KES 50 M-Shwari SASA HIVI kabla ya kutumia chochote. Epuka Fuliza siku 7.",
  },
  "Daily Hustler_2": {
    en: "Each morning before any spending, lock KES 100 in M-Shwari. 30 days = KES 3,000 saved.",
    sw: "Kila asubuhi kabla ya kutumia, funga KES 100 M-Shwari. Siku 30 = KES 3,000 akiba.",
  },
  "Daily Hustler_3": {
    en: "Good earning rhythm. Save KES 200/day in M-Shwari — 3 months = KES 18,000 buffer.",
    sw: "Una mdundo mzuri. Weka KES 200/siku M-Shwari — miezi 3 = KES 18,000 akiba ya dharura.",
  },
  "Daily Hustler_4": {
    en: "Strong discipline. Join a SACCO to grow savings faster and access lower-interest loans.",
    sw: "Nidhamu nzuri. Jiunge SACCO kukuza akiba haraka na kupata mikopo ya riba nafuu.",
  },
  "Small-Scale Trader_1": {
    en: "Stop restocking until you understand why costs exceed sales. Count your stock today.",
    sw: "Simamisha kujaza bidhaa hadi uelewa kwa nini gharama zinazidi mauzo. Hesabu bidhaa leo.",
  },
  "Small-Scale Trader_2": {
    en: "Restock daily in small amounts. Use Pochi La Biashara to separate business from personal money.",
    sw: "Jaza bidhaa kidogo kila siku. Tumia Pochi La Biashara kutenganisha pesa za biashara.",
  },
  "Small-Scale Trader_3": {
    en: "Find your 3 best-selling items and always keep them stocked. Save 10% of profit weekly.",
    sw: "Tafuta bidhaa 3 zinazouza zaidi na uzidumishe. Weka 10% ya faida wiki yote.",
  },
  "Small-Scale Trader_4": {
    en: "Growing well. Join a traders SACCO and consider applying for a Stawi business loan (from 9%).",
    sw: "Unakua vizuri. Jiunge SACCO ya wafanyabiashara na fikiria mkopo wa Stawi (kuanzia 9%).",
  },
  "Artisan - Stable_1": {
    en: "Work dried up. Contact 5 past clients today. Offer a small discount for bookings this week.",
    sw: "Kazi imeisha. Wasiliana na wateja 5 wa zamani leo. Toa punguzo kwa miadi wiki hii.",
  },
  "Artisan - Stable_2": {
    en: "Quote 10% higher on your next 3 projects. Save that extra in M-Shwari after each payment.",
    sw: "Toa bei 10% zaidi kwa miradi 3 ijayo. Weka ziada M-Shwari baada ya kila malipo.",
  },
  "Artisan - Stable_3": {
    en: "Build KES 15,000 emergency fund in M-Shwari. Register for SHA health cover (KES 500/month).",
    sw: "Jenga akiba ya dharura KES 15,000 M-Shwari. Jisajili SHA bima ya afya (KES 500/mwezi).",
  },
  "Artisan - Stable_4": {
    en: "Excellent. Join Jua Kali SACCO for larger loans. Train an apprentice to grow your capacity.",
    sw: "Bora. Jiunge SACCO ya Jua Kali kwa mikopo mikubwa. Funza mwanafunzi kuongeza uwezo wako.",
  },
  "Artisan - Struggling_1": {
    en: "Deposit ALL cash job payments into M-PESA immediately — even KES 50. Builds your loan record.",
    sw: "Weka MALIPO YOTE ya kazi taslimu M-PESA mara moja — hata KES 50. Hujenga rekodi ya mkopo.",
  },
  "Artisan - Struggling_2": {
    en: "Specialise in one skill and charge KES 200 more per job. Save that extra in M-Shwari daily.",
    sw: "Bobea katika ujuzi mmoja na kutoza KES 200 zaidi kwa kazi. Weka ziada M-Shwari kila siku.",
  },
  "Artisan - Struggling_3": {
    en: "A welder who specialises in gates earns 40% more than a general welder. Pick your niche.",
    sw: "Fundi wa malango anayebobea anapata 40% zaidi ya fundi wa kawaida. Chagua utaalamu wako.",
  },
  "Artisan - Struggling_4": {
    en: "Save KES 500/week in M-Shwari — 6 months = KES 13,000 to buy your own tools.",
    sw: "Weka KES 500/wiki M-Shwari — miezi 6 = KES 13,000 kununua zana zako mwenyewe.",
  },
  "Boda Boda Operator_1": {
    en: "Save KES 200 every day in M-Shwari — 30 days = KES 6,000 repair fund. No skipping.",
    sw: "Weka KES 200 kila siku M-Shwari — siku 30 = KES 6,000 ya matengenezo. Usiruke.",
  },
  "Boda Boda Operator_2": {
    en: "Set aside KES 300/day for repairs — treat it as a fixed daily cost before any spending.",
    sw: "Weka KES 300/siku kwa matengenezo — ifikirie kama gharama ya lazima ya kila siku.",
  },
  "Boda Boda Operator_3": {
    en: "Build KES 8,000 M-Shwari emergency fund so one breakdown doesn't wipe you out.",
    sw: "Jenga akiba ya KES 8,000 M-Shwari ili uharibike mmoja usikufute.",
  },
  "Boda Boda Operator_4": {
    en: "Excellent. Think about owning a second bike through a boda boda SACCO.",
    sw: "Bora. Fikiria kumiliki pikipiki ya pili kupitia SACCO ya boda boda.",
  },
  "Agricultural Worker_1": {
    en: "Apply for DigiFarm or Apollo input credit next planting — 15% interest vs shylock 30%.",
    sw: "Omba mkopo wa DigiFarm au Apollo kupanda ijayo — riba 15% badala ya shylock 30%.",
  },
  "Agricultural Worker_2": {
    en: "Next harvest: save KES 2,000/month in SACCO for the 4 lean months ahead.",
    sw: "Mavuno ijayo: weka KES 2,000/mwezi SACCO kwa miezi 4 ngumu inayokuja.",
  },
  "Agricultural Worker_3": {
    en: "Good seasonal management. During lean season, grow vegetables to smooth income.",
    sw: "Usimamizi mzuri wa msimu. Wakati wa ukame, lima mboga kupunguza pengo la mapato.",
  },
  "Agricultural Worker_4": {
    en: "Consider contract farming with Twiga Foods — guaranteed buyers reduce your income risk.",
    sw: "Fikiria kilimo cha mkataba na Twiga Foods — wanunuzi waliohakikishiwa hupunguza hatari.",
  },
  "Struggling Entrepreneur_1": {
    en: "Separate business and personal money NOW using Pochi La Biashara (free on M-PESA). Cash only.",
    sw: "Tenganisha pesa SASA ukitumia Pochi La Biashara (bila malipo M-PESA). Pesa taslimu tu.",
  },
  "Struggling Entrepreneur_2": {
    en: "Cash flow is the problem, not revenue. Pay yourself a fixed salary, not whatever is left.",
    sw: "Mtiririko wa pesa ndio tatizo. Jilipe mshahara maalum, si kilichobaki tu.",
  },
  "Struggling Entrepreneur_3": {
    en: "Build a 30-day cash reserve equal to one month of fixed costs.",
    sw: "Jenga akiba ya pesa ya siku 30 sawa na gharama za mwezi mmoja wa kudumu.",
  },
  "Struggling Entrepreneur_4": {
    en: "Consider a Stawi loan (from KES 30,000 at 9% p.a.) for expansion.",
    sw: "Fikiria mkopo wa Stawi (kutoka KES 30,000 kwa 9% kwa mwaka) kwa upanuzi.",
  },
};

function getCoaching(persona, tierNum) {
  const key = `${persona}_${tierNum}`;
  return (
    COACHING_DB[key] || {
      en: "Focus on building a 30-day income buffer and reducing debt step by step.",
      sw: "Zingatia kujenga akiba ya siku 30 na kupunguza madeni hatua kwa hatua.",
    }
  );
}

const TIER_CONFIG = {
  CRISIS:   { icon: "◈", color: "#E53E3E", label: "Crisis / Dharura" },
  STRESSED: { icon: "◉", color: "#D69E2E", label: "Stressed / Msongo" },
  COPING:   { icon: "◎", color: "#DD6B20", label: "Coping / Inakwenda" },
  STABLE:   { icon: "●", color: "#38A169", label: "Stable / Imara" },
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const S = {
  app: {
    minHeight: "100vh",
    background: "#0A1628",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    color: "#F0F4F8",
  },
  card: {
    background: "#0F1F35",
    borderRadius: 16,
    border: "1px solid #1E3A5F",
    padding: 24,
  },
  input: {
    width: "100%",
    background: "#0A1628",
    border: "1px solid #1E3A5F",
    borderRadius: 10,
    padding: "12px 16px",
    color: "#F0F4F8",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    background: "#0A1628",
    border: "1px solid #1E3A5F",
    borderRadius: 10,
    padding: "12px 16px",
    color: "#F0F4F8",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  },
  btnGreen: {
    background: "linear-gradient(135deg, #00C875 0%, #00A35C 100%)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "14px 28px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  btnOutline: {
    background: "transparent",
    color: "#00C875",
    border: "1px solid #00C875",
    borderRadius: 10,
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  label: {
    fontSize: 12,
    color: "#7A9CC0",
    marginBottom: 6,
    display: "block",
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  tag: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// WELCOME SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function WelcomeScreen({ onLogin, onRegister }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0A1628", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>◈</div>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: "#00C875", margin: 0 }}>InFoach</h1>
        <p style={{ color: "#7A9CC0", marginTop: 8, fontSize: 16 }}>Mshauri wa Fedha · Financial Coach</p>
        <p style={{ color: "#4A6A8A", fontSize: 13, marginTop: 4 }}>For Kenya's informal sector workers</p>
      </div>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ ...S.card, marginBottom: 16, textAlign: "center" }}>
          <p style={{ color: "#7A9CC0", marginBottom: 20, fontSize: 14 }}>
            Track your income, get personalised coaching, and build financial resilience — in English and Kiswahili.
          </p>
          <button style={S.btnGreen} onClick={onRegister}>
            Create Account · Fungua Akaunti
          </button>
          <div style={{ marginTop: 16 }}>
            <button style={{ ...S.btnOutline, width: "100%" }} onClick={onLogin}>
              Sign In · Ingia
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {["🔒 Secure", "🇰🇪 Kenya-built", "🌍 Bilingual", "📊 AI-powered"].map((t) => (
            <span key={t} style={{ ...S.tag, background: "#0F1F35", color: "#7A9CC0", border: "1px solid #1E3A5F" }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN — FIXED: uses API_URL, correct state vars, correct field names
// ═══════════════════════════════════════════════════════════════════════════
function LoginScreen({ onSuccess, onBack }) {
  const [phone,    setPhone]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      setError("Enter phone number and password / Ingiza nambari na nywila");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const user = await apiLogin(phone, password);
      onSuccess(user);
    } catch (err) {
      setError(err.message || "Login failed · Kuingia kumeshindwa");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0A1628", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#7A9CC0", cursor: "pointer", marginBottom: 24, fontSize: 14 }}>← Back</button>
        <h2 style={{ color: "#F0F4F8", marginBottom: 8 }}>Sign In · Ingia</h2>
        <p style={{ color: "#7A9CC0", marginBottom: 28, fontSize: 14 }}>Use your M-PESA registered phone number</p>
        <div style={S.card}>
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Phone Number / Nambari ya Simu</label>
            <input
              style={S.input}
              placeholder="07XX XXX XXX"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={S.label}>Password / Nywila</label>
            <input
              style={S.input}
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
            {error && <p style={{ color: "#E53E3E", fontSize: 13, marginTop: 8 }}>{error}</p>}
          </div>
          <button
            style={{ ...S.btnGreen, opacity: loading ? 0.7 : 1 }}
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In · Ingia"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER SCREEN — FIXED: uses apiRegister(), removed sbFetch dependency
// ═══════════════════════════════════════════════════════════════════════════
function RegisterScreen({ onSuccess, onBack }) {
  const [step,          setStep]          = useState(1);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [error,         setError]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [form, setForm] = useState({
    phone: "", name: "", password: "", job_title: "", persona: "",
    is_married: false, n_kids: 0, monthly_rent: 0,
    savings_type: "none", borrowing_habit: "emergency_only",
    fuliza_attitude: "pragmatic", has_sha: false, has_nssf: false,
    sends_remittance: false, remittance_amount: 0, tithe_amount: 0,
  });

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFinish = async () => {
    // Basic validation
    if (!form.phone.match(/^(?:254|\+254|0)?[17]\d{8}$/)) {
      setError("Invalid phone number / Nambari si sahihi");
      return;
    }
    if (!form.password || form.password.length < 6) {
      setError("Password must be 6+ characters / Nywila lazima iwe na herufi 6+");
      return;
    }
    if (!form.persona || !form.job_title) {
      setError("Please select your occupation / Tafadhali chagua kazi yako");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const user = await apiRegister(form);
      onSuccess(user);
    } catch (err) {
      // 409 = already registered
      if (err.message && err.message.includes("409") || err.message.includes("registered")) {
        setError("Phone already registered. Please sign in. / Nambari imesajiliwa. Tafadhali ingia.");
      } else {
        setError(err.message || "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const steps = ["Account", "Household", "Finance", "Social"];

  return (
    <div style={{ minHeight: "100vh", background: "#0A1628", padding: 24 }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#7A9CC0", cursor: "pointer", marginBottom: 24, fontSize: 14 }}>← Back</button>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 4, borderRadius: 2, background: i < step ? "#00C875" : "#1E3A5F", marginBottom: 6 }} />
              <span style={{ fontSize: 11, color: i < step ? "#00C875" : "#4A6A8A" }}>{s}</span>
            </div>
          ))}
        </div>

        <div style={S.card}>
          {/* ── STEP 1: Account details + occupation ── */}
          {step === 1 && (
            <div>
              <h3 style={{ marginBottom: 24, color: "#F0F4F8" }}>Create your account</h3>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Full Name / Jina Lako</label>
                <input style={S.input} placeholder="e.g. Wanjiku Kamau" value={form.name}
                  onChange={(e) => update("name", e.target.value)} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Phone Number (M-PESA) / Nambari ya Simu</label>
                <input style={S.input} placeholder="07XX XXX XXX" value={form.phone}
                  onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Password / Nywila (min 6 characters)</label>
                <input style={S.input} type="password" placeholder="Create a password"
                  value={form.password} onChange={(e) => update("password", e.target.value)} />
              </div>

              {/* Occupation picker */}
              <div style={{ marginBottom: 24 }}>
                <label style={S.label}>Your Work / Kazi Yako</label>
                {form.job_title ? (
                  <div style={{ background: "#003D20", border: "2px solid #00C875", borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ color: "#00C875", fontSize: 13, fontWeight: 600 }}>{form.job_title}</div>
                    <div style={{ color: "#4A6A8A", fontSize: 11, marginTop: 2 }}>Classified as: {form.persona}</div>
                    <button onClick={() => { update("job_title", ""); update("persona", ""); setSelectedGroup(null); }}
                      style={{ background: "none", border: "none", color: "#7A9CC0", cursor: "pointer", fontSize: 12, marginTop: 4, padding: 0 }}>
                      Change / Badilisha
                    </button>
                  </div>
                ) : selectedGroup === null ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {OCCUPATION_GROUPS.map((group, i) => (
                      <button key={i} onClick={() => setSelectedGroup(i)}
                        style={{ background: "#0A1628", border: "1px solid #1E3A5F", borderRadius: 10, padding: "12px 16px", textAlign: "left", cursor: "pointer", color: "#F0F4F8" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{group.label}</div>
                        <div style={{ fontSize: 12, color: "#4A6A8A" }}>{group.description}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    <button onClick={() => setSelectedGroup(null)}
                      style={{ background: "none", border: "none", color: "#7A9CC0", cursor: "pointer", fontSize: 13, marginBottom: 10, padding: 0 }}>
                      ← Back to categories
                    </button>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {OCCUPATION_GROUPS[selectedGroup].jobs.map((job, j) => (
                        <button key={j} onClick={() => {
                          update("job_title", job);
                          update("persona", OCCUPATION_GROUPS[selectedGroup].persona);
                          setSelectedGroup(null);
                        }}
                          style={{ background: "#0A1628", border: "1px solid #1E3A5F", borderRadius: 8, padding: "10px 14px", textAlign: "left", cursor: "pointer", color: "#F0F4F8", fontSize: 13 }}>
                          {job}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && <p style={{ color: "#E53E3E", fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <button style={S.btnGreen} onClick={() => {
                if (!form.name || !form.phone || !form.persona || form.password.length < 6) {
                  setError("Fill all fields. Password min 6 characters.");
                  return;
                }
                setError(""); setStep(2);
              }}>Continue →</button>
            </div>
          )}

          {/* ── STEP 2: Household ── */}
          {step === 2 && (
            <div>
              <h3 style={{ marginBottom: 24, color: "#F0F4F8" }}>Your Household · Nyumba Yako</h3>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Marital Status</label>
                <div style={{ display: "flex", gap: 12 }}>
                  {["Single", "Married"].map((m) => (
                    <button key={m} onClick={() => update("is_married", m === "Married")}
                      style={{ flex: 1, padding: 12, borderRadius: 10, border: `2px solid ${form.is_married === (m === "Married") ? "#00C875" : "#1E3A5F"}`, background: form.is_married === (m === "Married") ? "#003D20" : "#0A1628", color: "#F0F4F8", cursor: "pointer" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Number of Children / Watoto · {form.n_kids}</label>
                <input type="range" min={0} max={8} value={form.n_kids}
                  onChange={(e) => update("n_kids", parseInt(e.target.value))}
                  style={{ width: "100%", accentColor: "#00C875" }} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={S.label}>Monthly Rent (KES) / Kodi ya Mwezi</label>
                <input style={S.input} type="number" placeholder="0 if rent-free"
                  value={form.monthly_rent || ""} onChange={(e) => update("monthly_rent", parseInt(e.target.value) || 0)} />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...S.btnOutline, flex: 1 }} onClick={() => setStep(1)}>← Back</button>
                <button style={{ ...S.btnGreen, flex: 2 }} onClick={() => setStep(3)}>Continue →</button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Financial profile ── */}
          {step === 3 && (
            <div>
              <h3 style={{ marginBottom: 24, color: "#F0F4F8" }}>Financial Profile · Hali ya Fedha</h3>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Savings Method / Jinsi Unavyoweka Akiba</label>
                <select style={S.select} value={form.savings_type} onChange={(e) => update("savings_type", e.target.value)}>
                  {SAVINGS_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Borrowing Habit / Tabia ya Kukopa</label>
                <select style={S.select} value={form.borrowing_habit} onChange={(e) => update("borrowing_habit", e.target.value)}>
                  {BORROW_HABITS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Fuliza Attitude / Mtazamo wa Fuliza</label>
                <select style={S.select} value={form.fuliza_attitude} onChange={(e) => update("fuliza_attitude", e.target.value)}>
                  {FULIZA_ATTITUDES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 24, display: "flex", gap: 16 }}>
                {[["SHA Health Cover", "has_sha"], ["NSSF Member", "has_nssf"]].map(([label, key]) => (
                  <button key={key} onClick={() => update(key, !form[key])}
                    style={{ flex: 1, padding: 12, borderRadius: 10, border: `2px solid ${form[key] ? "#00C875" : "#1E3A5F"}`, background: form[key] ? "#003D20" : "#0A1628", color: "#F0F4F8", cursor: "pointer", fontSize: 13 }}>
                    {form[key] ? "✓ " : ""}{label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...S.btnOutline, flex: 1 }} onClick={() => setStep(2)}>← Back</button>
                <button style={{ ...S.btnGreen, flex: 2 }} onClick={() => setStep(4)}>Continue →</button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Social obligations ── */}
          {step === 4 && (
            <div>
              <h3 style={{ marginBottom: 24, color: "#F0F4F8" }}>Social Obligations · Majukumu ya Kijamii</h3>
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => update("sends_remittance", !form.sends_remittance)}
                  style={{ width: "100%", padding: 12, borderRadius: 10, border: `2px solid ${form.sends_remittance ? "#00C875" : "#1E3A5F"}`, background: form.sends_remittance ? "#003D20" : "#0A1628", color: "#F0F4F8", cursor: "pointer", textAlign: "left", fontSize: 14 }}>
                  {form.sends_remittance ? "✓ " : ""}Send money to rural family / Tuma pesa familia mashambani
                </button>
              </div>
              {form.sends_remittance && (
                <div style={{ marginBottom: 16 }}>
                  <label style={S.label}>Monthly remittance amount (KES)</label>
                  <input style={S.input} type="number" placeholder="e.g. 1500"
                    value={form.remittance_amount || ""} onChange={(e) => update("remittance_amount", parseInt(e.target.value) || 0)} />
                </div>
              )}
              <div style={{ marginBottom: 24 }}>
                <label style={S.label}>Weekly Church Tithe (KES) · Zaka ya Wiki</label>
                <input style={S.input} type="number" placeholder="0 if none"
                  value={form.tithe_amount || ""} onChange={(e) => update("tithe_amount", parseInt(e.target.value) || 0)} />
              </div>
              {error && <p style={{ color: "#E53E3E", fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...S.btnOutline, flex: 1 }} onClick={() => setStep(3)}>← Back</button>
                <button
                  style={{ ...S.btnGreen, flex: 2, opacity: loading ? 0.7 : 1 }}
                  onClick={handleFinish}
                  disabled={loading}
                >
                  {loading ? "Creating account..." : "Create Account ✓"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DAILY ENTRY FIELD — defined at module level to prevent focus loss
// ═══════════════════════════════════════════════════════════════════════════
function DailyField({ id, label, labelSw, value, onChange, color }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={id} style={S.label}>
        {label} <span style={{ color: "#4A6A8A", fontWeight: 400 }}>· {labelSw}</span>
      </label>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#7A9CC0", fontSize: 14, fontWeight: 600, pointerEvents: "none" }}>KES</span>
        <input
          id={id}
          style={{ ...S.input, paddingLeft: 48, borderColor: value && value !== "0" ? color : "#1E3A5F" }}
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

const EARN_SOURCES = [
  { value: "daily_work",      label: "Daily work / Kazi ya leo" },
  { value: "project_payment", label: "Project payment / Malipo ya mradi" },
  { value: "fare_income",     label: "Fares / Nauli" },
  { value: "sales",           label: "Business sales / Mauzo" },
  { value: "farm_sale",       label: "Farm sales / Mauzo ya shamba" },
  { value: "casual_labour",   label: "Casual labour / Kazi ya muda" },
  { value: "other_income",    label: "Other income / Mapato mengine" },
];

function AddTransactionModal({ onSave, onClose }) {
  const today = new Date().toISOString().split("T")[0];
  const [date,     setDate]     = useState(today);
  const [earned,   setEarned]   = useState("");
  const [spent,    setSpent]    = useState("");
  const [saved,    setSaved]    = useState("");
  const [borrowed, setBorrowed] = useState("");
  const [earnFrom, setEarnFrom] = useState("daily_work");
  const [error,    setError]    = useState("");

  const handleSave = () => {
    const e = parseFloat(earned) || 0;
    const s = parseFloat(spent) || 0;
    const sv = parseFloat(saved) || 0;
    const b = parseFloat(borrowed) || 0;
    if (e === 0 && s === 0 && sv === 0 && b === 0) {
      setError("Enter at least one amount / Ingiza kiasi kimoja angalau");
      return;
    }
    const base = Date.now();
    if (e  > 0) onSave({ id: base,   date, amount: e,   balance: 0, category: earnFrom,                description: "Daily entry",    source: "manual" });
    if (s  > 0) onSave({ id: base+1, date, amount: -s,  balance: 0, category: "daily_spending",        description: "Daily spending", source: "manual" });
    if (sv > 0) onSave({ id: base+2, date, amount: -sv, balance: 0, category: "mshwari_deposit",       description: "Saved today",    source: "manual" });
    if (b  > 0) onSave({ id: base+3, date, amount: b,   balance: 0, category: "digital_loan_received", description: "Borrowed today", source: "manual" });
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#0F1F35", borderRadius: "20px 20px 0 0", padding: "24px 24px 32px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, color: "#F0F4F8", fontSize: 17 }}>Today's Summary · Muhtasari wa Leo</div>
            <div style={{ color: "#4A6A8A", fontSize: 12, marginTop: 4 }}>How did your day go? / Siku yako ya fedha ilikuwa vipi?</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#7A9CC0", cursor: "pointer", fontSize: 22, padding: "0 0 0 16px" }}>✕</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={S.label}>Date / Tarehe</label>
          <input style={S.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DailyField id="daily-earned" label="How much did you earn?" labelSw="Ulipata kiasi gani?" value={earned} onChange={setEarned} color="#00C87566" />
        {parseFloat(earned) > 0 && (
          <div style={{ marginBottom: 16, marginTop: -8 }}>
            <label style={S.label}>Main source / Chanzo kikuu</label>
            <select style={S.select} value={earnFrom} onChange={(e) => setEarnFrom(e.target.value)}>
              {EARN_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
        <DailyField id="daily-spent"    label="How much did you spend?"  labelSw="Ulitumia kiasi gani?"   value={spent}    onChange={setSpent}    color="#E53E3E66" />
        <DailyField id="daily-saved"    label="Did you save anything?"   labelSw="Uliweka akiba yoyote?"  value={saved}    onChange={setSaved}    color="#3182CE66" />
        <DailyField id="daily-borrowed" label="Did you borrow anything?" labelSw="Ulikopa chochote?"      value={borrowed} onChange={setBorrowed} color="#D69E2E66" />
        {error && <p style={{ color: "#E53E3E", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button style={{ ...S.btnGreen, marginTop: 8 }} onClick={handleSave}>Save Day · Hifadhi Siku</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function Dashboard({ user, transactions, onAddTxn, onViewLogs, onLogout }) {
  const features = computeFeatures(transactions);
  const { tier, num } = classifyTier(features, user.persona);
  const tierCfg = TIER_CONFIG[tier];
  const coaching = getCoaching(user.persona, num);
  const [lang, setLang] = useState("en");

  const recentTxns = [...transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  const stats = features ? [
    { label: "Avg Daily Income", labelSw: "Mapato ya Wastani", value: `KES ${features.income_mean.toLocaleString()}` },
    { label: "Avg Balance",      labelSw: "Salio la Wastani",  value: `KES ${features.bal_mean.toLocaleString()}` },
    { label: "Earning Days",     labelSw: "Siku za Mapato",    value: `${(features.earn_days_pct * 100).toFixed(0)}%` },
    { label: "Fuliza / day",     labelSw: "Fuliza / siku",     value: features.fuliza_per_day.toFixed(1) },
  ] : [];

  return (
    <div style={{ minHeight: "100vh", background: "#0A1628", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: "#0F1F35", borderBottom: "1px solid #1E3A5F", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#00C875", fontWeight: 700, fontSize: 18 }}>◈ InFoach</div>
          <div style={{ color: "#7A9CC0", fontSize: 13 }}>Habari, {(user.name || "").split(" ")[0]}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setLang((l) => (l === "en" ? "sw" : "en"))}
            style={{ ...S.tag, background: "#1E3A5F", color: "#7A9CC0", border: "none", cursor: "pointer" }}>
            {lang === "en" ? "🇰🇪 SW" : "🇬🇧 EN"}
          </button>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: "#4A6A8A", cursor: "pointer", fontSize: 13 }}>Sign out</button>
        </div>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 540, margin: "0 auto" }}>
        {/* Health Tier */}
        <div style={{ ...S.card, borderColor: tierCfg.color + "44", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 28, color: tierCfg.color }}>{tierCfg.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: tierCfg.color }}>{tierCfg.label}</div>
              <div style={{ color: "#7A9CC0", fontSize: 13, marginTop: 4 }}>{user.persona}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#4A6A8A" }}>HEALTH SCORE</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: tierCfg.color }}>
                {num === 4 ? "A" : num === 3 ? "B" : num === 2 ? "C" : "D"}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        {features && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {stats.map((s) => (
              <div key={s.label} style={S.card}>
                <div style={{ fontSize: 11, color: "#4A6A8A", marginBottom: 4 }}>{lang === "en" ? s.label : s.labelSw}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* No data prompt */}
        {!features && (
          <div style={{ ...S.card, marginBottom: 16, textAlign: "center", padding: "28px 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {lang === "en" ? "No transaction data yet" : "Bado hakuna data ya miamala"}
            </div>
            <div style={{ color: "#7A9CC0", fontSize: 13, lineHeight: 1.6 }}>
              {lang === "en"
                ? "Tap + to add today's income and spending."
                : "Bonyeza + kuongeza mapato na matumizi ya leo."}
            </div>
          </div>
        )}

        {/* Coaching */}
        <div style={{ ...S.card, borderLeft: "4px solid #00C875", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#00C875", marginBottom: 10, fontWeight: 600 }}>◈ COACHING · USHAURI</div>
          <p style={{ color: "#F0F4F8", lineHeight: 1.6, margin: 0, fontSize: 14 }}>
            {lang === "en" ? coaching.en : coaching.sw}
          </p>
        </div>

        {/* SHA alert */}
        {!user.has_sha && num >= 2 && (
          <div style={{ ...S.card, borderLeft: "4px solid #D69E2E", marginBottom: 16, background: "#1A1500" }}>
            <div style={{ fontSize: 13, color: "#D69E2E", fontWeight: 600, marginBottom: 6 }}>ℹ️ No SHA Health Cover</div>
            <p style={{ color: "#A08020", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              {lang === "en"
                ? "Register at any Huduma Centre — KES 500/month protects your savings."
                : "Jisajili Huduma Centre — KES 500/mwezi inalinda akiba yako."}
            </p>
          </div>
        )}

        {/* Recent transactions */}
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontWeight: 600 }}>Recent Transactions · Miamala ya Hivi Karibuni</div>
            <button onClick={onViewLogs} style={{ background: "none", border: "none", color: "#00C875", cursor: "pointer", fontSize: 13 }}>View all →</button>
          </div>
          {recentTxns.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#4A6A8A" }}>
              <div style={{ fontSize: 14 }}>No transactions yet · Bado hakuna miamala</div>
            </div>
          ) : (
            recentTxns.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1E3A5F" }}>
                <div>
                  <div style={{ fontSize: 13, marginBottom: 2 }}>{t.category.replace(/_/g, " ")}</div>
                  <div style={{ fontSize: 11, color: "#4A6A8A" }}>{t.date}</div>
                </div>
                <div style={{ fontWeight: 600, color: t.amount > 0 ? "#00C875" : "#E53E3E" }}>
                  {t.amount > 0 ? "+" : ""}KES {Math.abs(t.amount).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* FAB */}
      <div style={{ position: "fixed", bottom: 24, right: 20 }}>
        <button onClick={onAddTxn}
          style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #00C875, #00A35C)", border: "none", color: "#fff", fontSize: 28, cursor: "pointer", boxShadow: "0 4px 20px rgba(0,200,117,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          +
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION LOGS
// ═══════════════════════════════════════════════════════════════════════════
function TransactionLogs({ transactions, onBack, onDelete }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = transactions
    .filter((t) => filter === "all" || (filter === "income" ? t.amount > 0 : t.amount < 0))
    .filter((t) => !search || t.category.includes(search) || (t.description || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalIn  = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0A1628", paddingBottom: 40 }}>
      <div style={{ background: "#0F1F35", borderBottom: "1px solid #1E3A5F", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#7A9CC0", cursor: "pointer", fontSize: 18 }}>←</button>
        <div>
          <div style={{ fontWeight: 600 }}>Transaction Log · Kumbukumbu ya Miamala</div>
          <div style={{ fontSize: 12, color: "#4A6A8A" }}>{transactions.length} total</div>
        </div>
      </div>
      <div style={{ padding: 16, maxWidth: 540, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {[["TOTAL IN", totalIn, "#00C875", "#003D20"], ["TOTAL OUT", totalOut, "#E53E3E", "#3D0000"], ["NET", totalIn - totalOut, totalIn - totalOut >= 0 ? "#00C875" : "#E53E3E", "#0F1F35"]].map(([label, val, color, bg]) => (
            <div key={label} style={{ flex: 1, ...S.card, background: bg, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color }}>{label}</div>
              <div style={{ fontWeight: 700, color, fontSize: 14 }}>KES {Math.abs(val).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <input style={{ ...S.input, marginBottom: 10 }} placeholder="Search transactions..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["all", "income", "expense"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ ...S.tag, background: filter === f ? "#00C875" : "#1E3A5F", color: filter === f ? "#000" : "#7A9CC0", border: "none", cursor: "pointer", padding: "8px 16px" }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {filtered.map((t) => (
          <div key={t.id} style={{ ...S.card, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, marginBottom: 2 }}>{t.category.replace(/_/g, " ")}</div>
              {t.description && <div style={{ fontSize: 12, color: "#4A6A8A" }}>{t.description}</div>}
              <div style={{ fontSize: 11, color: "#4A6A8A", marginTop: 2 }}>{t.date}</div>
            </div>
            <div style={{ textAlign: "right", marginLeft: 12 }}>
              <div style={{ fontWeight: 700, color: t.amount > 0 ? "#00C875" : "#E53E3E", fontSize: 15 }}>
                {t.amount > 0 ? "+" : ""}KES {Math.abs(t.amount).toLocaleString()}
              </div>
              <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", color: "#4A6A8A", cursor: "pointer", fontSize: 12, marginTop: 4 }}>remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function InFoachApp() {
  const [screen,       setScreen]       = useState("welcome");
  const [currentUser,  setCurrentUser]  = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showAddTxn,   setShowAddTxn]   = useState(false);

  // Try to restore session on mount
  useEffect(() => {
    wakeUpAPI();
    if (_authToken) {
      try {
        const stored = Object.keys(localStorage)
          .filter((k) => k.startsWith("infoach:user:"))
          .map((k) => JSON.parse(localStorage.getItem(k)))[0];
        if (stored) {
          setCurrentUser(stored);
          setScreen("dashboard");
          apiLoadTxns().then((txns) => setTransactions(txns));
        }
      } catch (_) {}
    }
  }, []);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setScreen("dashboard");
    apiLoadTxns().then((txns) => setTransactions(txns));
  };

  const handleAddTxn = (txn) => {
    const updated = [...transactions, txn];
    setTransactions(updated);
    apiSaveTxns([txn]); // only send the new one
    setShowAddTxn(false);
  };

  const handleDeleteTxn = (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    setTransactions([]);
    setScreen("welcome");
  };

  if (screen === "welcome")  return <WelcomeScreen onLogin={() => setScreen("login")} onRegister={() => setScreen("register")} />;
  if (screen === "login")    return <LoginScreen onSuccess={handleAuthSuccess} onBack={() => setScreen("welcome")} />;
  if (screen === "register") return <RegisterScreen onSuccess={handleAuthSuccess} onBack={() => setScreen("welcome")} />;
  if (screen === "logs")     return <TransactionLogs transactions={transactions} onBack={() => setScreen("dashboard")} onDelete={handleDeleteTxn} />;

  return (
    <div style={S.app}>
      {screen === "dashboard" && (
        <Dashboard
          user={currentUser}
          transactions={transactions}
          onAddTxn={() => setShowAddTxn(true)}
          onViewLogs={() => setScreen("logs")}
          onLogout={handleLogout}
        />
      )}
      {showAddTxn && <AddTransactionModal onSave={handleAddTxn} onClose={() => setShowAddTxn(false)} />}
    </div>
  );
}
