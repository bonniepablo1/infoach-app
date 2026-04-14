import { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// SAFE STORAGE — wraps localStorage with in-memory fallback
// Fixes "Tracking Prevention blocked access to storage" on Edge/Firefox
// ═══════════════════════════════════════════════════════════════════════════
const _mem = {};
const safeStorage = {
  get(k)    { try { return localStorage.getItem(k); } catch (_) { return _mem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} _mem[k] = v; },
  remove(k) { try { localStorage.removeItem(k); } catch (_) {} delete _mem[k]; },
  keys()    { try { return Object.keys(localStorage); } catch (_) { return Object.keys(_mem); } },
};

// ═══════════════════════════════════════════════════════════════════════════
// PDF.js — loaded on demand, worker disabled for Tracking Prevention compat
// Setting workerSrc = "" forces PDF.js to run in the main thread (no worker
// blob, no CDN worker request, no CORS issues, works on all browsers)
// ═══════════════════════════════════════════════════════════════════════════
let _pdfjs = null;
function loadPdfJs() {
  if (_pdfjs) return Promise.resolve(_pdfjs);
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "";
      _pdfjs = window.pdfjsLib;
      resolve(_pdfjs);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "";
      _pdfjs = window.pdfjsLib;
      resolve(_pdfjs);
    };
    script.onerror = () => reject(new Error("Could not load PDF.js"));
    document.head.appendChild(script);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG & API
// ═══════════════════════════════════════════════════════════════════════════
const API_URL = "https://daktari0-infoach-api.hf.space";

let _authToken = null;
try { const s = safeStorage.get("infoach:token"); if (s) _authToken = s; } catch (_) {}

function setToken(token) {
  _authToken = token;
  if (token) safeStorage.set("infoach:token", token);
  else safeStorage.remove("infoach:token");
}

async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (_authToken) headers["Authorization"] = `Bearer ${_authToken}`;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  if (res.status === 401) { setToken(null); window.location.reload(); return null; }
  if (!res.ok) {
    let detail = `API error ${res.status}`;
    try { const e = await res.json(); detail = e.detail || detail; } catch (_) {}
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
      phone: normalisePhone(form.phone), name: form.name, password: form.password,
      persona: form.persona, job_title: form.job_title, is_married: form.is_married,
      n_kids: form.n_kids, monthly_rent: form.monthly_rent, savings_type: form.savings_type,
      borrowing_habit: form.borrowing_habit, fuliza_attitude: form.fuliza_attitude,
      has_sha: form.has_sha, has_nssf: form.has_nssf, sends_remittance: form.sends_remittance,
      remittance_amount: form.remittance_amount, tithe_amount: form.tithe_amount,
    }),
  });
  setToken(data.token);
  safeStorage.set(`infoach:user:${data.user.phone}`, JSON.stringify(data.user));
  return data.user;
}

async function apiLogin(phone, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: normalisePhone(phone), password }),
  });
  setToken(data.token);
  safeStorage.set(`infoach:user:${data.user.phone}`, JSON.stringify(data.user));
  return data.user;
}

async function apiLoadTxns() {
  try { const d = await apiFetch("/transactions?limit=5000"); return d?.transactions || []; }
  catch (_) { return []; }
}

// Batch-save to avoid timeout on large PDF imports
async function apiSaveTxns(txns) {
  if (!txns || txns.length === 0) return;
  const BATCH = 200;
  for (let i = 0; i < txns.length; i += BATCH) {
    try {
      await apiFetch("/transactions", {
        method: "POST",
        body: JSON.stringify(txns.slice(i, i + BATCH).map(t => ({
          id: String(t.id || Date.now()), date: t.date, amount: Number(t.amount),
          balance: Number(t.balance || 0), category: t.category || "other",
          description: t.description || "", source: t.source || "manual",
          receipt: t.receipt || "",
        }))),
      });
    } catch (_) {}
  }
}

async function apiDeleteTxn(id) {
  try { await apiFetch(`/transactions/${id}`, { method: "DELETE" }); } catch (_) {}
}

async function wakeUpAPI() { try { await fetch(`${API_URL}/`); } catch (_) {} }

// ═══════════════════════════════════════════════════════════════════════════
// OCCUPATION GROUPS
// ═══════════════════════════════════════════════════════════════════════════
const OCCUPATION_GROUPS = [
  { persona:"Daily Hustler", label:"Daily Hustler / Msukumo wa Kila Siku",
    description:"Earn money daily from various small activities", descSw:"Kupata pesa kila siku kutoka shughuli ndogo ndogo",
    jobs:["Street vendor / Muuzaji mtaani","Hawker / Hawker","Casual labourer / Mfanyakazi wa muda","Delivery rider / Mpiga mbio wa delivery","Car wash / Kuosha magari","Shoe shiner / Mpiga rangi viatu","Porter / Mpeba","Market porter / Mchukuzi wa soko","Other daily work / Kazi nyingine za kila siku"] },
  { persona:"Small-Scale Trader", label:"Small-Scale Trader / Mfanyabiashara Mdogo",
    description:"Sell goods from a stall, shop or market", descSw:"Kuuza bidhaa dukani, stendi au sokoni",
    jobs:["Market stall / Stendi ya soko","Vegetable seller / Muuzaji mboga","Fruit seller / Muuzaji matunda","Grocery / Duka la vyakula","Clothes seller / Muuzaji nguo","Electronics seller / Muuzaji elektroniki","Butcher / Mchinjaji","Fish monger / Muuzaji samaki","Hardware / Muuzaji vifaa vya ujenzi","General shop / Duka la jumla","Other trading / Biashara nyingine"] },
  { persona:"Artisan - Stable", label:"Skilled Artisan (Stable) / Fundi (Imara)",
    description:"Skilled trade with regular clients and steady work", descSw:"Fundi mwenye wateja wa kawaida na kazi ya uhakika",
    jobs:["Carpenter / Seremala","Electrician / Fundi umeme","Plumber / Fundi bomba","Welder / Fundi chuma","Mechanic / Fundi gari","Mason / Mwashi","Painter / Mpigaji rangi","Tailor (established) / Fundi kushona (imara)","Electronics repair / Fundi elektroniki","Other skilled trade (stable) / Ufundi mwingine (imara)"] },
  { persona:"Artisan - Struggling", label:"Skilled Artisan (Struggling) / Fundi (Anayojitahidi)",
    description:"Skilled work but irregular jobs and unstable income", descSw:"Fundi mwenye kazi za nasibu na mapato yasiyotabirika",
    jobs:["Casual artisan / Fundi wa nasibu","Tailor (casual) / Fundi kushona (nasibu)","Shoe repairer / Fundi viatu","Jua Kali artisan / Fundi Jua Kali","Small repairs / Marekebisho madogo","Other skilled trade (struggling) / Ufundi mwingine (anayojitahidi)"] },
  { persona:"Boda Boda Operator", label:"Boda Boda / Pikipiki",
    description:"Motorcycle taxi or delivery operator", descSw:"Dereva wa pikipiki au delivery",
    jobs:["Boda boda rider / Dereva wa boda boda","Motorcycle taxi / Teksi ya pikipiki","Motorcycle delivery / Delivery ya pikipiki","Tuk-tuk operator / Dereva wa tuk-tuk"] },
  { persona:"Agricultural Worker", label:"Agricultural Worker / Mkulima",
    description:"Farming, livestock or fishing as main income", descSw:"Kilimo, mifugo au uvuvi kama chanzo kikuu cha mapato",
    jobs:["Smallholder farmer / Mkulima mdogo","Livestock keeper / Mfugaji","Fisher / Mvuvi","Farm worker / Mfanyakazi wa shamba","Dairy farmer / Mfugaji wa ng'ombe maziwa","Poultry farmer / Mfugaji wa kuku","Horticulture / Bustani","Other farming / Kilimo kingine"] },
  { persona:"Struggling Entrepreneur", label:"Entrepreneur / Mjasiriamali",
    description:"Running a small business with employees or fixed costs", descSw:"Kuendesha biashara ndogo yenye wafanyakazi au gharama za kudumu",
    jobs:["Small restaurant / Hoteli ndogo","Salon / Saluni","Barbershop / Kinyozi","Pharmacy / Duka la dawa","Cyber cafe / Saiber cafe","Printing / Uchapishaji","Mpesa agent / Wakala wa M-PESA","Fuel station attendant / Mfanyakazi wa kituo cha mafuta","Wholesale distributor / Msambazaji","Other small business / Biashara nyingine ndogo"] },
];

const SAVINGS_TYPES = [
  { value:"none", label:"None / Hakuna" }, { value:"mshwari_only", label:"M-Shwari only" },
  { value:"chama_only", label:"Chama / ROSCA only" }, { value:"sacco_only", label:"SACCO only" },
  { value:"multiple", label:"Multiple / Nyingi" },
];
const BORROW_HABITS = [
  { value:"never", label:"Never / Kamwe" }, { value:"emergency_only", label:"Emergency only / Dharura tu" },
  { value:"regular", label:"Regular / Mara kwa mara" }, { value:"chronic", label:"Chronic / Kila wakati" },
];
const FULIZA_ATTITUDES = [
  { value:"refuses", label:"Refuses / Nakataa" }, { value:"reluctant", label:"Reluctant / Siko tayari" },
  { value:"pragmatic", label:"Pragmatic / Wakati muhimu" }, { value:"habitual", label:"Habitual / Kila siku" },
];

