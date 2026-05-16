(() => {
 const CASES = window.SCBD_CASES || [];
 const FRAMEWORKS = window.SCBD_FRAMEWORKS || [];
 const REFERENCES = window.SCBD_REFERENCES || [];
 const API_BASE = window.API_BASE || "https://key2md-api.brittainmbbs.workers.dev";
 const STORAGE_KEY = "key2md-scbd-progress-v1";
 const DRAFT_STORAGE_KEY = "key2md-scbd-drafts-v2";
 const app = document.getElementById("scbdApp");
 let lastDraftSaveAt = 0;

 const PHASES = [
  { id: "history", number: 1, title: "History", scope: "history", verb: "Ask history", next: "examination" },
  { id: "examination", number: 2, title: "Examination", scope: "examination", verb: "Examine", next: "investigations" },
  { id: "investigations", number: 3, title: "Investigations", scope: "investigations", verb: "Order tests", next: "management" },
  { id: "management", number: 4, title: "Management", scope: "", verb: "Manage", next: "debrief" }
 ];

 const CONCEPTS = {
  anaemia: ["anaemia", "anemia", "pale", "pallor", "iron", "ferritin", "microcytic", "breathless", "fatigue", "tired", "pica"],
  thyroid: ["thyroid", "tsh", "t4", "t3", "heat intolerance", "cold intolerance", "brittle hair", "coarse hair", "dry skin", "hair thinning", "tremor", "goitre", "goiter", "sweat", "diarrhoea", "constipation"],
  cardiac: ["cardiac", "heart", "ecg", "chest pain", "palpitations", "syncope", "murmur", "jvp", "oedema", "edema", "orthopnoea", "heart failure", "pulse"],
  chestPain: ["chest pain", "pressure", "tight", "crushing", "radiation", "arm pain", "jaw pain", "diaphoresis", "sweat", "nausea"],
  shortnessBreath: ["shortness of breath", "short of breath", "sob", "breathless", "dyspnoea", "dyspnea", "oxygen", "sats", "spo2", "wheeze"],
  vte: ["pe", "pulmonary embolism", "dvt", "clot", "calf", "haemoptysis", "hemoptysis", "pleuritic", "travel", "flight", "oestrogen", "estrogen", "pill"],
  pregnancy: ["pregnancy", "pregnant", "lmp", "last period", "hcg", "ectopic", "miscarriage", "contraception", "vaginal bleeding", "spotting"],
  neuro: ["neurology", "neuro", "weakness", "numbness", "speech", "vision", "diplopia", "ataxia", "seizure", "gcs", "cranial nerves", "coordination"],
  headache: ["headache", "migraine", "thunderclap", "photophobia", "neck stiffness", "meningism", "papilloedema", "papilledema"],
  infection: ["infection", "fever", "rigors", "chills", "sepsis", "lactate", "culture", "antibiotics", "source", "crp", "wcc"],
  bowel: ["bowel", "stool", "poo", "constipation", "diarrhoea", "diarrhea", "rectal", "bleeding", "melaena", "melena", "colonoscopy", "fobt", "fit"],
  abdominalPain: ["abdominal", "abdomen", "guarding", "peritonism", "rebound", "vomiting", "nausea", "distension", "flank"],
  urinary: ["urine", "urinary", "dysuria", "frequency", "urgency", "retention", "incontinence", "kidney", "flank", "bladder"],
  backPain: ["back pain", "sciatica", "saddle", "urinary retention", "anal tone", "leg weakness", "disc", "spine"],
  diabetes: ["diabetes", "glucose", "bgl", "hba1c", "ketones", "dka", "polyuria", "polydipsia", "thirst", "insulin"],
  mood: ["mood", "depression", "anhedonia", "suicide", "self harm", "mania", "psychosis", "supports", "safety plan", "sleep"],
  parkinson: ["parkinson", "tremor", "rigidity", "bradykinesia", "shuffling", "anosmia", "micrographia", "rem sleep", "dream enactment"],
  falls: ["falls", "fall", "syncope", "collapse", "gait", "balance", "postural", "orthostatic", "injury"],
  meds: ["medication", "medicines", "meds", "allergy", "anticoagulant", "blood thinner", "steroids", "opioid", "sedative", "anticholinergic"],
  bloods: ["bloods", "fbe", "uec", "lft", "crp", "coag", "inr", "renal", "electrolytes", "haemoglobin", "hemoglobin"],
  resp: ["respiratory", "lungs", "wheeze", "crackles", "air entry", "cough", "sputum", "pneumonia", "asthma", "copd"],
  vitals: ["vitals", "observations", "blood pressure", "heart rate", "respiratory rate", "temperature", "oxygen", "sats", "spo2", "perfusion"],
  imaging: ["imaging", "xray", "x-ray", "ct", "mri", "ultrasound", "scan", "angiogram"]
 };

 const BROAD_TERMS = {
  history: {
   "onset": ["hopc"],
   "when did it start": ["hopc"],
   "duration": ["hopc"],
   "how long": ["hopc"],
   "getting worse": ["hopc"],
   "worsening": ["hopc"],
   "progression": ["hopc"],
   "has this happened before": ["hopc"],
   "ever happened before": ["hopc"],
   "previous episodes": ["hopc"],
   "first time": ["hopc"],
   "what makes it better": ["hopc"],
   "what makes it worse": ["hopc"],
   "relieving factors": ["hopc"],
   "aggravating factors": ["hopc"],
   "systems review": ["constitutional", "cardiac", "resp", "bowel", "urinary", "neuro", "mood"],
   "red flags": ["redflag"],
   "social history": ["background"],
   "past history": ["background"],
   "medications": ["meds"],
   "family history": ["background"],
   "constitutional": ["constitutional"],
   "bowel symptoms": ["bowel"],
   "thyroid symptoms": ["thyroid"],
   "diabetes symptoms": ["diabetes"],
   "suicide risk": ["mood"],
   "vte risk": ["vte"]
  },
  examination: {
   "full exam": ["general", "cardiovascular", "respiratory", "abdomen", "neurological"],
   "vitals": ["general", "bedside"],
   "observations": ["general", "bedside"],
   "cardio exam": ["cardiovascular"],
   "cardiovascular exam": ["cardiovascular"],
   "resp exam": ["respiratory"],
   "respiratory exam": ["respiratory"],
   "abdo exam": ["abdomen"],
   "abdominal exam": ["abdomen"],
   "neuro exam": ["neurological"],
   "neurological exam": ["neurological"],
   "mental state": ["mental"],
   "mse": ["mental"],
   "pelvic exam": ["pelvic"],
   "rectal exam": ["rectal"]
  },
  investigations: {
   "bedside": ["bedside"],
   "bloods": ["bloods"],
   "imaging": ["imaging"],
   "special": ["special"],
   "baseline bloods": ["bloods"],
   "urine": ["bedside", "special"],
   "ecg": ["bedside"]
  }
 };

 const CONCEPT_TERM_MATCHES = new Set([
  "anaemia", "thyroid", "cardiac", "vte", "pregnancy", "headache", "bowel",
  "urinary", "backPain", "diabetes", "mood", "parkinson", "falls", "meds"
 ]);

 const MATCH_STOPWORDS = new Set([
 "a", "an", "and", "any", "are", "ask", "about", "check", "do", "does", "exam", "examination",
  "ever", "for", "had", "has", "happened", "have", "i", "in", "is", "it", "look", "looking", "of",
  "or", "order", "perform", "request", "that", "the", "they", "this", "to", "will", "with", "would"
 ]);

 const state = {
  route: "library",
  filters: { presentation: "all", difficulty: "all", setting: "all" },
  activeCaseId: "",
  phase: "library",
  trainingMode: false,
  aiCoach: false,
  semanticFallback: true,
  semanticUnavailable: false,
  examinerLoading: false,
  coachLoading: false,
  coachMessage: "",
  coachError: "",
  strictness: "balanced",
  askScope: "history",
  askText: "",
  notes: "",
  summary: "",
  ddxInput: "",
  ddx: [],
  postHistoryDdxInput: "",
  postHistoryDdx: [],
  postExamDdxInput: "",
  postExamDdx: [],
  management: "",
  workingDiagnosis: "",
  revealed: { history: [], examination: [], investigations: [] },
  log: [],
  noteRemaining: 900,
  stationRemaining: 900,
  timerMode: "",
  timer: null,
  lastSavedAt: "",
  lastDebrief: null
 };

 function loadProgress() {
  try {
   return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"attempts":[]}');
  } catch {
   return { attempts: [] };
  }
 }

 function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
 }

 function loadDrafts() {
  try {
   const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "{}");
   return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
   return {};
  }
 }

 function saveDrafts(drafts) {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts || {}));
 }

 function draftForCase(caseId) {
  return loadDrafts()[caseId] || null;
 }

 function deleteDraft(caseId = state.activeCaseId) {
  if (!caseId) return;
  const drafts = loadDrafts();
  delete drafts[caseId];
  saveDrafts(drafts);
 }

 function draftablePhase() {
  return state.route === "practice" && state.activeCaseId && !["library", "debrief"].includes(state.phase);
 }

 function serialiseDraft() {
  return {
   version: 2,
   activeCaseId: state.activeCaseId,
   phase: state.phase,
   trainingMode: state.trainingMode,
   aiCoach: state.aiCoach,
   semanticFallback: state.semanticFallback,
   semanticUnavailable: state.semanticUnavailable,
   strictness: state.strictness,
   askScope: state.askScope,
   askText: state.askText,
   notes: state.notes,
   summary: state.summary,
   ddxInput: state.ddxInput,
   ddx: state.ddx,
   postHistoryDdxInput: state.postHistoryDdxInput,
   postHistoryDdx: state.postHistoryDdx,
   postExamDdxInput: state.postExamDdxInput,
   postExamDdx: state.postExamDdx,
   management: state.management,
   workingDiagnosis: state.workingDiagnosis,
   revealed: state.revealed,
   log: state.log,
   noteRemaining: state.noteRemaining,
   stationRemaining: state.stationRemaining,
   savedAt: new Date().toISOString()
  };
 }

 function saveCurrentDraft(force = false) {
  if (!draftablePhase()) return;
  const now = Date.now();
  if (!force && now - lastDraftSaveAt < 600) return;
  const drafts = loadDrafts();
  const draft = serialiseDraft();
  drafts[state.activeCaseId] = draft;
  saveDrafts(drafts);
  lastDraftSaveAt = now;
  state.lastSavedAt = draft.savedAt;
  updateSavedDom();
 }

 function restoreDraft(draft) {
  if (!draft?.activeCaseId) return false;
  stopTimer();
  state.activeCaseId = draft.activeCaseId;
  state.route = "practice";
  state.phase = ["notes", "history", "examination", "investigations", "management", "debrief"].includes(draft.phase) ? draft.phase : "history";
  state.trainingMode = Boolean(draft.trainingMode);
  state.aiCoach = Boolean(draft.aiCoach);
  state.semanticFallback = draft.semanticFallback !== false;
  state.semanticUnavailable = Boolean(draft.semanticUnavailable);
  state.examinerLoading = false;
  state.coachLoading = false;
  state.coachMessage = "";
  state.coachError = "";
  state.strictness = draft.strictness || "balanced";
  state.askScope = draft.askScope || phaseScope(state.phase) || "history";
  state.askText = draft.askText || "";
  state.notes = draft.notes || "";
  state.summary = draft.summary || "";
  state.ddxInput = draft.ddxInput || "";
  state.ddx = Array.isArray(draft.ddx) ? draft.ddx : [];
  state.postHistoryDdxInput = draft.postHistoryDdxInput || "";
  state.postHistoryDdx = Array.isArray(draft.postHistoryDdx) ? draft.postHistoryDdx : [];
  state.postExamDdxInput = draft.postExamDdxInput || "";
  state.postExamDdx = Array.isArray(draft.postExamDdx) ? draft.postExamDdx : [];
  state.management = draft.management || "";
  state.workingDiagnosis = draft.workingDiagnosis || "";
  state.revealed = {
   history: Array.isArray(draft.revealed?.history) ? draft.revealed.history : [],
   examination: Array.isArray(draft.revealed?.examination) ? draft.revealed.examination : [],
   investigations: Array.isArray(draft.revealed?.investigations) ? draft.revealed.investigations : []
  };
  state.log = Array.isArray(draft.log) ? draft.log : [];
  state.noteRemaining = Number.isFinite(Number(draft.noteRemaining)) ? Number(draft.noteRemaining) : 900;
  state.stationRemaining = Number.isFinite(Number(draft.stationRemaining)) ? Number(draft.stationRemaining) : 900;
  state.lastSavedAt = draft.savedAt || "";
  state.lastDebrief = null;
  render();
  if (state.phase === "notes") startTimer("notes");
  else if (["history", "examination", "investigations", "management"].includes(state.phase)) startTimer("station");
  return true;
 }

 function getCase() {
  return CASES.find(c => c.id === state.activeCaseId) || CASES[0];
 }

 function getFramework(id) {
  return FRAMEWORKS.find(f => f.id === id) || FRAMEWORKS[0];
 }

 function phaseMeta(phase = state.phase) {
  return PHASES.find(item => item.id === phase) || PHASES[0];
 }

 function phaseLabel(phase = state.phase) {
  if (phase === "notes") return "Viewing notes";
  if (phase === "debrief") return "Debrief";
  return phaseMeta(phase).title;
 }

 function phaseScope(phase = state.phase) {
  return phaseMeta(phase)?.scope || "";
 }

 function phaseIndex(phase = state.phase) {
  const index = PHASES.findIndex(item => item.id === phase);
  return index >= 0 ? index : 0;
 }

 function phaseHasStarted(phase) {
  if (state.phase === "debrief") return true;
  return phaseIndex(phase) <= phaseIndex(state.phase);
 }

 function scopeAttemptCount(scope) {
  return state.log.filter(entry => entry.scope === scope).length;
 }

 function scopeRevealCount(scope) {
  return state.revealed[scope]?.length || 0;
 }

 function allStudentDdx() {
  return unique([...state.ddx, ...state.postHistoryDdx, ...state.postExamDdx]);
 }

 function formatSavedAt(iso) {
  if (!iso) return "Not saved yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Saved locally";
  return `Saved ${date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
 }

 function updateSavedDom() {
  const el = document.querySelector("[data-saved-status]");
  if (el) el.textContent = formatSavedAt(state.lastSavedAt);
 }

 function escapeHtml(value) {
  return String(value ?? "")
   .replace(/&/g, "&amp;")
   .replace(/</g, "&lt;")
   .replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;")
   .replace(/'/g, "&#039;");
 }

 function normalize(text) {
  return String(text || "")
   .toLowerCase()
   .replace(/&/g, " and ")
   .replace(/\bsob\b/g, " shortness of breath ")
   .replace(/\bbp\b/g, " blood pressure ")
   .replace(/\bhr\b/g, " heart rate ")
   .replace(/\brr\b/g, " respiratory rate ")
   .replace(/\baf\b/g, " atrial fibrillation ")
   .replace(/\bpe\b/g, " pulmonary embolism ")
   .replace(/\bdvt\b/g, " deep vein thrombosis ")
   .replace(/\bmi\b/g, " myocardial infarction ")
   .replace(/\bdka\b/g, " diabetic ketoacidosis ")
   .replace(/\buti\b/g, " urinary tract infection ")
   .replace(/[^a-z0-9]+/g, " ")
   .replace(/\s+/g, " ")
   .trim();
 }

 function tokens(text) {
  return normalize(text).split(" ").filter(t => t.length > 1 && !MATCH_STOPWORDS.has(t));
 }

 function unique(values) {
  return [...new Set(values.filter(Boolean))];
 }

 function conceptTerms(item) {
  return (item.concepts || [])
   .filter(concept => CONCEPT_TERM_MATCHES.has(concept))
   .flatMap(concept => CONCEPTS[concept] || []);
 }

 function itemTerms(item, scope) {
  return unique([
   item.label,
   item.answer,
   item.result,
   ...(item.keywords || []),
   ...(item.aliases || []),
   ...(scope === "investigations" ? [] : (item.concepts || [])),
   ...(scope === "investigations" ? [] : conceptTerms(item))
  ]);
 }

 function editDistanceWithinOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
   if (a[i] === b[j]) {
    i++;
    j++;
   } else {
    edits++;
    if (edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
   }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
 }

 function tokenOverlapScore(queryTokens, termTokens) {
  if (!queryTokens.length || !termTokens.length) return 0;
  let hits = 0;
  for (const t of termTokens) {
   if (queryTokens.includes(t)) {
    hits++;
   } else if (t.length > 4 && queryTokens.some(q => q.length > 4 && editDistanceWithinOne(q, t))) {
    hits += 0.85;
   }
  }
  return hits / Math.max(termTokens.length, 1);
 }

 function scoreTerm(queryNorm, queryTokens, term) {
  const termNorm = normalize(term);
  if (!termNorm || termNorm.length < 2) return 0;
  if (queryNorm === termNorm) return 1.05;
  if (queryNorm.includes(termNorm) && termNorm.length > 2) return 1;
  if (termNorm.includes(queryNorm) && queryNorm.length > 4) return 0.72;
  const termTokens = termNorm.split(" ").filter(t => t.length > 1 && !MATCH_STOPWORDS.has(t));
  if (termTokens.length === 1) {
   const t = termTokens[0];
   if (queryTokens.includes(t)) return 0.8;
   if (t.length > 4 && queryTokens.some(q => editDistanceWithinOne(q, t))) return 0.58;
   return 0;
  }
  return tokenOverlapScore(queryTokens, termTokens) * 0.68;
 }

 function allItems(caseData, scope) {
  if (!caseData) return [];
  if (scope === "history") return caseData.history || [];
  if (scope === "examination") return caseData.examination || [];
  if (scope === "investigations") return caseData.investigations || [];
  return [];
 }

 function broadMatches(scope, queryNorm) {
  const map = BROAD_TERMS[scope] || {};
  const found = [];
  for (const [term, groups] of Object.entries(map)) {
   if (queryNorm.includes(normalize(term))) found.push(...groups);
  }
  return found;
 }

 function itemBroadScore(item, groups, scope) {
  if (!groups.length) return 0;
  if (scope === "history") {
   if (groups.includes(item.group)) return 0.74;
   if ((item.concepts || []).some(c => groups.includes(c))) return 0.74;
  }
  if (scope === "examination") {
   if (groups.includes(item.system)) return 0.76;
   if ((item.concepts || []).some(c => groups.includes(c))) return 0.62;
  }
  if (scope === "investigations") {
   if (groups.includes(item.tier)) return 0.78;
   if ((item.concepts || []).some(c => groups.includes(c))) return 0.62;
  }
  return 0;
 }

 function thresholdFor(scope) {
  const base = state.strictness === "strict" ? 0.72 : state.strictness === "generous" ? 0.32 : 0.48;
  if (scope === "investigations" && state.strictness === "balanced") return 0.42;
  return base;
 }

 function maxMatchesFor(scope) {
  if (state.strictness === "strict") return scope === "investigations" ? 3 : 2;
  if (state.strictness === "generous") return scope === "investigations" ? 7 : 6;
  return scope === "investigations" ? 5 : 4;
 }

 function findMatches(caseData, scope, query) {
  const queryNorm = normalize(query);
  const queryTokens = tokens(query);
  if (!queryNorm || queryNorm.length < 2) return [];
  const groups = broadMatches(scope, queryNorm);
  const scored = allItems(caseData, scope).map(item => {
   const termScore = Math.max(0, ...itemTerms(item, scope).map(term => scoreTerm(queryNorm, queryTokens, term)));
   const broadScore = state.strictness === "strict" ? 0 : itemBroadScore(item, groups, scope);
   const score = Math.max(termScore, broadScore);
   return { item, score, termScore, broadScore };
  });
  const threshold = thresholdFor(scope);
  const hasDirectMatch = scored.some(entry => entry.termScore >= threshold);
  return scored
   .filter(entry => hasDirectMatch ? entry.termScore >= threshold : entry.score >= threshold)
   .sort((a, b) => b.score - a.score || itemWeight(b.item) - itemWeight(a.item))
   .slice(0, maxMatchesFor(scope))
   .map(entry => entry.item);
 }

 function matchFreeText(text, candidates) {
  const queryNorm = normalize(text);
  const queryTokens = tokens(text);
  return candidates.some(candidate => scoreTerm(queryNorm, queryTokens, candidate) >= 0.6);
 }

 function isRevealed(scope, id) {
  return state.revealed[scope].includes(id);
 }

 function itemWeight(item) {
  const value = Number(item?.weight);
  return Number.isFinite(value) ? Math.max(0, value) : 1;
 }

 function itemReasoningCredit(item, scope) {
  if (itemWeight(item) > 0) return 0;
  const explicit = Number(item?.reasoningCredit);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (scope === "history") return 0.3;
  if (scope === "examination") return 0.2;
  if (scope === "investigations") return 0.2;
  return 0;
 }

 function reasoningCreditCap(scope, maxPoints) {
  if (scope === "history") return Math.min(1.2, maxPoints * 0.15);
  if (scope === "examination") return Math.min(0.6, maxPoints * 0.15);
  if (scope === "investigations") return Math.min(0.6, maxPoints * 0.15);
  return 0;
 }

 function reveal(scope, id) {
  if (!isRevealed(scope, id)) state.revealed[scope].push(id);
 }

 function formatTime(sec) {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
 }

 function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.timerMode = "";
 }

 function startTimer(mode) {
  stopTimer();
  state.timerMode = mode;
  state.timer = setInterval(() => {
   if (mode === "notes") state.noteRemaining = Math.max(0, state.noteRemaining - 1);
   if (mode === "station") state.stationRemaining = Math.max(0, state.stationRemaining - 1);
   updateTimerDom();
   if (Date.now() - lastDraftSaveAt > 15000) saveCurrentDraft(true);
   if ((mode === "notes" && state.noteRemaining === 0) || (mode === "station" && state.stationRemaining === 0)) {
    stopTimer();
   }
  }, 1000);
  updateTimerDom();
 }

 function updateTimerDom() {
  const notes = document.querySelector("[data-timer='notes']");
  const station = document.querySelector("[data-timer='station']");
  if (notes) {
   notes.textContent = formatTime(state.noteRemaining);
   notes.classList.toggle("urgent", state.noteRemaining <= 60);
  }
  if (station) {
   station.textContent = formatTime(state.stationRemaining);
   station.classList.toggle("urgent", state.stationRemaining <= 60);
  }
  const noteFill = document.querySelector("[data-fill='notes']");
  const stationFill = document.querySelector("[data-fill='station']");
  if (noteFill) noteFill.style.width = `${100 - (state.noteRemaining / 900) * 100}%`;
  if (stationFill) stationFill.style.width = `${100 - (state.stationRemaining / 900) * 100}%`;
 }

 function routeTo(route) {
  saveCurrentDraft(true);
  stopTimer();
  state.route = route;
  if (route !== "practice") state.phase = route;
  render();
 }

 function startCase(caseId) {
  stopTimer();
  deleteDraft(caseId);
  state.activeCaseId = caseId;
  state.route = "practice";
  state.phase = "notes";
  state.strictness = "balanced";
  state.askScope = "history";
  state.askText = "";
  state.examinerLoading = false;
  state.semanticUnavailable = false;
  state.coachLoading = false;
  state.coachMessage = "";
  state.coachError = "";
  state.notes = "";
  state.summary = "";
  state.ddxInput = "";
  state.ddx = [];
  state.postHistoryDdxInput = "";
  state.postHistoryDdx = [];
  state.postExamDdxInput = "";
  state.postExamDdx = [];
  state.management = "";
  state.workingDiagnosis = "";
  state.revealed = { history: [], examination: [], investigations: [] };
  state.log = [];
  state.noteRemaining = 900;
  state.stationRemaining = 900;
  state.lastSavedAt = "";
  state.lastDebrief = null;
  render();
  startTimer("notes");
  saveCurrentDraft(true);
 }

 function resumeCase(caseId) {
  const draft = draftForCase(caseId);
  if (!draft) {
   startCase(caseId);
   return;
  }
  restoreDraft(draft);
 }

 function canAdvancePhase(phase = state.phase) {
  if (phase === "history") {
   return state.postHistoryDdx.length > 0 && scopeAttemptCount("history") > 0;
  }
  if (phase === "examination") return scopeAttemptCount("examination") > 0;
  if (phase === "investigations") return scopeAttemptCount("investigations") > 0;
  return true;
 }

 function phaseBlockerText(phase = state.phase) {
  if (phase === "history") {
   if (scopeAttemptCount("history") === 0) return "Ask at least one history question before moving to examination.";
   if (!state.postHistoryDdx.length) return "Add at least one updated differential based on the history before moving to examination.";
  }
  if (phase === "examination" && scopeAttemptCount("examination") === 0) return "Record at least one examination request before ordering investigations.";
  if (phase === "investigations" && scopeAttemptCount("investigations") === 0) return "Order at least one investigation before moving to management.";
  return "";
 }

 function goToPhase(nextPhase) {
  if (!["history", "examination", "investigations", "management"].includes(nextPhase)) return;
  const nextIndex = phaseIndex(nextPhase);
  const currentIndex = phaseIndex(state.phase);
  if (nextIndex > currentIndex && !canAdvancePhase(state.phase)) {
   state.coachMessage = phaseBlockerText(state.phase);
   state.coachError = "";
   render();
   return;
  }
  state.phase = nextPhase;
  state.askScope = phaseScope(nextPhase) || state.askScope;
  state.askText = "";
  state.coachMessage = "";
  state.coachError = "";
  render();
  saveCurrentDraft(true);
 }

 function beginStation() {
  stopTimer();
  state.phase = "history";
  state.askScope = "history";
  state.stationRemaining = 900;
  render();
  startTimer("station");
  saveCurrentDraft(true);
 }

 async function askExaminer() {
  if (state.examinerLoading) return;
  const caseData = getCase();
  const scope = state.askScope;
  const query = state.askText.trim();
  if (!query) return;
  let matches = findMatches(caseData, scope, query);
  let source = "local";
  let apiError = "";
  if (!matches.length && state.semanticFallback && !state.semanticUnavailable) {
   state.examinerLoading = true;
   render();
   try {
    matches = await semanticExaminerMatch(caseData, scope, query);
    source = matches.length ? "semantic" : "none";
   } catch (err) {
    apiError = err.message || "Semantic fallback unavailable";
    state.semanticUnavailable = true;
    source = "none";
   } finally {
    state.examinerLoading = false;
   }
  }
  const newMatches = matches.filter(item => !isRevealed(scope, item.id));
  for (const item of newMatches) reveal(scope, item.id);
  state.log.unshift({
   scope,
   query,
   source,
   apiError,
   matchedIds: matches.map(m => m.id),
   newIds: newMatches.map(m => m.id),
   at: new Date().toISOString()
  });
  state.askText = "";
  state.coachMessage = "";
  state.coachError = "";
  render();
  saveCurrentDraft(true);
 }

 async function semanticExaminerMatch(caseData, scope, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  const validItems = allItems(caseData, scope);
  const response = await fetch(`${API_BASE}/api/scbd-coach`, {
   method: "POST",
   headers: coachHeaders(),
   signal: controller.signal,
   body: JSON.stringify({
    mode: "route_query",
    scope,
    query,
    strictness: state.strictness,
    maxItems: maxMatchesFor(scope),
    case: {
     id: caseData.id,
     stem: caseData.stem,
     presentation: caseData.presentation,
     setting: caseData.setting,
     hidden: Boolean(caseData.hidden)
    },
    items: validItems.map(item => ({
     id: item.id,
     label: item.label,
     answer: scope === "investigations" ? item.result : item.answer,
     keywords: item.keywords || [],
     concepts: item.concepts || [],
     group: item.group || item.system || item.tier || "",
     weight: itemWeight(item)
    }))
   })
  }).finally(() => clearTimeout(timer));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "Semantic fallback unavailable");
  const ids = Array.isArray(data.itemIds) ? data.itemIds : [];
  const allowed = new Set(validItems.map(item => item.id));
  return ids
   .filter(id => allowed.has(id))
   .slice(0, maxMatchesFor(scope))
   .map(id => validItems.find(item => item.id === id))
   .filter(Boolean);
 }

 function findNudgeTarget(caseData) {
  const primary = allItems(caseData, state.askScope)
   .filter(item => !isRevealed(state.askScope, item.id))
   .sort((a, b) => itemWeight(b) - itemWeight(a))[0];
  if (primary) return { scope: state.askScope, item: primary };
  for (const scope of ["history", "examination", "investigations"]) {
   const item = allItems(caseData, scope)
    .filter(candidate => !isRevealed(scope, candidate.id))
    .sort((a, b) => itemWeight(b) - itemWeight(a))[0];
   if (item) return { scope, item };
  }
  return null;
 }

 function localCoachNudge(target) {
  if (!target) return "You have covered the prepared hidden information. Use the remaining time to tighten your working diagnosis and management.";
  const { scope, item } = target;
  const concepts = item.concepts || [];
  const highRisk = itemWeight(item) >= 3 || item.group === "redflag";
  if (concepts.includes("vte")) return "Is there a thrombotic or embolic pathway you still need to actively stress-test?";
  if (concepts.includes("pregnancy")) return "Is there a reproductive-age safety check that would change urgency or disposition?";
  if (concepts.includes("neuro")) return "What neurological danger signs would make this unsafe to manage routinely?";
  if (concepts.includes("infection")) return "Have you separated a local infection from systemic illness or sepsis physiology?";
  if (concepts.includes("bowel")) return "Could a bleeding, obstruction or malignancy pathway be hiding behind this presentation?";
  if (concepts.includes("diabetes")) return "Is there a bedside metabolic test that would immediately change how safe this patient is?";
  if (concepts.includes("mood")) return "Have you established immediate safety, not just diagnostic symptoms?";
  if (concepts.includes("cardiac")) return "What cardiac instability features would force urgent escalation?";
  if (concepts.includes("thyroid")) return "Is an endocrine pattern tying together the systemic symptoms?";
  if (concepts.includes("falls")) return "Could the fall reflect a transient loss of consciousness rather than a simple mechanical trip?";
  if (scope === "examination") return highRisk ? "What sign would make this patient unstable right now?" : "Which focused finding would move your top differentials up or down?";
  if (scope === "investigations") return highRisk ? "What bedside or first-line test would change disposition within minutes?" : "Which tier of investigation gives the safest next answer first?";
  return highRisk
   ? "Before leaving history, what dangerous diagnosis does this presentation force you to rule out?"
   : "What discriminator would most efficiently narrow your current differential?";
 }

 function coachHeaders() {
  const headers = { "Content-Type": "application/json" };
  try {
   const token = localStorage.getItem("key2md_token");
   if (token) headers.Authorization = `Bearer ${token}`;
  } catch {}
  return headers;
 }

 function sanitizeNudge(nudge, caseData, target) {
  const fallback = localCoachNudge(target);
  let clean = String(nudge || "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  const banned = [
   caseData.finalDiagnosis,
   ...(caseData.diagnosisAliases || []),
   target?.item?.label,
   target?.item?.answer,
   target?.item?.result
  ].filter(Boolean).map(normalize).filter(value => value.length > 3);
  const cleanNorm = normalize(clean);
  if (banned.some(term => cleanNorm.includes(term))) return fallback;
  if (clean.length > 220) clean = `${clean.slice(0, 217).trim()}...`;
  return clean;
 }

 async function requestCoachNudge() {
  if (state.coachLoading) return;
  const caseData = getCase();
  const target = findNudgeTarget(caseData);
  const fallback = localCoachNudge(target);
  if (!state.aiCoach) {
   state.coachMessage = fallback;
   state.coachError = "";
   render();
   return;
  }
  state.coachLoading = true;
  state.coachError = "";
  state.coachMessage = "";
  render();
  try {
   const response = await fetch(`${API_BASE}/api/scbd-coach`, {
    method: "POST",
    headers: coachHeaders(),
    body: JSON.stringify({
     mode: "nudge",
     phase: state.askScope,
     strictness: state.strictness,
     case: {
      stem: caseData.stem,
      presentation: caseData.presentation,
      setting: caseData.setting,
      difficulty: caseData.difficulty,
      hidden: Boolean(caseData.hidden)
     },
     student: {
      summary: state.summary.slice(0, 800),
      ddx: state.ddx.slice(0, 12),
      recentQueries: state.log.slice(0, 8).map(entry => ({ scope: entry.scope, query: entry.query, matched: entry.matchedIds.length > 0 }))
     },
     target: target ? {
      scope: target.scope,
      weight: itemWeight(target.item),
      group: target.item.group || target.item.system || target.item.tier || "",
      concepts: target.item.concepts || [],
      teaching: target.item.teaching || ""
     } : null,
     bannedTerms: [
      caseData.finalDiagnosis,
      ...(caseData.diagnosisAliases || []),
      target?.item?.label,
      target?.item?.answer,
      target?.item?.result
     ].filter(Boolean)
    })
   });
   const data = await response.json().catch(() => ({}));
   if (!response.ok) throw new Error(data.message || data.error || "AI coach unavailable");
   state.coachMessage = sanitizeNudge(data.nudge, caseData, target);
  } catch (err) {
   state.coachMessage = fallback;
   state.coachError = `${err.message || "AI coach unavailable"}; using local nudge.`;
  } finally {
   state.coachLoading = false;
   render();
  }
 }

 function ddxField(kind = "initial") {
  if (kind === "postHistory") return { input: "postHistoryDdxInput", list: "postHistoryDdx" };
  if (kind === "postExam") return { input: "postExamDdxInput", list: "postExamDdx" };
  return { input: "ddxInput", list: "ddx" };
 }

 function addDdx(kind = "initial") {
  const fields = ddxField(kind);
  const value = state[fields.input].trim();
  if (!value) return;
  if (!state[fields.list].some(existing => normalize(existing) === normalize(value))) state[fields.list].push(value);
  state[fields.input] = "";
  render();
  saveCurrentDraft(true);
 }

 function removeDdx(kind = "initial", index) {
  const fields = ddxField(kind);
  state[fields.list].splice(index, 1);
  render();
  saveCurrentDraft(true);
 }

 function scoreDomain(caseData, scope, maxPoints) {
  const items = allItems(caseData, scope);
  const coreItems = items.filter(item => itemWeight(item) > 0);
  const extraItems = items.filter(item => itemWeight(item) === 0 && itemReasoningCredit(item, scope) > 0);
  const total = coreItems.reduce((sum, item) => sum + itemWeight(item), 0) || 1;
  const got = coreItems.reduce((sum, item) => sum + (isRevealed(scope, item.id) ? itemWeight(item) : 0), 0);
  const coreScore = (got / total) * maxPoints;
  const bonusRaw = extraItems.reduce((sum, item) => sum + (isRevealed(scope, item.id) ? itemReasoningCredit(item, scope) : 0), 0);
  const availableBonus = Math.round(Math.min(reasoningCreditCap(scope, maxPoints), bonusRaw) * 10) / 10;
  const score = Math.round(Math.min(maxPoints, coreScore + availableBonus) * 10) / 10;
  const appliedBonus = Math.round(Math.max(0, score - coreScore) * 10) / 10;
  return {
   score,
   max: maxPoints,
   coreScore: Math.round(coreScore * 10) / 10,
   bonus: appliedBonus,
   availableBonus,
   got,
   total,
   extraMatched: extraItems.filter(item => isRevealed(scope, item.id)),
   missed: coreItems.filter(item => !isRevealed(scope, item.id))
  };
 }

 function scoreManagement(caseData) {
  const plan = state.management;
  const items = caseData.management || [];
  const total = items.reduce((sum, item) => sum + itemWeight(item), 0) || 1;
  const matched = [];
  const missed = [];
  for (const item of items) {
   const candidates = [item.label, ...(item.keywords || [])];
   if (matchFreeText(plan, candidates)) matched.push(item);
   else missed.push(item);
  }
  const got = matched.reduce((sum, item) => sum + itemWeight(item), 0);
  return {
   score: Math.round((got / total) * 4 * 10) / 10,
   max: 4,
   got,
   total,
   matched,
   missed: missed.filter(item => itemWeight(item) > 0)
  };
 }

 function ddxAnalysis(caseData) {
  const expected = [
   ...(caseData.ddx?.must || []).map(d => ({ ...d, tier: "must" })),
   ...(caseData.ddx?.should || []).map(d => ({ ...d, tier: "should" })),
   ...(caseData.ddx?.bonus || []).map(d => ({ ...d, tier: "bonus" }))
  ];
  const matchedExpected = expected.filter(entry => {
   const terms = [entry.name, ...(entry.aliases || [])];
   return allStudentDdx().some(user => matchFreeText(user, terms));
  });
  const unmatchedUser = allStudentDdx().filter(user => {
   return !expected.some(entry => matchFreeText(user, [entry.name, ...(entry.aliases || [])]));
  });
  return {
   matchedExpected,
   missingMust: (caseData.ddx?.must || []).filter(entry => !matchedExpected.some(m => m.name === entry.name)),
   unmatchedUser
  };
 }

 function diagnosisMatched(caseData) {
  return matchFreeText(state.workingDiagnosis, [caseData.finalDiagnosis, ...(caseData.diagnosisAliases || [])]);
 }

 function buildDebrief() {
  const caseData = getCase();
  const history = scoreDomain(caseData, "history", 8);
  const exam = scoreDomain(caseData, "examination", 4);
  const investigations = scoreDomain(caseData, "investigations", 4);
  const management = scoreManagement(caseData);
  const total = Math.round((history.score + exam.score + investigations.score + management.score) * 10) / 10;
  return {
   caseId: caseData.id,
   caseTitle: caseData.title,
   total,
   domains: { history, exam, investigations, management },
   ddx: ddxAnalysis(caseData),
   diagnosisCorrect: diagnosisMatched(caseData),
   completedAt: new Date().toISOString()
  };
 }

 function finishAttempt() {
  stopTimer();
  const debrief = buildDebrief();
  state.lastDebrief = debrief;
  const progress = loadProgress();
  progress.attempts.unshift({
   caseId: debrief.caseId,
   caseTitle: debrief.caseTitle,
   total: debrief.total,
   completedAt: debrief.completedAt,
   diagnosisCorrect: debrief.diagnosisCorrect,
   historyAsked: scopeAttemptCount("history"),
   examAsked: scopeAttemptCount("examination"),
   investigationsAsked: scopeAttemptCount("investigations"),
   ddxCount: allStudentDdx().length
  });
  progress.attempts = progress.attempts.slice(0, 80);
  saveProgress(progress);
  deleteDraft(debrief.caseId);
  state.phase = "debrief";
  state.route = "practice";
  render();
 }

 function clearProgress() {
  saveProgress({ attempts: [] });
  saveDrafts({});
  render();
 }

 function renderShell(inner) {
  document.querySelectorAll(".nav-tab").forEach(btn => {
   btn.classList.toggle("active", btn.dataset.route === state.route || (state.route === "practice" && btn.dataset.route === "library"));
  });
  app.innerHTML = inner;
  updateTimerDom();
 }

 function renderLibrary() {
  const progress = loadProgress();
  const presentations = unique(CASES.map(c => c.presentation)).sort();
  const filtered = CASES.filter(c => {
   return (state.filters.presentation === "all" || c.presentation === state.filters.presentation)
    && (state.filters.difficulty === "all" || c.difficulty === state.filters.difficulty)
    && (state.filters.setting === "all" || c.setting === state.filters.setting);
  });
  const hiddenCount = CASES.filter(c => c.hidden).length;
  const avg = progress.attempts.length
   ? Math.round((progress.attempts.reduce((sum, a) => sum + a.total, 0) / progress.attempts.length) * 10) / 10
   : "-";

  renderShell(`
   <div class="page-grid">
    <aside class="side-panel">
     <section class="panel">
      <h2 class="panel-title">Filters</h2>
      <div class="filter-stack">
       <label><span class="field-label">Presentation</span>
        <select class="select" data-field="filter-presentation">
         <option value="all">All presentations</option>
         ${presentations.map(p => `<option value="${escapeHtml(p)}" ${state.filters.presentation === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
        </select>
       </label>
       <label><span class="field-label">Difficulty</span>
        <select class="select" data-field="filter-difficulty">
         ${["all", "easy", "medium", "hard"].map(d => `<option value="${d}" ${state.filters.difficulty === d ? "selected" : ""}>${d === "all" ? "All difficulties" : d}</option>`).join("")}
        </select>
       </label>
       <label><span class="field-label">Setting</span>
        <select class="select" data-field="filter-setting">
         ${["all", "GP", "ED"].map(s => `<option value="${s}" ${state.filters.setting === s ? "selected" : ""}>${s === "all" ? "All settings" : s}</option>`).join("")}
        </select>
       </label>
      </div>
     </section>
     <section class="panel">
      <h2 class="panel-title">Library</h2>
      <div class="mini-stat-grid">
       <div class="mini-stat"><strong>${CASES.length}</strong><span>seed cases</span></div>
       <div class="mini-stat"><strong>${hiddenCount}</strong><span>hidden diagnoses</span></div>
       <div class="mini-stat"><strong>${progress.attempts.length}</strong><span>attempts saved</span></div>
       <div class="mini-stat"><strong>${avg}</strong><span>average /20</span></div>
      </div>
     </section>
     <section class="panel">
      <h2 class="panel-title">Matching Model</h2>
      <p class="muted">The examiner uses generous concept matching, typo tolerance and broad clinical clusters. Strict mode makes you specify what you are looking for before findings are released.</p>
     </section>
    </aside>
    <div>
     <section class="hero-panel">
      <span class="eyebrow">SCBD simulator</span>
      <h1>Timed cases with examiner-gated reveals and mechanism-first debriefs.</h1>
      <p>Practise the station structure: summary, DDx, history, examination, investigations, working diagnosis and management. Wrong differentials are allowed during the attempt; the debrief is where the learning lands.</p>
      <div class="notice warning"><strong>Clinical safety:</strong> Seed cases are for exam practice. Claims that depend on treatment choice, dosing or local pathways are flagged for double-checking against Australian guidance.</div>
     </section>
     <section class="case-grid">
      ${filtered.map(renderCaseCard).join("") || `<div class="empty-state">No cases match those filters.</div>`}
     </section>
    </div>
   </div>
  `);
 }

 function renderCaseCard(caseData) {
  const difficultyClass = caseData.difficulty === "hard" ? "red" : caseData.difficulty === "medium" ? "amber" : "green";
  const draft = draftForCase(caseData.id);
  return `
   <article class="case-card">
    <div class="case-meta">
     <span class="pill blue">${escapeHtml(caseData.setting)}</span>
     <span class="pill ${difficultyClass}">${escapeHtml(caseData.difficulty)}</span>
     ${caseData.hidden ? `<span class="pill purple">hidden diagnosis</span>` : ""}
     ${draft ? `<span class="pill amber">draft saved</span>` : ""}
    </div>
    <h2>${escapeHtml(caseData.title)}</h2>
    <p>${escapeHtml(caseData.stem)}</p>
    <p><strong>Presentation:</strong> ${escapeHtml(caseData.presentation)}</p>
    ${draft ? `<p class="draft-note"><strong>Resume:</strong> ${escapeHtml(phaseLabel(draft.phase))} - ${escapeHtml(formatSavedAt(draft.savedAt))}</p>` : ""}
    <footer>
     <span class="muted">${escapeHtml(getFramework(caseData.frameworkId)?.title || "Framework")}</span>
     <div class="btn-row">
      ${draft ? `<button class="btn secondary" type="button" data-resume-case="${escapeHtml(caseData.id)}">Resume</button>` : ""}
      <button class="btn" type="button" data-start-case="${escapeHtml(caseData.id)}">${draft ? "Start new" : "Start case"}</button>
     </div>
    </footer>
   </article>
  `;
 }

 function renderPractice() {
  if (state.phase === "notes") return renderNotes();
  if (["history", "examination", "investigations", "management"].includes(state.phase)) return renderStation();
  if (state.phase === "debrief") return renderDebrief();
  renderLibrary();
 }

 function renderAttemptMode(compact = false) {
  return `
   <section class="panel mode-panel">
    <h2 class="panel-title">Attempt Mode</h2>
    <div class="mode-toggle">
     <label class="radio-row">
      <input type="radio" name="trainingMode" value="simulation" ${!state.trainingMode ? "checked" : ""} data-field="trainingMode">
      <span><strong>Simulation</strong><span>Cleaner examiner room. Coverage and nudges stay hidden until debrief.</span></span>
     </label>
     <label class="radio-row">
      <input type="radio" name="trainingMode" value="training" ${state.trainingMode ? "checked" : ""} data-field="trainingMode">
      <span><strong>Training</strong><span>Allows Socratic nudges without naming the missing answer.</span></span>
     </label>
    </div>
   ${state.trainingMode && !compact ? `
     <label class="checkbox-row">
      <input type="checkbox" data-field="aiCoach" ${state.aiCoach ? "checked" : ""}>
      <span>Use optional AI wording for nudges when the API is available</span>
     </label>
    ` : ""}
    <label class="checkbox-row">
     <input type="checkbox" data-field="semanticFallback" ${state.semanticFallback ? "checked" : ""}>
     <span>Use API semantic matching when your wording was not predicted${state.semanticUnavailable ? " (currently unavailable)" : ""}</span>
    </label>
   </section>
  `;
 }

 function renderNotes() {
  const caseData = getCase();
  renderShell(`
   <div class="practice-layout">
    <aside class="side-panel">
     <section class="panel">
      <h2 class="panel-title">Viewing Timer</h2>
      <div class="timer-box">
       <span class="timer-label">Notes phase</span>
       <span class="timer-num" data-timer="notes">${formatTime(state.noteRemaining)}</span>
       <div class="progress-line"><span data-fill="notes"></span></div>
      </div>
      <div class="btn-row" style="margin-top:10px">
       <button class="btn secondary small" type="button" data-action="timer-notes">${state.timerMode === "notes" ? "Pause" : "Start"}</button>
       <button class="btn secondary small" type="button" data-action="reset-notes">Reset</button>
      </div>
     </section>
     <section class="panel">
      <h2 class="panel-title">Case</h2>
      <div class="case-meta">
       <span class="pill blue">${escapeHtml(caseData.setting)}</span>
       <span class="pill">${escapeHtml(caseData.difficulty)}</span>
       ${caseData.hidden ? `<span class="pill purple">hidden</span>` : ""}
      </div>
      <p class="muted">${escapeHtml(caseData.stem)}</p>
     </section>
     <section class="panel save-panel">
      <h2 class="panel-title">Local Progress</h2>
      <p class="muted" data-saved-status>${escapeHtml(formatSavedAt(state.lastSavedAt))}</p>
      <p class="micro-copy">Notes autosave to this browser before you enter the station.</p>
      <div class="btn-row" style="margin-top:10px">
       <button class="btn secondary small" type="button" data-action="save-draft">Save now</button>
       <button class="btn danger small" type="button" data-action="discard-draft">Discard draft</button>
      </div>
     </section>
     ${renderAttemptMode()}
    </aside>
    <section class="practice-card">
     <h1 class="station-title">${escapeHtml(caseData.title)}</h1>
     <p class="muted">Use this as the 5-minute recording watched three times. The real diagnosis is hidden until debrief.</p>
     <div class="recording-list">
      ${caseData.recording.map((line, idx) => `
       <div class="recording-line"><strong>Clip note ${idx + 1}</strong>${escapeHtml(line)}</div>
      `).join("")}
     </div>
     <label>
      <span class="field-label">A4 notes</span>
      <textarea class="textarea" data-field="notes" placeholder="Write the notes you would carry into the station...">${escapeHtml(state.notes)}</textarea>
     </label>
     <div class="btn-row" style="margin-top:14px">
      <button class="btn" type="button" data-action="begin-station">Enter 15-minute station</button>
      <button class="btn secondary" type="button" data-route="library">Back to cases</button>
     </div>
    </section>
   </div>
  `);
 }

 function renderStation() {
  const caseData = getCase();
  const meta = phaseMeta();
  if (meta.scope) state.askScope = meta.scope;
  renderShell(`
   <div class="practice-layout">
    <aside class="side-panel">
     <section class="panel">
      <h2 class="panel-title">Station Timer</h2>
      <div class="timer-box">
       <span class="timer-label">Station</span>
       <span class="timer-num" data-timer="station">${formatTime(state.stationRemaining)}</span>
       <div class="progress-line"><span data-fill="station"></span></div>
      </div>
      <div class="btn-row" style="margin-top:10px">
       <button class="btn secondary small" type="button" data-action="timer-station">${state.timerMode === "station" ? "Pause" : "Start"}</button>
       <button class="btn secondary small" type="button" data-action="reset-station">Reset</button>
      </div>
     </section>
     <section class="panel save-panel">
      <h2 class="panel-title">Local Progress</h2>
      <p class="muted" data-saved-status>${escapeHtml(formatSavedAt(state.lastSavedAt))}</p>
      <p class="micro-copy">This attempt autosaves in this browser. Refreshing or leaving the page will preserve the current phase, notes, DDx and revealed findings.</p>
      <div class="btn-row" style="margin-top:10px">
       <button class="btn secondary small" type="button" data-action="save-draft">Save now</button>
       <button class="btn danger small" type="button" data-action="discard-draft">Discard draft</button>
      </div>
     </section>
     <section class="panel">
      <h2 class="panel-title">Phase Map</h2>
      ${renderPhaseStepper()}
     </section>
     ${renderAttemptMode(true)}
     ${meta.scope ? `<section class="panel">
      <h2 class="panel-title">Examiner Strictness</h2>
      <div class="strictness-grid">
       ${renderStrictness("generous", "Generous", "Broad systems questions reveal clusters.")}
       ${renderStrictness("balanced", "Balanced", "Specific phrases or close synonyms reveal prepared items.")}
       ${renderStrictness("strict", "Strict", "You need to name what you are looking for.")}
      </div>
     </section>` : ""}
     ${renderPhaseStatsPanel()}
    </aside>
    <div class="section-grid">
     <section class="practice-card">
      <div class="phase-kicker">Phase ${meta.number}: ${escapeHtml(meta.title)}</div>
      <h1 class="station-title">${escapeHtml(caseData.title)}</h1>
      <p class="stem">${escapeHtml(caseData.stem)}</p>
      ${state.notes.trim() ? `<div class="notice"><strong>Your notes:</strong> ${escapeHtml(state.notes).replace(/\n/g, "<br>")}</div>` : ""}
     </section>
     ${renderPhaseWorkspace(caseData, meta)}
    </div>
   </div>
  `);
 }

 function renderPhaseStepper() {
  return `
   <div class="phase-stepper">
    ${PHASES.map(item => {
     const active = item.id === state.phase;
     const done = phaseIndex(item.id) < phaseIndex(state.phase) || state.phase === "debrief";
     const locked = phaseIndex(item.id) > phaseIndex(state.phase) + 1;
     return `<button type="button" class="phase-step ${active ? "active" : ""} ${done ? "done" : ""}" data-phase-nav="${item.id}" ${locked ? "disabled" : ""}>
      <span>${item.number}</span><strong>${escapeHtml(item.title)}</strong><em>${phaseStepStatus(item.id)}</em>
     </button>`;
    }).join("")}
   </div>
  `;
 }

 function phaseStepStatus(phase) {
  if (phase === "history") return `${scopeAttemptCount("history")} asked`;
  if (phase === "examination") return `${scopeAttemptCount("examination")} examined`;
  if (phase === "investigations") return `${scopeAttemptCount("investigations")} ordered`;
  if (phase === "management") return state.management.trim() ? "plan drafted" : "pending";
  return "";
 }

 function renderPhaseStatsPanel() {
  return `
   <section class="panel ${state.trainingMode ? "" : "mode-note"}">
    <h2 class="panel-title">${state.trainingMode ? "Training Coverage" : "Station State"}</h2>
    <div class="mini-stat-grid">
     <div class="mini-stat"><strong>${scopeAttemptCount("history")}</strong><span>history asks</span></div>
     <div class="mini-stat"><strong>${scopeAttemptCount("examination")}</strong><span>exam asks</span></div>
     <div class="mini-stat"><strong>${scopeAttemptCount("investigations")}</strong><span>tests ordered</span></div>
     <div class="mini-stat"><strong>${allStudentDdx().length}</strong><span>DDx entries</span></div>
    </div>
    ${state.trainingMode ? `<p class="micro-copy">Revealed findings: ${scopeRevealCount("history")} history, ${scopeRevealCount("examination")} exam, ${scopeRevealCount("investigations")} investigations.</p>` : `<p class="micro-copy">Coverage, score and missed items stay hidden until debrief. Your visible log only shows examiner answers to questions you actually asked.</p>`}
   </section>
  `;
 }

 function renderPhaseWorkspace(caseData, meta) {
  if (meta.id === "history") {
   return `
    <section class="two-col">
     <div class="practice-card">
      <h2 class="subhead">Referral-style summary</h2>
      <textarea class="textarea" data-field="summary" placeholder="Open with the one-line problem representation you would give the examiner.">${escapeHtml(state.summary)}</textarea>
      <p class="helper">Keep this short. Age, key symptom, time course, acuity, and what worries you.</p>
     </div>
     ${renderDdxEditor("initial", "Initial DDx before history", "Add your starting differentials, including must-not-miss diagnoses first", "This is your pre-history problem list. It can be wrong; the point is to make your reasoning visible.")}
    </section>
    ${renderExaminerCard(caseData, "history", "Phase 1 - History")}
    ${renderDdxEditor("postHistory", "Updated DDx based on the history", "Add what moved up or down after the history", "Required before Phase 2. Force yourself to change the list before examining.")}
    ${renderPhaseActions("examination", "Move to Phase 2: Examination")}
   `;
  }
  if (meta.id === "examination") {
   return `
    ${renderDdxReview("History-driven DDx", state.postHistoryDdx.length ? state.postHistoryDdx : state.ddx)}
    ${renderExaminerCard(caseData, "examination", "Phase 2 - Examination")}
    ${renderDdxEditor("postExam", "Updated DDx after examination", "Optional: refine your differentials again after examination", "Use this if the examination materially changes your probability ranking.")}
    ${renderPhaseActions("investigations", "Move to Phase 3: Investigations")}
   `;
  }
  if (meta.id === "investigations") {
   return `
    ${renderDdxReview("Current DDx before investigations", state.postExamDdx.length ? state.postExamDdx : (state.postHistoryDdx.length ? state.postHistoryDdx : state.ddx))}
    ${renderExaminerCard(caseData, "investigations", "Phase 3 - Investigations")}
    ${renderPhaseActions("management", "Move to Phase 4: Management")}
   `;
  }
  return `
   ${renderDdxReview("Final DDx entering management", allStudentDdx())}
   <section class="practice-card">
    <h2 class="subhead">Working diagnosis</h2>
    <input class="input" data-field="workingDiagnosis" value="${escapeHtml(state.workingDiagnosis)}" placeholder="State your current working diagnosis before management">
    <p class="helper">Commit before writing management. The debrief will compare this with the seed diagnosis and aliases.</p>
   </section>
   <section class="practice-card">
    <h2 class="subhead">Phase 4 - Management plan</h2>
    <textarea class="textarea tall" data-field="management" placeholder="Disposition, immediate safety, treatment, referrals, monitoring, patient communication and safety-netting.">${escapeHtml(state.management)}</textarea>
    <div class="management-prompts">
     <span>Disposition</span><span>Immediate risks</span><span>Treatment / referral</span><span>Monitoring</span><span>Safety-net</span>
    </div>
    <div class="btn-row" style="margin-top:14px">
     <button class="btn" type="button" data-action="finish-attempt">Finish and debrief</button>
     <button class="btn secondary" type="button" data-phase-nav="investigations">Back to investigations</button>
     <button class="btn secondary" type="button" data-start-case="${escapeHtml(caseData.id)}">Restart case</button>
    </div>
   </section>
  `;
 }

 function renderExaminerCard(caseData, scope, title) {
  return `
   <section class="practice-card">
    <h2 class="subhead">${escapeHtml(title)}</h2>
    <div class="phase-instruction">
     <strong>${escapeHtml(phaseMeta().verb)} only.</strong>
     <span>${escapeHtml(helperForScope(scope))}</span>
    </div>
    <div class="examiner-row">
     <input class="input" data-field="askText" value="${escapeHtml(state.askText)}" placeholder="${escapeHtml(placeholderForScope(scope))}">
     <button class="btn" type="button" data-action="ask-examiner" ${state.examinerLoading ? "disabled" : ""}>${state.examinerLoading ? "Checking..." : scope === "investigations" ? "Order" : "Ask"}</button>
    </div>
    ${renderCoachPanel()}
    <ul class="answer-log">
     ${renderRevealedForScope(caseData, scope)}
    </ul>
   </section>
  `;
 }

 function renderDdxEditor(kind, title, placeholder, helper) {
  const fields = ddxField(kind);
  const rows = state[fields.list] || [];
  return `
   <div class="practice-card ddx-card">
    <h2 class="subhead">${escapeHtml(title)}</h2>
    <div class="examiner-row">
     <input class="input" data-field="${fields.input}" value="${escapeHtml(state[fields.input])}" placeholder="${escapeHtml(placeholder)}">
     <button class="btn secondary" type="button" data-action="add-ddx" data-ddx-kind="${escapeHtml(kind)}">Add</button>
    </div>
    <p class="helper">${escapeHtml(helper)}</p>
    <ul class="ddx-list">
     ${rows.map((d, idx) => `<li class="ddx-chip"><span>${escapeHtml(d)}</span><button class="icon-btn" type="button" aria-label="Remove ${escapeHtml(d)}" data-ddx-kind="${escapeHtml(kind)}" data-remove-ddx="${idx}">x</button></li>`).join("") || `<li class="answer-card empty">No differentials added yet.</li>`}
    </ul>
   </div>
  `;
 }

 function renderDdxReview(title, rows) {
  const items = rows && rows.length ? rows : [];
  return `
   <section class="practice-card compact-card">
    <h2 class="subhead">${escapeHtml(title)}</h2>
    <div class="ddx-review-row">
     ${items.map(item => `<span class="ddx-review-chip">${escapeHtml(item)}</span>`).join("") || `<span class="muted">No differentials recorded yet.</span>`}
    </div>
   </section>
  `;
 }

 function renderPhaseActions(nextPhase, label) {
  const blocker = phaseBlockerText(state.phase);
  return `
   <section class="practice-card phase-actions-card">
    ${blocker ? `<div class="notice warning"><strong>Before moving on:</strong> ${escapeHtml(blocker)}</div>` : `<div class="notice"><strong>Ready:</strong> You can move forward, or go back to tighten this phase before continuing.</div>`}
    <div class="btn-row" style="margin-top:14px">
     <button class="btn" type="button" data-phase-nav="${escapeHtml(nextPhase)}" ${blocker ? "disabled" : ""}>${escapeHtml(label)}</button>
     ${phaseIndex(state.phase) > 0 ? `<button class="btn secondary" type="button" data-phase-nav="${PHASES[phaseIndex(state.phase) - 1].id}">Back to ${escapeHtml(PHASES[phaseIndex(state.phase) - 1].title)}</button>` : ""}
     <button class="btn secondary" type="button" data-action="save-draft">Save and stay here</button>
    </div>
   </section>
  `;
 }

 function renderRevealedForScope(caseData, scope) {
  const ids = state.revealed[scope] || [];
  const items = allItems(caseData, scope).filter(item => ids.includes(item.id));
  const blocks = items.map(item => {
   const answer = scope === "investigations" ? item.result : item.answer;
   return `
    <li class="answer-card">
     <strong>${escapeHtml(scopeLabel(scope))}: ${escapeHtml(item.label)}</strong>
     <p>${escapeHtml(answer)}</p>
    </li>
   `;
  });
  const latest = state.log.find(entry => entry.scope === scope);
  const missed = latest && latest.matchedIds.length === 0
   ? `<li class="answer-card empty"><strong>Examiner:</strong> ${fallbackNoMatch(scope)}${state.trainingMode ? " You can rephrase or ask for a nudge." : ""}</li>`
   : "";
  if (!blocks.length) return missed || `<li class="answer-card empty">No ${escapeHtml(scopeLabel(scope).toLowerCase())} findings have been revealed in this phase yet.</li>`;
  return missed + blocks.join("");
 }

 function renderStrictness(value, title, copy) {
  return `
   <label class="radio-row">
    <input type="radio" name="strictness" value="${value}" ${state.strictness === value ? "checked" : ""} data-field="strictness">
    <span><strong>${title}</strong><span>${copy}</span></span>
   </label>
  `;
 }

 function renderCoachPanel() {
  if (!state.trainingMode) return "";
  return `
   <div class="coach-box">
    <div class="coach-actions">
     <button class="btn secondary small" type="button" data-action="coach-nudge" ${state.coachLoading ? "disabled" : ""}>${state.coachLoading ? "Thinking..." : "Ask for a nudge"}</button>
     <label class="checkbox-row inline">
      <input type="checkbox" data-field="aiCoach" ${state.aiCoach ? "checked" : ""}>
      <span>AI wording</span>
     </label>
    </div>
    ${state.coachMessage ? `<p>${escapeHtml(state.coachMessage)}</p>` : `<p class="muted">Training mode nudges prompt a reasoning pathway, not the answer.</p>`}
    ${state.coachError ? `<p class="coach-error">${escapeHtml(state.coachError)}</p>` : ""}
   </div>
  `;
 }

 function placeholderForScope(scope) {
  if (scope === "history") return "Example: Ask about weight loss, melaena, VTE risk, thyroid symptoms...";
  if (scope === "examination") return "Example: I would check vitals and look for pallor / JVP / peritonism...";
  return "Example: ECG, FBE and iron studies, CT brain, bedside glucose...";
 }

 function helperForScope(scope) {
  if (scope === "history") return state.trainingMode ? "Ask freely. If you get stuck, request one Socratic nudge." : "Ask the history you would ask in the room. The debrief will map what you missed.";
  if (scope === "examination") return "State what you are looking for before the examiner reveals findings.";
  return "Order tests in a safe sequence: bedside, bloods, imaging, then special tests.";
 }

 function renderRevealed(caseData, includeLatestMiss = true, includeTeaching = false) {
  const blocks = [];
  for (const scope of ["history", "examination", "investigations"]) {
   const ids = state.revealed[scope];
   const items = allItems(caseData, scope).filter(item => ids.includes(item.id));
   for (const item of items) {
    const answer = scope === "investigations" ? item.result : item.answer;
    blocks.push(`
     <li class="answer-card">
      <strong>${escapeHtml(scopeLabel(scope))}: ${escapeHtml(item.label)}</strong>
      <p>${escapeHtml(answer)}</p>
      ${includeTeaching && item.teaching ? `<p class="why">${escapeHtml(item.teaching)}</p>` : ""}
     </li>
    `);
   }
  }
  const latest = state.log[0];
  const missed = includeLatestMiss && latest && latest.matchedIds.length === 0
   ? `<li class="answer-card empty"><strong>Examiner:</strong> ${fallbackNoMatch(latest.scope)}${state.trainingMode ? " You can rephrase, move on, or ask for a nudge." : ""}</li>`
   : "";
  if (!blocks.length) return missed || `<li class="answer-card empty">No hidden information has been revealed yet. Ask the examiner to start exposing the case.</li>`;
  return missed + blocks.join("");
 }

 function fallbackNoMatch(scope) {
  if (scope === "investigations") return "That test is not indicated or not performed in this case.";
  if (scope === "examination") return "That examination finding is not provided in this case.";
  return "There is no additional history available for that question in this case.";
 }

 function scopeLabel(scope) {
  if (scope === "examination") return "Exam";
  if (scope === "investigations") return "Ix";
  return "History";
 }

 function renderDebrief() {
  const caseData = getCase();
  const debrief = state.lastDebrief || buildDebrief();
  const { history, exam, investigations, management } = debrief.domains;
  const missedCritical = [
   ...history.missed.map(item => ({ ...item, domain: "History" })),
   ...exam.missed.map(item => ({ ...item, domain: "Examination" })),
   ...investigations.missed.map(item => ({ ...item, domain: "Investigations" })),
   ...management.missed.map(item => ({ ...item, domain: "Management" }))
  ].filter(item => itemWeight(item) > 0).sort((a, b) => itemWeight(b) - itemWeight(a)).slice(0, 12);

  renderShell(`
   <section class="hero-panel">
    <span class="eyebrow">Debrief</span>
    <h1 class="debrief-title">${escapeHtml(caseData.title)}</h1>
    <p><strong>Final diagnosis:</strong> ${escapeHtml(caseData.finalDiagnosis)}. Your working diagnosis was ${debrief.diagnosisCorrect ? "a match" : "not a match"}.</p>
    <div class="score-grid">
     ${renderScore("History", history.score, 8, history.bonus)}
     ${renderScore("Exam", exam.score, 4, exam.bonus)}
     ${renderScore("Investigations", investigations.score, 4, investigations.bonus)}
     ${renderScore("Management", management.score, 4)}
    </div>
    <div class="notice ${debrief.total < 7 ? "warning" : ""}"><strong>Total:</strong> ${debrief.total}/20. The historical pass mark you described is low, but the goal here is safe, explicit reasoning rather than scraping over a line.</div>
   </section>

   <section class="debrief-card">
    <h2 class="subhead">DDx review</h2>
    <ul class="missed-list">
     ${debrief.ddx.missingMust.map(d => `<li class="missed-item red"><strong>Missing must-include:</strong> ${escapeHtml(d.name)}<p>${escapeHtml(d.why)}</p></li>`).join("") || `<li class="missed-item"><strong>Good:</strong> You included the must-have differentials.</li>`}
     ${debrief.ddx.unmatchedUser.map(d => `<li class="missed-item amber"><strong>Learning opportunity:</strong> ${escapeHtml(d)} was not in this case's expected list. It was not penalised during the station; now ask what finding would have moved it up or down.</li>`).join("")}
    </ul>
   </section>

   <section class="debrief-card">
    <h2 class="subhead">Phase-by-phase reasoning trail</h2>
    <div class="reasoning-trail">
     ${renderDebriefDdxSnapshot("Initial DDx", state.ddx)}
     ${renderDebriefDdxSnapshot("After history", state.postHistoryDdx)}
     ${renderDebriefDdxSnapshot("After examination", state.postExamDdx)}
     <div class="trail-box"><strong>Requests made</strong><p>${scopeAttemptCount("history")} history, ${scopeAttemptCount("examination")} exam, ${scopeAttemptCount("investigations")} investigation.</p></div>
    </div>
   </section>

   <section class="debrief-card">
    <h2 class="subhead">Highest-yield missed items</h2>
    <ul class="missed-list">
     ${missedCritical.map(renderMissed).join("") || `<li class="missed-item"><strong>No major misses:</strong> You covered the prepared checklist well.</li>`}
    </ul>
   </section>

   <section class="debrief-card">
    <h2 class="subhead">Reasoning credit</h2>
    <ul class="missed-list">
     ${renderReasoningCredit([
      { label: "History", scope: "history", domain: history },
      { label: "Examination", scope: "examination", domain: exam },
      { label: "Investigations", scope: "investigations", domain: investigations }
     ])}
    </ul>
   </section>

   <section class="debrief-card">
    <h2 class="subhead">What you did uncover</h2>
    <ul class="answer-log">${renderRevealed(caseData, false, true)}</ul>
   </section>

   <section class="debrief-card">
    <h2 class="subhead">Clinical double-check notes</h2>
    <ul class="missed-list">
     ${(caseData.doubleCheck || []).map(note => `<li class="missed-item amber">${escapeHtml(note)}</li>`).join("")}
    </ul>
   </section>

   <section class="debrief-card">
    <h2 class="subhead">Australian reference anchors used for this seed library</h2>
    <ul class="source-list">
     ${REFERENCES.map(ref => `<li><a href="${escapeHtml(ref.url)}" target="_blank" rel="noopener">${escapeHtml(ref.title)}</a></li>`).join("")}
    </ul>
   </section>

   <div class="btn-row" style="margin-top:14px">
    <button class="btn" type="button" data-start-case="${escapeHtml(caseData.id)}">Retry this case</button>
    <button class="btn secondary" type="button" data-route="library">Back to cases</button>
    <button class="btn secondary" type="button" data-route="frameworks">Study frameworks</button>
   </div>
  `);
 }

 function renderScore(label, score, max, bonus = 0) {
  return `<div class="score-tile"><strong>${score}/${max}</strong><span>${label}${bonus > 0 ? `, +${bonus} reasoning` : ""}</span></div>`;
 }

 function renderDebriefDdxSnapshot(label, rows) {
  return `<div class="trail-box"><strong>${escapeHtml(label)}</strong><p>${(rows || []).map(escapeHtml).join(", ") || "No entries recorded."}</p></div>`;
 }

 function renderReasoningCredit(domains) {
  const items = domains.flatMap(entry => (entry.domain.extraMatched || []).map(item => ({ ...item, domainLabel: entry.label, bonus: itemReasoningCredit(item, entry.scope) })));
  if (!items.length) return `<li class="missed-item"><strong>No extra rule-out credit recorded:</strong> This does not mean you were unsafe; it just means your score came from core rubric items.</li>`;
  return items.map(item => `
   <li class="missed-item green">
    <strong>${escapeHtml(item.domainLabel)}: ${escapeHtml(item.label)} (+${item.bonus})</strong>
    <p>You received extra reasoning credit for actively ruling this pathway in or out. ${escapeHtml(item.teaching)}</p>
   </li>
  `).join("");
 }

 function renderMissed(item) {
  const weightClass = itemWeight(item) >= 3 ? "red" : itemWeight(item) === 2 ? "amber" : "";
  const verb = item.domain === "Investigations" ? "order" : item.domain === "Examination" ? "examine for" : item.domain === "Management" ? "include" : "ask about";
  return `
   <li class="missed-item ${weightClass}">
    <strong>${escapeHtml(item.domain)}: You did not ${verb} ${escapeHtml(item.label)}.</strong>
    <p>This mattered because ${escapeHtml(lowerFirst(item.teaching))}</p>
   </li>
  `;
 }

 function lowerFirst(text) {
  const value = String(text || "");
  return value.charAt(0).toLowerCase() + value.slice(1);
 }

 function renderFrameworks() {
  renderShell(`
   <section class="hero-panel">
    <span class="eyebrow">Reference mode</span>
    <h1>Presentation frameworks you can study outside a station.</h1>
    <p>Each framework keeps two things separate: a broad systems screen so you stay safe, and targeted discriminators so you can narrow efficiently.</p>
   </section>
   <section class="framework-grid">
    ${FRAMEWORKS.map(framework => `
     <article class="framework-card">
      <h2>${escapeHtml(framework.title)}</h2>
      <div class="framework-columns">
       ${renderFrameworkBlock("Systems Screen", framework.systems)}
       ${renderFrameworkBlock("Discriminators", framework.targeted)}
       ${renderFrameworkBlock("Red Flags", framework.redFlags)}
      </div>
     </article>
    `).join("")}
   </section>
  `);
 }

 function renderFrameworkBlock(title, items) {
  return `
   <div class="framework-block">
    <h3>${escapeHtml(title)}</h3>
    <ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
   </div>
  `;
 }

 function renderProgress() {
  const progress = loadProgress();
  const drafts = Object.values(loadDrafts()).sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  renderShell(`
   <section class="hero-panel">
    <span class="eyebrow">Progress</span>
    <h1>Your saved SCBD work on this browser.</h1>
    <p>Completed attempts and in-progress drafts are stored locally in this browser only. Drafts preserve phase, notes, DDx, examiner log and timers.</p>
    <div class="btn-row" style="margin-top:14px">
     <button class="btn danger" type="button" data-action="clear-progress">Clear progress</button>
     <button class="btn secondary" type="button" data-route="library">Back to cases</button>
    </div>
   </section>
   <section class="debrief-card">
    <h2 class="subhead">In-progress drafts</h2>
    <ul class="answer-log">
     ${drafts.map(draft => {
      const caseData = CASES.find(c => c.id === draft.activeCaseId);
      return `
       <li class="answer-card">
        <strong>${escapeHtml(caseData?.title || draft.activeCaseId)} - ${escapeHtml(phaseLabel(draft.phase))}</strong>
        <p>${escapeHtml(formatSavedAt(draft.savedAt))} - ${Number(draft.log?.length || 0)} examiner request${Number(draft.log?.length || 0) === 1 ? "" : "s"} - ${Number((draft.ddx || []).length + (draft.postHistoryDdx || []).length + (draft.postExamDdx || []).length)} DDx entries</p>
        <div class="btn-row" style="margin-top:10px">
         <button class="btn small" type="button" data-resume-case="${escapeHtml(draft.activeCaseId)}">Resume draft</button>
         <button class="btn secondary small" type="button" data-start-case="${escapeHtml(draft.activeCaseId)}">Start new</button>
        </div>
       </li>
      `;
     }).join("") || `<li class="answer-card empty">No active drafts. Start a case and your work will autosave here.</li>`}
    </ul>
   </section>
   <section class="debrief-card">
    <h2 class="subhead">Attempt history</h2>
    <ul class="answer-log">
     ${progress.attempts.map(a => `
      <li class="answer-card">
       <strong>${escapeHtml(a.caseTitle)} - ${escapeHtml(a.total)}/20</strong>
       <p>${new Date(a.completedAt).toLocaleString()} - diagnosis ${a.diagnosisCorrect ? "matched" : "did not match"}${a.historyAsked != null ? ` - ${a.historyAsked} history / ${a.examAsked} exam / ${a.investigationsAsked} ix requests` : ""}</p>
      </li>
     `).join("") || `<li class="answer-card empty">No attempts saved yet.</li>`}
    </ul>
   </section>
  `);
 }

 function render() {
  if (!app) return;
  if (state.route === "frameworks") return renderFrameworks();
  if (state.route === "progress") return renderProgress();
  if (state.route === "practice") return renderPractice();
  renderLibrary();
 }

 document.addEventListener("click", event => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
   routeTo(routeButton.dataset.route);
   return;
  }
  const startButton = event.target.closest("[data-start-case]");
  if (startButton) {
   startCase(startButton.dataset.startCase);
   return;
  }
  const resumeButton = event.target.closest("[data-resume-case]");
  if (resumeButton) {
   resumeCase(resumeButton.dataset.resumeCase);
   return;
  }
  const phaseButton = event.target.closest("[data-phase-nav]");
  if (phaseButton) {
   goToPhase(phaseButton.dataset.phaseNav);
   return;
  }
  const scopeButton = event.target.closest("[data-scope]");
  if (scopeButton) {
   state.askScope = scopeButton.dataset.scope;
   state.coachMessage = "";
   state.coachError = "";
   render();
   return;
  }
  const removeButton = event.target.closest("[data-remove-ddx]");
  if (removeButton) {
   removeDdx(removeButton.dataset.ddxKind || "initial", Number(removeButton.dataset.removeDdx));
   return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "timer-notes") {
   if (state.timerMode === "notes") stopTimer();
   else startTimer("notes");
   render();
  }
  if (action === "timer-station") {
   if (state.timerMode === "station") stopTimer();
   else startTimer("station");
   render();
  }
  if (action === "reset-notes") {
   stopTimer();
   state.noteRemaining = 900;
   render();
  }
  if (action === "reset-station") {
   stopTimer();
   state.stationRemaining = 900;
   render();
  }
  if (action === "begin-station") beginStation();
  if (action === "ask-examiner") askExaminer();
  if (action === "coach-nudge") requestCoachNudge();
  if (action === "add-ddx") addDdx(event.target.closest("[data-action]")?.dataset.ddxKind || "initial");
  if (action === "save-draft") {
   saveCurrentDraft(true);
   render();
  }
  if (action === "discard-draft") {
   deleteDraft();
   state.lastSavedAt = "";
   stopTimer();
   state.route = "library";
   state.phase = "library";
   render();
  }
  if (action === "finish-attempt") finishAttempt();
  if (action === "clear-progress") clearProgress();
 });

 document.addEventListener("input", event => {
  const field = event.target.dataset.field;
  if (!field) return;
  if (field === "filter-presentation") state.filters.presentation = event.target.value;
  if (field === "filter-difficulty") state.filters.difficulty = event.target.value;
  if (field === "filter-setting") state.filters.setting = event.target.value;
  if (field === "notes") state.notes = event.target.value;
  if (field === "summary") state.summary = event.target.value;
  if (field === "ddxInput") state.ddxInput = event.target.value;
  if (field === "postHistoryDdxInput") state.postHistoryDdxInput = event.target.value;
  if (field === "postExamDdxInput") state.postExamDdxInput = event.target.value;
  if (field === "askText") state.askText = event.target.value;
  if (field === "management") state.management = event.target.value;
  if (field === "workingDiagnosis") state.workingDiagnosis = event.target.value;
  if (field === "strictness") state.strictness = event.target.value;
  if (field === "trainingMode") {
   state.trainingMode = event.target.value === "training";
   state.coachMessage = "";
   state.coachError = "";
   render();
  }
  if (field === "aiCoach") state.aiCoach = event.target.checked;
  if (field === "semanticFallback") {
   state.semanticFallback = event.target.checked;
   state.semanticUnavailable = false;
  }
  if (!field.startsWith("filter-")) saveCurrentDraft();
  if (field && field.startsWith("filter-")) render();
 });

 document.addEventListener("change", event => {
  const field = event.target.dataset.field;
  if (!field) return;
  if (field === "filter-presentation") state.filters.presentation = event.target.value;
  if (field === "filter-difficulty") state.filters.difficulty = event.target.value;
  if (field === "filter-setting") state.filters.setting = event.target.value;
  if (field === "strictness") state.strictness = event.target.value;
  if (field === "trainingMode") {
   state.trainingMode = event.target.value === "training";
   state.coachMessage = "";
   state.coachError = "";
   render();
  }
  if (field === "aiCoach") {
   state.aiCoach = event.target.checked;
   render();
  }
  if (field === "semanticFallback") {
   state.semanticFallback = event.target.checked;
   state.semanticUnavailable = false;
   render();
  }
  if (!field.startsWith("filter-")) saveCurrentDraft(true);
  if (field.startsWith("filter-")) render();
 });

 document.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.shiftKey) return;
  if (event.target?.dataset?.field === "ddxInput") {
   event.preventDefault();
   addDdx("initial");
  }
  if (event.target?.dataset?.field === "postHistoryDdxInput") {
   event.preventDefault();
   addDdx("postHistory");
  }
  if (event.target?.dataset?.field === "postExamDdxInput") {
   event.preventDefault();
   addDdx("postExam");
  }
  if (event.target?.dataset?.field === "askText") {
   event.preventDefault();
   askExaminer();
  }
 });

 if (typeof window !== "undefined") {
  window.SCBD_DEBUG = {
   normalize,
   findMatches(caseId, scope, query, strictness = "balanced") {
    const previousStrictness = state.strictness;
    state.strictness = strictness;
    const caseData = CASES.find(c => c.id === caseId) || CASES[0];
    const matches = findMatches(caseData, scope, query).map(item => item.label);
    state.strictness = previousStrictness;
    return matches;
   },
   cases: CASES,
   frameworks: FRAMEWORKS
  };
 }

 render();
})();
