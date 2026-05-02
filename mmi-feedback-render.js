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

  function renderVoiceMetrics(voice) {
    if (!voice) return '';
    const pace = voice.pace_wpm || 0;
    const paceNote = pace > 200 ? 'Faster than average — may signal nerves'
      : pace < 100 ? 'Slower than average — thoughtful or hesitant'
      : 'Natural conversational pace';
    const fillerPct = voice.filler_density_pct || 0;
    const fillerNote = fillerPct > 8
      ? `${fillerPct}% — slightly above average, but examiners do not mark fillers`
      : `${fillerPct}% — well within normal range`;
    const pauseAvg = voice.avg_pause_seconds || 0;
    const pauseNote = pauseAvg > 2
      ? 'Longer pauses — often a sign of genuine thought'
      : 'Short, natural pauses';

    return `
      <details class="mmi-premium-section">
        <summary class="mmi-premium-summary">
          <span class="mmi-premium-summary-icon">🎙️</span>
          <span>Voice &amp; Pacing</span>
          <span class="mmi-premium-badge">Premium</span>
          <span class="mmi-premium-chevron">▼</span>
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
          <div class="mmi-premium-caveat">Filler words (um, uh, like) are tracked for your awareness only — MMI examiners do not mark them down. Pauses are often positive signals of genuine thought.</div>
        </div>
      </details>`;
  }

  function renderPresentationMetrics(visual) {
    if (!visual) return '';
    const eyeMap = { consistent: '✅ Consistent', mostly: '👍 Mostly consistent', inconsistent: '⚠ Inconsistent', rare: '❌ Rare' };
    const postureMap = { engaged: '✅ Engaged', neutral: '➖ Neutral', withdrawn: '⚠ Withdrawn' };
    const composureMap = { engaged: '✅ Engaged', neutral: '➖ Neutral', performative: '⚠ Performative', disengaged: '❌ Disengaged' };

    const distractions = Array.isArray(visual.distractions) && visual.distractions.length
      ? `<div class="mmi-visual-row"><span class="mmi-visual-label">Distractions</span><span class="mmi-visual-val">${visual.distractions.map(d => esc(d)).join(', ')}</span></div>`
      : '';

    return `
      <details class="mmi-premium-section">
        <summary class="mmi-premium-summary">
          <span class="mmi-premium-summary-icon">📹</span>
          <span>Presentation Analysis</span>
          <span class="mmi-premium-badge">Premium</span>
          <span class="mmi-premium-chevron">▼</span>
        </summary>
        <div class="mmi-premium-body">
          <div class="mmi-visual-grid">
            <div class="mmi-visual-row"><span class="mmi-visual-label">Eye contact</span><span class="mmi-visual-val">${eyeMap[visual.eye_contact] || esc(visual.eye_contact || '—')}</span></div>
            <div class="mmi-visual-row"><span class="mmi-visual-label">Posture</span><span class="mmi-visual-val">${postureMap[visual.posture] || esc(visual.posture || '—')}</span></div>
            <div class="mmi-visual-row"><span class="mmi-visual-label">Composure</span><span class="mmi-visual-val">${composureMap[visual.composure] || esc(visual.composure || '—')}</span></div>
            ${distractions}
          </div>
          ${visual.summary ? `<div class="mmi-visual-summary">${esc(visual.summary)}</div>` : ''}
          <div class="mmi-premium-caveat">Examiners weight substance over polish. Strong content with imperfect eye contact still scores well. This section is informational — it does not change your criterion scores.</div>
        </div>
      </details>`;
  }


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
    if (window._mmiLoadingInterval) { clearInterval(window._mmiLoadingInterval); window._mmiLoadingInterval = null; }
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

    // Premium sections
    const voiceSection = (tier === 'premium' && data.voice_metrics)
      ? renderVoiceMetrics(data.voice_metrics) : '';
    const visualSection = (tier === 'premium' && data.visual_metrics)
      ? renderPresentationMetrics(data.visual_metrics) : '';

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

        ${voiceSection}
        ${visualSection}

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

  function renderLoading(container, tier) {
    if (!container) return;
    const isPremium = tier === 'premium';
    container.innerHTML = `
      <div class="mmi-loading">
        <div class="mmi-loading-spinner"></div>
        <div class="mmi-loading-text">${isPremium ? 'Analysing your response — voice, presentation, and content…' : 'Transcribing and analysing your response…'}</div>
        <div class="mmi-loading-sub">${isPremium ? 'Premium analysis takes 20–40 seconds — please keep this tab open' : 'This takes 15–30 seconds'}</div>
        ${isPremium ? '<div class="mmi-loading-steps" id="mmiLoadingSteps"><span class="mmi-step active">📝 Transcribing</span><span class="mmi-step">🎙️ Analysing voice</span><span class="mmi-step">📹 Reviewing presentation</span><span class="mmi-step">🤖 Generating feedback</span></div>' : ''}
      </div>`;
    if (isPremium) startLoadingSteps();
  }

  function startLoadingSteps() {
    const steps = document.querySelectorAll('.mmi-step');
    if (!steps.length) return;
    let current = 0;
    const interval = setInterval(() => {
      steps.forEach((s, i) => s.classList.toggle('active', i === current));
      current = (current + 1) % steps.length;
    }, 5000);
    // Store so we can clear it
    window._mmiLoadingInterval = interval;
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
