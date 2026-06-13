/**
 * mmi-feedback-render.js - Key2MD MMI Phase 1
 * Renders structured MMI AI feedback into the aiFeedbackWrapMMI element
 */

const MMIFeedbackRender = (() => {

 const SCORE_LABELS = { 1: 'Poor', 2: 'Unsatisfactory', 3: 'Satisfactory', 4: 'Good', 5: 'Excellent' };
 const SCORE_CLASSES = { 1: 'mmi-score-1', 2: 'mmi-score-2', 3: 'mmi-score-3', 4: 'mmi-score-4', 5: 'mmi-score-5' };
 const CRITERIA_LABELS = {
 empathy: 'Empathy',
 communication: 'Communication',
 reasoning: 'Reasoning',
 reflection: 'Reflection',
 real_world_awareness: 'Real-world Awareness',
 };
 const CRITERIA_KEYS = Object.keys(CRITERIA_LABELS);
 const CRITERIA_HELP = {
 empathy: 'Recognising emotion, vulnerability, and the human meaning of the station.',
 communication: 'Explaining ideas clearly under pressure without sounding scripted.',
 reasoning: 'Weighing competing duties and landing on a defensible action.',
 reflection: 'Showing self-awareness that would change future behaviour.',
 real_world_awareness: 'Understanding hierarchy, safety, confidentiality, and practical constraints.',
 };
 let analyticsState = { mount: null, points: [], selectedKey: 'overall' };
 const analyticsStates = new WeakMap();

 function isActiveAnalyticsState(state) {
 return !!(state?.mount && analyticsStates.get(state.mount) === state);
 }

 function esc(str) {
 return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 }

 function attr(str) {
 return esc(str).replace(/'/g,'&#39;');
 }

 function finiteScore(value) {
 const n = Number(value);
 return Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n * 10) / 10)) : null;
 }

 function average(values) {
 const nums = values.map(finiteScore).filter(Number.isFinite);
 return nums.length ? Math.round((nums.reduce((sum, n) => sum + n, 0) / nums.length) * 10) / 10 : null;
 }

 function scoreText(value) {
 const n = finiteScore(value);
 return Number.isFinite(n) ? n.toFixed(n % 1 ? 1 : 0) : '-';
 }

 function parseFeedback(raw) {
 if (!raw) return null;
 if (typeof raw === 'object') return raw;
 try { return JSON.parse(raw); } catch { return null; }
 }

 function criterionSnapshot(feedback, key) {
 const prompts = Array.isArray(feedback?.per_prompt) ? feedback.per_prompt : [];
 const scores = [];
 const comments = [];
 prompts.forEach(prompt => {
 const crit = prompt?.scores?.[key];
 const score = finiteScore(crit?.score);
 if (Number.isFinite(score)) scores.push(score);
 if (crit?.comment) comments.push(String(crit.comment));
 });
 return {
 score: average(scores),
 count: scores.length,
 comment: comments.find(Boolean) || '',
 };
 }

 function pointFromReview(row) {
 const feedback = parseFeedback(row?.ai_feedback_json || row?.feedback || row);
 if (!feedback) return null;
 const criteria = {};
 CRITERIA_KEYS.forEach(key => { criteria[key] = criterionSnapshot(feedback, key); });
 const overall = finiteScore(feedback?.overall?.score);
 return {
 id: String(row?.id || ''),
 created_at: row?.created_at || new Date().toISOString(),
 category: row?.station_category || row?.category || '',
 tier: row?.tier || '',
 feedback,
 overall,
 criteria,
 };
 }

 function pointFromCurrent(data, context) {
 const feedback = data?.feedback || data;
 if (!feedback) return null;
 return pointFromReview({
 id: data?.review_id || `current-${Date.now()}`,
 created_at: new Date().toISOString(),
 station_category: context?.stationCategory || '',
 tier: context?.tier || '',
 ai_feedback_json: feedback,
 });
 }

 function pointScore(point, key) {
 if (!point) return null;
 if (key === 'overall') return finiteScore(point.overall);
 return finiteScore(point.criteria?.[key]?.score);
 }

 function seriesFor(points, key) {
 return (points || [])
 .map((point, index) => ({ point, index, score: pointScore(point, key) }))
 .filter(item => Number.isFinite(item.score));
 }

 function trendDelta(series) {
 if (!series || series.length < 2) return null;
 if (series.length >= 4) {
 const recent = average(series.slice(-3).map(item => item.score));
 const earlier = average(series.slice(0, Math.max(1, series.length - 3)).map(item => item.score));
 return Number.isFinite(recent) && Number.isFinite(earlier) ? Math.round((recent - earlier) * 10) / 10 : null;
 }
 return Math.round((series[series.length - 1].score - series[series.length - 2].score) * 10) / 10;
 }

 function trendLabel(delta) {
 if (!Number.isFinite(delta)) return 'More data needed';
 if (delta >= 0.3) return `Improving +${delta.toFixed(1)}`;
 if (delta <= -0.3) return `Dropping ${delta.toFixed(1)}`;
 return 'Stable';
 }

 function trendClass(delta) {
 if (!Number.isFinite(delta)) return 'neutral';
 if (delta >= 0.3) return 'up';
 if (delta <= -0.3) return 'down';
 return 'neutral';
 }

 function shortDate(value) {
 const d = new Date(value);
 if (Number.isNaN(d.getTime())) return '';
 return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
 }

 function skillStats(points) {
 return CRITERIA_KEYS.map(key => {
 const series = seriesFor(points, key);
 const latest = series[series.length - 1];
 return {
 key,
 label: CRITERIA_LABELS[key],
 avg: average(series.map(item => item.score)),
 latest: latest?.score ?? null,
 count: series.length,
 delta: trendDelta(series),
 latestComment: latest?.point?.criteria?.[key]?.comment || '',
 };
 }).sort((a, b) => {
 const aScore = Number.isFinite(a.latest) ? a.latest : 99;
 const bScore = Number.isFinite(b.latest) ? b.latest : 99;
 return aScore - bScore;
 });
 }

 function renderLineChart(points, key) {
 const series = seriesFor(points, key);
 if (!series.length) {
 return '<div class="mmi-analytics-empty">No scored data for this skill yet.</div>';
 }
 const width = 560;
 const height = 170;
 const left = 34;
 const right = 20;
 const top = 18;
 const bottom = 32;
 const plotW = width - left - right;
 const plotH = height - top - bottom;
 const xFor = i => series.length === 1 ? left + plotW / 2 : left + (i / (series.length - 1)) * plotW;
 const yFor = score => top + ((5 - score) / 4) * plotH;
 const coords = series.map((item, i) => `${xFor(i).toFixed(1)},${yFor(item.score).toFixed(1)}`).join(' ');
 const pointsSvg = series.map((item, i) => {
 const x = xFor(i).toFixed(1);
 const y = yFor(item.score).toFixed(1);
 const date = shortDate(item.point.created_at);
 return `<circle class="mmi-chart-dot" cx="${x}" cy="${y}" r="4"><title>${esc(date)}: ${scoreText(item.score)}/5</title></circle>`;
 }).join('');
 const grid = [1,2,3,4,5].map(score => {
 const y = yFor(score).toFixed(1);
 return `<line class="mmi-chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line><text class="mmi-chart-axis" x="8" y="${Number(y) + 4}">${score}</text>`;
 }).join('');
 const first = shortDate(series[0].point.created_at);
 const last = shortDate(series[series.length - 1].point.created_at);
 return `
 <svg class="mmi-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(key === 'overall' ? 'Overall' : CRITERIA_LABELS[key])} score trend">
 ${grid}
 <polyline class="mmi-chart-line" points="${coords}"></polyline>
 ${pointsSvg}
 <text class="mmi-chart-date" x="${left}" y="${height - 8}">${esc(first)}</text>
 <text class="mmi-chart-date" x="${width - right}" y="${height - 8}" text-anchor="end">${esc(last)}</text>
 </svg>`;
 }

 function analyticsKpis(points) {
 const overall = seriesFor(points, 'overall');
 const recent = overall.slice(-3);
 const avg = average(overall.map(item => item.score));
 const recentAvg = average(recent.map(item => item.score));
 const delta = trendDelta(overall);
 return `
 <div class="mmi-analytics-kpis">
 <div class="mmi-analytics-kpi"><span>Reviews</span><strong>${overall.length}</strong></div>
 <div class="mmi-analytics-kpi"><span>Average</span><strong>${scoreText(avg)}/5</strong></div>
 <div class="mmi-analytics-kpi"><span>Recent 3</span><strong>${scoreText(recentAvg)}/5</strong></div>
 <div class="mmi-analytics-kpi ${trendClass(delta)}"><span>Trend</span><strong>${esc(trendLabel(delta))}</strong></div>
 </div>`;
 }

 function renderAnalytics(state = analyticsState) {
 const mount = state.mount;
 const points = state.points || [];
 if (!mount) return;
 if (!isActiveAnalyticsState(state)) return;
 if (!points.length) {
 mount.innerHTML = '<div class="mmi-analytics-card"><div class="mmi-analytics-empty">Complete a few MMI reviews and this becomes your skill tracker.</div></div>';
 return;
 }
 const stats = skillStats(points);
 const weakest = stats.find(s => Number.isFinite(s.latest)) || stats[0];
 if (!state.selectedKey || (state.selectedKey !== 'overall' && !CRITERIA_KEYS.includes(state.selectedKey))) {
 state.selectedKey = weakest?.key || 'overall';
 }
 const selectedKey = state.selectedKey;
 const selectedSeries = seriesFor(points, selectedKey);
 const selectedLatest = selectedSeries[selectedSeries.length - 1];
 const selectedDelta = trendDelta(selectedSeries);
 const selectedLabel = selectedKey === 'overall' ? 'Overall score' : CRITERIA_LABELS[selectedKey];
 const selectedHelp = selectedKey === 'overall'
 ? 'Your broad MMI performance signal across saved spoken reviews.'
 : CRITERIA_HELP[selectedKey];
 const latestComment = selectedKey === 'overall'
 ? selectedLatest?.point?.feedback?.overall?.biggest_improvement || selectedLatest?.point?.feedback?.overall?.biggest_strength || ''
 : selectedLatest?.point?.criteria?.[selectedKey]?.comment || '';

 const overallActive = selectedKey === 'overall' ? ' active' : '';
 const skillButtons = stats.map(stat => {
 const active = stat.key === selectedKey ? ' active' : '';
 const pct = Number.isFinite(stat.latest) ? Math.max(0, Math.min(100, (stat.latest / 5) * 100)) : 0;
 return `
 <button class="mmi-skill-card${active}" type="button" data-mmi-skill="${attr(stat.key)}">
 <div class="mmi-skill-card-top"><span>${esc(stat.label)}</span><strong>${scoreText(stat.latest)}/5</strong></div>
 <div class="mmi-skill-track"><span style="width:${pct}%"></span></div>
 <div class="mmi-skill-meta ${trendClass(stat.delta)}">${esc(trendLabel(stat.delta))} | ${stat.count} mark${stat.count === 1 ? '' : 's'}</div>
 </button>`;
 }).join('');

 mount.innerHTML = `
 <div class="mmi-analytics-card">
 <div class="mmi-analytics-head">
 <div>
 <div class="mmi-analytics-kicker">Progress analytics</div>
 <h3>MMI skills over time</h3>
 <p>Click a skill to see how that criterion is tracking across your saved MMI markings.</p>
 </div>
 <button class="mmi-skill-card mmi-overall-skill${overallActive}" type="button" data-mmi-skill="overall">
 <div class="mmi-skill-card-top"><span>Overall</span><strong>${scoreText(pointScore(points[points.length - 1], 'overall'))}/5</strong></div>
 <div class="mmi-skill-meta ${trendClass(trendDelta(seriesFor(points, 'overall')))}">${esc(trendLabel(trendDelta(seriesFor(points, 'overall'))))}</div>
 </button>
 </div>
 ${analyticsKpis(points)}
 <div class="mmi-skill-grid">${skillButtons}</div>
 <div class="mmi-chart-panel">
 <div class="mmi-chart-copy">
 <div class="mmi-chart-title">${esc(selectedLabel)}</div>
 <div class="mmi-chart-sub">${esc(selectedHelp)}</div>
 </div>
 ${renderLineChart(points, selectedKey)}
 <div class="mmi-chart-readout">
 <span class="${trendClass(selectedDelta)}">${esc(trendLabel(selectedDelta))}</span>
 ${selectedLatest ? `<span>Latest: ${scoreText(selectedLatest.score)}/5 on ${esc(shortDate(selectedLatest.point.created_at))}</span>` : ''}
 </div>
 ${latestComment ? `<div class="mmi-selected-comment"><strong>Latest note:</strong> ${esc(latestComment)}</div>` : ''}
 </div>
 </div>`;

 mount.querySelectorAll('[data-mmi-skill]').forEach(button => {
 button.addEventListener('click', event => {
 event.preventDefault();
 event.stopPropagation();
 state.selectedKey = button.getAttribute('data-mmi-skill') || 'overall';
 analyticsState = state;
 renderAnalytics(state);
 });
 });
 }

 function authToken() {
 try {
 return (window.Key2MDAuth?.getToken?.() || localStorage.getItem('key2md_token') || '').trim();
 } catch {
 return '';
 }
 }

 function apiBase() {
 return window.API_BASE || 'https://key2md-api.brittainmbbs.workers.dev';
 }

 async function hydrateAnalytics(container, data, context) {
 const mount = container?.querySelector?.('#mmiAnalyticsMount');
 if (!mount) return;
 const state = { mount, points: [], selectedKey: '' };
 analyticsState = state;
 analyticsStates.set(mount, state);
 mount.innerHTML = '<div class="mmi-analytics-card"><div class="mmi-analytics-loading">Loading your MMI trend history...</div></div>';
 const current = pointFromCurrent(data, context);
 const token = authToken();
 if (!token) {
 state.points = current ? [current] : [];
 renderAnalytics(state);
 return;
 }
 try {
 const res = await fetch(`${apiBase()}/api/mmi/reviews?limit=50&source=mmi`, { headers: { Authorization: `Bearer ${token}` } });
 const payload = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(payload.message || payload.error || 'Could not load MMI history');
 if (!isActiveAnalyticsState(state)) return;
 const map = new Map();
 (payload.reviews || []).map(pointFromReview).filter(Boolean).forEach(point => map.set(point.id || point.created_at, point));
 if (current) map.set(current.id || current.created_at, current);
 state.points = Array.from(map.values()).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
 renderAnalytics(state);
 } catch (err) {
 if (!isActiveAnalyticsState(state)) return;
 state.points = current ? [current] : [];
 renderAnalytics(state);
 const note = document.createElement('div');
 note.className = 'mmi-analytics-history-note';
 note.textContent = 'History could not load, so this is showing the latest station only.';
 mount.querySelector('.mmi-analytics-card')?.appendChild(note);
 }
 }

 function scoreBar(score) {
 const pips = [1,2,3,4,5].map(n =>
 `<div class="mmi-score-pip ${n <= score ? SCORE_CLASSES[score] + '-pip' : 'mmi-score-pip-empty'}"></div>`
 ).join('');
 return `<div class="mmi-score-pips">${pips}</div>`;
 }

 function renderCriteriaRow(key, crit) {
 const label = CRITERIA_LABELS[key] || key;
 const score = crit.score || 3;
 const lbl = crit.label || SCORE_LABELS[score] || '';
 const cls = SCORE_CLASSES[score] || 'mmi-score-3';
 return `
 <div class="mmi-criterion-row">
 <div class="mmi-criterion-left">
 <span class="mmi-criterion-name">${esc(label)}</span>
 <span class="mmi-score-badge ${cls}">${esc(lbl)}</span>
 </div>
 ${scoreBar(score)}
 <div class="mmi-criterion-comment">${esc(crit.comment || '')}</div>
 </div>`;
 }

 function renderVoiceMetrics(voice) {
 if (!voice) return '';
 const pace = voice.pace_wpm || 0;
 const paceNote = pace > 200 ? 'Faster than average - may signal nerves'
 : pace < 100 ? 'Slower than average - thoughtful or hesitant'
 : 'Natural conversational pace';
 const fillerPct = voice.filler_density_pct || 0;
 const fillerNote = fillerPct > 8
 ? `${fillerPct}% - slightly above average, but examiners do not mark fillers`
 : `${fillerPct}% - well within normal range`;
 const pauseAvg = voice.avg_pause_seconds || 0;
 const pauseNote = pauseAvg > 2
 ? 'Longer pauses - often a sign of genuine thought'
 : 'Short, natural pauses';

 return `
 <details class="mmi-premium-section">
 <summary class="mmi-premium-summary">
 <span class="mmi-premium-summary-icon"></span>
 <span>Voice &amp; Pacing</span>
 <span class="mmi-premium-badge">Premium</span>
 <span class="mmi-premium-chevron">v</span>
 </summary>
 <div class="mmi-premium-body">
 <div class="mmi-voice-grid">
 <div class="mmi-voice-stat">
 <div class="mmi-voice-val">${pace}</div>
 <div class="mmi-voice-lbl">Words/min</div>
 <div class="mmi-voice-note">${esc(paceNote)}</div>
 </div>
 <div class="mmi-voice-stat">
 <div class="mmi-voice-val">${voice.word_count || 0}</div>
 <div class="mmi-voice-lbl">Total words</div>
 <div class="mmi-voice-note">${voice.filler_count || 0} filler words</div>
 </div>
 <div class="mmi-voice-stat">
 <div class="mmi-voice-val">${voice.pause_count || 0}</div>
 <div class="mmi-voice-lbl">Meaningful pauses</div>
 <div class="mmi-voice-note">${esc(pauseNote)}</div>
 </div>
 <div class="mmi-voice-stat">
 <div class="mmi-voice-val">${fillerPct}%</div>
 <div class="mmi-voice-lbl">Filler density</div>
 <div class="mmi-voice-note">${esc(fillerNote)}</div>
 </div>
 </div>
 ${voice.pace_trend ? `<div class="mmi-voice-trend">${esc(voice.pace_trend)}</div>` : ''}
 <div class="mmi-premium-caveat">Filler words (um, uh, like) are tracked for your awareness only - MMI examiners do not mark them down. Pauses are often positive signals of genuine thought.</div>
 </div>
 </details>`;
 }

 function renderPresentationMetrics(visual) {
 if (!visual) return '';
 const eyeMap = { consistent: 'OK Consistent', mostly: ' Mostly consistent', inconsistent: 'Warning Inconsistent', rare: 'x Rare' };
 const postureMap = { engaged: 'OK Engaged', neutral: '- Neutral', withdrawn: 'Warning Withdrawn' };
 const composureMap = { engaged: 'OK Engaged', neutral: '- Neutral', performative: 'Warning Performative', disengaged: 'x Disengaged' };

 const distractions = Array.isArray(visual.distractions) && visual.distractions.length
 ? `<div class="mmi-visual-row"><span class="mmi-visual-label">Distractions</span><span class="mmi-visual-val">${visual.distractions.map(d => esc(d)).join(', ')}</span></div>`
 : '';

 return `
 <details class="mmi-premium-section">
 <summary class="mmi-premium-summary">
 <span class="mmi-premium-summary-icon"></span>
 <span>Presentation Analysis</span>
 <span class="mmi-premium-badge">Premium</span>
 <span class="mmi-premium-chevron">v</span>
 </summary>
 <div class="mmi-premium-body">
 <div class="mmi-visual-grid">
 <div class="mmi-visual-row"><span class="mmi-visual-label">Eye contact</span><span class="mmi-visual-val">${eyeMap[visual.eye_contact] || esc(visual.eye_contact || '-')}</span></div>
 <div class="mmi-visual-row"><span class="mmi-visual-label">Posture</span><span class="mmi-visual-val">${postureMap[visual.posture] || esc(visual.posture || '-')}</span></div>
 <div class="mmi-visual-row"><span class="mmi-visual-label">Composure</span><span class="mmi-visual-val">${composureMap[visual.composure] || esc(visual.composure || '-')}</span></div>
 ${distractions}
 </div>
 ${visual.summary ? `<div class="mmi-visual-summary">${esc(visual.summary)}</div>` : ''}
 <div class="mmi-premium-caveat">Examiners weight substance over polish. Strong content with imperfect eye contact still scores well. This section is informational - it does not change your criterion scores.</div>
 </div>
 </details>`;
 }


 function renderPromptCard(pp, index) {
 const criteria = ['empathy','communication','reasoning','reflection','real_world_awareness'];
 const criteriaRows = criteria.map(k => {
 const crit = pp.scores?.[k];
 if (!crit) return '';
 return renderCriteriaRow(k, crit);
 }).join('');

 const avgScore = criteria.reduce((sum, k) => sum + (pp.scores?.[k]?.score || 3), 0) / criteria.length;
 const avgCls = SCORE_CLASSES[Math.round(avgScore)] || 'mmi-score-3';

 return `
 <div class="mmi-prompt-card">
 <div class="mmi-prompt-header">
 <span class="mmi-prompt-num">Prompt ${index + 1}</span>
 <span class="mmi-score-badge ${avgCls}">${SCORE_LABELS[Math.round(avgScore)] || ''}</span>
 </div>
 <div class="mmi-prompt-text">"${esc(pp.prompt_text || '')}"</div>
 <div class="mmi-criteria-grid">
 ${criteriaRows}
 </div>
 ${pp.specific_quote ? `<div class="mmi-prompt-quote">"${esc(pp.specific_quote)}"</div>` : ''}
 <div class="mmi-prompt-summary">${esc(pp.summary || '')}</div>
 </div>`;
 }

 function computeCriterionAverages(feedback) {
 const criteria = ['empathy','communication','reasoning','reflection','real_world_awareness'];
 const sums = {}, counts = {};
 for (const pp of (feedback?.per_prompt || [])) {
  for (const key of criteria) {
   const s = pp?.criteria?.[key]?.score;
   if (typeof s === 'number') { sums[key] = (sums[key]||0)+s; counts[key]=(counts[key]||0)+1; }
  }
 }
 const avgs = {};
 for (const key of criteria) if (counts[key]) avgs[key] = Math.round((sums[key]/counts[key])*10)/10;
 return avgs;
 }

 function renderDeltaSection(feedback, prevFeedback) {
 const cur = computeCriterionAverages(feedback);
 const prev = computeCriterionAverages(prevFeedback);
 const curOverall = feedback?.overall?.score || null;
 const prevOverall = prevFeedback?.overall?.score || null;
 const criteria = ['empathy','communication','reasoning','reflection','real_world_awareness'];
 const rows = criteria.map(key => {
  const c = cur[key], p = prev[key];
  if (!Number.isFinite(c) || !Number.isFinite(p)) return '';
  const d = Math.round((c - p) * 10) / 10;
  const sign = d > 0 ? '+' : '';
  const cls = d > 0 ? 'delta-up' : d < 0 ? 'delta-down' : 'delta-same';
  return `<div class="mmi-delta-row"><span class="mmi-delta-label">${esc(CRITERIA_LABELS[key])}</span><span class="mmi-delta-prev">${p}/5</span><span class="mmi-delta-arrow">-></span><span class="mmi-delta-now">${c}/5</span><span class="mmi-delta-badge ${cls}">${sign}${d}</span></div>`;
 }).filter(Boolean);
 if (!rows.length) return '';
 const overallDelta = (typeof curOverall === 'number' && typeof prevOverall === 'number')
  ? (() => { const d = curOverall - prevOverall; const s = d>0?'+':''; const cls=d>0?'delta-up':d<0?'delta-down':'delta-same'; return `<span class="mmi-delta-overall-badge ${cls}">${s}${d} overall</span>`; })()
  : '';
 return `<div class="mmi-delta-section"><div class="mmi-delta-title">Change from previous attempt ${overallDelta}</div><div class="mmi-delta-rows">${rows.join('')}</div></div>`;
 }

 function renderPredictionSection(feedback, predictedScores, calibrationStreak) {
 if (!predictedScores || !feedback) return '';
 const criteria = ['empathy','communication','reasoning','reflection','real_world_awareness'];
 const actual = computeCriterionAverages(feedback);
 let allClose = true;
 const rows = criteria.map(key => {
  const pred = predictedScores[key], act = actual[key];
  if (!Number.isFinite(pred) || !Number.isFinite(act)) return '';
  const diff = Math.round((act - pred) * 10) / 10;
  const sign = diff > 0 ? '+' : '';
  const cls = Math.abs(diff) <= 1 ? 'pred-close' : 'pred-off';
  if (Math.abs(diff) > 1) allClose = false;
  return `<div class="mmi-pred-row"><span class="mmi-pred-label">${esc(CRITERIA_LABELS[key])}</span><span class="mmi-pred-you">you: ${pred}</span><span class="mmi-pred-ai">AI: ${act.toFixed(1)}</span><span class="mmi-pred-diff ${cls}">${sign}${diff}</span></div>`;
 }).filter(Boolean);
 if (!rows.length) return '';
 const streakHtml = calibrationStreak > 1 ? `<span class="mmi-pred-streak">${calibrationStreak} in a row within 1 point</span>` : '';
 const overallMsg = allClose ? 'Good self-awareness this station.' : 'Check where your perception differs from the AI.';
 return `<div class="mmi-prediction-section"><div class="mmi-pred-title">Your predictions vs AI scores ${streakHtml}</div><div class="mmi-pred-rows">${rows.join('')}</div><div class="mmi-pred-note">${overallMsg}</div></div>`;
 }

 function renderHighlights(feedback) {
 const hs = Array.isArray(feedback && feedback.transcript_highlights) ? feedback.transcript_highlights.filter(h => h && h.quote) : [];
 if (!hs.length) return '';
 const items = hs.slice(0, 8).map(h => {
 const gap = h.valence === 'gap';
 const col = gap ? '#d97706' : '#16a34a';
 const bg = gap ? 'rgba(245,158,11,0.08)' : 'rgba(22,163,74,0.08)';
 const critLbl = CRITERIA_LABELS[h.criterion] || (h.criterion ? String(h.criterion).replace(/_/g, ' ') : '');
 return '<div style="border-left:3px solid ' + col + ';background:' + bg + ';padding:8px 10px;border-radius:6px;margin-bottom:8px;">'
 + '<div style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:' + col + ';">' + (gap ? 'Slipped' : 'Landed') + (critLbl ? ' &middot; ' + esc(critLbl) : '') + '</div>'
 + '<div style="font-style:italic;margin:3px 0;color:#33414f;">&ldquo;' + esc(h.quote) + '&rdquo;</div>'
 + (h.note ? '<div style="font-size:0.85rem;color:#5b6b82;">' + esc(h.note) + '</div>' : '')
 + '</div>';
 }).join('');
 return '<div style="margin:14px 0;padding:14px 16px;border:1px solid #e6ebf2;border-radius:12px;background:#fff;">'
 + '<div style="font-weight:800;font-size:0.95rem;margin-bottom:8px;">Your words, mapped to the criteria</div>'
 + items + '</div>';
 }

 function render(container, data, context) {
 clearLoadingTimers();
 // context: { tier, specialistMode, stationCategory, durationSec, previousFeedback, predictedScores, calibrationStreak }
 if (!container || !data) return;

 const feedback = data.feedback || data;
 const tier = context?.tier || 'transcript';
 const specialistMode = context?.specialistMode || false;
 const category = context?.stationCategory || '';
 const duration = context?.durationSec || 0;
 const specialistBadge = specialistMode
 ? '<span class="mmi-specialist-badge">Specialist Mode</span>'
 : '<span class="mmi-medschool-badge">Med School</span>';

 const overall = feedback.overall || {};
 const overallScore = overall.score || 3;
 const overallCls = SCORE_CLASSES[overallScore] || 'mmi-score-3';
 const overallLbl = overall.label || SCORE_LABELS[overallScore] || '';

 const durationStr = duration > 0
 ? `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`
 : '';

 const promptCards = (feedback.per_prompt || []).map((pp, i) => renderPromptCard(pp, i)).join('');

 // Premium sections
 const voiceSection = (tier === 'premium' && data.voice_metrics)
 ? renderVoiceMetrics(data.voice_metrics) : '';
 const visualSection = (tier === 'premium' && data.visual_metrics)
 ? renderPresentationMetrics(data.visual_metrics) : '';

 const auditorFlag = feedback.polished_auditor_detected ? `
 <div class="mmi-flag mmi-flag-auditor">
 <div class="mmi-flag-title">Polished Auditor Trap detected</div>
 <div class="mmi-flag-body">${esc(feedback.polished_auditor_explanation || '')}</div>
 </div>` : '';

 const deltaSection = context?.previousFeedback ? renderDeltaSection(feedback, context.previousFeedback) : '';
 const predictionSection = context?.predictedScores ? renderPredictionSection(feedback, context.predictedScores, context.calibrationStreak || 0) : '';
 const highlightsSection = renderHighlights(feedback);

 const html = `
 <div class="mmi-feedback" id="mmiFeedbackBlock">

 <div class="mmi-feedback-header">
 <div class="mmi-overall-badge ${overallCls}">${esc(overallLbl)}</div>
 <div class="mmi-overall-meta">
 ${esc(category)}${durationStr ? ' | ' + esc(durationStr) : ''} | ${specialistBadge}
 </div>
 </div>

 ${auditorFlag}
 ${deltaSection}
 ${predictionSection}

 <div id="mmiAnalyticsMount"></div>

 <div class="mmi-prompts-block">
 ${promptCards}
 </div>

 ${voiceSection}
 ${visualSection}

 <div class="mmi-overall-summary">
 <div class="mmi-summary-section">
 <div class="mmi-summary-label"> Biggest Strength</div>
 <div class="mmi-summary-text">${esc(overall.biggest_strength || '')}</div>
 </div>
 <div class="mmi-summary-section">
 <div class="mmi-summary-label"> Biggest Improvement</div>
 <div class="mmi-summary-text">${esc(overall.biggest_improvement || '')}</div>
 </div>
 <div class="mmi-summary-section mmi-summary-q5">
 <div class="mmi-summary-label">* What an "Excellent" response would have included</div>
 <div class="mmi-summary-text">${esc(overall.excellent_version || '')}</div>
 </div>
 </div>

 ${highlightsSection}

 <div class="mmi-limitations">
 <strong>About this feedback</strong><br>
 This AI feedback is calibrated to the rubric Dan uses with his coaching students - empathy, communication, reasoning, reflection, and real-world awareness. It is designed to complement, not replace, human review.<br><br>
 The AI is good at: structural feedback, identifying the Polished Auditor trap, spotting reflection without consequence, flagging textbook answers, and benchmarking your response against Dan's rubric.<br><br>
 The AI is less good at: subtle interpersonal nuance, the kind of judgement only experienced examiners bring, and the emotional weight of how something landed in the room.
 </div>

 ${data.review_id ? `<div class="mmi-probe-wrap" id="mmiProbeWrap">
  <button class="btn-probe-trigger" id="mmiProbeTrigger">Get a follow-up question an examiner would actually ask -></button>
  <div class="mmi-probe-panel" id="mmiProbePanel" style="display:none"></div>
 </div>` : ''}

 <div class="dan-marking-card">
 <div class="dan-marking-left">
 <div class="dan-marking-eyebrow">Want a human eye on this?</div>
 <div class="dan-marking-title">Get this station marked by Dan</div>
 <div class="dan-marking-sub">Same rubric, applied by the person who built it. 48-72hr turnaround.</div>
 </div>
 <div class="dan-marking-right">
 <div class="dan-marking-price">${specialistMode ? '$75' : '$60'}</div>
 <button class="btn-dan-marking" onclick="openEnquiry('MMI Marking')">Submit to Dan -></button>
 </div>
 </div>

 </div>`;

 container.innerHTML = html;
 window._lastMMIFeedback = feedback;
 window._lastMMIReviewId = data.review_id || null;
 hydrateAnalytics(container, data, context);
 if (data.review_id) hydrateProbe(container, data.review_id);
 container.scrollIntoView({ behavior: 'smooth', block: 'start' });
 }

 function renderLoading(container, tier, opts) {
 if (!container) return;
 clearLoadingTimers();
 const isPremium = tier === 'premium';
 container.innerHTML = `
 <div class="mmi-loading">
 <div class="mmi-loading-spinner"></div>
 <div class="mmi-loading-text" id="mmiLoadingText">${isPremium ? 'Preparing your premium analysis...' : 'Transcribing and analysing your response...'}</div>
 <div class="mmi-loading-sub" id="mmiLoadingSub">${isPremium ? 'This usually takes 20-40 seconds. Please keep this tab open.' : 'This usually takes 15-30 seconds.'}</div>
 ${isPremium ? '<div class="mmi-loading-steps" id="mmiLoadingSteps"><span class="mmi-step active"> Transcribing</span><span class="mmi-step"> Analysing voice</span><span class="mmi-step"> Reviewing presentation</span><span class="mmi-step"> Generating feedback</span></div>' : ''}
 </div>`;
 if (isPremium && !opts?.useSSE) startLinearLoadingSteps();
 }

 function updateLoadingStage(container, stage) {
 if (!container) return;
 const text = document.getElementById('mmiLoadingText');
 const sub = document.getElementById('mmiLoadingSub');
 const steps = container.querySelectorAll('.mmi-step');
 const isPremium = steps.length > 0;
 if (stage === 'uploaded') {
  if (text) text.textContent = isPremium ? 'Transcribing and analysing your response...' : 'Transcribing your response...';
  if (isPremium) steps.forEach((s, i) => s.classList.toggle('active', i === 0));
 } else if (stage === 'marking') {
  if (text) text.textContent = 'Writing your feedback...';
  if (isPremium) steps.forEach((s, i) => s.classList.toggle('active', i <= 3));
 } else if (stage === 'still_working') {
  if (text) text.textContent = 'Still working on the final feedback...';
  if (sub) sub.textContent = 'Longer recordings can take a little extra time. Nothing has gone wrong.';
 }
 }

 function clearLoadingTimers() {
 if (window._mmiLoadingInterval) {
 clearInterval(window._mmiLoadingInterval);
 window._mmiLoadingInterval = null;
 }
 if (Array.isArray(window._mmiLoadingTimers)) {
 window._mmiLoadingTimers.forEach(clearTimeout);
 window._mmiLoadingTimers = [];
 }
 }

 function startLinearLoadingSteps() {
 const steps = document.querySelectorAll('.mmi-step');
 if (!steps.length) return;
 const text = document.getElementById('mmiLoadingText');
 const sub = document.getElementById('mmiLoadingSub');
 const phases = [
 { at: 0, index: 0, text: 'Transcribing your response...' },
 { at: 7000, index: 1, text: 'Analysing voice and pacing...' },
 { at: 15000, index: 2, text: 'Reviewing presentation signals...' },
 { at: 24000, index: 3, text: 'Writing your feedback...' },
 { at: 42000, index: 3, text: 'Still working on the final feedback...', sub: 'Longer recordings can take a little extra time. Nothing has gone wrong.' },
 ];
 window._mmiLoadingTimers = phases.map(phase => setTimeout(() => {
 steps.forEach((step, i) => step.classList.toggle('active', i <= phase.index));
 if (text) text.textContent = phase.text;
 if (phase.sub && sub) sub.textContent = phase.sub;
 }, phase.at));
 }

 function renderError(container, error) {
 if (!container) return;
 clearLoadingTimers();
 const isCredits = error.code === 'payment_required' || error.code === 'no_credits';
 const isLimit = error.code === 'daily_limit_reached';

 let actionHtml = '';
 if (isCredits || isLimit) {
 actionHtml = `<a href="plans.html#mmi-section" class="btn-mmi-error-action">Get MMI Credits -></a>`;
 }

 container.innerHTML = `
 <div class="mmi-error-block">
 <div class="mmi-error-icon">${isCredits || isLimit ? '' : 'Warning'}</div>
 <div class="mmi-error-msg">${esc(error.message || 'Something went wrong. Please try again.')}</div>
 ${actionHtml}
 </div>`;
 }

 function clear(container) {
 clearLoadingTimers();
 if (container) container.innerHTML = '';
 }

 function hydrateProbe(container, reviewId) {
 const triggerBtn = container.querySelector('#mmiProbeTrigger');
 const panel = container.querySelector('#mmiProbePanel');
 if (!triggerBtn || !panel) return;

 let probeState = 'idle';
 let mediaRec = null, audioChunks = [], probeBlob = null, probeQuestion = '';
 let timerInterval = null, elapsed = 0;
 const MAX_SEC = 90;

 function setPanel(html) { panel.innerHTML = html; panel.style.display = html ? '' : 'none'; }
 function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

 function showQuestion(q) {
  probeQuestion = q;
  setPanel(`<div class="mmi-probe-question">${esc(q)}</div>
  <p class="mmi-probe-instructions">Record a 60-90 second reply. Press Start when ready.</p>
  <div class="mmi-probe-controls"><button class="btn-probe-record" id="probeRecordBtn">Start recording</button></div>`);
  container.querySelector('#probeRecordBtn').addEventListener('click', startRec);
 }

 async function startRec() {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { setPanel(`<div class="mmi-probe-question">${esc(probeQuestion)}</div><div class="mmi-probe-error">Microphone access denied. Please allow microphone access and try again.</div>`); return; }
  audioChunks = []; probeBlob = null; elapsed = 0;
  const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  mediaRec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  mediaRec.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRec.onstop = () => {
   stream.getTracks().forEach(t => t.stop());
   probeBlob = new Blob(audioChunks, { type: mime || 'audio/webm' });
   clearInterval(timerInterval);
   setPanel(`<div class="mmi-probe-question">${esc(probeQuestion)}</div>
   <p class="mmi-probe-ready">Recording complete (${fmt(elapsed)}). Submit when ready.</p>
   <div class="mmi-probe-controls">
    <button class="btn-probe-submit" id="probeSubmitBtn">Submit reply -></button>
    <button class="btn-probe-retry" id="probeRetryBtn">Re-record</button>
   </div>`);
   container.querySelector('#probeSubmitBtn').addEventListener('click', submitProbe);
   container.querySelector('#probeRetryBtn').addEventListener('click', () => showQuestion(probeQuestion));
  };
  mediaRec.start(250);
  probeState = 'recording';
  setPanel(`<div class="mmi-probe-question">${esc(probeQuestion)}</div>
  <div class="mmi-probe-timer" id="probeTimer">${fmt(0)} / ${fmt(MAX_SEC)}</div>
  <button class="btn-probe-stop" id="probeStopBtn">Stop recording</button>`);
  container.querySelector('#probeStopBtn').addEventListener('click', stopRec);
  timerInterval = setInterval(() => {
   elapsed++;
   const el = container.querySelector('#probeTimer');
   if (el) el.textContent = `${fmt(elapsed)} / ${fmt(MAX_SEC)}`;
   if (elapsed >= MAX_SEC) stopRec();
  }, 1000);
 }

 function stopRec() {
  clearInterval(timerInterval);
  if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
 }

 async function submitProbe() {
  probeState = 'uploading';
  setPanel('<div class="mmi-probe-loading">Transcribing and marking your reply...</div>');
  const ext = (probeBlob.type || '').includes('mp4') ? 'mp4' : (probeBlob.type || '').includes('ogg') ? 'ogg' : 'webm';
  const fd = new FormData();
  fd.append('audio', probeBlob, `probe.${ext}`);
  fd.append('review_id', reviewId);
  fd.append('question', probeQuestion);
  try {
   const res = await fetch(`${apiBase()}/api/mmi/probe-mark`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken()}` },
    body: fd,
   });
   const payload = await res.json().catch(() => ({}));
   if (!res.ok) throw new Error(payload.message || payload.error || 'Marking failed');
   probeState = 'done';
   const vtext = { yes: 'Weakness repaired', partly: 'Partial improvement', no: 'Weakness persists' }[payload.verdict] || '';
   const vcls = { yes: 'probe-verdict-yes', partly: 'probe-verdict-partly', no: 'probe-verdict-no' }[payload.verdict] || '';
   triggerBtn.style.display = 'none';
   setPanel(`<div class="mmi-probe-question">${esc(probeQuestion)}</div>
   <div class="mmi-probe-result">
    <div class="probe-verdict ${vcls}">${esc(vtext)}</div>
    <div class="probe-summary">${esc(payload.summary || '')}</div>
   </div>`);
  } catch (err) {
   probeState = 'question';
   setPanel(`<div class="mmi-probe-question">${esc(probeQuestion)}</div>
   <div class="mmi-probe-error">${esc(err.message || 'Something went wrong.')} <button class="btn-probe-retry-submit" id="probeRetrySubmit">Try again</button></div>`);
   container.querySelector('#probeRetrySubmit')?.addEventListener('click', submitProbe);
  }
 }

 triggerBtn.addEventListener('click', async () => {
  if (probeState !== 'idle') return;
  probeState = 'loading';
  triggerBtn.style.display = 'none';
  panel.style.display = '';
  setPanel('<div class="mmi-probe-loading">Generating your follow-up question...</div>');
  try {
   const res = await fetch(`${apiBase()}/api/mmi/probe-generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_id: reviewId }),
   });
   const payload = await res.json().catch(() => ({}));
   if (!res.ok) throw new Error(payload.message || payload.error || 'Could not generate question');
   probeState = 'question';
   showQuestion(payload.question);
  } catch {
   probeState = 'idle';
   triggerBtn.style.display = '';
   panel.style.display = 'none';
  }
 });
 }

 return { render, renderLoading, updateLoadingStage, renderError, clear, selectSkill: key => { analyticsState.selectedKey = key || 'overall'; renderAnalytics(analyticsState); } };

})();
