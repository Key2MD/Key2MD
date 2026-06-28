(function () {
 var API_DEFAULT = 'https://key2md-api.brittainmbbs.workers.dev';
 var OPTIN_KEY = 'k2md_coach_optin_v1';
 var DATES_KEY = 'k2md_journey_dates_v1';

 var CRITERIA = [
  { key: 'empathy', name: 'Empathy', focus: 'Make the person and the emotional stakes visible before you solve the case.', drill: 'Open your next station by naming the person, what they may be feeling, and why that feeling matters, before you move to a solution.' },
  { key: 'communication', name: 'Communication', focus: 'Sound clear and conversational under time pressure.', drill: 'Record a one minute answer where every step starts with a direct phrase you could actually say out loud to the interviewer.' },
  { key: 'reasoning', name: 'Reasoning', focus: 'Weigh competing options before you commit.', drill: 'On your next station, compare two options out loud, name the risk in each, then commit to the safer next step.' },
  { key: 'reflection', name: 'Reflection', focus: 'Show what you would learn and change.', drill: 'Add a closing sentence that names a limitation, what you would check, and how you would do it better next time.' },
  { key: 'real_world_awareness', name: 'Real-world awareness', focus: 'Bring in safety, hierarchy, confidentiality and practical limits.', drill: 'Before answering, state the real constraint in the scenario, then make sure your final plan fits inside it.' }
 ];
 var CRIT_BY_KEY = {};
 CRITERIA.forEach(function (c) { CRIT_BY_KEY[c.key] = c; });

 var state = {
  apiBase: API_DEFAULT,
  getToken: null,
  diagnosticEl: null,
  coachEl: null,
  analysis: null,
  loadedToken: null,
  loading: false,
  retries: 0
 };

 function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
   return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
 }
 function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
 function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
 function round1(n) { return Math.round(n * 10) / 10; }
 function mean(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : null; }

 function readToken() {
  if (typeof state.getToken === 'function') { var t = state.getToken(); if (t) return t; }
  if (typeof Key2MDAuth !== 'undefined' && Key2MDAuth.getToken) { var a = Key2MDAuth.getToken(); if (a) return a; }
  return lsGet('key2md_token') || '';
 }

 function isOptedIn() { return lsGet(OPTIN_KEY) === '1'; }

 function interviewDateIso() {
  try { var d = JSON.parse(lsGet(DATES_KEY) || '{}'); return (d && d.interview) || ''; } catch (e) { return ''; }
 }
 function daysTo(iso) {
  if (!iso) return null;
  var t = new Date(iso + 'T00:00:00');
  if (!isFinite(t.getTime())) return null;
  var now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((t - now) / 86400000);
 }
 function phaseFor(n) {
  if (n == null) return { tag: '', line: '' };
  if (n < 0) return { tag: 'After your interview', line: 'Keep your reps light in case more interviews come through.' };
  if (n <= 21) return { tag: 'Peak phase', line: 'Final stretch. Daily spoken reps and a full mock matter most now.' };
  if (n <= 60) return { tag: 'Sharpen phase', line: 'Pressure-test under real conditions and build stamina across a circuit.' };
  if (n <= 120) return { tag: 'Build phase', line: 'Turn steady practice into marked feedback so the gains compound.' };
  return { tag: 'Foundation phase', line: 'You have runway. Build the habits now while the pressure is low.' };
 }

 function normKey(k) {
  k = String(k).toLowerCase();
  if (k.indexOf('empath') >= 0) return 'empathy';
  if (k.indexOf('communicat') >= 0) return 'communication';
  if (k.indexOf('reason') >= 0) return 'reasoning';
  if (k.indexOf('reflect') >= 0) return 'reflection';
  if (k.indexOf('real') >= 0 || k.indexOf('aware') >= 0 || k.indexOf('world') >= 0) return 'real_world_awareness';
  return k.replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
 }

 function parseFeedback(r) {
  try { return typeof r.ai_feedback_json === 'string' ? JSON.parse(r.ai_feedback_json) : r.ai_feedback_json; } catch (e) { return null; }
 }
 function reviewScore(r) {
  var fb = parseFeedback(r);
  var s = fb && fb.overall ? Number(fb.overall.score) : NaN;
  return isFinite(s) ? s : null;
 }
 function reviewCriteria(r) {
  var fb = parseFeedback(r);
  if (!fb || typeof fb !== 'object') return null;
  var out = {};
  if (fb.criterion_averages && typeof fb.criterion_averages === 'object') {
   Object.keys(fb.criterion_averages).forEach(function (k) {
    var n = Number(fb.criterion_averages[k]);
    if (isFinite(n)) out[normKey(k)] = n;
   });
  } else if (Array.isArray(fb.per_prompt)) {
   var sum = {}, cnt = {};
   fb.per_prompt.forEach(function (p) {
    var cs = p && p.criterion_scores;
    if (cs && typeof cs === 'object') {
     Object.keys(cs).forEach(function (k) {
      var n = Number(cs[k]);
      if (isFinite(n)) { var kk = normKey(k); sum[kk] = (sum[kk] || 0) + n; cnt[kk] = (cnt[kk] || 0) + 1; }
     });
    }
   });
   Object.keys(sum).forEach(function (k) { out[k] = sum[k] / cnt[k]; });
  }
  return Object.keys(out).length ? out : null;
 }

 function band(avg) {
  if (avg == null) return null;
  if (avg >= 8) return { key: 'exceptional', label: 'Exceptional', color: '#7c3aed' };
  if (avg >= 6.5) return { key: 'strong', label: 'Strong', color: '#0ea5e9' };
  if (avg >= 5) return { key: 'developing', label: 'Developing', color: '#0284c7' };
  return { key: 'building', label: 'Building', color: '#64748b' };
 }
 function nextBand(avg) {
  if (avg == null) return null;
  if (avg < 5) return 'Developing';
  if (avg < 6.5) return 'Strong';
  if (avg < 8) return 'Exceptional';
  return null;
 }

 function analyse(reviews) {
  var scored = [];
  reviews.forEach(function (r) {
   var s = reviewScore(r);
   if (s == null) return;
   scored.push({ score: s, crit: reviewCriteria(r), cat: r.station_category || '', at: r.created_at || '' });
  });
  if (!scored.length) return { count: 0 };
  var recent = scored.slice(0, Math.min(5, scored.length));
  var avg = round1(mean(recent.map(function (x) { return x.score; })));
  var first = scored[scored.length - 1].score;
  var latest = scored[0].score;
  var critAgg = {}, critN = {};
  scored.slice(0, Math.min(8, scored.length)).forEach(function (x) {
   if (!x.crit) return;
   Object.keys(x.crit).forEach(function (k) { critAgg[k] = (critAgg[k] || 0) + x.crit[k]; critN[k] = (critN[k] || 0) + 1; });
  });
  var critAvg = {};
  Object.keys(critAgg).forEach(function (k) { critAvg[k] = critAgg[k] / critN[k]; });
  var weakest = null;
  CRITERIA.forEach(function (c) {
   if (critAvg[c.key] == null) return;
   if (weakest == null || critAvg[c.key] < critAvg[weakest]) weakest = c.key;
  });
  return {
   count: scored.length,
   avg: avg,
   first: first,
   latest: latest,
   gain: scored.length >= 2 ? round1(latest - first) : null,
   weakest: weakest,
   lastCat: scored[0].cat,
   lastAt: scored[0].at
  };
 }

 function injectStyles() {
  if (document.getElementById('k2cStyles')) return;
  var css = ''
   + '.k2c-card{border:1px solid rgba(14,165,233,0.3);border-radius:16px;padding:22px 24px;background:#fff;margin:0 0 20px;}'
   + '.k2c-kicker{font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#0284c7;margin-bottom:6px;}'
   + '.k2c-h{font-family:"DM Serif Display",Georgia,serif;font-size:1.45rem;color:#0a1628;margin:0 0 6px;line-height:1.2;}'
   + '.k2c-muted{color:#475569;line-height:1.6;margin:0 0 10px;}'
   + '.k2c-chip{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:5px 14px;font-size:0.8rem;font-weight:800;color:#fff;}'
   + '.k2c-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0 0;}'
   + '.k2c-stat{flex:1;min-width:120px;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;background:#f8fafc;}'
   + '.k2c-stat b{display:block;font-size:1.5rem;color:#0a1628;line-height:1;}'
   + '.k2c-stat span{display:block;font-size:0.76rem;color:#64748b;margin-top:5px;}'
   + '.k2c-focus{margin-top:16px;padding:14px 16px;border-radius:12px;background:linear-gradient(135deg,rgba(14,165,233,0.08),rgba(124,58,237,0.06));border:1px solid rgba(14,165,233,0.25);}'
   + '.k2c-focus .lab{font-size:0.72rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#0284c7;}'
   + '.k2c-focus .ti{font-weight:800;color:#0a1628;margin:4px 0 5px;font-size:1.02rem;}'
   + '.k2c-list{list-style:none;padding:0;margin:12px 0 0;}'
   + '.k2c-list li{position:relative;padding:6px 0 6px 24px;color:#334155;line-height:1.55;}'
   + '.k2c-list li::before{content:"";position:absolute;left:0;top:13px;width:8px;height:8px;border-radius:50%;background:#0ea5e9;}'
   + '.k2c-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;}'
   + '.k2c-btn{display:inline-flex;align-items:center;border-radius:999px;padding:11px 20px;font-size:0.86rem;font-weight:800;text-decoration:none;cursor:pointer;border:1px solid transparent;font-family:inherit;}'
   + '.k2c-btn.primary{background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;}'
   + '.k2c-btn.secondary{background:#fff;color:#0284c7;border-color:rgba(14,165,233,0.35);}'
   + '.k2c-btn.ghost{background:transparent;color:#64748b;border-color:#e2e8f0;}'
   + '.k2c-fine{font-size:0.74rem;color:#94a3b8;line-height:1.5;margin-top:14px;}'
   + '.k2c-coach{border:1px solid rgba(124,58,237,0.35);background:linear-gradient(180deg,rgba(124,58,237,0.05),transparent);}'
   + '.k2c-toggle{margin-left:auto;font-size:0.78rem;color:#94a3b8;background:none;border:none;cursor:pointer;text-decoration:underline;font-family:inherit;}'
   + '.k2c-head{display:flex;align-items:flex-start;gap:10px;}';
  var st = document.createElement('style');
  st.id = 'k2cStyles';
  st.textContent = css;
  document.head.appendChild(st);
 }

 function disclaimer() {
  return '<p class="k2c-fine">This is a practice indicator built from your own AI-marked answers. It reflects how your recent answers scored against the interview criteria, and it is not a prediction of an interview result or an admission outcome.</p>';
 }

 function trendLine(a) {
  if (a.gain == null) return 'One answer marked so far. Do a couple more and I can show your trend.';
  if (a.gain >= 0.6) return 'Up ' + a.gain.toFixed(1) + ' since your first marked answer. Keep the same habits going.';
  if (a.gain <= -0.6) return 'Down ' + Math.abs(a.gain).toFixed(1) + ' from your first answer. That is usually a focus or fatigue dip, not a real drop in ability.';
  return 'Holding steady across your marked answers. A targeted change to one criterion is the fastest way to move it.';
 }

 function renderDiagnostic() {
  var el = state.diagnosticEl;
  if (!el) return;
  var token = readToken();
  var a = state.analysis;

  if (!a || !a.count) {
   var signedIn = !!token;
   var lead = signedIn
    ? 'You have not had an answer marked yet. The fastest way to see where you stand is the eight-station baseline. It is the same set every time, so it becomes your benchmark.'
    : 'Sign in on the practice tool, then take the eight-station baseline. I will read your AI-marked scores and show you exactly where you stand and what to fix first.';
   el.innerHTML = ''
    + '<div class="k2c-kicker">Where you stand</div>'
    + '<h2 class="k2c-h">Find your starting line.</h2>'
    + '<p class="k2c-muted">' + lead + '</p>'
    + '<div class="k2c-actions">'
    + '<a class="k2c-btn primary" href="practice.html?lock_mode=mmi&tab=baseline&from=coach">Start the baseline mock</a>'
    + (signedIn ? '<a class="k2c-btn secondary" href="practice.html?lock_mode=mmi">Open MMI practice</a>' : '<a class="k2c-btn secondary" href="plans.html">Create a free account</a>')
    + '</div>';
   return;
  }

  var b = band(a.avg);
  var target = nextBand(a.avg);
  var weak = a.weakest ? CRIT_BY_KEY[a.weakest] : null;
  var gapHtml = '';
  if (target && weak) {
   gapHtml = ''
    + '<div class="k2c-focus">'
    + '<div class="lab">Your fastest lever to ' + esc(target) + '</div>'
    + '<div class="ti">' + esc(weak.name) + '</div>'
    + '<div class="k2c-muted" style="margin:0;">' + esc(weak.drill) + '</div>'
    + '</div>';
  } else if (weak) {
   gapHtml = ''
    + '<div class="k2c-focus">'
    + '<div class="lab">Keep sharpening</div>'
    + '<div class="ti">' + esc(weak.name) + '</div>'
    + '<div class="k2c-muted" style="margin:0;">' + esc(weak.drill) + '</div>'
    + '</div>';
  }

  el.innerHTML = ''
   + '<div class="k2c-head"><div style="flex:1;"><div class="k2c-kicker">Where you stand</div>'
   + '<h2 class="k2c-h">You are in the ' + esc(b.label) + ' range.</h2></div>'
   + '<span class="k2c-chip" style="background:' + b.color + ';">' + esc(b.label) + '</span></div>'
   + '<p class="k2c-muted">' + esc(trendLine(a)) + '</p>'
   + '<div class="k2c-row">'
   + '<div class="k2c-stat"><b>' + a.avg.toFixed(1) + '</b><span>Recent average out of 10</span></div>'
   + '<div class="k2c-stat"><b>' + a.count + '</b><span>Answers marked</span></div>'
   + (a.gain != null ? '<div class="k2c-stat"><b>' + (a.gain >= 0 ? '+' : '') + a.gain.toFixed(1) + '</b><span>Change since your first</span></div>' : '')
   + '</div>'
   + gapHtml
   + '<div class="k2c-actions">'
   + '<a class="k2c-btn primary" href="practice.html?lock_mode=mmi">Practise a station now</a>'
   + '<a class="k2c-btn secondary" href="mmi-mock-circuit.html">Run a full circuit</a>'
   + '</div>'
   + disclaimer();
 }

 function renderCoach() {
  var el = state.coachEl;
  if (!el) return;

  if (!isOptedIn()) {
   el.innerHTML = ''
    + '<div class="k2c-kicker">Your coach</div>'
    + '<h2 class="k2c-h">Turn on your AI coach.</h2>'
    + '<p class="k2c-muted">Your coach remembers your history, greets you with the one thing to work on next, and rewrites your plan every time you practise. It reads only your own marked answers. Off by default.</p>'
    + '<div class="k2c-actions">'
    + '<button type="button" class="k2c-btn primary" onclick="Key2MDCoach.enable()">Turn on my coach</button>'
    + '</div>';
   return;
  }

  var token = readToken();
  var a = state.analysis;
  var dn, phase = phaseFor((dn = daysTo(interviewDateIso())));

  if (!token) {
   el.innerHTML = ''
    + '<div class="k2c-head"><div style="flex:1;"><div class="k2c-kicker">Your coach</div>'
    + '<h2 class="k2c-h">Sign in so I can coach you.</h2></div>'
    + '<button type="button" class="k2c-toggle" onclick="Key2MDCoach.disable()">Turn off</button></div>'
    + '<p class="k2c-muted">Sign in on the practice tool and your coach will pick up your marked answers automatically.</p>'
    + '<div class="k2c-actions"><a class="k2c-btn secondary" href="practice.html?lock_mode=mmi">Open practice</a></div>';
   return;
  }

  if (!a || !a.count) {
   el.innerHTML = ''
    + '<div class="k2c-head"><div style="flex:1;"><div class="k2c-kicker">Your coach</div>'
    + '<h2 class="k2c-h">Let us get a first read on you.</h2></div>'
    + '<button type="button" class="k2c-toggle" onclick="Key2MDCoach.disable()">Turn off</button></div>'
    + '<p class="k2c-muted">' + (phase.tag ? esc(phase.tag) + '. ' : '') + 'Do one marked station and I will start building your focus around it.</p>'
    + '<div class="k2c-actions"><a class="k2c-btn primary" href="practice.html?lock_mode=mmi&tab=baseline">Start the baseline</a></div>';
   return;
  }

  var weak = a.weakest ? CRIT_BY_KEY[a.weakest] : null;
  var b = band(a.avg);
  var memory = 'Your last marked answer scored ' + a.latest.toFixed(0) + ' out of 10'
   + (a.lastCat ? ' in the ' + esc(a.lastCat) + ' theme' : '') + '.';

  var todo = [];
  if (weak) todo.push('<b>' + esc(weak.name) + ' rep:</b> ' + esc(weak.drill));
  if (dn != null && dn <= 60) todo.push('<b>Stamina:</b> run a full circuit this week so a real day of stations does not surprise you.');
  else todo.push('<b>Consistency:</b> two marked stations before you next come back, so the trend keeps moving.');
  if (dn != null && dn <= 21) todo.push('<b>Final sharpening:</b> a 1:1 or the Ultimate package can polish your strongest answers for interview day.');

  var ctas = '<a class="k2c-btn primary" href="practice.html?lock_mode=mmi">Do my focus station</a>';
  if (dn != null && dn <= 60) ctas += '<a class="k2c-btn secondary" href="mmi-mock-circuit.html">Run a circuit</a>';
  if (dn != null && dn <= 90) ctas += '<a class="k2c-btn secondary" href="mmi-class.html">MMI classes</a>';

  el.innerHTML = ''
   + '<div class="k2c-head"><div style="flex:1;"><div class="k2c-kicker">Your coach' + (phase.tag ? ' &middot; ' + esc(phase.tag) : '') + '</div>'
   + '<h2 class="k2c-h">Welcome back.</h2></div>'
   + '<button type="button" class="k2c-toggle" onclick="Key2MDCoach.disable()">Turn off</button></div>'
   + '<p class="k2c-muted">' + memory + ' You are in the ' + esc(b.label) + ' range right now.' + (phase.line ? ' ' + esc(phase.line) : '') + '</p>'
   + (weak ? '<div class="k2c-focus"><div class="lab">Work on this next</div><div class="ti">' + esc(weak.name) + '</div><div class="k2c-muted" style="margin:0;">' + esc(weak.focus) + '</div></div>' : '')
   + '<ul class="k2c-list">' + todo.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>'
   + '<div class="k2c-actions">' + ctas + '</div>'
   + disclaimer();
 }

 function renderAll() {
  injectStyles();
  renderDiagnostic();
  renderCoach();
 }

 function loadData() {
  var token = readToken();
  if (!token) {
   if (state.retries < 6) { state.retries++; setTimeout(loadData, 800); }
   renderAll();
   return;
  }
  if (state.loadedToken === token || state.loading) { renderAll(); return; }
  state.loading = true;
  renderAll();
  fetch(state.apiBase + '/api/mmi/reviews?limit=50&source=mmi', { headers: { Authorization: 'Bearer ' + token } })
   .then(function (res) { return res.json().catch(function () { return {}; }); })
   .then(function (data) {
    var reviews = data && Array.isArray(data.reviews) ? data.reviews : [];
    state.analysis = analyse(reviews);
    state.loadedToken = token;
   })
   .catch(function () {})
   .then(function () { state.loading = false; renderAll(); });
 }

 var Coach = {
  mount: function (opts) {
   opts = opts || {};
   if (opts.apiBase) state.apiBase = opts.apiBase;
   if (typeof opts.getToken === 'function') state.getToken = opts.getToken;
   if (opts.diagnosticEl) state.diagnosticEl = opts.diagnosticEl;
   if (opts.coachEl) state.coachEl = opts.coachEl;
   loadData();
  },
  refresh: function () { state.loadedToken = null; loadData(); },
  enable: function () { lsSet(OPTIN_KEY, '1'); renderAll(); },
  disable: function () { lsSet(OPTIN_KEY, '0'); renderAll(); },
  isOptedIn: isOptedIn
 };

 window.Key2MDCoach = Coach;
})();
