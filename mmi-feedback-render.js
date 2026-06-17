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
 ? selectedLatest?.point?.feedback?.overall?.biggest_change || selectedLatest?.point?.feedback?.overall?.biggest_improvement || selectedLatest?.point?.feedback?.overall?.biggest_strength || ''
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

 function deliveryGauge(value, min, max, zoneLo, zoneHi) {
 const clamp = v => Math.max(min, Math.min(max, v));
 const pct = v => ((clamp(v) - min) / (max - min)) * 100;
 const zoneLeft = pct(zoneLo);
 const zoneWidth = Math.max(0, pct(zoneHi) - pct(zoneLo));
 const markLeft = pct(value);
 return `<div class="mmi-gauge"><div class="mmi-gauge-track"><span class="mmi-gauge-zone" style="left:${zoneLeft.toFixed(1)}%;width:${zoneWidth.toFixed(1)}%"></span><span class="mmi-gauge-marker" style="left:${markLeft.toFixed(1)}%"></span></div></div>`;
 }

 function renderVoiceMetrics(voice) {
 if (!voice) return '';
 const pace = voice.pace_wpm || 0;
 const paceRating = (pace >= 120 && pace <= 165) ? 'good' : (pace > 185 || pace < 95) ? 'low' : 'mid';
 const paceNote = pace > 185 ? 'Faster than the comfortable range - ease off so the examiner can absorb each point.'
 : pace < 95 ? 'On the slower side - a little thinking time is good, but keep momentum so you finish your point.'
 : (pace >= 120 && pace <= 165) ? 'Right in the natural conversational range. This reads as composed.'
 : 'Close to the natural range - only small adjustments needed.';
 const fillerPct = voice.filler_density_pct || 0;
 const fillerRating = fillerPct <= 6 ? 'good' : fillerPct <= 10 ? 'mid' : 'low';
 const fillerNote = fillerPct <= 6 ? 'Clean delivery with very few fillers.'
 : fillerPct <= 10 ? 'A few fillers crept in. Examiners do not mark them, but trimming them adds polish.'
 : 'Fillers were frequent - usually a sign of speaking a little ahead of your thinking. A short silent pause beats an "um".';
 const longest = voice.longest_pause_seconds || 0;
 const pitchLabel = voice.pitch_label || '';
 const pitchVar = typeof voice.pitch_variation_st === 'number' ? voice.pitch_variation_st : null;
 const pitchRating = pitchLabel === 'flat' ? 'low' : pitchLabel ? 'good' : 'mid';
 const pitchWord = pitchLabel === 'flat' ? 'On the flat side' : pitchLabel === 'expressive' ? 'Expressive' : pitchLabel === 'natural' ? 'Natural range' : '';
 const pitchNote = pitchLabel === 'flat' ? 'Your pitch stayed fairly level, which can read as flat or a little nervous. Letting it rise and fall - especially on the parts you genuinely care about - sounds warmer and more present.'
  : pitchLabel === 'expressive' ? 'Lots of natural pitch movement - this reads as animated and engaged. Keep it real so it never tips into performed.'
  : pitchLabel === 'natural' ? 'Your pitch moved naturally as you spoke, which reads as warm and genuine.'
  : '';
 const tips = [];
 if (pace > 185) tips.push('Slow down: aim for roughly 130-160 words per minute so each point lands.');
 if (pace < 95) tips.push('Lift your pace slightly so every prompt gets a complete answer within the time.');
 if (fillerPct > 10) tips.push('Swap fillers for a brief silent pause - it reads as considered, not hesitant.');
 if (longest > 4) tips.push(`Your longest pause was ${longest}s - fine for thinking, but narrate it ("let me think about that for a second") so it does not read as freezing.`);
 if (pitchLabel === 'flat') tips.push('Let your pitch rise and fall a little more - flat, level delivery can read as nervous or disengaged even when the content is strong. Lean into the moments you actually care about.');
 let esl = false; try { esl = localStorage.getItem('k2_esl') === '1'; } catch (e) {}
 if (esl) tips.push('Clarity over speed: shorter sentences with clear endings help a listener follow you. Your accent and phrasing are never marked down.');
 if (!tips.length) tips.push('Your delivery sits in a strong range. Hold this pace and clarity under interview pressure.');

 const full = !voice.basic;
 return `
 <div class="mmi-delivery-card">
 <div class="mmi-delivery-head">
 <div>
 <div class="mmi-delivery-kicker">Delivery</div>
 <h3 class="mmi-delivery-title">How you came across</h3>
 </div>
 <span class="mmi-delivery-tag">Coaching only</span>
 </div>
 <p class="mmi-delivery-sub">Measured from your recording. Examiners score substance, not polish - this panel is here to help you sound like your most composed self.</p>
 <div class="mmi-delivery-metric">
 <div class="mmi-delivery-metric-top"><span>Speaking pace</span><strong class="rate-${paceRating}">${pace} wpm</strong></div>
 ${deliveryGauge(pace, 60, 220, 120, 160)}
 <div class="mmi-delivery-note">${esc(paceNote)} <span class="mmi-delivery-target">Target 120-160 wpm</span></div>
 </div>
 ${full ? `
 <div class="mmi-delivery-metric">
 <div class="mmi-delivery-metric-top"><span>Filler density</span><strong class="rate-${fillerRating}">${fillerPct}%</strong></div>
 ${deliveryGauge(fillerPct, 0, 18, 0, 6)}
 <div class="mmi-delivery-note">${esc(fillerNote)} <span class="mmi-delivery-target">${voice.filler_count || 0} filler word${(voice.filler_count || 0) === 1 ? '' : 's'} of ${voice.word_count || 0}</span></div>
 </div>
 ${pitchLabel ? `
 <div class="mmi-delivery-metric">
 <div class="mmi-delivery-metric-top"><span>Vocal variation</span><strong class="rate-${pitchRating}">${esc(pitchWord)}</strong></div>
 ${deliveryGauge(pitchVar || 0, 0, 8, 2, 6)}
 <div class="mmi-delivery-note">${esc(pitchNote)}${pitchVar != null ? ` <span class="mmi-delivery-target">${pitchVar} semitones of pitch movement</span>` : ''}</div>
 </div>` : ''}
 <div class="mmi-delivery-grid">
 <div class="mmi-delivery-stat"><div class="mmi-delivery-val">${voice.word_count || 0}</div><div class="mmi-delivery-lbl">Words spoken</div></div>
 <div class="mmi-delivery-stat"><div class="mmi-delivery-val">${voice.pause_count || 0}</div><div class="mmi-delivery-lbl">Thinking pauses</div></div>
 <div class="mmi-delivery-stat"><div class="mmi-delivery-val">${longest ? longest + 's' : '-'}</div><div class="mmi-delivery-lbl">Longest pause</div></div>
 </div>
 ${voice.pace_trend ? `<div class="mmi-delivery-trend">${esc(voice.pace_trend)}</div>` : ''}
 <div class="mmi-delivery-tips"><div class="mmi-delivery-tips-title">What to work on</div><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
 ` : `
 <div class="mmi-delivery-upsell" style="margin-top:6px;padding:12px 14px;border:1px solid rgba(14,165,233,0.28);border-radius:10px;background:rgba(14,165,233,0.05);font-size:0.82rem;color:#0a1628;line-height:1.5;">Filler words, thinking pauses and <strong>vocal intonation</strong> - how genuine and varied your delivery sounds - come with a <strong>Premium</strong> review. <a href="plans.html#mmi-pro" style="color:#0ea5e9;font-weight:700;text-decoration:none;">See Premium -></a></div>
 `}
 <div class="mmi-delivery-caveat"><strong>Natural beats fluent.</strong> A slower, genuine answer reads far better than a fast, polished one that sounds forced or rehearsed. Examiners never mark down fillers or pauses, and chasing these numbers until you no longer sound like yourself will cost you far more than a few stray fillers ever could. This is here to help you notice habits, never a target to perform to.</div>
 </div>`;
 }

 function presenceBadge(value, map) {
 const m = map[value];
 return m ? `<span class="mmi-presence-badge rate-${m.r}">${esc(m.t)}</span>` : `<span class="mmi-presence-badge rate-mid">${esc(value || '-')}</span>`;
 }

 function renderPresentationMetrics(visual) {
 if (!visual) return '';
 const eyeMap = { consistent: { t: 'Consistent', r: 'good' }, mostly: { t: 'Mostly steady', r: 'good' }, inconsistent: { t: 'Inconsistent', r: 'mid' }, rare: { t: 'Rarely held', r: 'low' } };
 const postureMap = { engaged: { t: 'Open and engaged', r: 'good' }, neutral: { t: 'Neutral', r: 'mid' }, withdrawn: { t: 'Withdrawn', r: 'low' } };
 const composureMap = { engaged: { t: 'Engaged', r: 'good' }, neutral: { t: 'Steady', r: 'mid' }, anxious: { t: 'Looked anxious', r: 'low' }, performative: { t: 'Performative', r: 'mid' }, disengaged: { t: 'Disengaged', r: 'low' } };
 const authMap = { genuine: { t: 'Genuine', r: 'good' }, mostly_genuine: { t: 'Mostly genuine', r: 'good' }, somewhat_forced: { t: 'A little forced', r: 'mid' }, performative: { t: 'Looked rehearsed', r: 'low' } };
 const energyMap = { flat: { t: 'Flat', r: 'mid' }, measured: { t: 'Measured', r: 'good' }, animated: { t: 'Naturally animated', r: 'good' }, over_animated: { t: 'Restless', r: 'mid' } };

 const authRow = visual.authenticity ? `<div class="mmi-presence-line"><span class="mmi-presence-key">Authenticity</span>${presenceBadge(visual.authenticity, authMap)}</div>` : '';
 const energyRow = visual.energy ? `<div class="mmi-presence-line"><span class="mmi-presence-key">Energy</span>${presenceBadge(visual.energy, energyMap)}</div>` : '';
 const tells = Array.isArray(visual.nervous_tells) && visual.nervous_tells.length
 ? `<div class="mmi-presence-line"><span class="mmi-presence-key">Nervous tells</span><span class="mmi-presence-val">${visual.nervous_tells.map(d => esc(d)).join(', ')}</span></div>`
 : '';
 const distractions = Array.isArray(visual.distractions) && visual.distractions.length
 ? `<div class="mmi-presence-line"><span class="mmi-presence-key">Distracting habits</span><span class="mmi-presence-val">${visual.distractions.map(d => esc(d)).join(', ')}</span></div>`
 : '';
 const expr = visual.facial_expression ? `<div class="mmi-presence-text"><strong>Expression.</strong> ${esc(visual.facial_expression)}</div>` : '';
 const evidence = visual.expression_evidence ? `<div class="mmi-presence-text mmi-presence-muted">${esc(visual.expression_evidence)}</div>` : '';
 const engagement = visual.engagement ? `<div class="mmi-presence-text"><strong>Engagement.</strong> ${esc(visual.engagement)}</div>` : '';
 const consistency = visual.consistency ? `<div class="mmi-presence-text"><strong>Across the station.</strong> ${esc(visual.consistency)}</div>` : '';

 return `
 <div class="mmi-presence-card">
 <div class="mmi-delivery-head">
 <div>
 <div class="mmi-delivery-kicker">On-camera presence</div>
 <h3 class="mmi-delivery-title">How you looked to the examiner</h3>
 </div>
 <span class="mmi-delivery-tag">Premium</span>
 </div>
 <div class="mmi-presence-badges">
 <div class="mmi-presence-line"><span class="mmi-presence-key">Eye contact</span>${presenceBadge(visual.eye_contact, eyeMap)}</div>
 <div class="mmi-presence-line"><span class="mmi-presence-key">Posture</span>${presenceBadge(visual.posture, postureMap)}</div>
 <div class="mmi-presence-line"><span class="mmi-presence-key">Composure</span>${presenceBadge(visual.composure, composureMap)}</div>
 ${authRow}
 ${energyRow}
 ${tells}
 ${distractions}
 </div>
 ${expr}${evidence}${engagement}${consistency}
 ${visual.summary ? `<div class="mmi-presence-summary">${esc(visual.summary)}</div>` : ''}
 <div class="mmi-delivery-caveat"><strong>Genuine beats polished.</strong> A natural presence with imperfect eye contact reads far better than a rehearsed, performed one - strong content always outweighs delivery. Cultural and neurodivergent differences in eye contact and expression are not penalised, and some frames may catch you reading or thinking rather than speaking.</div>
 </div>`;
 }

 function renderPresenceTeaser() {
 return `
 <div class="mmi-presence-teaser">
 <div class="mmi-presence-teaser-body">
 <div class="mmi-delivery-kicker">On-camera presence</div>
 <div class="mmi-presence-teaser-title">See how you looked to the examiner</div>
 <div class="mmi-presence-teaser-text">Premium reviews add frame-by-frame analysis of your eye contact, posture, composure and facial expression - the presence signals a panel reacts to before you finish your first sentence.</div>
 </div>
 <a class="mmi-presence-teaser-cta" href="plans.html#mmi-section">Unlock presence analysis -&gt;</a>
 </div>`;
 }


 const TIMING_FILLERS = new Set(['um','uh','er','ah','like','you','know','sort','kind','basically','literally','actually','right','okay','so']);
 // Per-prompt timing from phrase segments + reveal times. Only meaningful when
 // prompts were revealed one at a time (staggered); returns null otherwise.
 function computePromptTimings(segments, reveals, totalDur) {
 if (!Array.isArray(segments) || !segments.length) return null;
 if (!Array.isArray(reveals) || reveals.length < 2) return null;
 const finite = reveals.filter(n => Number.isFinite(Number(n)));
 if (finite.length < 2) return null;
 const staggered = finite.some(t => Number(t) > 2);
 if (!staggered) return null;
 const out = [];
 for (let i = 0; i < reveals.length; i++) {
 const startWin = Number(reveals[i]);
 if (!Number.isFinite(startWin)) { out.push(null); continue; }
 const endWin = Number.isFinite(Number(reveals[i + 1])) ? Number(reveals[i + 1]) : (totalDur > 0 ? totalDur : Infinity);
 const segs = segments.filter(s => Number(s.start) >= startWin - 0.05 && Number(s.start) < endWin);
 if (!segs.length) { out.push({ empty: true }); continue; }
 let words = 0, fillers = 0;
 segs.forEach(s => {
 const toks = String(s.text || '').toLowerCase().split(/\s+/).filter(Boolean);
 words += toks.length;
 toks.forEach(t => { if (TIMING_FILLERS.has(t.replace(/[^a-z]/g, ''))) fillers++; });
 });
 const firstStart = Number(segs[0].start);
 const lastEnd = Number(segs[segs.length - 1].end);
 const durationSec = Math.max(0.5, lastEnd - firstStart);
 out.push({ words, fillers, durationSec: Math.round(durationSec), pace: Math.round((words / durationSec) * 60), timeToFirstWord: Math.max(0, Math.round((firstStart - startWin) * 10) / 10) });
 }
 return out;
 }

 function renderPromptTiming(timing) {
 if (!timing) return '';
 if (timing.empty) return '<div class="mmi-prompt-timing mmi-prompt-timing-warn"><span>No clear spoken answer landed in this question\'s window</span></div>';
 const parts = [`<span>${timing.durationSec}s</span>`, `<span>${timing.pace} wpm</span>`, `<span>${timing.words} words</span>`];
 if (timing.fillers) parts.push(`<span>${timing.fillers} filler${timing.fillers === 1 ? '' : 's'}</span>`);
 if (timing.timeToFirstWord >= 2) parts.push(`<span class="mmi-prompt-timing-flag">${timing.timeToFirstWord}s before you spoke</span>`);
 return `<div class="mmi-prompt-timing">${parts.join('')}</div>`;
 }

 function renderPromptCard(pp, index, timing) {
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
 ${renderPromptTiming(timing)}
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
   const s = pp?.scores?.[key]?.score;
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
 + items + '</div>';
 }

 function computeMmiPerfScore(feedback) {
 const pp = Array.isArray(feedback?.per_prompt) ? feedback.per_prompt : [];
 const means = [];
 for (const p of pp) {
 const vals = [];
 for (const k of CRITERIA_KEYS) { const v = Number(p?.scores?.[k]?.score); if (Number.isFinite(v)) vals.push(v); }
 if (vals.length) means.push(vals.reduce((a, b) => a + b, 0) / vals.length);
 }
 let perf = means.length ? means.reduce((a, b) => a + b, 0) / means.length : Number(feedback?.overall?.score);
 if (!Number.isFinite(perf)) return null;
 return Math.max(1, Math.min(5, Math.round(perf * 10) / 10));
 }

 function ordinal(n) {
 const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
 return n + (s[(v - 20) % 10] || s[v] || s[0]);
 }

 function renderPercentileCard(pct, sample) {
 const headline = pct >= 50
 ? `Stronger than about ${pct}% of Key2MD practice attempts`
 : `Around the ${ordinal(pct)} percentile of Key2MD practice attempts`;
 const sampleText = Number(sample) ? Number(sample).toLocaleString() : 'recent';
 return `
 <div class="mmi-percentile-card">
 <div class="mmi-percentile-headline">${esc(headline)}</div>
 <div class="mmi-percentile-bar"><span class="mmi-percentile-fill" style="width:${pct}%"></span><span class="mmi-percentile-marker" style="left:${pct}%"></span></div>
 <div class="mmi-percentile-scale"><span>Lower</span><span>Higher</span></div>
 <div class="mmi-percentile-caveat">Estimate only. This compares this response to ${esc(sampleText)} practice attempts by Key2MD users - it is <strong>not</strong> a prediction of your real interview result, and not a benchmark against the actual applicant pool. Treat it as a rough motivational signal, nothing more.</div>
 </div>`;
 }

 async function hydratePercentile(container, feedback) {
 const mount = container?.querySelector?.('#mmiPercentileMount');
 if (!mount || !feedback) return;
 const perf = computeMmiPerfScore(feedback);
 const token = authToken();
 if (!Number.isFinite(perf) || !token) return;
 try {
 const res = await fetch(`${apiBase()}/api/mmi/percentile?score=${perf}`, { headers: { Authorization: `Bearer ${token}` } });
 const payload = await res.json().catch(() => ({}));
 if (!res.ok || !payload || payload.available !== true) return;
 const pct = Math.max(1, Math.min(99, Math.round(Number(payload.percentile))));
 if (!Number.isFinite(pct)) return;
 mount.innerHTML = renderPercentileCard(pct, payload.sample);
 } catch { /* estimate is optional - never block feedback */ }
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

 const promptTimings = computePromptTimings(data.transcript_segments, context?.promptRevealSeconds, duration);
 const promptCards = (feedback.per_prompt || []).map((pp, i) => renderPromptCard(pp, i, promptTimings && promptTimings[i])).join('');

 // Premium sections
 const voiceSection = data.voice_metrics ? renderVoiceMetrics(data.voice_metrics) : '';
 const isSpoken = !!data.voice_metrics;
 const visualSection = data.visual_metrics
 ? renderPresentationMetrics(data.visual_metrics)
 : (isSpoken && tier !== 'premium' ? renderPresenceTeaser() : '');

 const auditorFlag = feedback.polished_auditor_detected ? `
 <div class="mmi-flag mmi-flag-auditor">
 <div class="mmi-flag-title">Polished Auditor Trap detected</div>
 <div class="mmi-flag-body">${esc(feedback.polished_auditor_explanation || '')}</div>
 </div>` : '';

 const deltaSection = context?.previousFeedback ? renderDeltaSection(feedback, context.previousFeedback) : '';
 const predictionSection = context?.predictedScores ? renderPredictionSection(feedback, context.predictedScores, context.calibrationStreak || 0) : '';
 const highlightsSection = renderHighlights(feedback);

 const critAvgs = computeCriterionAverages(feedback);
 const critStrip = CRITERIA_KEYS.map(k => {
 const v = critAvgs[k];
 if (!Number.isFinite(v)) return '';
 const pct = Math.max(0, Math.min(100, (v / 5) * 100));
 const cls = v >= 4 ? 'good' : v >= 3 ? 'mid' : 'low';
 return `<div class="mmi-crit-chip"><div class="mmi-crit-chip-top"><span>${esc(CRITERIA_LABELS[k])}</span><strong>${v.toFixed(1)}</strong></div><div class="mmi-crit-bar"><span class="rate-${cls}" style="width:${pct}%"></span></div></div>`;
 }).filter(Boolean).join('');
 const leadHtml = `
 <div class="mmi-lead">
 <div class="mmi-lead-focus">
 <div class="mmi-lead-label">Your biggest win next time</div>
 <div class="mmi-lead-text">${esc(overall.biggest_change || overall.biggest_improvement || 'Name the real tension and land a clear, reasoned decision.')}</div>
 </div>
 ${overall.biggest_strength ? `<div class="mmi-lead-strength"><strong>What landed:</strong> ${esc(overall.biggest_strength)}</div>` : ''}
 ${critStrip ? `<div class="mmi-crit-strip">${critStrip}</div>` : ''}
 </div>`;

 const moveItems = [];
 if (overall.biggest_improvement) moveItems.push(overall.biggest_improvement);
 if (overall.excellent_version) moveItems.push(overall.excellent_version);
 const twoMovesHtml = moveItems.length ? `
 <div class="mmi-moves">
 <div class="mmi-moves-label">Your next ${moveItems.length === 1 ? 'move' : 'two moves'}</div>
 <ol class="mmi-moves-list">${moveItems.map(m => `<li>${esc(m)}</li>`).join('')}</ol>
 </div>` : '';

 const html = `
 <div class="mmi-feedback" id="mmiFeedbackBlock">

 <div class="mmi-feedback-header">
 <div class="mmi-overall-badge ${overallCls}">${esc(overallLbl)}</div>
 <div class="mmi-overall-meta">
 ${esc(category)}${durationStr ? ' | ' + esc(durationStr) : ''} | ${specialistBadge}
 </div>
 </div>

 <div class="mmi-calib-note" style="margin:0 0 14px;padding:11px 14px;border:1px solid rgba(245,158,11,0.3);border-radius:10px;background:rgba(245,158,11,0.07);font-size:0.8rem;color:#7c4a03;line-height:1.5;"><strong>About the score:</strong> the number is being calibrated daily and will swing around over the next couple of weeks. The written feedback is the consistent part - it is built on Dan's tutoring - so let the feedback, and your own sense of how it went, guide you rather than the score for now.</div>

 ${leadHtml}

 ${twoMovesHtml}

 ${auditorFlag}
 <div id="mmiPercentileMount"></div>
 ${deltaSection}
 ${predictionSection}

 <details class="mmi-collapse">
 <summary class="mmi-collapse-summary">Your progress over time</summary>
 <div id="mmiAnalyticsMount"></div>
 </details>

 <details class="mmi-collapse">
 <summary class="mmi-collapse-summary">Per-question marking</summary>
 <div class="mmi-prompts-block">
 ${promptCards}
 </div>
 </details>

 ${voiceSection}
 ${visualSection}

 ${highlightsSection ? `<details class="mmi-collapse"><summary class="mmi-collapse-summary">Your words, mapped to the criteria</summary>${highlightsSection}</details>` : ''}

 <details class="mmi-collapse">
 <summary class="mmi-collapse-summary">About this feedback</summary>
 <div class="mmi-limitations">
 This AI feedback is calibrated to the rubric Dan uses with his coaching students - empathy, communication, reasoning, reflection, and real-world awareness. It is designed to complement, not replace, human review.<br><br>
 The AI is good at: structural feedback, identifying the Polished Auditor trap, spotting reflection without consequence, flagging textbook answers, and benchmarking your response against Dan's rubric.<br><br>
 The AI is less good at: subtle interpersonal nuance, the kind of judgement only experienced examiners bring, and the emotional weight of how something landed in the room.
 </div>
 </details>

 ${data.review_id ? `<div class="mmi-lift-wrap" id="mmiLiftWrap">
  <button class="btn-lift-trigger" id="mmiLiftTrigger">Lift my answer - see a stronger version of what you said -></button>
  <div class="mmi-lift-panel" id="mmiLiftPanel" style="display:none"></div>
 </div>` : ''}

 ${data.review_id ? `<div class="mmi-probe-wrap" id="mmiProbeWrap">
  <button class="btn-probe-trigger" id="mmiProbeTrigger">Get a follow-up question an examiner would actually ask -></button>
  <div class="mmi-probe-panel" id="mmiProbePanel" style="display:none"></div>
 </div>` : ''}

 ${context?.canRedo ? `<div class="mmi-redo-wrap"><button class="btn-mmi-redo" onclick="window.mmiRedoStation && window.mmiRedoStation()">Practise this station again -></button></div>` : ''}

 ${overallScore >= 4 ? `<div class="mmi-refer-nudge">
 <div class="mmi-refer-nudge-title">Strong station. Know someone else prepping?</div>
 <div class="mmi-refer-nudge-sub">Give a friend 15% off their first purchase. When they spend $50 or more, you get 15% off too.</div>
 <div class="mmi-refer-nudge-row"><button class="mmi-refer-nudge-btn" id="mmiReferNudgeBtn" type="button">Copy your invite link</button><span class="mmi-refer-nudge-status" id="mmiReferNudgeStatus"></span></div>
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
 hydratePercentile(container, feedback);
 if (data.review_id) hydrateProbe(container, data.review_id);
 if (data.review_id) hydrateLift(container, data.review_id);
 hydrateReferNudge(container);
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

 function hydrateReferNudge(container) {
  const btn = container.querySelector('#mmiReferNudgeBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
   const status = container.querySelector('#mmiReferNudgeStatus');
   btn.disabled = true;
   try {
    const res = await fetch(`${apiBase()}/api/user/referral-info`, { headers: { Authorization: `Bearer ${authToken()}` } });
    const d = await res.json().catch(() => ({}));
    if (!d || !d.referral_link) throw new Error('no link');
    await navigator.clipboard.writeText(d.referral_link);
    if (status) status.textContent = 'Link copied. Paste it to a friend.';
   } catch (e) {
    if (status) status.textContent = 'Find your invite link on the history page.';
   }
   btn.disabled = false;
  });
 }

 function hydrateLift(container, reviewId) {
  const trigger = container.querySelector('#mmiLiftTrigger');
  const panel = container.querySelector('#mmiLiftPanel');
  if (!trigger || !panel) return;
  let state = 'idle';
  trigger.addEventListener('click', async () => {
   if (state !== 'idle') return;
   try { window.Key2MDTrack && window.Key2MDTrack.funnel && window.Key2MDTrack.funnel('mmi_lift_used', {}); } catch (e) {}
   state = 'loading';
   trigger.disabled = true;
   panel.style.display = '';
   panel.innerHTML = '<div class="mmi-lift-loading">Rewriting your answer into a stronger version of what you said...</div>';
   try {
    const res = await fetch(`${apiBase()}/api/mmi/lift`, {
     method: 'POST',
     headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
     body: JSON.stringify({ review_id: reviewId }),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.status === 402 || (payload && payload.error === 'premium_only')) {
     state = 'idle';
     trigger.style.display = 'none';
     panel.innerHTML = `<div class="mmi-lift-oneline">Lift my answer is a Premium feature</div><div class="mmi-lift-answer">On a Premium review, the AI rewrites your own answer into a stronger version - your voice and your decision, with the weakness the marker flagged fixed. <a href="plans.html#mmi-pro" style="color:#0ea5e9;font-weight:700;text-decoration:none;">See Premium -></a></div>`;
     return;
    }
    const liftedPrompts = Array.isArray(payload.prompts) ? payload.prompts : null;
    if (!res.ok || (!liftedPrompts && !(payload && payload.lifted_answer))) throw new Error((payload && (payload.message || payload.error)) || 'Could not lift this answer');
    state = 'done';
    trigger.style.display = 'none';
    let liftBody;
    if (liftedPrompts) {
     liftBody = '<div class="mmi-lift-section-label">Your answer, lifted prompt by prompt</div>' + liftedPrompts.map((p, i) => `<div class="mmi-lift-prompt-block" style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(15,23,42,0.08);"><div class="mmi-lift-prompt-q" style="font-weight:800;color:#0a1628;font-size:0.86rem;margin-bottom:6px;">Prompt ${i + 1}${p.prompt ? ': ' + esc(p.prompt) : ''}</div><div class="mmi-lift-answer">${esc(p.lifted_answer || '')}</div>${p.change ? `<div class="mmi-lift-change-detail" style="margin-top:6px;">${esc(p.change)}</div>` : ''}</div>`).join('');
    } else {
     const changes = Array.isArray(payload.changes) ? payload.changes : [];
     liftBody = `<div class="mmi-lift-section-label">Your answer, lifted</div><div class="mmi-lift-answer">${esc(payload.lifted_answer)}</div>${changes.length ? `<div class="mmi-lift-section-label">What changed and why</div><div class="mmi-lift-changes">${changes.map(c => `<div class="mmi-lift-change"><div class="mmi-lift-change-label">${esc(c.label || '')}</div><div class="mmi-lift-change-detail">${esc(c.detail || '')}</div></div>`).join('')}</div>` : ''}`;
    }
    panel.innerHTML = `${payload.one_line ? `<div class="mmi-lift-oneline">${esc(payload.one_line)}</div>` : ''}${liftBody}<div class="mmi-lift-caveat">This is your own answer, strengthened - not a script to memorise. Hear how your reasoning could land, then say it your way.</div>`;
   } catch (err) {
    state = 'idle';
    trigger.disabled = false;
    panel.innerHTML = `<div class="mmi-lift-error">${esc(err.message || 'Something went wrong.')} <button class="btn-lift-retry" id="mmiLiftRetry">Dismiss</button></div>`;
    const rb = container.querySelector('#mmiLiftRetry');
    if (rb) rb.addEventListener('click', () => { panel.style.display = 'none'; panel.innerHTML = ''; });
   }
  });
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