// ═══════════════════════════════════════════════════════════════════════════
// COACHING DATABASE
// ═══════════════════════════════════════════════════════════════════════════
const COACHING_DB = {
  "Daily Hustler_1":{ en:"CRISIS: Stop all non-essential spending today. Send KES 50 to M-Shwari right now — even this small amount builds the habit. Avoid Fuliza completely for 7 days.", sw:"DHARURA: Simamisha matumizi yote yasiyohitajika leo. Tuma KES 50 M-Shwari sasa hivi — hata kiasi kidogo kinajenga tabia. Epuka Fuliza kabisa kwa siku 7." },
  "Daily Hustler_2":{ en:"You earn every day but spend everything same day. Each morning before any spending, lock KES 100 in M-Shwari. After 30 days you will have KES 3,000 saved — your first emergency buffer.", sw:"Unapata pesa kila siku lakini unatumia yote. Kila asubuhi kabla ya kutumia, funga KES 100 M-Shwari. Baada ya siku 30 utakuwa na KES 3,000 — akiba yako ya kwanza ya dharura." },
  "Daily Hustler_3":{ en:"Good earning rhythm. Now build resilience: save KES 200/day in M-Shwari. In 3 months you will have KES 18,000 — enough to survive one slow month without Fuliza.", sw:"Una mdundo mzuri wa mapato. Sasa jenga nguvu: weka KES 200/siku M-Shwari. Miezi 3 utakuwa na KES 18,000 — ya kutosha kuishi mwezi mmoja wa polepole bila Fuliza." },
  "Daily Hustler_4":{ en:"Strong financial discipline. Join a chama or SACCO to grow savings faster. Consider Hustler Fund — repaying on time builds your credit limit from KES 500 to KES 50,000.", sw:"Nidhamu nzuri ya fedha. Jiunge na chama au SACCO kukua akiba haraka. Fikiria Hustler Fund — kulipa kwa wakati huongeza mkopo wako kutoka KES 500 hadi KES 50,000." },
  "Small-Scale Trader_1":{ en:"Business is losing money. Stop restocking until you understand why. Count your stock today and compare to last week — find what is not selling and stop buying it.", sw:"Biashara inapoteza pesa. Simamisha kujaza bidhaa mpaka uelewa sababu. Hesabu bidhaa zako leo na ulinganishe na wiki iliyopita — tafuta isiyouza na uache kuinunua." },
  "Small-Scale Trader_2":{ en:"Restock in smaller amounts daily rather than large amounts weekly. This protects your cash when sales are slow. Use Pochi La Biashara to separate business from personal money.", sw:"Jaza bidhaa kidogo kila siku badala ya kiasi kikubwa wiki moja. Hii inalinda pesa yako wakati mauzo ni polepole. Tumia Pochi La Biashara kutenganisha pesa za biashara na za kibinafsi." },
  "Small-Scale Trader_3":{ en:"Business is surviving. Find your 3 best-selling items and always keep them stocked. Each week save 10% of profit in M-Shwari before spending on anything else.", sw:"Biashara inasimama. Tafuta bidhaa 3 zinazouza zaidi na uzidumishe daima. Kila wiki weka 10% ya faida M-Shwari kabla ya kutumia kitu kingine chochote." },
  "Small-Scale Trader_4":{ en:"Business is growing. Join a traders SACCO, apply for a Stawi loan (rates from 9%), and consider expanding to a second product line.", sw:"Biashara inakua. Jiunge na SACCO ya wafanyabiashara, omba mkopo wa Stawi (riba kuanzia 9%), na fikiria kuongeza laini ya pili ya bidhaa." },
  "Artisan - Stable_1":{ en:"Work has dried up. Do not wait — contact 5 past clients today for follow-up jobs. Offer a small discount for bookings this week. One job now is better than waiting.", sw:"Kazi imeisha. Usisimame — wasiliana na wateja 5 wa zamani leo kwa kazi za ufuatiliaji. Toa punguzo dogo kwa miadi wiki hii." },
  "Artisan - Stable_2":{ en:"Consistent work but income is tight. Quote 10% higher on your next 3 projects — most clients will not notice. Save that extra directly into M-Shwari after each payment.", sw:"Kazi ya kawaida lakini mapato ni kidogo. Toa bei 10% zaidi kwa miradi yako 3 ijayo. Weka ziada M-Shwari moja kwa moja baada ya kila malipo." },
  "Artisan - Stable_3":{ en:"Good steady work. Build a KES 15,000 emergency fund in M-Shwari. Register for SHA health cover (KES 500/month) so one illness does not wipe your savings.", sw:"Kazi nzuri ya kawaida. Jenga akiba ya dharura ya KES 15,000 M-Shwari. Jisajili SHA (KES 500/mwezi) ili ugonjwa mmoja usifute akiba yako." },
  "Artisan - Stable_4":{ en:"Excellent discipline. Join a Jua Kali SACCO to access larger loans at better rates. Consider training an apprentice — this creates a second income stream.", sw:"Nidhamu bora. Jiunge na SACCO ya Jua Kali kupata mikopo mikubwa kwa riba bora. Fikiria kufunza mwanafunzi — hii inaunda chanzo cha pili cha mapato." },
  "Artisan - Struggling_1":{ en:"Critical: you are spending more than you earn. Deposit all cash job payments into M-PESA immediately — even KES 50. This creates a visible savings record for future loan applications.", sw:"Muhimu: unatumia zaidi ya unavyopata. Weka malipo yote ya kazi taslimu M-PESA mara moja — hata KES 50. Hii inaunda rekodi ya akiba inayoonekana kwa maombi ya mkopo ya baadaye." },
  "Artisan - Struggling_2":{ en:"Cash jobs are real income — deposit them into M-PESA to build a savings record. Specialise in one skill and charge KES 200 more per job. That extra KES 200 saved daily = KES 6,000/month.", sw:"Kazi za pesa taslimu ni mapato halisi. Bobea katika ujuzi mmoja na kutoza KES 200 zaidi kwa kazi. KES 200 za ziada kila siku = KES 6,000/mwezi." },
  "Artisan - Struggling_3":{ en:"Regular work but not getting ahead. Pick your single strongest skill and market it specifically — a welder who specialises in gates earns 40% more than a general welder.", sw:"Kazi ya kawaida lakini hupati maendeleo. Chagua ujuzi wako mmoja bora na uuuze maalum — fundi wa malango anayebobea anapata 40% zaidi ya fundi wa kawaida." },
  "Artisan - Struggling_4":{ en:"Income improving. Save KES 500/week in M-Shwari and never touch it. In 6 months you will have KES 13,000 — enough to buy your own tools and stop renting.", sw:"Mapato yanaboreka. Weka KES 500/wiki M-Shwari na usiguse. Miezi 6 utakuwa na KES 13,000 — ya kutosha kununua zana zako na kuacha kukodisha." },
  "Boda Boda Operator_1":{ en:"Serious risk: one breakdown could stop your income completely. Save KES 200 every single day in M-Shwari. In 30 days you have KES 6,000 repair fund.", sw:"Hatari kubwa: uharibike mmoja unaweza kusimamisha mapato yako kabisa. Weka KES 200 kila siku M-Shwari — usiruke. Siku 30 una KES 6,000 ya matengenezo." },
  "Boda Boda Operator_2":{ en:"Inconsistent earnings are the problem. Track your best 3 routes or customers. Save KES 300/day in M-Shwari before fuel expenses.", sw:"Mapato yasiyofaa ni tatizo. Fuatilia njia zako 3 bora au wateja. Weka KES 300/siku M-Shwari kabla ya gharama za mafuta." },
  "Boda Boda Operator_3":{ en:"Solid earnings. Build a KES 8,000 M-Shwari emergency fund so one breakdown does not wipe you out. Consider NTSA insurance (KES 5,550/year).", sw:"Mapato mazuri. Jenga akiba ya KES 8,000 M-Shwari ili uharibike mmoja usikufute. Fikiria bima ya NTSA (KES 5,550/mwaka)." },
  "Boda Boda Operator_4":{ en:"Excellent income management. Think about owning a second bike through a boda boda SACCO — this doubles your income potential without doubling your working hours.", sw:"Usimamizi bora wa mapato. Fikiria kumiliki pikipiki ya pili kupitia SACCO ya boda boda — hii inaandaa mapato yako mara mbili bila kuongeza masaa ya kazi." },
  "Agricultural Worker_1":{ en:"Offseason crisis. Look for casual labour or start a small kitchen garden. Contact your nearest SACCO for a seasonal loan to prepare for the next planting.", sw:"Dharura ya msimu wa ukame. Tafuta kazi za muda au anza bustani ndogo ya chakula cha nyumbani. Wasiliana na SACCO yako ya karibu kwa mkopo wa msimu." },
  "Agricultural Worker_2":{ en:"Lean season stress. During harvest, save at least 20% before spending. KES 5,000 saved at harvest covers 2 lean months.", sw:"Msongo wa msimu wa ukame. Wakati wa mavuno, weka angalau 20% kabla ya kutumia. KES 5,000 zilizowekwa wakati wa mavuno zinashughulikia miezi 2 ya ukame." },
  "Agricultural Worker_3":{ en:"Good seasonal management. Save 20% of every harvest payment before any spending. Register for SHA health cover — one hospital visit during planting season can destroy the whole season.", sw:"Usimamizi mzuri wa msimu. Weka 20% ya kila malipo ya mavuno kabla ya kutumia chochote. Jisajili SHA — ziara moja ya hospitali wakati wa kupanda inaweza kuharibu msimu wote." },
  "Agricultural Worker_4":{ en:"Strong farm management. Explore contract farming with Twiga Foods or Agri-Wallet — guaranteed buyers reduce your income risk significantly.", sw:"Usimamizi mzuri wa shamba. Chunguza kilimo cha mkataba na Twiga Foods au Agri-Wallet — wanunuzi waliohakikishiwa hupunguza hatari ya mapato yako sana." },
  "Struggling Entrepreneur_1":{ en:"Business crisis. Separate business and personal money immediately using Pochi La Biashara — free on M-PESA. Stop all credit sales this week. Cash only until stable.", sw:"Dharura ya biashara. Tenganisha pesa za biashara na za kibinafsi mara moja ukitumia Pochi La Biashara. Simamisha mauzo yote ya mkopo wiki hii." },
  "Struggling Entrepreneur_2":{ en:"Cash flow is the problem, not revenue. Use Pochi La Biashara. Invoice clients immediately. Pay yourself a fixed salary, not whatever is left.", sw:"Mtiririko wa pesa ndio tatizo. Tumia Pochi La Biashara. Tuma bili kwa wateja mara moja. Jilipe mshahara maalum, si kilichobaki tu." },
  "Struggling Entrepreneur_3":{ en:"Business is stabilising. Build a 30-day cash reserve equal to one month of fixed costs. Track your 3 highest-margin products and focus on those.", sw:"Biashara inaimarika. Jenga akiba ya pesa ya siku 30 sawa na gharama za mwezi mmoja wa kudumu. Fuatilia bidhaa 3 zenye faida kubwa zaidi." },
  "Struggling Entrepreneur_4":{ en:"Business is growing well. Consider a Stawi business loan (from KES 30,000 at 9% p.a.) for expansion. Register for VAT if turnover exceeds KES 5M/year.", sw:"Biashara inakua vizuri. Fikiria mkopo wa Stawi (kutoka KES 30,000 kwa 9% kwa mwaka) kwa upanuzi. Jisajili VAT ikiwa mauzo yanazidi KES 5M/mwaka." },
};

const TIER_CONFIG = {
  CRISIS:   { icon:"◈", color:"#E53E3E", label:"Crisis / Dharura" },
  STRESSED: { icon:"◉", color:"#D69E2E", label:"Stressed / Msongo" },
  COPING:   { icon:"◎", color:"#DD6B20", label:"Coping / Inakwenda" },
  STABLE:   { icon:"●", color:"#38A169", label:"Stable / Imara" },
};

