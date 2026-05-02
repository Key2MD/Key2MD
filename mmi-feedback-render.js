/**
 * mmi-feedback-render.js — Key2MD MMI Phase 1
 * Renders structured MMI AI feedback into the aiFeedbackWrapMMI element
 */

const MMIFeedbackRender = (() => {

  const SCORE_LABELS = { 1: 'Poor', 2: 'Unsatisfactory', 3: 'Satisfactory', 4: 'Good', 5: 'Excellent' };
  const SCORE_CLASSES = { 1: 'mmi-score-1', 2: 'mmi-score-2', 3: 'mmi-score-3', 4: 'mmi-score-4', 5: 'mmi-score-5' };
  const CRITERIA_LABELS = {
    empathy:              'Empathy',
    communication:        'Communication',
    reasoning:            'Reasoning',
    reflection:           'Reflection',
    real_world_awareness: 'Real-world Awareness',
  };

  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function scoreBar(score) {
    const pips = [1,2,3,4,5].map(n =>
      `<div class="mmi-score-pip ${n <= score ? SCORE_CLASSES[score] + '-pip' : 'mmi-score-pip-empty'}"></div>`
    ).join('');
    return `<div class="mmi-score-pips">${pips}</div>`;
  }

  function renderCriteriaRow(key, crit) {
    const label  = CRITERIA_LABELS[key] || key;
    const score  = crit.score || 3;
    const lbl    = crit.label || SCORE_LABELS[score] || '';
    const cls    = SCORE_CLASSES[score] || 'mmi-score-3';
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

  function renderPromptCard(pp, index) {
    const criteria = ['empathy','communication','reasoning','reflection','real_world_awareness'];
    const criteriaRows = criteria.map(k => {
      const crit = pp.scores?.[k];
      if (!crit) return '';
      return renderCriteriaRow(k, crit);
    }).join('');

    const avgScore = criteria.reduce((sum, k) => sum + (pp.scores?.[k]?.score || 3), 0) / criteria.length;
    const avgCls   = SCORE_CLASSES[Math.round(avgScore)] || 'mmi-score-3';

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

  function render(container, data, context) {
    // context: { tier, specialistMode, stationCategory, durationSec }
    if (!container || !data) return;

    const feedback       = data.feedback || data;
    const tier           = context?.tier || 'transcript';
    const specialistMode = context?.specialistMode || false;
    const category       = context?.stationCategory || '';
    const duration       = context?.durationSec || 0;
    const specialistBadge = specialistMode
      ? '<span class="mmi-specialist-badge">Specialist Mode</span>'
      : '<span class="mmi-medschool-badge">Med School</span>';

    const overall    = feedback.overall || {};
    const overallScore = overall.score || 3;
    const overallCls = SCORE_CLASSES[overallScore] || 'mmi-score-3';
    const overallLbl = overall.label || SCORE_LABELS[overallScore] || '';

    const durationStr = duration > 0
      ? `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`
      : '';

    const promptCards = (feedback.per_prompt || []).map((pp, i) => renderPromptCard(pp, i)).join('');

    const auditorFlag = feedback.polished_auditor_detected ? `
      <div class="mmi-flag mmi-flag-auditor">
        <div class="mmi-flag-title">⚠ Polished Auditor Trap detected</div>
        <div class="mmi-flag-body">${esc(feedback.polished_auditor_explanation || '')}</div>
      </div>` : '';

    const html = `
      <div class="mmi-feedback" id="mmiFeedbackBlock">

        <div class="mmi-feedback-header">
          <div class="mmi-overall-badge ${overallCls}">${esc(overallLbl)}</div>
          <div class="mmi-overall-meta">
            ${esc(category)}${durationStr ? ' · ' + esc(durationStr) : ''} · ${specialistBadge}
          </div>
        </div>

        ${auditorFlag}

        <div class="mmi-prompts-block">
          ${promptCards}
        </div>

        <div class="mmi-overall-summary">
          <div class="mmi-summary-section">
            <div class="mmi-summary-label">💪 Biggest Strength</div>
            <div class="mmi-summary-text">${esc(overall.biggest_strength || '')}</div>
          </div>
          <div class="mmi-summary-section">
            <div class="mmi-summary-label">🎯 Biggest Improvement</div>
            <div class="mmi-summary-text">${esc(overall.biggest_improvement || '')}</div>
          </div>
          <div class="mmi-summary-section mmi-summary-q5">
            <div class="mmi-summary-label">✦ What an "Excellent" response would have included</div>
            <div class="mmi-summary-text">${esc(overall.excellent_version || '')}</div>
          </div>
        </div>

        <div class="mmi-limitations">
          <strong>About this feedback</strong><br>
          This AI feedback is calibrated to the rubric Dan uses with his coaching students — empathy, communication, reasoning, reflection, and real-world awareness. It is designed to complement, not replace, human review.<br><br>
          The AI is good at: structural feedback, identifying the Polished Auditor trap, spotting reflection without consequence, flagging textbook answers, and benchmarking your response against Dan's rubric.<br><br>
          The AI is less good at: subtle interpersonal nuance, the kind of judgement only experienced examiners bring, and the emotional weight of how something landed in the room.
        </div>

        <div class="dan-marking-card">
          <div class="dan-marking-left">
            <div class="dan-marking-eyebrow">Want a human eye on this?</div>
            <div class="dan-marking-title">Get this station marked by Dan</div>
            <div class="dan-marking-sub">Same rubric, applied by the person who built it. 48–72hr turnaround.</div>
          </div>
          <div class="dan-marking-right">
            <div class="dan-marking-price">${specialistMode ? '$75' : '$60'}</div>
            <button class="btn-dan-marking" onclick="openEnquiry('MMI Marking')">Submit to Dan →</button>
          </div>
        </div>

      </div>`;

    container.innerHTML = html;
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderLoading(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="mmi-loading">
        <div class="mmi-loading-spinner"></div>
        <div class="mmi-loading-text">Transcribing and analysing your response…</div>
        <div class="mmi-loading-sub">This takes 15–30 seconds</div>
      </div>`;
  }

  function renderError(container, error) {
    if (!container) return;
    const isCredits = error.code === 'payment_required' || error.code === 'no_credits';
    const isLimit   = error.code === 'daily_limit_reached';

    let actionHtml = '';
    if (isCredits || isLimit) {
      actionHtml = `<a href="plans.html" class="btn-mmi-error-action">Get MMI Credits →</a>`;
    }

    container.innerHTML = `
      <div class="mmi-error-block">
        <div class="mmi-error-icon">${isCredits || isLimit ? '💳' : '⚠'}</div>
        <div class="mmi-error-msg">${esc(error.message || 'Something went wrong. Please try again.')}</div>
        ${actionHtml}
      </div>`;
  }

  function clear(container) {
    if (container) container.innerHTML = '';
  }

  return { render, renderLoading, renderError, clear };

})();
