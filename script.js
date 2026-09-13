// =====================================================================
// Belief-consistency study — build 4: prior, one advisor, both advisors
// =====================================================================
const BUILD = 4;
const SCHEMA_VERSION = 2;
console.log("Belief study — script.js build", BUILD);

// =====================================================================
// CONFIG — researcher-editable settings
// =====================================================================
const CONFIG = {
  pilotMode: true, // Real AgeDB photos, but the supplied advisor answers are illustrative.
  completionMessage: "Please tell the experimenter that you have finished.",
  saveEndpoint: "/.netlify/functions/save",

  // ---- Money (HKD) ----
  showUpFeeHKD: 60,
  prizeHKD: 200,

  // ---- Trial structure ----
  practiceTrials: 2,
  // Photographs drawn per agreement cell. The pre-screening stratification
  // keeps the four cells roughly equally frequent; this fixes it exactly.
  cellQuota: { Gg: 5, Gb: 5, Bg: 5, Bb: 5 },
  breakAfter: 10,          // short rest screen after this many photographs
  quizAttempts: 3,

  // ---- Elicitation ----
  sliderStep: 1,
  requireSliderMove: true,       // the slider must be touched before continuing

  // ---- Advisors ----
  // `marginalAccuracy` is the share of the photographs a subject actually faces
  // on which that advisor is correct. It is disclosed only in the two accuracy
  // arms, and deliberately only as a marginal: the joint behaviour of the two
  // advisors is never disclosed in any arm.
  //
  // NOTE. Stratifying the four agreement cells equally caps the AVERAGE of the
  // two numbers at 75%: the two discordant cells are exactly one right and one
  // wrong, so they contribute 50% to that average no matter which photographs
  // fill them. Numbers above that cannot be true of the stratified set, and the
  // interface refuses to state them. See README.
  advisors: {
    claude: { key: "claude", realName: "Claude", maker: "Anthropic", marginalAccuracy: 0.72 },
    gpt: { key: "gpt", realName: "ChatGPT", maker: "OpenAI", marginalAccuracy: 0.68 },
  },
  blindLabels: ["Advisor 1", "Advisor 2"],

  photoManifest: "photos.json",
  usePlaceholderFaces: false,  // enable only for interface demos, never participant sessions
  randomiseOrder: true,
};

// =====================================================================
// DESIGN — the experimental objects
// =====================================================================
// === PURE LOGIC START ===

// The four disclosure arms. `identity` controls whether the advisors are named;
// `accuracy` controls whether each advisor's marginal hit rate is disclosed.
const TREATMENTS = [
  { key: "named_plain", identity: "named", accuracy: "hidden", label: "Named advisors" },
  { key: "blind_plain", identity: "blind", accuracy: "hidden", label: "Unnamed advisors" },
  { key: "blind_accuracy", identity: "blind", accuracy: "shown", label: "Unnamed advisors, accuracy disclosed" },
  { key: "named_accuracy", identity: "named", accuracy: "shown", label: "Named advisors, accuracy disclosed" },
];

const DESIGN = {
  // s is the first model's verdict, t the second model's verdict.
  // Capital letters = "older than 21"; lower case = "21 or younger".
  sValues: ["G", "B"],
  tValues: ["g", "b"],
  cells: ["Gg", "Gb", "Bg", "Bb"],
  arms: ["ST", "TS"],        // ST = claude first, TS = gpt first
  threshold: 21,
};

const VERDICT = {
  G: { older: true, text: "Older than 21" },
  B: { older: false, text: "21 or younger" },
  g: { older: true, text: "Older than 21" },
  b: { older: false, text: "21 or younger" },
};

function treatmentByKey(key) {
  return TREATMENTS.find(function (t) { return t.key === key; }) || null;
}
function treatmentFromUniform(u) {
  const i = Math.min(TREATMENTS.length - 1, Math.floor(Number(u) * TREATMENTS.length));
  return TREATMENTS[i];
}

function cellOf(photo) { return String(photo.claude) + String(photo.gpt); }

// Stage 0 is the photo-specific prior, before any advice. Stages 1 and 2 retain
// the eight advice-conditioned coordinates used by the original design.
function coordForStage(photo, arm, stage) {
  if (stage === 0) return "prior";
  const s = String(photo.claude), t = String(photo.gpt);
  if (stage === 2) return s + t;
  return arm === "ST" ? s : t;
}
function advisorForStage(arm, stage) {
  if (stage === 0) return null;
  if (arm === "ST") return stage === 1 ? "claude" : "gpt";
  return stage === 1 ? "gpt" : "claude";
}
function signalOf(photo, advisorKey) {
  return advisorKey === "claude" ? String(photo.claude) : String(photo.gpt);
}

