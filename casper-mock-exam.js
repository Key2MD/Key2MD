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
  const STATION_TRANSITION_SECONDS = 10;
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
  let stationToken = 0;
  let advancing = false;
  let rulesAccepted = false;
  let finalVideoRows = [];
  let finalReviewRows = [];
  let doneMonitorTimer = null;
  let transitionTimer = null;
  let transitionActive = false;
  let transitionNextIndex = null;
  let mockAttemptId = null;
  let savedAttemptId = null;
  let latestReport = null;

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

  function returnedFromCheckout(tier = config.tier) {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mock_payment') === 'success' && (params.get('mock_tier') || tier) === tier) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function apiBase() {
    return window.API_BASE || 'https://key2md-api.brittainmbbs.workers.dev';
  }

  function authTokenOrThrow() {
    const auth = getAuth();
    const token = auth?.getToken?.();
    if (!token) throw new Error('Please log in before starting the mock.');
    return token;
  }

  function clearDoneMonitor() {
    clearInterval(doneMonitorTimer);
    doneMonitorTimer = null;
  }

  function clearTransitionTimer() {
    clearInterval(transitionTimer);
    transitionTimer = null;
    transitionActive = false;
    transitionNextIndex = null;
  }

  function hideStationReflection() {
    ['stationReflectionWrap', 'stationReflection'].forEach(id => {
      const el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function hasFullMockPass(status, tier = config.tier) {
    return !!status?.active
      && status.tier === tier
      && Number(status.video_remaining || 0) >= VIDEO_COUNT
      && Number(status.typed_remaining || 0) >= TYPED_COUNT;
  }

  async function fetchMockPassStatus() {
    const auth = getAuth();
    const token = auth?.getToken?.();
    if (!token) return null;
    const res = await fetch(`${apiBase()}/api/casper-mock/status`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  }

  async function hasMockPass(tier = config.tier) {
    const justReturned = returnedFromCheckout(tier);
    const attempts = justReturned ? 6 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const status = await fetchMockPassStatus();
      if (hasFullMockPass(status, tier)) return true;
      if (justReturned && attempt < attempts - 1) await sleep(1200);
    }
    if (justReturned) {
      throw new Error('Your payment was successful, but Stripe is still activating your mock pass. Wait a few seconds, then press Start again.');
    }
    return false;
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
    const res = await fetch(`${apiBase()}/api/casper-mock/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ tier, success_url: successUrl, cancel_url: cancelUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not start mock checkout');
    if (!data.checkout_url) throw new Error('Checkout did not return a Stripe link. Make sure the patched worker is deployed.');
    window.location.href = data.checkout_url;
  }

  async function startPrivateMockAttempt() {
    const token = authTokenOrThrow();
    const res = await fetch(`${apiBase()}/api/casper-mock/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ tier: config.tier, mock_slug: 'full-casper-mock-1' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'Could not prepare the private mock stations.');
    if (!data.attempt_id || !Array.isArray(data.sequence) || data.sequence.length < VIDEO_COUNT + TYPED_COUNT) {
      throw new Error('The private mock bank is not ready yet. Check the D1 seed import.');
    }
    return data;
  }

  async function loadPrivateMockStation(item) {
    if (!item || item.station) return item?.station || null;
    const token = authTokenOrThrow();
    const params = new URLSearchParams({
      attempt_id: mockAttemptId,
      station_order: String(item.order || index + 1),
    });
    const res = await fetch(`${apiBase()}/api/casper-mock/station?${params.toString()}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'Could not load the next private mock station.');
    if (!data.station?.scenario || !data.station?.prompt1) throw new Error('The private mock station is incomplete.');
    item.station = data.station;
    item.type = data.type === 'video' ? 'video' : 'typed';
    item.order = Number(data.order || item.order || index + 1);
    return item.station;
  }

  function tierLabel(tier = config.tier) {
    return tier === 'premium' ? 'Premium' : 'Transcript';
  }

  function checkoutButtonText() {
    return `Buy & Enter ${tierLabel(config.tier)} Mock`;
  }

  function setCheckoutState(isBusy, message = '', busyLabel = 'Redirecting to Stripe...') {
    document.querySelectorAll('.mock-checkout-btn').forEach(btn => {
      btn.disabled = isBusy;
      btn.style.opacity = isBusy ? '0.72' : '1';
      btn.textContent = isBusy ? busyLabel : checkoutButtonText();
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
          Official current sequence: 4 video scenarios, 10-minute optional break, then 7 typed scenarios with a 5-minute optional break after typed station 4. All 11 stations are completely new and handwritten by Dan.
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
          <div style="font-size:0.7rem;color:var(--gray500);line-height:1.45;margin-top:7px;">Includes 11 new handwritten stations by Dan, 7 written CASPer AI markings, and 4 CASPer video analyses. CASPer Pro subscribers save about 30%.</div>
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
    rulesAccepted = false;
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

  function refreshPricing() {
    setTier(config.tier);
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
    advancing = false;
    rulesAccepted = false;
    stationToken += 1;
    window.K2_ACTIVE_CASPER_MOCK = null;
    restoreSubmit();
    clearDoneMonitor();
    clearTransitionTimer();
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

  function keepMockModeChrome() {
    byId('modeCasper')?.classList.remove('active-casper');
    byId('modeMMI')?.classList.remove('active-mmi');
    byId('modeMock')?.classList.add('active-mock');
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
        <h2 style="font-size:1.7rem;line-height:1.2;color:var(--navy);margin:0 0 10px;">Practise the full sequence in one sitting.</h2>
        <p style="font-size:0.94rem;color:var(--gray600);line-height:1.7;max-width:660px;margin:0 auto 24px;">Exam-mode CASPer practice: 4 video-response scenarios first, then 7 typed-response scenarios, with the optional breaks built in. The stations are completely new and handwritten by Dan, so it feels like a fresh exam rather than recycled practice.</p>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:720px;margin:0 auto 26px;text-align:left;">
          <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:14px;">
            <div style="font-size:0.78rem;font-weight:800;color:var(--navy);margin-bottom:4px;">4 video stations</div>
            <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;">Camera check first, then two questions per scenario, one minute per answer.</div>
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

  async function startMock() {
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

    setCheckoutState(true, 'Checking your mock exam pass...', 'Checking pass...');
    let passReady = false;
    try {
      passReady = await hasMockPass(config.tier);
    } catch (err) {
      setCheckoutState(false, err.message || 'Could not confirm your mock pass. Please try again.');
      return;
    }

    if (!passReady) {
      rulesAccepted = false;
      setCheckoutState(true, `Opening secure checkout for the ${tierLabel(config.tier)} Full CASPer Mock...`);
      checkoutMock(config.tier).catch(err => {
        setCheckoutState(false, err.message || 'Could not start checkout. Please try again.');
        alert(err.message || 'Could not start checkout. Please try again.');
      });
      return;
    }
    setCheckoutState(false);

    if (!rulesAccepted) {
      renderRulesGate();
      return;
    }

    beginMockExam().catch(err => {
      setCheckoutState(false, err.message || 'Could not start the mock.');
      alert(err.message || 'Could not start the mock.');
    });
  }

  async function beginMockExam() {
    setCheckoutState(true, 'Preparing your private mock stations...', 'Preparing...');
    const mock = await startPrivateMockAttempt();
    sequence = mock.sequence.slice(0, VIDEO_COUNT + TYPED_COUNT).map((entry, i) => ({
      type: entry.type === 'video' ? 'video' : 'typed',
      order: Number(entry.order || i + 1),
      station: null,
    }));
    results = [];
    index = 0;
    mockAttemptId = mock.attempt_id;
    savedAttemptId = null;
    latestReport = null;
    stationToken = 0;
    advancing = false;
    started = true;
    window.K2_ACTIVE_CASPER_MOCK = { tier: config.tier, attempt_id: mockAttemptId };
    setCheckoutState(false);
    byId('casperMockMainArea')?.style.setProperty('display', 'none');
    launchCurrent();
  }

  function renderRulesGate() {
    hideNormalPanels();
    setStationChrome(false);
    byId('casperMockConfigPanel')?.style.setProperty('display', 'block');
    const area = ensureMainArea();
    if (!area) return;
    area.style.display = 'block';
    area.innerHTML = `
      <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;overflow:hidden;">
        <div style="background:var(--navy);padding:26px 30px;color:#fff;">
          <div style="font-size:0.7rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.55);margin-bottom:8px;">Before you begin</div>
          <h2 style="font-size:1.55rem;line-height:1.25;margin:0 0 8px;">Full CASPer Mock Exam rules</h2>
          <p style="font-size:0.9rem;color:rgba(255,255,255,0.68);line-height:1.6;margin:0;max-width:720px;">Your mock pass is active. You are about to begin 11 completely new CASPer stations handwritten by Dan. Read this once, then proceed when you are ready to start the first video station.</p>
        </div>
        <div style="padding:26px 30px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-bottom:20px;">
            ${ruleCard('Sequence', '4 video-response scenarios first, then an optional 10-minute break, then 7 typed-response scenarios.')}
            ${ruleCard('Video section', 'Camera and microphone are required. The video timer starts only after the camera check, so permission issues will not burn exam time.')}
            ${ruleCard('Typed section', 'Each typed scenario gives a short reflection period, then 3:30 total writing time for two prompts.')}
            ${ruleCard('Breaks', 'You can take the built-in 10-minute and 5-minute breaks, or continue early. Leaving the page may interrupt the mock.')}
            ${ruleCard('Feedback', config.tier === 'premium' ? 'Premium includes transcript, voice, pacing, and presentation analysis for video stations.' : 'Transcript mock analyses what you said in video stations without voice or presentation scoring.')}
            ${ruleCard('Report', 'The final report compares your performance against the Key2MD cohort of serious, actively preparing applicants. It is a practice estimate, not an official Acuity result.')}
          </div>
          <div style="background:rgba(14,165,233,0.07);border:1px solid rgba(14,165,233,0.2);border-radius:12px;padding:14px 16px;font-size:0.82rem;color:var(--gray600);line-height:1.6;margin-bottom:18px;">
            Best setup: quiet room, charger plugged in, browser tab kept open, camera permission allowed, and no page refresh once the exam starts.
          </div>
          <div style="display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">
            <button type="button" onclick="FullCasperMock.activateMockMode()" style="padding:11px 18px;border-radius:50px;border:1px solid var(--gray200);background:#fff;color:var(--gray600);font-size:0.84rem;font-weight:800;cursor:pointer;font-family:inherit;">Back</button>
            <button type="button" onclick="FullCasperMock.proceedAfterRules()" style="padding:12px 24px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.9rem;font-weight:850;cursor:pointer;font-family:inherit;">I understand - proceed</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderProcessingScreen() {
    const pending = results.filter(r => r.feedbackTask).length;
    return `
      <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:38px 32px;text-align:center;">
        <div style="width:34px;height:34px;border:3px solid var(--gray200);border-top-color:var(--teal);border-radius:50%;animation:mmi-spin 0.8s linear infinite;margin:0 auto 16px;"></div>
        <div style="font-size:0.72rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Building your debrief</div>
        <h2 style="font-size:1.45rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">Analysing the full mock together.</h2>
        <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;max-width:620px;margin:0 auto;">Your station feedback has been submitted in the background. Keep this tab open while the final report pulls together video, typed responses, stamina, and cross-station patterns.</p>
        <div style="font-size:0.78rem;color:var(--gray400);margin-top:14px;">${pending} analysis task${pending === 1 ? '' : 's'} finalising</div>
      </div>
    `;
  }

  function withAnalysisTimeout(promise, row) {
    const label = `${row.type === 'video' ? 'Video' : 'Typed'} ${stationShort(row)}`;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label} analysis is taking too long. This report is shown with the completed analyses so far.`)), 8 * 60 * 1000);
      }),
    ]);
  }

  async function settleMockFeedbackTasks() {
    const tasks = results
      .map((row, idx) => ({ row, idx }))
      .filter(item => item.row.feedbackTask && !item.row.feedbackSettled);
    await Promise.all(tasks.map(async ({ row }) => {
      try {
        const data = await withAnalysisTimeout(row.feedbackTask, row);
        row.feedbackSettled = true;
        if (row.type === 'video') {
          row.feedback = data?.feedback || null;
          row.transcript = data?.transcript || '';
          row.rawFeedback = data || null;
          row.reviewId = data?.review_id || null;
          row.recordingKey = data?.recording_url || null;
        } else {
          row.score = Number.isFinite(Number(data?.score)) ? Number(data.score) : null;
          row.feedback = data?.feedback || null;
        }
      } catch (err) {
        row.feedbackSettled = true;
        row.processingError = err.message || 'Feedback processing failed.';
      }
    }));
  }

  function serialiseAttemptRows(rows = buildRows()) {
    return rows.map(row => ({
      type: row.type,
      order: row.order,
      localIndex: row.localIndex,
      station: row.station,
      answer: row.answer || '',
      score: row.score10,
      feedback: row.feedback || null,
      transcript: row.transcript || '',
      review_id: row.reviewId || row.rawFeedback?.review_id || null,
      recording_key: row.recordingKey || row.rawFeedback?.recording_url || null,
      duration_sec: row.durationSec || row.duration_sec || row.rawFeedback?.durationSec || null,
      tier: row.tier || (row.type === 'video' ? config.tier : 'typed'),
      processing_error: row.processingError || null,
    }));
  }

  async function saveMockAttempt(rows = buildRows(), report = latestReport) {
    const auth = getAuth();
    const token = auth?.getToken?.();
    if (!token || !mockAttemptId) throw new Error('Sign in required to save this mock attempt.');
    const res = await fetch(`${apiBase()}/api/casper-mock/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        attempt_id: mockAttemptId,
        tier: config.tier,
        completed_at: new Date().toISOString(),
        rows: serialiseAttemptRows(rows),
        report,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'Could not save mock attempt.');
    savedAttemptId = data.attempt_id || mockAttemptId;
    return savedAttemptId;
  }

  async function requestManualReview() {
    const status = byId('mockManualReviewStatus');
    const btn = byId('mockManualReviewBtn');
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Saving mock...'; }
      if (status) status.textContent = 'Saving your full mock securely...';
      const rows = buildRows();
      const attemptId = savedAttemptId || await saveMockAttempt(rows, latestReport);
      const auth = getAuth();
      const token = auth?.getToken?.();
      if (!token) throw new Error('Please sign in before requesting manual review.');
      if (btn) btn.textContent = 'Opening Stripe...';
      if (status) status.textContent = 'Opening secure Stripe checkout for $300 AUD...';
      const successUrl = `${window.location.origin}${window.location.pathname}?tab=mock&manual_review=success&attempt_id=${encodeURIComponent(attemptId)}`;
      const cancelUrl = `${window.location.origin}${window.location.pathname}?tab=mock&manual_review=cancelled&attempt_id=${encodeURIComponent(attemptId)}`;
      const res = await fetch(`${apiBase()}/api/casper-mock/manual-review/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ attempt_id: attemptId, success_url: successUrl, cancel_url: cancelUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.checkout_url) throw new Error(data.message || data.error || 'Could not start manual review checkout.');
      window.location.href = data.checkout_url;
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = "Request Dan's manual review - $300 AUD"; }
      if (status) status.textContent = err.message || 'Could not start manual review checkout.';
    }
  }

  function ruleCard(title, body) {
    return `
      <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:14px 15px;">
        <div style="font-size:0.72rem;font-weight:900;color:var(--navy);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">${esc(title)}</div>
        <div style="font-size:0.78rem;color:var(--gray500);line-height:1.5;">${esc(body)}</div>
      </div>
    `;
  }

  function proceedAfterRules() {
    rulesAccepted = true;
    beginMockExam().catch(err => {
      setCheckoutState(false, err.message || 'Could not start the mock.');
      alert(err.message || 'Could not start the mock.');
    });
  }

  function renderStationLoading() {
    setStationChrome(false);
    byId('scenarioCard')?.style.setProperty('display', 'none');
    const area = ensureMainArea();
    if (!area) return;
    area.style.display = 'block';
    area.innerHTML = `
      <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:34px 32px;text-align:center;">
        <div style="width:30px;height:30px;border:3px solid var(--gray200);border-top-color:var(--teal);border-radius:50%;animation:mmi-spin 0.8s linear infinite;margin:0 auto 14px;"></div>
        <div style="font-size:0.72rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Private station bank</div>
        <h2 style="font-size:1.35rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">Loading the next station.</h2>
        <p style="font-size:0.86rem;color:var(--gray500);line-height:1.6;margin:0;">Only this station is being sent to your browser.</p>
      </div>
    `;
  }

  function renderStationLoadError(message) {
    setStationChrome(false);
    byId('scenarioCard')?.style.setProperty('display', 'none');
    const area = ensureMainArea();
    if (!area) return;
    area.style.display = 'block';
    area.innerHTML = `
      <div style="background:#fff;border:1px solid rgba(220,38,38,0.22);border-radius:16px;padding:34px 32px;text-align:center;">
        <div style="font-size:0.72rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:#dc2626;margin-bottom:8px;">Station unavailable</div>
        <h2 style="font-size:1.35rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">Could not load this station.</h2>
        <p style="font-size:0.86rem;color:var(--gray600);line-height:1.6;margin:0 auto 18px;max-width:560px;">${esc(message || 'Please refresh and try again. Your mock pass remains on your account.')}</p>
        <button type="button" onclick="FullCasperMock.activateMockMode()" style="padding:11px 20px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.86rem;font-weight:800;cursor:pointer;font-family:inherit;">Back to mock start</button>
      </div>
    `;
  }

  async function launchCurrent() {
    const item = sequence[index];
    if (!item) {
      renderDebrief();
      return;
    }

    if (!item.station) {
      renderStationLoading();
      try {
        await loadPrivateMockStation(item);
      } catch (err) {
        renderStationLoadError(err.message);
        return;
      }
      byId('casperMockMainArea')?.style.setProperty('display', 'none');
    }

    stationToken += 1;
    advancing = false;
    transitionActive = false;
    clearDoneMonitor();
    clearTransitionTimer();
    clearInterval(breakTimer);
    hideNormalPanels();
    setStationChrome(true);
    byId('casperMockConfigPanel')?.style.setProperty('display', 'block');
    byId('scenarioCard')?.style.setProperty('display', '');
    renderProgress();

    const bridge = window.K2PracticeBridge;
    if (!bridge) return;

    if (item.type === 'video') {
      if (!window.webcamReady) {
        renderCameraGate();
        return;
      }
      beginVideoStation(item, bridge);
    } else {
      restoreSubmit();
      bridge.setupSingleStation(item.station, 'casper', {
        timerMode: 'standard',
        readingTime: CASPER_REFLECTION_SECONDS,
        writingTime: CASPER_TYPED_SECONDS,
      });
      keepMockModeChrome();
      hideStationReflection();
    }
    hideNormalPanelsExceptStation();
    renderProgress();
    startDoneMonitor(stationToken);
  }

  function renderCameraGate() {
    restoreSubmit();
    setStationChrome(false);
    byId('scenarioCard')?.style.setProperty('display', 'none');
    byId('webcamPanel')?.style.setProperty('display', 'none');
    const area = ensureMainArea();
    if (!area) return;
    area.style.display = 'block';
    const label = `Video station ${Math.min(index + 1, VIDEO_COUNT)} of ${VIDEO_COUNT}`;
    area.innerHTML = `
      <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:34px 32px;text-align:center;">
        <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:10px;">Camera check</div>
        <h2 style="font-size:1.55rem;line-height:1.25;color:var(--navy);margin:0 0 10px;">Ready for ${esc(label)}?</h2>
        <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;max-width:620px;margin:0 auto 22px;">The video timer will not start until your camera and microphone are available. Allow browser access, then begin the station.</p>
        <button type="button" id="mockCameraStartBtn" onclick="FullCasperMock.enableCameraAndStartVideoStation()" style="padding:13px 26px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.9rem;font-weight:850;cursor:pointer;font-family:inherit;">Enable camera & start station</button>
        <div id="mockCameraGateStatus" style="display:none;margin-top:12px;font-size:0.78rem;color:var(--gray500);line-height:1.55;"></div>
      </div>
    `;
    renderProgress();
  }

  async function enableCameraAndStartVideoStation() {
    const status = byId('mockCameraGateStatus');
    const btn = byId('mockCameraStartBtn');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.72';
      btn.textContent = 'Checking camera...';
    }
    if (status) {
      status.style.display = 'block';
      status.textContent = 'If your browser asks, choose Allow for camera and microphone.';
    }
    const ok = typeof window.initWebcam === 'function' ? await window.initWebcam() : !!window.webcamReady;
    if (ok || window.webcamReady) {
      byId('casperMockMainArea')?.style.setProperty('display', 'none');
      launchCurrent();
      return;
    }
    if (status) {
      status.style.color = '#dc2626';
      status.textContent = 'Camera access was not available. Check browser permissions, then try again.';
    }
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.textContent = 'Try camera again';
    }
  }

  function beginVideoStation(item, bridge) {
    patchSubmitForVideo();
    bridge.setupSingleStation(item.station, 'mmi', {
      preset: VIDEO_PRESET,
      premium: config.tier === 'premium',
      specialist: false,
    });
    keepMockModeChrome();
    const webcam = byId('webcamPanel');
    if (webcam) {
      webcam.classList.add('show');
      webcam.style.display = '';
    }
    const instruction = byId('speakingInstruction');
    if (instruction) {
      instruction.innerHTML = '<strong>CASPer video response</strong> - answer each question aloud. This mock uses one minute per response, matching the current video section.';
    }
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

  function startDoneMonitor(token) {
    clearDoneMonitor();
    doneMonitorTimer = setInterval(() => {
      if (!active || !started || token !== stationToken || transitionActive) return;
      hideStationReflection();
      const bridge = window.K2PracticeBridge;
      if (!bridge || bridge.getPhase?.() !== 'done') return;
      beginStationTransition(token);
    }, 500);
  }

  function patchSubmitForVideo() {
    if (originalSubmitMMI || typeof window.submitMMIForFeedback !== 'function') return;
    originalSubmitMMI = window.submitMMIForFeedback;
    window.submitMMIForFeedback = async function patchedMockSubmit() {
      const wrap = byId('aiFeedbackWrapMMI');
      if (wrap) {
        wrap.innerHTML = `<div style="background:#eff6ff;border:1px solid rgba(14,165,233,0.28);border-radius:10px;padding:13px 15px;font-size:0.82rem;color:#075985;margin-top:10px;"><strong>Mock mode saves feedback for the end.</strong><br>Finish the station and continue. Your AI analysis runs in the background.</div>`;
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
        byId('mmiSubmitWrap')?.style.setProperty('display', 'none');
        const wrap = byId('aiFeedbackWrapMMI');
        if (wrap) {
          wrap.innerHTML = `<div style="background:#eff6ff;border:1px solid rgba(14,165,233,0.28);border-radius:10px;padding:13px 15px;font-size:0.82rem;color:#075985;margin-top:10px;"><strong>Recording saved for the final report.</strong><br>Continue when you are ready. Your AI feedback will be shown after the full mock.</div>`;
        }
        beginStationTransition(stationToken);
        return true;
      }
      if (phase === 'done') {
        beginStationTransition(stationToken);
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
      byId('btnGetAIWrap')?.style.setProperty('display', 'none');
      hideStationReflection();
      beginStationTransition(stationToken);
      return true;
    }
    if (phase === 'done') {
      beginStationTransition(stationToken);
    }
    return true;
  }

  async function beginStationTransition(token = stationToken) {
    if (token !== stationToken || transitionActive || advancing) return;
    const bridge = window.K2PracticeBridge;
    const item = sequence[index];
    if (!bridge || !item) return;
    transitionActive = true;
    clearDoneMonitor();
    bridge.clearTimer?.();
    hideStationReflection();
    try {
      let submission = null;
      if (item.type === 'video') {
        bridge.stopRecording?.();
        await sleep(650);
        submission = bridge.submitMockVideoReview?.() || null;
      } else {
        bridge.saveAnswer?.();
        submission = bridge.submitMockWrittenReview?.() || bridge.getCurrentHistory?.();
      }
      completeAndAdvance(submission, token);
    } catch (err) {
      transitionActive = false;
      const wrap = item.type === 'video' ? byId('aiFeedbackWrapMMI') : byId('aiFeedbackWrap');
      if (wrap) {
        wrap.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:13px 15px;font-size:0.82rem;color:#991b1b;margin-top:10px;"><strong>Station could not be saved.</strong><br>${esc(err.message || 'Please try again before continuing.')}</div>`;
        wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  function completeAndAdvance(payload, token = stationToken) {
    if (token !== stationToken || advancing) return;
    advancing = true;
    stationToken += 1;
    clearDoneMonitor();
    const bridge = window.K2PracticeBridge;
    const item = sequence[index];
    if (!item) {
      advancing = false;
      return;
    }
    const current = bridge?.getCurrentHistory?.();
    const isVideoSubmission = payload?.kind === 'mock_video_submission';
    const isWrittenSubmission = payload?.kind === 'mock_written_submission';
    results.push({
      type: item.type,
      station: item.station,
      answer: isWrittenSubmission ? payload.answer || '' : current?.answer || '',
      score: isWrittenSubmission ? null : current?.score ?? null,
      feedback: null,
      feedbackTask: isVideoSubmission || isWrittenSubmission ? payload.promise : null,
      recordingUrl: isVideoSubmission ? payload.recordingUrl : null,
      durationSec: isVideoSubmission ? payload.durationSec : null,
      processingError: null,
      tier: item.type === 'video' ? config.tier : 'typed',
    });
    bridge?.completeCurrentStation?.();

    const nextIndex = index + 1;
    renderStationTransition(nextIndex, item.type);
  }

  function advanceAfterTransition(nextIndex) {
    clearTransitionTimer();
    if (nextIndex === VIDEO_COUNT) {
      advancing = false;
      renderBreak(VIDEO_BREAK_SECONDS, 'Video section complete', 'Take the optional 10-minute break before the typed section, just like the real test.');
      return;
    }
    if (nextIndex === VIDEO_COUNT + 4) {
      advancing = false;
      renderBreak(TYPED_BREAK_SECONDS, 'Typed station 4 complete', 'Take the optional 5-minute break before the final typed stations.');
      return;
    }

    index = nextIndex;
    advancing = false;
    launchCurrent();
  }

  function continueAfterStation() {
    if (transitionNextIndex == null) return;
    advanceAfterTransition(transitionNextIndex);
  }

  function renderStationTransition(nextIndex, completedType) {
    restoreSubmit();
    window.K2PracticeBridge?.hardStopSession?.();
    setStationChrome(false);
    hideStationReflection();
    byId('webcamPanel')?.style.setProperty('display', 'none');
    byId('scenarioCard')?.style.setProperty('display', 'none');
    renderProgress();
    const area = ensureMainArea();
    if (!area) {
      advanceAfterTransition(nextIndex);
      return;
    }
    area.style.display = 'block';
    let left = STATION_TRANSITION_SECONDS;
    transitionNextIndex = nextIndex;
    const nextItem = sequence[nextIndex];
    const nextLabel = nextItem
      ? `${nextItem.type === 'video' ? 'video' : 'typed'} station ${nextIndex + 1}`
      : 'your final report';
    const sectionCopy = completedType === 'video'
      ? 'Your recording has been saved and queued for background analysis.'
      : 'Your typed response has been saved and queued for background analysis.';
    const render = () => {
      area.innerHTML = `
        <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:36px 32px;text-align:center;">
          <div style="font-size:0.72rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:8px;">Station saved</div>
          <h2 style="font-size:1.45rem;color:var(--navy);line-height:1.25;margin:0 0 8px;">Next: ${esc(nextLabel)}</h2>
          <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;max-width:560px;margin:0 auto 18px;">${esc(sectionCopy)} The exam will continue automatically.</p>
          <div id="mockTransitionCountdown" style="font-size:3.2rem;font-weight:900;color:var(--navy);font-variant-numeric:tabular-nums;margin-bottom:18px;">${left}</div>
          <button type="button" onclick="FullCasperMock.continueAfterStation()" style="padding:11px 24px;border-radius:50px;border:none;background:var(--navy);color:#fff;font-size:0.86rem;font-weight:800;cursor:pointer;font-family:inherit;">Continue now</button>
        </div>
      `;
    };
    render();
    clearInterval(transitionTimer);
    transitionTimer = setInterval(() => {
      left -= 1;
      const el = byId('mockTransitionCountdown');
      if (el) el.textContent = String(Math.max(0, left));
      if (left <= 0) advanceAfterTransition(nextIndex);
    }, 1000);
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
    advancing = false;
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
    return Number.isFinite(score) ? Math.max(1, Math.min(10, round1(score))) : null;
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
      return Number.isFinite(score) ? score : null;
    }
    const score = Number(row.score);
    return Number.isFinite(score) ? Math.max(1, Math.min(10, score)) : null;
  }

  function rowScoreLabel(row) {
    if (row.type === 'video') {
      const score = videoScore(row.feedback);
      return Number.isFinite(score) ? `${score}/10` : 'No score';
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
        if (Number.isFinite(score)) scores.push(Math.max(1, Math.min(10, score)));
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

  async function renderDebrief() {
    started = false;
    rulesAccepted = false;
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
    area.innerHTML = renderProcessingScreen();

    await settleMockFeedbackTasks();

    const rows = buildRows();
    const typed = rows.filter(r => r.type === 'typed');
    const videos = rows.filter(r => r.type === 'video');
    finalVideoRows = videos;
    finalReviewRows = rows;
    const typedScores = typed.map(r => Number(r.score)).filter(Number.isFinite);
    const videoScores = videos.map(r => videoScore(r.feedback)).filter(Number.isFinite);
    const typedAvg = typedScores.length ? round1(average(typedScores)) : '-';
    const videoAvg = videoScores.length ? round1(average(videoScores)) : '-';
    const answeredTyped = typed.filter(r => r.answer && r.answer.trim().length > 30).length;
    const report = buildMockReport(rows);
    latestReport = {
      overallAvg: report.overallAvg,
      criteria: report.criteria,
      stamina: report.stamina,
      patterns: report.patterns,
      categories: report.categories,
      interpretation: report.interpretation,
      oneThing: report.oneThing,
    };
    const completedAnalyses = rows.filter(r => Number.isFinite(r.score10)).length;
    const failedAnalyses = rows.filter(r => r.processingError).length;

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
          <div class="stat-mini"><span class="stat-mini-num">${videoAvg}</span><span class="stat-mini-label">Video avg /10</span></div>
          <div class="stat-mini"><span class="stat-mini-num">${typedAvg}</span><span class="stat-mini-label">Typed avg /10</span></div>
          <div class="stat-mini"><span class="stat-mini-num">${answeredTyped}/7</span><span class="stat-mini-label">Typed answered</span></div>
          <div class="stat-mini"><span class="stat-mini-num">${completedAnalyses}/${rows.length}</span><span class="stat-mini-label">AI analysed</span></div>
        </div>
        <div style="padding:24px 32px;">
          ${failedAnalyses ? renderPartialReportNotice(rows) : ''}
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

          ${renderStationExplorer(rows)}

          <div style="background:#f8fafc;border:1px solid var(--gray200);border-radius:14px;padding:16px 18px;margin-bottom:16px;">
            <div style="font-size:0.72rem;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:var(--teal3);margin-bottom:6px;">Optional manual review</div>
            <div style="font-size:0.86rem;color:var(--gray600);line-height:1.6;margin-bottom:12px;">Dan will review your full mock, including typed answers, video responses, transcripts, AI feedback, and overall patterns. Available for both Transcript and Premium mock attempts. Mock data is retained for 30 days.</div>
            <button id="mockManualReviewBtn" onclick="FullCasperMock.requestManualReview()" class="btn-restart">Request Dan's manual review - $300 AUD</button>
            <div id="mockManualReviewStatus" style="font-size:0.76rem;color:var(--gray500);line-height:1.45;margin-top:9px;"></div>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button onclick="FullCasperMock.startMock()" class="btn-restart">Start another mock</button>
            <button onclick="setMode('casper');FullCasperMock.deactivateMockMode();" class="btn-restart btn-restart-outline">Return to practice</button>
          </div>
        </div>
      </div>
    `;
    setTimeout(() => showReviewStation(0), 0);
    saveMockAttempt(rows, latestReport).catch(err => {
      const status = byId('mockManualReviewStatus');
      if (status) status.textContent = `Mock report visible. Manual review checkout will retry saving if needed: ${err.message}`;
    });
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

  function renderPartialReportNotice(rows) {
    const failed = rows
      .filter(row => row.processingError)
      .map(row => `${stationShort(row)}: ${row.processingError}`)
      .join(' | ');
    return `
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
        <div style="font-size:0.78rem;font-weight:900;color:#9a3412;margin-bottom:5px;">Partial analysis warning</div>
        <div style="font-size:0.82rem;color:#7c2d12;line-height:1.55;">Some station analyses did not finish in time, so the overall estimate is based only on completed AI feedback. You can still review the recordings and responses captured in the mock.</div>
        <div style="font-size:0.72rem;color:#9a3412;line-height:1.45;margin-top:7px;">${esc(failed)}</div>
      </div>
    `;
  }

  function renderStationExplorer(rows) {
    if (!rows.length) return '';
    const tabs = rows.map((row, i) => {
      const label = row.type === 'video' ? `Video ${row.localIndex}` : `Typed ${row.localIndex}`;
      return `
        <button type="button" onclick="FullCasperMock.showReviewStation(${i})" data-mock-review-tab="${i}" style="padding:9px 13px;border-radius:50px;border:1px solid ${i === 0 ? 'var(--navy)' : 'var(--gray200)'};background:${i === 0 ? 'var(--navy)' : '#fff'};color:${i === 0 ? '#fff' : 'var(--gray600)'};font-size:0.76rem;font-weight:850;cursor:pointer;font-family:inherit;">${esc(label)}</button>
      `;
    }).join('');
    return `
      <div style="border:1px solid rgba(10,22,40,0.12);background:#fff;border-radius:16px;padding:22px 24px;margin-bottom:22px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
          <div>
            <div style="font-size:0.66rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:6px;">Station explorer</div>
            <div style="font-size:1.12rem;font-weight:900;color:var(--navy);line-height:1.3;">Review each answer in detail.</div>
            <div style="font-size:0.8rem;color:var(--gray500);line-height:1.55;margin-top:4px;">Open any station to see the scenario, your response, AI feedback, and next-step advice.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;max-width:620px;justify-content:flex-end;">${tabs}</div>
        </div>
        <div id="mockStationReviewPanel">${stationReviewHtml(rows[0])}</div>
      </div>
    `;
  }

  function showReviewStation(i = 0) {
    const row = finalReviewRows[i];
    document.querySelectorAll('[data-mock-review-tab]').forEach(btn => {
      const activeTab = Number(btn.dataset.mockReviewTab) === i;
      btn.style.background = activeTab ? 'var(--navy)' : '#fff';
      btn.style.color = activeTab ? '#fff' : 'var(--gray600)';
      btn.style.border = activeTab ? '1px solid var(--navy)' : '1px solid var(--gray200)';
    });
    const panel = byId('mockStationReviewPanel');
    if (panel) {
      panel.innerHTML = stationReviewHtml(row);
      if (row?.type === 'video') setTimeout(() => initMockVideoPlayer('mockStationVideoPlayer'), 0);
    }
  }

  function stationReviewHtml(row) {
    if (!row) return '<div style="font-size:0.84rem;color:var(--gray400);">No station selected.</div>';
    return row.type === 'video' ? videoStationReviewHtml(row) : typedStationReviewHtml(row);
  }

  function scenarioPromptHtml(row) {
    const station = row.station || {};
    const prompts = [station.prompt1, station.prompt2].filter(Boolean).map((prompt, i) => `
      <div style="background:#fff;border:1px solid var(--gray200);border-radius:10px;padding:11px 12px;">
        <div style="font-size:0.66rem;font-weight:850;color:var(--teal3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Prompt ${i + 1}</div>
        <div style="font-size:0.82rem;color:var(--navy);line-height:1.5;">${esc(prompt)}</div>
      </div>
    `).join('');
    return `
      <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:12px;padding:14px 15px;">
        <div style="font-size:0.66rem;font-weight:850;color:var(--teal3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:7px;">Scenario</div>
        <div style="font-size:0.86rem;color:var(--gray700);line-height:1.65;margin-bottom:12px;">${esc(station.scenario || '')}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px;">${prompts}</div>
      </div>
    `;
  }

  function mockVideoDuration(row) {
    const candidates = [
      row?.durationSec,
      row?.duration_sec,
      row?.rawFeedback?.durationSec,
      row?.rawFeedback?.recording_duration_seconds,
      row?.feedback?.durationSec,
    ];
    const found = candidates.map(Number).find(v => Number.isFinite(v) && v > 0);
    return found || 0;
  }

  function mockTime(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function mockVideoPlayerHtml(row, id = 'mockStationVideoPlayer') {
    const src = row?.recordingUrl || '';
    const duration = mockVideoDuration(row);
    return `
      <div id="${id}Shell" style="background:#07111f;border:1px solid rgba(10,22,40,0.18);border-radius:14px;overflow:hidden;box-shadow:0 10px 28px rgba(10,22,40,0.12);">
        <video id="${id}" playsinline preload="metadata" src="${esc(src)}" data-duration="${duration || ''}" style="width:100%;aspect-ratio:16/9;background:#000;display:block;cursor:pointer;"></video>
        <div style="padding:11px 12px 12px;background:linear-gradient(180deg,#0a1628,#07111f);">
          <div style="display:flex;align-items:center;gap:10px;">
            <button type="button" id="${id}Btn" aria-label="Play recording" style="width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.08);color:#fff;font-size:0.82rem;font-weight:900;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;flex-shrink:0;">▶</button>
            <div style="position:relative;height:18px;flex:1;display:flex;align-items:center;">
              <div style="position:absolute;left:0;right:0;height:5px;border-radius:999px;background:rgba(255,255,255,0.18);overflow:hidden;">
                <div id="${id}Fill" style="height:100%;width:0%;background:#0ea5e9;border-radius:999px;"></div>
              </div>
              <input id="${id}Range" type="range" min="0" max="1000" value="0" aria-label="Seek recording" style="position:absolute;inset:0;width:100%;opacity:0;cursor:pointer;">
            </div>
            <div id="${id}Time" style="min-width:74px;text-align:right;color:rgba(255,255,255,0.72);font-size:0.72rem;font-weight:800;font-variant-numeric:tabular-nums;">0:00 / ${duration ? mockTime(duration) : '--:--'}</div>
          </div>
        </div>
      </div>
    `;
  }

  function initMockVideoPlayer(id = 'mockStationVideoPlayer') {
    const video = byId(id);
    const btn = byId(`${id}Btn`);
    const range = byId(`${id}Range`);
    const fill = byId(`${id}Fill`);
    const time = byId(`${id}Time`);
    if (!video || !btn || !range || !fill || !time) return;

    const durationHint = () => {
      const hint = Number(video.dataset.duration || 0);
      return Number.isFinite(hint) && hint > 0 ? hint : 0;
    };
    const usableDuration = () => {
      const d = Number(video.duration);
      if (Number.isFinite(d) && d > 0 && d < 86400) return d;
      return durationHint();
    };
    const update = () => {
      const d = usableDuration();
      const current = Math.max(0, Number(video.currentTime) || 0);
      const pct = d ? Math.max(0, Math.min(1, current / d)) : 0;
      range.value = String(Math.round(pct * 1000));
      fill.style.width = `${pct * 100}%`;
      time.textContent = `${mockTime(current)} / ${d ? mockTime(d) : '--:--'}`;
      btn.textContent = video.paused || video.ended ? '▶' : '❚❚';
    };
    const seek = () => {
      const d = usableDuration();
      if (!d) return;
      video.currentTime = (Number(range.value) / 1000) * d;
      update();
    };
    const toggle = () => {
      if (!video.getAttribute('src')) return;
      if (video.paused || video.ended) video.play().catch(() => {});
      else video.pause();
    };

    if (!video.dataset.mockPlayerBound) {
      video.dataset.mockPlayerBound = '1';
      btn.addEventListener('click', toggle);
      video.addEventListener('click', toggle);
      range.addEventListener('input', seek);
      ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'seeked'].forEach(eventName => {
        video.addEventListener(eventName, update);
      });
    }
    update();
  }

  function videoStationReviewHtml(row) {
    const presentation = row.feedback?.presentation;
    return `
      <div style="display:grid;grid-template-columns:minmax(min(100%,320px),0.9fr) minmax(0,1.1fr);gap:20px;align-items:start;">
        <div>
          ${mockVideoPlayerHtml(row, 'mockStationVideoPlayer')}
          <div style="font-size:0.76rem;color:var(--gray400);line-height:1.45;margin-top:8px;">${esc(rowScoreLabel(row))} - ${esc(row.station?.category || 'Video station')}</div>
          ${row.transcript ? `<div style="background:#fff;border:1px solid var(--gray200);border-radius:10px;padding:12px;margin-top:12px;"><div style="font-size:0.68rem;font-weight:850;color:var(--teal3);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Transcript</div><div style="font-size:0.78rem;color:var(--gray600);line-height:1.55;max-height:190px;overflow:auto;">${esc(row.transcript)}</div></div>` : ''}
        </div>
        <div style="display:grid;gap:14px;">
          ${scenarioPromptHtml(row)}
          ${videoFeedbackHtml(row)}
          ${presentation ? renderPresentationFeedback(presentation, row.rawFeedback?.visual_degraded) : ''}
        </div>
      </div>
    `;
  }

  function renderPresentationFeedback(presentation, visualDegraded) {
    return `
      <div style="background:#f8fafc;border:1px solid rgba(124,58,237,0.18);border-radius:12px;padding:14px 15px;">
        <div style="font-size:0.7rem;font-weight:900;color:#6d28d9;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Presentation feedback</div>
        ${visualDegraded ? '<div style="font-size:0.76rem;color:#7c2d12;background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:9px 10px;line-height:1.45;margin-bottom:9px;">Camera-based feedback was limited, but voice and transcript feedback were still analysed.</div>' : ''}
        ${presentationLine('Pace', presentation.pace)}
        ${presentationLine('Clarity', presentation.clarity)}
        ${presentationLine('Confidence', presentation.confidence)}
        ${presentationLine('Visual presence', presentation.visual_presence)}
        ${presentationLine('One improvement', presentation.one_improvement)}
      </div>
    `;
  }

  function presentationLine(label, value) {
    if (!value) return '';
    return `<div style="font-size:0.78rem;color:var(--gray600);line-height:1.55;margin-top:6px;"><strong>${esc(label)}:</strong> ${esc(value)}</div>`;
  }

  function typedStationReviewHtml(row) {
    const fb = row.feedback || {};
    return `
      <div style="display:grid;grid-template-columns:minmax(min(100%,330px),0.95fr) minmax(0,1.05fr);gap:20px;align-items:start;">
        <div style="display:grid;gap:14px;">
          ${scenarioPromptHtml(row)}
          <div style="background:#fff;border:1px solid var(--gray200);border-radius:12px;padding:15px;">
            <div style="font-size:0.68rem;font-weight:850;color:var(--teal3);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:7px;">Your typed answer</div>
            <div style="font-size:0.84rem;color:var(--gray700);line-height:1.7;white-space:pre-wrap;max-height:420px;overflow:auto;">${esc(row.answer || 'No typed response captured.')}</div>
          </div>
        </div>
        <div style="display:grid;gap:14px;">
          <div style="background:linear-gradient(135deg,rgba(14,165,233,0.08),#fff);border:1px solid rgba(14,165,233,0.2);border-radius:12px;padding:15px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
              <div style="font-size:0.78rem;font-weight:900;color:var(--navy);">${esc(row.station?.category || 'Typed station')}</div>
              <div style="font-size:0.9rem;font-weight:900;color:var(--teal3);">${esc(rowScoreLabel(row))}</div>
            </div>
            ${typedFeedbackLine('Strengths', fb.strengths)}
            ${typedFeedbackLine('Improve', fb.improvements)}
            ${typedFeedbackLine('Empathy', fb.empathy)}
            ${fb.missed && fb.missed !== 'None' ? typedFeedbackLine('Missed point', fb.missed) : ''}
          </div>
          ${typedCompetencyReviewHtml(row)}
        </div>
      </div>
    `;
  }

  function typedFeedbackLine(label, value) {
    return value ? `<div style="font-size:0.8rem;color:var(--gray600);line-height:1.6;margin-top:7px;"><strong>${esc(label)}:</strong> ${esc(value)}</div>` : '';
  }

  function typedCompetencyReviewHtml(row) {
    const comps = typedCompetencies(row).sort((a, b) => a.score - b.score);
    if (!comps.length) return '';
    return `
      <div style="background:#fff;border:1px solid var(--gray200);border-radius:12px;padding:15px;">
        <div style="font-size:0.68rem;font-weight:850;color:var(--teal3);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Competency breakdown</div>
        ${comps.map(comp => {
          const color = comp.score >= 7 ? '#16a34a' : comp.score >= 5.5 ? '#0ea5e9' : comp.score >= 4.5 ? '#d97706' : '#dc2626';
          return `
            <div style="padding:9px 0;border-top:1px solid var(--gray100);">
              <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:4px;">
                <div style="font-size:0.78rem;font-weight:900;color:var(--navy);">${esc(comp.name)}</div>
                <div style="font-size:0.78rem;font-weight:900;color:${color};">${round1(comp.score)}/10</div>
              </div>
              <div style="font-size:0.74rem;color:var(--gray500);line-height:1.45;">${esc(comp.improve || comp.evidence || 'No specific note returned.')}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderVideoPlaybackPanel(videos) {
    if (!videos.length) return '';
    const buttons = videos.map((row, i) => `
      <button type="button" onclick="FullCasperMock.showRecording(${i})" data-mock-video-tab="${i}" style="padding:8px 12px;border-radius:50px;border:1px solid ${i === 0 ? 'var(--navy)' : 'var(--gray200)'};background:${i === 0 ? 'var(--navy)' : '#fff'};color:${i === 0 ? '#fff' : 'var(--gray600)'};font-size:0.76rem;font-weight:850;cursor:pointer;font-family:inherit;">Video ${i + 1}</button>
    `).join('');
    return `
      <div style="border:1px solid rgba(14,165,233,0.22);background:#fff;border-radius:14px;padding:20px 22px;margin-bottom:22px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
          <div>
            <div style="font-size:0.66rem;font-weight:850;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal3);margin-bottom:6px;">Your video stations</div>
            <div style="font-size:1.05rem;font-weight:900;color:var(--navy);line-height:1.3;">Watch your recordings with the AI feedback below.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">${buttons}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:18px;align-items:start;">
          <div>
            ${mockVideoPlayerHtml(videos[0], 'mockRecordingPlayer')}
            <div id="mockRecordingMeta" style="font-size:0.75rem;color:var(--gray400);line-height:1.45;margin-top:8px;"></div>
          </div>
          <div id="mockRecordingFeedback">${videoFeedbackHtml(videos[0])}</div>
        </div>
      </div>
    `;
  }

  function videoFeedbackHtml(row) {
    if (!row) return '<div style="font-size:0.84rem;color:var(--gray400);">No video selected.</div>';
    if (row.processingError) {
      return `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:13px 15px;font-size:0.82rem;color:#991b1b;"><strong>Analysis failed.</strong><br>${esc(row.processingError)}</div>`;
    }
    const fb = row.feedback || {};
    const overall = fb.overall || {};
    const prompts = Array.isArray(fb.per_prompt) ? fb.per_prompt : [];
    const promptHtml = prompts.map((prompt, i) => `
      <div style="padding:10px 0;border-top:1px solid var(--gray100);">
        <div style="font-size:0.76rem;font-weight:850;color:var(--navy);margin-bottom:4px;">Prompt ${i + 1}</div>
        ${videoPromptCriteriaHtml(prompt)}
      </div>
    `).join('');
    return `
      <div style="background:var(--gray50);border:1px solid var(--gray200);border-radius:10px;padding:15px 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
          <div style="font-size:0.78rem;font-weight:900;color:var(--navy);">${esc(row.station?.category || 'Video station')}</div>
          <div style="font-size:0.82rem;font-weight:900;color:var(--teal3);white-space:nowrap;">${Number.isFinite(Number(overall.score)) ? `${round1(Number(overall.score))}/10 ${overall.label ? `- ${esc(overall.label)}` : ''}` : 'Processing complete'}</div>
        </div>
        <div style="font-size:0.78rem;color:var(--gray600);line-height:1.6;"><strong>Strength:</strong> ${esc(overall.biggest_strength || 'Review the prompt feedback below.')}</div>
        <div style="font-size:0.78rem;color:var(--gray600);line-height:1.6;margin-top:6px;"><strong>Improve:</strong> ${esc(overall.biggest_improvement || 'No specific improvement returned.')}</div>
        ${overall.excellent_version ? `<div style="font-size:0.78rem;color:var(--gray600);line-height:1.6;margin-top:6px;"><strong>Excellent response would add:</strong> ${esc(overall.excellent_version)}</div>` : ''}
        ${row.transcript ? `<div style="font-size:0.72rem;color:var(--gray400);line-height:1.5;margin-top:9px;"><strong>Transcript excerpt:</strong> ${esc(String(row.transcript).slice(0, 260))}${String(row.transcript).length > 260 ? '...' : ''}</div>` : ''}
        ${promptHtml}
      </div>
    `;
  }

  function videoPromptCriteriaHtml(prompt) {
    const scores = prompt?.scores || {};
    const order = ['empathy', 'communication', 'reasoning', 'reflection', 'real_world_awareness'];
    const labels = {
      empathy: 'Empathy',
      communication: 'Communication',
      reasoning: 'Reasoning',
      reflection: 'Reflection',
      real_world_awareness: 'Real-world judgement',
    };
    const rows = order.map(key => {
      const crit = scores[key];
      if (!crit) return '';
      const score = Number(crit.score);
      const color = score >= 7 ? '#16a34a' : score >= 5.5 ? '#0ea5e9' : score >= 4.5 ? '#d97706' : '#dc2626';
      return `
        <div style="display:grid;grid-template-columns:minmax(92px,0.45fr) minmax(0,1fr);gap:8px;padding:7px 0;border-top:1px solid rgba(226,232,240,0.7);">
          <div style="font-size:0.72rem;font-weight:850;color:${color};">${esc(labels[key] || key)} ${Number.isFinite(score) ? `${round1(score)}/10` : ''}</div>
          <div style="font-size:0.74rem;color:var(--gray600);line-height:1.45;">${esc(crit.comment || crit.label || '')}</div>
        </div>
      `;
    }).join('');
    return rows || `<div style="font-size:0.78rem;color:var(--gray600);line-height:1.55;">${esc(prompt?.summary || 'Feedback captured for this prompt.')}</div>`;
  }

  function showRecording(i = 0) {
    const row = finalVideoRows[i];
    document.querySelectorAll('[data-mock-video-tab]').forEach(btn => {
      const activeTab = Number(btn.dataset.mockVideoTab) === i;
      btn.style.background = activeTab ? 'var(--navy)' : '#fff';
      btn.style.color = activeTab ? '#fff' : 'var(--gray600)';
      btn.style.border = activeTab ? '1px solid var(--navy)' : '1px solid var(--gray200)';
    });
    const player = byId('mockRecordingPlayer');
    if (player && row?.recordingUrl) {
      if (player.getAttribute('src') !== row.recordingUrl) {
        player.src = row.recordingUrl;
        player.load();
      }
      player.dataset.duration = mockVideoDuration(row) || '';
    } else if (player) {
      player.removeAttribute('src');
      player.dataset.duration = '';
      player.load();
    }
    const meta = byId('mockRecordingMeta');
    if (meta) {
      meta.textContent = row ? `Video ${i + 1} - ${row.station?.category || 'CASPer'} - ${rowScoreLabel(row)}` : '';
    }
    const feedback = byId('mockRecordingFeedback');
    if (feedback) feedback.innerHTML = videoFeedbackHtml(row);
    initMockVideoPlayer('mockRecordingPlayer');
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
        <p style="font-size:0.9rem;color:var(--gray600);line-height:1.65;margin:0 0 18px;">Single stations build skill. The full mock gives you 11 completely new stations handwritten by Dan, then tests the thing students underestimate: switching from video to typed responses while tired.</p>
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
    refreshPricing,
    checkoutMock,
    proceedAfterRules,
    continueAfterStation,
    enableCameraAndStartVideoStation,
    requestManualReview,
    showReviewStation,
    showRecording,
    skipBreak,
  };
})();
