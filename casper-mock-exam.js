/**
 * casper-mock-exam.js - Key2MD Full CASPer Mock Exam
 *
 * Uses the existing written CASPer engine and MMI recording/feedback engine,
 * but wraps them in a CASPer-style sequence:
 * 4 video-response scenarios, optional 10-minute break, 7 typed scenarios,
 * optional 5-minute break after typed station 4.
 */

window.FullCasperMock = (() => {
 const VIDEO_COUNT = 4;
 const TYPED_COUNT = 7;
 const VIDEO_PRESET = 'casperVideo';
 const VIDEO_BREAK_SECONDS = 10 * 60;
 const TYPED_BREAK_SECONDS = 5 * 60;
 const STATION_TRANSITION_SECONDS = 10;
 const CASPER_REFLECTION_SECONDS = 30;
 const CASPER_TYPED_SECONDS = 210;
 const MOCK_DRAFT_KEY = 'k2md_full_mock_draft_v1';
 const FINAL_REPORT_MAX_WAIT_MS = 6 * 60 * 1000;
 const MOCK_PRICES = {
 transcript: { standard: 59, pro: 41, value: 69, video: 20 },
 premium: { standard: 79, pro: 55, value: 97, video: 48 },
 };
const MOCK_ACCESS_TIMING_KEY = 'k2md_full_mock_access_timing_v1';
 const ACCESS_TIMING_OPTIONS = {
 standard: {
 key: 'standard',
 multiplier: 1,
 label: 'Standard',
 shortLabel: 'Standard timing',
 typedSeconds: CASPER_TYPED_SECONDS,
 cardTitle: 'Standard',
 cardMeta: '3:30 writing time',
 description: 'Use this when you are ready to mimic ordinary CASPer timing.',
 },
 x15: {
 key: 'x15',
 multiplier: 1.5,
 label: '1.5x access timing',
 shortLabel: '1.5x timing',
 typedSeconds: Math.round(CASPER_TYPED_SECONDS * 1.5),
 cardTitle: '1.5x',
 cardMeta: '5:15 writing time',
 description: 'For approved 1.5x accommodations, or a gentler first timed run.',
 },
 x2: {
 key: 'x2',
 multiplier: 2,
 label: '2x access timing',
 shortLabel: '2x timing',
 typedSeconds: CASPER_TYPED_SECONDS * 2,
 cardTitle: '2x',
 cardMeta: '7:00 writing time',
 description: 'For approved 2x accommodations, or a low-pressure first mock.',
 },
 };
 let active = false;
 let started = false;
 let config = { tier: 'transcript', accessTiming: readStoredAccessTiming() };
 let sequence = [];
 let index = 0;
 let results = [];
 let originalSubmitMMI = null;
 let breakTimer = null;
 let breakLeft = 0;
 let stationToken = 0;
 let advancing = false;
 let rulesAccepted = false;
 let finalVideoRows = [];
 let finalReviewRows = [];
 let doneMonitorTimer = null;
 let transitionTimer = null;
 let transitionActive = false;
 let transitionNextIndex = null;
 let pendingMediaSafety = null;
 let mockAttemptId = null;
 let savedAttemptId = null;
 let latestReport = null;
 let draftTimer = null;
 let pendingDraftAnswer = null;
 let debriefRenderToken = 0;
 let mockSafetyAcknowledged = { audio: false, visual: false };
 let serverCheckpointBusy = false;
 let queuedCheckpointReason = null;
 let lastRescueRecording = null;
 let lastMockSaveResponse = null;
 let mockStatusCache = null;
 let mockStatusRefreshToken = 0;
 let activeMockExam = null;
 let mockTelemetry = null;
 let currentStationTelemetry = null;
 let currentBreakTelemetry = null;
 let mockTelemetryTimer = null;
 let typedTelemetryBinding = null;
function byId(id) {
 return document.getElementById(id);
 }

 function esc(value) {
 return String(value ?? '').replace(/[&<>"']/g, ch => ({
 '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
 }[ch]));
 }

 function normaliseAccessTiming(value) {
 const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
 if (raw === '1.5' || raw === '1.5x' || raw === 'x1.5' || raw === 'x15' || raw === '15' || raw === '150') return 'x15';
 if (raw === '2' || raw === '2x' || raw === 'x2' || raw === '200') return 'x2';
 return 'standard';
 }

 function readStoredAccessTiming() {
 try {
 return normaliseAccessTiming(localStorage.getItem(MOCK_ACCESS_TIMING_KEY) || 'standard');
 } catch {
 return 'standard';
 }
 }

 function accessTimingOption(value = config.accessTiming) {
 const key = normaliseAccessTiming(value);
 return ACCESS_TIMING_OPTIONS[key] || ACCESS_TIMING_OPTIONS.standard;
 }

 function accessTimingPayload(value = config.accessTiming) {
 const option = accessTimingOption(value);
 return {
 key: option.key,
 label: option.label,
 multiplier: option.multiplier,
 typed_seconds: option.typedSeconds,
 reflection_seconds: CASPER_REFLECTION_SECONDS,
 applies_to: 'typed_stations_only',
 };
 }

 function typedWritingSeconds() {
 return accessTimingOption().typedSeconds;
 }

 function formatSeconds(seconds) {
 const total = Math.max(0, Math.round(Number(seconds) || 0));
 const m = Math.floor(total / 60);
 const s = total % 60;
 return `${m}:${String(s).padStart(2, '0')}`;
 }

 function persistAccessTiming() {
 try {
 localStorage.setItem(MOCK_ACCESS_TIMING_KEY, accessTimingOption().key);
 } catch {}
 }

 function restoreAccessTimingFromSaved(source = null) {
 const rows = Array.isArray(source?.rows) ? source.rows : [];
 const rowTiming = rows.map(row => row?.access_timing || row?.accessTiming || row?.timing?.access_timing).find(Boolean);
 const saved = source?.access_timing
 || source?.accessTiming
 || source?.report?.accessTiming
 || source?.report?.access_timing
 || source?.telemetry?.access_timing
 || rowTiming
 || null;
 if (!saved) return false;
 config.accessTiming = normaliseAccessTiming(saved.key || saved.mode || saved);
 persistAccessTiming();
 return true;
 }

 function getAuth() {
 if (typeof Key2MDAuth !== 'undefined') return Key2MDAuth;
 return window.Key2MDAuth || null;
 }

 function isCasperPro() {
 return !!getAuth()?.isPro?.();
 }

 function priceForTier(tier = config.tier) {
 const prices = MOCK_PRICES[tier] || MOCK_PRICES.transcript;
 return isCasperPro() ? prices.pro : prices.standard;
 }

function returnedFromCheckout(tier = config.tier) {
 try {
 const params = new URLSearchParams(window.location.search);
 if (params.get('mock_payment') === 'success' && (params.get('mock_tier') || tier) === tier) {
 return true;
 }
 } catch {
 return false;
 }
 return false;
 }

 function applyTierFromUrl() {
 try {
 const tier = new URLSearchParams(window.location.search).get('mock_tier');
 if (tier === 'premium' || tier === 'transcript') config.tier = tier;
 } catch {}
 }

 function sleep(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
 }

 function apiBase() {
 return window.API_BASE || 'https://key2md-api.brittainmbbs.workers.dev';
 }

 function authTokenOrThrow() {
 const auth = getAuth();
 const token = auth?.getToken?.();
 if (!token) throw new Error('Please log in before starting the mock.');
 return token;
 }

 function syncActiveMockContext(item = sequence[index] || null) {
 if (!mockAttemptId) return;
 window.K2_ACTIVE_CASPER_MOCK = {
 tier: config.tier,
 attempt_id: mockAttemptId,
 mock_exam: activeMockExam,
 access_timing: accessTimingPayload(),
 station_order: Number(item?.order || index + 1),
 station_id: item?.station?.id || null,
 station_type: item?.type || null,
 };
 }

 function clearDoneMonitor() {
 clearInterval(doneMonitorTimer);
 doneMonitorTimer = null;
 }

 function clearTransitionTimer() {
 clearInterval(transitionTimer);
 transitionTimer = null;
 transitionActive = false;
 transitionNextIndex = null;
 }

 function currentDraftStorageKey() {
 const user = getAuth()?.getUser?.() || null;
 const raw = String(user?.id || user?.email || 'anon').trim().toLowerCase();
 const safe = raw.replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 90) || 'anon';
 return `${MOCK_DRAFT_KEY}:${safe}`;
 }

 function currentDraftUserSnapshot() {
 const user = getAuth()?.getUser?.() || null;
 return {
 id: user?.id ? String(user.id) : '',
 email: user?.email ? String(user.email).trim().toLowerCase() : '',
 };
 }

 function isoNow() {
 return new Date().toISOString();
 }

 function nowMs() {
 return Date.now();
 }

 function secondsBetween(start, end = nowMs()) {
 const s = Number(start || 0);
 const e = Number(end || nowMs());
 return s && e >= s ? Math.round((e - s) / 1000) : 0;
 }

 function wordCount(text) {
 return String(text || '').trim().split(/\s+/).filter(Boolean).length;
 }

 function browserSnapshot() {
 const nav = window.navigator || {};
 return {
 user_agent: String(nav.userAgent || '').slice(0, 220),
 platform: String(nav.platform || '').slice(0, 80),
 language: String(nav.language || '').slice(0, 40),
 timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
 timezone_offset_min: new Date().getTimezoneOffset(),
 viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
 };
 }

 function createMockTelemetry(reason = 'started') {
 const user = currentDraftUserSnapshot();
 const browser = browserSnapshot();
 return {
 version: 1,
 started_at: isoNow(),
 last_seen_at: isoNow(),
 user_id: user.id,
 user_email: user.email,
 mock_exam: activeMockExam,
 tier: config.tier,
 access_timing: accessTimingPayload(),
 browser,
 current: null,
 station_events: [],
 breaks: [],
 visibility: {
 visible: document.visibilityState !== 'hidden',
 hidden_count: 0,
 hidden_ms: 0,
 last_hidden_at: null,
 },
 last_reason: reason,
 };
 }

 function ensureMockTelemetry(reason = 'active') {
 if (!mockTelemetry) mockTelemetry = createMockTelemetry(reason);
 mockTelemetry.last_seen_at = isoNow();
 mockTelemetry.last_reason = reason;
 mockTelemetry.tier = config.tier;
 mockTelemetry.mock_exam = activeMockExam;
 mockTelemetry.access_timing = accessTimingPayload();
 return mockTelemetry;
 }

 function currentStationLabel(item = sequence[index] || {}) {
 const type = item.type === 'video' ? 'video' : 'typed';
 const local = sequence.slice(0, index + 1).filter(entry => (entry.type === 'video' ? 'video' : 'typed') === type).length || 1;
 return `${type === 'video' ? 'Video' : 'Typed'} ${local}`;
 }

 function addTelemetryEvent(type, detail = {}) {
 const tel = ensureMockTelemetry(type);
 const item = sequence[index] || null;
 tel.station_events.push({
 type,
 at: isoNow(),
 elapsed_sec: secondsBetween(Date.parse(tel.started_at)),
 index,
 order: Number(item?.order || index + 1),
 station_type: item?.type || null,
 station_id: item?.station?.id || null,
 detail,
 });
 if (tel.station_events.length > 160) tel.station_events = tel.station_events.slice(-160);
 }

 function updateMockCurrent(reason = 'heartbeat') {
 const tel = ensureMockTelemetry(reason);
 const item = sequence[index] || null;
 const bridge = window.K2PracticeBridge || null;
 const answer = item?.type === 'typed' ? (byId('answerTextarea')?.value || '') : '';
 tel.current = item ? {
 index,
 order: Number(item.order || index + 1),
 station_id: item.station?.id || null,
 station_type: item.type || null,
 station_label: currentStationLabel(item),
 phase: bridge?.getPhase?.() || 'unknown',
 access_timing: accessTimingPayload(),
 planned_writing_sec: item.type === 'typed' ? typedWritingSeconds() : null,
 at: isoNow(),
 visible: document.visibilityState !== 'hidden',
 elapsed_sec: currentStationTelemetry ? secondsBetween(currentStationTelemetry.started_ms) : null,
 answer_chars: answer.length,
 answer_words: wordCount(answer),
 } : null;
 return tel;
 }

 function startMockTelemetry(reason = 'mock_started') {
 mockTelemetry = createMockTelemetry(reason);
 addTelemetryEvent(reason);
 clearInterval(mockTelemetryTimer);
 mockTelemetryTimer = setInterval(() => sendMockTelemetry('heartbeat'), 30000);
 sendMockTelemetry(reason).catch(() => {});
 }

 function breakTelemetrySnapshot(source = currentBreakTelemetry, extra = {}) {
 if (!source) return null;
 const snapshot = {
 id: source.id,
 title: source.title,
 planned_sec: source.planned_sec,
 started_at: source.started_at,
 local_started_at: source.local_started_at,
 after_index: source.after_index,
 after_order: source.after_order,
 after_label: source.after_label,
 ...extra,
 };
 return snapshot;
 }

 function startBreakTelemetry(seconds, title) {
 const tel = ensureMockTelemetry('break_started');
 const started = nowMs();
 const item = sequence[index] || null;
 currentBreakTelemetry = {
 id: `break-${(tel.breaks || []).length + 1}`,
 title: String(title || 'Optional break'),
 planned_sec: Number(seconds || 0),
 started_at: isoNow(),
 started_ms: started,
 local_started_at: new Date(started).toLocaleString('en-AU'),
 after_index: index,
 after_order: Number(item?.order || index + 1),
 after_label: item ? currentStationLabel(item) : '',
 };
 tel.breaks = Array.isArray(tel.breaks) ? tel.breaks : [];
 tel.breaks.push(breakTelemetrySnapshot());
 if (tel.breaks.length > 20) tel.breaks = tel.breaks.slice(-20);
 addTelemetryEvent('break_started', {
 title: currentBreakTelemetry.title,
 planned_sec: currentBreakTelemetry.planned_sec,
 after_label: currentBreakTelemetry.after_label,
 });
 sendMockTelemetry('break_started').catch(() => {});
 }

 function finishBreakTelemetry(reason = 'continued') {
 if (!currentBreakTelemetry) return;
 const ended = nowMs();
 const elapsedSec = secondsBetween(currentBreakTelemetry.started_ms, ended);
 const remainingSec = Math.max(0, Number(breakLeft || 0));
 const snapshot = breakTelemetrySnapshot(currentBreakTelemetry, {
 ended_at: isoNow(),
 elapsed_sec: elapsedSec,
 remaining_sec: remainingSec,
 skipped: remainingSec > 0,
 reason,
 });
 const tel = ensureMockTelemetry('break_finished');
 const breaks = Array.isArray(tel.breaks) ? tel.breaks : [];
 const existingIndex = breaks.findIndex(item => item?.id === snapshot.id);
 if (existingIndex >= 0) breaks[existingIndex] = snapshot;
 else breaks.push(snapshot);
 tel.breaks = breaks.slice(-20);
 addTelemetryEvent('break_finished', {
 title: snapshot.title,
 elapsed_sec: elapsedSec,
 remaining_sec: remainingSec,
 skipped: snapshot.skipped,
 reason,
 });
 currentBreakTelemetry = null;
 sendMockTelemetry('break_finished').catch(() => {});
 }

 function stopMockTelemetry() {
 clearInterval(mockTelemetryTimer);
 mockTelemetryTimer = null;
 }

 function startStationTelemetry(item, reason = 'station_loaded') {
 if (
 currentStationTelemetry
 && Number(currentStationTelemetry.index) === Number(index)
 && Number(currentStationTelemetry.order) === Number(item?.order || index + 1)
 ) {
 updateMockCurrent(reason);
 return;
 }
 const started = nowMs();
 const label = currentStationLabel(item);
 currentStationTelemetry = {
 version: 1,
 index,
 order: Number(item?.order || index + 1),
 station_id: item?.station?.id || null,
 station_type: item?.type || null,
 station_label: label,
 access_timing: accessTimingPayload(),
 planned_writing_sec: item?.type === 'typed' ? typedWritingSeconds() : null,
 planned_reflection_sec: item?.type === 'typed' ? CASPER_REFLECTION_SECONDS : null,
 started_at: isoNow(),
 started_ms: started,
 local_started_at: new Date(started).toLocaleString('en-AU'),
 timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
 visible_started: document.visibilityState !== 'hidden',
 hidden_ms: 0,
 hidden_count: 0,
 last_hidden_ms: document.visibilityState === 'hidden' ? started : null,
 events: [{ type: reason, at: isoNow() }],
 typing: item?.type === 'typed' ? {
 focus_count: 0,
 blur_count: 0,
 keydown_count: 0,
 input_events: 0,
 paste_events: 0,
 paste_chars: 0,
 paste_into_empty: false,
 large_insert_events: 0,
 largest_insert_chars: 0,
 first_input_at: null,
 first_input_delay_sec: null,
 last_input_at: null,
 active_focus_ms: 0,
 focus_started_ms: null,
 restored_answer_chars: 0,
 final_chars: 0,
 final_words: 0,
 } : null,
 };
 updateMockCurrent(reason);
 addTelemetryEvent(reason, { label });
 }

 function markStationTelemetryEvent(type, detail = {}) {
 if (!currentStationTelemetry) return;
 currentStationTelemetry.events.push({ type, at: isoNow(), detail });
 if (currentStationTelemetry.events.length > 40) currentStationTelemetry.events = currentStationTelemetry.events.slice(-40);
 addTelemetryEvent(type, detail);
 }

 function updateTelemetryVisibility() {
 const now = nowMs();
 const hidden = document.visibilityState === 'hidden';
 const tel = ensureMockTelemetry('visibility');
 if (!tel.visibility) tel.visibility = { visible: !hidden, hidden_count: 0, hidden_ms: 0, last_hidden_at: null };
 if (hidden && tel.visibility.visible !== false) {
 tel.visibility.visible = false;
 tel.visibility.hidden_count = Number(tel.visibility.hidden_count || 0) + 1;
 tel.visibility.last_hidden_at = isoNow();
 tel.visibility.last_hidden_ms = now;
 if (currentStationTelemetry && !currentStationTelemetry.last_hidden_ms) {
 currentStationTelemetry.last_hidden_ms = now;
 currentStationTelemetry.hidden_count += 1;
 }
 addTelemetryEvent('tab_hidden');
 } else if (!hidden && tel.visibility.visible === false) {
 const hiddenStart = Number(tel.visibility.last_hidden_ms || 0);
 if (hiddenStart) tel.visibility.hidden_ms = Number(tel.visibility.hidden_ms || 0) + Math.max(0, now - hiddenStart);
 tel.visibility.visible = true;
 tel.visibility.last_hidden_at = null;
 tel.visibility.last_hidden_ms = null;
 if (currentStationTelemetry?.last_hidden_ms) {
 currentStationTelemetry.hidden_ms += Math.max(0, now - currentStationTelemetry.last_hidden_ms);
 currentStationTelemetry.last_hidden_ms = null;
 }
 addTelemetryEvent('tab_visible');
 }
 }

 function finishStationTelemetry(extra = {}) {
 if (!currentStationTelemetry) return null;
 updateTelemetryVisibility();
 const ended = nowMs();
 if (currentStationTelemetry.typing?.focus_started_ms) {
 currentStationTelemetry.typing.active_focus_ms += Math.max(0, ended - currentStationTelemetry.typing.focus_started_ms);
 currentStationTelemetry.typing.focus_started_ms = null;
 }
 const answer = currentStationTelemetry.station_type === 'typed' ? (byId('answerTextarea')?.value || '') : '';
 if (currentStationTelemetry.typing) {
 currentStationTelemetry.typing.final_chars = answer.length;
 currentStationTelemetry.typing.final_words = wordCount(answer);
 currentStationTelemetry.typing.active_focus_sec = Math.round(currentStationTelemetry.typing.active_focus_ms / 1000);
 delete currentStationTelemetry.typing.focus_started_ms;
 delete currentStationTelemetry.typing.active_focus_ms;
 const pasteChars = Number(currentStationTelemetry.typing.paste_chars || 0);
 currentStationTelemetry.typing.paste_ratio = answer.length ? Math.round((pasteChars / answer.length) * 100) / 100 : 0;
 currentStationTelemetry.typing.possible_paste_or_external_draft = !!(
 currentStationTelemetry.typing.paste_events
 || currentStationTelemetry.typing.large_insert_events
 || (answer.length > 400 && Number(currentStationTelemetry.typing.keydown_count || 0) < Math.max(20, answer.length / 20))
 );
 }
 currentStationTelemetry.ended_at = isoNow();
 currentStationTelemetry.elapsed_sec = secondsBetween(currentStationTelemetry.started_ms, ended);
 currentStationTelemetry.hidden_sec = Math.round(Number(currentStationTelemetry.hidden_ms || 0) / 1000);
 currentStationTelemetry.visible_sec = Math.max(0, currentStationTelemetry.elapsed_sec - currentStationTelemetry.hidden_sec);
 currentStationTelemetry.completed = true;
 Object.assign(currentStationTelemetry, extra);
 const snapshot = JSON.parse(JSON.stringify(currentStationTelemetry));
 markStationTelemetryEvent('station_completed', { elapsed_sec: snapshot.elapsed_sec });
 currentStationTelemetry = null;
 return snapshot;
 }

 function bindTypedTelemetry(answer = '') {
 const textarea = byId('answerTextarea');
 if (!textarea || !currentStationTelemetry?.typing) return;
 if (typedTelemetryBinding?.textarea) {
 typedTelemetryBinding.textarea.removeEventListener('focus', typedTelemetryBinding.onFocus);
 typedTelemetryBinding.textarea.removeEventListener('blur', typedTelemetryBinding.onBlur);
 typedTelemetryBinding.textarea.removeEventListener('keydown', typedTelemetryBinding.onKeydown);
 typedTelemetryBinding.textarea.removeEventListener('paste', typedTelemetryBinding.onPaste);
 typedTelemetryBinding.textarea.removeEventListener('input', typedTelemetryBinding.onInput);
 }
 const typing = currentStationTelemetry.typing;
 typing.restored_answer_chars = String(answer || textarea.value || '').length;
 let lastLength = textarea.value.length;
 let recentPasteAt = 0;
 const onFocus = () => {
 typing.focus_count += 1;
 if (!typing.focus_started_ms) typing.focus_started_ms = nowMs();
 };
 const onBlur = () => {
 typing.blur_count += 1;
 if (typing.focus_started_ms) {
 typing.active_focus_ms += Math.max(0, nowMs() - typing.focus_started_ms);
 typing.focus_started_ms = null;
 }
 };
 const onKeydown = event => {
 if (event.key && event.key.length === 1) typing.keydown_count += 1;
 };
 const onPaste = event => {
 const text = event.clipboardData?.getData?.('text') || '';
 typing.paste_events += 1;
 typing.paste_chars += text.length;
 typing.paste_into_empty = typing.paste_into_empty || textarea.value.trim().length === 0;
 recentPasteAt = nowMs();
 markStationTelemetryEvent('typed_paste', { chars: text.length });
 };
 const onInput = () => {
 const now = nowMs();
 const len = textarea.value.length;
 const delta = len - lastLength;
 typing.input_events += 1;
 if (!typing.first_input_at) {
 typing.first_input_at = isoNow();
 typing.first_input_delay_sec = secondsBetween(currentStationTelemetry.started_ms, now);
 }
 typing.last_input_at = isoNow();
 if (delta > 80 && now - recentPasteAt > 1200) {
 typing.large_insert_events += 1;
 typing.largest_insert_chars = Math.max(Number(typing.largest_insert_chars || 0), delta);
 }
 lastLength = len;
 };
 textarea.addEventListener('focus', onFocus);
 textarea.addEventListener('blur', onBlur);
 textarea.addEventListener('keydown', onKeydown);
 textarea.addEventListener('paste', onPaste);
 textarea.addEventListener('input', onInput);
 typedTelemetryBinding = { textarea, onFocus, onBlur, onKeydown, onPaste, onInput };
 }

 function compactTelemetryForSend() {
 const tel = updateMockCurrent('send');
 return {
 ...tel,
 station_events: (tel.station_events || []).slice(-80),
 breaks: (tel.breaks || []).slice(-20),
 current_station: currentStationTelemetry ? {
 ...currentStationTelemetry,
 events: (currentStationTelemetry.events || []).slice(-20),
 } : null,
 };
 }

 async function sendMockTelemetry(reason = 'heartbeat', options = {}) {
 if (!mockAttemptId || !started || !mockTelemetry) return;
 updateMockCurrent(reason);
 const token = getAuth()?.getToken?.();
 if (!token) return;
 const payload = JSON.stringify({ reason, telemetry: compactTelemetryForSend() });
 try {
 await fetch(`${apiBase()}/api/casper-mock/attempt/${encodeURIComponent(mockAttemptId)}/telemetry`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
 body: payload,
 keepalive: !!options.keepalive && payload.length < 60000,
 });
 } catch {}
 }

 // Recording reliability helpers. Phone/tablet browsers frequently capture a video but
 // fail to upload a playable recording, which silently loses mock stations; warn up front.
 function isLikelyMobileOrTablet() {
 try {
 const ua = navigator.userAgent || '';
 if (/Mobi|Android|iPhone|iPod|iPad|Windows Phone|IEMobile|Tablet|Silk/i.test(ua)) return true;
 if (/Macintosh/.test(ua) && Number(navigator.maxTouchPoints || 0) > 1) return true; // iPadOS reports as Mac
 return false;
 } catch (e) { return false; }
 }
 function deviceWarningHtml() {
 if (!isLikelyMobileOrTablet()) return '';
 return '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;font-size:0.84rem;color:#991b1b;line-height:1.6;margin-bottom:18px;"><strong>Please use a laptop or desktop in Chrome for this mock.</strong> Phone and tablet browsers often fail to save the video recordings (the camera records, but the file will not upload), which can lose your stations. If you only have a phone and a station shows a save error, switch to a computer and ask Dan to reset your pass.</div>';
 }
 let _wasHiddenDuringVideo = false;
 function onVideoStationNow() {
 return started && sequence[index] && sequence[index].type === 'video';
 }
 function showMockWarningToast(msg) {
 try {
 let el = document.getElementById('mockWarnToast');
 if (!el) {
 el = document.createElement('div');
 el.id = 'mockWarnToast';
 el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;background:#7c2d12;color:#fff;padding:12px 18px;border-radius:10px;font-size:0.86rem;font-weight:700;max-width:92%;box-shadow:0 8px 30px rgba(0,0,0,0.35);text-align:center;line-height:1.5;';
 document.body.appendChild(el);
 }
 el.textContent = msg;
 el.style.display = 'block';
 clearTimeout(el._t);
 el._t = setTimeout(() => { el.style.display = 'none'; }, 7000);
 } catch (e) {}
 }

 document.addEventListener('visibilitychange', () => {
 if (!started || !mockAttemptId) return;
 if (document.visibilityState === 'hidden') {
 if (onVideoStationNow()) _wasHiddenDuringVideo = true;
 } else if (_wasHiddenDuringVideo && onVideoStationNow()) {
 _wasHiddenDuringVideo = false;
 showMockWarningToast('You left this tab during a video station. Switching tabs or apps can stop the recording. Keep this tab open and in front while recording, and re-record this station if you were mid-answer.');
 }
 updateTelemetryVisibility();
 sendMockTelemetry(document.visibilityState === 'hidden' ? 'tab_hidden' : 'tab_visible', { keepalive: document.visibilityState === 'hidden' }).catch(() => {});
 });

 window.addEventListener('beforeunload', () => {
 if (!started || !mockAttemptId) return;
 updateMockCurrent('page_unload');
 sendMockTelemetry('page_unload', { keepalive: true }).catch(() => {});
 });

 function draftSequenceLength(draft) {
 return Array.isArray(draft?.sequence) && draft.sequence.length
 ? draft.sequence.length
 : VIDEO_COUNT + TYPED_COUNT;
 }

 function draftIsFinished(draft) {
 if (!draft) return false;
 return !!draft.completed
 || draft.status === 'completed'
 || draft.phase === 'completed';
 }

 function draftBelongsToCurrentUser(draft) {
 const user = currentDraftUserSnapshot();
 if (!draft || (!draft.user_id && !draft.user_email)) return true;
 if (!user.id && !user.email) return false;
 if (draft.user_id && user.id && String(draft.user_id) !== user.id) return false;
 if (draft.user_email && user.email && String(draft.user_email).trim().toLowerCase() !== user.email) return false;
 return true;
 }

 function readMockDraft() {
 try {
 localStorage.removeItem(MOCK_DRAFT_KEY);
 const draft = JSON.parse(localStorage.getItem(currentDraftStorageKey()) || 'null');
 if (!draft || !draft.attempt_id || draftIsFinished(draft) || !draftBelongsToCurrentUser(draft)) {
 clearMockDraft();
 return null;
 }
 // A draft is only valid while the server still lists its attempt as the live in-progress one. Once an
 // admin clears the attempt (or it expires / completes), the status no longer reports that attempt id,
 // so the draft is orphaned and must be purged - this is what makes the admin "Clear mock" guaranteed
 // to unstick a student after they reload. (Skipped only until status has loaded, to avoid a false drop.)
 if (mockStatusCache && String(mockStatusCache.active_attempt_id || '') !== String(draft.attempt_id)) {
 clearMockDraft();
 return null;
 }
 return draft;
 } catch {
 return null;
 }
 }

 function clearMockDraft() {
 try {
 localStorage.removeItem(currentDraftStorageKey());
 localStorage.removeItem(MOCK_DRAFT_KEY);
 } catch {}
 }

 function startDraftMonitor() {
 clearInterval(draftTimer);
 draftTimer = setInterval(() => saveMockDraft({ phase: 'autosave' }), 3000);
 }

 function stopDraftMonitor() {
 clearInterval(draftTimer);
 draftTimer = null;
 }

 function draftAgeText(draft) {
 const updated = Date.parse(draft?.updated_at || '');
 if (!Number.isFinite(updated)) return 'recently';
 const mins = Math.max(0, Math.round((Date.now() - updated) / 60000));
 if (mins < 1) return 'just now';
 if (mins < 60) return `${mins} min ago`;
 const hours = Math.round(mins / 60);
 return `${hours} hour${hours === 1 ? '' : 's'} ago`;
 }

 function serialiseSequenceForDraft() {
 return sequence.map((item, i) => ({
 type: item.type === 'video' ? 'video' : 'typed',
 order: Number(item.order || i + 1),
 station: item.station || null,
 }));
 }

 function saveMockDraft(extra = {}) {
 if (!active || !started || !mockAttemptId) return;
 if (extra.completed || extra.status === 'completed' || extra.phase === 'completed') {
 clearMockDraft();
 return;
 }
 try {
 const user = currentDraftUserSnapshot();
 const bridge = window.K2PracticeBridge;
 bridge?.saveAnswer?.();
 const current = bridge?.getCurrentHistory?.() || null;
 const item = sequence[index] || null;
 const typedValue = byId('answerTextarea')?.value || current?.answer || '';
 const draft = {
 version: 1,
 attempt_id: mockAttemptId,
 saved_attempt_id: savedAttemptId,
 user_id: user.id,
 user_email: user.email,
 mock_exam: activeMockExam,
 tier: config.tier,
 access_timing: accessTimingPayload(),
 index,
 updated_at: new Date().toISOString(),
 sequence: serialiseSequenceForDraft(),
 rows: serialiseAttemptRows(buildRows()),
 current: item ? {
 index,
 type: item.type,
 order: item.order,
 station: item.station || current?.station || null,
 answer: item.type === 'typed' ? typedValue : '',
 } : null,
 telemetry: mockTelemetry ? compactTelemetryForSend() : null,
 ...extra,
 };
 if (draftIsFinished(draft)) {
 clearMockDraft();
 return;
 }
 localStorage.removeItem(MOCK_DRAFT_KEY);
 localStorage.setItem(currentDraftStorageKey(), JSON.stringify(draft));
 } catch {}
 }

 function hydrateResultsFromDraft(rows = []) {
 return rows.map(row => ({
 type: row.type === 'video' ? 'video' : 'typed',
 station: row.station || null,
 answer: row.answer || '',
 score: row.score ?? null,
 feedback: row.feedback || null,
 feedbackTask: null,
 feedbackSettled: true,
 transcript: row.transcript || '',
 transcriptSegments: Array.isArray(row.transcript_segments) ? row.transcript_segments : [],
 reviewId: row.review_id || null,
 recordingKey: row.recording_key || null,
 transcriptionAudioKey: row.transcription_audio_key || null,
 voiceMetrics: row.voice_metrics || null,
 visualMetrics: row.visual_metrics || null,
 visualDegraded: !!row.visual_degraded,
 durationSec: row.duration_sec || null,
 mediaDiagnostics: row.media_diagnostics || row.mediaDiagnostics || null,
 accessTiming: row.access_timing || row.accessTiming || row.timing?.access_timing || null,
 plannedWritingSec: row.planned_writing_sec || row.plannedWritingSec || row.timing?.planned_writing_sec || null,
 processingError: row.processing_error || null,
 autoRepairTask: null,
 autoRepairAttempted: !!row.auto_repair_attempted,
 autoRepairError: row.auto_repair_error || null,
 autoRepairContext: null,
 localRescuePending: !!row.local_rescue_pending,
 tier: row.tier || (row.type === 'video' ? config.tier : 'typed'),
 timing: row.timing || null,
 typing: row.typing || row.timing?.typing || null,
 }));
 }

 async function restoreDraft() {
 await refreshMockPassStatus().catch(() => {});
 const draft = readMockDraft();
 if (!draft) return;
 active = true;
 started = true;
 config.tier = draft.tier === 'premium' ? 'premium' : 'transcript';
 config.accessTiming = normaliseAccessTiming(draft.access_timing?.key || draft.access_timing || draft.accessTiming || config.accessTiming);
 persistAccessTiming();
 sequence = Array.isArray(draft.sequence) ? draft.sequence.map((item, i) => ({
 type: item.type === 'video' ? 'video' : 'typed',
 order: Number(item.order || i + 1),
 station: item.station || null,
 })) : [];
 activeMockExam = draft.mock_exam || null;
 mockTelemetry = draft.telemetry || createMockTelemetry('draft_restored');
 mockTelemetry.last_seen_at = isoNow();
 results = hydrateResultsFromDraft(draft.rows || []);
 const sequenceLength = sequence.length || VIDEO_COUNT + TYPED_COUNT;
 const savedRowCount = results.length;
 index = savedRowCount >= sequenceLength
 ? sequenceLength
 : Math.max(0, Math.min(Number(draft.index || savedRowCount || 0), Math.max(sequenceLength - 1, 0)));
 mockAttemptId = draft.attempt_id;
 savedAttemptId = draft.saved_attempt_id || draft.attempt_id;
 latestReport = null;
 pendingDraftAnswer = draft.current?.type === 'typed' && Number(draft.current.index) === index ? draft.current : null;
 stationToken += 1;
 advancing = false;
 rulesAccepted = true;
 syncActiveMockContext();
 byId('casperMockMainArea')?.style.setProperty('display', 'none');
 setTier(config.tier, { skipIdleRender: true });
 startDraftMonitor();
 clearInterval(mockTelemetryTimer);
 mockTelemetryTimer = setInterval(() => sendMockTelemetry('heartbeat'), 30000);
 sendMockTelemetry('draft_restored').catch(() => {});
 launchCurrent();
 }

 function discardDraft() {
 resetMockRuntimeState();
 active = true;
 clearMockDraft();
 renderIdle();
 }

 function resetMockRuntimeState() {
 clearDoneMonitor();
 clearTransitionTimer();
 stopDraftMonitor();
 stopMockTelemetry();
 if (typedTelemetryBinding?.textarea) {
 typedTelemetryBinding.textarea.removeEventListener('focus', typedTelemetryBinding.onFocus);
 typedTelemetryBinding.textarea.removeEventListener('blur', typedTelemetryBinding.onBlur);
 typedTelemetryBinding.textarea.removeEventListener('keydown', typedTelemetryBinding.onKeydown);
 typedTelemetryBinding.textarea.removeEventListener('paste', typedTelemetryBinding.onPaste);
 typedTelemetryBinding.textarea.removeEventListener('input', typedTelemetryBinding.onInput);
 typedTelemetryBinding = null;
 }
 clearInterval(breakTimer);
 breakTimer = null;
 restoreSubmit();
 window.K2PracticeBridge?.hardStopSession?.();
 window.K2_ACTIVE_CASPER_MOCK = null;
 started = false;
 rulesAccepted = false;
 sequence = [];
 index = 0;
 results = [];
 finalVideoRows = [];
 finalReviewRows = [];
 breakLeft = 0;
 stationToken += 1;
 advancing = false;
 pendingMediaSafety = null;
 mockAttemptId = null;
 savedAttemptId = null;
 latestReport = null;
 pendingDraftAnswer = null;
 mockSafetyAcknowledged = { audio: false, visual: false };
 serverCheckpointBusy = false;
 queuedCheckpointReason = null;
 lastRescueRecording = null;
 lastMockSaveResponse = null;
 activeMockExam = null;
 mockTelemetry = null;
 currentStationTelemetry = null;
 currentBreakTelemetry = null;
 clearMockDraft();
 }

 function assertServerAcceptedMockProgress(reason = 'station') {
 const data = lastMockSaveResponse || {};
 if (!data.ok || data.status === 'completed' || data.rescue_pending) return;
 const serverOrder = Number(data.current_station_order || 0);
 const expectedOrder = Math.min(VIDEO_COUNT + TYPED_COUNT, results.length + 1);
 if (serverOrder && serverOrder < expectedOrder) {
 throw new Error(`The server saved your answer but has not unlocked the next station yet. Please press Try saving again. (${reason})`);
 }
 }

 async function checkpointMockAttempt(reason = 'station', options = {}) {
 if (!mockAttemptId || !results.length) return;
 if (serverCheckpointBusy) {
 if (options.throwOnError) {
 for (let i = 0; i < 10 && serverCheckpointBusy; i++) await sleep(300);
 if (serverCheckpointBusy) throw new Error('A previous save is still finishing. Please try again in a moment.');
 return checkpointMockAttempt(reason, options);
 }
 queuedCheckpointReason = reason;
 return;
 }
 serverCheckpointBusy = true;
 try {
 await saveMockAttempt(buildRows(), null, 'in_progress');
 assertServerAcceptedMockProgress(reason);
 saveMockDraft({ phase: reason, checkpointed_at: new Date().toISOString() });
 startPendingAutoRepairs();
 } catch (err) {
 saveMockDraft({ phase: reason, checkpoint_error: err.message || 'Checkpoint failed' });
 if (options.throwOnError) throw err;
 } finally {
 serverCheckpointBusy = false;
 const nextReason = queuedCheckpointReason;
 queuedCheckpointReason = null;
 if (nextReason) checkpointMockAttempt(nextReason);
 }
 }

 function hideStationReflection() {
 ['stationReflectionWrap', 'stationReflection'].forEach(id => {
 const el = byId(id);
 if (el) el.style.display = 'none';
 });
 }

 function hasFullMockPass(status, tier = config.tier) {
 return !!status?.active
 && status.tier === tier
 && (status.active_attempt_id
 || (Number(status.video_remaining || 0) >= VIDEO_COUNT
 && Number(status.typed_remaining || 0) >= TYPED_COUNT));
 }

 async function fetchMockPassStatus() {
 const auth = getAuth();
 const token = auth?.getToken?.();
 if (!token) return null;
 const res = await fetch(`${apiBase()}/api/casper-mock/status`, {
 method: 'GET',
 headers: { 'Authorization': `Bearer ${token}` },
 });
 if (!res.ok) return null;
 const status = await res.json().catch(() => null);
 if (status) {
 mockStatusCache = status;
 // Lock the tier to the active pass so the video review never sends a tier the pass does not cover.
 // A mismatch (e.g. premium selected on a transcript pass) makes the worker reject it as
 // "pass not active yet", which is what forced the manual tier switch on entry.
 if (status.tier === 'premium' || status.tier === 'transcript') config.tier = status.tier;
 }
 return status;
 }

 async function refreshMockPassStatus() {
 const token = ++mockStatusRefreshToken;
 const status = await fetchMockPassStatus().catch(() => null);
 if (token !== mockStatusRefreshToken) return;
 mockStatusCache = status;
 if (active && !started) renderIdle();
 }

 async function hasMockPass(tier = config.tier) {
 const justReturned = returnedFromCheckout(tier);
 const attempts = justReturned ? 6 : 1;
 for (let attempt = 0; attempt < attempts; attempt++) {
 const status = await fetchMockPassStatus();
 if (hasFullMockPass(status, tier)) return true;
 if (justReturned && attempt < attempts - 1) await sleep(1200);
 }
 if (justReturned) {
 throw new Error('Your payment was successful, but Stripe is still activating your mock pass. Wait a few seconds, then press Start again.');
 }
 return false;
 }

 async function checkoutMock(tier = config.tier) {
 const auth = getAuth();
 if (!auth) {
 throw new Error('The login system is still loading. Please refresh the page and try again.');
 }
 if (!auth.isLoggedIn()) {
 auth.showAuthModal?.('signup');
 return;
 }
 const token = auth.getToken();
 const successUrl = `${window.location.origin}${window.location.pathname}?tab=mock&mock_payment=success&mock_tier=${encodeURIComponent(tier)}`;
 const cancelUrl = `${window.location.origin}${window.location.pathname}?tab=mock&mock_payment=cancelled`;
 const checkoutBody = { tier, success_url: successUrl, cancel_url: cancelUrl };
 const res = await fetch(`${apiBase()}/api/casper-mock/checkout`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
 body: JSON.stringify(checkoutBody),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(data.message || data.error || 'Could not start mock checkout');
 if (!data.checkout_url) throw new Error('Checkout did not return a Stripe link. Make sure the patched worker is deployed.');
 window.location.href = data.checkout_url;
 }

 async function startPrivateMockAttempt() {
 const token = authTokenOrThrow();
 const res = await fetch(`${apiBase()}/api/casper-mock/start`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
 body: JSON.stringify({ tier: config.tier, access_timing: accessTimingPayload() }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(data.message || data.error || 'Could not prepare the private mock stations.');
 if (!data.attempt_id || !Array.isArray(data.sequence) || data.sequence.length < VIDEO_COUNT + TYPED_COUNT) {
 throw new Error('The private mock bank is not ready yet. Please try again shortly.');
 }
 return data;
 }

 async function loadServerMockAttempt(attemptId) {
 const token = authTokenOrThrow();
 const res = await fetch(`${apiBase()}/api/casper-mock/attempt/${encodeURIComponent(attemptId)}`, {
 method: 'GET',
 headers: { 'Authorization': `Bearer ${token}` },
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(data.message || data.error || 'Could not restore your saved mock attempt.');
 return data.attempt || null;
 }

 async function loadPrivateMockStation(item) {
 if (!item || item.station) return item?.station || null;
 const token = authTokenOrThrow();
 const params = new URLSearchParams({
 attempt_id: mockAttemptId,
 station_order: String(item.order || index + 1),
 });
 const res = await fetch(`${apiBase()}/api/casper-mock/station?${params.toString()}`, {
 method: 'GET',
 headers: { 'Authorization': `Bearer ${token}` },
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(data.message || data.error || 'Could not load the next private mock station.');
 if (!data.station?.scenario || !data.station?.prompt1) throw new Error('The private mock station is incomplete.');
 item.station = data.station;
 item.type = data.type === 'video' ? 'video' : 'typed';
 item.order = Number(data.order || item.order || index + 1);
 return item.station;
 }

 function tierLabel(tier = config.tier) {
 return tier === 'premium' ? 'Premium' : 'Transcript';
 }

 function pluralise(count, singular, plural = `${singular}s`) {
 return Number(count) === 1 ? singular : plural;
 }

 function mockBankSummaryText(status = mockStatusCache) {
 const total = Number(status?.mock_bank_total || 0);
 const available = Number(status?.mock_bank_available || 0);
 if (total > 0) {
 return `${total} active ${pluralise(total, 'mock')}; ${Math.max(0, available)} unused for this account. Key2MD automatically selects the next unused mock.`;
 }
 return '5 all-new private mocks are live. Every question is hand-written by Dan, and Key2MD automatically selects the next unused mock for this account.';
 }

 function checkoutButtonText() {
 if (mockStatusCache?.active_attempt_id && mockStatusCache?.tier === config.tier) {
 return `Resume ${tierLabel(config.tier)} Mock`;
 }
 if (hasFullMockPass(mockStatusCache, config.tier)) {
 return `Enter ${tierLabel(config.tier)} Mock`;
 }
 return `Buy & Enter ${tierLabel(config.tier)} Mock`;
 }

 function setCheckoutState(isBusy, message = '', busyLabel = 'Redirecting to Stripe...') {
 document.querySelectorAll('.mock-checkout-btn').forEach(btn => {
 btn.disabled = isBusy;
 btn.style.opacity = isBusy ? '0.72' : '1';
 btn.textContent = isBusy ? busyLabel : checkoutButtonText();
 });
 document.querySelectorAll('.mock-checkout-status').forEach(status => {
 status.textContent = message;
 status.style.display = message ? 'block' : 'none';
 });
 }

 function renderPriceLine(tier = config.tier) {
 const prices = MOCK_PRICES[tier] || MOCK_PRICES.transcript;
 const current = priceForTier(tier);
 const proText = isCasperPro()
 ? 'CASPer Pro discount applied'
 : `CASPer Pro price $${prices.pro}`;
 return `<strong>$${current}</strong> ${tierLabel(tier)} Mock <span style="color:var(--gray400);font-weight:600;">(normally $${prices.standard}; ${proText})</span>`;
 }

 function shuffle(items) {
 const copy = [...items];
 for (let i = copy.length - 1; i > 0; i--) {
 const j = Math.floor(Math.random() * (i + 1));
 [copy[i], copy[j]] = [copy[j], copy[i]];
 }
 return copy;
 }

 function balancedPick(stations, count) {
 const buckets = {};
 stations.forEach(station => {
 const cat = station.category || 'General';
 if (!buckets[cat]) buckets[cat] = [];
 buckets[cat].push(station);
 });
 Object.keys(buckets).forEach(cat => { buckets[cat] = shuffle(buckets[cat]); });
 const cats = shuffle(Object.keys(buckets));
 const picked = [];
 let cursor = 0;
 while (picked.length < count && picked.length < stations.length) {
 const cat = cats[cursor % cats.length];
 const bucket = buckets[cat] || [];
 const next = bucket.shift();
 if (next && !picked.includes(next)) picked.push(next);
 cursor++;
 if (cursor > count * cats.length * 4) break;
 }
 return picked.length >= count ? picked.slice(0, count) : shuffle(stations).slice(0, count);
 }

 function injectMockReportStyles() {
  if (document.getElementById('k2mr-stylesheet')) return;
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap';
  fonts.id = 'k2mr-fonts';
  document.head.appendChild(fonts);
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'mock-report-redesign.css';
  css.id = 'k2mr-stylesheet';
  document.head.appendChild(css);
 }

 function init() {
  injectMockReportStyles();
  applyTierFromUrl();
  renderConfigPanel();
  setTier(config.tier, { skipIdleRender: true });
  bindNavigation();
  bindPracticeNudge();
 if (window.location.search.includes('tab=mock') || window.location.hash === '#full-casper-mock') {
 setTimeout(() => {
 if (window.setMode) window.setMode('mock');
 activateMockMode();
 }, 100);
 }
 }

 function bindNavigation() {
 const next = byId('nextBtn');
 if (next) {
 next.addEventListener('click', event => {
 if (!active || !started) return;
 event.preventDefault();
 event.stopImmediatePropagation();
 handleNextClick();
 }, true);
 }

 document.addEventListener('click', event => {
 const checkoutBtn = event.target?.closest?.('.mock-checkout-btn');
 if (checkoutBtn) {
 event.preventDefault();
 event.stopImmediatePropagation();
 startMock();
 return;
 }

 if (event.target?.id === 'modeCasper' || event.target?.id === 'modeMMI') {
 if (active) deactivateMockMode();
 }
 }, true);
 }

 function renderConfigPanel() {
 const sidebar = document.querySelector('aside.sidebar') || document.querySelector('.sidebar');
 if (!sidebar || byId('casperMockConfigPanel')) return;

 const panel = document.createElement('div');
 panel.id = 'casperMockConfigPanel';
 panel.style.display = 'none';
 panel.style.position = 'relative';
 panel.style.zIndex = '80';
 panel.style.pointerEvents = 'auto';
 panel.innerHTML = `
 <div class="sidebar-card" style="border-color:rgba(14,165,233,0.25);background:linear-gradient(180deg,rgba(14,165,233,0.06),#fff);">
 <h3>Full CASPer Mock</h3>
 <div style="font-size:0.82rem;color:var(--gray600);line-height:1.55;margin-bottom:14px;">
 CASPer-style sequence: 4 video scenarios, 10-minute optional break, then 7 typed scenarios with a 5-minute optional break after typed station 4. 5 private mocks are live, equity access timing is supported, and each account is assigned the next unused one.
 </div>

 <div style="margin-bottom:14px;">
 <div style="font-size:0.72rem;font-weight:700;color:var(--gray500);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Video feedback tier</div>
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
 <button class="mock-tier-btn active" data-mock-tier="transcript" onclick="FullCasperMock.setTier('transcript')" style="padding:9px 6px;border-radius:8px;border:1px solid rgba(14,165,233,0.45);background:rgba(14,165,233,0.09);color:var(--teal3);font-size:0.78rem;font-weight:800;cursor:pointer;font-family:inherit;">Transcript</button>
 <button class="mock-tier-btn" data-mock-tier="premium" onclick="FullCasperMock.setTier('premium')" style="padding:9px 6px;border-radius:8px;border:1px solid var(--gray200);background:var(--gray50);color:var(--gray600);font-size:0.78rem;font-weight:800;cursor:pointer;font-family:inherit;">Premium</button>
 </div>
 <div id="mockTierCopy" data-mock-tier-copy="sidebar" style="font-size:0.7rem;color:var(--gray400);line-height:1.45;margin-top:8px;">Transcript analysis reviews the substance of what you said. Premium adds voice and presentation analysis.</div>
 </div>

 <div style="background:#fff;border:1px solid rgba(14,165,233,0.24);border-radius:10px;padding:12px;margin-bottom:14px;">
 <div style="font-size:0.68rem;font-weight:800;color:var(--teal3);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Mock exam pass</div>
 <div id="mockPriceLine" data-mock-price-line style="font-size:0.86rem;color:var(--navy);line-height:1.45;">${renderPriceLine('transcript')}</div>
 <div style="font-size:0.7rem;color:var(--gray500);line-height:1.45;margin-top:7px;">Includes your next unused 11-station mock, 7 typed-station CASPer AI markings, optional equity access timing, and 4 CASPer video analyses. CASPer Pro subscribers save about 30%.</div>
 </div>

 <div style="background:rgba(10,22,40,0.04);border:1px solid var(--gray200);border-radius:10px;padding:11px 12px;margin-bottom:14px;">
 <div style="font-size:0.72rem;color:var(--gray500);margin-bottom:4px;">Approximate exam time</div>
 <div style="font-size:1rem;font-weight:800;color:var(--navy);">65-110 minutes</div>
 </div>

 <button type="button" class="mock-checkout-btn" style="position:relative;z-index:81;pointer-events:auto;width:100%;padding:13px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.92rem;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(10,22,40,0.25);">
 ${checkoutButtonText()}
 </button>
 <div class="mock-checkout-status" style="display:none;margin-top:9px;font-size:0.72rem;color:var(--gray500);line-height:1.45;text-align:center;"></div>
 </div>
 `;
 sidebar.appendChild(panel);
 }

 function setTier(tier, options = {}) {
 config.tier = tier === 'premium' ? 'premium' : 'transcript';
 rulesAccepted = false;
 document.querySelectorAll('[data-mock-tier]').forEach(btn => {
 const selected = btn.dataset.mockTier === config.tier;
 btn.classList.toggle('active', selected);
 btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
 btn.style.border = selected ? '1px solid rgba(14,165,233,0.45)' : '1px solid var(--gray200)';
 btn.style.background = selected ? 'rgba(14,165,233,0.09)' : 'var(--gray50)';
 btn.style.color = selected ? 'var(--teal3)' : 'var(--gray600)';
 });
 document.querySelectorAll('[data-mock-tier-copy]').forEach(copy => {
 if (copy.dataset.mockTierCopy === 'short') {
 copy.innerHTML = config.tier === 'premium'
 ? 'Premium adds voice, pacing, and presentation feedback to the video stations. <a href="plans.html#mock" style="color:var(--teal3);font-weight:800;text-decoration:none;">See full details</a>.'
 : 'Transcript analyses what you said in the video stations, without voice or presentation review. <a href="plans.html#mock" style="color:var(--teal3);font-weight:800;text-decoration:none;">See full details</a>.';
 } else {
 copy.textContent = config.tier === 'premium'
 ? 'Premium uses the current video analysis flow: transcript, voice pacing, and presentation signals.'
 : 'Transcript analysis reviews the substance of what you said, without sending visual snapshots.';
 }
 });
 document.querySelectorAll('[data-mock-price-line]').forEach(price => {
 price.innerHTML = renderPriceLine(config.tier);
 });
 setCheckoutState(false);
 if (!options.skipIdleRender && active && !started) renderIdle();
 }

 function refreshPricing() {
 setTier(config.tier, { skipIdleRender: true });
 }

 function activateMockMode() {
 active = true;
 renderConfigPanel();
 setTier(config.tier, { skipIdleRender: true });
 document.querySelectorAll('.mode-pill').forEach(pill => pill.classList.remove('active-casper', 'active-mmi', 'active-mock'));
 byId('modeMock')?.classList.add('active-mock');
 hideNormalPanels();
 setStationChrome(false);
 byId('casperMockConfigPanel')?.style.setProperty('display', 'block');
 ensureMainArea();
 renderIdle();
 refreshMockPassStatus();
 }

 function deactivateMockMode() {
 saveMockDraft({ phase: 'paused' });
 active = false;
 started = false;
 advancing = false;
 rulesAccepted = false;
 activeMockExam = null;
 stationToken += 1;
 window.K2_ACTIVE_CASPER_MOCK = null;
 restoreSubmit();
 clearDoneMonitor();
 clearTransitionTimer();
 clearInterval(breakTimer);
 stopDraftMonitor();
 byId('casperMockConfigPanel')?.style.setProperty('display', 'none');
 const area = byId('casperMockMainArea');
 if (area) area.style.display = 'none';
 const progress = byId('casperMockProgress');
 if (progress) progress.remove();
 ['startBtn','scenarioCard','bottomRail'].forEach(id => {
 const el = byId(id);
 if (el) el.style.display = '';
 });
 setStationChrome(true);
 window.K2PracticeBridge?.hardStopSession();
 }

 function setStationChrome(show) {
 document.querySelectorAll('.station-header,.nav-controls,#historyLinkBar').forEach(el => {
 el.style.display = show ? '' : 'none';
 });
 }

 function keepMockModeChrome() {
 byId('modeCasper')?.classList.remove('active-casper');
 byId('modeMMI')?.classList.remove('active-mmi');
 byId('modeMock')?.classList.add('active-mock');
 const onboard = byId('mmiOnboardModal');
 if (onboard) onboard.style.display = 'none';
 }

 function hideNormalPanels() {
 ['categoryCard','casperCategoryCard','mmiCategoryCard','mmiOptionsCard','casperClassCard','webcamPanel','startBtn','scenarioCard','bottomRail','reviewPanel'].forEach(id => {
 const el = byId(id);
 if (!el) return;
 if (id === 'reviewPanel') el.classList.remove('show');
 else el.style.display = 'none';
 });
 }

 function ensureMainArea() {
 const main = document.querySelector('.main-content');
 if (!main) return null;
 let area = byId('casperMockMainArea');
 if (!area) {
 area = document.createElement('div');
 area.id = 'casperMockMainArea';
 main.appendChild(area);
 }
 area.style.display = 'block';
 area.style.position = 'relative';
 area.style.zIndex = '80';
 area.style.pointerEvents = 'auto';
 return area;
 }

 function mockServerBanner(status = mockStatusCache) {
 if (!status?.active) return '';
 const isSelectedTier = status.tier === config.tier;
 if (status.active_attempt_id && isSelectedTier) {
 const order = Math.max(1, Math.min(VIDEO_COUNT + TYPED_COUNT, Number(status.active_attempt_current_station_order || 1)));
 return `
 <div style="max-width:720px;margin:0 auto 18px;background:#ecfdf5;border:1px solid rgba(22,163,74,0.24);border-radius:12px;padding:13px 15px;text-align:left;">
 <div style="font-size:0.75rem;font-weight:900;color:#14532d;">Active mock found</div>
 <div style="font-size:0.74rem;color:#166534;line-height:1.45;margin-top:3px;">Your ${esc(tierLabel(status.tier))} mock is saved on the server at station ${order}. Press Resume to continue from the latest saved station.</div>
 </div>
 `;
 }
 if (isSelectedTier && hasFullMockPass(status, config.tier)) {
 const nextTitle = status.next_mock?.title ? ` It will assign ${status.next_mock.title} if you have not sat it before.` : '';
 return `
 <div style="max-width:720px;margin:0 auto 18px;background:#eff6ff;border:1px solid rgba(14,165,233,0.24);border-radius:12px;padding:13px 15px;text-align:left;">
 <div style="font-size:0.75rem;font-weight:900;color:var(--navy);">Mock pass ready</div>
 <div style="font-size:0.74rem;color:var(--gray600);line-height:1.45;margin-top:3px;">Your ${esc(tierLabel(status.tier))} mock pass is active. Press Enter to read the rules and begin.${esc(nextTitle)}</div>
 </div>
 `;
 }
 if (status.tier && !isSelectedTier) {
 return `
 <div style="max-width:720px;margin:0 auto 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:13px 15px;text-align:left;">
 <div style="font-size:0.75rem;font-weight:900;color:#9a3412;">Different mock pass active</div>
 <div style="font-size:0.74rem;color:#7c2d12;line-height:1.45;margin-top:3px;">Your active pass is for the ${esc(tierLabel(status.tier))} mock. Select that version above to resume or start it.</div>
 </div>
 `;
 }
 return '';
 }

 function renderIdle() {
 const area = ensureMainArea();
 if (!area) return;
 const draft = readMockDraft();
 const draftSequenceLength = Array.isArray(draft?.sequence) && draft.sequence.length ? draft.sequence.length : VIDEO_COUNT + TYPED_COUNT;
 const draftRowsLength = Array.isArray(draft?.rows) ? draft.rows.length : 0;
 const draftResumeLabel = draftRowsLength >= draftSequenceLength ? 'the final report' : `station ${Number(draft?.index || 0) + 1}`;
 const draftBanner = draft ? `
 <div style="max-width:720px;margin:0 auto 18px;background:#ecfeff;border:1px solid rgba(14,165,233,0.26);border-radius:12px;padding:13px 15px;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;flex-wrap:wrap;">
 <div>
 <div style="font-size:0.75rem;font-weight:900;color:var(--navy);">Saved mock draft found</div>
 <div style="font-size:0.74rem;color:var(--gray600);line-height:1.45;">Last saved ${esc(draftAgeText(draft))}. Restore it to continue from ${esc(draftResumeLabel)}.</div>
 </div>
 <div style="display:flex;gap:8px;flex-wrap:wrap;">
 <button type="button" onclick="FullCasperMock.restoreDraft()" style="padding:9px 14px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.78rem;font-weight:850;cursor:pointer;font-family:inherit;">Restore draft</button>
 <button type="button" onclick="FullCasperMock.discardDraft()" style="padding:9px 14px;border-radius:50px;border:1px solid rgba(14,165,233,0.25);background:#fff;color:var(--teal3);font-size:0.78rem;font-weight:850;cursor:pointer;font-family:inherit;">Discard</button>
 </div>
 </div>
 ` : '';
 const serverBanner = mockServerBanner();
 const bankLine = mockBankSummaryText();
 area.innerHTML = `
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:34px 32px;text-align:center;">
 <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:10px;">Full CASPer Mock Exam</div>
 <h2 style="font-size:1.7rem;line-height:1.2;color:var(--navy);margin:0 0 10px;">Practise the full sequence in one sitting.</h2>
 <p style="font-size:0.94rem;color:var(--gray600);line-height:1.7;max-width:660px;margin:0 auto 24px;">Exam-mode CASPer practice: 4 video-response scenarios first, then 7 typed-response scenarios, with optional breaks built in. The mock bank now has 5 full exams live; students are assigned a fresh unused mock each time they buy, with more being added.</p>
 ${draftBanner}
 ${serverBanner}
 <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:720px;margin:0 auto 26px;text-align:left;">
 <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:14px;">
 <div style="font-size:0.78rem;font-weight:800;color:var(--navy);margin-bottom:4px;">4 video stations</div>
 <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;">30s to reflect after the station prompt, then 10s to read each question and 60s to answer.</div>
 </div>
 <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:14px;">
 <div style="font-size:0.78rem;font-weight:800;color:var(--navy);margin-bottom:4px;">7 typed stations</div>
 <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;">Two questions together. Use standard timing, or choose an equity/low-pressure timing option before you begin.</div>
 </div>
 <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:14px;">
 <div style="font-size:0.78rem;font-weight:800;color:var(--navy);margin-bottom:4px;">No repeats</div>
 <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;">${esc(bankLine)}</div>
 </div>
 </div>
 <div style="max-width:680px;margin:0 auto 18px;text-align:left;">
 <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--teal3);margin-bottom:9px;text-align:center;">Choose your mock</div>
 <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
 <button type="button" data-mock-tier="transcript" onclick="FullCasperMock.setTier('transcript')" aria-pressed="true" style="text-align:left;border:1px solid rgba(14,165,233,0.45);background:rgba(14,165,233,0.09);border-radius:12px;padding:15px;cursor:pointer;font-family:inherit;color:var(--teal3);">
 <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
 <div style="font-size:0.72rem;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;">Transcript Mock</div>
 <div style="font-size:0.66rem;font-weight:900;background:#fff;border:1px solid rgba(14,165,233,0.22);border-radius:50px;padding:3px 8px;white-space:nowrap;">Best value</div>
 </div>
 <div style="font-size:1.35rem;font-weight:900;color:var(--navy);">$59 <span style="font-size:0.8rem;color:var(--gray400);font-weight:700;">or $41 Pro</span></div>
 <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;margin-top:6px;">Written feedback plus transcript-based video analysis.</div>
 </button>
 <button type="button" data-mock-tier="premium" onclick="FullCasperMock.setTier('premium')" aria-pressed="false" style="text-align:left;border:1px solid var(--gray200);background:var(--gray50);border-radius:12px;padding:15px;cursor:pointer;font-family:inherit;color:var(--gray600);">
 <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
 <div style="font-size:0.72rem;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;">Premium Mock</div>
 <div style="font-size:0.66rem;font-weight:900;background:#fff;border:1px solid rgba(124,58,237,0.18);border-radius:50px;padding:3px 8px;white-space:nowrap;">Full video</div>
 </div>
 <div style="font-size:1.35rem;font-weight:900;color:var(--navy);">$79 <span style="font-size:0.8rem;color:var(--gray400);font-weight:700;">or $55 Pro</span></div>
 <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;margin-top:6px;">Adds voice, pacing, and presentation analysis.</div>
 </button>
 </div>
 </div>
 <button type="button" class="mock-checkout-btn" style="position:relative;z-index:81;pointer-events:auto;padding:13px 30px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.94rem;font-weight:800;cursor:pointer;font-family:inherit;">${checkoutButtonText()}</button>
 <div class="mock-checkout-status" style="display:none;margin-top:10px;font-size:0.78rem;color:var(--gray500);line-height:1.45;"></div>
 <div data-mock-tier-copy="short" style="max-width:620px;margin:13px auto 0;font-size:0.78rem;color:var(--gray500);line-height:1.55;">Transcript analyses what you said in the video stations, without voice or presentation review. <a href="plans.html#mock" style="color:var(--teal3);font-weight:800;text-decoration:none;">See full details</a>.</div>
 </div>
 `;
 setTier(config.tier, { skipIdleRender: true });
 }

 function accessTimingSelectorHtml() {
 const options = Object.values(ACCESS_TIMING_OPTIONS);
 return `
 <div style="background:linear-gradient(135deg,rgba(14,165,233,0.08),rgba(34,197,94,0.04));border:1px solid rgba(14,165,233,0.22);border-radius:14px;padding:16px;margin:0 0 18px;">
 <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
 <div>
 <div style="font-size:0.7rem;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:var(--teal3);margin-bottom:4px;">Equity access / first run</div>
 <div style="font-size:0.92rem;font-weight:900;color:var(--navy);line-height:1.3;">Typed-station timing</div>
 </div>
 <div id="mockAccessTimingSummary" style="font-size:0.75rem;font-weight:900;color:var(--teal3);background:#fff;border:1px solid rgba(14,165,233,0.18);border-radius:999px;padding:6px 10px;">${esc(accessTimingOption().shortLabel)} · ${formatSeconds(typedWritingSeconds())}</div>
 </div>
 <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px;">
 ${options.map(option => `
 <button type="button" data-mock-access-timing="${esc(option.key)}" onclick="FullCasperMock.setAccessTiming('${esc(option.key)}')" style="text-align:left;border:1px solid var(--gray200);background:#fff;border-radius:12px;padding:12px;cursor:pointer;font-family:inherit;color:var(--gray600);">
 <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
 <strong style="font-size:0.88rem;color:var(--navy);">${esc(option.cardTitle)}</strong>
 <span style="font-size:0.67rem;font-weight:900;color:var(--teal3);background:rgba(14,165,233,0.08);border-radius:999px;padding:3px 7px;white-space:nowrap;">${esc(option.cardMeta)}</span>
 </div>
 <span style="display:block;font-size:0.72rem;color:var(--gray500);line-height:1.45;">${esc(option.description)}</span>
 </button>
 `).join('')}
 </div>
 <div id="mockAccessTimingStatus" style="font-size:0.76rem;color:var(--gray500);line-height:1.55;">This affects the 7 typed stations only. Video stations keep standard timing.</div>
 </div>
 `;
 }

 function updateAccessTimingUI() {
 const selected = accessTimingOption();
 document.querySelectorAll('[data-mock-access-timing]').forEach(btn => {
 const activeTiming = btn.dataset.mockAccessTiming === selected.key;
 btn.style.background = activeTiming ? 'rgba(14,165,233,0.1)' : '#fff';
 btn.style.borderColor = activeTiming ? 'rgba(14,165,233,0.55)' : 'var(--gray200)';
 btn.style.boxShadow = activeTiming ? '0 8px 18px rgba(14,165,233,0.12)' : 'none';
 btn.setAttribute('aria-pressed', activeTiming ? 'true' : 'false');
 });
 const summary = byId('mockAccessTimingSummary');
 if (summary) summary.textContent = `${selected.shortLabel} · ${formatSeconds(selected.typedSeconds)} write`;
 const status = byId('mockAccessTimingStatus');
 if (status) {
 status.textContent = selected.key === 'standard'
 ? 'Standard timing selected. Use an equity option only if it matches your accommodations, or if you want a gentler first mock before standard timing.'
 : `${selected.label} selected for typed stations: ${formatSeconds(selected.typedSeconds)} total writing time after reflection. Video station timing stays standard.`;
 status.style.color = selected.key === 'standard' ? 'var(--gray500)' : 'var(--teal3)';
 }
 }

 function setAccessTiming(value) {
 if (started || results.length) {
 const status = byId('mockAccessTimingStatus');
 if (status) {
 status.textContent = 'Timing is locked once the mock has started, so the saved attempt stays consistent.';
 status.style.color = '#b45309';
 }
 return;
 }
 config.accessTiming = normaliseAccessTiming(value);
 persistAccessTiming();
 updateAccessTimingUI();
 syncActiveMockContext();
 sendMockTelemetry('access_timing_selected').catch(() => {});
 }

 async function startMock() {
 active = true;
 const auth = getAuth();
 if (!auth) {
 setCheckoutState(false, 'The login system is still loading. Please refresh the page and try again.');
 alert('The login system is still loading. Please refresh the page and try again.');
 return;
 }
 if (!auth.isLoggedIn()) {
 if (typeof auth.showAuthModal === 'function') {
 auth.showAuthModal('signup');
 } else {
 setCheckoutState(false, 'Please log in or create an account before starting the mock.');
 alert('Please log in or create an account before starting the mock.');
 }
 return;
 }

 setCheckoutState(true, 'Checking your mock exam pass...', 'Checking pass...');
 let passReady = false;
 try {
 passReady = await hasMockPass(config.tier);
 } catch (err) {
 setCheckoutState(false, err.message || 'Could not confirm your mock pass. Please try again.');
 return;
 }

 if (!passReady) {
 rulesAccepted = false;
 setCheckoutState(true, `Opening secure checkout for the ${tierLabel(config.tier)} Full CASPer Mock...`);
 checkoutMock(config.tier).catch(err => {
 setCheckoutState(false, err.message || 'Could not start checkout. Please try again.');
 alert(err.message || 'Could not start checkout. Please try again.');
 });
 return;
 }
 if (mockStatusCache?.active_attempt_id && mockStatusCache?.tier === config.tier) {
 rulesAccepted = true;
 }
 setCheckoutState(false);

 if (!rulesAccepted) {
 renderRulesGate();
 return;
 }

 beginMockExam().catch(err => {
 setCheckoutState(false, err.message || 'Could not start the mock.');
 alert(err.message || 'Could not start the mock.');
 });
 }

 function startFreshMock() {
 resetMockRuntimeState();
 active = true;
 renderIdle();
 startMock();
 }

 async function beginMockExam() {
 setCheckoutState(true, 'Preparing your private mock stations...', 'Preparing...');
 const mock = await startPrivateMockAttempt();
 sequence = mock.sequence.slice(0, VIDEO_COUNT + TYPED_COUNT).map((entry, i) => ({
 type: entry.type === 'video' ? 'video' : 'typed',
 order: Number(entry.order || i + 1),
 station: null,
 }));
 mockAttemptId = mock.attempt_id;
 savedAttemptId = mock.attempt_id;
 activeMockExam = mock.mock_exam || null;
 let restoredAttempt = null;
 if (mock.resumed) {
 try {
 restoredAttempt = await loadServerMockAttempt(mock.attempt_id);
 } catch (err) {
 console.warn('Could not load server mock attempt for resume:', err);
 }
 }
 if (restoredAttempt) restoreAccessTimingFromSaved(restoredAttempt);
 results = restoredAttempt?.rows ? hydrateResultsFromDraft(restoredAttempt.rows) : [];
 const resumeOrder = Number(mock.current_station_order || results.length + 1 || 1);
 const hasFullSavedSequence = results.length >= sequence.length;
 let retryFinalTypedRow = null;
 if (mock.resumed && hasFullSavedSequence && mockRowNeedsFinalTypedRetry(results[sequence.length - 1])) {
 retryFinalTypedRow = results.pop();
 sequence[sequence.length - 1].station = retryFinalTypedRow.station || sequence[sequence.length - 1].station || null;
 } else if (mock.resumed && hasFullSavedSequence) {
 index = sequence.length;
 latestReport = restoredAttempt?.report || null;
 pendingDraftAnswer = null;
 stationToken = 0;
 advancing = false;
 started = true;
 syncActiveMockContext();
 startMockTelemetry('mock_resumed_final_report');
 startDraftMonitor();
 saveMockDraft({ phase: 'resumed_final_report' });
 setCheckoutState(false);
 byId('casperMockMainArea')?.style.setProperty('display', 'none');
 launchCurrent();
 return;
 }
 index = retryFinalTypedRow ? sequence.length - 1 : (hasFullSavedSequence ? sequence.length : Math.max(0, Math.min(resumeOrder - 1, sequence.length - 1)));
 latestReport = null;
 pendingDraftAnswer = retryFinalTypedRow ? {
 index: sequence.length - 1,
 type: 'typed',
 answer: retryFinalTypedRow.answer || '',
 } : null;
 stationToken = 0;
 advancing = false;
 started = true;
 syncActiveMockContext();
 startMockTelemetry(mock.resumed ? 'mock_resumed' : 'mock_started');
 startDraftMonitor();
 saveMockDraft({ phase: mock.resumed ? 'resumed' : 'started' });
 setCheckoutState(false);
 byId('casperMockMainArea')?.style.setProperty('display', 'none');
 launchCurrent();
 }

 function renderRulesGate() {
 hideNormalPanels();
 setStationChrome(false);
 byId('casperMockConfigPanel')?.style.setProperty('display', 'block');
 const area = ensureMainArea();
 if (!area) return;
 area.style.display = 'block';
 area.innerHTML = `
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;overflow:hidden;">
 <div style="background:var(--navy);padding:26px 30px;color:#fff;">
 <div style="font-size:0.7rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.55);margin-bottom:8px;">Before you begin</div>
 <h2 style="font-size:1.55rem;line-height:1.25;margin:0 0 8px;">Full CASPer Mock Exam rules</h2>
 <p style="font-size:0.9rem;color:rgba(255,255,255,0.68);line-height:1.6;margin:0;max-width:720px;">Your mock pass is active. You are about to begin your next unused 11-station CASPer mock handwritten by Dan. Read this once, then proceed when you are ready to start the first video station.</p>
 </div>
 <div style="padding:26px 30px;">
 <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-bottom:20px;">
 ${ruleCard('Sequence', '4 video-response scenarios first, then an optional 10-minute break, then 7 typed-response scenarios.')}
 ${ruleCard('Video section', 'Camera and microphone are required. After the station prompt you get 30 seconds to reflect, then 10 seconds to read each question and 60 seconds to answer.')}
 ${ruleCard('Typed section', `Each typed scenario gives a short reflection period, then ${formatSeconds(typedWritingSeconds())} total writing time for two prompts under your selected timing.`)}
 ${ruleCard('Breaks', 'You can take the built-in 10-minute and 5-minute breaks, or continue early. Leaving the page may interrupt the mock.')}
 ${ruleCard('Feedback', config.tier === 'premium' ? 'Premium includes transcript, voice, pacing, and presentation analysis for video stations.' : 'Transcript mock analyses what you said in video stations without voice or presentation scoring.')}
 ${ruleCard('Report', 'The final report compares your performance against the Key2MD cohort of serious, actively preparing applicants. It is a practice estimate, not an official Acuity result.')}
 </div>
 ${deviceWarningHtml()}
 ${accessTimingSelectorHtml()}
 <div style="background:rgba(14,165,233,0.07);border:1px solid rgba(14,165,233,0.2);border-radius:12px;padding:14px 16px;font-size:0.82rem;color:var(--gray600);line-height:1.6;margin-bottom:18px;">
 Best setup: a laptop or desktop in Chrome, quiet room, charger plugged in, browser tab kept open and in front, camera permission allowed, and no page refresh once the exam starts.
 </div>
 <div style="display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">
 <button type="button" onclick="FullCasperMock.activateMockMode()" style="padding:11px 18px;border-radius:50px;border:1px solid var(--gray200);background:#fff;color:var(--gray600);font-size:0.84rem;font-weight:800;cursor:pointer;font-family:inherit;">Back</button>
 <button type="button" onclick="FullCasperMock.proceedAfterRules()" style="padding:12px 24px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.9rem;font-weight:850;cursor:pointer;font-family:inherit;">I understand - proceed</button>
 </div>
 </div>
 </div>
 `;
 updateAccessTimingUI();
 }

 function renderProcessingScreen() {
 const pending = results.filter(r => r.feedbackTask && !r.feedbackSettled).length;
 return `
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:38px 32px;text-align:center;">
 <div style="width:34px;height:34px;border:3px solid var(--gray200);border-top-color:var(--teal);border-radius:50%;animation:mmi-spin 0.8s linear infinite;margin:0 auto 16px;"></div>
 <div style="font-size:0.72rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Building your debrief</div>
 <h2 style="font-size:1.45rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">Analysing the full mock together.</h2>
 <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;max-width:660px;margin:0 auto;">Your station feedback has been submitted in the background. Your station saves are protected; keeping this tab open is best while the final report pulls together video, typed responses, stamina, and cross-station patterns.</p>
 <div style="font-size:0.78rem;color:var(--gray400);margin-top:14px;">${pending} analysis task${pending === 1 ? '' : 's'} finalising</div>
 <div style="margin-top:20px;display:flex;justify-content:center;">
 <button type="button" onclick="FullCasperMock.showPartialReportNow()" style="padding:10px 18px;border-radius:50px;border:1px solid var(--gray200);background:#fff;color:var(--navy);font-size:0.84rem;font-weight:850;cursor:pointer;font-family:inherit;">Show available report now</button>
 </div>
 <div style="font-size:0.74rem;color:var(--gray400);line-height:1.5;margin:10px auto 0;max-width:520px;">Use this if analysis takes unusually long. Any unfinished station will be clearly flagged so Dan can repair it from admin.</div>
 </div>
 `;
 }

 function renderDebriefError(err) {
 const area = ensureMainArea();
 if (!area) return;
 area.style.display = 'block';
 try {
 saveMockAttempt(buildRows(), latestReport, 'completed').then(() => clearMockDraft()).catch(() => {});
 } catch (saveErr) {
 console.warn('Mock save during report recovery failed', saveErr);
 }
 const detail = esc(err?.message || 'The report could not be assembled in this browser.');
 area.innerHTML = `
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:34px 32px;text-align:center;max-width:660px;margin:0 auto;">
 <div style="font-size:0.72rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Your mock is saved</div>
 <h2 style="font-size:1.4rem;color:var(--navy);line-height:1.3;margin:0 0 10px;">Every station saved, but the final report could not finish drawing here.</h2>
 <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;margin:0 auto 8px;max-width:560px;">Your recordings, typed answers, and AI feedback are stored on your account. This was a display problem at the last step, not lost work. You can reopen the report from your history, and Dan can rebuild it from admin if needed.</p>
 <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px;">
 <button type="button" onclick="FullCasperMock.showPartialReportNow()" style="padding:11px 20px;border-radius:50px;border:1px solid var(--gray200);background:#fff;color:var(--navy);font-size:0.86rem;font-weight:850;cursor:pointer;font-family:inherit;">Try building the report again</button>
 <a href="/history.html" style="padding:11px 20px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.86rem;font-weight:850;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center;">Open your mock history</a>
 </div>
 <div style="font-family:var(--mono);font-size:0.68rem;color:var(--gray400);line-height:1.5;margin-top:16px;word-break:break-word;">${detail}</div>
 </div>
 `;
 }

 function safeStationReviewHtml(row) {
 try {
 return stationReviewHtml(row);
 } catch (err) {
 console.error('Mock station render failed:', err, row);
 return `<div class="k2mr-notice" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.25);"><strong style="color:var(--red);">This station could not render.</strong> The rest of your report is below, and the station is still saved to your account.</div>`;
 }
 }

 function withAnalysisTimeout(promise, row) {
 const label = `${row.type === 'video' ? 'Video' : 'Typed'} ${stationShort(row)}`;
 return Promise.race([
 promise,
 new Promise((_, reject) => {
 setTimeout(() => reject(new Error(`${label} analysis is taking too long. This report is shown with the completed analyses so far.`)), 8 * 60 * 1000);
 }),
 ]);
 }

 async function settleMockFeedbackTasks() {
 const tasks = results
 .map((row, idx) => ({ row, idx }))
 .filter(item => item.row.feedbackTask && !item.row.feedbackSettled);
 await Promise.all(tasks.map(async ({ row }) => {
 try {
 const data = await withAnalysisTimeout(row.feedbackTask, row);
 applyMockFeedbackData(row, data);
 } catch (err) {
 applyMockFeedbackError(row, err);
 }
 }));
 }

 function applyMockFeedbackData(row, data) {
 if (!row || row.feedbackSettled) return;
 row.feedbackSettled = true;
 if (row.type === 'video') {
 row.feedback = data?.feedback || null;
 row.transcript = data?.transcript || '';
 row.transcriptSegments = Array.isArray(data?.transcript_segments) ? data.transcript_segments : [];
 row.rawFeedback = data || null;
 row.reviewId = data?.review_id || null;
 row.recordingKey = data?.recording_key || data?.recording_url || null;
 row.transcriptionAudioKey = data?.transcription_audio_key || null;
 row.voiceMetrics = data?.voice_metrics || null;
 row.visualMetrics = data?.visual_metrics || null;
 row.visualDegraded = !!data?.visual_degraded;
 row.processingError = data?.processing_error || data?.message || null;
 row.autoRepairError = null;
 row.audioFallback = !!data?.audio_fallback;
 if (row.audioFallback) showMockWarningToast('Your connection could not upload the video, so this station was saved as audio only. Your transcript feedback is unaffected.');
 } else {
 row.score = scoreValue(data?.score);
 row.feedback = data?.feedback || null;
 }
 }

 function applyMockFeedbackError(row, err) {
 if (!row || row.feedbackSettled) return;
 row.feedbackSettled = true;
 row.processingError = err?.message || 'Feedback processing failed.';
 }

 function mockRowHasTerminalAnalysis(row) {
 if (!row) return false;
 if (row.type === 'video') {
 return !!(row.feedback || row.transcript || row.processingError || row.processing_error || row.reprocess_error || row.recordingKey || row.recording_key);
 }
 return !!(row.feedback || Number.isFinite(scoreValue(row.score ?? row.score10)) || row.processingError || row.processing_error || row.reprocess_error);
 }

 function mockRowNeedsFinalTypedRetry(row) {
 return !!(row && row.type === 'typed' && String(row.answer || '').trim().length >= 20 && !mockRowHasTerminalAnalysis(row));
 }

 function hasMockVisualMetrics(row) {
 const value = row?.visualMetrics || row?.visual_metrics || row?.rawFeedback?.visual_metrics;
 return !!(value && typeof value === 'object' && Object.keys(value).length);
 }

 function mockVideoLocalIndex(row) {
 const idx = results.filter(item => item?.type === 'video').indexOf(row);
 return idx >= 0 ? idx + 1 : Number(row?.localIndex || row?.order || 1);
 }

 function mockMediaDiagnostics(row) {
 return row?.mediaDiagnostics || row?.media_diagnostics || {};
 }

 function mockAudioConcern(row) {
 if (!row || row.type !== 'video') return null;
 const diag = mockMediaDiagnostics(row);
 const audio = diag.audio || {};
 const blobs = diag.blobs || {};
 const transcript = String(row.transcript || '').trim();
 const processing = String(row.processingError || row.processing_error || '').trim();
 const duration = Number(row.durationSec || row.duration_sec || diag.durationSec || 0);
 const notes = [];
 let level = 'warn';
 if (/transcription|whisper|speech|audio|microphone|decode|could not be decoded|no speech/i.test(processing)) {
 notes.push(processing);
 level = 'critical';
 }
 if (!transcript && row.feedbackSettled && !row.feedback) {
 notes.push('No usable transcript was created from this recording.');
 level = 'critical';
 }
 if (duration > 0 && duration < 12) {
 notes.push(`The saved response is very short (${formatTime(Math.max(0, Math.round(duration)))}).`);
 }
 if (audio.hasAudioTrack === false) {
 notes.push('The browser did not report an available microphone track.');
 level = 'critical';
 }
 if (audio.trackEnabled === false || audio.trackMuted === true) {
 notes.push('The microphone track looked disabled or muted.');
 level = 'critical';
 }
 const maxRms = Number(audio.maxRms || 0);
 const sampleCount = Number(audio.sampleCount || 0);
 if (sampleCount >= 6 && maxRms < 0.012 && !audio.monitorError) {
 notes.push('The microphone signal was extremely low during the answer.');
 level = 'critical';
 }
 const audioBytes = Number(blobs.audioBytes || 0);
 if (!transcript && audioBytes > 0 && audioBytes < 2048) {
 notes.push('The audio-only recording file was too small to be reliable.');
 level = 'critical';
 }
 if (!notes.length) return null;
 return {
 type: 'audio',
 level,
 title: 'Microphone or speech may not have recorded properly',
 body: 'This station was saved, but the audio signal may not be strong enough for transcript-based feedback. If you continue, the mock can still proceed, but this station may need Dan to repair it from admin.',
 notes,
 };
 }

 function mockVisualConcern(row) {
 if (!row || row.type !== 'video') return null;
 const tier = row.tier || config.tier;
 if (tier !== 'premium') return null;
 const diag = mockMediaDiagnostics(row);
 const visual = diag.visual || {};
 const video = diag.video || {};
 const notes = [];
 if (video.hasVideoTrack === false) notes.push('The browser did not report an available camera track.');
 if (video.trackEnabled === false || video.trackMuted === true) notes.push('The camera track looked disabled or muted.');
 if (Number(visual.frameCount || 0) < 1) notes.push('No answer-time camera frames were available for premium visual analysis.');
 if (row.visualDegraded || !hasMockVisualMetrics(row)) notes.push('Premium camera-based visual analysis is unavailable or degraded for this station.');
 if (!notes.length) return null;
 return {
 type: 'visual',
 level: 'warn',
 title: 'Premium visual analysis may be limited',
 body: 'Your answer can still be transcribed and marked, but camera-based presentation feedback needs usable video frames. If your camera is intentionally off, you can continue; just know the premium visual component will be limited.',
 notes: [...new Set(notes)],
 };
 }

 function mockMediaSafetyIssues(row) {
 const issues = [mockAudioConcern(row), mockVisualConcern(row)].filter(Boolean);
 return issues.filter(issue => {
 if (issue.type === 'audio') return !mockSafetyAcknowledged.audio;
 if (issue.type === 'visual') return !mockSafetyAcknowledged.visual;
 return true;
 });
 }

 function mockMediaSafetySubject(row) {
 return encodeURIComponent(`Full CASPer Mock video ${mockVideoLocalIndex(row)} recording issue`);
 }

 function mockMediaSafetyBody(row, issues) {
 const lines = [
 'Hi Dan,',
 '',
 `My full CASPer mock showed a recording warning after video ${mockVideoLocalIndex(row)}.`,
 `Attempt ID: ${savedAttemptId || mockAttemptId || 'unknown'}`,
 `Recording key: ${row?.recordingKey || row?.recording_key || 'not available'}`,
 '',
 'Warnings:',
 ...issues.flatMap(issue => [`- ${issue.title}`, ...issue.notes.map(note => `  - ${note}`)]),
 '',
 'Can you please check whether the recording/transcript is usable?',
 ];
 return encodeURIComponent(lines.join('\n'));
 }

 function renderMockMediaSafetyWarning(row, issues, nextIndex) {
 restoreSubmit();
 window.K2PracticeBridge?.hardStopSession?.();
 setStationChrome(false);
 hideStationReflection();
 byId('webcamPanel')?.style.setProperty('display', 'none');
 byId('scenarioCard')?.style.setProperty('display', 'none');
 renderProgress();
 const area = ensureMainArea();
 if (!area) return;
 const videoNumber = mockVideoLocalIndex(row);
 const issueCards = issues.map(issue => `
 <div style="border:1px solid ${issue.type === 'audio' ? '#fecaca' : '#fed7aa'};background:${issue.type === 'audio' ? '#fef2f2' : '#fff7ed'};border-radius:12px;padding:14px 16px;text-align:left;">
 <div style="font-size:0.72rem;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:${issue.type === 'audio' ? '#b91c1c' : '#c2410c'};margin-bottom:6px;">${issue.type === 'audio' ? 'Audio safety check' : 'Premium visual check'}</div>
 <div style="font-size:0.95rem;font-weight:900;color:var(--navy);margin-bottom:6px;">${esc(issue.title)}</div>
 <div style="font-size:0.84rem;color:var(--gray600);line-height:1.55;margin-bottom:10px;">${esc(issue.body)}</div>
 <ul style="margin:0;padding-left:18px;font-size:0.78rem;color:var(--gray600);line-height:1.55;">${issue.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>
 </div>
 `).join('');
 pendingMediaSafety = { nextIndex, completedType: 'video', issueTypes: issues.map(issue => issue.type) };
 area.style.display = 'block';
 area.innerHTML = `
 <div style="background:#fff;border:1px solid #fed7aa;border-radius:16px;padding:32px 30px;">
 <div style="font-size:0.72rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;color:#c2410c;margin-bottom:8px;text-align:center;">Recording safety check</div>
 <h2 style="font-size:1.45rem;color:var(--navy);line-height:1.25;margin:0 0 8px;text-align:center;">Check video ${videoNumber} before continuing.</h2>
 <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;max-width:680px;margin:0 auto 18px;text-align:center;">The station itself has been saved. This warning is here so you do not reach the end of the mock and only then discover that audio or premium visual feedback was limited.</p>
 <div style="display:grid;gap:12px;margin:18px auto;max-width:760px;">${issueCards}</div>
 <div style="display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:18px;">
 <button type="button" onclick="FullCasperMock.continueAfterMediaSafety()" style="padding:11px 22px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.86rem;font-weight:850;cursor:pointer;font-family:inherit;">Continue mock anyway</button>
 <a href="mailto:brittainmbbs@gmail.com?subject=${mockMediaSafetySubject(row)}&body=${mockMediaSafetyBody(row, issues)}" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 18px;border-radius:50px;border:1px solid rgba(14,165,233,0.28);background:#fff;color:var(--teal3);font-size:0.84rem;font-weight:850;text-decoration:none;">Contact Dan first</a>
 </div>
 <div style="font-size:0.74rem;color:var(--gray400);line-height:1.5;margin:12px auto 0;max-width:620px;text-align:center;">If you contact Dan, keep this page open. If you intentionally disabled camera for a premium mock, continuing is fine; the transcript/voice portions can still be used if the microphone recorded clearly.</div>
 </div>
 `;
 }

 function continueAfterMediaSafety() {
 if (!pendingMediaSafety) return;
 pendingMediaSafety.issueTypes.forEach(type => {
 if (type === 'audio') mockSafetyAcknowledged.audio = true;
 if (type === 'visual') mockSafetyAcknowledged.visual = true;
 });
 const nextIndex = pendingMediaSafety.nextIndex;
 const completedType = pendingMediaSafety.completedType;
 pendingMediaSafety = null;
 advancing = true;
 transitionActive = true;
 renderStationTransition(nextIndex, completedType);
 }

 function mockVideoNeedsAutoRepair(row) {
 if (!row || row.type !== 'video' || !row.recordingKey) return false;
 const tier = row.tier || config.tier;
 const visualIssue = tier === 'premium' && (row.visualDegraded || !hasMockVisualMetrics(row));
 return visualIssue || !!row.processingError || !row.feedback || !String(row.transcript || '').trim();
 }

 function applyRepairedMockRow(row, repaired) {
 if (!row || !repaired) return;
 row.feedback = repaired.feedback || row.feedback || null;
 row.transcript = repaired.transcript || row.transcript || '';
 row.transcriptSegments = Array.isArray(repaired.transcript_segments) ? repaired.transcript_segments : row.transcriptSegments || [];
 row.reviewId = repaired.review_id || row.reviewId || null;
 row.recordingKey = repaired.recording_key || row.recordingKey || null;
 row.transcriptionAudioKey = repaired.transcription_audio_key || row.transcriptionAudioKey || null;
 row.voiceMetrics = repaired.voice_metrics || row.voiceMetrics || null;
 row.visualMetrics = repaired.visual_metrics || row.visualMetrics || null;
 row.visualDegraded = !!repaired.visual_degraded;
 row.processingError = repaired.processing_error || null;
 row.rawFeedback = {
 ...(row.rawFeedback || {}),
 feedback: row.feedback,
 transcript: row.transcript,
 transcript_segments: row.transcriptSegments,
 review_id: row.reviewId,
 recording_url: row.recordingKey,
 transcription_audio_key: row.transcriptionAudioKey,
 voice_metrics: row.voiceMetrics,
 visual_metrics: row.visualMetrics,
 visual_degraded: row.visualDegraded,
 processing_error: row.processingError,
 };
 row.feedbackSettled = true;
 row.autoRepairError = null;
 }

 function scheduleMockVideoAutoRepair(row) {
 if (!mockVideoNeedsAutoRepair(row)) return null;
 if (row.autoRepairTask) return row.autoRepairTask;
 if (row.autoRepairAttempted) return null;
 const attemptId = savedAttemptId || mockAttemptId;
 const rowIndex = results.indexOf(row);
 if (!attemptId || rowIndex < 0) return null;
 const tier = row.tier || config.tier;
 const needsVisualRepair = tier === 'premium' && (row.visualDegraded || !hasMockVisualMetrics(row));
 const frames = Array.isArray(row.autoRepairContext?.frames)
 ? row.autoRepairContext.frames.filter(Boolean).slice(0, 48)
 : [];
 if (needsVisualRepair && !frames.length) {
 row.autoRepairAttempted = true;
 row.autoRepairError = 'Premium visual repair could not run because no frame snapshots were retained.';
 return null;
 }
 row.autoRepairAttempted = true;
 const task = (async () => {
 const auth = getAuth();
 const token = auth?.getToken?.();
 if (!token) throw new Error('Sign in required for background mock repair.');
 const fd = new FormData();
 fd.append('row_index', String(rowIndex));
 if (needsVisualRepair) {
 fd.append('repair_visual', '1');
 fd.append('visual_only', '1');
 fd.append('visual_frame_source', 'answer_windows');
 frames.forEach((frame, i) => fd.append(`frame_${i}`, frame, `repair-frame-${String(i + 1).padStart(2, '0')}.jpg`));
 }
 const res = await fetch(`${apiBase()}/api/casper-mock/attempt/${encodeURIComponent(attemptId)}/repair-video`, {
 method: 'POST',
 headers: { 'Authorization': `Bearer ${token}` },
 body: fd,
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(data.message || data.error || 'Background mock repair failed.');
 if (data.row) applyRepairedMockRow(row, data.row);
 saveMockDraft({ phase: 'auto_repair_saved', auto_repaired_at: new Date().toISOString() });
 return data;
 })()
 .catch(err => {
 row.autoRepairError = err.message || 'Background mock repair failed.';
 saveMockDraft({ phase: 'auto_repair_failed', auto_repair_error: row.autoRepairError });
 throw err;
 });
 row.autoRepairTask = task;
 return task;
 }

 function startPendingAutoRepairs() {
 results.forEach(row => {
 const task = scheduleMockVideoAutoRepair(row);
 if (task) task.catch(() => {});
 });
 }

 async function settleMockAutoRepairTasks() {
 startPendingAutoRepairs();
 const tasks = results
 .map(row => row.autoRepairTask)
 .filter(Boolean);
 if (!tasks.length) return;
 await Promise.allSettled(tasks.map(task => Promise.race([
 task,
 new Promise((_, reject) => setTimeout(() => reject(new Error('Background repair timed out.')), 4 * 60 * 1000)),
 ])));
 }

 function markPendingAnalysesDeferred(message) {
 const reason = message || 'Analysis is still running. This report is shown with completed analyses so far; Dan can repair unfinished stations from admin.';
 results.forEach(row => {
 if (row?.feedbackTask && !row.feedbackSettled) {
 applyMockFeedbackError(row, new Error(reason));
 }
 if (row?.autoRepairTask && mockVideoNeedsAutoRepair(row) && !row.autoRepairError) {
 row.autoRepairError = reason;
 }
 });
 saveMockDraft({ phase: 'analysis_deferred', analysis_deferred_at: new Date().toISOString() });
 }

 async function settleFinalAnalysisTasks({ skipWait = false } = {}) {
 if (skipWait) {
 markPendingAnalysesDeferred('The report was opened before every analysis task finished. This station is saved; Dan can repair it from admin if needed.');
 return;
 }
 let timedOut = false;
 const settling = (async () => {
 await settleMockFeedbackTasks();
 await settleMockAutoRepairTasks();
 })();
 await Promise.race([
 settling,
 new Promise(resolve => {
 setTimeout(() => {
 timedOut = true;
 markPendingAnalysesDeferred('Analysis took longer than expected. This report is shown with the completed analyses so far; Dan can repair any unfinished station from admin.');
 resolve();
 }, FINAL_REPORT_MAX_WAIT_MS);
 }),
 ]);
 if (timedOut) return;
 await settling;
 }

 function showPartialReportNow() {
 renderDebrief({ skipAnalysisWait: true }).catch(err => {
 console.error('Partial mock report failed', err);
 renderDebriefError(err);
 });
 }

 function prepareMockFeedbackTask(row) {
 if (!row?.feedbackTask) return Promise.resolve(null);
 if (row.feedbackTaskPrepared) return row.feedbackTask;
 row.feedbackTaskPrepared = true;
 const task = Promise.resolve(row.feedbackTask)
 .then(data => {
 applyMockFeedbackData(row, data);
 saveMockDraft({ phase: 'analysis_saved' });
 return data;
 })
 .catch(err => {
 applyMockFeedbackError(row, err);
 saveMockDraft({ phase: 'analysis_failed' });
 throw err;
 });
 row.feedbackTask = task;
 return task;
 }

 function serialiseAttemptRows(rows = buildRows()) {
 return rows.map(row => ({
 type: row.type,
 order: row.order,
 localIndex: row.localIndex,
 station: row.station,
 answer: row.answer || '',
 score: row.score10,
 feedback: row.feedback || null,
 transcript: row.transcript || '',
 transcript_segments: row.transcriptSegments || row.transcript_segments || row.rawFeedback?.transcript_segments || [],
 review_id: row.reviewId || row.rawFeedback?.review_id || null,
 recording_key: row.recordingKey || row.rawFeedback?.recording_key || row.rawFeedback?.recording_url || null,
 transcription_audio_key: row.transcriptionAudioKey || row.rawFeedback?.transcription_audio_key || null,
 voice_metrics: row.voiceMetrics || row.rawFeedback?.voice_metrics || null,
 visual_metrics: row.visualMetrics || row.rawFeedback?.visual_metrics || null,
 visual_degraded: !!(row.visualDegraded || row.rawFeedback?.visual_degraded),
 media_diagnostics: row.mediaDiagnostics || row.media_diagnostics || null,
 duration_sec: row.durationSec || row.duration_sec || row.rawFeedback?.durationSec || (row.localRescuePending ? 1 : null),
 tier: row.tier || (row.type === 'video' ? config.tier : 'typed'),
 access_timing: row.accessTiming || row.access_timing || row.timing?.access_timing || (row.type === 'typed' ? accessTimingPayload() : null),
 planned_writing_sec: row.plannedWritingSec || row.planned_writing_sec || row.timing?.planned_writing_sec || (row.type === 'typed' ? typedWritingSeconds() : null),
 processing_error: row.processingError || null,
 auto_repair_error: row.autoRepairError || null,
 auto_repair_attempted: !!row.autoRepairAttempted,
 local_rescue_pending: !!row.localRescuePending,
 timing: row.timing || null,
 typing: row.typing || row.timing?.typing || null,
 monitoring: row.monitoring || null,
 }));
 }

 async function saveMockAttempt(rows = buildRows(), report = latestReport, status = report ? 'completed' : 'in_progress') {
 const auth = getAuth();
 const token = auth?.getToken?.();
 if (!token || !mockAttemptId) throw new Error('Sign in required to save this mock attempt.');
 const finalStatus = status === 'in_progress' ? 'in_progress' : 'completed';
 const res = await fetch(`${apiBase()}/api/casper-mock/attempts`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
 body: JSON.stringify({
 attempt_id: mockAttemptId,
 tier: config.tier,
 access_timing: accessTimingPayload(),
 status: finalStatus,
 completed_at: finalStatus === 'completed' ? new Date().toISOString() : null,
 rows: serialiseAttemptRows(rows),
 report,
 telemetry: mockTelemetry ? compactTelemetryForSend() : null,
 }),
 });
 const data = await res.json().catch(() => ({}));
 lastMockSaveResponse = data || null;
 if (!res.ok) throw new Error(data.message || data.error || 'Could not save mock attempt.');
 savedAttemptId = data.attempt_id || mockAttemptId;
 return savedAttemptId;
 }

 async function requestManualReview() {
 const status = byId('mockManualReviewStatus');
 const btn = byId('mockManualReviewBtn');
 try {
 if (btn) { btn.disabled = true; btn.textContent = 'Saving mock...'; }
 if (status) status.textContent = 'Saving your full mock securely...';
 const rows = buildRows();
 const attemptId = savedAttemptId || await saveMockAttempt(rows, latestReport);
 const auth = getAuth();
 const token = auth?.getToken?.();
 if (!token) throw new Error('Please sign in before requesting manual review.');
 if (btn) btn.textContent = 'Opening Stripe...';
 if (status) status.textContent = 'Opening secure Stripe checkout for $300 AUD...';
 const successUrl = `${window.location.origin}${window.location.pathname}?tab=mock&manual_review=success&attempt_id=${encodeURIComponent(attemptId)}`;
 const cancelUrl = `${window.location.origin}${window.location.pathname}?tab=mock&manual_review=cancelled&attempt_id=${encodeURIComponent(attemptId)}`;
 const res = await fetch(`${apiBase()}/api/casper-mock/manual-review/checkout`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
 body: JSON.stringify({ attempt_id: attemptId, success_url: successUrl, cancel_url: cancelUrl }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.checkout_url) throw new Error(data.message || data.error || 'Could not start manual review checkout.');
 window.location.href = data.checkout_url;
 } catch (err) {
 if (btn) { btn.disabled = false; btn.textContent = "Request Dan's manual review - $300 AUD"; }
 if (status) status.textContent = err.message || 'Could not start manual review checkout.';
 }
 }

 function ruleCard(title, body) {
 return `
 <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:14px 15px;">
 <div style="font-size:0.72rem;font-weight:900;color:var(--navy);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">${esc(title)}</div>
 <div style="font-size:0.78rem;color:var(--gray500);line-height:1.5;">${esc(body)}</div>
 </div>
 `;
 }

 function proceedAfterRules() {
 rulesAccepted = true;
 persistAccessTiming();
 beginMockExam().catch(err => {
 setCheckoutState(false, err.message || 'Could not start the mock.');
 alert(err.message || 'Could not start the mock.');
 });
 }

 function renderStationLoading() {
 setStationChrome(false);
 byId('scenarioCard')?.style.setProperty('display', 'none');
 const area = ensureMainArea();
 if (!area) return;
 area.style.display = 'block';
 area.innerHTML = `
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:34px 32px;text-align:center;">
 <div style="width:30px;height:30px;border:3px solid var(--gray200);border-top-color:var(--teal);border-radius:50%;animation:mmi-spin 0.8s linear infinite;margin:0 auto 14px;"></div>
 <div style="font-size:0.72rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Private station bank</div>
 <h2 style="font-size:1.35rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">Loading the next station.</h2>
 <p style="font-size:0.86rem;color:var(--gray500);line-height:1.6;margin:0;">Only this station is being sent to your browser.</p>
 </div>
 `;
 }

 function renderStationLoadError(message) {
 setStationChrome(false);
 byId('scenarioCard')?.style.setProperty('display', 'none');
 const area = ensureMainArea();
 if (!area) return;
 area.style.display = 'block';
 area.innerHTML = `
 <div style="background:#fff;border:1px solid rgba(220,38,38,0.22);border-radius:16px;padding:34px 32px;text-align:center;">
 <div style="font-size:0.72rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:#dc2626;margin-bottom:8px;">Station unavailable</div>
 <h2 style="font-size:1.35rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">Could not load this station.</h2>
 <p style="font-size:0.86rem;color:var(--gray600);line-height:1.6;margin:0 auto 18px;max-width:560px;">${esc(message || 'Please refresh and try again. Your mock pass remains on your account.')}</p>
 <button type="button" onclick="FullCasperMock.activateMockMode()" style="padding:11px 20px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.86rem;font-weight:800;cursor:pointer;font-family:inherit;">Back to mock start</button>
 </div>
 `;
 }

 async function launchCurrent() {
 const item = sequence[index];
 if (!item) {
 renderDebrief().catch(err => {
 console.error('Mock debrief failed:', err);
 renderDebriefError(err);
 });
 return;
 }

 if (!item.station) {
 renderStationLoading();
 try {
 await loadPrivateMockStation(item);
 } catch (err) {
 renderStationLoadError(err.message);
 return;
 }
 byId('casperMockMainArea')?.style.setProperty('display', 'none');
 }

 syncActiveMockContext(item);
 stationToken += 1;
 advancing = false;
 transitionActive = false;
 clearDoneMonitor();
 clearTransitionTimer();
 clearInterval(breakTimer);
 hideNormalPanels();
 setStationChrome(true);
 byId('casperMockConfigPanel')?.style.setProperty('display', 'block');
 byId('scenarioCard')?.style.setProperty('display', '');
 renderProgress();
 startStationTelemetry(item, 'station_loaded');
 sendMockTelemetry('station_loaded').catch(() => {});

 const bridge = window.K2PracticeBridge;
 if (!bridge) return;

 if (item.type === 'video') {
 if (!window.webcamReady) {
 markStationTelemetryEvent('camera_gate_shown');
 renderCameraGate();
 return;
 }
 beginVideoStation(item, bridge);
 } else {
 restoreSubmit();
 bridge.setupSingleStation(item.station, 'casper', {
 timerMode: 'standard',
 readingTime: CASPER_REFLECTION_SECONDS,
 writingTime: typedWritingSeconds(),
 });
 if (pendingDraftAnswer && Number(pendingDraftAnswer.index) === index) {
 const answer = String(pendingDraftAnswer.answer || '');
 setTimeout(() => {
 const textarea = byId('answerTextarea');
 const current = bridge.getCurrentHistory?.();
 if (textarea && answer && !textarea.value) {
 textarea.value = answer;
 textarea.dispatchEvent(new Event('input', { bubbles: true }));
 }
 if (current && answer && !current.answer) current.answer = answer;
 bridge.saveAnswer?.();
 pendingDraftAnswer = null;
 bindTypedTelemetry(answer);
 saveMockDraft({ phase: 'restored_current_answer' });
 }, 120);
 }
 keepMockModeChrome();
 hideStationReflection();
 bindTypedTelemetry('');
 }
 hideNormalPanelsExceptStation();
 renderProgress();
 startDoneMonitor(stationToken);
 }

 function renderCameraGate() {
 restoreSubmit();
 setStationChrome(false);
 byId('scenarioCard')?.style.setProperty('display', 'none');
 byId('webcamPanel')?.style.setProperty('display', 'none');
 const area = ensureMainArea();
 if (!area) return;
 area.style.display = 'block';
 const label = `Video station ${Math.min(index + 1, VIDEO_COUNT)} of ${VIDEO_COUNT}`;
 area.innerHTML = `
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:34px 32px;text-align:center;">
 <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:10px;">Camera check</div>
 <h2 style="font-size:1.55rem;line-height:1.25;color:var(--navy);margin:0 0 10px;">Ready for ${esc(label)}?</h2>
 <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;max-width:620px;margin:0 auto 22px;">The video timer will not start until your camera and microphone are available. Allow browser access, then begin the station.</p>
 <div style="max-width:520px;margin:0 auto 18px;background:rgba(14,165,233,0.07);border:1px solid rgba(14,165,233,0.2);border-radius:12px;padding:11px 13px;font-size:0.78rem;color:var(--gray600);line-height:1.5;"><strong style="color:var(--navy);">Typed timing locked in:</strong> ${esc(accessTimingOption().shortLabel)} (${formatSeconds(typedWritingSeconds())} writing time per typed station).</div>
 <button type="button" id="mockCameraStartBtn" onclick="FullCasperMock.enableCameraAndStartVideoStation()" style="padding:13px 26px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.9rem;font-weight:850;cursor:pointer;font-family:inherit;">Enable camera & start station</button>
 <div id="mockCameraGateStatus" style="display:none;margin-top:12px;font-size:0.78rem;color:var(--gray500);line-height:1.55;"></div>
 </div>
 `;
 renderProgress();
 }

 async function enableCameraAndStartVideoStation() {
 const status = byId('mockCameraGateStatus');
 const btn = byId('mockCameraStartBtn');
 if (btn) {
 btn.disabled = true;
 btn.style.opacity = '0.72';
 btn.textContent = 'Checking camera...';
 }
 if (status) {
 status.style.display = 'block';
 status.textContent = 'If your browser asks, choose Allow for camera and microphone.';
 }
 const ok = typeof window.initWebcam === 'function' ? await window.initWebcam() : !!window.webcamReady;
 if (ok || window.webcamReady) {
 byId('casperMockMainArea')?.style.setProperty('display', 'none');
 launchCurrent();
 return;
 }
 if (status) {
 status.style.color = '#dc2626';
 status.textContent = 'Camera access was not available. Check browser permissions, then try again.';
 }
 if (btn) {
 btn.disabled = false;
 btn.style.opacity = '1';
 btn.textContent = 'Try camera again';
 }
 }

 function beginVideoStation(item, bridge) {
 markStationTelemetryEvent('video_station_started');
 patchSubmitForVideo();
 bridge.setupSingleStation(item.station, 'mmi', {
 preset: VIDEO_PRESET,
 premium: config.tier === 'premium',
 specialist: false,
 });
 keepMockModeChrome();
 const webcam = byId('webcamPanel');
 if (webcam) {
 webcam.classList.add('show');
 webcam.style.display = '';
 }
 const instruction = byId('speakingInstruction');
 if (instruction) {
 instruction.innerHTML = '<strong>CASPer video response</strong> - read the station, use the 30-second reflection period, then read each question for 10 seconds and answer aloud for 60 seconds.';
 }
 }

 function hideNormalPanelsExceptStation() {
 ['categoryCard','casperCategoryCard','mmiCategoryCard','mmiOptionsCard','startBtn','bottomRail'].forEach(id => {
 const el = byId(id);
 if (el) el.style.display = 'none';
 });
 }

 function renderProgress() {
 const main = document.querySelector('.main-content');
 const scenario = byId('scenarioCard');
 if (!main || !scenario) return;

 let progress = byId('casperMockProgress');
 if (!progress) {
 progress = document.createElement('div');
 progress.id = 'casperMockProgress';
 main.insertBefore(progress, scenario);
 }

 const item = sequence[index] || {};
 const sectionLabel = item.type === 'video' ? 'Video section' : 'Typed section';
 const timingLine = item.type === 'typed'
 ? `${accessTimingOption().shortLabel}: ${formatSeconds(typedWritingSeconds())} writing time`
 : `Typed timing: ${accessTimingOption().shortLabel}`;
 const completed = index;
 const dots = sequence.map((entry, i) => {
 const colour = i < index ? 'var(--green)' : i === index ? 'var(--navy)' : 'var(--gray200)';
 const textColour = i <= index ? '#fff' : 'var(--gray400)';
 return `<span title="${entry.type === 'video' ? 'Video' : 'Typed'} station ${i + 1}" style="width:24px;height:24px;border-radius:50%;background:${colour};color:${textColour};display:flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:800;">${i + 1}</span>`;
 }).join('');

 progress.innerHTML = `
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:16px 20px;">
 <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
 <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--teal3);">${sectionLabel}</div>
 <div style="font-size:0.82rem;font-weight:700;color:var(--navy);">Station ${index + 1} of ${sequence.length}</div>
 <div style="font-size:0.72rem;font-weight:800;color:${item.type === 'typed' ? 'var(--teal3)' : 'var(--gray400)'};background:${item.type === 'typed' ? 'rgba(14,165,233,0.08)' : 'var(--gray50)'};border:1px solid ${item.type === 'typed' ? 'rgba(14,165,233,0.2)' : 'var(--gray200)'};border-radius:999px;padding:4px 8px;">${esc(timingLine)}</div>
 <div style="margin-left:auto;font-size:0.76rem;color:var(--gray400);">${completed} complete</div>
 </div>
 <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${dots}</div>
 </div>
 `;
 }

 function startDoneMonitor(token) {
 clearDoneMonitor();
 doneMonitorTimer = setInterval(() => {
 if (!active || !started || token !== stationToken || transitionActive) return;
 hideStationReflection();
 const bridge = window.K2PracticeBridge;
 if (!bridge || bridge.getPhase?.() !== 'done') return;
 beginStationTransition(token);
 }, 500);
 }

 function patchSubmitForVideo() {
 if (originalSubmitMMI || typeof window.submitMMIForFeedback !== 'function') return;
 originalSubmitMMI = window.submitMMIForFeedback;
 window.submitMMIForFeedback = async function patchedMockSubmit() {
 const wrap = byId('aiFeedbackWrapMMI');
 if (wrap) {
 wrap.innerHTML = `<div style="background:#eff6ff;border:1px solid rgba(14,165,233,0.28);border-radius:10px;padding:13px 15px;font-size:0.82rem;color:#075985;margin-top:10px;"><strong>Mock mode saves feedback for the end.</strong><br>Finish the station and continue. Your AI analysis runs in the background.</div>`;
 }
 };
 }

 function restoreSubmit() {
 if (originalSubmitMMI) {
 window.submitMMIForFeedback = originalSubmitMMI;
 originalSubmitMMI = null;
 }
 }

 function handleNextClick() {
 const bridge = window.K2PracticeBridge;
 if (!bridge) return true;
 const item = sequence[index];
 const phase = bridge.getPhase();

 if (item?.type === 'video') {
 if (phase === 'reading') {
 markStationTelemetryEvent('video_prompt_reading_started');
 bridge.clearTimer();
 bridge.startWriting();
 return true;
 }
 if (phase === 'writing') {
 markStationTelemetryEvent('video_answer_finished_by_button');
 bridge.clearTimer();
 bridge.stopRecording();
 bridge.setPhase('done');
 byId('mmiSubmitWrap')?.style.setProperty('display', 'none');
 const wrap = byId('aiFeedbackWrapMMI');
 if (wrap) {
 wrap.innerHTML = `<div style="background:#eff6ff;border:1px solid rgba(14,165,233,0.28);border-radius:10px;padding:13px 15px;font-size:0.82rem;color:#075985;margin-top:10px;"><strong>Recording saved for the final report.</strong><br>Continue when you are ready. Your AI feedback will be shown after the full mock.</div>`;
 }
 beginStationTransition(stationToken);
 return true;
 }
 if (phase === 'done') {
 beginStationTransition(stationToken);
 }
 return true;
 }

 if (phase === 'reading') {
 markStationTelemetryEvent('typed_writing_started');
 bridge.clearTimer();
 bridge.startWriting();
 bindTypedTelemetry(byId('answerTextarea')?.value || '');
 return true;
 }
 if (phase === 'writing') {
 markStationTelemetryEvent('typed_answer_finished_by_button');
 bridge.clearTimer();
 bridge.saveAnswer();
 bridge.setPhase('done');
 byId('btnGetAIWrap')?.style.setProperty('display', 'none');
 hideStationReflection();
 beginStationTransition(stationToken);
 return true;
 }
 if (phase === 'done') {
 beginStationTransition(stationToken);
 }
 return true;
 }

 function downloadRecordingUrl(url, label = 'recording') {
 if (!url) return;
 const a = document.createElement('a');
 a.href = url;
 a.download = `key2md-casper-mock-${String(label || 'recording').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'recording'}.webm`;
 document.body.appendChild(a);
 a.click();
 a.remove();
 }

 function downloadRescueRecording() {
 downloadRecordingUrl(lastRescueRecording?.url, lastRescueRecording?.label || 'sos-recording');
 }

 function renderStationSaving(type = 'video') {
 restoreSubmit();
 setStationChrome(false);
 hideStationReflection();
 byId('webcamPanel')?.style.setProperty('display', 'none');
 byId('scenarioCard')?.style.setProperty('display', 'none');
 const area = ensureMainArea();
 if (!area) return;
 area.style.display = 'block';
 area.innerHTML = `
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:36px 32px;text-align:center;">
 <div style="font-size:0.72rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Saving station</div>
 <h2 style="font-size:1.45rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">Keeping this station locked in.</h2>
 <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;max-width:560px;margin:0 auto 18px;">${type === 'video' ? 'Uploading the recording and preparing the transcript before the next prompt opens.' : 'Saving the written response and preparing feedback before the next prompt opens.'}</p>
 <div style="width:42px;height:42px;border-radius:50%;border:4px solid rgba(14,165,233,0.18);border-top-color:var(--teal3);margin:0 auto;animation:spin 0.9s linear infinite;"></div>
 </div>
 `;
 }

 function renderStationSaveError(row, err, mode = 'save_failed') {
 restoreSubmit();
 window.K2PracticeBridge?.hardStopSession?.();
 setStationChrome(false);
 hideStationReflection();
 byId('webcamPanel')?.style.setProperty('display', 'none');
 byId('scenarioCard')?.style.setProperty('display', 'none');
 const area = ensureMainArea();
 if (!area) return;
 const stationLabel = `${row?.type === 'video' ? 'Video' : 'Typed'} station ${row?.order || index + 1}`;
 const canDownload = !!row?.recordingUrl;
 if (canDownload) {
 lastRescueRecording = {
 url: row.recordingUrl,
 label: `station-${row?.order || index + 1}-sos`,
 };
 }
 area.style.display = 'block';
 area.innerHTML = `
 <div style="background:#fff;border:1px solid #fecaca;border-radius:16px;padding:34px 32px;text-align:center;">
 <div style="font-size:0.72rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;color:#b91c1c;margin-bottom:8px;">SOS save path</div>
 <h2 style="font-size:1.45rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">${esc(stationLabel)} needs help saving.</h2>
 <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;max-width:620px;margin:0 auto 18px;">${esc(err?.message || 'The station did not save cleanly.')} ${mode === 'local_rescue' ? 'Save the recording locally, then ping SOS to Dan. Dan can upload it from admin and restart processing for this exact mock station.' : 'Your browser draft is still here; ping SOS to Dan if this keeps happening.'}</p>
 <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;color:#7c2d12;font-size:0.82rem;line-height:1.55;max-width:620px;margin:0 auto 18px;text-align:left;">
 <strong>Ping SOS to Dan.</strong> If he is around, an on-the-spot fix may be possible. The safest rescue is to keep this page open and save the local recording file now.
 </div>
 <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
 ${canDownload ? `<button type="button" onclick="FullCasperMock.downloadRescueRecording()" style="padding:11px 20px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.86rem;font-weight:850;cursor:pointer;font-family:inherit;">Save local recording</button>` : ''}
 <button type="button" onclick="FullCasperMock.checkpointMockAttempt('retry_save')" style="padding:11px 20px;border-radius:50px;border:1px solid rgba(14,165,233,0.28);background:#fff;color:var(--teal3);font-size:0.86rem;font-weight:850;cursor:pointer;font-family:inherit;">Try saving again</button>
 </div>
 </div>
 `;
 }

 async function beginStationTransition(token = stationToken) {
 if (token !== stationToken || transitionActive || advancing) return;
 const bridge = window.K2PracticeBridge;
 const item = sequence[index];
 if (!bridge || !item) return;
 transitionActive = true;
 clearDoneMonitor();
 bridge.clearTimer?.();
 hideStationReflection();
 try {
 let submission = null;
 if (item.type === 'video') {
 bridge.stopRecording?.();
 if (typeof bridge.waitForRecordingReady === 'function') {
 await bridge.waitForRecordingReady({ requireVideo: true });
 } else {
 await sleep(650);
 }
 submission = bridge.submitMockVideoReview?.() || null;
 } else {
 bridge.saveAnswer?.();
 submission = bridge.submitMockWrittenReview?.() || bridge.getCurrentHistory?.();
 }
 await completeAndAdvance(submission, token);
 } catch (err) {
 transitionActive = false;
 const wrap = item.type === 'video' ? byId('aiFeedbackWrapMMI') : byId('aiFeedbackWrap');
 if (wrap) {
 wrap.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:13px 15px;font-size:0.82rem;color:#991b1b;margin-top:10px;"><strong>Station could not be saved.</strong><br>${esc(err.message || 'Please try again before continuing.')}</div>`;
 wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
 }
 }
 }

 function mockVideoRecordingSafe(row) {
 if (!row) return false;
 // Safe to advance if the server stored the recording (recordingKey) OR the review actually
 // succeeded (feedback / transcript means the upload reached the server and was processed) OR it
 // saved as an audio fallback. Only a total failure (no key, no feedback, no transcript) drops to
 // the SOS rescue, so a genuinely lost recording is still caught.
 return !!(row.recordingKey || row.feedback || (row.transcript && String(row.transcript).trim()) || row.audioFallback);
 }

 async function completeAndAdvance(payload, token = stationToken) {
 if (token !== stationToken || advancing) return;
 advancing = true;
 stationToken += 1;
 clearDoneMonitor();
 const bridge = window.K2PracticeBridge;
 const item = sequence[index];
 if (!item) {
 advancing = false;
 return;
 }
 const current = bridge?.getCurrentHistory?.();
 const isVideoSubmission = payload?.kind === 'mock_video_submission';
 const isWrittenSubmission = payload?.kind === 'mock_written_submission';
 const submittedRow = {
 type: item.type,
 station: item.station,
 answer: isWrittenSubmission ? payload.answer || '' : current?.answer || '',
 score: isWrittenSubmission ? null : current?.score ?? null,
 feedback: null,
 feedbackTask: isVideoSubmission || isWrittenSubmission ? payload.promise : null,
 recordingUrl: isVideoSubmission ? payload.recordingUrl : null,
 durationSec: isVideoSubmission ? payload.durationSec : null,
 mediaDiagnostics: isVideoSubmission ? payload.mediaDiagnostics || null : null,
 processingError: null,
 autoRepairTask: null,
 autoRepairAttempted: false,
 autoRepairError: null,
 autoRepairContext: isVideoSubmission ? payload.autoRepairContext || null : null,
 localRescuePending: false,
 tier: item.type === 'video' ? config.tier : 'typed',
 accessTiming: accessTimingPayload(),
 plannedWritingSec: item.type === 'typed' ? typedWritingSeconds() : null,
 };
 const stationTiming = finishStationTelemetry({
 submitted_at: isoNow(),
 submission_kind: payload?.kind || null,
 recording_duration_sec: isVideoSubmission ? payload.durationSec || null : null,
 access_timing: accessTimingPayload(),
 planned_writing_sec: item.type === 'typed' ? typedWritingSeconds() : null,
 planned_reflection_sec: item.type === 'typed' ? CASPER_REFLECTION_SECONDS : null,
 });
 submittedRow.timing = stationTiming;
 submittedRow.typing = stationTiming?.typing || null;
 results.push(submittedRow);
 if (submittedRow.feedbackTask) {
 const feedbackTask = prepareMockFeedbackTask(submittedRow);
 if (submittedRow.type === 'typed') {
 const isFinalStation = index >= sequence.length - 1;
 if (isFinalStation) {
 renderStationSaving(item.type);
 try {
 await withAnalysisTimeout(feedbackTask, submittedRow);
 } catch (err) {
 applyMockFeedbackError(submittedRow, err);
 }
 } else {
 feedbackTask.catch(() => {});
 }
 } else {
 renderStationSaving(item.type);
 try {
 await feedbackTask;
 if (!mockVideoRecordingSafe(submittedRow)) {
 submittedRow.localRescuePending = true;
 submittedRow.processingError = `${submittedRow.processingError || 'Video upload did not return a saved recording key.'} Ping SOS to Dan.`;
 saveMockDraft({ phase: 'analysis_missing_recording' });
 await checkpointMockAttempt('local_rescue_pending').catch(() => {});
 advancing = false;
 transitionActive = false;
 renderStationSaveError(submittedRow, new Error(submittedRow.processingError), 'local_rescue');
 return;
 }
 } catch (err) {
 if (submittedRow.type === 'video' && !mockVideoRecordingSafe(submittedRow)) {
 submittedRow.localRescuePending = true;
 submittedRow.processingError = `${submittedRow.processingError || 'Video upload did not complete.'} Ping SOS to Dan.`;
 saveMockDraft({ phase: 'analysis_failed' });
 await checkpointMockAttempt('local_rescue_pending').catch(() => {});
 advancing = false;
 transitionActive = false;
 renderStationSaveError(submittedRow, err, 'local_rescue');
 return;
 }
 }
 }
 }
 bridge?.completeCurrentStation?.();
 saveMockDraft({ phase: 'station_saved' });
 try {
 await checkpointMockAttempt('station_saved', { throwOnError: true });
 } catch (err) {
 advancing = false;
 transitionActive = false;
 renderStationSaveError(submittedRow, err, 'save_failed');
 return;
 }

 // Block advancing past a video station whose recording did not save (belt-and-suspenders over
 // the upload-failure handling above): a student must never move on with a lost station.
 if (submittedRow.type === 'video' && !mockVideoRecordingSafe(submittedRow)) {
 advancing = false;
 transitionActive = false;
 renderStationSaveError(submittedRow, new Error('This video station has not saved yet, so it cannot be skipped. Refresh to re-record it; on a weak connection it will now save as audio automatically.'), 'local_rescue');
 return;
 }

 const nextIndex = index + 1;
 if (submittedRow.type === 'video') {
 const safetyIssues = mockMediaSafetyIssues(submittedRow);
 if (safetyIssues.length) {
 advancing = false;
 transitionActive = false;
 renderMockMediaSafetyWarning(submittedRow, safetyIssues, nextIndex);
 return;
 }
 }
 renderStationTransition(nextIndex, item.type);
 }

 function advanceAfterTransition(nextIndex) {
 clearTransitionTimer();
 if (nextIndex === VIDEO_COUNT) {
 advancing = false;
 renderBreak(VIDEO_BREAK_SECONDS, 'Video section complete', 'Take the optional 10-minute break before the typed section, just like the real test.');
 return;
 }
 if (nextIndex === VIDEO_COUNT + 4) {
 advancing = false;
 renderBreak(TYPED_BREAK_SECONDS, 'Typed station 4 complete', 'Take the optional 5-minute break before the final typed stations.');
 return;
 }

 index = nextIndex;
 advancing = false;
 launchCurrent();
 }

 function continueAfterStation() {
 if (transitionNextIndex == null) return;
 advanceAfterTransition(transitionNextIndex);
 }

 function renderStationTransition(nextIndex, completedType) {
 restoreSubmit();
 window.K2PracticeBridge?.hardStopSession?.();
 setStationChrome(false);
 hideStationReflection();
 byId('webcamPanel')?.style.setProperty('display', 'none');
 byId('scenarioCard')?.style.setProperty('display', 'none');
 renderProgress();
 const area = ensureMainArea();
 if (!area) {
 advanceAfterTransition(nextIndex);
 return;
 }
 area.style.display = 'block';
 let left = STATION_TRANSITION_SECONDS;
 transitionNextIndex = nextIndex;
 const nextItem = sequence[nextIndex];
 const nextLabel = nextItem
 ? `${nextItem.type === 'video' ? 'video' : 'typed'} station ${nextIndex + 1}`
 : 'your final report';
 const sectionCopy = completedType === 'video'
 ? 'Your recording has been saved and queued for background analysis.'
 : 'Your typed response has been saved and queued for background analysis.';
 const render = () => {
 area.innerHTML = `
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:36px 32px;text-align:center;">
 <div style="font-size:0.72rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Station saved</div>
 <h2 style="font-size:1.45rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">Next: ${esc(nextLabel)}</h2>
 <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;max-width:560px;margin:0 auto 18px;">${esc(sectionCopy)} The exam will continue automatically.</p>
 <div id="mockTransitionCountdown" style="font-size:3.2rem;font-weight:900;color:var(--navy);font-variant-numeric:tabular-nums;margin-bottom:18px;">${left}</div>
 <button type="button" onclick="FullCasperMock.continueAfterStation()" style="padding:11px 24px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.86rem;font-weight:800;cursor:pointer;font-family:inherit;">Continue now</button>
 </div>
 `;
 };
 render();
 clearInterval(transitionTimer);
 transitionTimer = setInterval(() => {
 left -= 1;
 const el = byId('mockTransitionCountdown');
 if (el) el.textContent = String(Math.max(0, left));
 if (left <= 0) advanceAfterTransition(nextIndex);
 }, 1000);
 }

 function renderBreak(seconds, title, copy) {
 restoreSubmit();
 window.K2PracticeBridge?.hardStopSession?.();
 setStationChrome(false);
 byId('webcamPanel')?.style.setProperty('display', 'none');
 byId('scenarioCard')?.style.setProperty('display', 'none');
 const area = ensureMainArea();
 if (!area) return;
 area.style.display = 'block';
 breakLeft = seconds;
 startBreakTelemetry(seconds, title);
 area.innerHTML = `
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:38px 32px;text-align:center;">
 <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Optional break</div>
 <h2 style="font-size:1.45rem;color:var(--navy);margin:0 0 8px;">${esc(title)}</h2>
 <p style="font-size:0.9rem;color:var(--gray600);line-height:1.6;max-width:520px;margin:0 auto 22px;">${esc(copy)}</p>
 <div id="mockBreakTimer" style="font-size:3.2rem;font-weight:900;color:var(--navy);font-variant-numeric:tabular-nums;margin-bottom:18px;">${formatTime(breakLeft)}</div>
 <button onclick="FullCasperMock.skipBreak('manual_continue')" style="padding:11px 24px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.86rem;font-weight:800;cursor:pointer;font-family:inherit;">Continue now</button>
 </div>
 `;
 breakTimer = setInterval(() => {
 breakLeft--;
 const el = byId('mockBreakTimer');
 if (el) el.textContent = formatTime(Math.max(0, breakLeft));
 if (breakLeft <= 0) skipBreak('timer_finished');
 }, 1000);
 }

 function skipBreak(reason = 'continued') {
 clearInterval(breakTimer);
 finishBreakTelemetry(reason);
 advancing = false;
 byId('casperMockMainArea')?.style.setProperty('display', 'none');
 if (index + 1 === VIDEO_COUNT || index + 1 === VIDEO_COUNT + 4) index++;
 launchCurrent();
 }

 function formatTime(seconds) {
 const mins = Math.floor(seconds / 60);
 const secs = seconds % 60;
 return `${mins}:${String(secs).padStart(2, '0')}`;
 }

function videoScore(feedback) {
 return scoreValue(feedback?.overall?.score);
}

 const CRITERION_DEFS = [
 { key: 'empathy', label: 'Empathy', typed: ['Empathy'], video: ['empathy'] },
 { key: 'reasoning', label: 'Reasoning', typed: ['Problem Solving', 'Ethics', 'Fairness'], video: ['reasoning'] },
 { key: 'reflection', label: 'Reflection', typed: ['Self-Awareness', 'Resilience'], video: ['reflection'] },
 { key: 'communication', label: 'Communication', typed: ['Communication', 'Collaboration'], video: ['communication'] },
 { key: 'real_world', label: 'Real-world judgement', typed: ['Fairness', 'Ethics', 'Problem Solving'], video: ['real_world_awareness'] },
 ];

 const COMP_NAME_MAP = {
 collaboration: 'Collaboration',
 communication: 'Communication',
 empathy: 'Empathy',
 fairness: 'Fairness',
 ethics: 'Ethics',
 motivation: 'Motivation',
 problemsolving: 'Problem Solving',
 resilience: 'Resilience',
 selfawareness: 'Self-Awareness',
 };

 const PATTERN_DEFS = [
 {
 key: 'specific_empathy',
 label: 'Empathy is present but not yet specific enough',
 action: 'Name the person\'s likely feeling in this exact scenario, then show how that emotion changes your next step.',
 regex: /\b(empath|feeling|emotion|heard|validated|reassur|support|perspective|distress|concern|upset)\b/i,
 priority: 4,
 },
 {
 key: 'reflection_without_consequence',
 label: 'Reflection needs clearer consequence',
 action: 'Add one sentence that explains what you would change next time, not just what you learned.',
 regex: /\b(reflect|reflection|learned|self-aware|self awareness|consequence|next time|change)\b/i,
 priority: 3,
 },
 {
 key: 'generic_structure',
 label: 'Answer sounds organised but too generic',
 action: 'Replace one broad framework sentence with a concrete action tied to the details of the scenario.',
 regex: /\b(generic|vague|framework|stock|formulaic|specific|concrete|detail|example)\b/i,
 priority: 3,
 },
 {
 key: 'tradeoff_reasoning',
 label: 'Trade-offs are not being named explicitly',
 action: 'Before choosing your action, briefly name the two competing duties or stakeholder needs.',
 regex: /\b(trade.?off|competing|balance|weigh|duty|duties|stakeholder|tension|complexity)\b/i,
 priority: 3,
 },
 {
 key: 'direct_answer',
 label: 'Opening answer needs to be more direct',
 action: 'Use the first sentence to answer the question plainly, then build nuance after it.',
 regex: /\b(direct|answer the question|first sentence|clear position|clarity|unclear|focused)\b/i,
 priority: 2,
 },
 {
 key: 'action_specificity',
 label: 'Next step is not concrete enough',
 action: 'Finish with one specific action, who you would speak to, and what you would say or check.',
 regex: /\b(next step|action|specific action|follow.?up|plan|practical|implement|would do)\b/i,
 priority: 2,
 },
 {
 key: 'video_delivery',
 label: 'Video delivery is reducing impact',
 action: 'Slow the first 10 seconds down: answer, pause, then give one reason and one humane action.',
 regex: /\b(pacing|pace|voice|delivery|hesitant|rushed|presentation|composure|eye contact|filler)\b/i,
 priority: 2,
 },
 ];

function round1(value) {
return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function finiteNumber(value) {
if (value === null || value === undefined || value === '') return null;
const number = Number(value);
return Number.isFinite(number) ? number : null;
}

function scoreValue(value) {
const score = finiteNumber(value);
return Number.isFinite(score) ? Math.max(1, Math.min(10, round1(score))) : null;
}

function average(values) {
const nums = values.map(finiteNumber).filter(Number.isFinite);
return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

 function normaliseCompName(name) {
 const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
 return COMP_NAME_MAP[key] || null;
 }

 function typedCompetencies(row) {
 const raw = row?.feedback?.competencies;
 if (!raw) return [];
 const list = Array.isArray(raw)
 ? raw
 : Object.keys(raw).map(key => {
 const value = raw[key];
 return typeof value === 'object' ? { name: key, ...value } : { name: key, score: value };
 });
 return list.map(item => {
 const name = normaliseCompName(item.name || item.competency || item.label);
 const score = finiteNumber(item.score);
 if (!name || !Number.isFinite(score)) return null;
 return {
 name,
 score: Math.max(1, Math.min(10, round1(score))),
 evidence: String(item.evidence || item.reason || item.note || '').trim(),
 improve: String(item.improve || item.improvement || item.next_step || item.nextStep || '').trim(),
 };
 }).filter(Boolean);
 }

 function score10(row) {
 if (row.type === 'video') {
 const score = videoScore(row.feedback);
 return Number.isFinite(score) ? score : null;
 }
 return scoreValue(row.score);
 }

 function rowScoreLabel(row) {
 if (row.type === 'video') {
 const score = videoScore(row.feedback);
 return Number.isFinite(score) ? `${score}/10` : 'No score';
 }
 const score = scoreValue(row.score);
 return Number.isFinite(score) ? `${score}/10` : 'No score';
 }

 function stationShort(row) {
 const prefix = row.type === 'video' ? 'V' : 'T';
 return `${prefix}${row.localIndex}`;
 }

 function stationCriterion(row, def) {
 if (row.type === 'typed') {
 const comps = typedCompetencies(row).filter(c => def.typed.includes(c.name));
 const avg = average(comps.map(c => c.score));
 if (!Number.isFinite(avg)) return null;
 const improve = comps.map(c => c.improve).find(Boolean) || comps.map(c => c.evidence).find(Boolean) || '';
 return { score: avg, improve };
 }
 const prompts = Array.isArray(row.feedback?.per_prompt) ? row.feedback.per_prompt : [];
 const scores = [];
 const comments = [];
 prompts.forEach(prompt => {
 def.video.forEach(key => {
 const crit = prompt?.scores?.[key];
 const score = Number(crit?.score);
 if (Number.isFinite(score)) scores.push(Math.max(1, Math.min(10, score)));
 if (crit?.comment) comments.push(String(crit.comment));
 });
 });
 const avg = average(scores);
 if (!Number.isFinite(avg)) return null;
 return { score: avg, improve: comments.find(Boolean) || row.feedback?.overall?.biggest_improvement || '' };
 }

 function buildRows() {
 let videoIndex = 0;
 let typedIndex = 0;
 return results.map((row, idx) => {
 if (row.type === 'video') videoIndex += 1;
 else typedIndex += 1;
 const localIndex = row.type === 'video' ? videoIndex : typedIndex;
 return {
 ...row,
 order: idx + 1,
 localIndex,
 score10: score10(row),
 };
 });
 }

 function buildCriterionReport(rows) {
 return CRITERION_DEFS.map(def => {
 const points = [];
 rows.forEach(row => {
 const crit = stationCriterion(row, def);
 if (!crit) return;
 points.push({
 station: stationShort(row),
 score: crit.score,
 improve: crit.improve,
 category: row.station?.category || 'CASPer',
 });
 });
 const avg = average(points.map(p => p.score));
 return {
 ...def,
 avg: round1(avg),
 n: points.length,
 points,
 improve: points.map(p => p.improve).find(Boolean) || '',
 };
 }).sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99));
 }

 function buildStaminaReport(rows) {
 const scored = rows.filter(r => Number.isFinite(r.score10));
 const firstFour = scored.filter(r => r.order <= 4);
 const finalFour = scored.filter(r => r.order >= Math.max(1, rows.length - 3));
 const typed = rows.filter(r => r.type === 'typed' && Number.isFinite(r.score10));
 const typedEarly = typed.filter(r => r.localIndex <= 4);
 const typedLate = typed.filter(r => r.localIndex >= 5);
 const openingAvg = average(firstFour.map(r => r.score10));
 const finalAvg = average(finalFour.map(r => r.score10));
 const typedEarlyAvg = average(typedEarly.map(r => r.score10));
 const typedLateAvg = average(typedLate.map(r => r.score10));
 const mainEarly = Number.isFinite(typedEarlyAvg) ? typedEarlyAvg : openingAvg;
 const mainLate = Number.isFinite(typedLateAvg) ? typedLateAvg : finalAvg;
 const diff = Number.isFinite(mainEarly) && Number.isFinite(mainLate) ? mainLate - mainEarly : null;
 let label = 'Not enough scored stations yet';
 let tone = 'neutral';
 let body = 'Complete all written and video feedback to see whether quality held under exam conditions.';
 if (Number.isFinite(diff)) {
 if (diff <= -0.8) {
 label = 'Stamina drop detected';
 tone = 'risk';
 body = `Your later stretch averaged ${round1(mainLate)}/10 against ${round1(mainEarly)}/10 earlier. That is a useful finding, not a failure: your next score gain may come from protecting quality while tired.`;
 } else if (diff >= 0.5) {
 label = 'Strong finish';
 tone = 'strong';
 body = `Your later stretch averaged ${round1(mainLate)}/10 against ${round1(mainEarly)}/10 earlier. That suggests your structure held up as the exam got harder.`;
 } else {
 label = 'Stamina held steady';
 tone = 'steady';
 body = `Your later stretch averaged ${round1(mainLate)}/10 against ${round1(mainEarly)}/10 earlier. In a full mock, holding quality is a genuinely good sign.`;
 }
 }
 return {
 label,
 tone,
 body,
 openingAvg: round1(openingAvg),
 finalAvg: round1(finalAvg),
 typedEarlyAvg: round1(typedEarlyAvg),
 typedLateAvg: round1(typedLateAvg),
 diff: round1(diff),
 };
 }

 function collectFeedbackText(row) {
 const bits = [];
 const fb = row.feedback || {};
 if (row.type === 'typed') {
 ['improvements', 'missed', 'empathy', 'strengths'].forEach(key => {
 if (fb[key]) bits.push(String(fb[key]));
 });
 typedCompetencies(row).forEach(c => {
 if (c.improve) bits.push(c.improve);
 });
 } else {
 const overall = fb.overall || {};
 ['biggest_improvement', 'biggest_strength', 'excellent_version'].forEach(key => {
 if (overall[key]) bits.push(String(overall[key]));
 });
 if (fb.polished_auditor_explanation) bits.push(String(fb.polished_auditor_explanation));
 (fb.per_prompt || []).forEach(prompt => {
 if (prompt?.summary) bits.push(String(prompt.summary));
 Object.values(prompt?.scores || {}).forEach(crit => {
 if (crit?.comment) bits.push(String(crit.comment));
 });
 });
 }
 return bits.join(' ');
 }

 function buildPatternReport(rows) {
 const patterns = PATTERN_DEFS.map(def => ({ ...def, stations: [], count: 0 }));
 rows.forEach(row => {
 const text = collectFeedbackText(row);
 if (!text.trim()) return;
 patterns.forEach(pattern => {
 if (!pattern.regex.test(text)) return;
 pattern.stations.push(stationShort(row));
 pattern.count += 1;
 });
 });
 return patterns
 .filter(pattern => pattern.count >= 2)
 .sort((a, b) => (b.count + b.priority * 0.25) - (a.count + a.priority * 0.25))
 .slice(0, 4);
 }

 function buildCategoryReport(rows) {
 const groups = {};
 rows.forEach(row => {
 if (!Number.isFinite(row.score10)) return;
 const cat = row.station?.category || 'CASPer';
 if (!groups[cat]) groups[cat] = { category: cat, scores: [], stations: [] };
 groups[cat].scores.push(row.score10);
 groups[cat].stations.push(stationShort(row));
 });
 return Object.values(groups)
 .map(group => ({ ...group, avg: round1(average(group.scores)), n: group.scores.length }))
 .sort((a, b) => a.avg - b.avg);
 }

 function buildInterpretation(avg) {
 if (!Number.isFinite(avg)) {
 return {
 band: 'Awaiting scored feedback',
 tone: 'neutral',
 text: 'The full mock needs scored written and video feedback before it can estimate your cohort position.',
 };
 }
 if (avg >= 7.5) {
 return {
 band: 'Very strong Key2MD cohort signal',
 tone: 'strong',
 text: 'This is a very high result against a competitive Key2MD cohort of real, actively preparing applicants. It is not an official Acuity score, but it would usually be consistent with a strong Q4-style performance signal.',
 };
 }
 if (avg >= 6.5) {
 return {
 band: 'Likely Q4-style signal',
 tone: 'strong',
 text: 'A 6.5+ full-mock average is hard to achieve here because the comparison group is self-selecting and serious. With safe language: this is likely a Q4-style signal, and you should be reasonably confident if this is repeatable under timing.',
 };
 }
 if (avg >= 5.5) {
 return {
 band: 'Probably Q3-style signal',
 tone: 'steady',
 text: 'This likely sits around a Q3-style signal against the Key2MD prep cohort. That is already above the middle of a motivated practice group, but there is still visible room to sharpen specificity, empathy, or stamina.',
 };
 }
 if (avg >= 4.5) {
 return {
 band: 'Developing to borderline Q3 signal',
 tone: 'caution',
 text: 'This is not disastrous; it means the response foundations are there but are not yet landing consistently against a competitive prep cohort. Focus on one repeated pattern rather than trying to fix everything at once.',
 };
 }
 return {
 band: 'Needs targeted rebuilding',
 tone: 'risk',
 text: 'This suggests your current timed responses are not yet showing enough specific empathy, reasoning, or concrete action for a competitive CASPer cohort. The upside is that these are trainable skills, especially if you fix one pattern at a time.',
 };
 }

 function buildOneThing(report) {
 const empathy = report.criteria.find(c => c.key === 'empathy');
 const weakestCriterion = report.criteria.find(c => Number.isFinite(c.avg));
 const strongestPattern = report.patterns[0];
 const weakestCategory = report.categories[0];
 if (empathy && Number.isFinite(empathy.avg) && empathy.avg < 6.5) {
 return {
 title: 'Make empathy specific before adding structure',
 body: 'In your next station, spend one sentence naming the person\'s likely emotion in the exact context, then let that emotion shape your action. Key2MD scoring rewards empathy heavily, but only when it feels specific rather than pasted on.',
 source: `Empathy average: ${empathy.avg}/10 across ${empathy.n} scored touchpoints.`,
 };
 }
 if (strongestPattern) {
 return {
 title: strongestPattern.label,
 body: strongestPattern.action,
 source: `Seen across ${strongestPattern.stations.join(', ')}.`,
 };
 }
 if (report.stamina.tone === 'risk') {
 return {
 title: 'Protect your final-stretch quality',
 body: 'For the next mock, use the same first-sentence structure on the final three typed stations that you used early: direct answer, humane concern, concrete action. Fatigue often removes specificity before students notice it.',
 source: report.stamina.body,
 };
 }
 if (weakestCriterion && Number.isFinite(weakestCriterion.avg) && weakestCriterion.avg < 7) {
 return {
 title: `Lift ${weakestCriterion.label.toLowerCase()} by one point`,
 body: weakestCriterion.improve || `Your highest-yield move is to make ${weakestCriterion.label.toLowerCase()} more visible in every answer, even when the prompt feels mostly ethical or logistical.`,
 source: `${weakestCriterion.label}: ${weakestCriterion.avg}/10.`,
 };
 }
 if (weakestCategory && Number.isFinite(weakestCategory.avg)) {
 return {
 title: `Keep practising ${weakestCategory.category} stations`,
 body: 'You are not looking for a new framework now. You are looking for repeatability: same empathy, same specificity, same judgement, even when the scenario changes.',
 source: `${weakestCategory.category}: ${weakestCategory.avg}/10 across ${weakestCategory.n} station${weakestCategory.n === 1 ? '' : 's'}.`,
 };
 }
 return {
 title: 'Repeat under full timing',
 body: 'Your next improvement is confidence under fatigue. Repeat the mock and check whether your empathy and specificity stay just as strong late as they are early.',
 source: 'Not enough repeated weakness data was available.',
 };
 }

 function buildMockActionPlan(report, rows) {
 const actions = [];
 const weakestCriterion = report.criteria.find(c => Number.isFinite(c.avg));
 const weakestCategory = report.categories.find(c => Number.isFinite(c.avg));
 const scoredRows = rows.filter(row => Number.isFinite(row.score10));
 actions.push({
 label: 'Next station',
 title: report.oneThing.title,
 detail: report.oneThing.body,
 });
 if (weakestCriterion) {
 actions.push({
 label: 'Next 3 stations',
 title: `Make ${weakestCriterion.label.toLowerCase()} visible every time`,
 detail: weakestCriterion.improve || `Before submitting, check that your answer explicitly shows ${weakestCriterion.label.toLowerCase()} rather than leaving the marker to infer it.`,
 });
 }
 if (report.stamina.tone === 'risk') {
 actions.push({
 label: 'Next full mock',
 title: 'Protect late-station quality',
 detail: 'In typed stations 5-7, use the same opening structure as early stations: direct answer, specific concern, concrete next step. Your issue may be fatigue, not knowledge.',
 });
 }
 if (weakestCategory) {
 actions.push({
 label: 'Category focus',
 title: `Repeat ${weakestCategory.category} under timing`,
 detail: `This category averaged ${weakestCategory.avg}/10 across ${weakestCategory.n} scored station${weakestCategory.n === 1 ? '' : 's'}. Treat it as the next practice block, not as a permanent weakness.`,
 });
 }
 if (scoredRows.length < rows.length) {
 actions.push({
 label: 'Report quality',
 title: 'Complete the missing analyses',
 detail: 'Some station feedback did not finish, so use the report as a partial signal and review the station explorer before making big conclusions.',
 });
 }
 return actions.slice(0, 4);
 }

 function buildReadinessChecklist(report) {
 const weakestCriterion = report.criteria.find(c => Number.isFinite(c.avg));
 const lowCriteria = report.criteria.filter(c => Number.isFinite(c.avg) && c.avg < 6.5);
 const diff = Number(report.stamina.diff);
 return [
 {
 label: 'Overall repeatability',
 status: Number.isFinite(report.overallAvg) && report.overallAvg >= 7 ? 'ready' : Number.isFinite(report.overallAvg) && report.overallAvg >= 6.5 ? 'watch' : 'work',
 detail: Number.isFinite(report.overallAvg) ? `${report.overallAvg}/10 overall. The key question is whether you can reproduce this under timing.` : 'Awaiting enough scored stations for an overall signal.',
 },
 {
 label: 'Criterion balance',
 status: !weakestCriterion ? 'watch' : lowCriteria.length ? 'work' : 'ready',
 detail: weakestCriterion ? `Lowest criterion: ${weakestCriterion.label} at ${weakestCriterion.avg}/10.` : 'No criterion pattern available yet.',
 },
 {
 label: 'Late-station stamina',
 status: report.stamina.tone === 'risk' ? 'work' : report.stamina.tone === 'strong' ? 'ready' : 'watch',
 detail: report.stamina.tone === 'risk' ? `Late quality dropped by ${Number.isFinite(diff) ? Math.abs(diff).toFixed(1) : 'a visible margin'} points.` : report.stamina.body,
 },
 {
 label: 'Clear improvement target',
 status: report.oneThing ? 'ready' : 'watch',
 detail: report.oneThing ? report.oneThing.title : 'Do another marked station to find the highest-yield next move.',
 },
 ];
 }

 function visualMetricsFor(row) {
 return row?.visualMetrics || row?.visual_metrics || row?.rawFeedback?.visual_metrics || null;
 }

 function voiceMetricsFor(row) {
 return row?.voiceMetrics || row?.voice_metrics || row?.rawFeedback?.voice_metrics || null;
 }

 function niceKey(key) {
 const map = {
 overall: 'Overall', score: 'Score', label: 'Label', comment: 'Comment', summary: 'Summary',
 empathy: 'Empathy', communication: 'Communication', reasoning: 'Reasoning', reflection: 'Reflection',
 real_world_awareness: 'Real-world judgement', thought_content: 'Thought content', organisation: 'Organisation',
 theme_engagement: 'Theme engagement', evidence_illustration: 'Evidence and illustration',
 language_style: 'Language and style', biggest_strength: 'Biggest strength', biggest_improvement: 'Biggest improvement',
 excellent_version: 'Excellent response would add', visual_presence: 'Visual presence', one_improvement: 'One improvement',
 next_step: 'Next step', nextStep: 'Next step', eye_contact: 'Eye contact', posture: 'Posture', composure: 'Composure',
 };
 return map[key] || String(key || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
 }

 function countVisualValues(items, key) {
 const counts = {};
 items.forEach(item => {
 const value = String(item.visual?.[key] || '').trim();
 if (!value) return;
 counts[value] = (counts[value] || 0) + 1;
 });
 return counts;
 }

 function formatVisualCounts(counts) {
 const entries = Object.entries(counts || {});
 if (!entries.length) return 'No camera signal';
 return entries
 .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
 .map(([key, count]) => `${niceKey(key)} ${count}x`)
 .join(', ');
 }

 function buildPremiumVisualInterpretation(rows) {
 const items = rows
 .filter(row => row?.type === 'video')
 .map((row, i) => ({
 row,
 station: row.localIndex || i + 1,
 presentation: row.feedback?.presentation || null,
 visual: visualMetricsFor(row),
 voice: voiceMetricsFor(row),
 visualDegraded: !!(row.rawFeedback?.visual_degraded || row.visualDegraded || row.visual_degraded),
 }))
 .filter(item => item.presentation || item.visual || item.voice || item.visualDegraded);
 if (!items.length) return null;
 return {
 analysedCount: items.length,
 eyeContact: countVisualValues(items, 'eye_contact'),
 posture: countVisualValues(items, 'posture'),
 composure: countVisualValues(items, 'composure'),
 facialExpressionCount: items.filter(item => String(item.visual?.facial_expression || item.presentation?.facial_expression || '').trim()).length,
 items: items.map(item => ({
 station: item.station,
 category: item.row.station?.category || 'Video station',
 visual: item.visual,
 voice: item.voice,
 presentation: item.presentation,
 visualDegraded: item.visualDegraded,
 })),
 };
 }

function buildMockReport(rows) {
const scored = rows.map(r => r.score10).filter(Number.isFinite);
const overallAvg = round1(average(scored));
const scoredCount = scored.length;
const expectedCount = rows.length;
const criteria = buildCriterionReport(rows);
const stamina = buildStaminaReport(rows);
const patterns = buildPatternReport(rows);
const categories = buildCategoryReport(rows);
const interpretation = buildInterpretation(overallAvg);
const visualInterpretation = buildPremiumVisualInterpretation(rows);
const report = { rows, overallAvg, scoredCount, expectedCount, isPartial: scoredCount < expectedCount, criteria, stamina, patterns, categories, interpretation, visualInterpretation, accessTiming: accessTimingPayload() };
 report.oneThing = buildOneThing(report);
 report.actionPlan = buildMockActionPlan(report, rows);
 report.readiness = buildReadinessChecklist(report);
 return report;
 }

 async function renderDebrief(options = {}) {
 const renderToken = ++debriefRenderToken;
 ensureMockTelemetry('mock_completed');
 addTelemetryEvent('mock_completed');
 stopMockTelemetry();
 started = false;
 rulesAccepted = false;
 stopDraftMonitor();
 restoreSubmit();
 window.K2_ACTIVE_CASPER_MOCK = null;
 window.K2PracticeBridge?.hardStopSession?.();
 setStationChrome(false);
 byId('webcamPanel')?.style.setProperty('display', 'none');
 byId('scenarioCard')?.style.setProperty('display', 'none');
 const progress = byId('casperMockProgress');
 if (progress) progress.remove();
 const area = ensureMainArea();
 if (!area) return;
 area.style.display = 'block';
 area.innerHTML = renderProcessingScreen();

 await settleFinalAnalysisTasks({ skipWait: !!options.skipAnalysisWait });
 if (renderToken !== debriefRenderToken) return;

 try {
 const rows = buildRows();
 const typed = rows.filter(r => r.type === 'typed');
 const videos = rows.filter(r => r.type === 'video');
 finalVideoRows = videos;
 finalReviewRows = rows;
 const typedScores = typed.map(r => scoreValue(r.score)).filter(Number.isFinite);
 const videoScores = videos.map(r => videoScore(r.feedback)).filter(Number.isFinite);
 const typedAvg = typedScores.length ? round1(average(typedScores)) : '-';
 const videoAvg = videoScores.length ? round1(average(videoScores)) : '-';
 const answeredTyped = typed.filter(r => r.answer && r.answer.trim().length > 30).length;
 const report = buildMockReport(rows);
latestReport = {
 overallAvg: report.overallAvg,
 scoredCount: report.scoredCount,
 expectedCount: report.expectedCount,
 isPartial: report.isPartial,
 criteria: report.criteria,
 stamina: report.stamina,
 patterns: report.patterns,
 categories: report.categories,
 interpretation: report.interpretation,
 visualInterpretation: report.visualInterpretation,
 accessTiming: report.accessTiming,
 oneThing: report.oneThing,
 actionPlan: report.actionPlan,
 readiness: report.readiness,
 };
 const completedAnalyses = rows.filter(r => Number.isFinite(r.score10)).length;
const failedAnalyses = rows.filter(r => r.processingError).length;
const partialAnalyses = completedAnalyses < rows.length;

 const studentName = getAuth()?.getUser?.()?.name?.split(' ')[0] || 'Student';
 const interpretation = report.interpretation || {};
 const bandClass = interpretation.tone === 'strong' ? 'strong'
  : interpretation.tone === 'risk' ? 'risk'
  : interpretation.tone === 'caution' ? 'caution'
  : 'steady';

 area.innerHTML = `
  <div class="k2-mock-report">
   <div class="k2mr-wrap">

    <section class="k2mr-hero">
     <div class="k2mr-hero-top">
      <div>
       <div class="k2mr-kicker">Full CASPer mock complete \u00b7 ${esc(studentName)}</div>
       <h1>You finished the full sequence. Here's the <em>real</em> read.</h1>
       <p class="k2mr-hero-sub">This report compares your mock against the Key2MD cohort. It's a practice signal, not an official Acuity score.</p>
      </div>
      <div class="k2mr-score-block">
       <div class="k2mr-score-big">${report.overallAvg ?? '-'}<span class="max">/10</span></div>
       <div class="k2mr-score-lbl">Cohort signal</div>
       ${interpretation.band ? `<div class="k2mr-score-band ${bandClass}">${esc(interpretation.band)}</div>` : ''}
      </div>
     </div>
     <div class="k2mr-stats">
      <div class="k2mr-stat"><div class="k2mr-stat-num">${results.length}</div><div class="k2mr-stat-lbl">Stations done</div></div>
      <div class="k2mr-stat"><div class="k2mr-stat-num">${videoAvg}</div><div class="k2mr-stat-lbl">Video avg /10</div></div>
      <div class="k2mr-stat"><div class="k2mr-stat-num">${typedAvg}</div><div class="k2mr-stat-lbl">Typed avg /10</div></div>
      <div class="k2mr-stat"><div class="k2mr-stat-num">${answeredTyped}/7</div><div class="k2mr-stat-lbl">Typed answered</div></div>
      <div class="k2mr-stat"><div class="k2mr-stat-num">${esc(accessTimingOption().shortLabel)}</div><div class="k2mr-stat-lbl">${formatSeconds(typedWritingSeconds())} typed time</div></div>
      <div class="k2mr-stat"><div class="k2mr-stat-num">${completedAnalyses}/${rows.length}</div><div class="k2mr-stat-lbl">AI analysed</div></div>
     </div>
     <div class="k2mr-hero-foot">
      <strong>Guide only:</strong> 6.5+ is likely a Q4-style signal in this cohort if repeatable; 5.5-6.5 is probably Q3. The scoring intentionally runs cooler than free tools.
     </div>
    </section>

    ${failedAnalyses || partialAnalyses ? renderPartialReportNotice(rows) : ''}
    ${renderOneThing(report.oneThing)}
    ${renderReportActions()}

    <section class="k2mr-section">
     <div class="k2mr-section-head">
      <div class="k2mr-kicker">Readiness dashboard</div>
      <h3>Where you stand <em>right now</em>.</h3>
     </div>
     ${renderReadinessChecklist(report.readiness)}
    </section>

    <section class="k2mr-section">
     <div class="k2mr-section-head">
      <div class="k2mr-kicker">Next practice block</div>
      <h3>What to do in the <em>next seven days</em>.</h3>
     </div>
     ${renderActionPlan(report.actionPlan)}
    </section>

    <div class="k2mr-grid2">
     ${renderCriterionHeatmap(report.criteria)}
     ${renderStamina(report.stamina, rows)}
    </div>

    ${renderPremiumVisualInterpretation(report.visualInterpretation)}

    <div class="k2mr-grid2">
     ${renderPatternReport(report.patterns, report.criteria)}
     ${renderCategoryReport(report.categories)}
    </div>

    ${renderStationExplorer(rows)}

    <div class="k2mr-actionbar" style="background:linear-gradient(135deg,rgba(34,197,94,0.08),rgba(34,197,94,0.02));border-color:rgba(34,197,94,0.25);">
     <div class="k2mr-actionbar-text"><strong>Want Dan's eyes on this mock?</strong> Optional manual review covers every typed answer, video, transcript, and the AI feedback itself.</div>
     <div class="k2mr-actionbar-btns">
      <button id="mockManualReviewBtn" onclick="FullCasperMock.requestManualReview()" class="k2mr-btn k2mr-btn-primary" style="background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 4px 14px rgba(34,197,94,0.3);">Request Dan's manual review - $300 AUD</button>
     </div>
     <div id="mockManualReviewStatus" style="width:100%;font-size:0.74rem;color:rgba(255,255,255,0.55);line-height:1.45;margin-top:6px;"></div>
    </div>

    <div class="k2mr-notice" style="margin-bottom:18px;">
     <strong>Recording note:</strong> Your video recordings are kept for 30 days. Transcripts and feedback stay available - save any notes you need before they expire.
    </div>

    <div class="k2mr-final">
     <button onclick="FullCasperMock.startFreshMock()" class="k2mr-btn k2mr-btn-primary">Start another mock</button>
     <button onclick="setMode('casper');FullCasperMock.deactivateMockMode();" class="k2mr-btn k2mr-btn-ghost">Return to practice</button>
    </div>

   </div>
  </div>
 `
 setTimeout(() => showReviewStation(0), 0);
 saveMockAttempt(rows, latestReport, 'completed').then(() => {
 clearMockDraft();
 }).catch(err => {
 const status = byId('mockManualReviewStatus');
 if (status) status.textContent = `Mock report visible. Manual review checkout will retry saving if needed: ${err.message}`;
 });
 } catch (err) {
 if (renderToken !== debriefRenderToken) return;
 console.error('Mock debrief render failed:', err);
 renderDebriefError(err);
 }
 }

 function card(title, body, extra = '') {
    return `
     <div class="k2mr-card">
      <div class="k2mr-card-head">
       <div class="k2mr-card-title">${esc(title)}</div>
      </div>
      ${body}
      ${extra}
     </div>
    `;
   }

function renderPartialReportNotice(rows) {
  const failed = rows
   .filter(row => row.processingError || !Number.isFinite(row.score10))
   .map(row => `${stationShort(row)}: ${row.processingError || 'analysis not returned yet'}`)
   .join(' | ');
  return `
   <div class="k2mr-notice" style="margin-bottom:18px;">
    <strong>Partial analysis warning.</strong> Some station analyses did not finish in time, so the overall estimate is based only on completed AI feedback. You can still review the recordings and responses captured in the mock.
    ${failed ? `<div style="font-family:var(--mono);font-size:0.7rem;color:rgba(255,255,255,0.5);margin-top:6px;line-height:1.5;">${esc(failed)}</div>` : ''}
   </div>
  `;
 }

 function renderStationExplorer(rows) {
    if (!rows.length) return '';
    const tabs = rows.map((row, i) => {
     const label = row.type === 'video' ? `V${row.localIndex}` : `T${row.localIndex}`;
     const isActive = i === 0;
     const cls = `k2mr-tab${row.type === 'video' ? ' video' : ''}${isActive ? ' active' : ''}`;
     return `<button type="button" onclick="FullCasperMock.showReviewStation(${i})" data-mock-review-tab="${i}" class="${cls}">${esc(label)}</button>`;
    }).join('');
    return `
     <section class="k2mr-explorer">
      <div class="k2mr-explorer-head">
       <div class="k2mr-explorer-title-block">
        <div class="k2mr-kicker">Station explorer</div>
        <h3>Open <em>any</em> station to see the detail.</h3>
        <p>Click a tab to load that station's scenario, your answer, AI feedback, and rewrite suggestion.</p>
       </div>
       <div class="k2mr-tabs">${tabs}</div>
      </div>
      <div class="k2mr-explorer-body">
       <div id="mockStationReviewPanel">${safeStationReviewHtml(rows[0])}</div>
      </div>
     </section>
    `;
   }

 function showReviewStation(i = 0) {
    const row = finalReviewRows[i];
    document.querySelectorAll('[data-mock-review-tab]').forEach(btn => {
     const isActive = Number(btn.dataset.mockReviewTab) === i;
     btn.classList.toggle('active', isActive);
    });
    const panel = byId('mockStationReviewPanel');
    if (panel) {
     try {
      panel.innerHTML = stationReviewHtml(row);
      if (row?.type === 'video') setTimeout(() => initMockVideoPlayer('mockStationVideoPlayer'), 0);
     } catch (err) {
      console.error('Mock station render failed:', err, row);
      panel.innerHTML = `<div class="k2mr-notice" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.25);"><strong style="color:var(--red);">Station could not render.</strong> The report is still saved. Try refreshing, or open History later.</div>`;
     }
    }
   }

 function stationReviewHtml(row) {
 if (!row) return '<div style="font-size:0.84rem;color:var(--gray400);">No station selected.</div>';
 return row.type === 'video' ? videoStationReviewHtml(row) : typedStationReviewHtml(row);
 }

 function scenarioPromptHtml(row) {
    const station = row.station || {};
    const isVideo = row.type === 'video';
    const stationType = isVideo ? 'Video' : 'Typed';
    const scenario = splitScenarioRole(station.scenario || '');
    const prompts = [station.prompt1, station.prompt2].filter(Boolean).map((prompt, i) => `
     <div class="k2mr-prompt">
      <div class="k2mr-prompt-num">Prompt ${i + 1}</div>
      <div class="k2mr-prompt-text">${esc(prompt)}</div>
     </div>
    `).join('');
    return `
     <div class="k2mr-scenario-card">
      <div class="k2mr-card-title">Scenario &middot; ${stationType} ${row.localIndex || ''} &middot; ${esc(station.category || 'CASPer')}</div>
      ${scenario.role ? `<div class="k2mr-role-card"><div class="k2mr-role-label">Role</div><div class="k2mr-role-value">${esc(scenario.role)}</div></div>` : ''}
      ${scenario.body ? `<div class="k2mr-scenario-text">${esc(scenario.body)}</div>` : ''}
      ${prompts ? `<div class="k2mr-prompts">${prompts}</div>` : ''}
     </div>
    `;
   }

 function splitScenarioRole(value) {
 const text = String(value || '').trim();
 if (!/^Role\s*:/i.test(text)) return { role: '', body: text };
 const withoutLabel = text.replace(/^Role\s*:\s*/i, '').trim();
 if (!withoutLabel) return { role: '', body: '' };
 const newlineMatch = withoutLabel.match(/^([^\n\r]+)[\n\r]+([\s\S]*)$/);
 if (newlineMatch) return { role: newlineMatch[1].trim(), body: newlineMatch[2].trim() };
 const inlineMatch = withoutLabel.match(/^(.+?)\s+((?:You|Your|You're|You\u2019re)\b[\s\S]*)$/i);
 if (inlineMatch) return { role: inlineMatch[1].trim(), body: inlineMatch[2].trim() };
 return { role: withoutLabel, body: '' };
 }

 function mockVideoDuration(row) {
 const candidates = [
 row?.durationSec,
 row?.duration_sec,
 row?.rawFeedback?.durationSec,
 row?.rawFeedback?.recording_duration_seconds,
 row?.feedback?.durationSec,
 ];
 const found = candidates.map(Number).find(v => Number.isFinite(v) && v > 0);
 return found || 0;
 }

	 function mockTime(seconds) {
	 const total = Math.max(0, Math.round(Number(seconds) || 0));
	 const m = Math.floor(total / 60);
	 const s = total % 60;
	 return `${m}:${String(s).padStart(2, '0')}`;
	 }

	 function mockTranscriptSegments(row) {
	 const direct = Array.isArray(row?.transcriptSegments) ? row.transcriptSegments : [];
	 const saved = Array.isArray(row?.transcript_segments) ? row.transcript_segments : [];
	 const raw = Array.isArray(row?.rawFeedback?.transcript_segments) ? row.rawFeedback.transcript_segments : [];
	 return (direct.length ? direct : saved.length ? saved : raw)
	 .map(seg => ({
	 start: Number(seg.start ?? seg.start_time ?? 0),
	 end: Number(seg.end ?? seg.end_time ?? seg.start ?? 0),
	 text: String(seg.text || '').trim(),
	 }))
	 .filter(seg => seg.text);
	 }

	 function mockTranscriptReviewHtml(row, videoId) {
	  const segments = mockTranscriptSegments(row);
	  if (segments.length) {
	   return `
	    <div class="k2mr-card" style="margin-top:12px;padding:14px 16px;">
	     <div class="k2mr-card-title" style="margin-bottom:6px;">Synced transcript</div>
	     <div style="font-size:0.74rem;color:rgba(255,255,255,0.5);line-height:1.45;margin-bottom:10px;">Click a line to jump the video.</div>
	     <div data-mock-sync-for="${esc(videoId)}" style="max-height:280px;overflow:auto;display:grid;gap:3px;">
	      ${segments.map(seg => {
	       const end = Number.isFinite(seg.end) && seg.end > seg.start ? seg.end : seg.start + 2.5;
	       return `<button type="button" data-mock-sync-segment data-video-id="${esc(videoId)}" data-start="${esc(seg.start)}" data-end="${esc(end)}" onclick="FullCasperMock.jumpTranscript('${esc(videoId)}', ${Number(seg.start) || 0})" style="width:100%;text-align:left;border:0;background:transparent;border-radius:7px;padding:7px 9px;font-family:inherit;font-size:0.78rem;line-height:1.55;color:rgba(255,255,255,0.7);cursor:pointer;transition:all 0.15s;"><span style="font-family:var(--mono);font-size:0.66rem;color:rgba(255,255,255,0.4);font-weight:700;margin-right:8px;font-variant-numeric:tabular-nums;">${esc(mockTime(seg.start))}</span>${esc(seg.text)}</button>`;
	      }).join('')}
	     </div>
	    </div>
	   `;
	  }
	  return row?.transcript ? `<div class="k2mr-card" style="margin-top:12px;padding:14px 16px;"><div class="k2mr-card-title" style="margin-bottom:7px;">Transcript used for marking</div><div style="font-size:0.8rem;color:rgba(255,255,255,0.7);line-height:1.7;max-height:230px;overflow:auto;">${esc(row.transcript)}</div></div>` : '';
	 }

	 function syncMockTranscript(videoId, time) {
	 const safeId = window.CSS?.escape ? CSS.escape(videoId) : String(videoId).replace(/["\\]/g, '\\$&');
	 const wrap = document.querySelector(`[data-mock-sync-for="${safeId}"]`);
	 if (!wrap) return;
	 let active = null;
	 wrap.querySelectorAll('[data-mock-sync-segment]').forEach(btn => {
	 const start = Number(btn.dataset.start || 0);
	 const end = Number(btn.dataset.end || start + 2.5);
	 const on = time >= start && time < Math.max(end, start + 0.8);
	 btn.style.background = on ? 'rgba(14,165,233,0.15)' : 'transparent';
	 btn.style.boxShadow = on ? 'inset 3px 0 0 var(--teal2)' : 'none';
	 btn.style.color = on ? '#fff' : 'rgba(255,255,255,0.7)';
	 if (on) active = btn;
	 });
	 if (active && wrap.dataset.lastActive !== String(active.dataset.start)) {
	 wrap.dataset.lastActive = String(active.dataset.start);
	 active.scrollIntoView({ block: 'nearest' });
	 }
	 }

	 async function jumpTranscript(videoId, start) {
	 const video = byId(videoId);
	 if (!video) return;
	 if (!video.getAttribute('src') && video.dataset.recordingKey) {
	 const ready = await ensureMockVideoSource(videoId);
	 if (!ready) return;
	 }
	 applyMockVideoSeek(video, Math.max(0, Number(start) || 0));
	 syncMockTranscript(videoId, video.currentTime || 0);
	 if (video.getAttribute('src')) video.play().catch(() => {});
	 }

	 function applyMockVideoSeek(video, target) {
	 if (!video) return;
	 const safeTarget = Math.max(0, Number(target) || 0);
	 try {
	 video.currentTime = safeTarget;
	 video.dataset.pendingSeek = '';
	 } catch {
	 video.dataset.pendingSeek = String(safeTarget);
	 }
	 }

	 function applyPendingMockVideoSeek(id) {
	 const video = byId(id);
	 const pending = Number(video?.dataset?.pendingSeek || NaN);
	 if (!video || !Number.isFinite(pending)) return;
	 applyMockVideoSeek(video, pending);
	 syncMockTranscript(id, video.currentTime || pending || 0);
	 }

 function mockRecordingRequestUrl(video) {
 if (!video?.dataset?.attemptId || !video?.dataset?.recordingKey) return '';
 const params = new URLSearchParams({
 attempt_id: video.dataset.attemptId,
 key: video.dataset.recordingKey,
 });
 return `${apiBase()}/api/casper-mock/recording?${params.toString()}`;
 }

 async function mockRecordingStreamUrl(video) {
 const token = authTokenOrThrow();
 if (!video?.dataset?.attemptId || !video?.dataset?.recordingKey) throw new Error('Recording details are missing for this station.');
 const res = await fetch(`${apiBase()}/api/casper-mock/recording-token`, {
 method:'POST',
 headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
 body: JSON.stringify({ attempt_id: video.dataset.attemptId, key: video.dataset.recordingKey }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.playback_url) throw new Error(data.message || data.error || 'Could not create secure playback.');
 return data;
 }

 async function fetchMockRecordingBlob(video) {
 const url = mockRecordingRequestUrl(video);
 if (!url) throw new Error('Recording details are missing for this station.');
 const token = authTokenOrThrow();
 const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
 if (!res.ok) {
 const data = await res.json().catch(() => ({}));
 throw new Error(data.message || data.error || `Recording unavailable (${res.status}).`);
 }
 const blob = await res.blob();
 const type = String(blob.type || '');
 if (type && !type.startsWith('video/') && type !== 'application/octet-stream') {
 throw new Error('The saved file is not a playable video recording.');
 }
 return blob;
 }

 function mockPlaybackExpired(video) {
 const expires = Number(video?.dataset?.playbackExpires || 0);
 return Number.isFinite(expires) && expires > 0 && Date.now() + 15000 >= expires;
 }

 function waitForMockVideoReady(video, timeoutMs = 8000) {
 return new Promise((resolve, reject) => {
 if (!video) { reject(new Error('Recording player missing.')); return; }
 if (video.readyState >= 1) { resolve(true); return; }
 let done = false;
 const cleanup = () => {
 clearTimeout(timer);
 ['loadedmetadata', 'loadeddata', 'canplay'].forEach(eventName => video.removeEventListener(eventName, ready));
 video.removeEventListener('error', failed);
 };
 const finish = (fn, value) => {
 if (done) return;
 done = true;
 cleanup();
 fn(value);
 };
 const ready = () => finish(resolve, true);
 const failed = () => finish(reject, new Error('The browser could not decode the secure stream.'));
 const timer = setTimeout(() => finish(reject, new Error('The secure stream did not start.')), timeoutMs);
 ['loadedmetadata', 'loadeddata', 'canplay'].forEach(eventName => video.addEventListener(eventName, ready, { once:true }));
 video.addEventListener('error', failed, { once:true });
 });
 }

 async function ensureMockVideoSource(id = 'mockStationVideoPlayer') {
 const video = byId(id);
 if (!video) return false;
 if (video.getAttribute('src') && video.dataset.loaded === '1' && !mockPlaybackExpired(video)) return true;
 const status = byId(`${id}Status`);
 const btn = byId(`${id}Btn`);
 if (!video.dataset.recordingKey) {
 if (status) status.textContent = 'No saved recording key is attached to this station.';
 return false;
 }
 if (status) status.textContent = 'Creating secure stream...';
 if (btn) btn.textContent = 'Load';
 try {
 if (video.dataset.blobUrl) URL.revokeObjectURL(video.dataset.blobUrl);
 video.dataset.blobUrl = '';
 const stream = await mockRecordingStreamUrl(video);
 video.dataset.loaded = '1';
 video.dataset.playbackExpires = String(Date.now() + Number(stream.expires_in || 600) * 1000);
 video.src = stream.playback_url;
 video.load();
 await waitForMockVideoReady(video, 9000);
 if (status) status.textContent = 'Ready. Use play, +/-15s, or drag the timeline.';
 return true;
 } catch (streamErr) {
 if (status) status.textContent = 'Stream was slow, loading the original recording instead...';
 try {
 const blob = await fetchMockRecordingBlob(video);
 if (video.dataset.blobUrl) URL.revokeObjectURL(video.dataset.blobUrl);
 const url = URL.createObjectURL(blob);
 video.dataset.blobUrl = url;
 video.dataset.playbackExpires = '';
 video.dataset.loaded = '1';
 video.src = url;
 video.load();
 await waitForMockVideoReady(video, 9000);
 if (status) status.textContent = 'Ready using fallback download.';
 return true;
 } catch (err) {
 if (status) status.textContent = `${streamErr.message || 'Stream failed.'} ${err.message || 'Fallback failed.'}`;
 return false;
 }
 }
 }

	 function mockVideoPlayerHtml(row, id = 'mockStationVideoPlayer') {
	  const src_url = row?.recordingUrl || '';
	  const recordingKey = row?.recordingKey || row?.recording_key || row?.rawFeedback?.recording_key || row?.rawFeedback?.recording_url || '';
	  const duration = mockVideoDuration(row);
	  return `
	   <div id="${id}Shell" style="background:#000;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;">
	    <video id="${id}" playsinline preload="metadata" ${src_url ? `src="${esc(src_url)}"` : ''} data-attempt-id="${esc(mockAttemptId || savedAttemptId || '')}" data-recording-key="${esc(recordingKey)}" data-duration="${duration || ''}" data-loaded="${src_url ? '1' : ''}" style="width:100%;aspect-ratio:16/9;background:#000;display:block;cursor:pointer;"></video>
	    <div style="padding:11px 14px 13px;background:linear-gradient(180deg,rgba(0,0,0,0.3),rgba(0,0,0,0.6));border-top:1px solid rgba(255,255,255,0.08);">
	     <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
	      <button type="button" onclick="FullCasperMock.skipRecording('${esc(id)}', -15)" style="min-width:48px;height:32px;border-radius:50px;border:1px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.08);color:#fff;font-family:var(--mono);font-size:0.7rem;font-weight:700;cursor:pointer;letter-spacing:0.04em;display:flex;align-items:center;justify-content:center;flex-shrink:0;">-15s</button>
	      <button type="button" id="${id}Btn" aria-label="Play recording" style="min-width:58px;height:32px;border-radius:50px;border:1px solid rgba(14,165,233,0.42);background:rgba(14,165,233,0.16);color:#fff;font-family:var(--mono);font-size:0.7rem;font-weight:700;cursor:pointer;letter-spacing:0.04em;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${src_url ? 'PLAY' : 'LOAD'}</button>
	      <button type="button" onclick="FullCasperMock.skipRecording('${esc(id)}', 15)" style="min-width:48px;height:32px;border-radius:50px;border:1px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.08);color:#fff;font-family:var(--mono);font-size:0.7rem;font-weight:700;cursor:pointer;letter-spacing:0.04em;display:flex;align-items:center;justify-content:center;flex-shrink:0;">+15s</button>
	      ${src_url || recordingKey ? `<button type="button" onclick="FullCasperMock.downloadLocalRecording('${esc(id)}')" style="min-width:78px;height:32px;border-radius:50px;border:1px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.08);color:#fff;font-family:var(--mono);font-size:0.7rem;font-weight:700;cursor:pointer;letter-spacing:0.04em;display:flex;align-items:center;justify-content:center;flex-shrink:0;">DL</button>` : ''}
	      <div style="position:relative;height:16px;flex:1 1 150px;min-width:120px;display:flex;align-items:center;">
	       <div style="position:absolute;left:0;right:0;height:4px;border-radius:99px;background:rgba(255,255,255,0.15);overflow:hidden;">
	        <div id="${id}Fill" style="height:100%;width:0%;background:linear-gradient(90deg,var(--teal3),var(--teal2));border-radius:99px;"></div>
	       </div>
	       <input id="${id}Range" type="range" min="0" max="1000" value="0" aria-label="Seek recording" style="position:absolute;inset:0;width:100%;opacity:0;cursor:pointer;">
	      </div>
	      <div id="${id}Time" style="min-width:74px;text-align:right;color:rgba(255,255,255,0.7);font-family:var(--mono);font-size:0.7rem;font-weight:700;font-variant-numeric:tabular-nums;">0:00 / ${duration ? mockTime(duration) : '--:--'}</div>
	     </div>
	     <div id="${id}Status" style="font-family:var(--mono);font-size:0.66rem;color:rgba(255,255,255,0.48);line-height:1.45;margin-top:7px;">${src_url ? 'Recording ready.' : recordingKey ? 'Saved recording available. Press Load.' : 'No saved recording attached.'}</div>
	    </div>
	   </div>
	  `;
	 }

 function initMockVideoPlayer(id = 'mockStationVideoPlayer') {
 const video = byId(id);
 const btn = byId(`${id}Btn`);
 const range = byId(`${id}Range`);
 const fill = byId(`${id}Fill`);
 const time = byId(`${id}Time`);
 if (!video || !btn || !range || !fill || !time) return;

 const durationHint = () => {
 const hint = Number(video.dataset.duration || 0);
 return Number.isFinite(hint) && hint > 0 ? hint : 0;
 };
 const usableDuration = () => {
 const d = Number(video.duration);
 if (Number.isFinite(d) && d > 0 && d < 86400) return d;
 return durationHint();
 };
 const update = () => {
 const d = usableDuration();
 const current = Math.max(0, Number(video.currentTime) || 0);
 const pct = d ? Math.max(0, Math.min(1, current / d)) : 0;
 range.value = String(Math.round(pct * 1000));
 fill.style.width = `${pct * 100}%`;
	 time.textContent = `${mockTime(current)} / ${d ? mockTime(d) : '--:--'}`;
	 btn.textContent = !video.getAttribute('src') ? 'Load' : (video.paused || video.ended ? 'Play' : 'Pause');
	 syncMockTranscript(id, current);
	 };
 const seek = async () => {
 const ready = await ensureMockVideoSource(id);
 if (!ready) return;
 const d = usableDuration();
 if (!d) return;
	 applyMockVideoSeek(video, (Number(range.value) / 1000) * d);
	 update();
	 };
 const toggle = async () => {
 const ready = await ensureMockVideoSource(id);
 if (!ready) return;
 if (video.paused || video.ended) video.play().catch(() => {});
 else video.pause();
 };

 if (!video.dataset.mockPlayerBound) {
 video.dataset.mockPlayerBound = '1';
 btn.addEventListener('click', toggle);
 video.addEventListener('click', toggle);
 range.addEventListener('input', seek);
	 ['loadedmetadata', 'loadeddata', 'durationchange'].forEach(eventName => {
	 video.addEventListener(eventName, () => applyPendingMockVideoSeek(id));
	 });
	 ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'seeked'].forEach(eventName => {
	 video.addEventListener(eventName, update);
	 });
 video.addEventListener('waiting', () => {
 const status = byId(`${id}Status`);
 if (status) status.textContent = 'Buffering recording...';
 });
 video.addEventListener('stalled', () => {
 const status = byId(`${id}Status`);
 if (status) status.textContent = 'Connection stalled. Press Load again if it does not resume.';
 });
 video.addEventListener('error', () => {
 const status = byId(`${id}Status`);
 if (video.dataset.blobUrl) {
 URL.revokeObjectURL(video.dataset.blobUrl);
 video.dataset.blobUrl = '';
 }
 video.removeAttribute('src');
 try { video.load(); } catch {}
 video.dataset.loaded = '';
 if (status) status.textContent = video.dataset.recordingKey ? 'Playback failed. Press Load again to fetch a fresh copy.' : 'Playback failed. No saved recording key is attached.';
 });
 }
 update();
 }

 async function skipRecording(id = 'mockStationVideoPlayer', delta = 0) {
 const video = byId(id);
 if (!video) return;
 const ready = await ensureMockVideoSource(id);
 if (!ready) return;
 const hint = Number(video.dataset.duration || 0);
 const native = Number(video.duration);
 const duration = Number.isFinite(native) && native > 0 && native < 86400 ? native : (Number.isFinite(hint) && hint > 0 ? hint : 0);
 applyMockVideoSeek(video, Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, (Number(video.currentTime) || 0) + Number(delta || 0))));
 syncMockTranscript(id, Number(video.currentTime) || 0);
 }

 async function downloadLocalRecording(id = 'mockRecordingPlayer') {
 const video = byId(id);
 let src = video?.currentSrc || video?.getAttribute?.('src') || '';
 if (!src && video?.dataset?.recordingKey) {
 const ready = await ensureMockVideoSource(id);
 if (!ready) return;
 src = video.currentSrc || video.getAttribute('src') || '';
 }
 if (!src) return;
 const a = document.createElement('a');
 a.href = src;
 a.download = `key2md-casper-mock-${String(id || 'recording').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'recording'}.webm`;
 a.rel = 'noopener';
 document.body.appendChild(a);
 a.click();
 a.remove();
 }

 function videoStationReviewHtml(row) {
    const presentation = row.feedback?.presentation;
    return `
     <div class="k2mr-station-grid">
      <div class="k2mr-station-left">
       ${mockVideoPlayerHtml(row, 'mockStationVideoPlayer')}
       <div style="font-family:var(--mono);font-size:0.72rem;color:rgba(255,255,255,0.5);line-height:1.5;margin-top:8px;letter-spacing:0.04em;">${esc(rowScoreLabel(row))} &middot; ${esc(row.station?.category || 'Video station')}</div>
       <div class="k2mr-notice" style="margin-top:10px;font-size:0.74rem;">Recording playback is kept for 30 days. Save any notes you need before they expire.</div>
       ${mockTranscriptReviewHtml(row, 'mockStationVideoPlayer')}
      </div>
      <div class="k2mr-station-right">
       ${scenarioPromptHtml(row)}
       ${videoFeedbackHtml(row)}
       ${presentation ? renderPresentationFeedback(presentation, row.rawFeedback?.visual_degraded || row.visualDegraded || row.visual_degraded) : ''}
      </div>
     </div>
    `;
   }

 function renderPresentationFeedback(presentation, visualDegraded) {
    return `
     <div class="k2mr-presentation">
      <div class="k2mr-card-title" style="color:#a78bfa;margin-bottom:8px;">Presentation feedback</div>
      ${visualDegraded ? '<div class="k2mr-notice" style="font-size:0.74rem;margin-bottom:9px;">Camera-based feedback was limited, but voice and transcript feedback were still analysed.</div>' : ''}
      ${presentationLine('Pace', presentation.pace)}
      ${presentationLine('Clarity', presentation.clarity)}
      ${presentationLine('Confidence', presentation.confidence)}
      ${presentationLine('Visual presence', presentation.visual_presence)}
      ${presentationLine('Facial expression', presentation.facial_expression)}
      ${presentationLine('Visual evidence', presentation.visual_evidence)}
      ${presentationLine('One improvement', presentation.one_improvement)}
     </div>
    `;
   }

 function presentationLine(label, value) {
    if (!value) return '';
    return `<div class="k2mr-pres-row"><strong>${esc(label)}:</strong> ${esc(value)}</div>`;
   }


   function fbTile(cls, label, body) {
    if (!body) return '';
    return `
     <div class="k2mr-fb-tile ${cls}">
      <div class="k2mr-fb-lbl"><span class="k2mr-fb-icon" aria-hidden="true"></span><span>${esc(label)}</span></div>
      <div class="k2mr-fb-body">${esc(body)}</div>
     </div>
    `;
   }

  function typedStationReviewHtml(row) {
    const fb = row.feedback || {};
    const score = scoreValue(row.score10 ?? row.score ?? row.feedback?.score ?? row.feedback?.overall?.score);
    const scoreColor = Number.isFinite(score) ? (score >= 7 ? 'var(--green)' : score >= 5.5 ? 'var(--teal2)' : score >= 4.5 ? '#fbbf24' : 'var(--red)') : 'rgba(255,255,255,0.45)';
    const rowTiming = row.accessTiming || row.access_timing || row.timing?.access_timing || accessTimingPayload();
    const timingKey = normaliseAccessTiming(rowTiming.key || rowTiming);
    const timingOption = accessTimingOption(timingKey);
    return `
     <div class="k2mr-station-grid">
      <div class="k2mr-station-left">
       ${scenarioPromptHtml(row)}
       <div class="k2mr-answer-card">
        <div class="k2mr-card-title" style="margin-bottom:8px;">Your typed answer</div>
        <div style="font-family:var(--mono);font-size:0.7rem;color:rgba(255,255,255,0.48);line-height:1.45;margin-bottom:8px;">${esc(timingOption.label)} · ${formatSeconds(timingOption.typedSeconds)} writing time</div>
        <div class="k2mr-answer-text">${esc(row.answer || 'No typed response captured.')}</div>
       </div>
      </div>
      <div class="k2mr-station-right">
       <div class="k2mr-fbsummary">
        <div class="k2mr-fbsummary-head">
         <div class="k2mr-fbsummary-cat">${esc(row.station?.category || 'Typed station')} &middot; Typed ${row.localIndex || ''}</div>
         <div class="k2mr-fbsummary-score" style="color:${scoreColor};">${esc(rowScoreLabel(row))}</div>
        </div>
        ${fbTile('strength', 'Strength', fb.strengths)}
        ${fbTile('improve', 'Biggest improvement', fb.improvements)}
        ${fbTile('empathy', 'Empathy layer to add', fb.empathy)}
        ${fb.missed && fb.missed !== 'None' ? fbTile('missed', 'Missed point', fb.missed) : ''}
        ${fb.excellent_version ? fbTile('excellent', 'An excellent response would add', fb.excellent_version) : ''}
       </div>
       ${typedCompetencyReviewHtml(row)}
      </div>
     </div>
    `;
   }

 function typedFeedbackLine(label, value) {
 return value ? `<div style="font-size:0.8rem;color:var(--gray600);line-height:1.6;margin-top:7px;"><strong>${esc(label)}:</strong> ${esc(value)}</div>` : '';
 }

 function typedCompetencyReviewHtml(row) {
    const comps = typedCompetencies(row).sort((a, b) => a.score - b.score);
    if (!comps.length) return '';
    return `
     <div class="k2mr-comps">
      <div class="k2mr-card-title" style="margin-bottom:10px;">Competency breakdown</div>
      ${comps.map(comp => {
       const color = comp.score >= 7 ? 'var(--green)' : comp.score >= 5.5 ? 'var(--teal2)' : comp.score >= 4.5 ? '#fbbf24' : 'var(--red)';
       return `
        <div class="k2mr-comp">
         <div class="k2mr-comp-head">
          <div class="k2mr-comp-name">${esc(comp.name)}</div>
          <div class="k2mr-comp-score" style="color:${color};">${round1(comp.score)}/10</div>
         </div>
         <div class="k2mr-comp-note">${esc(comp.improve || comp.evidence || 'No specific note returned.')}</div>
        </div>
       `;
      }).join('')}
     </div>
    `;
   }

 function renderVideoPlaybackPanel(videos) {
 if (!videos.length) return '';
 const buttons = videos.map((row, i) => `
 <button type="button" onclick="FullCasperMock.showRecording(${i})" data-mock-video-tab="${i}" style="padding:8px 12px;border-radius:50px;border:1px solid ${i === 0 ? 'var(--navy)' : 'var(--gray200)'};background:${i === 0 ? 'var(--navy)' : '#fff'};color:${i === 0 ? '#fff' : 'var(--gray600)'};font-size:0.76rem;font-weight:850;cursor:pointer;font-family:inherit;">Video ${i + 1}</button>
 `).join('');
 return `
 <div style="border:1px solid rgba(14,165,233,0.22);background:#fff;border-radius:14px;padding:20px 22px;margin-bottom:22px;">
 <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
 <div>
 <div style="font-size:0.66rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:6px;">Your video stations</div>
 <div style="font-size:1.05rem;font-weight:900;color:var(--navy);line-height:1.3;">Watch your recordings with the AI feedback below.</div>
 </div>
 <div style="display:flex;gap:8px;flex-wrap:wrap;">${buttons}</div>
 </div>
 <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:18px;align-items:start;">
 <div>
	 ${mockVideoPlayerHtml(videos[0], 'mockRecordingPlayer')}
	 <div id="mockRecordingMeta" style="font-size:0.75rem;color:var(--gray400);line-height:1.45;margin-top:8px;"></div>
	 <div id="mockRecordingTranscript">${mockTranscriptReviewHtml(videos[0], 'mockRecordingPlayer')}</div>
	 </div>
 <div id="mockRecordingFeedback">${videoPlaybackFeedbackHtml(videos[0])}</div>
 </div>
 </div>
 `;
 }

 function videoPlaybackFeedbackHtml(row) {
 if (!row) return '<div style="font-size:0.84rem;color:var(--gray400);">No video selected.</div>';
 const presentation = row.feedback?.presentation;
 return `${videoFeedbackHtml(row)}${presentation ? `<div style="margin-top:10px;">${renderPresentationFeedback(presentation, row.rawFeedback?.visual_degraded || row.visualDegraded || row.visual_degraded)}</div>` : ''}`;
 }

 function videoFeedbackHtml(row) {
    if (!row) return '<div style="font-size:0.84rem;color:rgba(255,255,255,0.4);">No video selected.</div>';
    if (row.processingError) {
     return `<div class="k2mr-fb-tile" style="border-left-color:var(--red);background:rgba(239,68,68,0.08);"><div class="k2mr-fb-lbl" style="color:var(--red);">Analysis failed</div><div class="k2mr-fb-body">${esc(row.processingError)}</div></div>`;
    }
    const fb = row.feedback || {};
    const overall = fb.overall || {};
    const score = Number(overall.score);
    const scoreColor = Number.isFinite(score) && score >= 7 ? 'var(--green)'
     : Number.isFinite(score) && score >= 5.5 ? 'var(--teal2)'
     : Number.isFinite(score) && score >= 4.5 ? '#fbbf24'
     : 'var(--red)';
    const prompts = Array.isArray(fb.per_prompt) ? fb.per_prompt : [];
    const promptHtml = prompts.length ? `
     <div class="k2mr-prompts-feedback" style="margin-top:12px;">
      <div class="k2mr-prompts-feedback-head">Per-prompt feedback</div>
      ${prompts.map((prompt, i) => `
       <div class="k2mr-prompt-feedback">
        <div class="k2mr-prompt-feedback-head">
         <div class="k2mr-prompt-feedback-title">Prompt ${i + 1}</div>
        </div>
        ${videoPromptCriteriaHtml(prompt)}
       </div>
      `).join('')}
     </div>
    ` : '';
    return `
     <div class="k2mr-fbsummary">
      <div class="k2mr-fbsummary-head">
       <div class="k2mr-fbsummary-cat">${esc(row.station?.category || 'Video station')}</div>
       <div class="k2mr-fbsummary-score" style="color:${scoreColor};">${Number.isFinite(score) ? `${round1(score)}/10` : '-'}${overall.label ? ` &middot; ${esc(overall.label)}` : ''}</div>
      </div>
      ${fbTile('strength', 'Strength', overall.biggest_strength)}
      ${fbTile('improve', 'Biggest improvement', overall.biggest_improvement)}
      ${overall.excellent_version ? fbTile('excellent', 'An excellent response would add', overall.excellent_version) : ''}
      ${row.transcript ? `<div style="font-family:var(--mono);font-size:0.7rem;color:rgba(255,255,255,0.45);line-height:1.55;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);"><strong style="color:var(--teal2);">TRANSCRIPT EXCERPT:</strong> ${esc(String(row.transcript).slice(0, 260))}${String(row.transcript).length > 260 ? '...' : ''}</div>` : ''}
     </div>
     ${promptHtml}
    `;
   }

 function videoPromptCriteriaHtml(prompt) {
    const scores = prompt?.scores || {};
    const order = ['empathy', 'communication', 'reasoning', 'reflection', 'real_world_awareness'];
    const labels = { empathy:'Empathy', communication:'Communication', reasoning:'Reasoning', reflection:'Reflection', real_world_awareness:'Real-world judgement' };
    const rows = order.map(key => {
     const crit = scores[key];
     if (!crit) return '';
     const score = Number(crit.score);
     const color = Number.isFinite(score) && score >= 7 ? 'var(--green)'
      : Number.isFinite(score) && score >= 5.5 ? 'var(--teal2)'
      : Number.isFinite(score) && score >= 4.5 ? '#fbbf24'
      : 'var(--red)';
     return `
      <div class="k2mr-prompt-crit">
       <div class="k2mr-prompt-crit-label" style="color:${color};">${esc(labels[key] || key)} ${Number.isFinite(score) ? `${round1(score)}/10` : ''}</div>
       <div class="k2mr-prompt-crit-comment">${esc(crit.comment || crit.label || '')}</div>
      </div>
     `;
    }).join('');
    return rows || `<div class="k2mr-prompt-crit-comment">${esc(prompt?.summary || 'Feedback captured for this prompt.')}</div>`;
   }

 function showRecording(i = 0) {
 const row = finalVideoRows[i];
 document.querySelectorAll('[data-mock-video-tab]').forEach(btn => {
 const activeTab = Number(btn.dataset.mockVideoTab) === i;
 btn.style.background = activeTab ? 'var(--navy)' : '#fff';
 btn.style.color = activeTab ? '#fff' : 'var(--gray600)';
 btn.style.border = activeTab ? '1px solid var(--navy)' : '1px solid var(--gray200)';
 });
 const player = byId('mockRecordingPlayer');
 if (player) {
 const recordingKey = row?.recordingKey || row?.recording_key || row?.rawFeedback?.recording_key || row?.rawFeedback?.recording_url || '';
 const localUrl = row?.recordingUrl || '';
 if (player.dataset.blobUrl) {
 URL.revokeObjectURL(player.dataset.blobUrl);
 player.dataset.blobUrl = '';
 }
 player.dataset.attemptId = mockAttemptId || savedAttemptId || '';
 player.dataset.recordingKey = recordingKey || '';
 player.dataset.duration = mockVideoDuration(row) || '';
 player.dataset.loaded = localUrl ? '1' : '';
 if (localUrl) {
 if (player.getAttribute('src') !== localUrl) {
 player.src = localUrl;
 }
 } else {
 player.removeAttribute('src');
 player.load();
 }
 const status = byId('mockRecordingPlayerStatus');
 if (status) status.textContent = localUrl ? 'Recording ready.' : (recordingKey ? 'Saved recording available. Press Load.' : 'No saved recording attached.');
 player.load();
 }
 const meta = byId('mockRecordingMeta');
 if (meta) {
 meta.textContent = row ? `Video ${i + 1} - ${row.station?.category || 'CASPer'} - ${rowScoreLabel(row)}` : '';
 }
	 const feedback = byId('mockRecordingFeedback');
	 if (feedback) feedback.innerHTML = videoPlaybackFeedbackHtml(row);
	 const transcript = byId('mockRecordingTranscript');
	 if (transcript) transcript.innerHTML = mockTranscriptReviewHtml(row, 'mockRecordingPlayer');
	 initMockVideoPlayer('mockRecordingPlayer');
	 }

 function renderInterpretation(report) {
    // Interpretation is now rendered inline in the hero block
    return '';
   }

 function renderOneThing(oneThing) {
    if (!oneThing) return '';
    return `
     <section class="k2mr-onething">
      <div class="k2mr-kicker">The one thing to fix</div>
      <h2>${esc(oneThing.title)}</h2>
      <p>${esc(oneThing.body)}</p>
      ${oneThing.source ? `<div class="k2mr-onething-why"><strong>WHY THIS ONE:</strong> ${esc(oneThing.source)}</div>` : ''}
     </section>
    `;
   }

 function renderReportActions() {
    return `
     <div class="k2mr-actionbar">
      <div class="k2mr-actionbar-text"><strong>Save the useful part.</strong> Grab a plain-text summary, print the report, or open it in History later.</div>
      <div class="k2mr-actionbar-btns">
       <button type="button" onclick="FullCasperMock.copyReportSummary()" class="k2mr-btn k2mr-btn-ghost">Copy summary</button>
       <button type="button" onclick="FullCasperMock.printReport()" class="k2mr-btn k2mr-btn-ghost">Print report</button>
       <a href="history.html" class="k2mr-btn k2mr-btn-primary">Open History</a>
      </div>
      <div id="mockReportActionStatus" style="width:100%;font-size:0.74rem;color:rgba(255,255,255,0.55);line-height:1.4;"></div>
     </div>
    `;
   }

 function renderReadinessChecklist(items) {
    const labelFor = status => status === 'ready' ? 'Ready' : status === 'work' ? 'Needs work' : 'Watch';
    const classFor = status => status === 'ready' ? 'ready' : status === 'work' ? 'work' : 'watch';
    return `
     <div class="k2mr-card">
      <div class="k2mr-readiness">
       ${(items || []).map(item => `
        <div class="k2mr-ready-item">
         <div class="k2mr-ready-head">
          <div class="k2mr-ready-label">${esc(item.label)}</div>
          <div class="k2mr-status ${classFor(item.status)}">${labelFor(item.status)}</div>
         </div>
         <div class="k2mr-ready-detail">${esc(item.detail)}</div>
        </div>
       `).join('')}
      </div>
     </div>
    `;
   }

 function renderActionPlan(actions) {
    return `
     <div class="k2mr-card">
      <div style="font-size:0.82rem;color:rgba(255,255,255,0.55);line-height:1.6;margin-bottom:14px;">Use this as the next practice block. The aim is not to memorise a perfect answer - it's to make the tested skill visible under time pressure.</div>
      <div class="k2mr-actionplan">
       ${(actions || []).map((action, i) => `
        <div class="k2mr-action">
         <div class="k2mr-action-num">${i + 1}</div>
         <div>
          <div class="k2mr-action-kicker">${esc(action.label)}</div>
          <div class="k2mr-action-title">${esc(action.title)}</div>
          <div class="k2mr-action-detail">${esc(action.detail)}</div>
         </div>
        </div>
       `).join('')}
      </div>
     </div>
    `;
   }

 function reportSummaryText(report = latestReport) {
 if (!report) return 'No mock report is available yet.';
 const lines = [
 'Key2MD full CASPer mock summary',
 '',
 `Overall: ${Number.isFinite(report.overallAvg) ? report.overallAvg + '/10' : 'awaiting scored feedback'}`,
 `Interpretation: ${report.interpretation?.band || 'No interpretation available'}`,
 `Typed-station timing: ${(report.accessTiming?.label || accessTimingOption().label)} (${formatSeconds(report.accessTiming?.typed_seconds || typedWritingSeconds())} writing time)`,
 '',
 `One thing to fix: ${report.oneThing?.title || 'Awaiting pattern data'}`,
 report.oneThing?.body || '',
 '',
 'Action plan:',
 ...(report.actionPlan || []).map((action, i) => `${i + 1}. ${action.title} - ${action.detail}`),
 '',
 'Reminder: this is a Key2MD practice signal, not an official Acuity score.'
 ];
 return lines.filter(line => line !== undefined && line !== null).join('\n');
 }

 function copyReportSummary() {
 const text = reportSummaryText();
 const status = byId('mockReportActionStatus');
 const done = () => { if (status) status.textContent = 'Report summary copied.'; };
 const failed = () => { if (status) status.textContent = 'Could not copy automatically. Use Print report instead.'; };
 if (navigator.clipboard?.writeText) {
 navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done, failed));
 return;
 }
 fallbackCopy(text, done, failed);
 }

 function fallbackCopy(text, done, failed) {
 try {
 const textarea = document.createElement('textarea');
 textarea.value = text;
 textarea.setAttribute('readonly', '');
 textarea.style.position = 'fixed';
 textarea.style.left = '-9999px';
 document.body.appendChild(textarea);
 textarea.select();
 const ok = document.execCommand('copy');
 textarea.remove();
 ok ? done() : failed();
 } catch {
 failed();
 }
 }

	 function printReport() {
	 const html = buildPrintableMockReportHtml(latestReport, finalReviewRows);
	 const popup = window.open('', '_blank', 'noopener,noreferrer');
	 if (!popup) {
	 const status = byId('mockReportActionStatus');
	 if (status) status.textContent = 'Your browser blocked the print window. Allow popups for Key2MD, then try again.';
	 return;
	 }
	 popup.document.open();
	 popup.document.write(html);
	 popup.document.close();
	 popup.focus();
	 setTimeout(() => popup.print(), 250);
	 }

	 function buildPrintableMockReportHtml(report = latestReport, rows = finalReviewRows) {
	 const studentName = getAuth()?.getUser?.()?.name || 'Student';
	 const printedAt = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	 const accessTiming = report?.accessTiming || accessTimingPayload();
	 const stationRows = (rows || []).map(printStationHtml).join('');
	 const criteriaRows = (report?.criteria || []).filter(c => Number.isFinite(c.avg)).map(c => `
	 <div class="crit">
	 <div><strong>${esc(c.label)}</strong><span>${esc(c.n)} station${c.n === 1 ? '' : 's'}</span></div>
	 <b>${esc(c.avg)}/10</b>
	 </div>
	 `).join('');
	 const actionRows = (report?.actionPlan || []).map((action, i) => `
	 <li><strong>${i + 1}. ${esc(action.title || action.label || 'Action')}</strong><br>${esc(action.detail || '')}</li>
	 `).join('');
	 return `<!doctype html>
	 <html lang="en-AU">
	 <head>
	 <meta charset="utf-8">
	 <title>Key2MD Full CASPer Mock Report</title>
	 <style>
	 *{box-sizing:border-box}body{margin:0;background:#eef3f7;color:#122033;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.55}.page{max-width:980px;margin:0 auto;padding:34px 30px 50px}.hero{background:#0a1628;color:#fff;border-radius:10px;padding:28px 30px;margin-bottom:18px}.kicker{font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#38bdf8;margin-bottom:7px}h1{font-size:28px;line-height:1.15;margin:0 0 8px}h2{font-size:18px;color:#0a1628;margin:0 0 10px}.hero p{margin:0;color:rgba(255,255,255,.72)}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.metric,.card,.station{background:#fff;border:1px solid #dbe4ee;border-radius:8px;padding:14px}.metric b{display:block;color:#0a1628;font-size:19px}.metric span{display:block;color:#64748b;font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{margin-bottom:14px}.one{font-size:15px;color:#334155}.actions{padding-left:20px;margin:6px 0 0}.actions li{margin-bottom:9px}.crit{display:flex;justify-content:space-between;gap:14px;border-top:1px solid #e2e8f0;padding:9px 0}.crit:first-child{border-top:0}.crit span{display:block;color:#64748b;font-size:12px}.station{break-inside:avoid;margin:14px 0}.station-head{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding-bottom:9px;margin-bottom:10px}.station-title{font-weight:900;color:#0a1628}.score{font-weight:900;color:#0284c7;white-space:nowrap}.label{font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#0284c7;margin:12px 0 4px}.text{white-space:pre-wrap;font-size:13px;color:#334155}.note-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.note{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px}.note strong{display:block;color:#0a1628;font-size:12px;margin-bottom:3px}.criteria{margin-top:8px}.criterion{display:grid;grid-template-columns:130px 1fr;gap:10px;border-top:1px solid #e2e8f0;padding:8px 0;font-size:12px}.criterion b{color:#0a1628}.footer{color:#64748b;font-size:12px;margin-top:18px}@media print{body{background:#fff}.page{padding:0}.hero,.metric,.card,.station{box-shadow:none}.hero{border-radius:0}.no-print{display:none}}
	 </style>
	 </head>
	 <body>
	 <main class="page">
	 <section class="hero">
	 <div class="kicker">Key2MD Full CASPer Mock Report</div>
	 <h1>${esc(studentName)} - full mock summary</h1>
	 <p>Generated ${esc(printedAt)}. This is a Key2MD practice report, not an official Acuity result.</p>
	 </section>
	 <section class="meta">
	 <div class="metric"><b>${Number.isFinite(report?.overallAvg) ? esc(report.overallAvg) + '/10' : '-'}</b><span>Overall practice signal</span></div>
	 <div class="metric"><b>${esc((rows || []).length)}</b><span>Stations completed</span></div>
	 <div class="metric"><b>${esc((rows || []).filter(r => r.type === 'video').length)}</b><span>Video stations</span></div>
	 <div class="metric"><b>${esc((rows || []).filter(r => r.type !== 'video').length)}</b><span>Typed stations</span></div>
	 <div class="metric"><b>${esc(accessTiming.label || accessTimingOption().label)}</b><span>${esc(formatSeconds(accessTiming.typed_seconds || typedWritingSeconds()))} typed time</span></div>
	 </section>
	 <section class="grid">
	 <div class="card"><h2>${esc(report?.interpretation?.band || 'Overall interpretation')}</h2><div class="one">${esc(report?.interpretation?.text || 'No overall interpretation returned yet.')}</div></div>
	 <div class="card"><h2>The one thing to fix</h2><div class="one"><strong>${esc(report?.oneThing?.title || 'Awaiting pattern data')}</strong><br>${esc(report?.oneThing?.body || '')}</div></div>
	 </section>
	 <section class="card"><h2>Action plan</h2><ol class="actions">${actionRows || '<li>Review each station below and pick one repeated weakness to practise next.</li>'}</ol></section>
	 <section class="card"><h2>Criterion snapshot</h2>${criteriaRows || '<div class="text">Criterion data is still processing.</div>'}</section>
	 <section><h2>Station-by-station summary</h2>${stationRows || '<div class="station">No stations captured.</div>'}</section>
	 <div class="footer">Video recordings and mock data are retained for 30 days. Use the History page to review available recordings and transcripts while they are still stored.</div>
	 </main>
	 </body>
	 </html>`;
	 }

	 function printStationHtml(row) {
	 const isVideo = row?.type === 'video';
	 const title = `${isVideo ? 'Video' : 'Typed'} ${row?.localIndex || row?.order || ''}`.trim();
	 const station = row?.station || {};
	 const scenario = splitScenarioRole(station.scenario || '');
	 const fb = row?.feedback || {};
	 const overall = fb.overall || {};
	 const strength = isVideo ? overall.biggest_strength : fb.strengths;
	 const improve = isVideo ? overall.biggest_improvement : fb.improvements;
	 const answerLabel = isVideo ? 'Transcript excerpt' : 'Student response excerpt';
	 const answerText = isVideo ? row?.transcript : row?.answer;
	 return `<article class="station">
	 <div class="station-head">
	 <div><div class="station-title">${esc(title)} - ${esc(station.category || 'CASPer')}</div>${scenario.role ? `<div class="label">Role</div><div class="text"><strong>${esc(scenario.role)}</strong></div>` : ''}${scenario.body ? `<div class="label">Scenario</div><div class="text">${esc(scenario.body)}</div>` : ''}</div>
	 <div class="score">${esc(rowScoreLabel(row))}</div>
	 </div>
	 ${station.prompt1 || station.prompt2 ? `<div class="label">Prompts</div><div class="text">${station.prompt1 ? `1. ${esc(station.prompt1)}` : ''}${station.prompt2 ? `\n2. ${esc(station.prompt2)}` : ''}</div>` : ''}
	 <div class="label">${answerLabel}</div>
	 <div class="text">${esc(truncateText(answerText || 'No response captured.', 900))}</div>
	 <div class="note-grid">
	 <div class="note"><strong>Strength</strong>${esc(strength || 'No specific strength returned.')}</div>
	 <div class="note"><strong>Improve</strong>${esc(improve || 'No specific improvement returned.')}</div>
	 </div>
	 ${isVideo ? printVideoCriteriaHtml(fb.per_prompt || []) : printTypedCompetenciesHtml(fb.competencies)}
	 </article>`;
	 }

	 function printVideoCriteriaHtml(prompts) {
	 const rows = [];
	 (prompts || []).forEach((prompt, i) => {
	 Object.entries(prompt?.scores || {}).forEach(([key, value]) => {
	 const score = scoreValue(value?.score);
	 const label = key.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
	 rows.push(`<div class="criterion"><b>Prompt ${i + 1} ${esc(label)}${Number.isFinite(score) ? ` (${score}/10)` : ''}</b><span>${esc(value?.comment || value?.label || '')}</span></div>`);
	 });
	 });
	 return rows.length ? `<div class="criteria"><div class="label">Video criteria</div>${rows.join('')}</div>` : '';
	 }

	 function printTypedCompetenciesHtml(raw) {
	 const comps = normalizeTypedCompetenciesForPrint(raw);
	 if (!comps.length) return '';
	 return `<div class="criteria"><div class="label">Typed competencies</div>${comps.map(comp => `
	 <div class="criterion"><b>${esc(comp.name)}${Number.isFinite(comp.score) ? ` (${comp.score}/10)` : ''}</b><span>${esc(comp.note || '')}</span></div>
	 `).join('')}</div>`;
	 }

	 function normalizeTypedCompetenciesForPrint(raw) {
	 if (!raw) return [];
	 const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([key, value]) => typeof value === 'object' ? { name: key, ...value } : { name: key, score: value });
	 return list.map(item => {
	 const score = finiteNumber(item.score);
	 return {
	 name: item.name || item.competency || item.label || 'Competency',
	 score: Number.isFinite(score) ? Math.round(score * 10) / 10 : null,
	 note: item.improve || item.improvement || item.next_step || item.nextStep || item.evidence || item.reason || item.note || item.comment || '',
	 };
	 }).filter(item => item.name);
	 }

	 function truncateText(value, max = 500) {
	 const clean = String(value || '').replace(/\s+/g, ' ').trim();
	 return clean.length > max ? clean.slice(0, max - 3) + '...' : clean;
	 }

 function renderCriterionHeatmap(criteria) {
    const rows = criteria.map(c => {
     const pct = Number.isFinite(c.avg) ? Math.max(4, Math.min(100, Math.round(c.avg * 10))) : 0;
     let color, gradient;
     if (!Number.isFinite(c.avg)) { color = 'rgba(255,255,255,0.2)'; gradient = 'rgba(255,255,255,0.1)'; }
     else if (c.avg >= 7) { color = 'var(--green)'; gradient = 'linear-gradient(90deg,#16a34a,#22c55e)'; }
     else if (c.avg >= 5.5) { color = 'var(--teal2)'; gradient = 'linear-gradient(90deg,var(--teal3),var(--teal2))'; }
     else if (c.avg >= 4.5) { color = '#fbbf24'; gradient = 'linear-gradient(90deg,#f59e0b,#fbbf24)'; }
     else { color = 'var(--red)'; gradient = 'linear-gradient(90deg,#dc2626,#ef4444)'; }
     return `
      <div class="k2mr-crit-row">
       <div class="k2mr-crit-head">
        <span class="k2mr-crit-label">${esc(c.label)}</span>
        <span class="k2mr-crit-score" style="color:${color};">${Number.isFinite(c.avg) ? `${c.avg}/10` : '-'}<span class="k2mr-crit-n">${c.n}x</span></span>
       </div>
       <div class="k2mr-crit-track"><div class="k2mr-crit-fill" style="width:${pct}%;background:${gradient};"></div></div>
      </div>
     `;
    }).join('');
    return `
     <div class="k2mr-card">
      <div class="k2mr-card-head">
       <div class="k2mr-card-title">Criterion heatmap</div>
       <div class="k2mr-card-meta">Across all stations</div>
      </div>
      <div style="font-size:0.78rem;color:rgba(255,255,255,0.5);line-height:1.55;margin-bottom:14px;">Averages combine written competency scores and CASPer video criterion scores where available. Practice signals, not official sub-scores.</div>
      ${rows}
     </div>
    `;
   }

 function renderStamina(stamina, rows) {
    const toneClass = stamina.tone === 'strong' ? 'strong' : stamina.tone === 'risk' ? 'risk' : 'steady';
    const sparkline = renderStaminaSparkline(rows || []);
    return `
     <div class="k2mr-card">
      <div class="k2mr-card-head">
       <div class="k2mr-card-title">Stamina pattern</div>
       <div class="k2mr-card-meta">First half vs second half</div>
      </div>
      <div class="k2mr-stamina-label ${toneClass}">${esc(stamina.label)}</div>
      <div class="k2mr-stamina-body">${esc(stamina.body)}</div>
      ${sparkline}
      <div class="k2mr-stamina-split">
       <div class="k2mr-stamina-cell">
        <div class="k2mr-stamina-cell-lbl">Typed 1-4</div>
        <div class="k2mr-stamina-cell-val">${stamina.typedEarlyAvg ?? '-'}</div>
       </div>
       <div class="k2mr-stamina-cell">
        <div class="k2mr-stamina-cell-lbl">Typed 5-7</div>
        <div class="k2mr-stamina-cell-val">${stamina.typedLateAvg ?? '-'}</div>
       </div>
      </div>
     </div>
    `;
   }

   function renderStaminaSparkline(rows) {
    const scored = (rows || []).filter(r => Number.isFinite(r.score10));
    if (scored.length < 3) return '';
    const bars = scored.map(r => {
     const score = r.score10;
     const height = Math.max(12, Math.min(95, Math.round(score * 10)));
     const cls = score >= 7 ? 'green' : score >= 5.5 ? 'teal' : score >= 4.5 ? 'gold' : 'red';
     return `<div class="k2mr-sparkline-bar ${cls}" style="height:${height}%" title="${esc(stationShort(r))}: ${score}/10"></div>`;
    }).join('');
    const labels = scored.map(r => `<span>${esc(stationShort(r))}</span>`).join('');
    return `
     <div class="k2mr-sparkline">
      <div class="k2mr-sparkline-title">Quality across ${scored.length} station${scored.length === 1 ? '' : 's'}</div>
      <div class="k2mr-sparkline-bars" style="grid-template-columns:repeat(${scored.length},1fr);">${bars}</div>
      <div class="k2mr-sparkline-labels">${labels}</div>
     </div>
    `;
   }

 function renderPremiumVisualInterpretation(summary) {
    if (!summary) return '';
    const stationCards = (summary.items || []).map(item => {
     const visual = item.visual || {};
     const presentation = item.presentation || {};
     const voice = item.voice || {};
     const cameraLimited = item.visualDegraded || !item.visual;
     return `
      <div style="background:rgba(0,0,0,0.2);border:1px solid rgba(167,139,250,0.18);border-radius:10px;padding:14px 16px;">
       <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <div>
         <div style="font-size:0.84rem;font-weight:800;color:#fff;">Video ${esc(item.station)} &middot; ${esc(item.category)}</div>
         <div style="font-family:var(--mono);font-size:0.66rem;color:rgba(255,255,255,0.45);line-height:1.4;margin-top:3px;">${cameraLimited ? 'Camera signal limited or unavailable' : esc(visual.summary || 'Camera signal available')}</div>
        </div>
        ${voice?.pace_wpm ? `<div style="font-family:var(--mono);font-size:0.72rem;font-weight:700;color:#a78bfa;white-space:nowrap;">${esc(voice.pace_wpm)} wpm</div>` : ''}
       </div>
       ${visual?.eye_contact ? visualLine('Eye contact', niceKey(visual.eye_contact)) : ''}
       ${visual?.posture ? visualLine('Posture', niceKey(visual.posture)) : ''}
       ${visual?.composure ? visualLine('Composure', niceKey(visual.composure)) : ''}
       ${visual?.facial_expression ? visualLine('Facial expression', visual.facial_expression) : ''}
       ${visual?.engagement ? visualLine('Visible engagement', visual.engagement) : ''}
       ${Array.isArray(visual?.distractions) && visual.distractions.length ? visualLine('Distractions', visual.distractions.join(', ')) : ''}
       ${presentation.visual_presence ? visualLine('AI interpretation', presentation.visual_presence) : ''}
       ${presentation.facial_expression ? visualLine('Expression interpretation', presentation.facial_expression) : ''}
       ${presentation.one_improvement ? visualLine('Practice cue', presentation.one_improvement) : ''}
      </div>
     `;
    }).join('');
    return `
     <section class="k2mr-section">
      <div class="k2mr-section-head">
       <div class="k2mr-kicker" style="color:#a78bfa;">Premium visual interpretation</div>
       <h3>How you <em>came across</em> on camera.</h3>
      </div>
      <div class="k2mr-card" style="border-color:rgba(167,139,250,0.25);background:linear-gradient(135deg,rgba(167,139,250,0.05),rgba(167,139,250,0.01));">
       <div style="font-size:0.82rem;color:rgba(255,255,255,0.65);line-height:1.65;margin-bottom:14px;">Premium visual feedback uses answer-time webcam frames plus voice and transcript signals to interpret delivery. These are presentation cues only, not judgements about appearance, identity, or personality.</div>
       <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:14px;">
        ${visualSummaryTile('Stations analysed', `${summary.analysedCount || 0}`)}
        ${visualSummaryTile('Eye contact', formatVisualCounts(summary.eyeContact))}
        ${visualSummaryTile('Posture', formatVisualCounts(summary.posture))}
        ${visualSummaryTile('Composure', formatVisualCounts(summary.composure))}
        ${visualSummaryTile('Facial expression', summary.facialExpressionCount ? `${summary.facialExpressionCount} station notes` : 'No expression signal')}
       </div>
       <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;">${stationCards}</div>
      </div>
     </section>
    `;
   }

 function visualSummaryTile(label, value) {
    return `<div style="background:rgba(0,0,0,0.2);border:1px solid rgba(167,139,250,0.18);border-radius:10px;padding:10px 12px;"><div style="font-family:var(--mono);font-size:0.62rem;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${esc(label)}</div><div style="font-size:0.78rem;color:rgba(255,255,255,0.75);line-height:1.4;">${esc(value || '-')}</div></div>`;
   }

 function visualLine(label, value) {
    return value ? `<div style="font-size:0.78rem;color:rgba(255,255,255,0.7);line-height:1.55;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05);"><strong style="color:#a78bfa;font-weight:700;">${esc(label)}:</strong> ${esc(value)}</div>` : '';
   }

 function renderPatternReport(patterns, criteria) {
    let body = '';
    if (patterns.length) {
     body = patterns.map(pattern => `
      <div class="k2mr-pattern">
       <div class="k2mr-pattern-label">${esc(pattern.label)}</div>
       <div class="k2mr-pattern-action">${esc(pattern.action)}</div>
       <div class="k2mr-pattern-where">Seen in ${esc(pattern.stations.join(', '))}</div>
      </div>
     `).join('');
    } else {
     const weak = criteria.find(c => Number.isFinite(c.avg));
     body = `<div style="font-size:0.86rem;color:rgba(255,255,255,0.6);line-height:1.65;">No repeated text pattern appeared strongly enough across multiple stations. The clearest signal is your lowest criterion: <strong style="color:#fff;">${esc(weak?.label || 'awaiting data')}</strong>.</div>`;
    }
    return `
     <div class="k2mr-card">
      <div class="k2mr-card-head"><div class="k2mr-card-title">Cross-station patterns</div></div>
      ${body}
     </div>
    `;
   }

 function renderCategoryReport(categories) {
    const rows = categories.slice(0, 5).map(cat => {
     const color = cat.avg >= 7 ? 'var(--green)' : cat.avg >= 5.5 ? 'var(--teal2)' : cat.avg >= 4.5 ? '#fbbf24' : 'var(--red)';
     return `
      <div class="k2mr-cat-row">
       <div>
        <div class="k2mr-cat-name">${esc(cat.category)}</div>
        <div class="k2mr-cat-stations">${esc(cat.stations.join(', '))} - ${cat.n} station${cat.n === 1 ? '' : 's'}</div>
       </div>
       <div class="k2mr-cat-score" style="color:${color};">${cat.avg}/10</div>
      </div>
     `;
    }).join('');
    return `
     <div class="k2mr-card">
      <div class="k2mr-card-head">
       <div class="k2mr-card-title">Category weaknesses</div>
       <div class="k2mr-card-meta">Lowest first</div>
      </div>
      <div style="font-size:0.78rem;color:rgba(255,255,255,0.5);line-height:1.55;margin-bottom:10px;">Treat one-station categories as a clue, not a verdict.</div>
      ${rows || '<div style="font-size:0.84rem;color:rgba(255,255,255,0.4);">No scored categories yet.</div>'}
     </div>
    `;
   }

 function sectionSummary(title, rows, type) {
 const items = rows.map((r, i) => {
 const scoreText = rowScoreLabel(r);
 const sub = type === 'video'
 ? (r.feedback?.overall?.biggest_improvement || r.feedback?.overall?.biggest_strength || 'Feedback captured.')
 : (r.feedback?.improvements || r.answer?.slice(0, 120) || 'No typed response captured.');
 return `
 <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray100);">
 <div style="width:26px;height:26px;border-radius:50%;background:var(--gray100);color:var(--gray600);display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:800;flex-shrink:0;">${esc(stationShort(r))}</div>
 <div style="min-width:0;flex:1;">
 <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
 <div style="font-size:0.8rem;font-weight:800;color:var(--navy);">${esc(r.station?.category || 'Station')}</div>
 <div style="font-size:0.76rem;font-weight:800;color:var(--teal3);white-space:nowrap;">${esc(scoreText)}</div>
 </div>
 <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;margin-top:3px;">${esc(sub)}</div>
 </div>
 </div>
 `;
 }).join('');
 return `
 <div style="border:1px solid var(--gray200);border-radius:14px;padding:18px 20px;">
 <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--teal3);margin-bottom:10px;">${esc(title)}</div>
 ${items || '<div style="font-size:0.82rem;color:var(--gray400);">No stations captured.</div>'}
 </div>
 `;
 }

 function bindPracticeNudge() {
 document.addEventListener('click', event => {
 if (active) return;
 if (event.target?.id !== 'nextBtn') return;
 setTimeout(maybeShowPracticeNudge, 500);
 });
 }

 function totalPracticeAttempts() {
 try {
 const data = JSON.parse(localStorage.getItem('k2md_station_history_v1') || '{}');
 return Object.values(data).reduce((sum, item) => sum + (Number(item?.attemptCount) || 0), 0);
 } catch {
 return 0;
 }
 }

 function maybeShowPracticeNudge() {
 const attempts = totalPracticeAttempts();
 const threshold = attempts >= 10 ? 10 : attempts >= 5 ? 5 : 0;
 if (!threshold) return;
 const key = `k2md_full_mock_nudge_${threshold}_dismissed`;
 try {
 if (localStorage.getItem(key) === '1') return;
 localStorage.setItem(key, '1');
 } catch {}
 showMockNudge(threshold);
 }

 function showMockNudge(threshold) {
 if (byId('mockNudgeOverlay')) return;
 const overlay = document.createElement('div');
 overlay.id = 'mockNudgeOverlay';
 overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,22,40,0.58);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
 overlay.innerHTML = `
 <div style="background:#fff;border-radius:18px;max-width:520px;width:100%;padding:28px 30px;box-shadow:0 20px 70px rgba(0,0,0,0.28);">
 <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:10px;">You have done ${threshold}+ practice stations</div>
 <h3 style="font-size:1.35rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">Time to test the whole format?</h3>
 <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;margin:0 0 18px;">Single stations build skill. The full mock assigns your next unused 11-station exam handwritten by Dan, then tests the thing students underestimate: switching from video to typed responses while tired.</p>
 <div style="display:flex;gap:10px;flex-wrap:wrap;">
 <button onclick="document.getElementById('mockNudgeOverlay')?.remove();setMode('mock');FullCasperMock.activateMockMode();" style="flex:1;min-width:180px;padding:12px 18px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.88rem;font-weight:800;cursor:pointer;font-family:inherit;">Start full mock</button>
 <button onclick="document.getElementById('mockNudgeOverlay')?.remove();" style="padding:12px 18px;border-radius:50px;border:1px solid var(--gray200);background:#fff;color:var(--gray600);font-size:0.88rem;font-weight:750;cursor:pointer;font-family:inherit;">Keep practising</button>
 </div>
 </div>
 `;
 document.body.appendChild(overlay);
 }

 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', init, { once: true });
 } else {
 init();
 }

 return {
 activateMockMode,
 deactivateMockMode,
 startMock,
 startFreshMock,
 setTier,
 setAccessTiming,
 refreshPricing,
 checkoutMock,
 restoreDraft,
 discardDraft,
 proceedAfterRules,
 continueAfterStation,
 continueAfterMediaSafety,
 enableCameraAndStartVideoStation,
	 requestManualReview,
	 showReviewStation,
	 showRecording,
	 jumpTranscript,
	 skipRecording,
	 downloadLocalRecording,
	 downloadRescueRecording,
	 checkpointMockAttempt,
	 copyReportSummary,
 printReport,
 showPartialReportNow,
 skipBreak,
 };
})();