function shuffleWith(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Arms are balanced inside each cell, and the odd photograph in a cell of odd
// size alternates across cells so that the session total stays balanced too.
function armsForCells(quota, rand) {
  const cells = Object.keys(quota);
  let carry = rand() < 0.5 ? "ST" : "TS";
  const out = {};
  cells.forEach(function (cell) {
    const n = quota[cell];
    const half = Math.floor(n / 2);
    const list = [];
    for (let i = 0; i < half; i++) list.push("ST", "TS");
    if (n % 2 === 1) {
      list.push(carry);
      carry = carry === "ST" ? "TS" : "ST";
    }
    out[cell] = shuffleWith(list, rand);
  });
  return out;
}

// A session plan: one entry per photograph, stratified across the four
// agreement cells, with a balanced arm assignment, in randomized order.
function buildTrialPlan(bank, quota, rand, opts) {
  const options = opts || {};
  const exclude = new Set(options.exclude || []);
  const byCell = {};
  DESIGN.cells.forEach(function (c) { byCell[c] = []; });
  bank.forEach(function (p) {
    if (exclude.has(p.id)) return;
    const c = cellOf(p);
    if (byCell[c]) byCell[c].push(p);
  });

  const shortfall = [];
  DESIGN.cells.forEach(function (c) {
    const want = quota[c] || 0;
    if (byCell[c].length < want) shortfall.push(c + " (have " + byCell[c].length + ", need " + want + ")");
  });
  if (shortfall.length) throw new Error("Photograph bank is short in cells: " + shortfall.join(", "));

  const arms = armsForCells(quota, rand);
  let plan = [];
  DESIGN.cells.forEach(function (c) {
    const picks = shuffleWith(byCell[c], rand).slice(0, quota[c] || 0);
    picks.forEach(function (photo, i) {
      const arm = arms[c][i];
      plan.push({
        photoId: photo.id,
        cell: c,
        arm: arm,
        firstAdvisor: advisorForStage(arm, 1),
        secondAdvisor: advisorForStage(arm, 2),
        coord0: coordForStage(photo, arm, 0),
        coord1: coordForStage(photo, arm, 1),
        coord2: coordForStage(photo, arm, 2),
      });
    });
  });
  plan = shuffleWith(plan, rand);
  return plan.map(function (x, i) { return Object.assign({}, x, { index: i + 1 }); });
}

// Binarized scoring rule (Hossain and Okui, 2013): a report r in [0,1] wins the
// prize with probability 1 - (r - x)^2, where x records the true state.
function winProbability(reportPercent, older) {
  const r = Math.min(Math.max(Number(reportPercent) / 100, 0), 1);
  const x = older ? 1 : 0;
  return 1 - Math.pow(r - x, 2);
}

// End-of-session payment: one photograph, then one of its three reports.
// Stage 0 = prior, stage 1 = one advisor, stage 2 = both advisors.
function settlePayment(records, bankById, uniforms) {
  if (!records.length) throw new Error("No reports to settle");
  if (records.some(function (r) {
    return [r.prior, r.report1, r.report2].some(function (v) {
      return typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100;
    });
  })) throw new Error("All three reports must be complete before drawing the payment.");
  const uTrial = Math.min(Math.max(Number(uniforms.trial), 0), 0.999999999999);
  const uStage = Math.min(Math.max(Number(uniforms.stage), 0), 0.999999999999);
  const uWin = Math.min(Math.max(Number(uniforms.win), 0), 0.999999999999);
  const record = records[Math.floor(uTrial * records.length)];
  const stage = Math.floor(uStage * 3);
  const report = [record.prior, record.report1, record.report2][stage];
  const photo = bankById[record.photoId];
  if (!photo) throw new Error("Unknown photograph " + record.photoId);
  const older = !!photo.older;
  const p = winProbability(report, older);
  const won = uWin < p;
  return {
    photoId: record.photoId, trialIndex: record.index, stage: stage,
    report: report, older: older, winProbability: p, won: won,
    prizeHKD: won ? CONFIG.prizeHKD : 0,
    uniforms: { trial: uTrial, stage: uStage, win: uWin },
  };
}

// ---------------------------------------------------------------------
// Analysis-side helpers. Not used by the participant interface; they state
// the object the design is built to measure, and the tests exercise them.
// ---------------------------------------------------------------------
function loopWeights(profile) {
  const P = profile;
  return {
    alpha: (P.G - P.Gg) / (P.Gb - P.Gg),
    beta: (P.B - P.Bg) / (P.Bb - P.Bg),
    gamma: (P.g - P.Gg) / (P.Bg - P.Gg),
    delta: (P.b - P.Gb) / (P.Bb - P.Gb),
  };
}
function odds(x) { return x / (1 - x); }
// Zero when the profile satisfies loop consistency. Positive values measure
// how far apart the two routes around the square are, in log-odds.
function loopResidual(profile) {
  const w = loopWeights(profile);
  const inside = [w.alpha, w.beta, w.gamma, w.delta].every(function (v) { return v > 0 && v < 1; });
  const residual = Math.log(odds(w.alpha)) + Math.log(odds(w.delta)) -
    Math.log(odds(w.gamma)) - Math.log(odds(w.beta));
  return { weights: w, martingale: inside, residual: residual };
}
// === PURE LOGIC END ===

// =====================================================================
// State
// =====================================================================
function $(id) { return document.getElementById(id); }
function getParam(name) { return new URLSearchParams(window.location.search).get(name); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function rand() { return Math.random(); }
function shuffle(arr) { return shuffleWith(arr, rand); }

function fallbackKey() {
  const storageKey = "belief-study-submission-key";
  try {
    let key = window.sessionStorage.getItem(storageKey);
    if (!key) {
      const r = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).slice(2);
      key = "LOCAL-" + Date.now() + "-" + r;
      window.sessionStorage.setItem(storageKey, key);
    }
    return key;
  } catch (_) { return "LOCAL-" + Date.now() + "-" + Math.random().toString(36).slice(2); }
}

let subjectId = getParam("subject") || getParam("id") || "";
const sessionCode = getParam("session") || "";
const stationCode = getParam("station") || "";
const submissionKey = fallbackKey();

// A forced arm is available for piloting: index.html?arm=blind_accuracy
const forcedTreatment = treatmentByKey(getParam("arm") || "");

const state = {
  startedAt: new Date().toISOString(),
  treatment: forcedTreatment || treatmentFromUniform(Math.random()),
  treatmentForced: !!forcedTreatment,
  // In the unnamed arms the label-to-model mapping is randomized per subject so
  // that "Advisor 1" is not always the same system.
  blindMap: null,
  photoBank: [],
  photoBankMetadata: null,
  bankById: {},
  plan: [],
  practicePlan: [],
  records: [],
  practiceRecords: [],
  comprehension: { attempts: 0, log: [], failed: false },
  payment: null,
  finishedAt: null,
};

function assignBlindLabels() {
  const keys = shuffle(["claude", "gpt"]);
  state.blindMap = { };
  state.blindMap[keys[0]] = CONFIG.blindLabels[0];
  state.blindMap[keys[1]] = CONFIG.blindLabels[1];
}
assignBlindLabels();

// ---- Advisor presentation -------------------------------------------
function advisorName(key) {
  const a = CONFIG.advisors[key];
  if (state.treatment.identity === "named") return a.realName;
  return state.blindMap[key];
}
function advisorSubtitle(key) {
  const a = CONFIG.advisors[key];
  if (state.treatment.identity === "named") return "made by " + a.maker;
  return "a widely used AI assistant";
}
function advisorSlot(key) {
  // A stable visual slot (one/two) so colours stay put for the whole session.
  if (state.treatment.identity === "named") return key === "claude" ? "one" : "two";
  return state.blindMap[key] === CONFIG.blindLabels[0] ? "one" : "two";
}
function accuracyDisclosed() { return state.treatment.accuracy === "shown"; }
function accuracyPercent(key) { return Math.round(CONFIG.advisors[key].marginalAccuracy * 100); }
function advisorOrderForDisplay() {
  // Named arms list Claude then ChatGPT; unnamed arms list Advisor 1 then 2.
  return advisorSlot("claude") === "one" ? ["claude", "gpt"] : ["gpt", "claude"];
}

// ---- Page timers ----------------------------------------------------
const pageTimes = {};
let currentPageName = "consent";
let pageShownAt = performance.now();
function setPage(name) {
  const now = performance.now();
  pageTimes[currentPageName] = (pageTimes[currentPageName] || 0) + (now - pageShownAt);
  currentPageName = name;
  pageShownAt = now;
}
function pageTimesSnapshot() {
  const out = {};
  for (const k in pageTimes) out[k] = Math.round(pageTimes[k]);
  return out;
}

// ---- Screens and progress -------------------------------------------
const TOTAL_STEPS = 9 + 20 + 2;
function setProgress(step) {
  $("progress-fill").style.width = Math.min(100, Math.round((step / TOTAL_STEPS) * 100)) + "%";
}
const screens = document.querySelectorAll(".screen");
function showScreen(id) {
  screens.forEach(function (s) { s.classList.toggle("active", s.id === id); });
  window.scrollTo(0, 0);
  updateBackButton();
}

// ---- Going back ------------------------------------------------------
// Instruction screens are reversible. Once the photographs begin nothing is,
// because a subject who has seen the second recommendation cannot un-see it.
const navStack = [];
let navLocked = false;
function pushNav(restore) { navStack.push(restore); updateBackButton(); }
function clearNav() { navStack.length = 0; updateBackButton(); }
function lockNav() { navLocked = true; clearNav(); }
function updateBackButton() {
  const btn = $("btn-back");
  if (!btn) return;
  btn.hidden = false;
  btn.disabled = navLocked || navStack.length === 0;
  btn.setAttribute("aria-disabled", btn.disabled ? "true" : "false");
}
function goBack() {
  if (navLocked || !navStack.length) return;
  navStack.pop()();
  updateBackButton();
}
if ($("btn-back")) $("btn-back").addEventListener("click", goBack);

function beforeUnloadGuard(e) { e.preventDefault(); e.returnValue = ""; }

// ---- Setup checks ----------------------------------------------------
(function checkPageVersion() {
  const required = ["progress-fill", "config-warning", "screen-consent", "screen-welcome",
    "screen-overview", "screen-advisors", "screen-scoring", "screen-quiz", "screen-return",
    "screen-practice-intro", "screen-trial", "screen-break", "screen-trials-intro",
    "screen-saving", "screen-payment", "screen-debrief", "screen-error",
    "trial-slider", "trial-photo", "trial-advisors", "advisors-body", "scoring-body"];
  const missing = required.filter(function (id) { return !document.getElementById(id); });
  if (missing.length) {
    const div = document.createElement("div");
    div.className = "notice";
    div.style.margin = "16px";
    div.textContent = "Setup problem: index.html and script.js are different versions " +
      "(this page is missing: " + missing.join(", ") + "). Replace BOTH files from the same package.";
    document.body.prepend(div);
    console.error("Version mismatch — index.html is missing:", missing);
  }
})();

const configWarnings = [];
$("pilot-notice").hidden = !CONFIG.pilotMode;
if (CONFIG.pilotMode) {
  $("consent-answer-status").innerHTML = "<strong>Preview data.</strong> The photographs and recorded ages come from AgeDB. The advisor answers in this preview are illustrative; they have not been collected from the two systems for these photographs.";
}
(function validateConfig() {
  const total = DESIGN.cells.reduce(function (s, c) { return s + (CONFIG.cellQuota[c] || 0); }, 0);
  if (total < 4) configWarnings.push("cellQuota asks for fewer than four photographs.");
  if (!CONFIG.saveEndpoint) configWarnings.push("Data collection is OFF: responses can be downloaded on the last screen but are not saved anywhere.");
  Object.keys(CONFIG.advisors).forEach(function (k) {
    const a = CONFIG.advisors[k].marginalAccuracy;
    if (!(a > 0 && a < 1)) configWarnings.push("marginalAccuracy for " + k + " must lie strictly between 0 and 1.");
  });
  const ceiling = accuracyCeiling(CONFIG.cellQuota);
  const average = (CONFIG.advisors.claude.marginalAccuracy + CONFIG.advisors.gpt.marginalAccuracy) / 2;
  if (average > ceiling + 1e-9) {
    configWarnings.push("The two disclosed accuracies average " + Math.round(average * 100) +
      "%, which no stratified bank can deliver: with these cell quotas the ceiling is " +
      Math.round(ceiling * 100) + "%.");
  }
})();

// The highest average of the two marginal accuracies that a bank with these
// cell quotas can attain. In a discordant cell exactly one advisor is right, so
// those photographs contribute 50% to the average whatever ages they carry.
function accuracyCeiling(quota) {
  const n = function (c) { return quota[c] || 0; };
  const total = DESIGN.cells.reduce(function (s, c) { return s + n(c); }, 0);
  if (!total) return 1;
  return (n("Gg") + n("Bb") + (n("Gb") + n("Bg")) / 2) / total;
}
if (configWarnings.length) {
  $("config-warning").hidden = false;
  $("config-warning").textContent = "Setup reminder (fix before running real sessions): " + configWarnings.join(" ");
}

// =====================================================================
// Photograph bank
// =====================================================================
function placeholderFace(id) {
  // A deterministic stand-in portrait, used when no image file is present so
  // that the interface can be demonstrated without the face database.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  const hue = h % 360;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360">' +
    '<rect width="300" height="360" fill="hsl(' + hue + ',18%,86%)"/>' +
    '<circle cx="150" cy="132" r="62" fill="hsl(' + hue + ',22%,68%)"/>' +
    '<path d="M40 360c0-62 49-104 110-104s110 42 110 104z" fill="hsl(' + hue + ',22%,68%)"/>' +
    '<text x="150" y="344" font-family="system-ui,sans-serif" font-size="15" fill="hsl(' + hue + ',18%,38%)" text-anchor="middle">stand-in image</text>' +
    "</svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

async function loadPhotoBank() {
  const res = await fetch(CONFIG.photoManifest, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load " + CONFIG.photoManifest + " (status " + res.status + ")");
  const raw = await res.json();
  if (!CONFIG.pilotMode && raw.advisorAnswersSource !== "model-prescreened") {
    throw new Error("This photograph bank still contains sample advisor answers. Collect the model responses before running participant sessions.");
  }
  const list = Array.isArray(raw) ? raw : raw.photos;
  if (!Array.isArray(list) || !list.length) throw new Error(CONFIG.photoManifest + " contains no photographs.");
  const seen = new Set();
  const bank = list.map(function (p) {
    if (!p || typeof p.id !== "string" || !p.id.trim() || seen.has(p.id)) {
      throw new Error("Every photograph needs a unique, non-empty ID.");
    }
    seen.add(p.id);
    if (!Number.isInteger(p.age) || p.age < 0 || p.age > 130) {
      throw new Error("Missing or invalid recorded age for photograph " + p.id + ".");
    }
    const older = p.age > DESIGN.threshold;
    if (typeof p.older !== "boolean" || p.older !== older) {
      throw new Error("The recorded age and older/younger label disagree for photograph " + p.id + ".");
    }
    if (!["G", "B"].includes(p.claude) || !["g", "b"].includes(p.gpt)) {
      throw new Error("Invalid advisor answers for photograph " + p.id + ".");
    }
    return {
      id: String(p.id),
      file: p.file || ("photos/" + p.id + ".jpg"),
      age: p.age,
      older: older,
      claude: p.claude,
      gpt: p.gpt,
      practice: !!p.practice,
    };
  });
  state.photoBank = bank;
  state.photoBankMetadata = {
    dataset: raw.dataset || null,
    advisorAnswersSource: raw.advisorAnswersSource || "unspecified",
    provenanceFile: raw.provenanceFile || null,
  };
  state.bankById = {};
  bank.forEach(function (p) { state.bankById[p.id] = p; });
  checkDisclosedAccuracy(bank);
  return bank;
}

// The accuracy arms state a number to subjects, so it has to be the number the
// bank actually delivers. A mismatch is a configuration error, not a rounding
// quibble, and it is worth seeing before a session rather than after one.
function checkDisclosedAccuracy(bank) {
  const study = bank.filter(function (p) { return !p.practice; });
  if (!study.length) return;
  ["claude", "gpt"].forEach(function (key) {
    const correct = study.filter(function (p) {
      const saysOlder = key === "claude" ? p.claude === "G" : p.gpt === "g";
      return saysOlder === p.older;
    }).length;
    const actual = correct / study.length;
    const stated = CONFIG.advisors[key].marginalAccuracy;
    if (Math.abs(actual - stated) > 0.02) {
      const msg = CONFIG.advisors[key].realName + ": the disclosed accuracy is " +
        Math.round(stated * 100) + "% but the photograph bank gives " + Math.round(actual * 100) + "%.";
      configWarnings.push(msg);
      console.warn(msg);
      $("config-warning").hidden = false;
      $("config-warning").textContent = "Setup reminder (fix before running real sessions): " + configWarnings.join(" ");
    }
  });
}

function buildSessionPlans() {
  const practicePool = state.photoBank.filter(function (p) { return p.practice; });
  const mainPool = state.photoBank.filter(function (p) { return !p.practice; });
  const practice = shuffle(practicePool).slice(0, CONFIG.practiceTrials).map(function (photo, i) {
    const arm = shuffle(DESIGN.arms)[0];
    return {
      index: i + 1, photoId: photo.id, cell: cellOf(photo), arm: arm,
      firstAdvisor: advisorForStage(arm, 1), secondAdvisor: advisorForStage(arm, 2),
      coord0: coordForStage(photo, arm, 0),
      coord1: coordForStage(photo, arm, 1), coord2: coordForStage(photo, arm, 2),
      practice: true,
    };
  });
  state.practicePlan = practice;
  state.plan = buildTrialPlan(mainPool, CONFIG.cellQuota, rand, {});
}

// =====================================================================
// Consent, welcome, overview
// =====================================================================
$("btn-consent").addEventListener("click", function () {
  window.addEventListener("beforeunload", beforeUnloadGuard);
  pushNav(function () { setPage("consent"); setProgress(0); showScreen("screen-consent"); });
  setPage("welcome"); setProgress(1); showScreen("screen-welcome");
});

$("btn-welcome").addEventListener("click", async function () {
  const id = (subjectId || $("subject-input").value || "").trim();
  if (id.length < 1) { $("subject-error").hidden = false; return; }
  $("subject-error").hidden = true;
  subjectId = id;
  $("btn-welcome").disabled = true;
  try {
    if (!state.photoBank.length) {
      await loadPhotoBank();
      buildSessionPlans();
    }
  } catch (err) {
    $("btn-welcome").disabled = false;
    $("subject-error").hidden = false;
    $("subject-error").textContent = String(err.message || err);
    return;
  }
  $("btn-welcome").disabled = false;
  autosave("subject_started");
  pushNav(function () { setPage("welcome"); setProgress(1); showScreen("screen-welcome"); });
  setPage("overview"); setProgress(2); renderOverview(); showScreen("screen-overview");
});

function renderOverview() {
  const n = state.plan.length;
  $("overview-body").innerHTML =
    "<p>You will look at <strong>" + n + " photographs</strong>, one at a time. For each one, your job is to judge " +
    "<strong>how likely it is that the person in the photograph is older than " + DESIGN.threshold + "</strong>.</p>" +
    (CONFIG.pilotMode
      ? "<p>For this preview, each photograph has two illustrative advisor answers. You will see these sample answers as you go.</p>"
      : "<p>You are not alone in this. Two artificial-intelligence systems were shown the same photograph before the session, " +
        "and each one gave its own answer to the same question. You will see their answers as you go.</p>") +
    "<div class=\"steps\">" +
    "<div class=\"step\"><span class=\"step-mark\">1</span><div><h3>Your own first estimate</h3>" +
    "<p>Look at the photograph and report your probability before seeing either system's answer.</p></div></div>" +
    "<div class=\"step\"><span class=\"step-mark\">2</span><div><h3>After one advisor</h3>" +
    "<p>One system's answer appears. Give your probability again; your initial estimate remains visible.</p></div></div>" +
    "<div class=\"step\"><span class=\"step-mark\">3</span><div><h3>After both advisors</h3>" +
    "<p>The second answer appears alongside the first. Give your final probability, with both of your earlier estimates shown for reference.</p></div></div>" +
    "</div>" +
    "<p>Both advisors' answers are always shown, in a randomly chosen order. Keeping the same probability is fine if it still reflects your belief.</p>" +
    "<p>No true ages are revealed between photographs. You learn them at the end of the session.</p>" +
    (CONFIG.pilotMode
      ? "<p>The photographs and ages are real AgeDB data. The advisor answers are sample values for testing this interface.</p>"
      : "<p>Everything you see is real. The two systems are real systems, their answers are the answers they actually gave, " +
        "and the photographs are of real people whose ages are recorded. Nothing in this study is invented or disguised.</p>");
}

$("btn-overview").addEventListener("click", function () {
  pushNav(function () { setPage("overview"); setProgress(2); showScreen("screen-overview"); });
  setPage("advisors"); setProgress(3); renderAdvisors(); showScreen("screen-advisors");
});

// =====================================================================
// The advisor screen — the only screen the treatment arm changes
// =====================================================================
function advisorCardHtml(key, opts) {
  const options = opts || {};
  const slot = advisorSlot(key);
  const verdict = options.verdict;
  const initial = state.treatment.identity === "named"
    ? CONFIG.advisors[key].realName.slice(0, 1)
    : (advisorName(key).match(/\d+/) || ["?"])[0];
  let html = '<div class="advisor advisor-' + slot + (verdict ? " advisor-verdict" : "") + '">' +
    '<div class="advisor-head">' +
    '<span class="advisor-mark" aria-hidden="true">' + escapeHtml(initial) + "</span>" +
    '<span class="advisor-id"><span class="advisor-name">' + escapeHtml(advisorName(key)) + "</span>" +
    '<span class="advisor-sub">' + escapeHtml(advisorSubtitle(key)) + "</span></span></div>";
  if (accuracyDisclosed() && options.showAccuracy !== false) {
    html += '<p class="advisor-accuracy">Correct on <strong>' + accuracyPercent(key) +
      "%</strong> of the photographs in this study</p>";
  }
  if (verdict) {
    html += '<p class="advisor-verdict-text">' +
      (CONFIG.pilotMode ? "Illustrative answer for this photograph" : "Its answer for this photograph") + "</p>" +
      '<p class="verdict verdict-' + (VERDICT[verdict].older ? "older" : "younger") + '">' +
      escapeHtml(VERDICT[verdict].text) + "</p>";
  }
  html += "</div>";
  return html;
}

function renderAdvisors() {
  const named = state.treatment.identity === "named";
  const withAccuracy = accuracyDisclosed();
  const order = advisorOrderForDisplay();
  const answerContext = CONFIG.pilotMode
    ? "For this preview, each photograph has an illustrative answer assigned to each advisor: "
    : "Each was shown every photograph in this study and asked the same question you are being asked, and each gave one answer: ";

  $("advisors-eyebrow").textContent = "Before you start";
  $("advisors-title").textContent = named ? "The two systems advising you" : "The two systems advising you";

  let html = "";
  if (named) {
    html += "<p>The two systems are <strong>Claude</strong>, made by Anthropic, and <strong>ChatGPT</strong>, made by OpenAI. " +
      answerContext +
      "older than " + DESIGN.threshold + ", or " + DESIGN.threshold + " or younger.</p>";
  } else {
    html += "<p>Your advice comes from <strong>two different artificial-intelligence systems</strong>, both of them assistants " +
      "that millions of people use. <strong>We are not telling you which two.</strong> " +
      answerContext +
      "older than " + DESIGN.threshold + ", or " + DESIGN.threshold + " or younger.</p>";
    html += "<p>Throughout the session they keep the same two labels, so " + escapeHtml(CONFIG.blindLabels[0]) +
      " is the same system every time it appears.</p>";
  }

  html += '<div class="advisor-grid">' + order.map(function (k) { return advisorCardHtml(k); }).join("") + "</div>";

  if (withAccuracy) {
    html += '<div class="disclosure">' +
      "<h3>How often each one is right</h3>" +
      (CONFIG.pilotMode
        ? "<p>These preview percentages describe the illustrative answers in the photo bank; they are not measured model performance:</p>"
        : "<p>Before the session we checked both systems' answers against the recorded ages for every photograph in this study. " +
          "Here is how often each was correct:</p>") +
      '<table class="accuracy-table"><tbody>' +
      order.map(function (k) {
        return "<tr><th>" + escapeHtml(advisorName(k)) + "</th><td>correct on <strong>" + accuracyPercent(k) +
          "%</strong> of photographs</td></tr>";
      }).join("") +
      "</tbody></table>" +
      "<p class=\"disclosure-limit\">That is the whole of what we are telling you. We are <strong>not</strong> telling you how often the two " +
      "systems agree with each other, whether they tend to make the same mistakes on the same faces, or what one answer implies " +
      "about the other. Those are for you to judge.</p>" +
      "</div>";
  } else {
    html += '<div class="disclosure disclosure-quiet">' +
      "<h3>How often each one is right</h3>" +
      "<p>We are not telling you. Nobody in this room knows how accurate these systems are at judging age from a photograph, " +
      "and working out what to make of their answers is part of what you are being asked to do.</p>" +
      "</div>";
  }

  $("advisors-body").innerHTML = html;
}

$("btn-advisors").addEventListener("click", function () {
  pushNav(function () { setPage("advisors"); setProgress(3); renderAdvisors(); showScreen("screen-advisors"); });
  setPage("scoring"); setProgress(4); renderScoring(); showScreen("screen-scoring");
});

// =====================================================================
// Explain truthful reporting without displaying scoring-rule probabilities.
// =====================================================================
function scoringExplanationHtml() {
  return '<details class="review-box scoring-explanation">' +
    '<summary>Why is it best to report what I believe?</summary>' +
    "<p>The selected report is scored against whether the person really is older than " + DESIGN.threshold +
    ". That score determines the chance of winning the fixed HK$" + CONFIG.prizeHKD + " prize.</p>" +
    "<p>A higher report helps if the person is older; a lower report helps if the person is younger. " +
    "The scoring rule balances these possibilities so that, given your belief, your chance of winning is highest " +
    "when your reported probability matches what you actually believe.</p>" +
    "<p>For example, if you think there is a 70% chance the person is older, report 70%. " +
    "Reporting 100% to sound certain or 50% to play safe would give you a lower chance of winning, according to your own belief.</p>" +
    "<p>Each of your three reports has the same chance of being selected. Use the information you have at each step, " +
    "and keep the same answer if your belief has not changed.</p></details>";
}

function renderScoring() {
  const prize = "HK$" + CONFIG.prizeHKD;
  $("scoring-body").innerHTML =
    "<p>You are paid <strong>HK$" + CONFIG.showUpFeeHKD + "</strong> for taking part, whatever you answer.</p>" +
    "<p>On top of that, one single judgement decides a prize of <strong>" + prize + "</strong>. " +
    "At the end of the session the computer picks one photograph at random, then picks one of your three judgements about it at random. " +
    "That number, and only that number, is what the prize depends on.</p>" +
    "<p>Your initial estimate, your estimate after one advisor, and your estimate after both advisors are all equally eligible.</p>" +
    '<div class="notice"><strong>Your best strategy is to report the probability you actually believe at each step.</strong> ' +
    "The payment rule is designed to give you the best chance of winning when you do so. There is no benefit to sounding more certain or less certain than you feel.</div>" +
    scoringExplanationHtml();
}

$("btn-scoring").addEventListener("click", function () {
  pushNav(function () { setPage("scoring"); setProgress(4); renderScoring(); showScreen("screen-scoring"); });
  setPage("practice_intro"); setProgress(5); renderPracticeIntro(); showScreen("screen-practice-intro");
});

// =====================================================================
// Practice
// =====================================================================
function renderPracticeIntro() {
  $("practice-intro-body").innerHTML =
    "<p>Two practice photographs come next. They work exactly like the real ones, but nothing about them can win or lose you money, " +
    "and they are not part of the study's data.</p>" +
    "<p>For each photograph, first give your own probability without advice. Then answer after one advisor, " +
    "and once more after both advisors. Your earlier estimates remain visible as you receive advice.</p>";
}

$("btn-practice-intro").addEventListener("click", function () {
  pushNav(function () { setPage("practice_intro"); setProgress(5); showScreen("screen-practice-intro"); });
  startTrials(true);
});

// =====================================================================
// Comprehension check
// =====================================================================
function quizQuestions() {
  const prize = "HK$" + CONFIG.prizeHKD;
  const q = [
    {
      q: "When do you give your first probability for each photograph?",
      options: [
        "Before seeing either advisor's answer",
        "After seeing the first advisor's answer",
        "Only after seeing both advisors' answers",
      ],
      correct: 0,
    },
    {
      q: "Which system's answer appears first?",
      options: [
        "It is decided at random, separately for each photograph",
        "The one that is more confident about that photograph",
        "The same one every time",
      ],
      correct: 0,
    },
    {
      q: "Which of your reports can be selected to decide the " + prize + " prize?",
      options: [
        "All three, with the same chance — including my initial estimate without advice",
        "Only my final report after both advisors",
        "Only the reports that agree with an advisor",
      ],
      correct: 0,
    },
    {
      q: "You think there is roughly a 70% chance the person is older than " + DESIGN.threshold + ". What gives you the best chance of winning?",
      options: ["Entering 70", "Entering 100, to be decisive", "Entering 50, to play safe"],
      correct: 0,
    },
    {
      q: "When do you find out how old the people in the photographs really are?",
      options: [
        "At the end of the session, once all the judgements are made",
        "Straight after each photograph",
        "Never",
      ],
      correct: 0,
    },
  ];
  if (accuracyDisclosed()) {
    q.push({
      q: "You were told how often each system is correct. Does that tell you how often the two of them agree with each other?",
      options: [
        "No — that was not disclosed, and it is for me to judge",
        "Yes — two systems that are both often right must usually agree",
        "Yes — the study said they agree that often",
      ],
      correct: 0,
    });
  } else {
    q.push({
      q: "How accurate are these systems at judging age from a photograph?",
      options: [
        "Not disclosed — it is for me to judge",
        "They are always right",
        "They are no better than a coin flip",
      ],
      correct: 0,
    });
  }
  return q;
}

let QUIZ = [];

function quizReviewHtml() {
  const order = advisorOrderForDisplay();
  let html = "<p>For each photograph you report three times: before any advice, after one advisor, and after both advisors. " +
    "Your earlier estimates are shown as you receive more advice. " +
    "Which answer comes first is decided at random for every photograph.</p>" +
    "<p>At the end, one photograph and one of your three judgements about it are drawn at random. " +
    "All three are equally eligible. Your best chance of winning the HK$" + CONFIG.prizeHKD +
    " prize comes from reporting the probability you actually believe at each step.</p>";
  if (accuracyDisclosed()) {
    html += "<p>What you were told about the systems: " +
      order.map(function (k) { return escapeHtml(advisorName(k)) + " is correct on " + accuracyPercent(k) + "% of these photographs"; }).join("; ") +
      ". You were not told how often they agree with each other.</p>";
  } else {
    html += "<p>You were not told how accurate either system is.</p>";
  }
  return html;
}

function renderQuiz() {
  if (!QUIZ.length) QUIZ = quizQuestions();
  if ($("quiz-review")) $("quiz-review").innerHTML = quizReviewHtml();
  $("quiz-body").innerHTML = QUIZ.map(function (item, qi) {
    return '<div class="quiz-q"><p class="q-text">' + (qi + 1) + ". " + escapeHtml(item.q) + "</p>" +
      item.options.map(function (opt, oi) {
        return '<label class="quiz-option"><input type="radio" name="quiz-' + qi + '" value="' + oi + '"><span>' + escapeHtml(opt) + "</span></label>";
      }).join("") + "</div>";
  }).join("");
  $("quiz-error").hidden = true;
}

$("btn-quiz").addEventListener("click", function () {
  const answers = QUIZ.map(function (_, qi) {
    const el = document.querySelector('input[name="quiz-' + qi + '"]:checked');
    return el ? parseInt(el.value, 10) : -1;
  });
  if (answers.indexOf(-1) >= 0) {
    $("quiz-error").hidden = false;
    $("quiz-error").textContent = "Please answer every question.";
    return;
  }
  state.comprehension.attempts++;
  const allCorrect = answers.every(function (a, qi) { return a === QUIZ[qi].correct; });
  state.comprehension.log.push({ answers: answers, correct: allCorrect });
  autosave(allCorrect ? "comprehension_passed" : "comprehension_attempt_" + state.comprehension.attempts);
  if (!allCorrect) {
    if (state.comprehension.attempts >= CONFIG.quizAttempts) {
      state.comprehension.failed = true;
      autosave("comprehension_failed");
      lockNav();
      window.removeEventListener("beforeunload", beforeUnloadGuard);
      setPage("return"); showScreen("screen-return");
      return;
    }
    const left = CONFIG.quizAttempts - state.comprehension.attempts;
    $("quiz-error").hidden = false;
    $("quiz-error").textContent = "At least one answer is not right. Read the rules again above and have another go. " +
      left + " attempt" + (left === 1 ? "" : "s") + " left.";
    return;
  }
  pushNav(function () { setPage("quiz"); renderQuiz(); showScreen("screen-quiz"); });
  setPage("trials_intro"); setProgress(8); renderTrialsIntro(); showScreen("screen-trials-intro");
});

function renderTrialsIntro() {
  $("trials-intro-body").innerHTML =
    "<p>The real photographs start now. There are <strong>" + state.plan.length + "</strong> of them, and there is no going back " +
    "once a photograph begins.</p>" +
    "<p>Work at your own pace. There is no time limit and no right pace — but do answer with the number you actually believe, " +
    "because one of these judgements decides the prize.</p>";
}

$("btn-trials-intro").addEventListener("click", function () {
  lockNav();
  startTrials(false);
});

// =====================================================================
// The elicitation loop
// =====================================================================
let trialPractice = false;
let trialPos = 0;
let trialStage = 0;
let trialRecord = null;
let stageShownAt = 0;
let sliderMoves = 0;
let sliderTouched = false;
let trialImageState = "loading";
let trialImageRequest = 0;

function trialContinueLabel() {
  if (trialStage === 0) return "Save my estimate and show the first advisor";
  return trialStage === 1 ? "Save my estimate and show the second advisor" :
    (trialPos + 1 >= activePlan().length ? "Finish" : "Next photograph");
}

function loadTrialPhoto(photo) {
  const request = ++trialImageRequest;
  const img = $("trial-photo");
  let fallbackAttempted = false;
  trialImageState = "loading";
  stageShownAt = 0;
  img.hidden = true;
  $("trial-advisors").hidden = true;
  img.alt = "Photograph of a person, for you to judge";
  $("trial-slider").disabled = true;
  $("btn-trial").disabled = true;
  $("btn-trial").textContent = "Loading photograph…";
  $("trial-error").hidden = true;

  img.onload = function () {
    if (request !== trialImageRequest || trialImageState !== "loading") return;
    if (!img.naturalWidth) { img.onerror(); return; }
    trialImageState = "ready";
    img.hidden = false;
    $("trial-advisors").hidden = trialStage === 0;
    $("trial-slider").disabled = false;
    $("btn-trial").disabled = false;
    $("btn-trial").textContent = trialContinueLabel();
    // Image transfer time must not count as time spent judging the face.
    stageShownAt = performance.now();
  };
  img.onerror = function () {
    if (request !== trialImageRequest || trialImageState !== "loading") return;
    console.error("Could not load photograph: " + photo.file);
    if (CONFIG.usePlaceholderFaces && !fallbackAttempted) {
      fallbackAttempted = true;
      img.alt = "Stand-in drawing for an interface demonstration";
      img.src = placeholderFace(photo.id);
      return;
    }
    trialImageState = "failed";
    img.hidden = true;
    $("trial-error").hidden = false;
    $("trial-error").textContent = "The photograph could not be loaded. Try again, or tell the experimenter if the problem continues.";
    $("btn-trial").disabled = false;
    $("btn-trial").textContent = "Retry photograph";
  };
  img.src = photo.file;
}

function paintSlider(el) {
  const min = Number(el.min || 0), max = Number(el.max || 100);
  const share = (Number(el.value) - min) / (max - min);
  el.style.setProperty("--fill", (share * 100) + "%");
}

function activePlan() { return trialPractice ? state.practicePlan : state.plan; }
function activeRecords() { return trialPractice ? state.practiceRecords : state.records; }

function startTrials(practice) {
  trialPractice = !!practice;
  trialPos = 0;
  if (trialPractice) state.practiceRecords = [];
  else state.records = [];
  openStage(0);
}

function openStage(stage) {
  const plan = activePlan();
  if (trialPos >= plan.length) { finishTrials(); return; }
  const entry = plan[trialPos];
  const photo = state.bankById[entry.photoId];
  trialStage = stage;
  if (stage === 0) {
    trialRecord = Object.assign({}, entry, {
      signal1: signalOf(photo, entry.firstAdvisor),
      signal2: signalOf(photo, entry.secondAdvisor),
      prior: null, report1: null, report2: null,
      priorMs: null, report1Ms: null, report2Ms: null,
      priorMoves: 0, report1Moves: 0, report2Moves: 0,
      priorAnsweredAt: null, report1AnsweredAt: null, report2AnsweredAt: null,
    });
  }
  renderTrial();
}

function renderTrial() {
  const entry = trialRecord;
  const photo = state.bankById[entry.photoId];
  const plan = activePlan();
  const total = plan.length;

  setPage((trialPractice ? "practice_" : "trial_") + entry.index + "_stage" + trialStage);
  if (!trialPractice) setProgress(8 + trialPos + trialStage / 3);

  $("trial-eyebrow").textContent = trialPractice
    ? "Practice photograph " + entry.index + " of " + total
    : "Photograph " + entry.index + " of " + total;
  $("trial-stagemark").innerHTML = ["No advice", "One advisor", "Both advisors"].map(function (label, stage) {
    return '<span class="stagemark ' + (trialStage === stage ? "on" : trialStage > stage ? "done" : "") +
      '"' + (trialStage === stage ? ' aria-current="step"' : "") + '>' + label + "</span>";
  }).join('<span class="stagemark-line" aria-hidden="true"></span>');

  // Do not even render advice into the DOM until the prior has been submitted.
  const cards = [];
  if (trialStage >= 1) cards.push(advisorCardHtml(entry.firstAdvisor, { verdict: entry.signal1 }));
  if (trialStage === 2) cards.push(advisorCardHtml(entry.secondAdvisor, { verdict: entry.signal2 }));
  else if (trialStage === 1) cards.push('<div class="advisor advisor-pending"><p>The second system\'s answer appears after you give this judgement.</p></div>');
  $("trial-advisors").innerHTML = cards.join("");
  $("trial-grid").classList.toggle("before-advice", trialStage === 0);

  $("trial-question").textContent = "How likely is it that this person is older than " + DESIGN.threshold + "?";
  $("trial-note").textContent = [
    "Give your own estimate from the photograph before seeing any advice.",
    "You have now seen one advisor's answer. Report what you believe now; keeping your initial estimate is fine.",
    "You have now seen both answers. Report what you believe now; keeping the same estimate is fine.",
  ][trialStage];

  const history = [];
  if (trialStage >= 1) {
    history.push('<div class="history-item" data-report="prior"><dt>Before any advice</dt><dd>' + entry.prior + "%</dd></div>");
  }
  if (trialStage === 2) {
    history.push('<div class="history-item" data-report="report1"><dt>After ' +
      escapeHtml(advisorName(entry.firstAdvisor)) + '</dt><dd>' + entry.report1 + "%</dd></div>");
  }
  $("trial-history").hidden = history.length === 0;
  $("trial-history").innerHTML = history.length
    ? '<h3>Your earlier estimates for this photograph</h3><dl>' + history.join("") + "</dl>"
    : "";
  $("trial-scoring-help").innerHTML = scoringExplanationHtml();

  const slider = $("trial-slider");
  slider.value = 50;
  paintSlider(slider);
  sliderMoves = 0;
  sliderTouched = !CONFIG.requireSliderMove;
  $("trial-readout").textContent = sliderTouched ? "50%" : "—";
  $("trial-readout").classList.toggle("untouched", !sliderTouched);
  $("trial-error").hidden = true;
  showScreen("screen-trial");
  loadTrialPhoto(photo);
}

(function wireSlider() {
  const slider = $("trial-slider");
  slider.addEventListener("input", function () {
    if (trialImageState !== "ready") return;
    sliderMoves++;
    sliderTouched = true;
    const v = Number(slider.value);
    $("trial-readout").textContent = v + "%";
    $("trial-readout").classList.remove("untouched");
    paintSlider(slider);
    $("trial-error").hidden = true;
  });
})();

$("btn-trial").addEventListener("click", function () {
  if (trialImageState !== "ready") {
    if (trialImageState === "failed") loadTrialPhoto(state.bankById[trialRecord.photoId]);
    return;
  }
  if (!sliderTouched) {
    $("trial-error").hidden = false;
    $("trial-error").textContent = "Move the slider to the number you want, even if that number is 50.";
    return;
  }
  const value = Number($("trial-slider").value);
  const elapsed = Math.round(performance.now() - stageShownAt);
  const reportKey = ["prior", "report1", "report2"][trialStage];
  trialRecord[reportKey] = value;
  trialRecord[reportKey + "Ms"] = elapsed;
  trialRecord[reportKey + "Moves"] = sliderMoves;
  trialRecord[reportKey + "AnsweredAt"] = new Date().toISOString();
  if (trialStage < 2) {
    openStage(trialStage + 1);
    return;
  }
  trialRecord.answeredAt = trialRecord.report2AnsweredAt;
  activeRecords().push(trialRecord);
  if (!trialPractice) autosave("photograph_" + trialRecord.index + "_done");

  trialPos++;
  const plan = activePlan();
  if (trialPos >= plan.length) { finishTrials(); return; }
  if (!trialPractice && CONFIG.breakAfter && trialPos === CONFIG.breakAfter) { showBreak(); return; }
  openStage(0);
});

function showBreak() {
  setPage("break");
  $("break-body").innerHTML =
    "<p>You are halfway. " + (state.plan.length - trialPos) + " photographs to go.</p>" +
    "<p>Take a moment if you want one. Nothing is timed, and the photographs ahead work exactly like the ones behind.</p>";
  showScreen("screen-break");
}
$("btn-break").addEventListener("click", function () { openStage(0); });

function finishTrials() {
  if (trialPractice) {
    setPage("quiz"); setProgress(7); renderQuiz(); showScreen("screen-quiz");
    pushNav(function () { setPage("practice_intro"); setProgress(5); showScreen("screen-practice-intro"); });
    return;
  }
  state.finishedAt = new Date().toISOString();
  setPage("saving");
  $("saving-msg").textContent = "Saving your answers and drawing the prize…";
  showScreen("screen-saving");
  submit();
}

// =====================================================================
// Saving
// =====================================================================
let saveChain = Promise.resolve();

function payload(stage, label) {
  return {
    stage: stage,
    progressLabel: label || "",
    schema: SCHEMA_VERSION,
    build: BUILD,
    pilot: CONFIG.pilotMode,
    photoBankMetadata: state.photoBankMetadata,
    subjectId: subjectId,
    sessionCode: sessionCode,
    stationCode: stationCode,
    submissionKey: submissionKey,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    treatment: state.treatment.key,
    treatmentIdentity: state.treatment.identity,
    treatmentAccuracy: state.treatment.accuracy,
    treatmentForced: state.treatmentForced,
    blindMap: state.blindMap,
    disclosedAccuracy: accuracyDisclosed()
      ? { claude: CONFIG.advisors.claude.marginalAccuracy, gpt: CONFIG.advisors.gpt.marginalAccuracy }
      : null,
    plan: state.plan,
    practiceRecords: state.practiceRecords,
    records: state.records,
    comprehension: state.comprehension,
    payment: state.payment,
    pageTimes: pageTimesSnapshot(),
    showUpFeeHKD: CONFIG.showUpFeeHKD,
    prizeHKD: CONFIG.prizeHKD,
    submittedAt: new Date().toISOString(),
  };
}

function autosave(label) {
  if (!CONFIG.saveEndpoint || !subjectId) return saveChain;
  const body = JSON.stringify(payload("progress", label));
  saveChain = saveChain.catch(function () {}).then(async function () {
    try {
      const res = await fetch(CONFIG.saveEndpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: body,
        keepalive: true,
      });
      const reply = await res.json().catch(function () { return null; });
      if (!res.ok || !reply || reply.status !== "success") throw new Error("progress save not confirmed");
    } catch (err) {
      console.warn("Progress save failed; will retry on the next one.", err);
    }
  });
  return saveChain;
}

let failed = false;

async function submit() {
  failed = false;
  // The draw is made here and sent with the data. If the saving backend
  // returns its own draw, that one is authoritative and replaces it.
  if (!state.payment) {
    state.payment = settlePayment(state.records, state.bankById, {
      trial: Math.random(), stage: Math.random(), win: Math.random(),
    });
  }

  if (!CONFIG.saveEndpoint) {
    console.log("[not saved — no saveEndpoint set]", payload("final", "complete"));
    afterSave();
    return;
  }

  try {
    await saveChain.catch(function () {});
    const res = await fetch(CONFIG.saveEndpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload("final", "complete")),
    });
    const text = await res.text();
    const snippet = text.replace(/\s+/g, " ").slice(0, 220);
    if (!res.ok) throw new Error("Save failed (status " + res.status + ") — " + snippet);
    let reply = null;
    try { reply = JSON.parse(text); } catch (_) {}
    if (!reply || (reply.status !== "success" && reply.ok !== true)) {
      throw new Error("The saving backend did not confirm the save: " + snippet);
    }
    if (reply.schema !== undefined && reply.schema !== SCHEMA_VERSION) {
      throw new Error("Version mismatch: this page sends data format " + SCHEMA_VERSION +
        " but the backend reports " + reply.schema + ".");
    }
    if (reply.payment && typeof reply.payment.won === "boolean") state.payment = reply.payment;
    afterSave();
  } catch (err) {
    console.error(err);
    failed = true;
    $("error-detail").hidden = false;
    $("error-detail").textContent = "Technical detail: " + (err && err.message ? err.message : err);
    showScreen("screen-error");
  }
}

