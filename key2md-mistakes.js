/* Key2MD adaptive mistake engine. Reads a student's own AI-marked answers and builds a
   recurring-mistake profile so the coach can name what they keep doing, drill it, and remind
   them before the next answer. Self-contained (no deps); used by key2md-coach.js and practice.html.

   v1 (live now): infers mistakes from the feedback already stored - criterion/competency scores,
   the polished-auditor flag, and voice metrics. v2 (worker): each review carries an explicit
   mistakes:[id,...] array from the same taxonomy; when present it is trusted over the heuristic.
   The taxonomy ids MUST stay in sync with the worker taxonomy. */
(function () {
 'use strict';

 // Student-facing taxonomy. area = the criterion/competency it maps to. watch = the one-line
 // pre-answer reminder. drill = the targeted practice instruction shown in the coach.
 var MMI_MISTAKES = [
  { id: 'solve_before_connect', label: 'Solving before connecting', area: 'empathy',
    watch: 'Name the person and what they might feel before you move to a solution.',
    drill: 'Open your next station by naming who is affected and the emotion at stake, then pause before offering any fix.' },
  { id: 'one_sided_reasoning', label: 'One-sided reasoning', area: 'reasoning',
    watch: 'Weigh both sides out loud before you commit.',
    drill: 'Compare two options aloud, name the main risk in each, then commit to the safer next step.' },
  { id: 'missing_reflection', label: 'Missing reflection', area: 'reflection',
    watch: 'End by naming a limitation and what you would do differently.',
    drill: 'Add a closing line that names a limitation, what you would check, and how you would do it better next time.' },
  { id: 'ignores_constraints', label: 'Ignoring real-world limits', area: 'real_world_awareness',
    watch: 'State the real constraint (safety, hierarchy, confidentiality) and keep your plan inside it.',
    drill: 'Before answering, state the key constraint in the scenario, then make sure your final plan respects it.' },
  { id: 'scripted_delivery', label: 'Scripted delivery', area: 'communication',
    watch: 'Say it like you mean it, not like a rehearsed script.',
    drill: 'Record a one-minute answer where each step begins with a phrase you would actually say aloud to the interviewer.' },
  { id: 'polished_auditor', label: 'Polished but non-committal', area: 'reasoning',
    watch: 'Commit to a clear position early, then justify it - do not just sound smooth.',
    drill: 'Give a station answer where you state a firm decision in the first fifteen seconds, then defend it.' },
  { id: 'filler_pace', label: 'Fillers and pace', area: 'communication',
    watch: 'Start with one clear sentence, then keep a steady pace with fewer fillers.',
    drill: 'Re-record one answer aiming for a calm opening sentence and noticeably fewer filler words.' }
 ];

 var CASPER_MISTAKES = [
  { id: 'no_perspective', label: 'Missing other perspectives', area: 'Fairness',
    watch: 'Name every stakeholder and how each one sees the situation.',
    drill: 'List each person affected and one sentence on their viewpoint before you decide.' },
  { id: 'no_action', label: 'No concrete action', area: 'Problem Solving',
    watch: 'Move from what is wrong to the specific steps you would take.',
    drill: 'End with a short set of concrete actions, not just a description of the problem.' },
  { id: 'misses_emotion', label: 'Missing the human element', area: 'Empathy',
    watch: 'Acknowledge the emotion before the logistics.',
    drill: 'Open by naming how the key person likely feels and why it matters.' },
  { id: 'no_boundaries', label: 'Missing professional boundaries', area: 'Ethics',
    watch: 'Check confidentiality, safety, and when to escalate.',
    drill: 'Add a line on the professional limit (confidentiality, safety, escalation) that shapes your response.' },
  { id: 'generic_framework', label: 'Formulaic, not scenario-specific', area: 'Communication',
    watch: 'Answer this exact scenario, not a template.',
    drill: 'Reference two specific details from the scenario in your first three sentences.' },
  { id: 'shallow_depth', label: 'Surface-level, lacks depth', area: 'Self-Awareness',
    watch: 'Add the nuance or tension the scenario is really testing.',
    drill: 'Name the underlying tension in the scenario and address it directly.' }
 ];

 // Which criterion/competency, when weak, points to which mistake. Extra CASPer competencies
 // that have no dedicated mistake fall back to the closest one.
 var MMI_AREA_MAP = {
  empathy: 'solve_before_connect',
  reasoning: 'one_sided_reasoning',
  reflection: 'missing_reflection',
  real_world_awareness: 'ignores_constraints',
  communication: 'scripted_delivery'
 };
 var CASPER_AREA_MAP = {
  fairness: 'no_perspective',
  collaboration: 'no_perspective',
  'problem solving': 'no_action',
  problem_solving: 'no_action',
  motivation: 'no_action',
  empathy: 'misses_emotion',
  ethics: 'no_boundaries',
  communication: 'generic_framework',
  'self-awareness': 'shallow_depth',
  self_awareness: 'shallow_depth',
  resilience: 'shallow_depth'
 };

 var MMI_BY_ID = {}, CASPER_BY_ID = {};
 MMI_MISTAKES.forEach(function (m) { MMI_BY_ID[m.id] = m; });
 CASPER_MISTAKES.forEach(function (m) { CASPER_BY_ID[m.id] = m; });

 function tax(tool) { return tool === 'casper' ? CASPER_MISTAKES : MMI_MISTAKES; }
 function byId(tool) { return tool === 'casper' ? CASPER_BY_ID : MMI_BY_ID; }
 // MMI 1-5, CASPer 1-10. A score at/below this counts the area as a weak spot.
 function weakAt(tool) { return tool === 'casper' ? 5 : 2.5; }
 function normArea(k) { return String(k == null ? '' : k).toLowerCase().replace(/[^a-z ]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''); }

 function parseFeedback(r) {
  if (!r) return null;
  var raw = r.ai_feedback_json != null ? r.ai_feedback_json
   : (r.ai_feedback != null ? r.ai_feedback
   : (r.feedback != null ? r.feedback : r));
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (e) { return null; } }
  return (raw && typeof raw === 'object') ? raw : null;
 }

 // Collapse a feedback object into { area: score } on the tool's native scale.
 function areaScores(fb, tool) {
  var out = {};
  if (!fb || typeof fb !== 'object') return out;
  if (tool === 'casper') {
   if (Array.isArray(fb.competencies)) {
    fb.competencies.forEach(function (c) {
     var n = Number(c && c.score);
     if (isFinite(n) && c.name) out[normArea(c.name)] = n;
    });
   }
   return out;
  }
  // MMI
  if (fb.criterion_averages && typeof fb.criterion_averages === 'object') {
   Object.keys(fb.criterion_averages).forEach(function (k) {
    var n = Number(fb.criterion_averages[k]);
    if (isFinite(n)) out[normArea(k)] = n;
   });
  } else if (Array.isArray(fb.per_prompt)) {
   var sum = {}, cnt = {};
   fb.per_prompt.forEach(function (p) {
    var cs = (p && (p.criterion_scores || p.scores)) || null;
    if (!cs || typeof cs !== 'object') return;
    Object.keys(cs).forEach(function (k) {
     var v = cs[k];
     var n = Number(v && typeof v === 'object' ? v.score : v);
     if (!isFinite(n)) return;
     var kk = normArea(k); sum[kk] = (sum[kk] || 0) + n; cnt[kk] = (cnt[kk] || 0) + 1;
    });
   });
   Object.keys(sum).forEach(function (k) { out[k] = sum[k] / cnt[k]; });
  }
  return out;
 }

 // Returns the set of mistake ids evident in a single review.
 function detectFromReview(review, tool) {
  tool = tool === 'casper' ? 'casper' : 'mmi';
  var fb = parseFeedback(review);
  var ids = {};
  if (!fb) return [];

  // v2: trust an explicit taxonomy array if the worker supplied one.
  if (Array.isArray(fb.mistakes) && fb.mistakes.length) {
   var known = byId(tool);
   fb.mistakes.forEach(function (id) { if (known[id]) ids[id] = true; });
   if (Object.keys(ids).length) return Object.keys(ids);
  }

  // v1 heuristic: weak areas -> their mapped mistake.
  var scores = areaScores(fb, tool);
  var map = tool === 'casper' ? CASPER_AREA_MAP : MMI_AREA_MAP;
  var threshold = weakAt(tool);
  var weakest = null, weakestVal = Infinity;
  Object.keys(scores).forEach(function (area) {
   var v = scores[area];
   if (v < weakestVal) { weakestVal = v; weakest = area; }
   if (v <= threshold && map[area]) ids[map[area]] = true;
  });
  // Always attribute the single weakest area (even if just above threshold) so a profile forms early.
  if (weakest && map[weakest]) ids[map[weakest]] = true;

  // Flags and voice signals (MMI).
  if (tool === 'mmi') {
   if (fb.polished_auditor_detected) ids.polished_auditor = true;
   var vm = review && (review.voice_metrics || (fb && fb.voice_metrics));
   if (vm && typeof vm === 'object') {
    var fillers = Number(vm.fillers), words = Number(vm.words), pace = Number(vm.pace), ttf = Number(vm.timeToFirstWord);
    var fillerRate = (isFinite(fillers) && isFinite(words) && words > 0) ? fillers / words : null;
    if ((fillerRate != null && fillerRate > 0.04) || (isFinite(pace) && (pace > 175 || (pace > 0 && pace < 105))) || (isFinite(ttf) && ttf > 8)) {
     ids.filler_pace = true;
    }
   }
  }
  return Object.keys(ids);
 }

 // Aggregate across a student's reviews. Returns the top recurring mistakes with frequency.
 // opts: { limit } how many reviews to consider (default 12), { top } how many to return (default 3).
 function buildProfile(reviews, tool, opts) {
  tool = tool === 'casper' ? 'casper' : 'mmi';
  opts = opts || {};
  var limit = opts.limit || 12;
  var topN = opts.top || 3;
  var list = Array.isArray(reviews) ? reviews.slice(0, limit) : [];
  var counts = {}, considered = 0;
  list.forEach(function (r) {
   var ids = detectFromReview(r, tool);
   if (!ids.length) return;
   considered++;
   var seen = {};
   ids.forEach(function (id) { if (!seen[id]) { seen[id] = 1; counts[id] = (counts[id] || 0) + 1; } });
  });
  var known = byId(tool);
  var ranked = Object.keys(counts)
   .filter(function (id) { return known[id]; })
   .map(function (id) {
    var m = known[id];
    return { id: id, label: m.label, area: m.area, drill: m.drill, watch: m.watch,
             count: counts[id], pct: considered ? Math.round((counts[id] / considered) * 100) : 0 };
   })
   .sort(function (a, b) { return b.count - a.count; });
  var top = ranked.slice(0, topN);
  return {
   tool: tool,
   considered: considered,
   top: top,
   watchLine: top.length ? top[0].watch : '',
   watchLabel: top.length ? top[0].label : ''
  };
 }

 // Ids expected by the worker so it can check these mistakes harder (v2). Flat list of top ids.
 function focusIds(profile) {
  return (profile && profile.top ? profile.top : []).map(function (m) { return m.id; });
 }

 window.Key2MDMistakes = {
  MMI: MMI_MISTAKES,
  CASPER: CASPER_MISTAKES,
  detectFromReview: detectFromReview,
  buildProfile: buildProfile,
  focusIds: focusIds,
  taxonomy: tax
 };
})();
