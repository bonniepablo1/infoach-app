
import { useState, useEffect } from "react";

// ── PDF.js — loaded on demand via script injection ─────────────────────────
// We load it dynamically so it does not bloat the Vite bundle.
// window.pdfjsLib is available once the script executes.
let _pdfjs = null;
async function loadPdfJs() {
  if (_pdfjs) return _pdfjs;
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      _pdfjs = window.pdfjsLib;
      resolve(_pdfjs);
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      _pdfjs = window.pdfjsLib;
      resolve(_pdfjs);
    };
    script.onerror = () => reject(new Error("Could not load PDF.js"));
    document.head.appendChild(script);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const API_URL = "https://daktari0-infoach-api.hf.space";

// ── JWT token management ───────────────────────────────────────────────────
let _authToken = null;
try {
  const s = localStorage.getItem("infoach:token");
  if (s) _authToken = s;
} catch (_) {}

function setToken(token) {
  _authToken = token;
  try {
    if (token) localStorage.setItem("infoach:token", token);
    else localStorage.removeItem("infoach:token");
  } catch (_) {}
}

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
      const e = await res.json();
      detail = e.detail || detail;
    } catch (_) {}
    throw new Error(detail);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function normalisePhone(p) {
  return String(p).trim().replace(/^(?:\+254|254|0)/, "254");
}

async function apiRegister(form) {
  const data = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      phone:             normalisePhone(form.phone),
      name:              form.name,
      password:          form.password,
      persona:           form.persona,
      job_title:         form.job_title,
      is_married:        form.is_married,
      n_kids:            form.n_kids,
      monthly_rent:      form.monthly_rent,
      savings_type:      form.savings_type,
      borrowing_habit:   form.borrowing_habit,
      fuliza_attitude:   form.fuliza_attitude,
      has_sha:           form.has_sha,
      has_nssf:          form.has_nssf,
      sends_remittance:  form.sends_remittance,
      remittance_amount: form.remittance_amount,
      tithe_amount:      form.tithe_amount,
    }),
  });
  setToken(data.token);
  try {
    localStorage.setItem(
      `infoach:user:${data.user.phone}`,
      JSON.stringify(data.user)
    );
  } catch (_) {}
  return data.user;
}

async function apiLogin(phone, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: normalisePhone(phone), password }),
  });
  setToken(data.token);
  try {
    localStorage.setItem(
      `infoach:user:${data.user.phone}`,
      JSON.stringify(data.user)
    );
  } catch (_) {}
  return data.user;
}

async function apiLoadTxns() {
  try {
    const d = await apiFetch("/transactions?limit=5000");
    return d?.transactions || [];
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
          source:      t.source || "manual",
          receipt:     t.receipt || "",
        }))
      ),
    });
  } catch (_) {}
}

async function apiDeleteTxn(id) {
  try {
    await apiFetch(`/transactions/${id}`, { method: "DELETE" });
  } catch (_) {}
}

