/**
 * mmi-engine.js  —  Key2MD MMI Timing Engine v2
 * 
 * DROP IN:  add  <script src="mmi-engine.js"></script>
 * AFTER the existing  <script src="mmi-recording.js"></script>  line
 * and BEFORE the closing </body> tag.
 *
 * This file replaces the per-format timing logic inside practice.html's
 * inline script.  The inline script still owns state vars, DOM refs, and
 * the CASPer path — this file only takes over the MMI speaking phase.
 */

// ── Central countdown timer (rendered inside .prompts-area) ─────────────────
let _ctInterval = null;

window.mmiShowCentralTimer = function(totalSec, label, colorClass) {
  let el = document.getElementById('mmiCentralTimer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mmiCentralTimer';
    el.style.cssText = [
      'display:flex','align-items:center','justify-content:space-between',
      'gap:10px','padding:12px 20px',
      'background:rgba(14,165,233,0.07)','border:1px solid rgba(14,165,233,0.18)',
      'border-radius:12px','margin-bottom:14px','font-family:inherit',
      'transition:background 0.3s,border-color 0.3s',
    ].join(';');
    el.innerHTML = `
      <span id="mmiCtLabel"  style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:var(--teal3);min-width:80px;"></span>
      <span id="mmiCtNum"    style="font-size:1.9rem;font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums;text-align:center;flex:1;"></span>
      <span                  style="font-size:0.68rem;color:var(--gray400);font-weight:500;min-width:60px;text-align:right;">remaining</span>
    `;
    const pa = document.getElementById('promptsArea');
    if (pa) pa.insertBefore(el, pa.firstChild);
  }
  if (_ctInterval) clearInterval(_ctInterval);
  el.style.display = 'flex';

  const numEl   = document.getElementById('mmiCtNum');
  const labelEl = document.getElementById('mmiCtLabel');
  if (labelEl) labelEl.textContent = label || '';

  // color variants
  el.style.background    = colorClass === 'red'    ? 'rgba(239,68,68,0.06)'   :
                           colorClass === 'purple' ? 'rgba(99,102,241,0.07)' :
                                                     'rgba(14,165,233,0.07)';
  el.style.borderColor   = colorClass === 'red'    ? 'rgba(239,68,68,0.2)'    :
                           colorClass === 'purple' ? 'rgba(99,102,241,0.2)'  :
                                                     'rgba(14,165,233,0.18)';

  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  let sLeft = totalSec;
  if (numEl) numEl.textContent = fmt(sLeft);

  _ctInterval = setInterval(() => {
    sLeft = Math.max(0, sLeft - 1);
    if (numEl) {
      numEl.textContent = fmt(sLeft);
      numEl.style.color = sLeft <= 30 ? '#ef4444' : 'var(--navy)';
    }
    if (sLeft <= 0) clearInterval(_ctInterval);
  }, 1000);
};