// ═══════════════════════════════════════════════════════════════════════════
// BUDGET FRAMEWORK — Kenya informal sector (NOT standard 50/30/20)
// ═══════════════════════════════════════════════════════════════════════════
const BUDGET_FRAMEWORK = {
  CRISIS: {
    needs:90, savings:5, debt:5, wants:0, color:"#E53E3E",
    title:"Survival Budget · Bajeti ya Kuokoka",
    description:"Your spending exceeds your income. Every shilling counts.",
    descSw:"Matumizi yako yanazidi mapato. Kila shilingi ina maana.",
    savings_action:"Lock KES 50 in M-Shwari FIRST every day — before anything else.",
    savings_actionSw:"Funga KES 50 M-Shwari KWANZA kila siku — kabla ya chochote kingine.",
    debt_action:"Contact Tala/Branch to restructure. Do not take new loans — this deepens the crisis.",
    debt_actionSw:"Wasiliana na Tala/Branch kupanga upya. Usichukue mikopo mipya.",
    needs_action:"Cut one expense this week — airtime, eating out, or subscriptions.",
    needs_actionSw:"Kata gharama moja wiki hii — airtime, kula nje, au michango.",
  },
  STRESSED: {
    needs:70, savings:10, debt:15, wants:5, color:"#D69E2E",
    title:"Tight Budget · Bajeti Ngumu",
    description:"You are covering basics but one shock can break you.",
    descSw:"Unashughulikia mahitaji ya msingi lakini mshtuko mmoja unaweza kukuvunja.",
    savings_action:"Save KES 100/day in M-Shwari before any other spending.",
    savings_actionSw:"Weka KES 100/siku M-Shwari kabla ya kutumia chochote kingine.",
    debt_action:"Pay highest-interest debt first. Fuliza daily = debt spiral.",
    debt_actionSw:"Lipa deni lenye riba nyingi zaidi kwanza. Fuliza kila siku = mzunguko wa deni.",
    needs_action:"Track your top 3 expenses this week — find what can be reduced.",
    needs_actionSw:"Fuatilia gharama zako 3 kubwa wiki hii — tafuta inayoweza kupunguzwa.",
  },
  COPING: {
    needs:60, savings:20, debt:10, wants:10, color:"#DD6B20",
    title:"Balanced Budget · Bajeti ya Usawa",
    description:"You are stable — now build resilience.",
    descSw:"Una utulivu — sasa jenga nguvu.",
    savings_action:"Target KES 200/day in M-Shwari. Register for SHA this month (KES 500/month).",
    savings_actionSw:"Lenga KES 200/siku M-Shwari. Jisajili SHA mwezi huu (KES 500/mwezi).",
    debt_action:"Reduce Fuliza to below 2 draws/day. Each draw costs 5% interest.",
    debt_actionSw:"Punguza Fuliza chini ya mara 2/siku. Kila mkopo unakugharimu riba ya 5%.",
    needs_action:"Review rent — it should not exceed 25% of your income.",
    needs_actionSw:"Kagua kodi — haipaswi kuzidi 25% ya mapato yako.",
  },
  STABLE: {
    needs:50, savings:25, debt:5, wants:20, color:"#38A169",
    title:"Growth Budget · Bajeti ya Ukuaji",
    description:"You have a buffer — now grow it.",
    descSw:"Una akiba — sasa ikuze.",
    savings_action:"Diversify: M-Shwari for emergencies + Chama/SACCO for growth. Consider KNEST pension.",
    savings_actionSw:"Tofautisha: M-Shwari kwa dharura + Chama/SACCO kwa ukuaji. Fikiria pensheni ya KNEST.",
    debt_action:"No active debt? Use that 5% to invest — Hustler Fund builds credit to KES 50,000.",
    debt_actionSw:"Huna deni? Tumia asilimia 5 hiyo kuwekeza — Hustler Fund inajenga mkopo hadi KES 50,000.",
    needs_action:"Needs under 50%? Invest surplus in income-generating skills or tools.",
    needs_actionSw:"Mahitaji chini ya 50%? Wekeza ziada katika ujuzi unaozalisha mapato.",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS ENGINE
// Ported from MVP with dominant-month filter and proper balance handling
// ═══════════════════════════════════════════════════════════════════════════
function computeFeatures(transactions) {
  if (!transactions || transactions.length === 0) return null;

  // PDF txns have a receipt field; manual entries do not
  const pdfTxns    = transactions.filter(t => t.receipt);
  const manualTxns = transactions.filter(t => !t.receipt);

  // Use PDF transactions as primary dataset; fall back to manual
  const primaryTxns = pdfTxns.length > 0 ? pdfTxns : manualTxns;
  const txns = primaryTxns.map(t => ({ ...t, amount: parseFloat(t.amount) || 0 }));

  const LOAN_CATS = new Set(["digital_loan_received","fuliza_draw","mshwari_withdrawal",
    "sacco_withdrawal","chama_withdrawal","other","reversal","daily_micro_income"]);
  const DEBT_CATS = new Set(["digital_loan_repayment","fuliza_repayment","mshwari_deposit",
    "sacco_contribution","chama_contribution"]);

  // ── DOMINANT-MONTH FILTER (from MVP) ─────────────────────────────────
  // Find the months with most transactions — this is the real statement period.
  // Prevents manually-added entries with today's date from polluting historical stats.
  const monthCounts = {};
  txns.forEach(t => {
    const m = (t.date || "").slice(0, 7);
    if (m.length === 7) monthCounts[m] = (monthCounts[m] || 0) + 1;
  });
  const dominantMonths = Object.entries(monthCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([m]) => m);

  const byDate = {};
  txns.forEach(t => {
    const d = (t.date || "").slice(0, 10);
    if (!d || d.length < 10) return;
    const yr = parseInt(d.slice(0, 4));
    if (yr < 2015 || yr > 2030) return;
    if (dominantMonths.length > 0 && !dominantMonths.includes(d.slice(0, 7))) return;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  const days = Object.keys(byDate).sort();
  if (days.length === 0) return null;

  // ── INCOME ────────────────────────────────────────────────────────────
  const dailyEarned = days.map(d =>
    byDate[d].filter(t => t.amount > 0 && !LOAN_CATS.has(t.category))
      .reduce((s, t) => s + t.amount, 0)
  );
  const earningDays = dailyEarned.filter(v => v >= 10);
  const incomeMean  = earningDays.length > 0 ? earningDays.reduce((a, b) => a + b, 0) / earningDays.length : 0;
  const incomeStd   = earningDays.length > 1
    ? Math.sqrt(earningDays.reduce((s, v) => s + Math.pow(v - incomeMean, 2), 0) / earningDays.length) : 0;
  const incomeCV    = incomeMean > 0 ? incomeStd / incomeMean : 0;
  const earnDaysPct = earningDays.length / Math.max(days.length, 1);

  // ── INCOME GAP ────────────────────────────────────────────────────────
  const earnDates = days.filter((_, i) => dailyEarned[i] > 0);
  let incomeGapMax = 0;
  for (let i = 1; i < earnDates.length; i++) {
    const gap = (new Date(earnDates[i]) - new Date(earnDates[i-1])) / 86400000;
    if (gap > incomeGapMax) incomeGapMax = gap;
  }

  // ── BALANCE ───────────────────────────────────────────────────────────
  const endBalances = days.map(d => {
    const dt = byDate[d];
    return dt[dt.length - 1].balance || 0;
  });
  const balMean = endBalances.reduce((a, b) => a + b, 0) / endBalances.length;
  const pctZero = endBalances.filter(b => b <= 50).length / endBalances.length;

  // ── FULIZA ────────────────────────────────────────────────────────────
  const fulizaTxns  = txns.filter(t => t.category === "fuliza_draw" || /fuliza/i.test(t.description || ""));
  const fulizaPerDay = fulizaTxns.length / Math.max(days.length, 1);

  // ── SPEND RATIO ───────────────────────────────────────────────────────
  const totalEarned = earningDays.reduce((a, b) => a + b, 0);
  const totalSpent  = txns.filter(t => t.amount < 0 && !DEBT_CATS.has(t.category))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const spendRatio  = totalEarned > 0 ? totalSpent / totalEarned : 1.0;

  // ── DEBT ──────────────────────────────────────────────────────────────
  const debtPayments  = txns.filter(t => DEBT_CATS.has(t.category));
  const totalDebtPaid = debtPayments.reduce((s, t) => s + Math.abs(t.amount), 0);
  const debtScore     = (totalSpent + totalDebtPaid) > 0 ? totalDebtPaid / (totalSpent + totalDebtPaid) : 0;
  const loanReceived  = txns.filter(t => ["digital_loan_received","fuliza_draw"].includes(t.category))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const estimatedDebt = Math.max(0, loanReceived - totalDebtPaid);

  // ── SAVINGS DETECTION ─────────────────────────────────────────────────
  const hasMshwari = txns.some(t => /mshwari/i.test(t.description || "")) ? 1 : 0;
  const hasSacco   = txns.some(t => /sacco/i.test(t.description || "")) ? 1 : 0;
  const hasChama   = txns.some(t => /chama/i.test(t.description || "")) ? 1 : 0;

  // ── SEASONALITY ───────────────────────────────────────────────────────
  const monthlyIncome = {};
  txns.filter(t => t.amount > 0 && !LOAN_CATS.has(t.category)).forEach(t => {
    const m = (t.date || "").slice(0, 7);
    if (m) monthlyIncome[m] = (monthlyIncome[m] || 0) + t.amount;
  });
  const monthVals = Object.values(monthlyIncome);
  const monthMean = monthVals.length > 0 ? monthVals.reduce((a, b) => a + b, 0) / monthVals.length : 0;

  // ── RECENT 7 DAYS (from manual entries only) ─────────────────────────
  const cutoff7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const recentEarned = manualTxns
    .filter(t => t.date >= cutoff7 && parseFloat(t.amount) > 0 && !LOAN_CATS.has(t.category))
    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const recentSaved = manualTxns
    .filter(t => t.date >= cutoff7 && t.category === "mshwari_deposit")
    .reduce((s, t) => s + Math.abs(parseFloat(t.amount || 0)), 0);
  const recentDays = new Set(manualTxns.filter(t => t.date >= cutoff7).map(t => t.date)).size;

  return {
    income_mean:     Math.round(incomeMean),
    income_cv:       parseFloat(incomeCV.toFixed(3)),
    income_gap_max:  incomeGapMax,
    earn_days_pct:   parseFloat(earnDaysPct.toFixed(3)),
    bal_mean:        Math.round(balMean),
    pct_zero_bal:    parseFloat(pctZero.toFixed(3)),
    spend_ratio:     parseFloat(spendRatio.toFixed(3)),
    fuliza_per_day:  parseFloat(fulizaPerDay.toFixed(2)),
    debt_stack_score:parseFloat(debtScore.toFixed(3)),
    estimated_debt:  Math.round(estimatedDebt),
    has_mshwari:     hasMshwari,
    has_sacco:       hasSacco,
    has_chama:       hasChama,
    total_earned:    Math.round(totalEarned),
    total_spent:     Math.round(totalSpent),
    monthly_mean:    Math.round(monthMean),
    n_days:          days.length,
    has_pdf:         pdfTxns.length > 0 ? 1 : 0,
    manual_count:    manualTxns.length,
    recent_earned:   Math.round(recentEarned),
    recent_saved:    Math.round(recentSaved),
    recent_days:     recentDays,
  };
}

function classifyTier(features, persona) {
  if (!features) return { tier:"COPING", num:3 };
  const { pct_zero_bal, fuliza_per_day, bal_mean, spend_ratio, earn_days_pct,
          debt_stack_score, income_gap_max } = features;
  if (persona === "Agricultural Worker") {
    if (pct_zero_bal > 0.50 && fuliza_per_day > 1.5) return { tier:"CRISIS",   num:1 };
    if (pct_zero_bal > 0.35 || fuliza_per_day > 1.0) return { tier:"STRESSED", num:2 };
    if (bal_mean > 3000 && income_gap_max < 40)       return { tier:"STABLE",   num:4 };
    return { tier:"COPING", num:3 };
  }
  if (pct_zero_bal > 0.60 && (fuliza_per_day > 3.0 || debt_stack_score > 0.4))
    return { tier:"CRISIS", num:1 };
  if (pct_zero_bal > 0.30 || fuliza_per_day > 2.0 || spend_ratio > 1.15 || debt_stack_score > 0.25)
    return { tier:"STRESSED", num:2 };
  if (pct_zero_bal < 0.08 && bal_mean > 3000 && earn_days_pct > 0.65 && spend_ratio < 0.85)
    return { tier:"STABLE", num:4 };
  return { tier:"COPING", num:3 };
}

function getCoaching(persona, tierNum) {
  return COACHING_DB[`${persona}_${tierNum}`] || {
    en:"Focus on building a 30-day income buffer and reducing debt step by step.",
    sw:"Zingatia kujenga akiba ya siku 30 na kupunguza madeni hatua kwa hatua.",
  };
}

// Tier progression steps — from MVP
function getTierProgression(features, num) {
  if (!features) return null;
  const { pct_zero_bal, fuliza_per_day, bal_mean, spend_ratio, has_mshwari, has_sha } = features;
  const steps = {
    1: [
      { done: bal_mean > 200,       en:"Build KES 500 M-PESA balance",           sw:"Jenga salio la KES 500 M-PESA" },
      { done: fuliza_per_day < 3,   en:"Reduce Fuliza below 3 draws/day",         sw:"Punguza Fuliza chini ya mara 3/siku" },
      { done: spend_ratio < 1.2,    en:"Stop spending more than you earn",         sw:"Acha kutumia zaidi ya unavyopata" },
    ],
    2: [
      { done: pct_zero_bal < 0.30,  en:"Keep balance above zero most days",        sw:"Dumisha salio juu ya sifuri siku nyingi" },
      { done: fuliza_per_day < 1.5, en:"Reduce Fuliza below 1.5 draws/day",        sw:"Punguza Fuliza chini ya mara 1.5/siku" },
      { done: has_mshwari === 1,    en:"Open an M-Shwari savings account",         sw:"Fungua akaunti ya akiba ya M-Shwari" },
    ],
    3: [
      { done: pct_zero_bal < 0.08,  en:"Near-zero balance days below 8%",          sw:"Siku za salio karibu na sifuri chini ya 8%" },
      { done: bal_mean > 3000,      en:"Maintain average balance above KES 3,000", sw:"Dumisha salio la wastani zaidi ya KES 3,000" },
      { done: (has_sha || 0) === 1, en:"Register for SHA health cover",            sw:"Jisajili bima ya afya ya SHA" },
    ],
    4: null,
  };
  return steps[num] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const S = {
  app:        { minHeight:"100vh", background:"#0A1628", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#F0F4F8" },
  card:       { background:"#0F1F35", borderRadius:16, border:"1px solid #1E3A5F", padding:24 },
  input:      { width:"100%", background:"#0A1628", border:"1px solid #1E3A5F", borderRadius:10, padding:"12px 16px", color:"#F0F4F8", fontSize:15, outline:"none", boxSizing:"border-box" },
  select:     { width:"100%", background:"#0A1628", border:"1px solid #1E3A5F", borderRadius:10, padding:"12px 16px", color:"#F0F4F8", fontSize:15, outline:"none", boxSizing:"border-box" },
  btnGreen:   { background:"linear-gradient(135deg,#00C875 0%,#00A35C 100%)", color:"#fff", border:"none", borderRadius:10, padding:"14px 28px", fontSize:15, fontWeight:600, cursor:"pointer", width:"100%" },
  btnOutline: { background:"transparent", color:"#00C875", border:"1px solid #00C875", borderRadius:10, padding:"12px 24px", fontSize:14, fontWeight:600, cursor:"pointer" },
  label:      { fontSize:12, color:"#7A9CC0", marginBottom:6, display:"block", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.05em" },
  tag:        { display:"inline-block", padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:600 },
};

// ═══════════════════════════════════════════════════════════════════════════
// WELCOME SCREEN
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
          {["🔒 Secure","🇰🇪 Kenya-built","🌍 Bilingual","📊 AI-powered"].map(t => (
            <span key={t} style={{ ...S.tag, background:"#0F1F35", color:"#7A9CC0", border:"1px solid #1E3A5F" }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function LoginScreen({ onSuccess, onBack }) {
  const [phone, setPhone]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

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
            <label style={S.label} htmlFor="login-phone">Phone Number / Nambari ya Simu</label>
            <input id="login-phone" name="phone" style={S.input} placeholder="07XX XXX XXX" value={phone}
              onChange={e => { setPhone(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={S.label} htmlFor="login-password">Password / Nywila</label>
            <input id="login-password" name="password" style={S.input} type="password" placeholder="Your password" value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
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
// REGISTER SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function RegisterScreen({ onSuccess, onBack }) {
  const [step, setStep]                   = useState(1);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [error, setError]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [form, setForm] = useState({
    phone:"", name:"", password:"", job_title:"", persona:"",
    is_married:false, n_kids:0, monthly_rent:0,
    savings_type:"none", borrowing_habit:"emergency_only", fuliza_attitude:"pragmatic",
    has_sha:false, has_nssf:false, sends_remittance:false, remittance_amount:0, tithe_amount:0,
  });
  const update = (k, v) => setForm(f => ({ ...f, [k]:v }));

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
          {steps.map((s, i) => (
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
                <label style={S.label} htmlFor="reg-name">Full Name / Jina Lako</label>
                <input id="reg-name" name="name" style={S.input} placeholder="e.g. Wanjiku Kamau" value={form.name} onChange={e => update("name", e.target.value)} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={S.label} htmlFor="reg-phone">Phone Number (M-PESA)</label>
                <input id="reg-phone" name="phone" style={S.input} placeholder="07XX XXX XXX" value={form.phone} onChange={e => update("phone", e.target.value)} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={S.label} htmlFor="reg-password">Password / Nywila (min 6 characters)</label>
                <input id="reg-password" name="password" style={S.input} type="password" placeholder="Create a password" value={form.password} onChange={e => update("password", e.target.value)} />
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
                    {OCCUPATION_GROUPS.map((group, i) => (
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
                      {OCCUPATION_GROUPS[selectedGroup].jobs.map((job, j) => (
                        <button key={j} onClick={() => { update("job_title", job); update("persona", OCCUPATION_GROUPS[selectedGroup].persona); setSelectedGroup(null); }} style={{ background:"#0A1628", border:"1px solid #1E3A5F", borderRadius:8, padding:"10px 14px", textAlign:"left", cursor:"pointer", color:"#F0F4F8", fontSize:13 }}>{job}</button>
                      ))}
                      <input style={{ ...S.input, fontSize:13, marginTop:4 }} placeholder="My job is not listed / Kazi yangu haipo hapa..."
                        onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) { update("job_title", e.target.value.trim()); update("persona", OCCUPATION_GROUPS[selectedGroup].persona); setSelectedGroup(null); }}} />
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
                  {["Single","Married"].map(m => (
                    <button key={m} onClick={() => update("is_married", m === "Married")} style={{ flex:1, padding:12, borderRadius:10, border:`2px solid ${form.is_married===(m==="Married")?"#00C875":"#1E3A5F"}`, background:form.is_married===(m==="Married")?"#003D20":"#0A1628", color:"#F0F4F8", cursor:"pointer" }}>{m}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={S.label} htmlFor="n-kids">Number of Children / Watoto · {form.n_kids}</label>
                <input id="n-kids" name="n_kids" type="range" min={0} max={8} value={form.n_kids} onChange={e => update("n_kids", parseInt(e.target.value))} style={{ width:"100%", accentColor:"#00C875" }} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#4A6A8A", marginTop:4 }}><span>0</span><span>8</span></div>
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={S.label} htmlFor="monthly-rent">Monthly Rent (KES) / Kodi ya Mwezi</label>
                <input id="monthly-rent" name="monthly_rent" style={S.input} type="number" placeholder="0 if rent-free" value={form.monthly_rent || ""} onChange={e => update("monthly_rent", parseInt(e.target.value) || 0)} />
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
                <label style={S.label} htmlFor="savings-type">Savings Method</label>
                <select id="savings-type" name="savings_type" style={S.select} value={form.savings_type} onChange={e => update("savings_type", e.target.value)}>
                  {SAVINGS_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={S.label} htmlFor="borrow-habit">Borrowing Habit / Tabia ya Kukopa</label>
                <select id="borrow-habit" name="borrowing_habit" style={S.select} value={form.borrowing_habit} onChange={e => update("borrowing_habit", e.target.value)}>
                  {BORROW_HABITS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={S.label} htmlFor="fuliza-att">Fuliza Attitude / Mtazamo wa Fuliza</label>
                <select id="fuliza-att" name="fuliza_attitude" style={S.select} value={form.fuliza_attitude} onChange={e => update("fuliza_attitude", e.target.value)}>
                  {FULIZA_ATTITUDES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:24, display:"flex", gap:16 }}>
                {[["SHA Health Cover","has_sha"],["NSSF Member","has_nssf"]].map(([label, key]) => (
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
                  <label style={S.label} htmlFor="remittance-amt">Monthly remittance amount (KES)</label>
                  <input id="remittance-amt" name="remittance_amount" style={S.input} type="number" placeholder="e.g. 1500" value={form.remittance_amount || ""} onChange={e => update("remittance_amount", parseInt(e.target.value) || 0)} />
                </div>
              )}
              <div style={{ marginBottom:24 }}>
                <label style={S.label} htmlFor="tithe-amt">Weekly Church Tithe (KES) · Zaka ya Wiki</label>
                <input id="tithe-amt" name="tithe_amount" style={S.input} type="number" placeholder="0 if none" value={form.tithe_amount || ""} onChange={e => update("tithe_amount", parseInt(e.target.value) || 0)} />
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
        <input id={id} name={id} style={{ ...S.input, paddingLeft:48, borderColor:value && value !== "0" ? color : "#1E3A5F" }}
          type="number" inputMode="decimal" placeholder="0" value={value} onChange={e => onChange(e.target.value)} />
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
  const [date,      setDate]      = useState(today);
  const [earned,    setEarned]    = useState("");
  const [spent,     setSpent]     = useState("");
  const [saved,     setSaved]     = useState("");
  const [loanRepay, setLoanRepay] = useState("");
  const [borrowed,  setBorrowed]  = useState("");
  const [earnFrom,  setEarnFrom]  = useState("daily_work");
  const [error,     setError]     = useState("");

  const handleSave = () => {
    const e = parseFloat(earned)||0, s = parseFloat(spent)||0,
          sv = parseFloat(saved)||0, lr = parseFloat(loanRepay)||0,
          b = parseFloat(borrowed)||0;
    if (e===0&&s===0&&sv===0&&lr===0&&b===0) { setError("Enter at least one amount / Ingiza kiasi kimoja angalau"); return; }
    const base = Date.now();
    const txns = [];
    if (e  > 0) txns.push({ id:`m_${base}`,   date, amount:e,   balance:0, category:earnFrom,                 description:"Daily entry",         source:"manual" });
    if (s  > 0) txns.push({ id:`m_${base+1}`, date, amount:-s,  balance:0, category:"daily_spending",         description:"Daily spending",       source:"manual" });
    if (sv > 0) txns.push({ id:`m_${base+2}`, date, amount:-sv, balance:0, category:"mshwari_deposit",        description:"Saved today",          source:"manual" });
    if (lr > 0) txns.push({ id:`m_${base+3}`, date, amount:-lr, balance:0, category:"digital_loan_repayment", description:"Loan repayment today", source:"manual" });
    if (b  > 0) txns.push({ id:`m_${base+4}`, date, amount:b,   balance:0, category:"digital_loan_received",  description:"Borrowed today",       source:"manual" });
    txns.forEach(t => onSave(t));
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"flex-end", zIndex:1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:"100%", maxWidth:480, margin:"0 auto", background:"#0F1F35", borderRadius:"20px 20px 0 0", padding:"24px 24px 32px", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ fontWeight:700, color:"#F0F4F8", fontSize:17 }}>Today's Summary · Muhtasari wa Leo</div>
            <div style={{ color:"#4A6A8A", fontSize:12, marginTop:4 }}>How did your day go? / Siku yako ya fedha ilikuwa vipi?</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", fontSize:22, lineHeight:1, padding:"0 0 0 16px" }}>✕</button>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={S.label} htmlFor="entry-date">Date / Tarehe</label>
          <input id="entry-date" name="entry_date" style={S.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <DailyField id="de-earned"    label="How much did you earn?"    labelSw="Ulipata kiasi gani?"       value={earned}    onChange={setEarned}    color="#00C87566" />
        {parseFloat(earned) > 0 && (
          <div style={{ marginBottom:16, marginTop:-8 }}>
            <label style={S.label} htmlFor="earn-source">Main source / Chanzo kikuu cha mapato</label>
            <select id="earn-source" name="earn_source" style={S.select} value={earnFrom} onChange={e => setEarnFrom(e.target.value)}>
              {EARN_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
        <DailyField id="de-spent"     label="How much did you spend?"   labelSw="Ulitumia kiasi gani?"      value={spent}     onChange={setSpent}     color="#E53E3E66" />
        <DailyField id="de-saved"     label="Did you save anything?"    labelSw="Uliweka akiba yoyote?"     value={saved}     onChange={setSaved}     color="#3182CE66" />
        <DailyField id="de-loanrepay" label="Any loan repayment today?" labelSw="Ulirudisha mkopo wowote?"  value={loanRepay} onChange={setLoanRepay} color="#E53E3E66" />
        <DailyField id="de-borrowed"  label="Did you borrow anything?"  labelSw="Ulikopa chochote?"         value={borrowed}  onChange={setBorrowed}  color="#D69E2E66" />
        {error && <p style={{ color:"#E53E3E", fontSize:13, marginBottom:12, marginTop:-8 }}>{error}</p>}
        <button style={{ ...S.btnGreen, marginTop:8 }} onClick={handleSave}>Save Day · Hifadhi Siku</button>
        <p style={{ color:"#4A6A8A", fontSize:11, textAlign:"center", marginTop:12, lineHeight:1.5 }}>
          For full transaction history, use Import PDF · Kwa historia kamili, tumia Ingiza PDF
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BALANCE SPARKLINE
// ═══════════════════════════════════════════════════════════════════════════
function BalanceSparkline({ transactions }) {
  if (!transactions || transactions.length === 0) return null;
  const pdfTxns = transactions.filter(t => t.receipt);
  if (pdfTxns.length === 0) return null;
  const byDate = {};
  pdfTxns.forEach(t => { const d = (t.date||"").slice(0,10); if (d && d.length===10) byDate[d] = parseFloat(t.balance)||0; });
  const days = Object.keys(byDate).sort().slice(-30);
  if (days.length < 3) return null;
  const vals = days.map(d => byDate[d]||0);
  const max = Math.max(...vals,1), min = Math.min(...vals,0), range = max-min||1;
  const W=300, H=60, pad=4;
  const points = vals.map((v,i) => { const x=pad+(i/(vals.length-1))*(W-pad*2); const y=H-pad-((v-min)/range)*(H-pad*2); return `${x},${y}`; }).join(" ");
  const hasNeg = vals.some(v => v<0), zeroY = H-pad-((0-min)/range)*(H-pad*2);
  return (
    <div style={{ ...S.card, marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
        <div style={{ fontSize:11, color:"#4A6A8A", fontWeight:600 }}>BALANCE TREND · MWELEKEO WA SALIO (30 days)</div>
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
function Dashboard({ user, transactions, features, tier, num, onAddTxn, onViewLogs, onUpload, onBudget, onLogout }) {
  const tierCfg  = TIER_CONFIG[tier];
  const coaching = getCoaching(user.persona, num);
  const [lang, setLang] = useState("en");
  const recentTxns = [...transactions].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,5);
  const hasRecent  = features && features.recent_days > 0;

  const stats = features ? [
    { label:"Avg Daily Income", labelSw:"Mapato ya Wastani",  value:`KES ${features.income_mean.toLocaleString()}` },
    { label:"Avg Balance",      labelSw:"Salio la Wastani",   value:`KES ${features.bal_mean.toLocaleString()}` },
    { label:"Earning Days",     labelSw:"Siku za Mapato",     value:`${(features.earn_days_pct*100).toFixed(0)}%` },
    { label:"Fuliza / day",     labelSw:"Fuliza / siku",      value:features.fuliza_per_day.toFixed(1) },
  ] : [];

  const progression = features ? getTierProgression(features, num) : null;

  return (
    <div style={{ minHeight:"100vh", background:"#0A1628", padding:"0 0 80px" }}>
      {/* Header */}
      <div style={{ background:"#0F1F35", borderBottom:"1px solid #1E3A5F", padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ color:"#00C875", fontWeight:700, fontSize:18 }}>◈ InFoach</div>
          <div style={{ color:"#7A9CC0", fontSize:13 }}>Habari, {(user.name||"").split(" ")[0]}</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={() => setLang(l => l==="en"?"sw":"en")} style={{ ...S.tag, background:"#1E3A5F", color:"#7A9CC0", border:"none", cursor:"pointer" }}>
            {lang==="en"?"🇰🇪 SW":"🇬🇧 EN"}
          </button>
          <button onClick={onLogout} style={{ background:"none", border:"none", color:"#4A6A8A", cursor:"pointer", fontSize:13 }}>Sign out</button>
        </div>
      </div>

      <div style={{ padding:"20px 16px", maxWidth:540, margin:"0 auto" }}>
        {/* Health Tier Card */}
        <div style={{ ...S.card, borderColor:tierCfg.color+"44", marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:28, color:tierCfg.color, marginBottom:4 }}>{tierCfg.icon}</div>
              <div style={{ fontSize:22, fontWeight:700, color:tierCfg.color }}>{tierCfg.label}</div>
              <div style={{ color:"#7A9CC0", fontSize:13, marginTop:4 }}>{user.persona}{user.job_title ? ` · ${user.job_title}` : ""}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:11, color:"#4A6A8A" }}>HEALTH SCORE</div>
              <div style={{ fontSize:36, fontWeight:700, color:tierCfg.color }}>{num===4?"A":num===3?"B":num===2?"C":"D"}</div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        {features && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
            {stats.map(s => (
              <div key={s.label} style={S.card}>
                <div style={{ fontSize:11, color:"#4A6A8A", marginBottom:4 }}>{lang==="en"?s.label:s.labelSw}</div>
                <div style={{ fontSize:20, fontWeight:700, color:"#F0F4F8" }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Recent 7-day Activity */}
        {hasRecent && (
          <div style={{ ...S.card, marginBottom:16, borderLeft:"4px solid #534AB7" }}>
            <div style={{ fontSize:11, color:"#534AB7", fontWeight:600, marginBottom:10 }}>
              RECENT ACTIVITY · SHUGHULI ZA HIVI KARIBUNI (7 {lang==="en"?"days":"siku"})
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                { label:"Earned (7 days)", labelSw:"Mapato (siku 7)", value:`KES ${(features.recent_earned||0).toLocaleString()}` },
                { label:"Saved (7 days)",  labelSw:"Akiba (siku 7)",  value:`KES ${(features.recent_saved||0).toLocaleString()}` },
              ].map(s => (
                <div key={s.label} style={{ background:"#0A1628", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:11, color:"#4A6A8A", marginBottom:4 }}>{lang==="en"?s.label:s.labelSw}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#F0F4F8" }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, color:"#4A6A8A", marginTop:10 }}>
              {lang==="en"
                ? `${features.recent_days} day${features.recent_days>1?"s":""} logged this week. Keep going — consistency builds your score.`
                : `Siku ${features.recent_days} zimerekodiwa wiki hii. Endelea — utaratibu unaboresha alama yako.`}
            </div>
          </div>
        )}

        {/* Balance Sparkline — PDF users only */}
        {features && features.has_pdf===1 && <BalanceSparkline transactions={transactions} />}

        {/* No data prompt */}
        {!features && (
          <div style={{ ...S.card, marginBottom:16, textAlign:"center", padding:"28px 20px" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📊</div>
            <div style={{ fontWeight:600, color:"#F0F4F8", marginBottom:8 }}>{lang==="en"?"No transaction data yet":"Bado hakuna data ya miamala"}</div>
            <div style={{ color:"#7A9CC0", fontSize:13, lineHeight:1.6, marginBottom:16 }}>
              {lang==="en"
                ? "Add today's income and spending using the + button, or import your M-PESA statement PDF for a full financial picture."
                : "Ongeza mapato na matumizi ya leo kwa kutumia kitufe cha +, au ingiza PDF ya taarifa yako ya M-PESA."}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button style={{ ...S.btnOutline, flex:1, fontSize:13 }} onClick={onUpload}>📄 {lang==="en"?"Import PDF":"Ingiza PDF"}</button>
              <button style={{ ...S.btnGreen, flex:1, fontSize:13 }} onClick={onAddTxn}>+ {lang==="en"?"Log Today":"Rekodi Leo"}</button>
            </div>
          </div>
        )}

        {/* Coaching Card */}
        <div style={{ ...S.card, borderLeft:"4px solid #00C875", marginBottom:16 }}>
          <div style={{ fontSize:11, color:"#00C875", marginBottom:10, fontWeight:600 }}>◈ COACHING · USHAURI</div>
          <p style={{ color:"#F0F4F8", lineHeight:1.6, margin:0, fontSize:14 }}>{lang==="en"?coaching.en:coaching.sw}</p>
          {!features && (
            <p style={{ color:"#4A6A8A", fontSize:12, marginTop:12, marginBottom:0 }}>
              Add transactions to get personalised coaching · Ingiza miamala kupata ushauri
            </p>
          )}
        </div>

        {/* Tier Progression Card */}
        {progression && num !== 4 && (() => {
          const nextLabels = { 1:"STRESSED", 2:"COPING", 3:"STABLE" };
          const nextLabel  = nextLabels[num] || "STABLE";
          const done       = progression.filter(s => s.done).length;
          return (
            <div style={{ ...S.card, marginBottom:16, borderLeft:"4px solid #3182CE" }}>
              <div style={{ fontSize:11, color:"#3182CE", fontWeight:600, marginBottom:10 }}>
                PATH TO {nextLabel} · NJIA YA {nextLabel}
              </div>
              <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                {progression.map((_, i) => (
                  <div key={i} style={{ flex:1, height:4, borderRadius:2, background:i < done ? "#3182CE" : "#1E3A5F" }} />
                ))}
              </div>
              {progression.map((step, i) => (
                <div key={i} style={{ display:"flex", gap:10, marginBottom:8, alignItems:"flex-start" }}>
                  <div style={{ width:20, height:20, borderRadius:"50%", background:step.done?"#003D20":"#0A1628", border:`2px solid ${step.done?"#00C875":"#1E3A5F"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:11, color:step.done?"#00C875":"#4A6A8A" }}>
                    {step.done ? "✓" : (i+1)}
                  </div>
                  <div style={{ fontSize:13, color:step.done?"#7A9CC0":"#F0F4F8", textDecoration:step.done?"line-through":"none", lineHeight:1.4 }}>
                    {lang==="en"?step.en:step.sw}
                  </div>
                </div>
              ))}
              <div style={{ fontSize:12, color:"#4A6A8A", marginTop:4 }}>
                {done}/{progression.length} {lang==="en"?"steps completed":"hatua zimekamilika"}
              </div>
            </div>
          );
        })()}

        {/* SHA Alert */}
        {!user.has_sha && num >= 2 && (
          <div style={{ ...S.card, borderLeft:"4px solid #D69E2E", marginBottom:16, background:"#1A1500" }}>
            <div style={{ fontSize:13, color:"#D69E2E", fontWeight:600, marginBottom:6 }}>ℹ️ No SHA Health Cover</div>
            <p style={{ color:"#A08020", fontSize:13, margin:0, lineHeight:1.5 }}>
              {lang==="en"
                ? "One hospital visit can wipe months of savings. Register at any Huduma Centre — KES 500/month."
                : "Ziara moja ya hospitali inaweza futa akiba yako. Jisajili Huduma Centre — KES 500/mwezi."}
            </p>
          </div>
        )}

        {/* Recent Transactions */}
        <div style={S.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontWeight:600, color:"#F0F4F8" }}>Recent Transactions · Miamala ya Hivi Karibuni</div>
            <button onClick={onViewLogs} style={{ background:"none", border:"none", color:"#00C875", cursor:"pointer", fontSize:13 }}>View all →</button>
          </div>
          {recentTxns.length===0 ? (
            <div style={{ textAlign:"center", padding:"24px 0", color:"#4A6A8A" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>◎</div>
              <div style={{ fontSize:14 }}>No transactions yet · Bado hakuna miamala</div>
            </div>
          ) : (
            recentTxns.map(t => (
              <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #1E3A5F" }}>
                <div>
                  <div style={{ fontSize:13, color:"#F0F4F8", marginBottom:2 }}>{(t.category||"").replace(/_/g," ")}</div>
                  <div style={{ fontSize:11, color:"#4A6A8A" }}>{t.date}{t.balance ? ` · Bal: ${parseFloat(t.balance).toLocaleString()}` : ""}</div>
                </div>
                <div style={{ fontWeight:600, color:parseFloat(t.amount)>0?"#00C875":"#E53E3E" }}>
                  {parseFloat(t.amount)>0?"+":""}KES {Math.abs(parseFloat(t.amount)).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* FAB Row */}
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
    .filter(t => filter==="all"||(filter==="income"?parseFloat(t.amount)>0:parseFloat(t.amount)<0))
    .filter(t => !search||(t.category||"").includes(search)||(t.description||"").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => new Date(b.date)-new Date(a.date));
  const totalIn  = transactions.filter(t=>parseFloat(t.amount)>0).reduce((s,t)=>s+parseFloat(t.amount),0);
  const totalOut = transactions.filter(t=>parseFloat(t.amount)<0).reduce((s,t)=>s+Math.abs(parseFloat(t.amount)),0);
  return (
    <div style={{ minHeight:"100vh", background:"#0A1628", paddingBottom:40 }}>
      <div style={{ background:"#0F1F35", borderBottom:"1px solid #1E3A5F", padding:"16px 20px", display:"flex", alignItems:"center", gap:16 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", fontSize:18 }}>←</button>
        <div>
          <div style={{ fontWeight:600, color:"#F0F4F8" }}>Transaction Log · Kumbukumbu ya Miamala</div>
          <div style={{ fontSize:12, color:"#4A6A8A" }}>{transactions.length} total transactions</div>
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
        <input style={{ ...S.input, marginBottom:10 }} placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {["all","income","expense"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ ...S.tag, background:filter===f?"#00C875":"#1E3A5F", color:filter===f?"#000":"#7A9CC0", border:"none", cursor:"pointer", padding:"8px 16px" }}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>
        {filtered.length===0 ? (
          <div style={{ textAlign:"center", padding:40, color:"#4A6A8A" }}>No transactions found</div>
        ) : (
          filtered.map(t => (
            <div key={t.id} style={{ ...S.card, marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, color:"#F0F4F8", marginBottom:2 }}>{(t.category||"").replace(/_/g," ")}</div>
                {t.description && <div style={{ fontSize:12, color:"#4A6A8A" }}>{t.description}</div>}
                <div style={{ fontSize:11, color:"#4A6A8A", marginTop:2 }}>{t.date}{t.balance ? ` · ${parseFloat(t.balance).toLocaleString()}` : ""}</div>
              </div>
              <div style={{ textAlign:"right", marginLeft:12 }}>
                <div style={{ fontWeight:700, color:parseFloat(t.amount)>0?"#00C875":"#E53E3E", fontSize:15 }}>
                  {parseFloat(t.amount)>0?"+":""}KES {Math.abs(parseFloat(t.amount)).toLocaleString()}
                </div>
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
// BUDGET ADVISOR — Interactive, from MVP architecture
// User enters income, optionally enters debt → generates full plan
// ═══════════════════════════════════════════════════════════════════════════
function BudgetAdvisor({ user, features, tier, num, lang, onBack }) {
  const framework = BUDGET_FRAMEWORK[tier] || BUDGET_FRAMEWORK.COPING;

  // Pre-fill from features if available
  const suggestedIncome = features ? features.income_mean : 0;

  const [income,   setIncome]   = useState("");
  const [hasDebt,  setHasDebt]  = useState(features && features.estimated_debt > 100);
  const [debtAmt,  setDebtAmt]  = useState(features && features.estimated_debt > 100 ? String(features.estimated_debt) : "");
  const [showPlan, setShowPlan] = useState(false);

  const parsedIncome = parseFloat(income) || suggestedIncome || 0;
  const parsedDebt   = parseFloat(debtAmt) || 0;

  // Adjust allocations if user has active debt
  const debtPct  = hasDebt && parsedDebt > 0 ? Math.min(framework.debt + 10, 25) : framework.debt;
  const savePct  = Math.max(framework.savings - (debtPct - framework.debt), 5);
  const needsPct = framework.needs;
  const wantsPct = Math.max(100 - needsPct - savePct - debtPct, 0);

  const amounts = {
    needs:   Math.round(parsedIncome * needsPct / 100),
    savings: Math.round(parsedIncome * savePct  / 100),
    debt:    Math.round(parsedIncome * debtPct  / 100),
    wants:   Math.round(parsedIncome * wantsPct / 100),
  };

  const BUCKETS = [
    { key:"needs",   icon:"🏠", label:lang==="en"?"Essential needs":"Mahitaji ya msingi",   sublabel:lang==="en"?"Food · Rent · Transport · Airtime":"Chakula · Kodi · Usafiri · Airtime",    pct:needsPct, color:"#3182CE", action:framework.needs_action,   actionSw:framework.needs_actionSw },
    { key:"savings", icon:"💰", label:lang==="en"?"Save & invest":"Akiba na uwekezaji",      sublabel:lang==="en"?"M-Shwari · Chama · SACCO":"M-Shwari · Chama · SACCO",                       pct:savePct,  color:"#00C875", action:framework.savings_action, actionSw:framework.savings_actionSw },
    { key:"debt",    icon:"📉", label:lang==="en"?"Reduce debt":"Punguza madeni",            sublabel:lang==="en"?"Fuliza · Loans · Credit":"Fuliza · Mikopo · Mkopo",                          pct:debtPct,  color:"#E53E3E", action:framework.debt_action,    actionSw:framework.debt_actionSw },
    { key:"wants",   icon:"🎯", label:lang==="en"?"Discretionary":"Matumizi ya hiari",       sublabel:lang==="en"?"Entertainment · Extras":"Burudani · Ziada",                                  pct:wantsPct, color:"#D69E2E", action:null, actionSw:null },
  ];

  const daysPerMonth   = 26;
  const monthlyIncome  = parsedIncome * daysPerMonth;

  return (
    <div style={{ minHeight:"100vh", background:"#0A1628", paddingBottom:40 }}>
      <div style={{ background:"#0F1F35", borderBottom:"1px solid #1E3A5F", padding:"16px 20px", display:"flex", alignItems:"center", gap:16 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#7A9CC0", cursor:"pointer", fontSize:18 }}>←</button>
        <div>
          <div style={{ fontWeight:700, color:"#F0F4F8", fontSize:16 }}>
            {lang==="en"?"Budget Advisor":"Mshauri wa Bajeti"} · {framework.title}
          </div>
          <div style={{ fontSize:12, color:"#4A6A8A", marginTop:2 }}>
            {lang==="en"?framework.description:framework.descSw}
          </div>
        </div>
      </div>

      <div style={{ padding:"20px 16px", maxWidth:540, margin:"0 auto" }}>
        {/* Step 1 — Income Input */}
        <div style={{ ...S.card, marginBottom:16 }}>
          <div style={{ fontSize:12, color:framework.color, fontWeight:600, marginBottom:12 }}>
            {lang==="en"?"STEP 1 — ENTER YOUR INCOME":"HATUA 1 — INGIZA MAPATO YAKO"}
          </div>
          <label style={S.label} htmlFor="budget-income">
            {lang==="en"?"How much would you like to budget for? (KES per day)":"Unataka kupanga bajeti ya kiasi gani? (KES kwa siku)"}
          </label>
          <div style={{ position:"relative", marginBottom:12 }}>
            <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"#7A9CC0", fontWeight:600 }}>KES</span>
            <input id="budget-income" name="budget_income" style={{ ...S.input, paddingLeft:48 }} type="number" inputMode="decimal"
              placeholder={suggestedIncome > 0 ? `e.g. ${Math.round(suggestedIncome)}` : "e.g. 1500 (daily amount)"}
              value={income} onChange={e => { setIncome(e.target.value); setShowPlan(false); }} />
          </div>
          {suggestedIncome > 0 && !income && (
            <button style={{ background:"#1E3A5F", border:"1px solid #2D5A8E", borderRadius:8, padding:"8px 14px", color:"#7A9CC0", cursor:"pointer", fontSize:13, marginBottom:12 }}
              onClick={() => { setIncome(String(Math.round(suggestedIncome))); setShowPlan(false); }}>
              {lang==="en"
                ? `Use your average: KES ${Math.round(suggestedIncome).toLocaleString()}/day`
                : `Tumia wastani wako: KES ${Math.round(suggestedIncome).toLocaleString()}/siku`}
            </button>
          )}
          <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", marginBottom:hasDebt ? 12 : 0 }}>
            <input type="checkbox" checked={hasDebt} onChange={e => setHasDebt(e.target.checked)}
              style={{ width:18, height:18, accentColor:"#E53E3E", cursor:"pointer" }} />
            <span style={{ fontSize:14, color:"#F0F4F8" }}>
              {lang==="en"?"I have outstanding debt (Fuliza, loans, credit)":"Nina madeni (Fuliza, mikopo, mkopo)"}
            </span>
          </label>
          {hasDebt && (
            <div style={{ marginTop:8 }}>
              <label style={S.label} htmlFor="budget-debt">{lang==="en"?"Total debt amount (KES)":"Jumla ya deni (KES)"}</label>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"#7A9CC0", fontWeight:600 }}>KES</span>
                <input id="budget-debt" name="budget_debt" style={{ ...S.input, paddingLeft:48 }} type="number" inputMode="decimal"
                  placeholder="e.g. 5000" value={debtAmt} onChange={e => { setDebtAmt(e.target.value); setShowPlan(false); }} />
              </div>
            </div>
          )}
          <button style={{ ...S.btnGreen, marginTop:16 }} onClick={() => { if (parsedIncome > 0) setShowPlan(true); }}>
            {lang==="en"?"Build My Budget Plan →":"Jenga Mpango Wangu wa Bajeti →"}
          </button>
        </div>

        {/* Step 2 — Budget Plan */}
        {showPlan && parsedIncome > 0 && (
          <>
            {/* Visual stacked bar */}
            <div style={{ ...S.card, marginBottom:16 }}>
              <div style={{ fontSize:12, color:"#7A9CC0", fontWeight:600, marginBottom:12 }}>
                {lang==="en"?"YOUR INCOME ALLOCATION":"UGAWAJI WA MAPATO YAKO"}
              </div>
              <div style={{ display:"flex", height:20, borderRadius:10, overflow:"hidden", marginBottom:16, gap:2 }}>
                {BUCKETS.filter(b => b.pct > 0).map(b => (
                  <div key={b.key} style={{ flex:b.pct, background:b.color, opacity:0.85 }} />
                ))}
              </div>
              {BUCKETS.map(b => (
                <div key={b.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"12px 0", borderBottom:"1px solid #1E3A5F" }}>
                  <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                    <div style={{ fontSize:20, lineHeight:1 }}>{b.icon}</div>
                    <div>
                      <div style={{ fontWeight:600, color:b.color, fontSize:14 }}>{b.label}</div>
                      <div style={{ fontSize:11, color:"#4A6A8A", marginTop:2 }}>{b.sublabel}</div>
                    </div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                    <div style={{ fontWeight:700, color:"#F0F4F8", fontSize:16 }}>KES {amounts[b.key].toLocaleString()}</div>
                    <div style={{ fontSize:11, color:"#4A6A8A" }}>{b.pct}% {lang==="en"?"per day":"kwa siku"}</div>
                  </div>
                </div>
              ))}
              {/* Monthly projection */}
              <div style={{ marginTop:12, padding:"10px 14px", background:"#0A1628", borderRadius:8 }}>
                <div style={{ fontSize:11, color:"#4A6A8A", marginBottom:4 }}>
                  {lang==="en"?"Monthly projection (26 working days)":"Makadirio ya mwezi (siku 26 za kazi)"}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                  {BUCKETS.filter(b => b.pct > 0).map(b => (
                    <div key={b.key} style={{ textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"#4A6A8A" }}>{b.label.split(" ")[0]}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:b.color }}>KES {(amounts[b.key] * daysPerMonth).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3 Priority Actions */}
            <div style={{ ...S.card, marginBottom:16, borderLeft:`4px solid ${framework.color}` }}>
              <div style={{ fontSize:12, color:framework.color, fontWeight:600, marginBottom:14 }}>
                {lang==="en"?"YOUR 3 PRIORITY ACTIONS THIS WEEK":"HATUA ZAKO 3 ZA KIPAUMBELE WIKI HII"}
              </div>
              {BUCKETS.filter(b => b.action).map((b, i) => (
                <div key={b.key} style={{ display:"flex", gap:12, marginBottom:14, alignItems:"flex-start" }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:b.color+"22", border:`2px solid ${b.color}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:12, color:b.color, fontWeight:700 }}>{i+1}</div>
                  <div>
                    <div style={{ fontSize:12, color:b.color, fontWeight:600, marginBottom:3 }}>{b.label.toUpperCase()}</div>
                    <div style={{ fontSize:13, color:"#F0F4F8", lineHeight:1.5 }}>{lang==="en"?b.action:b.actionSw}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Savings Milestones */}
            <div style={{ ...S.card, marginBottom:16, background:"#003D20", borderColor:"#00C87544" }}>
              <div style={{ fontSize:12, color:"#00C875", fontWeight:600, marginBottom:10 }}>
                {lang==="en"?"SAVINGS MILESTONES AT THIS RATE":"MALENGO YA AKIBA KWA KIWANGO HIKI"}
              </div>
              {[{ days:7, label:lang==="en"?"This week":"Wiki hii" },{ days:30, label:lang==="en"?"This month":"Mwezi huu" },{ days:90, label:lang==="en"?"3 months":"Miezi 3" },{ days:180, label:lang==="en"?"6 months":"Miezi 6" }].map(({ days, label }) => (
                <div key={days} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #00C87522" }}>
                  <span style={{ color:"#9FE1CB", fontSize:13 }}>{label}</span>
                  <span style={{ color:"#00C875", fontWeight:700, fontSize:14 }}>KES {(amounts.savings * days).toLocaleString()}</span>
                </div>
              ))}
              <div style={{ fontSize:11, color:"#085041", marginTop:8 }}>
                {lang==="en"
                  ? `Based on saving KES ${amounts.savings.toLocaleString()}/day (${savePct}% of income)`
                  : `Kulingana na kuweka KES ${amounts.savings.toLocaleString()}/siku (${savePct}% ya mapato)`}
              </div>
            </div>

            {/* Debt Freedom Plan */}
            {hasDebt && parsedDebt > 0 && (
              <div style={{ ...S.card, marginBottom:16, background:"#3D0000", borderColor:"#E53E3E44" }}>
                <div style={{ fontSize:12, color:"#E53E3E", fontWeight:600, marginBottom:10 }}>
                  {lang==="en"?"DEBT FREEDOM PLAN":"MPANGO WA UHURU WA DENI"}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ color:"#F09595", fontSize:13 }}>{lang==="en"?"Total debt":"Jumla ya deni"}</span>
                  <span style={{ color:"#E53E3E", fontWeight:700 }}>KES {parsedDebt.toLocaleString()}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ color:"#F09595", fontSize:13 }}>{lang==="en"?"Daily payment":"Malipo ya kila siku"}</span>
                  <span style={{ color:"#F09595", fontWeight:700 }}>KES {amounts.debt.toLocaleString()}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ color:"#F09595", fontSize:13 }}>{lang==="en"?"Days to freedom":"Siku hadi uhuru"}</span>
                  <span style={{ color:"#E53E3E", fontWeight:700, fontSize:16 }}>
                    {amounts.debt > 0 ? Math.ceil(parsedDebt / amounts.debt) : "∞"} {lang==="en"?"days":"siku"}
                  </span>
                </div>
                <div style={{ height:6, background:"#500", borderRadius:3, overflow:"hidden", marginTop:8 }}>
                  <div style={{ height:"100%", width:`${Math.min((amounts.debt*7/parsedDebt)*100, 100)}%`, background:"#E53E3E", borderRadius:3 }} />
                </div>
                <div style={{ fontSize:11, color:"#A32D2D", marginTop:6 }}>
                  {lang==="en"?"First week: ":"Wiki ya kwanza: "}
                  KES {(amounts.debt * 7).toLocaleString()} {lang==="en"?"toward debt":"kwa deni"}
                </div>
              </div>
            )}

            {/* Kenya Tools */}
            <div style={{ ...S.card, background:"#0A1628" }}>
              <div style={{ fontSize:12, color:"#00C875", fontWeight:600, marginBottom:12 }}>KENYA MONEY TOOLS</div>
              {[["M-Shwari","Free savings — no minimum balance, earns 7.35% p.a."],
                ["Fuliza","Emergency credit — but costs 1.083%/day. Use sparingly."],
                ["SACCO","Best long-term savings and loans. Rates from 12% p.a."],
                ["Hustler Fund","Govt micro-loan — repay on time to grow limit to KES 50K"],
                ["SHA","Health insurance — KES 500/month for whole household"]
              ].map(([name, tip]) => (
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
// PDF PARSER — Coordinate-based row reconstruction (from MVP)
// Uses X/Y position data from PDF.js to group text items into table rows
// then identifies: Receipt | DateTime | Details | Status | PaidIn | Withdrawn | Balance
// This reliably handles all Safaricom M-PESA statement formats
// ═══════════════════════════════════════════════════════════════════════════

const HEADER_STRINGS = new Set([
  "receipt no","completion time","details","transaction status","paid in",
  "withdraw","withdrawn","balance","n","mpesa","full statement","customer name",
  "mobile number","date of statement","statement period","summary","page",
  "receipt","status","disclaimer","safaricom","twitter","web",
]);

function isHeaderRow(tokens) {
  return tokens.some(t => HEADER_STRINGS.has(t.toLowerCase()));
}

function isReceipt(s) {
  return /^[A-Z]{2,3}[A-Z0-9]{7,9}$/.test(s) && s.length >= 9 && s.length <= 12 &&
    !HEADER_STRINGS.has(s.toLowerCase());
}

function isDateToken(s) {
  if (!s || s.length < 8) return false;
  if (/\d{4}-\d{2}-\d{2}/.test(s)) return true;
  if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return true;
  if (/\d{1,2}\s+[A-Za-z]{3}/.test(s) && /\d{4}/.test(s)) return true;
  if (/^\d{1,2}-\d{1,2}-\d{4}/.test(s)) return true;
  return false;
}

function isAmount(s) {
  return /^-?[\d,]+\.\d{2}$/.test(s) || s === "-";
}

function toNum(s) {
  if (!s || s === "-") return 0;
  return parseFloat(s.replace(/,/g,"")) || 0;
}

function parseSafaricomDate(s) {
  if (!s) return null;
  try {
    const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const yr = parseInt(iso[1]);
      if (yr >= 2015 && yr <= 2030) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
    const dmy = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) {
      const [, d, m, y] = dmy;
      const yr = parseInt(y);
      if (yr >= 2015 && yr <= 2030) return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
    const months = {jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};
    const long = s.match(/(\d{1,2})\s+([A-Za-z]{3,})[,\s]+(\d{4})/);
    if (long) {
      const m = months[long[2].slice(0,3).toLowerCase()] || "01";
      return `${long[3]}-${m}-${long[1].padStart(2,"0")}`;
    }
    const dmy2 = s.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dmy2) {
      const [, d, m, y] = dmy2;
      if (parseInt(y) > 2000) return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
  } catch (_) {}
  return null;
}

function autoCategory(desc, amount) {
  const d = (desc || "").toLowerCase();
  if (d.includes("fuliza") && amount > 0)           return "fuliza_draw";
  if (d.includes("fuliza"))                          return "fuliza_repayment";
  if (d.includes("overdraft") && amount > 0)         return "fuliza_draw";
  if (d.includes("od loan") && amount < 0)           return "fuliza_repayment";
  if (d.includes("mshwari") && amount > 0)           return "mshwari_withdrawal";
  if (d.includes("mshwari"))                         return "mshwari_deposit";
  if (d.includes("kcb mpesa") && amount > 0)         return "digital_loan_received";
  if (d.includes("tala") && amount > 0)              return "digital_loan_received";
  if (d.includes("branch") && amount > 0)            return "digital_loan_received";
  if (d.includes("okoa") && amount > 0)              return "digital_loan_received";
  if (d.includes("hustler fund") && amount > 0)      return "digital_loan_received";
  if ((d.includes("loan") || d.includes("repayment")) && amount < 0) return "digital_loan_repayment";
  if (d.includes("loan") && amount > 0)              return "digital_loan_received";
  if (d.includes("reversal") && amount > 0)          return "other";
  if (d.includes("airtime") || d.includes("bundle")) return "airtime";
  if (d.includes("kplc") || d.includes("kenya power")) return "utility_payment";
  if (d.includes("school") || d.includes("fees"))    return "school_fees";
  if (d.includes("rent") || d.includes("landlord"))  return "rent";
  if (d.includes("fuel") || d.includes("petrol"))    return "fuel";
  if (d.includes("hospital") || d.includes("clinic") || d.includes("pharmacy")) return "medical_emergency";
  if (d.includes("sha") || d.includes("nhif"))       return "sha_contribution";
  if (d.includes("sacco"))                           return "sacco_contribution";
  if (d.includes("chama"))                           return "chama_contribution";
  if (d.includes("customer transfer to") || d.includes("sent to")) return "daily_spending";
  if (d.includes("funds received") || d.includes("received from")) return "daily_micro_income";
  if (d.includes("buy goods") || d.includes("pay bill") || d.includes("paybill") || d.includes("lipa")) return amount > 0 ? "business_revenue" : "utility_payment";
  if (d.includes("deposit") || d.includes("cash in")) return amount > 0 ? "cash_deposit" : "other";
  if (d.includes("withdrawal") || d.includes("withdraw")) return amount < 0 ? "withdrawal" : "cash_deposit";
  if (d.includes("merchant payment") || d.includes("buy goods")) return amount < 0 ? "daily_spending" : "business_revenue";
  if (d.includes("transfer from bank") || d.includes("business payment")) return "business_revenue";
  if (amount > 0) { if (amount < 10) return "other"; return "daily_micro_income"; }
  return "daily_spending";
}

async function tryParsePDF(bytes, pwd) {
  try {
    const pdfjsLib   = await loadPdfJs();
    const loadingTask = pdfjsLib.getDocument({ data: bytes, password: pwd, isEvalSupported: false });
    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (err) {
      if (err.name === "PasswordException" || (err.message||"").toLowerCase().includes("password"))
        return { needsPassword: true };
      return { error: `Could not read PDF: ${err.message}` };
    }

    // ── EXTRACT TEXT WITH POSITION DATA ───────────────────────────────
    // PDF.js gives us x,y coords per text item.
    // We flip Y (PDF Y=0 is bottom) and group items within 8px Y-tolerance
    // into rows, then sort each row left-to-right by X.
    const pageItems = [];
    let periodStart = null, periodEnd = null;

    for (let p = 1; p <= pdf.numPages; p++) {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      const vp      = page.getViewport({ scale: 1 });
      const pageTokens = [];
      content.items.forEach(item => {
        const text = item.str.trim();
        if (!text) return;
        const y = Math.round(vp.height - item.transform[5]); // flip Y: top=0
        const x = Math.round(item.transform[4]);
        pageItems.push({ text, x, y, page: p });
        pageTokens.push(text);
      });
      // Extract statement period from page 1
      if (p === 1) {
        const fullText = pageTokens.join(" ");
        const pm = fullText.match(/(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})\s*[-–]\s*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i);
        if (pm) {
          periodStart = parseSafaricomDate(pm[1].replace(/(?:st|nd|rd|th)/gi,""));
          periodEnd   = parseSafaricomDate(pm[2].replace(/(?:st|nd|rd|th)/gi,""));
        }
      }
    }

    // ── GROUP INTO ROWS ───────────────────────────────────────────────
    pageItems.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
    const rows = [];
    let curRow = null;
    for (const item of pageItems) {
      if (!curRow || item.page !== curRow.page || Math.abs(item.y - curRow.y) > 8) {
        curRow = { y: item.y, page: item.page, cells: [] };
        rows.push(curRow);
      }
      curRow.cells.push(item);
    }
    rows.forEach(r => r.cells.sort((a, b) => a.x - b.x)); // left-to-right

    // ── PARSE TRANSACTIONS ────────────────────────────────────────────
    // Each transaction row starts with a receipt number.
    // Details can span 2-3 PDF rows, so we collect tokens forward
    // until the next receipt number appears.
    const transactions = [];

    for (let ri = 0; ri < rows.length; ri++) {
      const firstCell = rows[ri].cells[0];
      if (!firstCell || !isReceipt(firstCell.text)) continue;
      if (isHeaderRow(rows[ri].cells.map(c => c.text))) continue;

      const receipt = firstCell.text;
      const tokens  = [];

      // Collect up to 8 rows forward
      for (let rj = ri; rj < Math.min(ri + 8, rows.length); rj++) {
        if (rj > ri && rows[rj].cells[0] && isReceipt(rows[rj].cells[0].text)) break;
        rows[rj].cells.forEach(c => { if (c.text && c.text !== receipt) tokens.push(c.text); });
      }

      // Find date
      const dateToken = tokens.find(isDateToken) || "";
      const date      = parseSafaricomDate(dateToken);
      if (!date) continue;

      // Validate against statement period
      if (periodStart && periodEnd && (date < periodStart || date > periodEnd)) continue;

      // Must be COMPLETED
      const statusToken = tokens.find(t => /completed|failed|cancelled/i.test(t)) || "";
      if (!statusToken.toLowerCase().includes("complet")) continue;

      // Find amounts — last 3 are paidIn, withdrawn, balance
      const amtTokens = tokens.filter(t => isAmount(t));
      let paidIn = 0, withdrawn = 0, balance = 0;

      if (amtTokens.length >= 3) {
        balance   = toNum(amtTokens[amtTokens.length - 1]);
        withdrawn = toNum(amtTokens[amtTokens.length - 2]);
        paidIn    = toNum(amtTokens[amtTokens.length - 3]);
      } else if (amtTokens.length === 2) {
        balance = toNum(amtTokens[1]);
        const v = toNum(amtTokens[0]);
        if (v < 0) withdrawn = Math.abs(v); else paidIn = v;
      } else if (amtTokens.length === 1) {
        balance = toNum(amtTokens[0]);
      }

      // Net amount
      let amount;
      if (paidIn > 0 && withdrawn === 0)       amount = paidIn;
      else if (withdrawn > 0 && paidIn === 0)  amount = -withdrawn;
      else if (paidIn > 0 && withdrawn > 0)    amount = paidIn - withdrawn;
      else {
        const signed = tokens.find(t => /^-[\d,]+\.\d{2}$/.test(t));
        if (signed) amount = toNum(signed); else continue;
      }
      if (amount === 0) continue;

      // Build description
      const skip = new Set([receipt, dateToken, statusToken, ...amtTokens]);
      const desc = tokens
        .filter(t => !skip.has(t) && t.length > 1 && !/^page$/i.test(t) && !/^\d+$/.test(t))
        .join(" ").replace(/\s+/g," ").trim().slice(0, 100);

      transactions.push({
        id:          `${receipt}_${date}`,
        date,
        amount:      parseFloat(amount.toFixed(2)),
        balance:     parseFloat(balance.toFixed(2)),
        description: desc,
        category:    autoCategory(desc, amount),
        source:      "pdf",
        receipt,
      });
    }

    if (transactions.length === 0) {
      const preview = pageItems.slice(0,40).map(i=>i.text).join(" | ");
      return { error: `No transactions found. Extracted: "${preview.slice(0,200)}..." — Make sure this is a Safaricom M-PESA statement.` };
    }

    // Sort most recent first, deduplicate
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    const seen = new Set();
    return { transactions: transactions.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; }) };

  } catch (err) {
    return { error: `Parse error: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function UploadScreen({ onBack, onImport }) {
  const [stage,      setStage]      = useState("idle");
  const [file,       setFile]       = useState(null);
  const [fileBytes,  setFileBytes]  = useState(null);
  const [parsedTxns, setParsedTxns] = useState([]);
  const [parseError, setParseError] = useState("");
  const [password,   setPassword]   = useState("");
  const [pwdError,   setPwdError]   = useState("");

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setParseError(""); setPwdError(""); setPassword(""); setParsedTxns([]);
    setStage("reading");
    try {
      const ab      = await f.arrayBuffer();
      const byteArr = new Uint8Array(ab);
      // Store Uint8Array so we can re-slice for password retries
      setFileBytes(byteArr);
      // Quick magic-byte check
      const header = String.fromCharCode(...byteArr.slice(0, 5));
      if (!header.startsWith("%PDF")) {
        setParseError("This does not look like a PDF file. Please upload your M-PESA statement PDF.");
        setStage("idle"); return;
      }
      setStage("parsing");
      const result = await tryParsePDF(byteArr.slice(0), "");
      if (result.needsPassword) { setStage("password_needed"); }
      else if (result.error)    { setParseError(result.error); setStage("idle"); }
      else                      { setParsedTxns(result.transactions); setStage("preview"); }
    } catch (err) {
      setParseError(`Could not read this PDF: ${err.message}. Please try downloading a fresh copy.`);
      setStage("idle");
    }
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) { setPwdError("Please enter the password / Tafadhali ingiza nenosiri"); return; }
    if (!fileBytes)       { setPwdError("No file loaded. Please go back and select your file again."); return; }
    setPwdError(""); setStage("parsing");
    const result = await tryParsePDF(fileBytes.slice(0), password.trim());
    if (result.needsPassword) { setStage("password_needed"); setPwdError("Incorrect password. Try again / Nenosiri si sahihi. Jaribu tena."); }
    else if (result.error)    { setParseError(result.error); setStage("idle"); }
    else                      { setParsedTxns(result.transactions); setStage("preview"); setPassword(""); }
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
        {/* IDLE / READING */}
        {(stage==="idle"||stage==="reading") && (
          <div>
            <div style={{ ...S.card, marginBottom:16 }}>
              <div style={{ fontSize:13, color:"#7A9CC0", lineHeight:1.6, marginBottom:20 }}>
                Upload your Safaricom M-PESA statement PDF.
                If it is password protected, you will be prompted for the password from the email Safaricom sent you.
                <br /><br />
                <span style={{ color:"#4A6A8A" }}>Pakia PDF ya taarifa yako ya M-PESA. Kama ina nenosiri, tutakuomba uingize nenosiri kutoka kwa barua pepe ya Safaricom.</span>
              </div>
              <label style={{ display:"block", border:"2px dashed #1E3A5F", borderRadius:12, padding:"32px 20px", textAlign:"center", cursor:"pointer" }}
                onMouseEnter={e => e.currentTarget.style.borderColor="#00C875"}
                onMouseLeave={e => e.currentTarget.style.borderColor="#1E3A5F"}>
                <input type="file" accept=".pdf" onChange={handleFile} style={{ display:"none" }} />
                <div style={{ fontSize:36, marginBottom:12 }}>{stage==="reading"?"⏳":"📄"}</div>
                <div style={{ color:"#F0F4F8", fontWeight:600, marginBottom:4 }}>
                  {stage==="reading" ? "Reading file..." : (file ? `${file.name} — tap to change` : "Tap to select PDF")}
                </div>
                <div style={{ color:"#4A6A8A", fontSize:13 }}>M-PESA statement (.pdf)</div>
              </label>
              {parseError && <div style={{ marginTop:16, padding:"12px 16px", background:"#3D0000", borderRadius:10, color:"#E53E3E", fontSize:13, lineHeight:1.5 }}>{parseError}</div>}
            </div>
            {/* How to get statement */}
            <div style={{ ...S.card, background:"#0A1628", border:"1px solid #1E3A5F" }}>
              <div style={{ fontSize:12, color:"#00C875", fontWeight:600, marginBottom:10 }}>How to get your M-PESA statement</div>
              {[["1","Dial *334#","Piga *334#"],["2","Select My Account → Statement","Chagua Akaunti Yangu → Taarifa"],["3","Choose date range (max 6 months)","Chagua kipindi (miezi 6 max)"],["4","Statement sent to your email","Taarifa inatumwa kwa barua pepe"]].map(([n, en, sw]) => (
                <div key={n} style={{ display:"flex", gap:12, marginBottom:10 }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", background:"#1E3A5F", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#00C875", flexShrink:0 }}>{n}</div>
                  <div><div style={{ fontSize:13, color:"#F0F4F8" }}>{en}</div><div style={{ fontSize:11, color:"#4A6A8A" }}>{sw}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PASSWORD PROMPT */}
        {(stage==="password_needed") && (
          <div style={S.card}>
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
              <div style={{ fontWeight:600, color:"#F0F4F8", fontSize:18, marginBottom:8 }}>Statement is password protected</div>
              <div style={{ color:"#7A9CC0", fontSize:13, lineHeight:1.6 }}>
                Enter the password from the email Safaricom sent you with this statement.
                <br /><span style={{ color:"#4A6A8A" }}>Ingiza nenosiri kutoka barua pepe uliyopewa na Safaricom. Kawaida ni nambari yako ya kitambulisho au ya simu.</span>
              </div>
            </div>
            <div style={{ marginBottom:8 }}>
              <label style={S.label} htmlFor="pdf-password">Password / Nenosiri</label>
              <input id="pdf-password" name="pdf_password" style={{ ...S.input, fontSize:17, letterSpacing:"0.08em" }}
                type="password" placeholder="Enter PDF password" value={password} autoFocus
                onChange={e => { setPassword(e.target.value); setPwdError(""); }}
                onKeyDown={e => e.key === "Enter" && handlePasswordSubmit()} />
              {pwdError && <p style={{ color:"#E53E3E", fontSize:12, marginTop:8, lineHeight:1.5 }}>{pwdError}</p>}
            </div>
            <p style={{ color:"#4A6A8A", fontSize:12, marginBottom:20, lineHeight:1.5 }}>
              We never store your password. It is only used to unlock this file in your browser.<br />
              <span style={{ color:"#2A4A3A" }}>Hatuhifadhi nenosiri lako. Inatumika kufungua faili tu.</span>
            </p>
            <div style={{ display:"flex", gap:12 }}>
              <button style={{ ...S.btnOutline, flex:1 }} onClick={() => { setStage("idle"); setPassword(""); setPwdError(""); }}>← Try different file</button>
              <button style={{ ...S.btnGreen, flex:2 }} onClick={handlePasswordSubmit}>Unlock · Fungua</button>
            </div>
          </div>
        )}

        {/* PARSING SPINNER */}
        {stage==="parsing" && (
          <div style={{ ...S.card, textAlign:"center", padding:48 }}>
            <div style={{ fontSize:40, marginBottom:16 }}>⟳</div>
            <div style={{ color:"#F0F4F8", fontWeight:600 }}>Reading your transactions...</div>
            <div style={{ color:"#4A6A8A", fontSize:13, marginTop:8 }}>Inasoma miamala yako...</div>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* PREVIEW */}
        {stage==="preview" && parsedTxns.length > 0 && (
          <div>
            <div style={{ ...S.card, marginBottom:16 }}>
              <div style={{ fontSize:13, color:"#00C875", fontWeight:600, marginBottom:16 }}>
                ✅ {parsedTxns.length} transactions found · Miamala {parsedTxns.length} imepatikana
              </div>
              <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                {[
                  { label:"Income",  value:`KES ${parsedTxns.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0).toLocaleString()}`,                color:"#00C875" },
                  { label:"Expenses",value:`KES ${parsedTxns.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0).toLocaleString()}`,       color:"#E53E3E" },
                  { label:"Period",  value:`${parsedTxns[parsedTxns.length-1]?.date||"—"} → ${parsedTxns[0]?.date||"—"}`,                          color:"#7A9CC0" },
                ].map(s => (
                  <div key={s.label} style={{ flex:1, background:"#0A1628", borderRadius:10, padding:"10px 12px" }}>
                    <div style={{ fontSize:11, color:"#4A6A8A" }}>{s.label}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:s.color, marginTop:2 }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:12, color:"#4A6A8A", marginBottom:8 }}>Preview (first 5)</div>
              {parsedTxns.slice(0,5).map(t => (
                <div key={t.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #1E3A5F", fontSize:13 }}>
                  <div>
                    <div style={{ color:"#F0F4F8" }}>{(t.category||"").replace(/_/g," ")}</div>
                    <div style={{ color:"#4A6A8A", fontSize:11 }}>{t.date} · {(t.description||"").slice(0,35)}</div>
                  </div>
                  <div style={{ fontWeight:600, color:t.amount>0?"#00C875":"#E53E3E" }}>{t.amount>0?"+":""}KES {Math.abs(t.amount).toLocaleString()}</div>
                </div>
              ))}
              {parsedTxns.length>5 && <div style={{ color:"#4A6A8A", fontSize:12, textAlign:"center", marginTop:10 }}>+{parsedTxns.length-5} more transactions</div>}
            </div>
            <button style={S.btnGreen} onClick={() => onImport(parsedTxns)}>
              Import {parsedTxns.length} Transactions · Ingiza Miamala
            </button>
            <button style={{ ...S.btnOutline, width:"100%", marginTop:10 }} onClick={() => { setStage("idle"); setParsedTxns([]); setFile(null); setFileBytes(null); }}>
              Cancel · Ghairi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP — root component, manages all state and screen routing
// Architecture: current API system (JWT / apiFetch), not Supabase
// ═══════════════════════════════════════════════════════════════════════════
export default function InFoachApp() {
  const [screen,       setScreen]       = useState("welcome");
  const [currentUser,  setCurrentUser]  = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showAddTxn,   setShowAddTxn]   = useState(false);
  const [lang,         setLang]         = useState("en");

  // Attempt to restore session from safe storage on mount
  useEffect(() => {
    wakeUpAPI();
    if (_authToken) {
      try {
        const keys = safeStorage.keys().filter(k => k.startsWith("infoach:user:"));
        if (keys.length > 0) {
          const stored = safeStorage.get(keys[0]);
          if (stored) {
            const user = JSON.parse(stored);
            setCurrentUser(user);
            setScreen("dashboard");
            apiLoadTxns().then(txns => { if (Array.isArray(txns)) setTransactions(txns); });
          }
        }
      } catch (_) {}
    }
  }, []);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setScreen("dashboard");
    apiLoadTxns().then(txns => { if (Array.isArray(txns)) setTransactions(txns); });
  };

  const handleAddTxn = (txn) => {
    const updated = [...transactions, txn];
    setTransactions(updated);
    apiSaveTxns([txn]);
    setShowAddTxn(false);
  };

  const handleDeleteTxn = (id) => {
    setTransactions(prev => prev.filter(t => String(t.id) !== String(id)));
    apiDeleteTxn(id);
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    setTransactions([]);
    setScreen("welcome");
  };

  // Compute features and tier ONCE at the top level so all screens
  // receive exactly the same values — eliminates "Add transactions first"
  // appearing while data exists (was caused by recomputing per-component)
  const features = computeFeatures(transactions);
  const { tier, num } = classifyTier(features, currentUser?.persona);

  if (screen==="welcome")  return <WelcomeScreen onLogin={() => setScreen("login")} onRegister={() => setScreen("register")} />;
  if (screen==="login")    return <LoginScreen onSuccess={handleAuthSuccess} onBack={() => setScreen("welcome")} />;
  if (screen==="register") return <RegisterScreen onSuccess={handleAuthSuccess} onBack={() => setScreen("welcome")} />;

  if (screen==="logs") return (
    <TransactionLogs
      transactions={transactions}
      onBack={() => setScreen("dashboard")}
      onDelete={handleDeleteTxn}
    />
  );

  if (screen==="budget") return (
    <BudgetAdvisor
      user={currentUser}
      features={features}
      tier={tier}
      num={num}
      lang={lang}
      onBack={() => setScreen("dashboard")}
    />
  );

  if (screen==="upload") return (
    <UploadScreen
      onBack={() => setScreen("dashboard")}
      onImport={(txns) => {
        // PDF import replaces previous PDF transactions, keeps manual entries
        const manualTxns = transactions.filter(t => !t.receipt);
        const combined   = [...manualTxns, ...txns];
        setTransactions(combined);
        apiSaveTxns(combined);
        setScreen("dashboard");
      }}
    />
  );

  // Default: dashboard
  return (
    <div style={S.app}>
      {screen==="dashboard" && (
        <Dashboard
          user={currentUser}
          transactions={transactions}
          features={features}
          tier={tier}
          num={num}
          onAddTxn={() => setShowAddTxn(true)}
          onViewLogs={() => setScreen("logs")}
          onUpload={() => setScreen("upload")}
          onBudget={() => setScreen("budget")}
          onLogout={handleLogout}
        />
      )}
      {showAddTxn && (
        <AddTransactionModal
          onSave={handleAddTxn}
          onClose={() => setShowAddTxn(false)}
        />
      )}
    </div>
  );
}
