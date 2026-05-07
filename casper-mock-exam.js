/**
 * casper-mock-exam.js - Key2MD Full CASPer Mock Exam
 *
 * Uses the existing written CASPer engine and MMI recording/feedback engine,
 * but wraps them in the official current CASPer sequence:
 * 4 video-response scenarios, optional 10-minute break, 7 typed scenarios,
 * optional 5-minute break after typed station 4.
 */

window.FullCasperMock = (() => {
  const VIDEO_COUNT = 4;
  const TYPED_COUNT = 7;
  const VIDEO_PRESET = 'casperVideo';
  const VIDEO_BREAK_SECONDS = 10 * 60;
  const TYPED_BREAK_SECONDS = 5 * 60;
  const CASPER_REFLECTION_SECONDS = 30;
  const CASPER_TYPED_SECONDS = 210;
  const MOCK_PRICES = {
    transcript: { standard: 59, pro: 41, value: 69, video: 20 },
    premium: { standard: 79, pro: 55, value: 97, video: 48 },
  };
  let active = false;
  let started = false;
  let config = { tier: 'transcript' };
  let sequence = [];
  let index = 0;
  let results = [];
  let originalSubmitMMI = null;
  let breakTimer = null;
  let breakLeft = 0;

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function isCasperPro() {
    return !!window.Key2MDAuth?.isPro?.();
  }

  function priceForTier(tier = config.tier) {
    const prices = MOCK_PRICES[tier] || MOCK_PRICES.transcript;
    return isCasperPro() ? prices.pro : prices.standard;
  }

  function hasMockPass(tier = config.tier) {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mock_payment') === 'success' && (params.get('mock_tier') || tier) === tier) {
        sessionStorage.setItem(`k2md_mock_pass_${tier}`, '1');
      }
      return sessionStorage.getItem(`k2md_mock_pass_${tier}`) === '1';
    } catch {
      return false;
    }
  }

  async function checkoutMock(tier = config.tier) {
    if (!window.Key2MDAuth) {
      throw new Error('The login system is still loading. Please refresh the page and try again.');
    }
    if (!window.Key2MDAuth.isLoggedIn()) {
      window.Key2MDAuth.showAuthModal?.('signup');
      return;
    }
    const token = window.Key2MDAuth.getToken();
    const successUrl = `${window.location.origin}${window.location.pathname}?tab=mock&mock_payment=success&mock_tier=${encodeURIComponent(tier)}`;
    const cancelUrl = `${window.location.origin}${window.location.pathname}?tab=mock&mock_payment=cancelled`;
    const res = await fetch(`${window.API_BASE || 'https://key2md-api.brittainmbbs.workers.dev'}/api/casper-mock/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ tier, success_url: successUrl, cancel_url: cancelUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not start mock checkout');
    if (!data.checkout_url) throw new Error('Checkout did not return a Stripe link. Make sure the patched worker is deployed.');
    window.location.href = data.checkout_url;
  }

  function tierLabel(tier = config.tier) {
    return tier === 'premium' ? 'Premium' : 'Transcript';
  }

  function setCheckoutState(isBusy, message = '') {
    document.querySelectorAll('.mock-checkout-btn').forEach(btn => {
      btn.disabled = isBusy;
      btn.style.opacity = isBusy ? '0.72' : '1';
      btn.textContent = isBusy ? 'Redirecting to Stripe...' : 'Buy & Start Full Mock';
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

  function init() {
    renderConfigPanel();
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
    const sidebar = document.querySelector('aside.sidebar');
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
          Official current sequence: 4 video scenarios, 10-minute optional break, then 7 typed scenarios with a 5-minute optional break after typed station 4.
        </div>

        <div style="margin-bottom:14px;">
          <div style="font-size:0.72rem;font-weight:700;color:var(--gray500);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Video feedback tier</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <button class="mock-tier-btn active" data-tier="transcript" onclick="FullCasperMock.setTier('transcript')" style="padding:9px 6px;border-radius:8px;border:1px solid rgba(14,165,233,0.45);background:rgba(14,165,233,0.09);color:var(--teal3);font-size:0.78rem;font-weight:800;cursor:pointer;font-family:inherit;">Transcript</button>
            <button class="mock-tier-btn" data-tier="premium" onclick="FullCasperMock.setTier('premium')" style="padding:9px 6px;border-radius:8px;border:1px solid var(--gray200);background:var(--gray50);color:var(--gray600);font-size:0.78rem;font-weight:800;cursor:pointer;font-family:inherit;">Premium</button>
          </div>
          <div id="mockTierCopy" style="font-size:0.7rem;color:var(--gray400);line-height:1.45;margin-top:8px;">Transcript analysis reviews the substance of what you said. Premium adds voice and presentation analysis.</div>
        </div>

        <div style="background:#fff;border:1px solid rgba(14,165,233,0.24);border-radius:10px;padding:12px;margin-bottom:14px;">
          <div style="font-size:0.68rem;font-weight:800;color:var(--teal3);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Mock exam pass</div>
          <div id="mockPriceLine" style="font-size:0.86rem;color:var(--navy);line-height:1.45;">${renderPriceLine('transcript')}</div>
          <div style="font-size:0.7rem;color:var(--gray500);line-height:1.45;margin-top:7px;">Includes 7 written CASPer AI markings and 4 CASPer video analyses. CASPer Pro subscribers save about 30%.</div>
        </div>

        <div style="background:rgba(10,22,40,0.04);border:1px solid var(--gray200);border-radius:10px;padding:11px 12px;margin-bottom:14px;">
          <div style="font-size:0.72rem;color:var(--gray500);margin-bottom:4px;">Approximate exam time</div>
          <div style="font-size:1rem;font-weight:800;color:var(--navy);">65-85 minutes</div>
        </div>

        <button type="button" class="mock-checkout-btn" style="position:relative;z-index:81;pointer-events:auto;width:100%;padding:13px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.92rem;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(10,22,40,0.25);">
          Buy & Start Full Mock
        </button>
        <div class="mock-checkout-status" style="display:none;margin-top:9px;font-size:0.72rem;color:var(--gray500);line-height:1.45;text-align:center;"></div>
      </div>
    `;
    sidebar.appendChild(panel);
  }

  function setTier(tier) {
    config.tier = tier === 'premium' ? 'premium' : 'transcript';
    document.querySelectorAll('.mock-tier-btn').forEach(btn => {
      const selected = btn.dataset.tier === config.tier;
      btn.classList.toggle('active', selected);
      btn.style.border = selected ? '1px solid rgba(14,165,233,0.45)' : '1px solid var(--gray200)';
      btn.style.background = selected ? 'rgba(14,165,233,0.09)' : 'var(--gray50)';
      btn.style.color = selected ? 'var(--teal3)' : 'var(--gray600)';
    });
    const copy = byId('mockTierCopy');
    if (copy) copy.textContent = config.tier === 'premium'
      ? 'Premium uses the current video analysis flow: transcript, voice pacing, and presentation signals.'
      : 'Transcript analysis reviews the substance of what you said, without sending visual snapshots.';
    const price = byId('mockPriceLine');
    if (price) price.innerHTML = renderPriceLine(config.tier);
  }

  function activateMockMode() {
    active = true;
    document.querySelectorAll('.mode-pill').forEach(pill => pill.classList.remove('active-casper', 'active-mmi', 'active-mock'));
    byId('modeMock')?.classList.add('active-mock');
    hideNormalPanels();
    setStationChrome(false);
    byId('casperMockConfigPanel')?.style.setProperty('display', 'block');
    ensureMainArea();
    renderIdle();
  }

  function deactivateMockMode() {
    active = false;
    started = false;
    window.K2_ACTIVE_CASPER_MOCK = null;
    restoreSubmit();
    clearInterval(breakTimer);
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

  function hideNormalPanels() {
    ['categoryCard','casperCategoryCard','mmiCategoryCard','mmiOptionsCard','webcamPanel','startBtn','scenarioCard','bottomRail','reviewPanel'].forEach(id => {
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

  function renderIdle() {
    const area = ensureMainArea();
    if (!area) return;
    area.innerHTML = `
      <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:34px 32px;text-align:center;">
        <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:10px;">Full CASPer Mock Exam</div>
        <h2 style="font-size:1.7rem;line-height:1.2;color:var(--navy);margin:0 0 10px;">Train the whole test, not just isolated stations.</h2>
        <p style="font-size:0.94rem;color:var(--gray600);line-height:1.7;max-width:660px;margin:0 auto 24px;">This mock follows the current official sequence: 4 video scenarios first, then 7 typed scenarios. Use it once you have warmed up with single stations and want realistic pacing, fatigue, and format pressure.</p>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:720px;margin:0 auto 26px;text-align:left;">
          <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:14px;">
            <div style="font-size:0.78rem;font-weight:800;color:var(--navy);margin-bottom:4px;">4 video stations</div>
            <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;">Two questions per scenario, shown one at a time, one minute per answer.</div>
          </div>
          <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:14px;">
            <div style="font-size:0.78rem;font-weight:800;color:var(--navy);margin-bottom:4px;">7 typed stations</div>
            <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;">Two questions together, 3:30 total writing time after reflection.</div>
          </div>
          <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:14px;">
            <div style="font-size:0.78rem;font-weight:800;color:var(--navy);margin-bottom:4px;">Real breaks</div>
            <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;">Optional 10-minute and 5-minute breaks built into the flow.</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:640px;margin:0 auto 24px;text-align:left;">
          <div style="border:1px solid rgba(14,165,233,0.22);background:rgba(14,165,233,0.05);border-radius:12px;padding:15px;">
            <div style="font-size:0.72rem;font-weight:800;color:var(--teal3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Transcript Mock</div>
            <div style="font-size:1.35rem;font-weight:900;color:var(--navy);">$59 <span style="font-size:0.8rem;color:var(--gray400);font-weight:700;">or $41 Pro</span></div>
            <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;margin-top:6px;">7 written markings + 4 transcript video analyses. $69 credit-equivalent value.</div>
          </div>
          <div style="border:1px solid rgba(124,58,237,0.24);background:rgba(124,58,237,0.06);border-radius:12px;padding:15px;">
            <div style="font-size:0.72rem;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Premium Mock</div>
            <div style="font-size:1.35rem;font-weight:900;color:var(--navy);">$79 <span style="font-size:0.8rem;color:var(--gray400);font-weight:700;">or $55 Pro</span></div>
            <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;margin-top:6px;">7 written markings + 4 premium video analyses. $97 credit-equivalent value.</div>
          </div>
        </div>
        <button type="button" class="mock-checkout-btn" style="position:relative;z-index:81;pointer-events:auto;padding:13px 30px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.94rem;font-weight:800;cursor:pointer;font-family:inherit;">Buy & Start Full Mock</button>
        <div class="mock-checkout-status" style="display:none;margin-top:10px;font-size:0.78rem;color:var(--gray500);line-height:1.45;"></div>
      </div>
    `;
  }

  function startMock() {
    active = true;
    if (!window.Key2MDAuth) {
      setCheckoutState(false, 'The login system is still loading. Please refresh the page and try again.');
      alert('The login system is still loading. Please refresh the page and try again.');
      return;
    }
    if (!window.Key2MDAuth.isLoggedIn()) {
      if (typeof window.Key2MDAuth.showAuthModal === 'function') {
        window.Key2MDAuth.showAuthModal('signup');
      } else {
        setCheckoutState(false, 'Please log in or create an account before starting the mock.');
        alert('Please log in or create an account before starting the mock.');
      }
      return;
    }

    if (!hasMockPass(config.tier)) {
      setCheckoutState(true, `Opening secure checkout for the ${tierLabel(config.tier)} Full CASPer Mock...`);
      checkoutMock(config.tier).catch(err => {
        setCheckoutState(false, err.message || 'Could not start checkout. Please try again.');
        alert(err.message || 'Could not start checkout. Please try again.');
      });
      return;
    }

    const casperPool = window.STATIONS || [];
    if (casperPool.length < VIDEO_COUNT + TYPED_COUNT) {
      alert('Not enough stations are available to build a full CASPer mock.');
      return;
    }

    const selected = balancedPick(casperPool, VIDEO_COUNT + TYPED_COUNT);
    const videoStations = selected.slice(0, VIDEO_COUNT);
    const typedStations = selected.slice(VIDEO_COUNT);
    const videos = videoStations.map(station => ({ type: 'video', station }));
    const typed = typedStations.map(station => ({ type: 'typed', station }));
    sequence = [...videos, ...typed];
    results = [];
    index = 0;
    started = true;
    window.K2_ACTIVE_CASPER_MOCK = { tier: config.tier };
    byId('casperMockMainArea')?.style.setProperty('display', 'none');
    launchCurrent();
  }

  function launchCurrent() {
    const item = sequence[index];
    if (!item) {
      renderDebrief();
      return;
    }

    clearInterval(breakTimer);
    hideNormalPanels();
    setStationChrome(true);
    byId('casperMockConfigPanel')?.style.setProperty('display', 'block');
    byId('scenarioCard')?.style.setProperty('display', '');
    renderProgress();

    const bridge = window.K2PracticeBridge;
    if (!bridge) return;

    if (item.type === 'video') {
      patchSubmitForVideo();
      bridge.setupSingleStation(item.station, 'mmi', {
        preset: VIDEO_PRESET,
        premium: config.tier === 'premium',
        specialist: false,
      });
      const instruction = byId('speakingInstruction');
      if (instruction) {
        instruction.innerHTML = '<strong>CASPer video response</strong> - answer each question aloud. This mock uses one minute per response, matching the current video section.';
      }
    } else {
      restoreSubmit();
      bridge.setupSingleStation(item.station, 'casper', {
        timerMode: 'standard',
        readingTime: CASPER_REFLECTION_SECONDS,
        writingTime: CASPER_TYPED_SECONDS,
      });
    }
    hideNormalPanelsExceptStation();
    renderProgress();
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
          <div style="margin-left:auto;font-size:0.76rem;color:var(--gray400);">${completed} complete</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${dots}</div>
      </div>
    `;
  }

  function patchSubmitForVideo() {
    if (originalSubmitMMI || typeof window.submitMMIForFeedback !== 'function') return;
    originalSubmitMMI = window.submitMMIForFeedback;
    window.submitMMIForFeedback = async function patchedMockSubmit() {
      const before = window._lastMMIFeedback;
      await originalSubmitMMI.apply(this, arguments);
      const after = window._lastMMIFeedback;
      if (after && after !== before) {
        const wrap = byId('aiFeedbackWrapMMI');
        if (wrap && !byId('mockContinueVideoBtn')) {
          const btn = document.createElement('button');
          btn.id = 'mockContinueVideoBtn';
          btn.textContent = 'Continue mock';
          btn.style.cssText = 'margin-top:14px;padding:11px 22px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.86rem;font-weight:800;cursor:pointer;font-family:inherit;';
          btn.onclick = () => completeAndAdvance(after);
          wrap.appendChild(btn);
        }
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
        bridge.clearTimer();
        bridge.startWriting();
        return true;
      }
      if (phase === 'writing') {
        bridge.clearTimer();
        bridge.stopRecording();
        bridge.setPhase('done');
        return true;
      }
      if (phase === 'done') {
        const wrap = byId('aiFeedbackWrapMMI');
        if (wrap && !wrap.querySelector('.mmi-feedback')) {
          wrap.innerHTML = `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:13px 15px;font-size:0.82rem;color:#78350f;margin-top:10px;"><strong>Video feedback required for mock scoring.</strong><br>Choose transcript or premium in the sidebar, then submit this recording for analysis before continuing.</div>` + wrap.innerHTML;
          wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        }
        completeAndAdvance(window._lastMMIFeedback || null);
      }
      return true;
    }

    if (phase === 'reading') {
      bridge.clearTimer();
      bridge.startWriting();
      return true;
    }
    if (phase === 'writing') {
      bridge.clearTimer();
      bridge.saveAnswer();
      bridge.setPhase('done');
      return true;
    }
    if (phase === 'done') {
      bridge.saveAnswer();
      completeAndAdvance(bridge.getCurrentHistory());
    }
    return true;
  }

  function completeAndAdvance(payload) {
    const bridge = window.K2PracticeBridge;
    const item = sequence[index];
    const current = bridge?.getCurrentHistory?.();
    results.push({
      type: item.type,
      station: item.station,
      answer: current?.answer || '',
      score: current?.score ?? null,
      feedback: item.type === 'video' ? payload : current?.feedback || null,
      tier: item.type === 'video' ? config.tier : 'typed',
    });
    bridge?.completeCurrentStation?.();

    const nextIndex = index + 1;
    if (nextIndex === VIDEO_COUNT) {
      renderBreak(VIDEO_BREAK_SECONDS, 'Video section complete', 'Take the optional 10-minute break before the typed section, just like the real test.');
      return;
    }
    if (nextIndex === VIDEO_COUNT + 4) {
      renderBreak(TYPED_BREAK_SECONDS, 'Typed station 4 complete', 'Take the optional 5-minute break before the final typed stations.');
      return;
    }

    index = nextIndex;
    launchCurrent();
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
    area.innerHTML = `
      <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:38px 32px;text-align:center;">
        <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Optional break</div>
        <h2 style="font-size:1.45rem;color:var(--navy);margin:0 0 8px;">${esc(title)}</h2>
        <p style="font-size:0.9rem;color:var(--gray600);line-height:1.6;max-width:520px;margin:0 auto 22px;">${esc(copy)}</p>
        <div id="mockBreakTimer" style="font-size:3.2rem;font-weight:900;color:var(--navy);font-variant-numeric:tabular-nums;margin-bottom:18px;">${formatTime(breakLeft)}</div>
        <button onclick="FullCasperMock.skipBreak()" style="padding:11px 24px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.86rem;font-weight:800;cursor:pointer;font-family:inherit;">Continue now</button>
      </div>
    `;
    breakTimer = setInterval(() => {
      breakLeft--;
      const el = byId('mockBreakTimer');
      if (el) el.textContent = formatTime(Math.max(0, breakLeft));
      if (breakLeft <= 0) skipBreak();
    }, 1000);
  }

  function skipBreak() {
    clearInterval(breakTimer);
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
    const score = Number(feedback?.overall?.score);
    return Number.isFinite(score) ? score : null;
  }

  function renderDebrief() {
    started = false;
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

    const typed = results.filter(r => r.type === 'typed');
    const videos = results.filter(r => r.type === 'video');
    const typedScores = typed.map(r => Number(r.score)).filter(Number.isFinite);
    const videoScores = videos.map(r => videoScore(r.feedback)).filter(Number.isFinite);
    const typedAvg = typedScores.length ? (typedScores.reduce((a,b) => a + b, 0) / typedScores.length).toFixed(1) : '-';
    const videoAvg = videoScores.length ? (videoScores.reduce((a,b) => a + b, 0) / videoScores.length).toFixed(1) : '-';
    const answeredTyped = typed.filter(r => r.answer && r.answer.trim().length > 30).length;
    const oneThing = buildOneThing(typedScores, videoScores);

    area.innerHTML = `
      <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;overflow:hidden;">
        <div style="background:var(--navy);padding:30px 32px;color:#fff;">
          <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.52);margin-bottom:8px;">Full mock complete</div>
          <h2 style="font-size:1.8rem;line-height:1.2;margin:0 0 8px;">You completed the full CASPer sequence.</h2>
          <p style="font-size:0.9rem;color:rgba(255,255,255,0.68);line-height:1.6;max-width:680px;margin:0;">Use this as an exam-condition snapshot: video comfort, typed stamina, and how much quality held up across 11 stations.</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding:24px 32px;border-bottom:1px solid var(--gray100);">
          <div class="stat-mini"><span class="stat-mini-num">${results.length}</span><span class="stat-mini-label">Stations done</span></div>
          <div class="stat-mini"><span class="stat-mini-num">${videoAvg}</span><span class="stat-mini-label">Video avg /5</span></div>
          <div class="stat-mini"><span class="stat-mini-num">${typedAvg}</span><span class="stat-mini-label">Typed avg /10</span></div>
          <div class="stat-mini"><span class="stat-mini-num">${answeredTyped}/7</span><span class="stat-mini-label">Typed answered</span></div>
        </div>
        <div style="padding:24px 32px;">
          <div style="background:linear-gradient(135deg,#0a1628,#0d2a52);color:#fff;border-radius:14px;padding:20px 22px;margin-bottom:22px;">
            <div style="font-size:0.66rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.52);margin-bottom:8px;">The one thing</div>
            <div style="font-size:1rem;font-weight:750;line-height:1.6;">${esc(oneThing)}</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:22px;">
            ${sectionSummary('Video section', videos, 'video')}
            ${sectionSummary('Typed section', typed, 'typed')}
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button onclick="FullCasperMock.startMock()" class="btn-restart">Start another mock</button>
            <button onclick="setMode('casper');FullCasperMock.deactivateMockMode();" class="btn-restart btn-restart-outline">Return to practice</button>
            <button onclick="openEnquiry('CASPer Full Mock Review')" class="btn-restart btn-restart-outline">Ask Dan to review this</button>
          </div>
        </div>
      </div>
    `;
  }

  function buildOneThing(typedScores, videoScores) {
    if (videoScores.length && videoScores.reduce((a,b) => a + b, 0) / videoScores.length < 3) {
      return 'Prioritise video response clarity: answer the question directly in the first sentence, then add one concrete action and one trade-off.';
    }
    if (typedScores.length && typedScores.reduce((a,b) => a + b, 0) / typedScores.length < 6) {
      return 'Prioritise typed response depth: move beyond empathy statements by naming the competing duties and choosing a specific next step.';
    }
    return 'Your next improvement is stamina: repeat this mock under full timing and check whether your final four typed responses stay as specific as your early stations.';
  }

  function sectionSummary(title, rows, type) {
    const items = rows.map((r, i) => {
      const score = type === 'video' ? videoScore(r.feedback) : r.score;
      const scoreText = score == null ? 'No score' : (type === 'video' ? `${score}/5` : `${score}/10`);
      const sub = type === 'video'
        ? (r.feedback?.overall?.biggest_improvement || r.feedback?.overall?.biggest_strength || 'Feedback captured.')
        : (r.feedback?.improvements || r.answer?.slice(0, 120) || 'No typed response captured.');
      return `
        <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray100);">
          <div style="width:26px;height:26px;border-radius:50%;background:var(--gray100);color:var(--gray600);display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:800;flex-shrink:0;">${i + 1}</div>
          <div style="min-width:0;flex:1;">
            <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
              <div style="font-size:0.8rem;font-weight:800;color:var(--navy);">${esc(r.station.category || 'Station')}</div>
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
        <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;margin:0 0 18px;">Single stations build skill. The full mock tests the thing students underestimate: switching from video to typed responses while tired.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button onclick="document.getElementById('mockNudgeOverlay')?.remove();setMode('mock');FullCasperMock.activateMockMode();" style="flex:1;min-width:180px;padding:12px 18px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.88rem;font-weight:800;cursor:pointer;font-family:inherit;">Start full mock</button>
          <button onclick="document.getElementById('mockNudgeOverlay')?.remove();" style="padding:12px 18px;border-radius:50px;border:1px solid var(--gray200);background:#fff;color:var(--gray600);font-size:0.88rem;font-weight:750;cursor:pointer;font-family:inherit;">Keep practising</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    activateMockMode,
    deactivateMockMode,
    startMock,
    setTier,
    checkoutMock,
    skipBreak,
  };
})();