window.mmiHideCentralTimer = function() {
  const el = document.getElementById('mmiCentralTimer');
  if (el) el.style.display = 'none';
  if (_ctInterval) { clearInterval(_ctInterval); _ctInterval = null; }
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const _$ = id => document.getElementById(id);

function _showWrap(idx, content) {
  // idx is 1-based (1=prompt1Wrap … 4=prompt4Wrap)
  const w = _$(`prompt${idx}Wrap`);
  if (!w) return;
  if (content !== undefined) {
    const t = _$(`prompt${idx}Text`);
    if (t) t.textContent = content;
  }
  w.style.display = 'block';
  w.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _hideAllWraps() {
  [1,2,3,4].forEach(i => {
    const w = _$(`prompt${i}Wrap`);
    if (w) w.style.display = 'none';
  });
}

function _highlightWrap(idx) {
  // idx 1-based
  [1,2,3,4].forEach(i => {
    const w = _$(`prompt${i}Wrap`);
    if (!w) return;
    w.classList.toggle('qf-active-prompt', i === idx);
  });
}

function _removeAllHighlights() {
  [1,2,3,4].forEach(i => {
    const w = _$(`prompt${i}Wrap`);
    if (w) w.classList.remove('qf-active-prompt');
  });
}

function _setPhaseBadge(text, cls) {
  const b = _$('phaseBadge');
  if (!b) return;
  b.textContent = text;
  // keep existing classes, swap just the phase class
  b.className = 'phase-badge ' + (cls || 'phase-writing');
}

// ── Quickfire engine ─────────────────────────────────────────────────────────
// 45 s initial read (handled by existing runTimer in loadStation)
// Then: Q1 appears → 15 s read → 60 s answer → Q2 → … repeat
// Recording starts when first question appears (so whole session = 1 recording)

let _qfIdx    = 0;   // current question index (0-based)
let _qfRunning = false;

window.mmiStartQuickfire = function(allPrompts, cfg) {
  _qfIdx     = 0;
  _qfRunning = true;
  const perRead   = cfg.perPromptRead   || 15;
  const perAnswer = cfg.perPromptAnswer || 60;
  const showAll   = _$('mmiRevealAllToggle')?.checked || false;

  _$('mmiSpeakingArea').classList.add('show');
  document.getElementById('answerSection').style.display = 'none';

  // If "show all" toggle is on, reveal every question now
  if (showAll) {
    allPrompts.forEach((p, i) => _showWrap(i + 1, p));
  }

  _qfReadPhase(allPrompts, perRead, perAnswer, showAll);
};

function _qfReadPhase(prompts, perRead, perAnswer, showAll) {
  if (!_qfRunning || _qfIdx >= prompts.length) { finishStation(); return; }
  const i = _qfIdx; // 0-based

  // Start recording on first question
  if (i === 0 && window.webcamReady && !window.webcamActive) {
    startRecording();
  }

  if (!showAll) _showWrap(i + 1, prompts[i]);
  _highlightWrap(i + 1);
  _setPhaseBadge(`📖 Read Q${i+1}  ${perRead}s`, 'phase-reading');
  window.mmiShowCentralTimer(perRead, `Read Q${i+1}`, 'purple');

  // Use the existing runTimer — it drives the top progress bar
  runTimer(perRead, () => _qfAnswerPhase(prompts, perRead, perAnswer, showAll));
}

function _qfAnswerPhase(prompts, perRead, perAnswer, showAll) {
  if (!_qfRunning) return;
  const i = _qfIdx;
  _highlightWrap(i + 1);
  _setPhaseBadge(`🎤 Answer Q${i+1}  ${perAnswer}s`, 'phase-writing');
  window.mmiShowCentralTimer(perAnswer, `Answer Q${i+1}`, 'red');

  runTimer(perAnswer, () => {
    _removeAllHighlights();
    _qfIdx++;
    _qfReadPhase(prompts, perRead, perAnswer, showAll);
  });
}

window.mmiStopQuickfire = function() { _qfRunning = false; };

// ── Standard engine ──────────────────────────────────────────────────────────
// All Qs shown during 2 min reading (handled in loadStation).
// On speaking start: single 5 min timer, phase badge updates.

window.mmiStartStandard = function(allPrompts, cfg) {
  allPrompts.forEach((p, i) => _showWrap(i + 1, p));
  _$('mmiSpeakingArea').classList.add('show');
  document.getElementById('answerSection').style.display = 'none';
  _setPhaseBadge('🎤 Speaking', 'phase-writing');
  window.mmiShowCentralTimer(cfg.recordingTime, 'Speaking', 'red');
  if (window.webcamReady) startRecording();
  runTimer(cfg.recordingTime, () => finishStation());
};

// ── Extended engine ───────────────────────────────────────────────────────────
// Q1 shown during reading. Recording starts. Spacebar/button advances to next Q
// freely within total recording time — no per-Q countdown.

let _extShown = 1;
let _extPrompts = [];
let _extCfg = null;

window.mmiStartExtended = function(allPrompts, cfg) {
  _extShown   = 1;
  _extPrompts = allPrompts;
  _extCfg     = cfg;

  _showWrap(1, allPrompts[0]);
  _$('mmiSpeakingArea').classList.add('show');
  document.getElementById('answerSection').style.display = 'none';
  if (window.webcamReady) startRecording();
  _setPhaseBadge('🎤 Speaking', 'phase-writing');
  window.mmiShowCentralTimer(cfg.recordingTime, 'Speaking', 'red');
  _updateExtBtn();
  runTimer(cfg.recordingTime, () => finishStation());
};

function _updateExtBtn() {
  const btn = _$('btnRevealNext');
  if (!btn) return;
  const remaining = _extPrompts.length - _extShown;
  if (remaining <= 0) { btn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  btn.disabled = false;
  btn.onclick = window.mmiExtendedReveal;
  btn.innerHTML = `Next Question → <span class="reveal-counter">Q${_extShown + 1} of ${_extPrompts.length}</span><span style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-left:6px;">[Space]</span>`;
}

window.mmiExtendedReveal = function() {
  if (_extShown >= _extPrompts.length) return;
  _showWrap(_extShown + 1, _extPrompts[_extShown]);
  // log timestamp
  if (window.mmiRecordingStartedAt) {
    const elapsed = (Date.now() - window.mmiRecordingStartedAt) / 1000;
    window.mmiPromptRevealTimestamps.push({ prompt_index: _extShown, revealed_at_recording_seconds: elapsed });
  }
  _extShown++;
  _updateExtBtn();
};

// ── Random engine ────────────────────────────────────────────────────────────
// 2 min reading: scenario + Q1 visible.
// Speaking starts: ALL prompts hide, timer hides, 7 min running silently.
// 1–2 follow-up Qs appear at random intervals.
// 1-min warning shown. Re-show button available (timer keeps running).

let _randTimer    = null;
let _randPrompts  = [];
let _randReveal   = [];   // scheduled elapsed seconds for each follow-up
let _randGiven    = 0;
let _randWarnShown = false;

window.mmiStartRandom = function(allPrompts, cfg) {
  _randPrompts  = allPrompts;
  _randGiven    = 0;
  _randWarnShown = false;
  if (_randTimer) clearInterval(_randTimer);

  // Decide number of follow-ups
  const min = cfg.followUpMin || 1, max = cfg.followUpMax || 2;
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const total = cfg.recordingTime;

  // Space follow-ups evenly with small jitter
  _randReveal = [];
  for (let i = 1; i <= count; i++) {
    const base   = (total / (count + 1)) * i;
    const jitter = (Math.random() - 0.5) * 20;
    _randReveal.push(Math.round(Math.max(40, Math.min(total - 70, base + jitter))));
  }
  _randReveal.sort((a, b) => a - b);

  // Start recording
  _$('mmiSpeakingArea').classList.add('show');
  document.getElementById('answerSection').style.display = 'none';
  if (window.webcamReady) startRecording();

  // Hide all prompts
  _hideAllWraps();

  // Hide the header timer (random mode — no visible timer)
  const tn = _$('timerNum');
  if (tn) tn.closest('.timer-display') ? _$('timerNum').closest('.timer-display').style.visibility = 'hidden' : (tn.style.visibility = 'hidden');
  const pf = _$('progressFill');
  if (pf) pf.style.display = 'none';
  _setPhaseBadge('🎤 Speaking', 'phase-writing');

  // Hide central timer (random mode)
  window.mmiHideCentralTimer();

  // Show re-show button
  _showRandReshowBtn(allPrompts);

  // Hidden countdown
  let elapsed = 0;
  _randTimer = setInterval(() => {
    elapsed++;
    const remaining = total - elapsed;

    // Check follow-up reveals
    if (_randGiven < _randReveal.length && elapsed >= _randReveal[_randGiven]) {
      _revealRandomFollowUp();
    }

    // 1-min warning
    if (!_randWarnShown && remaining <= 60) {
      _randWarnShown = true;
      _showRandWarning();
    }

    if (remaining <= 0) {
      clearInterval(_randTimer);
      _randTimer = null;
      _hideRandReshowBtn();
      // Restore visibility
      const tn2 = _$('timerNum');
      if (tn2) {
        tn2.closest('.timer-display')
          ? (_$('timerNum').closest('.timer-display').style.visibility = 'visible')
          : (tn2.style.visibility = 'visible');
      }
      const pf2 = _$('progressFill');
      if (pf2) pf2.style.display = '';
      finishStation();
    }
  }, 1000);
};

function _revealRandomFollowUp() {
  const promptIdx = _randGiven + 1; // 0-based: Q2 first, then Q3
  if (promptIdx >= _randPrompts.length) { _randGiven++; return; }
  _randGiven++;
  const w = _$(`prompt${promptIdx + 1}Wrap`);
  if (w) {
    const t = _$(`prompt${promptIdx + 1}Text`);
    if (t) t.textContent = _randPrompts[promptIdx];
    w.style.display = 'block';
    w.classList.add('random-followup-flash');
    setTimeout(() => w.classList.remove('random-followup-flash'), 2500);
  }
  if (window.mmiRecordingStartedAt) {
    const elapsed2 = (Date.now() - window.mmiRecordingStartedAt) / 1000;
    window.mmiPromptRevealTimestamps.push({ prompt_index: promptIdx, revealed_at_recording_seconds: elapsed2 });
  }
}

function _showRandWarning() {
  const area = _$('mmiSpeakingArea');
  if (!area || _$('randTimeWarn')) return;
  const d = document.createElement('div');
  d.id = 'randTimeWarn';
  d.style.cssText = 'background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:10px 16px;font-size:0.82rem;font-weight:700;color:#dc2626;text-align:center;margin-top:10px;animation:mmiEngFadeIn 0.4s ease;';
  d.textContent = '⏱ 1 minute remaining — start wrapping up.';
  area.appendChild(d);
}

let _reshowOpen = false;
function _showRandReshowBtn(allPrompts) {
  let btn = _$('btnRandReshow');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'btnRandReshow';
    btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:10px 16px;background:rgba(14,165,233,0.08);border:1.5px solid rgba(14,165,233,0.2);border-radius:10px;color:var(--teal3);font-family:inherit;font-size:0.82rem;font-weight:700;cursor:pointer;margin-bottom:10px;transition:all 0.18s;text-align:left;';
    const area = _$('mmiSpeakingArea');
    if (area) area.insertBefore(btn, area.firstChild);
  }
  _reshowOpen = false;
  _setReshowBtnLabel(btn, false);

  btn.onclick = () => {
    _reshowOpen = !_reshowOpen;
    _setReshowBtnLabel(btn, _reshowOpen);
    if (_reshowOpen) {
      // Show prompts revealed so far (Q1 + any follow-ups given)
      for (let i = 0; i <= _randGiven; i++) {
        const w = _$(`prompt${i + 1}Wrap`);
        if (w) {
          const t = _$(`prompt${i + 1}Text`);
          if (t) t.textContent = _randPrompts[i] || '';
          w.style.display = 'block';
        }
      }
      // Show no-speaking banner
      let banner = _$('randReshowBanner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'randReshowBanner';
        banner.style.cssText = 'background:rgba(245,158,11,0.1);border:1.5px solid rgba(245,158,11,0.3);border-radius:10px;padding:10px 16px;font-size:0.78rem;font-weight:600;color:#d97706;text-align:center;margin-bottom:10px;';
        banner.textContent = '⚠ Stop speaking while prompts are visible. Click "Hide & resume" to continue.';
        const pa = _$('promptsArea');
        if (pa) pa.insertBefore(banner, pa.firstChild);
      }
      banner.style.display = 'block';
    } else {
      _hideAllWraps();
      const banner = _$('randReshowBanner');
      if (banner) banner.style.display = 'none';
    }
  };
}

function _setReshowBtnLabel(btn, open) {
  btn.innerHTML = open
    ? '🙈 Hide & resume speaking <span style="font-size:0.68rem;font-weight:500;color:rgba(14,165,233,0.5);margin-left:auto;">⚠ no speaking while visible</span>'
    : '👁 Re-show prompt & questions so far <span style="font-size:0.68rem;font-weight:500;color:rgba(14,165,233,0.5);margin-left:auto;">⚠ no speaking while visible</span>';
}

function _hideRandReshowBtn() {
  const btn = _$('btnRandReshow');      if (btn)    btn.remove();
  const ban = _$('randReshowBanner');   if (ban)    ban.remove();
  const warn = _$('randTimeWarn');      if (warn)   warn.remove();
}

window.mmiStopRandom = function() {
  if (_randTimer) { clearInterval(_randTimer); _randTimer = null; }
  _hideRandReshowBtn();
  const tn = _$('timerNum');
  if (tn) {
    tn.closest('.timer-display')
      ? (_$('timerNum').closest('.timer-display').style.visibility = 'visible')
      : (tn.style.visibility = 'visible');
  }
  const pf = _$('progressFill');
  if (pf) pf.style.display = '';
};

// ── Master dispatch: called from startWriting() inside practice.html ─────────
// Replace the entire `if(isMmi){ ... }` block in startWriting() with just:
//
//    if(isMmi){ mmiDispatchStartWriting(); return; }
//
window.mmiDispatchStartWriting = function() {
  const currentIdx = window.currentIdx;
  const pool       = window.pool;
  if (currentIdx === undefined || !pool) return;

  const s      = pool[currentIdx];
  const cfg    = window.getMMIConfig ? getMMIConfig() : { revealMode: 'all_at_once', recordingTime: 300, promptCount: 3 };
  const allP   = (window.getPrompts ? getPrompts(s) : [s.prompt1, s.prompt2, s.prompt3, s.prompt4].filter(Boolean)).slice(0, cfg.promptCount);

  // Populate all text elements up front
  allP.forEach((p, i) => { const t = _$(`prompt${i+1}Text`); if (t) t.textContent = p; });

  // Hide prompts-locked placeholder
  const pl = _$('promptsLocked');
  if (pl) pl.style.display = 'none';

  switch (cfg.revealMode) {
    case 'quickfire':          window.mmiStartQuickfire(allP, cfg);   break;
    case 'all_at_once':        window.mmiStartStandard(allP, cfg);    break;
    case 'extended_sequential':window.mmiStartExtended(allP, cfg);    break;
    case 'random':             window.mmiStartRandom(allP, cfg);      break;
    default:                   window.mmiStartStandard(allP, cfg);    break;
  }
};

// ── Cleanup: call mmiEngineReset() from loadStation() and mmiResetForRestart() 
window.mmiEngineReset = function() {
  // Quickfire
  _qfRunning = false;
  _qfIdx     = 0;
  // Extended
  _extShown   = 1;
  _extPrompts = [];
  // Random
  if (_randTimer) { clearInterval(_randTimer); _randTimer = null; }
  _randGiven     = 0;
  _randWarnShown = false;
  _randReveal    = [];
  _reshowOpen    = false;
  _hideRandReshowBtn();
  // Central timer
  window.mmiHideCentralTimer();
  // Restore header timer visibility
  const tn = _$('timerNum');
  if (tn) {
    tn.closest('.timer-display')
      ? (_$('timerNum').closest('.timer-display').style.visibility = 'visible')
      : (tn.style.visibility = 'visible');
  }
  const pf = _$('progressFill');
  if (pf) pf.style.display = '';
  // Remove any leftover hint
  const qfh = _$('qfReadingHint'); if (qfh) qfh.remove();
  // Remove highlights
  _removeAllHighlights();
};

// ── Spacebar handler supplement ───────────────────────────────────────────────
// From inside the keydown handler, call mmiEngineSpacebar() and check return value.
// If it returns true, the event was handled — skip the skipBtn fallback.
window.mmiEngineSpacebar = function() {
  const cfg = window.getMMIConfig ? getMMIConfig() : null;
  if (!cfg) return false;
  if (cfg.revealMode === 'extended_sequential') {
    window.mmiExtendedReveal();
    return true;
  }
  // quickfire and random: spacebar does nothing
  if (cfg.revealMode === 'quickfire' || cfg.revealMode === 'random') return true;
  return false; // let original handler deal with sequential/custom
};

// ── CSS keyframe injection (so the file is self-contained) ───────────────────
(function injectStyles() {
  if (document.getElementById('mmiEngineStyles')) return;
  const s = document.createElement('style');
  s.id = 'mmiEngineStyles';
  s.textContent = `
    @keyframes mmiEngFadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }

    /* Quickfire active prompt highlight */
    .qf-active-prompt {
      border: 2px solid var(--teal) !important;
      background: rgba(14,165,233,0.04);
      border-radius: 10px;
      padding: 4px;
      animation: mmiQfPulse 2s ease-in-out infinite;
    }
    @keyframes mmiQfPulse {
      0%,100%{box-shadow:0 0 0 0 rgba(14,165,233,0)}
      50%{box-shadow:0 0 0 6px rgba(14,165,233,0.1)}
    }
    .qf-active-prompt .prompt-num { background:var(--teal)!important; color:#fff!important; }

    /* Random follow-up flash */
    .random-followup-flash { animation: mmiRandFlash 2.5s ease-out; }
    @keyframes mmiRandFlash {
      0%  { background:rgba(14,165,233,0.2); outline:2px solid var(--teal); border-radius:8px; }
      100%{ background:transparent; outline-color:transparent; }
    }

    /* Quickfire reading hint */
    #qfReadingHint {
      background:rgba(14,165,233,0.06);border:1px dashed rgba(14,165,233,0.25);
      border-radius:10px;padding:10px 16px;font-size:0.78rem;color:var(--teal3);
      font-weight:600;text-align:center;margin-top:8px;
      animation:mmiEngFadeIn 0.4s ease;
    }

    /* Re-show button hover */
    #btnRandReshow:hover {
      background:rgba(14,165,233,0.15)!important;
      border-color:rgba(14,165,233,0.4)!important;
    }

    /* Central timer */
    #mmiCentralTimer { animation: mmiEngFadeIn 0.3s ease; }
  `;
  document.head.appendChild(s);
})();