$("btn-retry").addEventListener("click", function () {
  $("saving-msg").textContent = "Saving your answers…";
  showScreen("screen-saving");
  submit();
});

function afterSave() {
  window.removeEventListener("beforeunload", beforeUnloadGuard);
  setPage("payment"); setProgress(TOTAL_STEPS - 1);
  renderPayment();
  showScreen("screen-payment");
}

// =====================================================================
// Payment and debrief
// =====================================================================
function renderPayment() {
  const p = state.payment;
  const photo = state.bankById[p.photoId];
  const total = CONFIG.showUpFeeHKD + p.prizeHKD;
  const truth = p.older ? "older than " + DESIGN.threshold : DESIGN.threshold + " or younger";
  const ageLine = photo && Number.isInteger(photo.age) ? " — " + photo.age + " years old" : "";

  $("payment-body").innerHTML =
    '<div class="draw">' +
    '<div class="draw-step"><span class="draw-label">The photograph drawn</span>' +
    "<span class=\"draw-value\">Photograph " + p.trialIndex + " of " + state.plan.length + "</span></div>" +
    '<div class="draw-step"><span class="draw-label">The judgement drawn</span>' +
    "<span class=\"draw-value\">" + ["Your initial estimate before any advice", "Your answer after one advisor", "Your answer after both advisors"][p.stage] + "</span></div>" +
    '<div class="draw-step"><span class="draw-label">What you entered</span>' +
    '<span class="draw-value">' + p.report + "%</span></div>" +
    '<div class="draw-step"><span class="draw-label">That person\'s real age</span>' +
    '<span class="draw-value">' + escapeHtml(truth + ageLine) + "</span></div>" +
    "</div>" +
    '<div class="result ' + (p.won ? "result-win" : "result-nowin") + '">' +
    (p.won ? "You won HK$" + CONFIG.prizeHKD : "The draw did not come out in your favour") + "</div>" +
    '<div class="totals"><div><span>Taking part</span><strong>HK$' + CONFIG.showUpFeeHKD + "</strong></div>" +
    "<div><span>Prize</span><strong>HK$" + p.prizeHKD + "</strong></div>" +
    '<div class="totals-sum"><span>Total</span><strong>HK$' + total + "</strong></div></div>";
}

