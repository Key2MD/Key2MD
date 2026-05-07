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

  function checkoutButtonText() {
    return `Buy ${tierLabel(config.tier)} Mock`;
  }

  function setCheckoutState(isBusy, message = '') {
    document.querySelectorAll('.mock-checkout-btn').forEach(btn => {
      btn.disabled = isBusy;
      btn.style.opacity = isBusy ? '0.72' : '1';
      btn.textContent = isBusy ? 'Redirecting to Stripe...' : checkoutButtonText();
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
            <button class="mock-tier-btn active" data-mock-tier="transcript" onclick="FullCasperMock.setTier('transcript')" style="padding:9px 6px;border-radius:8px;border:1px solid rgba(14,165,233,0.45);background:rgba(14,165,233,0.09);color:var(--teal3);font-size:0.78rem;font-weight:800;cursor:pointer;font-family:inherit;">Transcript</button>
            <button class="mock-tier-btn" data-mock-tier="premium" onclick="FullCasperMock.setTier('premium')" style="padding:9px 6px;border-radius:8px;border:1px solid var(--gray200);background:var(--gray50);color:var(--gray600);font-size:0.78rem;font-weight:800;cursor:pointer;font-family:inherit;">Premium</button>
          </div>
          <div id="mockTierCopy" data-mock-tier-copy="sidebar" style="font-size:0.7rem;color:var(--gray400);line-height:1.45;margin-top:8px;">Transcript analysis reviews the substance of what you said. Premium adds voice and presentation analysis.</div>
        </div>

        <div style="background:#fff;border:1px solid rgba(14,165,233,0.24);border-radius:10px;padding:12px;margin-bottom:14px;">
          <div style="font-size:0.68rem;font-weight:800;color:var(--teal3);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Mock exam pass</div>
          <div id="mockPriceLine" data-mock-price-line style="font-size:0.86rem;color:var(--navy);line-height:1.45;">${renderPriceLine('transcript')}</div>
          <div style="font-size:0.7rem;color:var(--gray500);line-height:1.45;margin-top:7px;">Includes 7 written CASPer AI markings and 4 CASPer video analyses. CASPer Pro subscribers save about 30%.</div>
        </div>

        <div style="background:rgba(10,22,40,0.04);border:1px solid var(--gray200);border-radius:10px;padding:11px 12px;margin-bottom:14px;">
          <div style="font-size:0.72rem;color:var(--gray500);margin-bottom:4px;">Approximate exam time</div>
          <div style="font-size:1rem;font-weight:800;color:var(--navy);">65-85 minutes</div>
        </div>

        <button type="button" class="mock-checkout-btn" style="position:relative;z-index:81;pointer-events:auto;width:100%;padding:13px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.92rem;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(10,22,40,0.25);">
          ${checkoutButtonText()}
        </button>
        <div class="mock-checkout-status" style="display:none;margin-top:9px;font-size:0.72rem;color:var(--gray500);line-height:1.45;text-align:center;"></div>
      </div>
    `;
    sidebar.appendChild(panel);
  }

  function setTier(tier) {
    config.tier = tier === 'premium' ? 'premium' : 'transcript';
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
    setTier(config.tier);
  }

  function startMock() {
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

  function average(values) {
    const nums = values.map(Number).filter(Number.isFinite);
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
      const score = Number(item.score);
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
      return Number.isFinite(score) ? score * 2 : null;
    }
    const score = Number(row.score);
    return Number.isFinite(score) ? Math.max(1, Math.min(10, score)) : null;
  }

  function rowScoreLabel(row) {
    if (row.type === 'video') {
      const score = videoScore(row.feedback);
      return Number.isFinite(score) ? `${score}/5` : 'No score';
    }
    const score = Number(row.score);
    return Number.isFinite(score) ? `${round1(score)}/10` : 'No score';
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
        if (Number.isFinite(score)) scores.push(Math.max(1, Math.min(5, score)) * 2);
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

  function buildMockReport(rows) {
    const scored = rows.map(r => r.score10).filter(Number.isFinite);
    const overallAvg = round1(average(scored));
    const criteria = buildCriterionReport(rows);
    const stamina = buildStaminaReport(rows);
    const patterns = buildPatternReport(rows);
    const categories = buildCategoryReport(rows);
    const interpretation = buildInterpretation(overallAvg);
    const report = { rows, overallAvg, criteria, stamina, patterns, categories, interpretation };
    report.oneThing = buildOneThing(report);
    return report;
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

    const rows = buildRows();
    const typed = rows.filter(r => r.type === 'typed');
    const videos = rows.filter(r => r.type === 'video');
    const typedScores = typed.map(r => Number(r.score)).filter(Number.isFinite);
    const videoScores = videos.map(r => videoScore(r.feedback)).filter(Number.isFinite);
    const typedAvg = typedScores.length ? round1(average(typedScores)) : '-';
    const videoAvg = videoScores.length ? round1(average(videoScores)) : '-';
    const answeredTyped = typed.filter(r => r.answer && r.answer.trim().length > 30).length;
    const report = buildMockReport(rows);

    area.innerHTML = `
      <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;overflow:hidden;">
        <div style="background:var(--navy);padding:30px 32px;color:#fff;">
          <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.52);margin-bottom:8px;">Full mock complete</div>
          <h2 style="font-size:1.8rem;line-height:1.2;margin:0 0 8px;">You completed the full CASPer sequence.</h2>
          <p style="font-size:0.9rem;color:rgba(255,255,255,0.68);line-height:1.6;max-width:760px;margin:0;">This report compares your mock against the Key2MD cohort: a competitive group of real applicants who are actively preparing. It is not an official Acuity score, but it is a useful practice signal.</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px;padding:24px 32px;border-bottom:1px solid var(--gray100);">
          <div class="stat-mini"><span class="stat-mini-num">${results.length}</span><span class="stat-mini-label">Stations done</span></div>
          <div class="stat-mini"><span class="stat-mini-num">${report.overallAvg ?? '-'}</span><span class="stat-mini-label">Overall /10</span></div>
          <div class="stat-mini"><span class="stat-mini-num">${videoAvg}</span><span class="stat-mini-label">Video avg /5</span></div>
          <div class="stat-mini"><span class="stat-mini-num">${typedAvg}</span><span class="stat-mini-label">Typed avg /10</span></div>
          <div class="stat-mini"><span class="stat-mini-num">${answeredTyped}/7</span><span class="stat-mini-label">Typed answered</span></div>
        </div>
        <div style="padding:24px 32px;">
          ${renderInterpretation(report)}
          ${renderOneThing(report.oneThing)}

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:22px;">
            ${renderCriterionHeatmap(report.criteria)}
            ${renderStamina(report.stamina)}
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:22px;">
            ${renderPatternReport(report.patterns, report.criteria)}
            ${renderCategoryReport(report.categories)}
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:22px;">
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

  function card(title, body, extra = '') {
    return `
      <div style="border:1px solid var(--gray200);border-radius:14px;padding:18px 20px;background:#fff;">
        <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--teal3);margin-bottom:10px;">${esc(title)}</div>
        ${body}
        ${extra}
      </div>
    `;
  }

  function renderInterpretation(report) {
    const toneColor = report.interpretation.tone === 'strong' ? '#16a34a'
      : report.interpretation.tone === 'risk' ? '#dc2626'
      : report.interpretation.tone === 'caution' ? '#d97706'
      : 'var(--teal3)';
    return `
      <div style="border:1px solid rgba(14,165,233,0.22);background:linear-gradient(135deg,rgba(14,165,233,0.08),rgba(255,255,255,1));border-radius:14px;padding:20px 22px;margin-bottom:16px;">
        <div style="font-size:0.66rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Overall mark interpretation</div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div style="min-width:220px;flex:1;">
            <div style="font-size:1.25rem;font-weight:900;color:${toneColor};line-height:1.25;margin-bottom:6px;">${esc(report.interpretation.band)}</div>
            <div style="font-size:0.86rem;color:var(--gray600);line-height:1.65;">${esc(report.interpretation.text)}</div>
          </div>
          <div style="background:#fff;border:1px solid var(--gray200);border-radius:12px;padding:13px 15px;min-width:160px;text-align:center;">
            <div style="font-size:1.8rem;font-weight:900;color:var(--navy);">${report.overallAvg ?? '-'}</div>
            <div style="font-size:0.7rem;font-weight:800;color:var(--gray400);text-transform:uppercase;letter-spacing:0.08em;">Key2MD cohort /10</div>
          </div>
        </div>
        <div style="font-size:0.74rem;color:var(--gray500);line-height:1.55;margin-top:12px;padding-top:12px;border-top:1px solid rgba(14,165,233,0.16);">Guide only: 6.5+ is likely a Q4-style signal in this competitive prep cohort if repeatable; 5.5-6.5 is probably a Q3-style signal. High scores are intentionally difficult because this cohort is mostly serious applicants, not a random test-taking population.</div>
      </div>
    `;
  }

  function renderOneThing(oneThing) {
    return `
      <div style="background:linear-gradient(135deg,#0a1628,#0d2a52);color:#fff;border-radius:14px;padding:20px 22px;margin-bottom:22px;">
        <div style="font-size:0.66rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.52);margin-bottom:8px;">The one thing to fix</div>
        <div style="font-size:1.05rem;font-weight:850;line-height:1.35;margin-bottom:8px;">${esc(oneThing.title)}</div>
        <div style="font-size:0.9rem;color:rgba(255,255,255,0.78);line-height:1.65;">${esc(oneThing.body)}</div>
        <div style="font-size:0.74rem;color:rgba(255,255,255,0.52);line-height:1.45;margin-top:10px;">Why this one: ${esc(oneThing.source)}</div>
      </div>
    `;
  }

  function renderCriterionHeatmap(criteria) {
    const rows = criteria.map(c => {
      const pct = Number.isFinite(c.avg) ? Math.max(4, Math.min(100, Math.round(c.avg * 10))) : 0;
      const color = !Number.isFinite(c.avg) ? 'var(--gray200)' : c.avg >= 7 ? '#16a34a' : c.avg >= 5.5 ? '#0ea5e9' : c.avg >= 4.5 ? '#d97706' : '#dc2626';
      return `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:4px;">
            <span style="font-size:0.78rem;font-weight:800;color:var(--navy);">${esc(c.label)}</span>
            <span style="font-size:0.76rem;font-weight:800;color:${color};">${Number.isFinite(c.avg) ? `${c.avg}/10` : '-'} <span style="color:var(--gray400);font-weight:600;">${c.n}x</span></span>
          </div>
          <div style="height:8px;background:var(--gray100);border-radius:5px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:5px;"></div>
          </div>
        </div>
      `;
    }).join('');
    return card('Criterion heatmap', `
      <div style="font-size:0.78rem;color:var(--gray500);line-height:1.5;margin-bottom:12px;">Averages combine written competency scores and CASPer video criterion scores where available. These are practice signals, not official CASPer sub-scores.</div>
      ${rows}
    `);
  }

  function renderStamina(stamina) {
    const color = stamina.tone === 'strong' ? '#16a34a' : stamina.tone === 'risk' ? '#dc2626' : '#0ea5e9';
    return card('Stamina pattern', `
      <div style="font-size:1rem;font-weight:850;color:${color};line-height:1.35;margin-bottom:8px;">${esc(stamina.label)}</div>
      <div style="font-size:0.84rem;color:var(--gray600);line-height:1.6;margin-bottom:12px;">${esc(stamina.body)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:10px;">
          <div style="font-size:0.68rem;color:var(--gray400);font-weight:800;text-transform:uppercase;">Typed 1-4</div>
          <div style="font-size:1.1rem;font-weight:900;color:var(--navy);">${stamina.typedEarlyAvg ?? '-'}</div>
        </div>
        <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:10px;">
          <div style="font-size:0.68rem;color:var(--gray400);font-weight:800;text-transform:uppercase;">Typed 5-7</div>
          <div style="font-size:1.1rem;font-weight:900;color:var(--navy);">${stamina.typedLateAvg ?? '-'}</div>
        </div>
      </div>
    `);
  }

  function renderPatternReport(patterns, criteria) {
    let body = '';
    if (patterns.length) {
      body = patterns.map(pattern => `
        <div style="padding:10px 0;border-bottom:1px solid var(--gray100);">
          <div style="font-size:0.82rem;font-weight:850;color:var(--navy);line-height:1.35;">${esc(pattern.label)}</div>
          <div style="font-size:0.76rem;color:var(--gray500);line-height:1.5;margin-top:3px;">${esc(pattern.action)}</div>
          <div style="font-size:0.7rem;color:var(--teal3);font-weight:800;margin-top:5px;">Seen in ${esc(pattern.stations.join(', '))}</div>
        </div>
      `).join('');
    } else {
      const weak = criteria.find(c => Number.isFinite(c.avg));
      body = `<div style="font-size:0.84rem;color:var(--gray600);line-height:1.6;">No repeated text pattern appeared strongly enough across multiple stations. The clearest signal is currently your lowest criterion: <strong>${esc(weak?.label || 'awaiting data')}</strong>.</div>`;
    }
    return card('Cross-station patterns', body);
  }

  function renderCategoryReport(categories) {
    const rows = categories.slice(0, 5).map(cat => {
      const color = cat.avg >= 7 ? '#16a34a' : cat.avg >= 5.5 ? '#0ea5e9' : cat.avg >= 4.5 ? '#d97706' : '#dc2626';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--gray100);">
          <div style="min-width:0;">
            <div style="font-size:0.82rem;font-weight:850;color:var(--navy);">${esc(cat.category)}</div>
            <div style="font-size:0.7rem;color:var(--gray400);">${esc(cat.stations.join(', '))} - ${cat.n} station${cat.n === 1 ? '' : 's'}</div>
          </div>
          <div style="font-size:0.82rem;font-weight:900;color:${color};white-space:nowrap;">${cat.avg}/10</div>
        </div>
      `;
    }).join('');
    return card('Category weaknesses', `
      <div style="font-size:0.78rem;color:var(--gray500);line-height:1.5;margin-bottom:8px;">Lowest categories first. Treat one-station categories as a clue, not a verdict.</div>
      ${rows || '<div style="font-size:0.84rem;color:var(--gray400);">No scored categories yet.</div>'}
    `);
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