async function wakeUpAPI() {
  try {
    await fetch(`${API_URL}/`);
  } catch (_) {}
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
      "Street vendor / Muuzaji mtaani", "Hawker / Hawker",
      "Casual labourer / Mfanyakazi wa muda",
      "Delivery rider / Mpiga mbio wa delivery",
      "Car wash / Kuosha magari", "Shoe shiner / Mpiga rangi viatu",
      "Porter / Mpeba", "Market porter / Mchukuzi wa soko",
      "Other daily work / Kazi nyingine za kila siku",
    ],
  },
  {
    persona: "Small-Scale Trader",
    label: "Small-Scale Trader / Mfanyabiashara Mdogo",
    description: "Sell goods from a stall, shop or market",
    descSw: "Kuuza bidhaa dukani, stendi au sokoni",
    jobs: [
      "Market stall / Stendi ya soko", "Vegetable seller / Muuzaji mboga",
      "Fruit seller / Muuzaji matunda", "Grocery / Duka la vyakula",
      "Clothes seller / Muuzaji nguo", "Electronics seller / Muuzaji elektroniki",
      "Butcher / Mchinjaji", "Fish monger / Muuzaji samaki",
      "Hardware / Muuzaji vifaa vya ujenzi", "General shop / Duka la jumla",
      "Other trading / Biashara nyingine",
    ],
  },
  {
    persona: "Artisan - Stable",
    label: "Skilled Artisan (Stable) / Fundi (Imara)",
    description: "Skilled trade with regular clients and steady work",
    descSw: "Fundi mwenye wateja wa kawaida na kazi ya uhakika",
    jobs: [
      "Carpenter / Seremala", "Electrician / Fundi umeme",
      "Plumber / Fundi bomba", "Welder / Fundi chuma",
      "Mechanic / Fundi gari", "Mason / Mwashi",
      "Painter / Mpigaji rangi", "Tailor (established) / Fundi kushona (imara)",
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
      "Shoe repairer / Fundi viatu", "Jua Kali artisan / Fundi Jua Kali",
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
      "Smallholder farmer / Mkulima mdogo", "Livestock keeper / Mfugaji",
      "Fisher / Mvuvi", "Farm worker / Mfanyakazi wa shamba",
      "Dairy farmer / Mfugaji wa ng'ombe maziwa",
      "Poultry farmer / Mfugaji wa kuku", "Horticulture / Bustani",
      "Other farming / Kilimo kingine",
    ],
  },
  {
    persona: "Struggling Entrepreneur",
    label: "Entrepreneur / Mjasiriamali",
    description: "Running a small business with employees or fixed costs",
    descSw: "Kuendesha biashara ndogo yenye wafanyakazi au gharama za kudumu",
    jobs: [
      "Small restaurant / Hoteli ndogo", "Salon / Saluni",
      "Barbershop / Kinyozi", "Pharmacy / Duka la dawa",
      "Cyber cafe / Saiber cafe", "Printing / Uchapishaji",
      "Mpesa agent / Wakala wa M-PESA",
      "Fuel station attendant / Mfanyakazi wa kituo cha mafuta",
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
// COACHING DATABASE
// ═══════════════════════════════════════════════════════════════════════════
const COACHING_DB = {
  "Daily Hustler_1": { en: "CRISIS: Stop all non-essential spending today. Send KES 50 to M-Shwari right now — even this small amount builds the habit. Avoid Fuliza completely for 7 days.", sw: "DHARURA: Simamisha matumizi yote yasiyohitajika leo. Tuma KES 50 M-Shwari sasa hivi. Epuka Fuliza kabisa kwa siku 7." },
  "Daily Hustler_2": { en: "You earn every day but spend everything same day. Each morning before any spending, lock KES 100 in M-Shwari. After 30 days you will have KES 3,000 saved.", sw: "Unapata pesa kila siku lakini unatumia yote. Kila asubuhi kabla ya kutumia, funga KES 100 M-Shwari. Siku 30 utakuwa na KES 3,000." },
  "Daily Hustler_3": { en: "Good earning rhythm. Build resilience: save KES 200/day in M-Shwari. In 3 months you will have KES 18,000 — enough to survive one slow month without Fuliza.", sw: "Una mdundo mzuri wa mapato. Jenga nguvu: weka KES 200/siku M-Shwari. Miezi 3 utakuwa na KES 18,000." },
  "Daily Hustler_4": { en: "Strong financial discipline. Join a chama or SACCO to grow savings faster. Consider Hustler Fund — repaying on time builds your credit limit from KES 500 to KES 50,000.", sw: "Nidhamu nzuri ya fedha. Jiunge na chama au SACCO kukua akiba haraka. Fikiria Hustler Fund." },
  "Small-Scale Trader_1": { en: "Business is losing money. Stop restocking until you understand why. Count your stock today and compare to last week — find what is not selling and stop buying it.", sw: "Biashara inapoteza pesa. Simamisha kujaza bidhaa mpaka uelewa sababu. Hesabu bidhaa zako leo." },
  "Small-Scale Trader_2": { en: "Restock in smaller amounts daily rather than large amounts weekly. Use Pochi La Biashara to separate business from personal money.", sw: "Jaza bidhaa kidogo kila siku badala ya kiasi kikubwa wiki moja. Tumia Pochi La Biashara." },
  "Small-Scale Trader_3": { en: "Business is surviving. Find your 3 best-selling items and always keep them stocked. Save 10% of profit in M-Shwari each week before spending on anything else.", sw: "Biashara inasimama. Tafuta bidhaa 3 zinazouza zaidi na uzidumishe. Weka 10% ya faida M-Shwari." },
  "Small-Scale Trader_4": { en: "Business is growing. Join a traders SACCO, apply for a Stawi loan (rates from 9%), and consider expanding to a second product line.", sw: "Biashara inakua. Jiunge SACCO ya wafanyabiashara, omba mkopo wa Stawi (riba kuanzia 9%)." },
  "Artisan - Stable_1": { en: "Work has dried up. Contact 5 past clients today for follow-up jobs. Offer a small discount for bookings this week. One job now is better than waiting.", sw: "Kazi imeisha. Wasiliana na wateja 5 wa zamani leo. Toa punguzo dogo kwa miadi wiki hii." },
  "Artisan - Stable_2": { en: "Consistent work but income is tight. Quote 10% higher on your next 3 projects — most clients will not notice. Save that extra directly into M-Shwari.", sw: "Kazi ya kawaida lakini mapato ni kidogo. Toa bei 10% zaidi kwa miradi 3 ijayo." },
  "Artisan - Stable_3": { en: "Good steady work. Build a KES 15,000 emergency fund in M-Shwari. Register for SHA health cover (KES 500/month) so one illness does not wipe your savings.", sw: "Kazi nzuri. Jenga akiba ya KES 15,000 M-Shwari. Jisajili SHA (KES 500/mwezi)." },
  "Artisan - Stable_4": { en: "Excellent discipline. Join a Jua Kali SACCO to access larger loans at better rates. Consider training an apprentice — this creates a second income stream.", sw: "Nidhamu bora. Jiunge SACCO ya Jua Kali. Fikiria kufunza mwanafunzi." },
  "Artisan - Struggling_1": { en: "Critical: you are spending more than you earn. Deposit all cash job payments into M-PESA immediately — even KES 50. This creates a visible savings record.", sw: "Muhimu: unatumia zaidi ya unavyopata. Weka malipo yote ya kazi taslimu M-PESA mara moja." },
  "Artisan - Struggling_2": { en: "Cash jobs are real income — deposit them into M-PESA to build a savings record. Specialise in one skill and charge KES 200 more per job.", sw: "Kazi za pesa taslimu ni mapato halisi. Bobea katika ujuzi mmoja na kutoza KES 200 zaidi." },
  "Artisan - Struggling_3": { en: "Regular work but not getting ahead. Pick your single strongest skill and market it specifically — a welder who specialises in gates earns 40% more.", sw: "Kazi ya kawaida lakini hupati maendeleo. Chagua ujuzi wako mmoja bora na uuuze maalum." },
  "Artisan - Struggling_4": { en: "Income improving. Save KES 500/week in M-Shwari and never touch it. In 6 months you will have KES 13,000 — enough to buy your own tools.", sw: "Mapato yanaboreka. Weka KES 500/wiki M-Shwari na usiguse. Miezi 6 = KES 13,000." },
  "Boda Boda Operator_1": { en: "Serious risk: one breakdown could stop your income completely. Save KES 200 every single day in M-Shwari. In 30 days you have KES 6,000 repair fund.", sw: "Hatari kubwa: uharibike mmoja unaweza kusimamisha mapato yako. Weka KES 200 kila siku M-Shwari." },
  "Boda Boda Operator_2": { en: "Inconsistent earnings are the problem. Track your best 3 routes or customers — focus your day on those. Save KES 300/day before fuel expenses.", sw: "Mapato yasiyofaa ni tatizo. Fuatilia njia zako 3 bora. Weka KES 300/siku kabla ya mafuta." },
  "Boda Boda Operator_3": { en: "Solid earnings. Build a KES 8,000 M-Shwari emergency fund so one breakdown does not wipe you out. Consider NTSA insurance (KES 5,550/year).", sw: "Mapato mazuri. Jenga akiba ya KES 8,000 M-Shwari. Fikiria bima ya NTSA (KES 5,550/mwaka)." },
  "Boda Boda Operator_4": { en: "Excellent income management. Think about owning a second bike through a boda boda SACCO — this doubles your income potential.", sw: "Usimamizi bora wa mapato. Fikiria kumiliki pikipiki ya pili kupitia SACCO ya boda boda." },
  "Agricultural Worker_1": { en: "Offseason crisis. Look for casual labour or start a small kitchen garden. Contact your nearest SACCO for a seasonal loan to prepare for the next planting.", sw: "Dharura ya msimu wa ukame. Tafuta kazi za muda au anza bustani ndogo. Wasiliana na SACCO kwa mkopo wa msimu." },
  "Agricultural Worker_2": { en: "Lean season stress. During harvest, save at least 20% before spending. KES 5,000 saved at harvest covers 2 lean months.", sw: "Msongo wa msimu wa ukame. Wakati wa mavuno, weka angalau 20% kabla ya kutumia." },
  "Agricultural Worker_3": { en: "Good seasonal management. Save 20% of every harvest payment before any spending. Register for SHA health cover — one hospital visit during planting season can destroy the whole season.", sw: "Usimamizi mzuri wa msimu. Weka 20% ya kila malipo ya mavuno. Jisajili SHA." },
  "Agricultural Worker_4": { en: "Strong farm management. Explore contract farming with Twiga Foods or Agri-Wallet — guaranteed buyers reduce your income risk significantly.", sw: "Usimamizi mzuri wa shamba. Chunguza kilimo cha mkataba na Twiga Foods au Agri-Wallet." },
  "Struggling Entrepreneur_1": { en: "Business crisis. Separate business and personal money immediately using Pochi La Biashara — free on M-PESA. Stop all credit sales this week. Cash only until stable.", sw: "Dharura ya biashara. Tenganisha pesa za biashara na za kibinafsi mara moja ukitumia Pochi La Biashara." },
  "Struggling Entrepreneur_2": { en: "Cash flow is the problem, not revenue. Use Pochi La Biashara. Invoice clients immediately. Pay yourself a fixed salary, not whatever is left.", sw: "Mtiririko wa pesa ndio tatizo. Tumia Pochi La Biashara. Jilipe mshahara maalum." },
  "Struggling Entrepreneur_3": { en: "Business is stabilising. Build a 30-day cash reserve equal to one month of fixed costs. Track your 3 highest-margin products and focus on those.", sw: "Biashara inaimarika. Jenga akiba ya pesa ya siku 30. Fuatilia bidhaa 3 zenye faida kubwa zaidi." },
  "Struggling Entrepreneur_4": { en: "Business is growing well. Consider a Stawi business loan (from KES 30,000 at 9% p.a.) for expansion. Register for VAT if turnover exceeds KES 5M/year.", sw: "Biashara inakua vizuri. Fikiria mkopo wa Stawi (kutoka KES 30,000 kwa 9% kwa mwaka)." },
};

const TIER_CONFIG = {
  CRISIS:   { icon: "◈", color: "#E53E3E", label: "Crisis / Dharura" },
  STRESSED: { icon: "◉", color: "#D69E2E", label: "Stressed / Msongo" },
  COPING:   { icon: "◎", color: "#DD6B20", label: "Coping / Inakwenda" },
  STABLE:   { icon: "●", color: "#38A169", label: "Stable / Imara" },
};

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL ANALYTICS ENGINE
// ═══════════════════════════════════════════════════════════════════════════
function computeFeatures(transactions) {
  if (!transactions || transactions.length === 0) return null;
  const pdfTxns    = transactions.filter((t) => t.receipt);
  const manualTxns = transactions.filter((t) => !t.receipt);
  const primary    = pdfTxns.length > 0 ? pdfTxns : manualTxns;
  const txns       = primary.map((t) => ({ ...t, amount: parseFloat(t.amount) }));

  const LOAN_CATS = new Set(["digital_loan_received","fuliza_draw","mshwari_withdrawal","sacco_withdrawal","chama_withdrawal","other","reversal"]);
  const DEBT_CATS = new Set(["digital_loan_repayment","fuliza_repayment","mshwari_deposit","sacco_contribution","chama_contribution"]);

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
  const incomeMean  =
    earningDays.length > 0
      ? earningDays.reduce((a, b) => a + b, 0) / earningDays.length
      : 0;
  const incomeStd =
    earningDays.length > 1
      ? Math.sqrt(
          earningDays.reduce((s, v) => s + Math.pow(v - incomeMean, 2), 0) /
            earningDays.length
        )
      : 0;
  const incomeCV    = incomeMean > 0 ? incomeStd / incomeMean : 0;
  const earnDaysPct = earningDays.length / days.length;

  const endBals = days.map((d) => {
    const dt = byDate[d];
    return dt[dt.length - 1].balance || 0;
  });
  const balMean = endBals.reduce((a, b) => a + b, 0) / endBals.length;
  const pctZero = endBals.filter((b) => b <= 50).length / endBals.length;

  const fulizaTxns = txns.filter(
    (t) => t.category === "fuliza_draw" || /fuliza/i.test(t.description || "")
  );
  const fulizaPerDay = fulizaTxns.length / Math.max(days.length, 1);

  const totalEarned = earningDays.reduce((a, b) => a + b, 0);
  const totalSpent  = txns
    .filter((t) => t.amount < 0 && !DEBT_CATS.has(t.category))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const spendRatio  = totalEarned > 0 ? totalSpent / totalEarned : 1.0;

  const debtPayments = txns.filter((t) => DEBT_CATS.has(t.category));
  const debtScore    =
    totalSpent > 0
      ? debtPayments.reduce((s, t) => s + Math.abs(t.amount), 0) / (totalSpent + 1)
      : 0;

  const hasMshwari = txns.some((t) => /mshwari/i.test(t.description || "")) ? 1 : 0;
  const hasSacco   = txns.some((t) => /sacco/i.test(t.description || "")) ? 1 : 0;

  const monthlyIncome = {};
  txns
    .filter((t) => t.amount > 0 && !LOAN_CATS.has(t.category))
    .forEach((t) => {
      const m = (t.date || "").slice(0, 7);
      if (m) monthlyIncome[m] = (monthlyIncome[m] || 0) + t.amount;
    });
  const monthVals = Object.values(monthlyIncome);
  const monthMean =
    monthVals.length > 0
      ? monthVals.reduce((a, b) => a + b, 0) / monthVals.length
      : 0;
  const incomeSeas =
    monthMean > 0 && monthVals.length > 1
      ? Math.sqrt(
          monthVals.reduce((s, v) => s + Math.pow(v - monthMean, 2), 0) /
            monthVals.length
        ) / monthMean
      : 0;

  const recent7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const recentEarned = manualTxns
    .filter((t) => t.date >= recent7 && t.amount > 0 && t.category !== "digital_loan_received")
    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const recentSaved = manualTxns
    .filter((t) => t.date >= recent7 && t.category === "mshwari_deposit")
    .reduce((s, t) => s + Math.abs(parseFloat(t.amount || 0)), 0);
  const recentDays = new Set(
    manualTxns.filter((t) => t.date >= recent7).map((t) => t.date)
  ).size;

  return {
    income_mean:        Math.round(incomeMean),
    income_cv:          parseFloat(incomeCV.toFixed(3)),
    income_seasonality: parseFloat(incomeSeas.toFixed(3)),
    earn_days_pct:      parseFloat(earnDaysPct.toFixed(3)),
    bal_mean:           Math.round(balMean),
    pct_zero_bal:       parseFloat(pctZero.toFixed(3)),
    spend_ratio:        parseFloat(spendRatio.toFixed(3)),
    fuliza_per_day:     parseFloat(fulizaPerDay.toFixed(2)),
    debt_stack_score:   parseFloat(debtScore.toFixed(3)),
    has_mshwari:        hasMshwari,
    has_sacco:          hasSacco,
    total_earned:       Math.round(totalEarned),
    total_spent:        Math.round(totalSpent),
    n_days:             days.length,
    has_pdf:            pdfTxns.length > 0 ? 1 : 0,
    manual_count:       manualTxns.length,
    recent_earned:      Math.round(recentEarned),
    recent_saved:       Math.round(recentSaved),
    recent_days:        recentDays,
  };
}

function classifyTier(features, persona) {
  if (!features) return { tier: "COPING", num: 3 };
  const { pct_zero_bal, fuliza_per_day, bal_mean, spend_ratio, earn_days_pct, debt_stack_score } = features;
  if (persona === "Agricultural Worker") {
    if (pct_zero_bal > 0.50 && fuliza_per_day > 1.5) return { tier: "CRISIS",   num: 1 };
    if (pct_zero_bal > 0.35 || fuliza_per_day > 1.0) return { tier: "STRESSED", num: 2 };
    if (bal_mean > 3000)                              return { tier: "STABLE",   num: 4 };
    return { tier: "COPING", num: 3 };
  }
  if (pct_zero_bal > 0.60 && (fuliza_per_day > 3.0 || debt_stack_score > 0.4))
    return { tier: "CRISIS", num: 1 };
  if (pct_zero_bal > 0.30 || fuliza_per_day > 2.0 || spend_ratio > 1.15 || debt_stack_score > 0.25)
    return { tier: "STRESSED", num: 2 };
  if (pct_zero_bal < 0.08 && bal_mean > 3000 && earn_days_pct > 0.65 && spend_ratio < 0.85)
    return { tier: "STABLE", num: 4 };
  return { tier: "COPING", num: 3 };
}

function getCoaching(persona, tierNum) {
  return (
    COACHING_DB[`${persona}_${tierNum}`] || {
      en: "Focus on building a 30-day income buffer and reducing debt step by step.",
      sw: "Zingatia kujenga akiba ya siku 30 na kupunguza madeni hatua kwa hatua.",
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BUDGET FRAMEWORK
// ═══════════════════════════════════════════════════════════════════════════
const BUDGET_FRAMEWORK = {
  CRISIS:   { needs:90, savings:5,  debt:5,  wants:0,  color:"#E53E3E", title:"Survival Budget · Bajeti ya Kuokoka", description:"Your spending exceeds your income. Every shilling counts.", descSw:"Matumizi yako yanazidi mapato. Kila shilingi ina maana.", savings_action:"Lock KES 50 in M-Shwari FIRST every day.", savings_actionSw:"Funga KES 50 M-Shwari KWANZA kila siku.", debt_action:"Contact Tala/Branch to restructure. Do not take new loans.", debt_actionSw:"Wasiliana na Tala/Branch kupanga upya.", needs_action:"Cut one expense this week — airtime, eating out, or subscriptions.", needs_actionSw:"Kata gharama moja wiki hii." },
  STRESSED: { needs:70, savings:10, debt:15, wants:5,  color:"#D69E2E", title:"Tight Budget · Bajeti Ngumu", description:"You are covering basics but one shock can break you.", descSw:"Unashughulikia mahitaji ya msingi lakini mshtuko mmoja unaweza kukuvunja.", savings_action:"Save KES 100/day in M-Shwari before any other spending.", savings_actionSw:"Weka KES 100/siku M-Shwari.", debt_action:"Pay highest-interest debt first. Fuliza daily = debt spiral.", debt_actionSw:"Lipa deni lenye riba nyingi zaidi kwanza.", needs_action:"Track your top 3 expenses this week.", needs_actionSw:"Fuatilia gharama zako 3 kubwa wiki hii." },
  COPING:   { needs:60, savings:20, debt:10, wants:10, color:"#DD6B20", title:"Balanced Budget · Bajeti ya Usawa", description:"You are stable — now build resilience.", descSw:"Una utulivu — sasa jenga nguvu.", savings_action:"Target KES 200/day in M-Shwari. Register for SHA this month (KES 500/month).", savings_actionSw:"Lenga KES 200/siku M-Shwari. Jisajili SHA.", debt_action:"Reduce Fuliza to below 2 draws/day.", debt_actionSw:"Punguza Fuliza chini ya mara 2/siku.", needs_action:"Review rent — it should not exceed 25% of your income.", needs_actionSw:"Kagua kodi — haipaswi kuzidi 25% ya mapato yako." },
  STABLE:   { needs:50, savings:25, debt:5,  wants:20, color:"#38A169", title:"Growth Budget · Bajeti ya Ukuaji", description:"You have a buffer — now grow it.", descSw:"Una akiba — sasa ikuze.", savings_action:"Diversify: M-Shwari for emergencies + Chama/SACCO for growth.", savings_actionSw:"Tofautisha: M-Shwari kwa dharura + Chama/SACCO kwa ukuaji.", debt_action:"No active debt? Use that 5% to invest — Hustler Fund builds credit to KES 50,000.", debt_actionSw:"Huna deni? Tumia asilimia 5 hiyo kuwekeza.", needs_action:"Needs under 50%? Invest surplus in income-generating skills.", needs_actionSw:"Mahitaji chini ya 50%? Wekeza ziada katika ujuzi." },
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const S = {
  app:       { minHeight:"100vh", background:"#0A1628", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#F0F4F8" },
  card:      { background:"#0F1F35", borderRadius:16, border:"1px solid #1E3A5F", padding:24 },
  input:     { width:"100%", background:"#0A1628", border:"1px solid #1E3A5F", borderRadius:10, padding:"12px 16px", color:"#F0F4F8", fontSize:15, outline:"none", boxSizing:"border-box" },
  select:    { width:"100%", background:"#0A1628", border:"1px solid #1E3A5F", borderRadius:10, padding:"12px 16px", color:"#F0F4F8", fontSize:15, outline:"none", boxSizing:"border-box" },
  btnGreen:  { background:"linear-gradient(135deg,#00C875 0%,#00A35C 100%)", color:"#fff", border:"none", borderRadius:10, padding:"14px 28px", fontSize:15, fontWeight:600, cursor:"pointer", width:"100%" },
  btnOutline:{ background:"transparent", color:"#00C875", border:"1px solid #00C875", borderRadius:10, padding:"12px 24px", fontSize:14, fontWeight:600, cursor:"pointer" },
  label:     { fontSize:12, color:"#7A9CC0", marginBottom:6, display:"block", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.05em" },
  tag:       { display:"inline-block", padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:600 },
};

// ═══════════════════════════════════════════════════════════════════════════
// WELCOME
// ═══════════════════════════════════════════════════════════════════════════
function WelcomeScreen({ onLogin, onRegister }) {
  return (
    <div style={{ minHeight:"100vh", background:"#0A1628", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ textAlign:"center", marginBottom:48 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>◈</div>
        <h1 style={{ fontSize:32, fontWeight:700, color:"#00C875", margin:0 }}>InFoach</h1>
        <p style={{ color:"#7A9CC0", marginTop:8, fontSize:16 }}>Mshauri wa Fedha · Financial Coach</p>
        <p style={{ color:"#4A6A8A", fontSize:13, marginTop:4 }}>For Kenya's informal sector workers</p>
      </div>
      <div style={{ width:"100%", maxWidth:400 }}>
        <div style={{ ...S.card, marginBottom:16, textAlign:"center" }}>
          <p style={{ color:"#7A9CC0", marginBottom:20, fontSize:14 }}>
            Track your income, get personalised coaching, and build financial resilience — in English and Kiswahili.
          </p>
          <button style={S.btnGreen} onClick={onRegister}>Create Account · Fungua Akaunti</button>
          <div style={{ marginTop:16 }}>
            <button style={{ ...S.btnOutline, width:"100%" }} onClick={onLogin}>Sign In · Ingia</button>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
          {["🔒 Secure","🇰🇪 Kenya-built","🌍 Bilingual","📊 AI-powered"].map((t) => (
            <span key={t} style={{ ...S.tag, background:"#0F1F35", color:"#7A9CC0", border:"1px solid #1E3A5F" }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════
function LoginScreen({ onSuccess, onBack }) {
  const [phone,    setPhone]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) { setError("Enter phone number and password"); return; }
    setLoading(true); setError("");
    try { const user = await apiLogin(phone, password); onSuccess(user); }
    catch (err) { setError(err.message || "Login failed · Kuingia kumeshindwa"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0A1628", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", marginBottom:24, fontSize:14 }}>← Back</button>
        <h2 style={{ color:"#F0F4F8", marginBottom:8 }}>Sign In · Ingia</h2>
        <p style={{ color:"#7A9CC0", marginBottom:28, fontSize:14 }}>Use your M-PESA registered phone number</p>
        <div style={S.card}>
          <div style={{ marginBottom:16 }}>
            <label style={S.label}>Phone Number / Nambari ya Simu</label>
            <input style={S.input} placeholder="07XX XXX XXX" value={phone} onChange={(e) => { setPhone(e.target.value); setError(""); }} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={S.label}>Password / Nywila</label>
            <input style={S.input} type="password" placeholder="Your password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            {error && <p style={{ color:"#E53E3E", fontSize:13, marginTop:8 }}>{error}</p>}
          </div>
          <button style={{ ...S.btnGreen, opacity:loading ? 0.7 : 1 }} onClick={handleLogin} disabled={loading}>
            {loading ? "Signing in..." : "Sign In · Ingia"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════════════════════
function RegisterScreen({ onSuccess, onBack }) {
  const [step, setStep]                 = useState(1);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [error,   setError]             = useState("");
  const [loading, setLoading]           = useState(false);
  const [form, setForm] = useState({
    phone:"", name:"", password:"", job_title:"", persona:"",
    is_married:false, n_kids:0, monthly_rent:0,
    savings_type:"none", borrowing_habit:"emergency_only", fuliza_attitude:"pragmatic",
    has_sha:false, has_nssf:false, sends_remittance:false,
    remittance_amount:0, tithe_amount:0,
  });
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFinish = async () => {
    if (!form.phone.match(/^(?:254|\+254|0)?[17]\d{8}$/)) { setError("Invalid phone number / Nambari si sahihi"); return; }
    if (!form.password || form.password.length < 6) { setError("Password must be 6+ characters"); return; }
    if (!form.persona || !form.job_title) { setError("Please select your occupation"); return; }
    setLoading(true); setError("");
    try { const user = await apiRegister(form); onSuccess(user); }
    catch (err) {
      if (err.message?.includes("409") || err.message?.includes("registered"))
        setError("Phone already registered. Please sign in.");
      else setError(err.message || "Registration failed. Please try again.");
    } finally { setLoading(false); }
  };

  const steps = ["Account","Household","Finance","Social"];
  return (
    <div style={{ minHeight:"100vh", background:"#0A1628", padding:24 }}>
      <div style={{ maxWidth:480, margin:"0 auto" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", marginBottom:24, fontSize:14 }}>← Back</button>
        <div style={{ display:"flex", gap:8, marginBottom:32 }}>
          {steps.map((s,i) => (
            <div key={s} style={{ flex:1, textAlign:"center" }}>
              <div style={{ height:4, borderRadius:2, background:i < step ? "#00C875" : "#1E3A5F", marginBottom:6 }} />
              <span style={{ fontSize:11, color:i < step ? "#00C875" : "#4A6A8A" }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={S.card}>
          {step === 1 && (
            <div>
              <h3 style={{ marginBottom:24, color:"#F0F4F8" }}>Create your account</h3>
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Full Name / Jina Lako</label>
                <input style={S.input} placeholder="e.g. Wanjiku Kamau" value={form.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Phone Number (M-PESA) / Nambari ya Simu</label>
                <input style={S.input} placeholder="07XX XXX XXX" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Password / Nywila (min 6 characters)</label>
                <input style={S.input} type="password" placeholder="Create a password" value={form.password} onChange={(e) => update("password", e.target.value)} />
                <p style={{ color:"#4A6A8A", fontSize:11, marginTop:4 }}>Remember this — you will need it to sign in</p>
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={S.label}>Your Work / Kazi Yako</label>
                {form.job_title ? (
                  <div style={{ background:"#003D20", border:"2px solid #00C875", borderRadius:10, padding:"12px 16px" }}>
                    <div style={{ color:"#00C875", fontSize:13, fontWeight:600 }}>{form.job_title}</div>
                    <div style={{ color:"#4A6A8A", fontSize:11, marginTop:2 }}>Classified as: {form.persona}</div>
                    <button onClick={() => { update("job_title",""); update("persona",""); setSelectedGroup(null); }} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", fontSize:12, marginTop:4, padding:0 }}>Change / Badilisha</button>
                  </div>
                ) : selectedGroup === null ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {OCCUPATION_GROUPS.map((group,i) => (
                      <button key={i} onClick={() => setSelectedGroup(i)} style={{ background:"#0A1628", border:"1px solid #1E3A5F", borderRadius:10, padding:"12px 16px", textAlign:"left", cursor:"pointer", color:"#F0F4F8" }}>
                        <div style={{ fontSize:14, fontWeight:600, marginBottom:2 }}>{group.label}</div>
                        <div style={{ fontSize:12, color:"#4A6A8A" }}>{group.description} / {group.descSw}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    <button onClick={() => setSelectedGroup(null)} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", fontSize:13, marginBottom:10, padding:0 }}>← Back to categories</button>
                    <div style={{ color:"#00C875", fontSize:13, fontWeight:600, marginBottom:10 }}>{OCCUPATION_GROUPS[selectedGroup].label}</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {OCCUPATION_GROUPS[selectedGroup].jobs.map((job,j) => (
                        <button key={j} onClick={() => { update("job_title",job); update("persona",OCCUPATION_GROUPS[selectedGroup].persona); setSelectedGroup(null); }} style={{ background:"#0A1628", border:"1px solid #1E3A5F", borderRadius:8, padding:"10px 14px", textAlign:"left", cursor:"pointer", color:"#F0F4F8", fontSize:13 }}>{job}</button>
                      ))}
                      <input style={{ ...S.input, fontSize:13, marginTop:4 }} placeholder="My job is not listed / Kazi yangu haipo hapa..."
                        onKeyDown={(e) => { if (e.key==="Enter" && e.target.value.trim()) { update("job_title",e.target.value.trim()); update("persona",OCCUPATION_GROUPS[selectedGroup].persona); setSelectedGroup(null); }}} />
                    </div>
                  </div>
                )}
              </div>
              {error && <p style={{ color:"#E53E3E", fontSize:13, marginBottom:12 }}>{error}</p>}
              <button style={S.btnGreen} onClick={() => { if (!form.name||!form.phone||!form.persona||form.password.length<6){setError("Fill all fields. Password min 6 characters.");return;} setError(""); setStep(2); }}>Continue →</button>
            </div>
          )}
          {step === 2 && (
            <div>
              <h3 style={{ marginBottom:24, color:"#F0F4F8" }}>Your Household · Nyumba Yako</h3>
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Marital Status</label>
                <div style={{ display:"flex", gap:12 }}>
                  {["Single","Married"].map((m) => (
                    <button key={m} onClick={() => update("is_married", m==="Married")} style={{ flex:1, padding:12, borderRadius:10, border:`2px solid ${form.is_married===(m==="Married")?"#00C875":"#1E3A5F"}`, background:form.is_married===(m==="Married")?"#003D20":"#0A1628", color:"#F0F4F8", cursor:"pointer" }}>{m}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Number of Children / Watoto · {form.n_kids}</label>
                <input type="range" min={0} max={8} value={form.n_kids} onChange={(e) => update("n_kids", parseInt(e.target.value))} style={{ width:"100%", accentColor:"#00C875" }} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#4A6A8A", marginTop:4 }}><span>0</span><span>8</span></div>
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={S.label}>Monthly Rent (KES) / Kodi ya Mwezi</label>
                <input style={S.input} type="number" placeholder="0 if rent-free" value={form.monthly_rent || ""} onChange={(e) => update("monthly_rent", parseInt(e.target.value) || 0)} />
              </div>
              <div style={{ display:"flex", gap:12 }}>
                <button style={{ ...S.btnOutline, flex:1 }} onClick={() => setStep(1)}>← Back</button>
                <button style={{ ...S.btnGreen, flex:2 }} onClick={() => setStep(3)}>Continue →</button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div>
              <h3 style={{ marginBottom:24, color:"#F0F4F8" }}>Financial Profile · Hali ya Fedha</h3>
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Savings Method / Jinsi Unavyoweka Akiba</label>
                <select style={S.select} value={form.savings_type} onChange={(e) => update("savings_type", e.target.value)}>
                  {SAVINGS_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Borrowing Habit / Tabia ya Kukopa</label>
                <select style={S.select} value={form.borrowing_habit} onChange={(e) => update("borrowing_habit", e.target.value)}>
                  {BORROW_HABITS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Your Fuliza Attitude / Mtazamo wa Fuliza</label>
                <select style={S.select} value={form.fuliza_attitude} onChange={(e) => update("fuliza_attitude", e.target.value)}>
                  {FULIZA_ATTITUDES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:24, display:"flex", gap:16 }}>
                {[["SHA Health Cover","has_sha"],["NSSF Member","has_nssf"]].map(([label,key]) => (
                  <button key={key} onClick={() => update(key, !form[key])} style={{ flex:1, padding:"12px", borderRadius:10, border:`2px solid ${form[key]?"#00C875":"#1E3A5F"}`, background:form[key]?"#003D20":"#0A1628", color:"#F0F4F8", cursor:"pointer", fontSize:13 }}>
                    {form[key] ? "✓ " : ""}{label}
                  </button>
                ))}
              </div>
              <div style={{ display:"flex", gap:12 }}>
                <button style={{ ...S.btnOutline, flex:1 }} onClick={() => setStep(2)}>← Back</button>
                <button style={{ ...S.btnGreen, flex:2 }} onClick={() => setStep(4)}>Continue →</button>
              </div>
            </div>
          )}
          {step === 4 && (
            <div>
              <h3 style={{ marginBottom:24, color:"#F0F4F8" }}>Social Obligations · Majukumu ya Kijamii</h3>
              <div style={{ marginBottom:16 }}>
                <button onClick={() => update("sends_remittance", !form.sends_remittance)} style={{ width:"100%", padding:"12px", borderRadius:10, border:`2px solid ${form.sends_remittance?"#00C875":"#1E3A5F"}`, background:form.sends_remittance?"#003D20":"#0A1628", color:"#F0F4F8", cursor:"pointer", textAlign:"left", fontSize:14 }}>
                  {form.sends_remittance ? "✓ " : ""}Send money to rural family / Tuma pesa familia mashambani
                </button>
              </div>
              {form.sends_remittance && (
                <div style={{ marginBottom:16 }}>
                  <label style={S.label}>Monthly remittance amount (KES)</label>
                  <input style={S.input} type="number" placeholder="e.g. 1500" value={form.remittance_amount || ""} onChange={(e) => update("remittance_amount", parseInt(e.target.value) || 0)} />
                </div>
              )}
              <div style={{ marginBottom:24 }}>
                <label style={S.label}>Weekly Church Tithe (KES) · Zaka ya Wiki</label>
                <input style={S.input} type="number" placeholder="0 if none" value={form.tithe_amount || ""} onChange={(e) => update("tithe_amount", parseInt(e.target.value) || 0)} />
              </div>
              {error && <p style={{ color:"#E53E3E", fontSize:13, marginBottom:12 }}>{error}</p>}
              <div style={{ display:"flex", gap:12 }}>
                <button style={{ ...S.btnOutline, flex:1 }} onClick={() => setStep(3)}>← Back</button>
                <button style={{ ...S.btnGreen, flex:2, opacity:loading ? 0.7 : 1 }} onClick={handleFinish} disabled={loading}>
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
// DAILY ENTRY FIELD
// ═══════════════════════════════════════════════════════════════════════════
function DailyField({ id, label, labelSw, value, onChange, color }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label htmlFor={id} style={S.label}>{label} <span style={{ color:"#4A6A8A", fontWeight:400 }}>· {labelSw}</span></label>
      <div style={{ position:"relative" }}>
        <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"#7A9CC0", fontSize:14, fontWeight:600, pointerEvents:"none" }}>KES</span>
        <input id={id} style={{ ...S.input, paddingLeft:48, borderColor: value && value !== "0" ? color : "#1E3A5F" }} type="number" inputMode="decimal" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

const EARN_SOURCES = [
  { value:"daily_work",      label:"Daily work / Kazi ya leo" },
  { value:"project_payment", label:"Project payment / Malipo ya mradi" },
  { value:"fare_income",     label:"Fares / Nauli" },
  { value:"sales",           label:"Business sales / Mauzo" },
  { value:"farm_sale",       label:"Farm sales / Mauzo ya shamba" },
  { value:"casual_labour",   label:"Casual labour / Kazi ya muda" },
  { value:"other_income",    label:"Other income / Mapato mengine" },
];

// ═══════════════════════════════════════════════════════════════════════════
// ADD TRANSACTION MODAL
// ═══════════════════════════════════════════════════════════════════════════
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
    const e=parseFloat(earned)||0, s=parseFloat(spent)||0, sv=parseFloat(saved)||0, b=parseFloat(borrowed)||0;
    if (e===0&&s===0&&sv===0&&b===0) { setError("Enter at least one amount / Ingiza kiasi kimoja angalau"); return; }
    const base = Date.now();
    const txns = [];
    if (e  > 0) txns.push({ id:base,   date, amount:e,   balance:0, category:earnFrom,                description:"Daily entry",    source:"manual" });
    if (s  > 0) txns.push({ id:base+1, date, amount:-s,  balance:0, category:"daily_spending",        description:"Daily spending", source:"manual" });
    if (sv > 0) txns.push({ id:base+2, date, amount:-sv, balance:0, category:"mshwari_deposit",       description:"Saved today",    source:"manual" });
    if (b  > 0) txns.push({ id:base+3, date, amount:b,   balance:0, category:"digital_loan_received", description:"Borrowed today", source:"manual" });
    txns.forEach((t) => onSave(t));
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"flex-end", zIndex:1000 }} onClick={(e) => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:"100%", maxWidth:480, margin:"0 auto", background:"#0F1F35", borderRadius:"20px 20px 0 0", padding:"24px 24px 32px", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ fontWeight:700, color:"#F0F4F8", fontSize:17 }}>Today's Summary · Muhtasari wa Leo</div>
            <div style={{ color:"#4A6A8A", fontSize:12, marginTop:4 }}>How did your day go? / Siku yako ya fedha ilikuwa vipi?</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", fontSize:22, lineHeight:1, padding:"0 0 0 16px" }}>✕</button>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={S.label}>Date / Tarehe</label>
          <input style={S.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DailyField id="de" label="How much did you earn?" labelSw="Ulipata kiasi gani?" value={earned} onChange={setEarned} color="#00C87566" />
        {parseFloat(earned) > 0 && (
          <div style={{ marginBottom:16, marginTop:-8 }}>
            <label style={S.label}>Main source / Chanzo kikuu cha mapato</label>
            <select style={S.select} value={earnFrom} onChange={(e) => setEarnFrom(e.target.value)}>
              {EARN_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
        <DailyField id="ds" label="How much did you spend?" labelSw="Ulitumia kiasi gani?" value={spent} onChange={setSpent} color="#E53E3E66" />
        <DailyField id="dv" label="Did you save anything?" labelSw="Uliweka akiba yoyote?" value={saved} onChange={setSaved} color="#3182CE66" />
        <DailyField id="db" label="Did you borrow anything?" labelSw="Ulikopa chochote?" value={borrowed} onChange={setBorrowed} color="#D69E2E66" />
        {error && <p style={{ color:"#E53E3E", fontSize:13, marginBottom:12, marginTop:-8 }}>{error}</p>}
        <button style={{ ...S.btnGreen, marginTop:8 }} onClick={handleSave}>Save Day · Hifadhi Siku</button>
        <p style={{ color:"#4A6A8A", fontSize:11, textAlign:"center", marginTop:12, lineHeight:1.5 }}>For full transaction history, use Import PDF above · Kwa historia kamili, tumia Ingiza PDF</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BALANCE SPARKLINE
// ═══════════════════════════════════════════════════════════════════════════
function BalanceSparkline({ transactions }) {
  if (!transactions || transactions.length === 0) return null;
  const byDate = {};
  transactions.forEach((t) => { const d=(t.date||"").slice(0,10); if (!d||d.length<10) return; if (!byDate[d]||t.balance>0) byDate[d]=t.balance; });
  const days = Object.keys(byDate).sort().slice(-30);
  if (days.length < 3) return null;
  const vals = days.map((d) => byDate[d] || 0);
  const max=Math.max(...vals,1), min=Math.min(...vals,0), range=max-min||1;
  const W=300, H=60, pad=4;
  const points = vals.map((v,i) => { const x=pad+(i/(vals.length-1))*(W-pad*2); const y=H-pad-((v-min)/range)*(H-pad*2); return `${x},${y}`; }).join(" ");
  const hasNeg = vals.some((v) => v<0);
  const zeroY  = H-pad-((0-min)/range)*(H-pad*2);
  return (
    <div style={{ ...S.card, marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
        <div style={{ fontSize:11, color:"#4A6A8A", fontWeight:600 }}>BALANCE TREND (30 days)</div>
        <div style={{ fontSize:12, color:vals[vals.length-1]>=0?"#00C875":"#E53E3E", fontWeight:700 }}>KES {(vals[vals.length-1]||0).toLocaleString()}</div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible" }}>
        {hasNeg && <line x1={pad} y1={zeroY} x2={W-pad} y2={zeroY} stroke="#E53E3E" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.5" />}
        <polyline points={points} fill="none" stroke="#00C875" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={`${pad},${H-pad} ${points} ${W-pad},${H-pad}`} fill="#00C875" opacity="0.08" stroke="none" />
        {vals.length>0 && <circle cx={pad+(W-pad*2)} cy={H-pad-((vals[vals.length-1]-min)/range)*(H-pad*2)} r="3" fill="#00C875" />}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function Dashboard({ user, transactions, onAddTxn, onViewLogs, onUpload, onBudget, onLogout }) {
  const features  = computeFeatures(transactions);
  const { tier, num } = classifyTier(features, user.persona);
  const tierCfg   = TIER_CONFIG[tier];
  const coaching  = getCoaching(user.persona, num);
  const [lang, setLang] = useState("en");
  const recentTxns = [...transactions].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,5);
  const stats = features ? [
    { label:"Avg Daily Income", labelSw:"Mapato ya Wastani", value:`KES ${features.income_mean.toLocaleString()}` },
    { label:"Avg Balance",      labelSw:"Salio la Wastani",  value:`KES ${features.bal_mean.toLocaleString()}` },
    { label:"Earning Days",     labelSw:"Siku za Mapato",    value:`${(features.earn_days_pct*100).toFixed(0)}%` },
    { label:"Fuliza / day",     labelSw:"Fuliza / siku",     value:features.fuliza_per_day.toFixed(1) },
  ] : [];
  const hasRecent = features && features.recent_days > 0;

  return (
    <div style={{ minHeight:"100vh", background:"#0A1628", padding:"0 0 80px" }}>
      <div style={{ background:"#0F1F35", borderBottom:"1px solid #1E3A5F", padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ color:"#00C875", fontWeight:700, fontSize:18 }}>◈ InFoach</div>
          <div style={{ color:"#7A9CC0", fontSize:13 }}>Habari, {(user.name||"").split(" ")[0]}</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={() => setLang((l) => l==="en"?"sw":"en")} style={{ ...S.tag, background:"#1E3A5F", color:"#7A9CC0", border:"none", cursor:"pointer" }}>{lang==="en"?"🇰🇪 SW":"🇬🇧 EN"}</button>
          <button onClick={onLogout} style={{ background:"none", border:"none", color:"#4A6A8A", cursor:"pointer", fontSize:13 }}>Sign out</button>
        </div>
      </div>
      <div style={{ padding:"20px 16px", maxWidth:540, margin:"0 auto" }}>
        <div style={{ ...S.card, borderColor:tierCfg.color+"44", marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:28, color:tierCfg.color, marginBottom:4 }}>{tierCfg.icon}</div>
              <div style={{ fontSize:22, fontWeight:700, color:tierCfg.color }}>{tierCfg.label}</div>
              <div style={{ color:"#7A9CC0", fontSize:13, marginTop:4 }}>{user.persona}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:11, color:"#4A6A8A" }}>HEALTH SCORE</div>
              <div style={{ fontSize:36, fontWeight:700, color:tierCfg.color }}>{num===4?"A":num===3?"B":num===2?"C":"D"}</div>
            </div>
          </div>
        </div>
        {features && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
            {stats.map((s) => (
              <div key={s.label} style={S.card}>
                <div style={{ fontSize:11, color:"#4A6A8A", marginBottom:4 }}>{lang==="en"?s.label:s.labelSw}</div>
                <div style={{ fontSize:20, fontWeight:700, color:"#F0F4F8" }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}
        {hasRecent && (
          <div style={{ ...S.card, marginBottom:16, borderLeft:"4px solid #534AB7" }}>
            <div style={{ fontSize:11, color:"#534AB7", fontWeight:600, marginBottom:10 }}>RECENT ACTIVITY (7 {lang==="en"?"days":"siku"})</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                { label:"Earned (7 days)", labelSw:"Mapato (siku 7)", value:`KES ${(features.recent_earned||0).toLocaleString()}` },
                { label:"Saved (7 days)",  labelSw:"Akiba (siku 7)",  value:`KES ${(features.recent_saved||0).toLocaleString()}` },
              ].map((s) => (
                <div key={s.label} style={{ background:"#0A1628", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:11, color:"#4A6A8A", marginBottom:4 }}>{lang==="en"?s.label:s.labelSw}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#F0F4F8" }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {features && features.has_pdf===1 && <BalanceSparkline transactions={transactions} />}
        {!features && (
          <div style={{ ...S.card, marginBottom:16, textAlign:"center", padding:"28px 20px" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📊</div>
            <div style={{ fontWeight:600, color:"#F0F4F8", marginBottom:8 }}>{lang==="en"?"No transaction data yet":"Bado hakuna data ya miamala"}</div>
            <div style={{ color:"#7A9CC0", fontSize:13, lineHeight:1.6, marginBottom:16 }}>{lang==="en"?"Add today's income and spending using the + button, or import your M-PESA statement PDF.":"Ongeza mapato na matumizi ya leo kwa kutumia kitufe cha +, au ingiza PDF ya taarifa yako ya M-PESA."}</div>
            <div style={{ display:"flex", gap:10 }}>
              <button style={{ ...S.btnOutline, flex:1, fontSize:13 }} onClick={onUpload}>📄 {lang==="en"?"Import PDF":"Ingiza PDF"}</button>
              <button style={{ ...S.btnGreen, flex:1, fontSize:13 }} onClick={onAddTxn}>+ {lang==="en"?"Log Today":"Rekodi Leo"}</button>
            </div>
          </div>
        )}
        <div style={{ ...S.card, borderLeft:"4px solid #00C875", marginBottom:16 }}>
          <div style={{ fontSize:11, color:"#00C875", marginBottom:10, fontWeight:600 }}>◈ COACHING · USHAURI</div>
          <p style={{ color:"#F0F4F8", lineHeight:1.6, margin:0, fontSize:14 }}>{lang==="en"?coaching.en:coaching.sw}</p>
        </div>
        {!user.has_sha && num>=2 && (
          <div style={{ ...S.card, borderLeft:"4px solid #D69E2E", marginBottom:16, background:"#1A1500" }}>
            <div style={{ fontSize:13, color:"#D69E2E", fontWeight:600, marginBottom:6 }}>ℹ️ No SHA Health Cover</div>
            <p style={{ color:"#A08020", fontSize:13, margin:0, lineHeight:1.5 }}>{lang==="en"?"One hospital visit can wipe months of savings. Register at any Huduma Centre — KES 500/month.":"Ziara moja ya hospitali inaweza futa akiba yako. Jisajili Huduma Centre — KES 500/mwezi."}</p>
          </div>
        )}
        <div style={S.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontWeight:600 }}>Recent Transactions</div>
            <button onClick={onViewLogs} style={{ background:"none", border:"none", color:"#00C875", cursor:"pointer", fontSize:13 }}>View all →</button>
          </div>
          {recentTxns.length===0 ? (
            <div style={{ textAlign:"center", padding:"24px 0", color:"#4A6A8A" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>◎</div>
              <div style={{ fontSize:14 }}>No transactions yet · Bado hakuna miamala</div>
            </div>
          ) : (
            recentTxns.map((t) => (
              <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #1E3A5F" }}>
                <div>
                  <div style={{ fontSize:13, marginBottom:2 }}>{(t.category||"").replace(/_/g," ")}</div>
                  <div style={{ fontSize:11, color:"#4A6A8A" }}>{t.date}</div>
                </div>
                <div style={{ fontWeight:600, color:t.amount>0?"#00C875":"#E53E3E" }}>{t.amount>0?"+":""}KES {Math.abs(t.amount).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </div>
      <div style={{ position:"fixed", bottom:24, right:20, display:"flex", gap:10, alignItems:"center" }}>
        <button onClick={onBudget} style={{ padding:"11px 14px", borderRadius:28, background:"#003D20", border:"1px solid #00C87544", color:"#00C875", fontSize:13, cursor:"pointer", fontWeight:600 }}>📊 Budget</button>
        <button onClick={onUpload} style={{ padding:"11px 14px", borderRadius:28, background:"#0F1F35", border:"1px solid #1E3A5F", color:"#7A9CC0", fontSize:13, cursor:"pointer" }}>📄 PDF</button>
        <button onClick={onAddTxn} style={{ width:52, height:52, borderRadius:"50%", background:"linear-gradient(135deg,#00C875,#00A35C)", border:"none", color:"#fff", fontSize:26, cursor:"pointer", boxShadow:"0 4px 20px rgba(0,200,117,0.4)", display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION LOGS
// ═══════════════════════════════════════════════════════════════════════════
function TransactionLogs({ transactions, onBack, onDelete }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = transactions
    .filter((t) => filter==="all"||(filter==="income"?t.amount>0:t.amount<0))
    .filter((t) => !search||(t.category||"").includes(search)||(t.description||"").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => new Date(b.date)-new Date(a.date));
  const totalIn  = transactions.filter((t)=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const totalOut = transactions.filter((t)=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
  return (
    <div style={{ minHeight:"100vh", background:"#0A1628", paddingBottom:40 }}>
      <div style={{ background:"#0F1F35", borderBottom:"1px solid #1E3A5F", padding:"16px 20px", display:"flex", alignItems:"center", gap:16 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", fontSize:18 }}>←</button>
        <div>
          <div style={{ fontWeight:600 }}>Transaction Log · Kumbukumbu ya Miamala</div>
          <div style={{ fontSize:12, color:"#4A6A8A" }}>{transactions.length} total</div>
        </div>
      </div>
      <div style={{ padding:16, maxWidth:540, margin:"0 auto" }}>
        <div style={{ display:"flex", gap:10, marginBottom:16 }}>
          {[["TOTAL IN",totalIn,"#00C875","#003D20"],["TOTAL OUT",totalOut,"#E53E3E","#3D0000"],["NET",totalIn-totalOut,totalIn-totalOut>=0?"#00C875":"#E53E3E","#0F1F35"]].map(([label,val,color,bg]) => (
            <div key={label} style={{ flex:1, ...S.card, background:bg, padding:"12px 14px" }}>
              <div style={{ fontSize:10, color }}>{label}</div>
              <div style={{ fontWeight:700, color, fontSize:14 }}>KES {Math.abs(val).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <input style={{ ...S.input, marginBottom:10 }} placeholder="Search transactions..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {["all","income","expense"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{ ...S.tag, background:filter===f?"#00C875":"#1E3A5F", color:filter===f?"#000":"#7A9CC0", border:"none", cursor:"pointer", padding:"8px 16px" }}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>
        {filtered.length===0 ? (
          <div style={{ textAlign:"center", padding:40, color:"#4A6A8A" }}>No transactions found</div>
        ) : (
          filtered.map((t) => (
            <div key={t.id} style={{ ...S.card, marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, marginBottom:2 }}>{(t.category||"").replace(/_/g," ")}</div>
                {t.description && <div style={{ fontSize:12, color:"#4A6A8A" }}>{t.description}</div>}
                <div style={{ fontSize:11, color:"#4A6A8A", marginTop:2 }}>{t.date}</div>
              </div>
              <div style={{ textAlign:"right", marginLeft:12 }}>
                <div style={{ fontWeight:700, color:t.amount>0?"#00C875":"#E53E3E", fontSize:15 }}>{t.amount>0?"+":""}KES {Math.abs(t.amount).toLocaleString()}</div>
                <button onClick={() => onDelete(t.id)} style={{ background:"none", border:"none", color:"#4A6A8A", cursor:"pointer", fontSize:12, marginTop:4 }}>remove</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BUDGET ADVISOR
// ═══════════════════════════════════════════════════════════════════════════
function BudgetAdvisor({ user, transactions, features, tier, num, lang, onBack }) {
  const fw = BUDGET_FRAMEWORK[tier] || BUDGET_FRAMEWORK.COPING;
  const income = features?.income_mean || 0;
  const allocations = income > 0 ? [
    { label:"Needs / Mahitaji",  pct:fw.needs,   amount:Math.round(income*fw.needs/100),   color:"#3182CE", action:lang==="en"?fw.needs_action:fw.needs_actionSw },
    { label:"Savings / Akiba",   pct:fw.savings, amount:Math.round(income*fw.savings/100), color:"#00C875", action:lang==="en"?fw.savings_action:fw.savings_actionSw },
    { label:"Debt / Madeni",     pct:fw.debt,    amount:Math.round(income*fw.debt/100),    color:"#E53E3E", action:lang==="en"?fw.debt_action:fw.debt_actionSw },
    { label:"Wants / Matakwa",   pct:fw.wants,   amount:Math.round(income*fw.wants/100),   color:"#D69E2E", action:"" },
  ] : [];
  return (
    <div style={{ minHeight:"100vh", background:"#0A1628", paddingBottom:40 }}>
      <div style={{ background:"#0F1F35", borderBottom:"1px solid #1E3A5F", padding:"16px 20px", display:"flex", alignItems:"center", gap:16 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", fontSize:18 }}>←</button>
        <div>
          <div style={{ fontWeight:600, color:"#F0F4F8" }}>Budget Advisor · Mshauri wa Bajeti</div>
          <div style={{ fontSize:12, color:"#4A6A8A" }}>{fw.title}</div>
        </div>
      </div>
      <div style={{ padding:20, maxWidth:540, margin:"0 auto" }}>
        <div style={{ ...S.card, borderLeft:`4px solid ${fw.color}`, marginBottom:16 }}>
          <div style={{ color:fw.color, fontWeight:600, marginBottom:6 }}>{fw.title}</div>
          <p style={{ color:"#7A9CC0", fontSize:13, margin:0 }}>{lang==="en"?fw.description:fw.descSw}</p>
          {income>0 && <p style={{ color:"#4A6A8A", fontSize:12, marginTop:8, marginBottom:0 }}>Based on your avg daily income of KES {income.toLocaleString()}</p>}
        </div>
        {income===0 ? (
          <div style={{ ...S.card, textAlign:"center", padding:"32px 20px" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📊</div>
            <div style={{ color:"#F0F4F8", fontWeight:600, marginBottom:8 }}>Add transactions first</div>
            <p style={{ color:"#7A9CC0", fontSize:13, margin:0 }}>Import your M-PESA PDF or log daily entries to see your personalised budget.</p>
          </div>
        ) : (
          <>
            <div style={{ ...S.card, marginBottom:16 }}>
              <div style={{ fontSize:12, color:"#7A9CC0", fontWeight:600, marginBottom:16 }}>RECOMMENDED DAILY ALLOCATION</div>
              {allocations.map((a) => (
                <div key={a.label} style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:13, color:"#F0F4F8" }}>{a.label}</span>
                    <span style={{ fontSize:13, color:a.color, fontWeight:700 }}>KES {a.amount.toLocaleString()} ({a.pct}%)</span>
                  </div>
                  <div style={{ height:8, background:"#1E3A5F", borderRadius:4, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${a.pct}%`, background:a.color, borderRadius:4 }} />
                  </div>
                  {a.action && <p style={{ fontSize:12, color:"#4A6A8A", marginTop:6, marginBottom:0, lineHeight:1.5 }}>→ {a.action}</p>}
                </div>
              ))}
            </div>
            <div style={{ ...S.card, background:"#0A1628" }}>
              <div style={{ fontSize:12, color:"#00C875", fontWeight:600, marginBottom:12 }}>KENYA MONEY TOOLS</div>
              {[["M-Shwari","Free savings — no minimum balance, earns 7.35% p.a."],["Fuliza","Emergency credit — but costs 1.083%/day. Use sparingly."],["SACCO","Best long-term savings and loans. Rates from 12% p.a."],["Hustler Fund","Govt micro-loan — repay on time to grow limit to KES 50K"],["SHA","Health insurance — KES 500/month for whole household"]].map(([name,tip]) => (
                <div key={name} style={{ display:"flex", gap:12, marginBottom:10 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"#00C875", marginTop:5, flexShrink:0 }} />
                  <div><span style={{ color:"#F0F4F8", fontSize:13, fontWeight:600 }}>{name}: </span><span style={{ color:"#7A9CC0", fontSize:13 }}>{tip}</span></div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// M-PESA PDF PARSER
// ═══════════════════════════════════════════════════════════════════════════
function parseMpesaText(rawText) {
  const txns  = [];
  const lines = rawText.split("\n").map((l) => l.replace(/\s{2,}/g," ").trim()).filter((l) => l.length > 0);

  const DATE_RE   = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
  const AMOUNT_RE = /([\d,]+\.\d{2})/g;
  const RECEIPT_RE = /\b([A-Z]{2}[A-Z0-9]{8,14})\b/;

  const isHeader = (line) =>
    /^(completion time|receipt no|transaction type|details|paid in|withdrawn|balance|status|safaricom|statement|date range|page \d|customer name|account number|dear|kindly|regards)/i.test(line);

  const getAmounts = (str) =>
    [...str.matchAll(AMOUNT_RE)].map((m) => parseFloat(m[1].replace(/,/g,""))).filter((n) => n >= 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeader(line)) continue;
    if (!DATE_RE.test(line)) continue;

    let candidate = line;
    let lookahead = 0;
    while (getAmounts(candidate).length < 2 && lookahead < 3 && i + 1 + lookahead < lines.length) {
      lookahead++;
      candidate = candidate + " " + lines[i + lookahead];
    }
    if (getAmounts(candidate).length < 2) continue;

    const dm = candidate.match(DATE_RE);
    if (!dm) continue;
    const [, d, m, y] = dm;
    const date = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;

    const amounts = getAmounts(candidate);
    if (amounts.length < 2) continue;

    const balance = amounts[amounts.length - 1];
    let amount;
    if (amounts.length >= 3) {
      const paidIn    = amounts[amounts.length - 3];
      const withdrawn = amounts[amounts.length - 2];
      if (paidIn > 0 && withdrawn === 0)      amount = paidIn;
      else if (withdrawn > 0 && paidIn === 0) amount = -withdrawn;
      else {
        const isOut = /paid to|buy goods|airtime|withdraw|transfer to|fuliza repay|loan repay|till|paybill|lipa na/i.test(candidate);
        amount = isOut ? -withdrawn : paidIn;
      }
    } else {
      const rawAmt = amounts[amounts.length - 2];
      const isOut  = /paid to|buy goods|airtime|withdraw|transfer to|fuliza repay|loan repay|till|paybill|lipa na mpesa/i.test(candidate);
      amount = isOut ? -rawAmt : rawAmt;
    }
    if (amount === 0) continue;

    const receiptMatch = candidate.match(RECEIPT_RE);
    const receipt = receiptMatch ? receiptMatch[1] : `PDF${Date.now()}${i}`;

    const desc = candidate.toLowerCase();
    let category = amount > 0 ? "business_revenue" : "daily_spending";
    if      (/fuliza repay/i.test(desc))                       category = "fuliza_repayment";
    else if (/fuliza|overdraft/i.test(desc) && amount > 0)     category = "fuliza_draw";
    else if (/mshwari|m-shwari/i.test(desc))                   category = amount > 0 ? "mshwari_withdrawal" : "mshwari_deposit";
    else if (/sacco/i.test(desc))                              category = amount > 0 ? "sacco_withdrawal" : "sacco_contribution";
    else if (/airtime/i.test(desc))                            category = "airtime";
    else if (/loan repay|repayment/i.test(desc))               category = "digital_loan_repayment";
    else if (/loan|tala|branch|okoa/i.test(desc))              category = "digital_loan_received";
    else if (/buy goods|till|lipa na mpesa|merchant/i.test(desc)) category = "inventory_restock";
    else if (/paybill/i.test(desc))                            category = amount < 0 ? "utility_payment" : "business_revenue";
    else if (/salary|wage/i.test(desc))                        category = "project_income";
    else if (/customer.*transfer|received from/i.test(desc))   category = "business_revenue";
    else if (/agent.*deposit|cash.*deposit/i.test(desc))       category = "cash_deposit";
    else if (/withdraw|agent/i.test(desc))                     category = amount > 0 ? "cash_deposit" : "withdrawal";
    else if (/fuel|petrol/i.test(desc))                        category = "fuel";
    else if (/rent|landlord/i.test(desc))                      category = "rent";

    txns.push({ id:`${receipt}_${date}_${i}`, date, amount:parseFloat(amount.toFixed(2)), balance:parseFloat(balance.toFixed(2)), category, description:candidate.slice(0,100).trim(), source:"pdf", receipt });
    i += lookahead;
  }

  const seen = new Set();
  return txns.filter((t) => { const k=`${t.receipt}_${t.date}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

async function extractPdfText(pdf) {
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page  = await pdf.getPage(p);
    const items = await page.getTextContent();
    let lastY   = null;
    for (const item of items.items) {
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 3) text += "\n";
      text += item.str + " ";
      lastY = y;
    }
    text += "\n";
  }
  return text;
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function UploadScreen({ onBack, onImport }) {
  const [stage,      setStage]      = useState("idle");
  const [file,       setFile]       = useState(null);
  const [parsedTxns, setParsedTxns] = useState([]);
  const [parseError, setParseError] = useState("");
  const [password,   setPassword]   = useState("");
  const [pwdError,   setPwdError]   = useState("");

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setParseError(""); setPwdError(""); setPassword(""); setParsedTxns([]); setStage("reading");
    try {
      const arrayBuffer = await f.arrayBuffer();
      const header = new Uint8Array(arrayBuffer.slice(0,5));
      if (!String.fromCharCode(...header).startsWith("%PDF")) {
        setParseError("This does not look like a PDF file. Please upload your M-PESA statement PDF.");
        setStage("error"); return;
      }
      const rawText    = new TextDecoder("latin1").decode(arrayBuffer);
      const isEncrypted = /\/Encrypt[\s\n\r]/.test(rawText);
      if (isEncrypted) {
        const pdfjs = await loadPdfJs();
        let opened = false;
        try {
          const pdf = await pdfjs.getDocument({ data: arrayBuffer.slice(0), password:"" }).promise;
          opened = true;
          setStage("parsing");
          const text = await extractPdfText(pdf);
          const txns = parseMpesaText(text);
          if (txns.length > 0) { setParsedTxns(txns); setStage("preview"); }
          else { setParseError("PDF opened but no transactions found. Make sure this is a Safaricom M-PESA statement."); setStage("error"); }
        } catch (_) { if (!opened) setStage("needs_password"); }
        return;
      }
      setStage("parsing");
      const pdfjs = await loadPdfJs();
      const task  = pdfjs.getDocument({ data: arrayBuffer });
      task.onPassword = () => setStage("needs_password");
      const pdf  = await task.promise;
      const text = await extractPdfText(pdf);
      const txns = parseMpesaText(text);
      if (txns.length > 0) { setParsedTxns(txns); setStage("preview"); }
      else { setParseError("No transactions found in this PDF. Make sure you are uploading a Safaricom M-PESA statement (dial *334# → My Account → Statement). The statement must cover at least 1 month."); setStage("error"); }
    } catch (err) {
      console.error("PDF read error:", err);
      setParseError("Could not read this PDF. Please try downloading a fresh copy of your statement.");
      setStage("error");
    }
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) { setPwdError("Please enter the password / Tafadhali ingiza nenosiri"); return; }
    if (!file) { setPwdError("No file. Please go back and select a file again."); return; }
    setPwdError(""); setStage("parsing");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjs       = await loadPdfJs();
      let wrongPwd = false;
      const task = pdfjs.getDocument({ data: arrayBuffer, password: password.trim() });
      task.onPassword = (_, reason) => { if (reason === 2) { wrongPwd = true; setStage("wrong_password"); setPwdError("Incorrect password. Try again. / Nenosiri si sahihi. Jaribu tena."); } };
      const pdf  = await task.promise;
      if (wrongPwd) return;
      const text = await extractPdfText(pdf);
      const txns = parseMpesaText(text);
      if (txns.length > 0) { setParsedTxns(txns); setStage("preview"); setPassword(""); }
      else { setStage("needs_password"); setPwdError("Unlocked but no transactions found. Make sure this is a Safaricom M-PESA statement."); }
    } catch (err) {
      const msg = (err.message || "").toLowerCase();
      if (msg.includes("password") || msg.includes("incorrect")) { setStage("wrong_password"); setPwdError("Incorrect password. Try again."); }
      else { setStage("error"); setParseError("Could not open the PDF. Please try a fresh copy."); }
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0A1628", paddingBottom:40 }}>
      <div style={{ background:"#0F1F35", borderBottom:"1px solid #1E3A5F", padding:"16px 20px", display:"flex", alignItems:"center", gap:16 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", fontSize:18 }}>←</button>
        <div>
          <div style={{ fontWeight:600, color:"#F0F4F8" }}>Import M-PESA Statement · Ingiza Taarifa</div>
          <div style={{ fontSize:12, color:"#4A6A8A" }}>Ingiza taarifa yako ya M-PESA</div>
        </div>
      </div>
      <div style={{ padding:20, maxWidth:480, margin:"0 auto" }}>
        {(stage==="idle"||stage==="reading"||stage==="error") && (
          <div>
            <div style={S.card}>
              <div style={{ fontSize:13, color:"#7A9CC0", lineHeight:1.6, marginBottom:20 }}>
                Upload your Safaricom M-PESA statement PDF. You will only be asked for a password <strong style={{ color:"#F0F4F8" }}>if the file actually needs one</strong>.
                <br /><br />
                <span style={{ color:"#4A6A8A" }}>Pakia PDF ya taarifa yako ya M-PESA. Utaulizwa nenosiri tu kama faili linahitaji hivyo.</span>
              </div>
              <label style={{ display:"block", border:"2px dashed #1E3A5F", borderRadius:12, padding:"32px 20px", textAlign:"center", cursor:"pointer" }}
                onMouseEnter={(e)=>e.currentTarget.style.borderColor="#00C875"} onMouseLeave={(e)=>e.currentTarget.style.borderColor="#1E3A5F"}>
                <input type="file" accept=".pdf" onChange={handleFile} style={{ display:"none" }} />
                <div style={{ fontSize:36, marginBottom:12 }}>{stage==="reading"?"⏳":"📄"}</div>
                <div style={{ color:"#F0F4F8", fontWeight:600, marginBottom:4 }}>{stage==="reading"?"Reading file...":(file?`${file.name} — tap to change`:"Tap to select PDF")}</div>
                <div style={{ color:"#4A6A8A", fontSize:13 }}>M-PESA statement (.pdf)</div>
              </label>
              {stage==="error" && parseError && <div style={{ marginTop:16, padding:"12px 16px", background:"#3D0000", borderRadius:10, color:"#E53E3E", fontSize:13, lineHeight:1.5 }}>{parseError}</div>}
            </div>
            <div style={{ ...S.card, background:"#0A1628", border:"1px solid #1E3A5F", marginTop:16 }}>
              <div style={{ fontSize:12, color:"#00C875", fontWeight:600, marginBottom:10 }}>How to get your M-PESA statement</div>
              {[["1","Dial *334#","Piga *334#"],["2","Select My Account → Statement","Chagua Akaunti Yangu → Taarifa"],["3","Choose date range (max 6 months)","Chagua kipindi (miezi 6 max)"],["4","Statement sent to your email","Taarifa inatumwa kwa barua pepe"]].map(([n,en,sw]) => (
                <div key={n} style={{ display:"flex", gap:12, marginBottom:10 }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", background:"#1E3A5F", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#00C875", flexShrink:0 }}>{n}</div>
                  <div><div style={{ fontSize:13, color:"#F0F4F8" }}>{en}</div><div style={{ fontSize:11, color:"#4A6A8A" }}>{sw}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {(stage==="needs_password"||stage==="wrong_password") && (
          <div style={S.card}>
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
              <div style={{ fontWeight:600, color:"#F0F4F8", fontSize:18, marginBottom:8 }}>{stage==="wrong_password"?"Incorrect password — try again":"This statement is password protected"}</div>
              <div style={{ color:"#7A9CC0", fontSize:13, lineHeight:1.6 }}>Enter the password from the Safaricom email.<br /><span style={{ color:"#4A6A8A" }}>Ingiza nenosiri kutoka barua pepe ya Safaricom. Kawaida ni nambari yako ya kitambulisho au ya simu.</span></div>
            </div>
            <div style={{ marginBottom:8 }}>
              <label style={S.label}>Password / Nenosiri</label>
              <input style={{ ...S.input, fontSize:17, letterSpacing:"0.08em", borderColor:stage==="wrong_password"?"#E53E3E":"#1E3A5F" }} type="password" placeholder="Enter PDF password" value={password} autoFocus onChange={(e) => { setPassword(e.target.value); setPwdError(""); }} onKeyDown={(e) => e.key==="Enter" && handlePasswordSubmit()} />
              {pwdError && <p style={{ color:"#E53E3E", fontSize:12, marginTop:8, lineHeight:1.5 }}>{pwdError}</p>}
            </div>
            <p style={{ color:"#4A6A8A", fontSize:12, marginBottom:20, lineHeight:1.5 }}>We never store your password. It is used only to unlock this file in your browser.<br /><span style={{ color:"#2A4A3A" }}>Hatuhifadhi nenosiri lako.</span></p>
            <div style={{ display:"flex", gap:12 }}>
              <button style={{ ...S.btnOutline, flex:1 }} onClick={() => { setStage("idle"); setPassword(""); setPwdError(""); }}>← Try different file</button>
              <button style={{ ...S.btnGreen, flex:2 }} onClick={handlePasswordSubmit}>Unlock · Fungua</button>
            </div>
          </div>
        )}
        {stage==="parsing" && (
          <div style={{ ...S.card, textAlign:"center", padding:48 }}>
            <div style={{ fontSize:40, marginBottom:16 }}>⟳</div>
            <div style={{ color:"#F0F4F8", fontWeight:600 }}>Reading your transactions...</div>
            <div style={{ color:"#4A6A8A", fontSize:13, marginTop:8 }}>Inasoma miamala yako...</div>
          </div>
        )}
        {stage==="preview" && parsedTxns.length > 0 && (
          <div>
            <div style={{ ...S.card, marginBottom:16 }}>
              <div style={{ fontSize:13, color:"#00C875", fontWeight:600, marginBottom:16 }}>✅ {parsedTxns.length} transactions found · Miamala {parsedTxns.length} imepatikana</div>
              <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                {[{label:"Income",value:`KES ${parsedTxns.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0).toLocaleString()}`,color:"#00C875"},{label:"Expenses",value:`KES ${parsedTxns.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0).toLocaleString()}`,color:"#E53E3E"}].map(s=>(
                  <div key={s.label} style={{ flex:1, background:"#0A1628", borderRadius:10, padding:"10px 12px" }}>
                    <div style={{ fontSize:11, color:"#4A6A8A" }}>{s.label}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:s.color, marginTop:2 }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:12, color:"#4A6A8A", marginBottom:8 }}>Preview (first 5)</div>
              {parsedTxns.slice(0,5).map(t=>(
                <div key={t.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #1E3A5F", fontSize:13 }}>
                  <div>
                    <div style={{ color:"#F0F4F8" }}>{(t.category||"").replace(/_/g," ")}</div>
                    <div style={{ color:"#4A6A8A", fontSize:11 }}>{t.date} · {(t.description||"").slice(0,35)}</div>
                  </div>
                  <div style={{ fontWeight:600, color:t.amount>0?"#00C875":"#E53E3E" }}>{t.amount>0?"+":""}KES {Math.abs(t.amount).toLocaleString()}</div>
                </div>
              ))}
              {parsedTxns.length>5&&<div style={{ color:"#4A6A8A", fontSize:12, textAlign:"center", marginTop:10 }}>+{parsedTxns.length-5} more transactions</div>}
            </div>
            <button style={S.btnGreen} onClick={() => onImport(parsedTxns)}>Import {parsedTxns.length} Transactions · Ingiza Miamala</button>
            <button style={{ ...S.btnOutline, width:"100%", marginTop:10 }} onClick={() => { setStage("idle"); setParsedTxns([]); setFile(null); }}>Cancel · Ghairi</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP — default export for Vite/React bundled deployment
// ═══════════════════════════════════════════════════════════════════════════
export default function InFoachApp() {
  const [screen,       setScreen]       = useState("welcome");
  const [currentUser,  setCurrentUser]  = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showAddTxn,   setShowAddTxn]   = useState(false);
  const [budgetLang]                    = useState("en");

  useEffect(() => {
    wakeUpAPI();
    if (_authToken) {
      try {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("infoach:user:"));
        if (keys.length > 0) {
          const stored = JSON.parse(localStorage.getItem(keys[0]));
          if (stored) {
            setCurrentUser(stored);
            setScreen("dashboard");
            apiLoadTxns().then((txns) => { if (Array.isArray(txns)) setTransactions(txns); });
          }
        }
      } catch (_) {}
    }
  }, []);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setScreen("dashboard");
    apiLoadTxns().then((txns) => { if (Array.isArray(txns)) setTransactions(txns); });
  };

  const handleAddTxn = (txn) => {
    const updated = [...transactions, txn];
    setTransactions(updated);
    apiSaveTxns([txn]);
    setShowAddTxn(false);
  };

  const handleDeleteTxn = (id) => {
    setTransactions((prev) => prev.filter((t) => String(t.id) !== String(id)));
    apiDeleteTxn(id);
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    setTransactions([]);
    setScreen("welcome");
  };

  const features = computeFeatures(transactions);
  const { tier, num } = classifyTier(features, currentUser?.persona);

  if (screen === "welcome")  return <WelcomeScreen onLogin={() => setScreen("login")} onRegister={() => setScreen("register")} />;
  if (screen === "login")    return <LoginScreen onSuccess={handleAuthSuccess} onBack={() => setScreen("welcome")} />;
  if (screen === "register") return <RegisterScreen onSuccess={handleAuthSuccess} onBack={() => setScreen("welcome")} />;
  if (screen === "logs")     return <TransactionLogs transactions={transactions} onBack={() => setScreen("dashboard")} onDelete={handleDeleteTxn} />;
  if (screen === "budget")   return <BudgetAdvisor user={currentUser} transactions={transactions} features={features} tier={tier} num={num} lang={budgetLang} onBack={() => setScreen("dashboard")} />;
  if (screen === "upload")   return (
    <UploadScreen
      onBack={() => setScreen("dashboard")}
      onImport={(txns) => {
        const manual   = transactions.filter((t) => !t.receipt);
        const combined = [...manual, ...txns];
        setTransactions(combined);
        apiSaveTxns(combined);
        setScreen("dashboard");
      }}
    />
  );

  return (
    <div style={S.app}>
      {screen === "dashboard" && (
        <Dashboard
          user={currentUser}
          transactions={transactions}
          onAddTxn={() => setShowAddTxn(true)}
          onViewLogs={() => setScreen("logs")}
          onUpload={() => setScreen("upload")}
          onBudget={() => setScreen("budget")}
          onLogout={handleLogout}
        />
      )}
      {showAddTxn && <AddTransactionModal onSave={handleAddTxn} onClose={() => setShowAddTxn(false)} />}
    </div>
  );
}