$("btn-payment").addEventListener("click", function () {
  setPage("debrief"); setProgress(TOTAL_STEPS);
  renderDebrief();
  showScreen("screen-debrief");
});

function renderDebrief() {
  let html = "";
  if (state.treatment.identity === "blind") {
    const first = advisorOrderForDisplay()[0];
    html += '<div class="reveal">' +
      "<h3>Who the two systems were</h3>" +
      (CONFIG.pilotMode
        ? "<p>The advisor labels in this preview represented <strong>Claude</strong>, made by Anthropic, and <strong>ChatGPT</strong>, made by OpenAI. "
        : "<p>The advice you saw came from <strong>Claude</strong>, made by Anthropic, and <strong>ChatGPT</strong>, made by OpenAI. ") +
      "In your session, " + escapeHtml(CONFIG.blindLabels[0]) + " was <strong>" +
      escapeHtml(CONFIG.advisors[first].realName) + "</strong> and " + escapeHtml(CONFIG.blindLabels[1]) + " was <strong>" +
      escapeHtml(CONFIG.advisors[first === "claude" ? "gpt" : "claude"].realName) + "</strong>.</p>" +
      (CONFIG.pilotMode
        ? "<p>The answers in this preview were illustrative sample values, not actual responses from these systems.</p></div>"
        : "<p>Their answers were always their real answers. We held back which was which because the study compares sessions " +
          "that were told the names with sessions that were not.</p></div>");
  }
  if (!accuracyDisclosed()) {
    html += '<div class="reveal">' +
      "<h3>How often they were right</h3>" +
      "<p>Across the photographs used in this study, Claude was correct on <strong>" + accuracyPercent("claude") +
      "%</strong> and ChatGPT on <strong>" + accuracyPercent("gpt") + "%</strong>. " +
      "Some sessions were told this before starting and some, like yours, were not.</p></div>";
  }

  html += "<h3>Every photograph you saw</h3>" +
    "<p>Here is the whole session: what each system said, what you said, and the truth.</p>" +
    '<div class="table-scroll"><table class="debrief-table"><thead><tr>' +
    "<th>#</th><th>" + escapeHtml(advisorName(advisorOrderForDisplay()[0])) + "</th>" +
    "<th>" + escapeHtml(advisorName(advisorOrderForDisplay()[1])) + "</th>" +
    "<th>You, before advice</th><th>You, after one</th><th>You, after both</th><th>Truth</th></tr></thead><tbody>";

  const order = advisorOrderForDisplay();
  state.records.forEach(function (r) {
    const photo = state.bankById[r.photoId];
    const verdictFor = function (key) {
      const v = signalOf(photo, key);
      return '<span class="mini-verdict ' + (VERDICT[v].older ? "mv-older" : "mv-younger") + '">' +
        escapeHtml(VERDICT[v].text) + "</span>";
    };
    const truth = Number.isInteger(photo.age)
      ? photo.age + (photo.older ? " (older)" : " (younger)")
      : (photo.older ? "Older than " + DESIGN.threshold : DESIGN.threshold + " or younger");
    html += "<tr><td>" + r.index + "</td><td>" + verdictFor(order[0]) + "</td><td>" + verdictFor(order[1]) + "</td>" +
      "<td>" + r.prior + "%</td><td>" + r.report1 + "%</td><td>" + r.report2 + "%</td><td>" + escapeHtml(truth) + "</td></tr>";
  });
  html += "</tbody></table></div>";

  html += '<div class="closing"><p>' + escapeHtml(CONFIG.completionMessage) + "</p></div>";
  if (!CONFIG.saveEndpoint) {
    html += '<div class="notice">Data collection is switched off, so nothing was sent anywhere. ' +
      "For piloting you can download this session:</div>" +
      '<button class="btn-secondary" id="btn-download">Download this session (JSON)</button>';
  }
  $("debrief-body").innerHTML = html;

  const dl = $("btn-download");
  if (dl) {
    dl.addEventListener("click", function () {
      const blob = new Blob([JSON.stringify(payload("final", "download"), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "belief-study-" + (subjectId || "session") + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
}
