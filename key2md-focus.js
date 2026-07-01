/* Key2MD practice-side focus driver. When the student has turned their coach on, this reads
   their own AI-marked answers, works out the mistakes they keep repeating (via key2md-mistakes.js),
   shows a pre-answer reminder on the practice tool, and exposes the focus ids so the review
   request can ask the marker to check those mistakes harder. Opt-in only. Fails silent. */
(function () {
 'use strict';
 var OPTIN_KEY = 'k2md_coach_optin_v1';
 var CACHE_KEY = 'k2md_focus_cache_v1';
 var CACHE_MS = 30 * 60 * 1000;
 var API = (window.API_BASE || (window.K2_CONFIG && window.K2_CONFIG.apiBase) || 'https://key2md-api.brittainmbbs.workers.dev').replace(/\/+$/, '');

 var mem = { mmi: null, casper: null };

 function optedIn() { try { return localStorage.getItem(OPTIN_KEY) === '1'; } catch (e) { return false; } }
 function token() {
  try { if (window.Key2MDAuth && Key2MDAuth.getToken && Key2MDAuth.getToken()) return Key2MDAuth.getToken(); } catch (e) {}
  try { return localStorage.getItem('key2md_token') || ''; } catch (e) { return ''; }
 }
 function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
   return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
 }
 function readCache() {
  try {
   var o = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
   if (o && o.at && (Date.now() - o.at) < CACHE_MS) return o;
  } catch (e) {}
  return null;
 }
 function writeCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), mmi: mem.mmi, casper: mem.casper })); } catch (e) {}
 }
 function profileToFocus(p) {
  if (!p || !p.top || !p.top.length) return null;
  return { ids: (window.Key2MDMistakes ? Key2MDMistakes.focusIds(p) : []), watch: p.watchLine || '', label: p.watchLabel || '', considered: p.considered || 0 };
 }

 function getFocus(tool) {
  tool = tool === 'casper' ? 'casper' : 'mmi';
  if (mem[tool]) return mem[tool];
  var c = readCache();
  if (c && c[tool]) { mem[tool] = c[tool]; return c[tool]; }
  return null;
 }
 function getIds(tool) { var f = getFocus(tool); return (f && f.ids && f.ids.length) ? f.ids : null; }

 function styleOnce() {
  if (document.getElementById('k2FocusStyles')) return;
  var st = document.createElement('style');
  st.id = 'k2FocusStyles';
  st.textContent = ''
   + '.k2-focus-reminder{display:flex;gap:11px;align-items:flex-start;margin:0 0 14px;padding:12px 15px;border:1px solid rgba(124,58,237,0.28);border-radius:12px;'
   + 'background:linear-gradient(135deg,rgba(124,58,237,0.08),rgba(14,165,233,0.05));}'
   + '.k2-focus-reminder .k2fr-ic{flex-shrink:0;width:26px;height:26px;border-radius:50%;background:linear-gradient(180deg,#8b5cf6,#7c3aed);color:#fff;font-weight:800;'
   + 'display:flex;align-items:center;justify-content:center;font-size:0.86rem;box-shadow:0 6px 14px -8px rgba(124,58,237,0.8);}'
   + '.k2-focus-reminder .k2fr-lab{font-size:0.66rem;font-weight:800;letter-spacing:0.09em;text-transform:uppercase;color:#7c3aed;}'
   + '.k2-focus-reminder .k2fr-txt{font-size:0.86rem;color:#0a1628;line-height:1.5;margin-top:2px;}'
   + '.k2-focus-reminder .k2fr-txt b{font-weight:800;}';
  document.head.appendChild(st);
 }

 function renderReminder() {
  var el = document.getElementById('k2FocusReminder');
  if (!el) return;
  var f = optedIn() ? getFocus('mmi') : null;
  if (!f || !f.watch || (f.considered || 0) < 2) { el.style.display = 'none'; el.innerHTML = ''; return; }
  styleOnce();
  el.innerHTML = ''
   + '<div class="k2fr-ic">&#9873;</div>'
   + '<div><div class="k2fr-lab">Your coach is watching</div>'
   + '<div class="k2fr-txt"><b>' + esc(f.label) + '.</b> ' + esc(f.watch) + '</div></div>';
  el.style.display = 'flex';
 }

 function analyseInto(tool, reviews) {
  if (!window.Key2MDMistakes) return;
  mem[tool] = profileToFocus(Key2MDMistakes.buildProfile(reviews, tool));
 }

 function fetchReviews() {
  var t = token();
  if (!t) return Promise.resolve();
  var h = { Authorization: 'Bearer ' + t };
  var mmi = fetch(API + '/api/mmi/reviews?limit=15&source=mmi', { headers: h })
   .then(function (r) { return r.json().catch(function () { return {}; }); })
   .then(function (d) { analyseInto('mmi', (d && d.reviews) || []); })
   .catch(function () {});
  var casper = fetch(API + '/api/reviews', { headers: h })
   .then(function (r) { return r.json().catch(function () { return {}; }); })
   .then(function (d) {
    var rows = ((d && d.reviews) || []).filter(function (x) { return x && x.tool === 'casper' && (x.ai_feedback || x.ai_feedback_json); });
    analyseInto('casper', rows);
   })
   .catch(function () {});
  return Promise.all([mmi, casper]).then(function () { writeCache(); });
 }

 function refresh() {
  if (!optedIn()) { mem.mmi = null; mem.casper = null; renderReminder(); return Promise.resolve(); }
  var c = readCache();
  if (c) { mem.mmi = c.mmi; mem.casper = c.casper; renderReminder(); return Promise.resolve(); }
  return fetchReviews().then(renderReminder);
 }

 function init() {
  // token may arrive after auth.js resolves; retry a few times.
  var tries = 0;
  (function attempt() {
   if (optedIn() && !token() && tries < 6) { tries++; setTimeout(attempt, 800); return; }
   refresh();
  })();
 }

 window.Key2MDFocus = { refresh: refresh, getIds: getIds, getFocus: getFocus, renderReminder: renderReminder };

 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
