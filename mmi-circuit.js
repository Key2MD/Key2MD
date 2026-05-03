/**
 * mmi-circuit.js — Key2MD MMI Circuit Mode
 * Drop in after mmi-feedback-render.js
 *
 * Manages: circuit config, station sequencing, inter-station rest,
 * per-station feedback collection, aggregate debrief via Claude API.
 */

const MMICircuit = (() => {

  // ── Constants ─────────────────────────────────────────────────
  const REST_SECONDS   = 120; // 2-min rest between stations
  const CIRCUIT_SIZES  = [4, 6, 8];
  const CREDIT_DISCOUNT = 1; // 1 credit off vs buying individually

  // Pricing display (mirrors CREDIT_PACKS in worker)
  const CREDIT_PRICE = { transcript: 5, premium: 12 };

  // ── State ─────────────────────────────────────────────────────
  let circuitActive    = false;
  let circuitConfig    = null; // { size, tier, specialistMode, preset }
  let circuitStations  = [];   // shuffled, category-balanced array of station objects
  let circuitIdx       = 0;    // current station index (0-based)
  let circuitResults   = [];   // [{station, feedback, durationSec, tier}]
  let restTimerInterval = null;
  let restSecondsLeft  = 0;
  let onCircuitEnd     = null; // callback when all stations + debrief done

  // ── Category balance ──────────────────────────────────────────
  function balancedShuffle(stations, count) {
    // Group by category
    const byCategory = {};
    stations.forEach(s => {
      const cat = s.category || 'General';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(s);
    });

    // Shuffle each category bucket
    Object.values(byCategory).forEach(arr => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    });

    // Round-robin across categories to avoid same-category repeats
    const keys = Object.keys(byCategory);
    const result = [];
    const ptrs = Object.fromEntries(keys.map(k => [k, 0]));
    let attempts = 0;
    while (result.length < count && attempts < count * 10) {
      attempts++;
      for (const cat of keys) {
        if (result.length >= count) break;
        const arr = byCategory[cat];
        if (ptrs[cat] < arr.length) {
          // Avoid same category as previous
          if (result.length === 0 || result[result.length - 1].category !== cat) {
            result.push(arr[ptrs[cat]++]);
          }
        }
      }
    }

    // If we couldn't fill without repeats, just pad
    while (result.length < count) {
      const flat = Object.values(byCategory).flat();
      const pick = flat[Math.floor(Math.random() * flat.length)];
      if (!result.includes(pick)) result.push(pick);
    }

    return result.slice(0, count);
  }

  // ── Public API ────────────────────────────────────────────────

  function init() {
    renderConfigPanel();
    bindEvents();
    // Check URL param
    if (window.location.search.includes('tab=circuit')) {
      setTimeout(() => activateCircuitMode(), 100);
    }
  }

  function activateCircuitMode() {
    document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active-casper', 'active-mmi', 'active-circuit'));
    const circuitPill = document.getElementById('modeCircuit');
    if (circuitPill) circuitPill.classList.add('active-circuit');

    // Hide normal practice panels
    const panels = ['casperCategoryCard','mmiCategoryCard','mmiOptionsCard','webcamPanel','startBtn','scenarioCard'];
    panels.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.getElementById('reviewPanel')?.classList.remove('show');

    // Show circuit config panel
    const cp = document.getElementById('circuitConfigPanel');
    if (cp) cp.style.display = 'block';

    const mainContent = document.getElementById('mainContent') || document.querySelector('.main-content');
    if (mainContent) {
      const existing = document.getElementById('circuitMainArea');
      if (!existing) {
        const div = document.createElement('div');
        div.id = 'circuitMainArea';
        mainContent.appendChild(div);
      }
      document.getElementById('circuitMainArea').style.display = 'block';
    }
    renderCircuitIdle();
  }

  function deactivateCircuitMode() {
    document.getElementById('circuitConfigPanel').style.display = 'none';
    const cma = document.getElementById('circuitMainArea');
    if (cma) cma.style.display = 'none';
    // Restore normal panels
    document.getElementById('startBtn').style.display = '';
    document.getElementById('casperCategoryCard').style.display = '';
    document.getElementById('scenarioCard').style.display = '';
  }

  // ── Config panel (sidebar) ────────────────────────────────────

  function renderConfigPanel() {
    const sidebar = document.querySelector('aside.sidebar');
    if (!sidebar) return;

    const panel = document.createElement('div');
    panel.id = 'circuitConfigPanel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="sidebar-card" style="border-color:rgba(124,58,237,0.25);background:rgba(124,58,237,0.04);">
        <h3 style="color:#7c3aed;font-size:0.8rem;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;margin-bottom:14px;">Circuit Setup</h3>

        <div style="margin-bottom:14px;">
          <div style="font-size:0.72rem;font-weight:700;color:var(--gray500);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Stations</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
            ${CIRCUIT_SIZES.map((n,i) => `
              <button class="circuit-size-btn${i===0?' active':''}" data-size="${n}" onclick="MMICircuit.setSize(${n})" style="padding:8px 4px;border-radius:8px;border:1px solid ${i===0?'rgba(124,58,237,0.5)':'var(--gray200)'};background:${i===0?'rgba(124,58,237,0.1)':'var(--gray50)'};color:${i===0?'#7c3aed':'var(--gray600)'};font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;">
                ${n}
              </button>`).join('')}
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <div style="font-size:0.72rem;font-weight:700;color:var(--gray500);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Tier</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <button class="circuit-tier-btn active" data-tier="transcript" onclick="MMICircuit.setTier('transcript')" style="padding:8px 6px;border-radius:8px;border:1px solid rgba(124,58,237,0.5);background:rgba(124,58,237,0.1);color:#7c3aed;font-size:0.78rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;">🎤 Transcript</button>
            <button class="circuit-tier-btn" data-tier="premium" onclick="MMICircuit.setTier('premium')" style="padding:8px 6px;border-radius:8px;border:1px solid var(--gray200);background:var(--gray50);color:var(--gray600);font-size:0.78rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;">⭐ Premium</button>
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <div style="font-size:0.72rem;font-weight:700;color:var(--gray500);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Timing</div>
          <select id="circuitPreset" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--gray200);background:#fff;color:var(--navy);font-size:0.83rem;font-weight:600;font-family:inherit;">
            <option value="standard">Standard (2 min read · 5 min answer)</option>
            <option value="extended">Extended (2 min read · 8 min answer)</option>
            <option value="quickfire">Quickfire (45s read · 4 min answer)</option>
          </select>
        </div>

        <div style="margin-bottom:16px;" id="circuitSpecialistRow">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 10px;border-radius:8px;border:1px solid var(--gray200);background:var(--gray50);">
            <input type="checkbox" id="circuitSpecialist" style="accent-color:#7c3aed;width:15px;height:15px;">
            <div>
              <div style="font-size:0.82rem;font-weight:600;color:var(--gray800);">Specialist Mode</div>
              <div style="font-size:0.68rem;color:var(--gray400);line-height:1.4;">Higher bar — RACS/RANZCO/ACRRM</div>
            </div>
          </label>
        </div>

        <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:8px;padding:10px 12px;margin-bottom:14px;">
          <div style="font-size:0.72rem;color:var(--gray500);margin-bottom:4px;">Credit cost</div>
          <div id="circuitCreditDisplay" style="font-size:1.1rem;font-weight:800;color:#7c3aed;">4 credits <span style="font-size:0.72rem;font-weight:500;color:var(--gray400);">(save 1 vs individual)</span></div>
        </div>

        <button id="circuitStartBtn" onclick="MMICircuit.startCircuit()" style="width:100%;padding:12px;border-radius:50px;border:none;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:0.92rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;box-shadow:0 4px 16px rgba(124,58,237,0.3);">
          ▶ Start Circuit
        </button>
      </div>
    `;
    sidebar.appendChild(panel);
  }

  function setSize(n) {
    document.querySelectorAll('.circuit-size-btn').forEach(btn => {
      const active = parseInt(btn.dataset.size) === n;
      btn.style.border = active ? '1px solid rgba(124,58,237,0.5)' : '1px solid var(--gray200)';
      btn.style.background = active ? 'rgba(124,58,237,0.1)' : 'var(--gray50)';
      btn.style.color = active ? '#7c3aed' : 'var(--gray600)';
    });
    updateCreditDisplay();
  }

  function setTier(tier) {
    document.querySelectorAll('.circuit-tier-btn').forEach(btn => {
      const active = btn.dataset.tier === tier;
      btn.style.border = active ? '1px solid rgba(124,58,237,0.5)' : '1px solid var(--gray200)';
      btn.style.background = active ? 'rgba(124,58,237,0.1)' : 'var(--gray50)';
      btn.style.color = active ? '#7c3aed' : 'var(--gray600)';
    });
    updateCreditDisplay();
  }

  function updateCreditDisplay() {
    const size = parseInt(document.querySelector('.circuit-size-btn.active')?.dataset.size ||
      document.querySelector('[data-size]')?.dataset.size || '4');
    const tier = document.querySelector('.circuit-tier-btn.active')?.dataset.tier || 'transcript';
    // Find active via colour (simpler than maintaining separate state)
    const activeSize = parseInt([...document.querySelectorAll('.circuit-size-btn')]
      .find(b => b.style.color === 'rgb(124, 58, 237)')?.dataset.size || '4');
    const activeTier = [...document.querySelectorAll('.circuit-tier-btn')]
      .find(b => b.style.color === 'rgb(124, 58, 237)')?.dataset.tier || 'transcript';
    const credits = activeSize - CREDIT_DISCOUNT;
    const price = credits * CREDIT_PRICE[activeTier];
    const el = document.getElementById('circuitCreditDisplay');
    if (el) el.innerHTML = `${credits} credits <span style="font-size:0.72rem;font-weight:500;color:var(--gray400);">(save ${CREDIT_DISCOUNT} vs individual · $${price} AUD)</span>`;
  }

  function bindEvents() {
    // Mode pill click
    document.addEventListener('click', e => {
      if (e.target.id === 'modeCircuit') activateCircuitMode();
      else if (e.target.id === 'modeCasper' || e.target.id === 'modeMMI') {
        if (circuitActive) abortCircuit();
        deactivateCircuitMode();
      }
    });
  }

  // ── Circuit main area rendering ───────────────────────────────

  function getMainArea() {
    return document.getElementById('circuitMainArea');
  }

  function renderCircuitIdle() {
    const area = getMainArea();
    if (!area) return;
    area.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:500px;text-align:center;padding:40px 24px;">
        <div style="font-size:4rem;margin-bottom:20px;">🏃</div>
        <h2 style="font-size:1.6rem;font-weight:800;color:var(--navy);margin:0 0 12px;">MMI Circuit Mode</h2>
        <p style="color:var(--gray500);font-size:0.95rem;line-height:1.7;max-width:480px;margin:0 0 28px;">
          Back-to-back stations with 2-minute rests — exactly like interview day. Configure your circuit in the sidebar and press Start.
        </p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:560px;width:100%;margin-bottom:32px;">
          <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:12px;padding:18px 12px;">
            <div style="font-size:1.4rem;margin-bottom:8px;">🎯</div>
            <div style="font-size:0.82rem;font-weight:700;color:var(--navy);margin-bottom:4px;">Balanced stations</div>
            <div style="font-size:0.72rem;color:var(--gray400);line-height:1.5;">Categories spread evenly — no two Ethics or Role-Play back-to-back</div>
          </div>
          <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:12px;padding:18px 12px;">
            <div style="font-size:1.4rem;margin-bottom:8px;">⏱</div>
            <div style="font-size:0.82rem;font-weight:700;color:var(--navy);margin-bottom:4px;">2-min rest</div>
            <div style="font-size:0.72rem;color:var(--gray400);line-height:1.5;">Timed break between every station — hold yourself to interview conditions</div>
          </div>
          <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:12px;padding:18px 12px;">
            <div style="font-size:1.4rem;margin-bottom:8px;">📊</div>
            <div style="font-size:0.82rem;font-weight:700;color:var(--navy);margin-bottom:4px;">Circuit debrief</div>
            <div style="font-size:0.72rem;color:var(--gray400);line-height:1.5;">Cross-station patterns, stamina analysis, and a real-day estimate at the end</div>
          </div>
        </div>
        <button onclick="MMICircuit.startCircuit()" style="padding:14px 36px;border-radius:50px;border:none;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:1rem;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 6px 24px rgba(124,58,237,0.35);transition:all 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
          ▶ Start Circuit
        </button>
      </div>
    `;
  }

  function renderRestScreen(stationNum, totalStations, nextStation) {
    const area = getMainArea();
    if (!area) return;
    restSecondsLeft = REST_SECONDS;
    area.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:500px;text-align:center;padding:40px 24px;">
        <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.2);border-radius:20px;padding:36px 40px;max-width:520px;width:100%;">
          <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#7c3aed;margin-bottom:12px;">
            Station ${stationNum} of ${totalStations} complete
          </div>
          <div style="font-size:0.82rem;color:var(--gray500);margin-bottom:24px;line-height:1.6;">
            In a real MMI you would now walk to the next room. Use this time to reset — breathe, let go of that station.
          </div>
          <div style="font-size:4rem;font-weight:800;color:#7c3aed;font-variant-numeric:tabular-nums;margin-bottom:8px;line-height:1;" id="circuitRestTimer">2:00</div>
          <div style="font-size:0.78rem;color:var(--gray400);margin-bottom:28px;">Rest time remaining</div>
          <div style="background:rgba(255,255,255,0.6);border:1px solid var(--gray200);border-radius:12px;padding:14px 18px;text-align:left;margin-bottom:20px;">
            <div style="font-size:0.65rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray400);margin-bottom:6px;">Next station</div>
            <div style="font-size:0.82rem;font-weight:700;color:var(--navy);margin-bottom:4px;">${nextStation.category}</div>
            <div style="font-size:0.78rem;color:var(--gray500);line-height:1.5;">${nextStation.scenario.substring(0, 120)}${nextStation.scenario.length > 120 ? '…' : ''}</div>
          </div>
          <button onclick="MMICircuit.skipRest()" style="padding:10px 24px;border-radius:50px;border:1px solid rgba(124,58,237,0.3);background:transparent;color:#7c3aed;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:inherit;">
            Skip rest →
          </button>
        </div>
      </div>
    `;
    startRestTimer();
  }

  function renderDebriefLoading() {
    const area = getMainArea();
    if (!area) return;
    area.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:500px;text-align:center;padding:40px 24px;">
        <div style="width:48px;height:48px;border:3px solid rgba(124,58,237,0.2);border-top-color:#7c3aed;border-radius:50%;animation:mmi-spin 0.8s linear infinite;margin-bottom:24px;"></div>
        <h3 style="font-size:1.2rem;font-weight:800;color:var(--navy);margin:0 0 10px;">Generating your circuit debrief…</h3>
        <p style="color:var(--gray400);font-size:0.88rem;line-height:1.7;max-width:400px;">Analysing patterns across all ${circuitResults.length} stations. This takes 20–30 seconds.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:20px;" id="circuitDebriefSteps">
          <span class="circuit-debrief-step active">📊 Criterion heatmap</span>
          <span class="circuit-debrief-step">📉 Stamina pattern</span>
          <span class="circuit-debrief-step">🔁 Cross-station patterns</span>
          <span class="circuit-debrief-step">🎯 Real-day estimate</span>
        </div>
      </div>
    `;
    animateDebriefSteps();
  }

  function animateDebriefSteps() {
    const steps = document.querySelectorAll('.circuit-debrief-step');
    let i = 0;
    const interval = setInterval(() => {
      steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
      i = (i + 1) % steps.length;
    }, 4000);
    window._circuitDebriefInterval = interval;
  }

  // ── Circuit flow ──────────────────────────────────────────────

  function getConfig() {
    const activeSize = parseInt([...document.querySelectorAll('.circuit-size-btn')]
      .find(b => b.style.color === 'rgb(124, 58, 237)')?.dataset.size || '4');
    const activeTier = ([...document.querySelectorAll('.circuit-tier-btn')]
      .find(b => b.style.color === 'rgb(124, 58, 237)')?.dataset.tier) || 'transcript';
    const preset   = document.getElementById('circuitPreset')?.value || 'standard';
    const specialist = document.getElementById('circuitSpecialist')?.checked || false;
    return { size: activeSize || 4, tier: activeTier, preset, specialistMode: specialist };
  }

  function startCircuit() {
    if (!window.Key2MDAuth?.isLoggedIn()) {
      window.Key2MDAuth?.showAuthModal('signup');
      return;
    }

    circuitConfig  = getConfig();
    circuitResults = [];
    circuitIdx     = 0;
    circuitActive  = true;

    // Build balanced station pool from MMI_STATIONS
    const allStations = window.MMI_STATIONS || [];
    if (allStations.length < circuitConfig.size) {
      alert('Not enough MMI stations available. Please check practice-stations.js.');
      return;
    }
    circuitStations = balancedShuffle(allStations, circuitConfig.size);

    renderProgressBar();
    launchStation(0);
  }

  function launchStation(idx) {
    circuitIdx = idx;
    const station = circuitStations[idx];
    const area = getMainArea();
    if (!area) return;

    // Show the station number in the progress bar
    updateProgressBar(idx);

    // Render a lightweight "station header" then hand off to the normal MMI recording flow
    area.innerHTML = `
      <div id="circuitStationWrap">
        <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:12px;margin-bottom:20px;">
          <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:0.72rem;font-weight:800;padding:5px 12px;border-radius:50px;white-space:nowrap;">
            Station ${idx + 1} / ${circuitConfig.size}
          </div>
          <div style="font-size:0.82rem;font-weight:600;color:var(--navy);">${station.category}</div>
          <div style="margin-left:auto;font-size:0.72rem;color:var(--gray400);">${circuitConfig.tier === 'premium' ? '⭐ Premium' : '🎤 Transcript'} · ${circuitConfig.specialistMode ? 'Specialist Mode' : 'Med School'}</div>
        </div>

        <div id="circuitFeedbackWrap" style="margin-top:16px;"></div>
      </div>
    `;

    // Override the global MMI state so the existing recording machinery runs
    // We inject the station into the global pool at index 0 so loadStation() picks it up
    if (window.setMode) window.setMode('mmi');

    // Directly configure the MMI engine state variables used by practice.html
    window.mmiCurrentPrompts = getPrompts(station);
    window.mmiSpecialistMode = circuitConfig.specialistMode;
    window.mmiPremiumMode    = circuitConfig.tier === 'premium';

    // Set the active preset so the engine uses correct timing
    if (window.selectMMIPreset) window.selectMMIPreset(circuitConfig.preset);
    if (window.mmiActivePreset !== undefined) window.mmiActivePreset = circuitConfig.preset;

    // Inject station into the global pool so the existing UI renders it
    window.pool = [station];
    window.currentIdx = 0;
    window.sessionActive = true;

    // Override the normal mmi submit callback to capture result
    window._circuitFeedbackCapture = (feedbackData) => {
      onStationComplete(feedbackData, station);
    };

    if (window.loadStation) window.loadStation();

    // Patch submit button to route through circuit capture
    patchSubmitButton();
  }

  function patchSubmitButton() {
    // Replace submitMMIForFeedback with a circuit-aware version
    window._originalSubmitMMI = window.submitMMIForFeedback;
    window.submitMMIForFeedback = async function() {
      // Run the original submit but capture the result
      const btn  = document.getElementById('btnMMISubmit');
      const wrap = document.getElementById('aiFeedbackWrapMMI');

      // We run the original (which calls the API and renders to aiFeedbackWrapMMI),
      // but also capture the result for the debrief.
      // We do this by wrapping the fetch call via the existing machinery and
      // listening for the result to appear in the DOM, OR by re-reading from
      // the global after the original completes.

      // Simple approach: call original, then after it completes read the rendered feedback
      await window._originalSubmitMMI.apply(this, arguments);

      // After feedback renders, extract JSON from the rendered output
      // MMIFeedbackRender stores the last feedback on window for exactly this purpose
      if (window._lastMMIFeedback) {
        onStationComplete(window._lastMMIFeedback, circuitStations[circuitIdx]);
      }
    };
  }

  function getPrompts(station) {
    if (Array.isArray(station.prompts)) return station.prompts;
    const p = [];
    if (station.prompt1) p.push(station.prompt1);
    if (station.prompt2) p.push(station.prompt2);
    if (station.prompt3) p.push(station.prompt3);
    if (station.prompt4) p.push(station.prompt4);
    return p;
  }

  function onStationComplete(feedbackData, station) {
    // Restore original submit
    if (window._originalSubmitMMI) {
      window.submitMMIForFeedback = window._originalSubmitMMI;
      delete window._originalSubmitMMI;
    }

    circuitResults.push({
      station,
      feedback: feedbackData,
      stationIdx: circuitIdx,
      tier: circuitConfig.tier,
    });

    const isLast = circuitIdx >= circuitConfig.size - 1;

    if (isLast) {
      // All stations done — go straight to debrief
      circuitActive = false;
      generateDebrief();
    } else {
      // Show rest screen
      const nextStation = circuitStations[circuitIdx + 1];
      renderRestScreen(circuitIdx + 1, circuitConfig.size, nextStation);
    }
  }

  function startRestTimer() {
    clearInterval(restTimerInterval);
    restSecondsLeft = REST_SECONDS;
    restTimerInterval = setInterval(() => {
      restSecondsLeft--;
      const el = document.getElementById('circuitRestTimer');
      if (el) {
        const m = Math.floor(restSecondsLeft / 60);
        const s = restSecondsLeft % 60;
        el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      }
      if (restSecondsLeft <= 0) {
        clearInterval(restTimerInterval);
        launchStation(circuitIdx + 1);
      }
    }, 1000);
  }

  function skipRest() {
    clearInterval(restTimerInterval);
    launchStation(circuitIdx + 1);
  }

  function abortCircuit() {
    circuitActive = false;
    clearInterval(restTimerInterval);
    if (window._originalSubmitMMI) {
      window.submitMMIForFeedback = window._originalSubmitMMI;
      delete window._originalSubmitMMI;
    }
    circuitResults = [];
    circuitStations = [];
    circuitIdx = 0;
  }

  // ── Progress bar ──────────────────────────────────────────────

  function renderProgressBar() {
    const area = getMainArea();
    if (!area) return;

    // Inject progress bar above main area
    let pb = document.getElementById('circuitProgressBar');
    if (!pb) {
      pb = document.createElement('div');
      pb.id = 'circuitProgressBar';
      pb.style.cssText = 'padding:16px 20px;background:#fff;border:1px solid var(--gray200);border-radius:12px;margin-bottom:16px;';
      area.parentNode.insertBefore(pb, area);
    }
    updateProgressBar(0);
  }

  function updateProgressBar(currentIdx) {
    const pb = document.getElementById('circuitProgressBar');
    if (!pb) return;
    const dots = circuitStations.map((s, i) => {
      const done    = i < currentIdx;
      const current = i === currentIdx;
      const color   = done ? '#7c3aed' : current ? '#7c3aed' : 'var(--gray200)';
      const size    = current ? '32px' : '24px';
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div style="width:${size};height:${size};border-radius:50%;background:${done?'#7c3aed':current?'rgba(124,58,237,0.15)':'var(--gray100)'};border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:800;color:${done?'#fff':current?'#7c3aed':'var(--gray400)'};transition:all 0.3s;">
            ${done ? '✓' : i + 1}
          </div>
          <div style="font-size:0.6rem;color:${current?'#7c3aed':'var(--gray400)'};font-weight:${current?'700':'400'};white-space:nowrap;max-width:52px;overflow:hidden;text-overflow:ellipsis;">${s.category.split(' ')[0]}</div>
        </div>
        ${i < circuitStations.length - 1 ? `<div style="height:2px;flex:1;background:${done?'#7c3aed':'var(--gray200)'};margin-bottom:18px;transition:background 0.3s;"></div>` : ''}
      `;
    }).join('');

    pb.innerHTML = `
      <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#7c3aed;margin-bottom:10px;">
        Circuit Progress — ${currentIdx + 1} of ${circuitStations.length}
      </div>
      <div style="display:flex;align-items:center;gap:0;">${dots}</div>
    `;
  }

  // ── Debrief generation ────────────────────────────────────────

  async function generateDebrief() {
    renderDebriefLoading();

    if (window._circuitDebriefInterval) clearInterval(window._circuitDebriefInterval);

    const debriefPrompt = buildDebriefPrompt();

    try {
      const token = window.Key2MDAuth?.getToken();
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: DEBRIEF_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: debriefPrompt }],
        }),
      });

      const data = await res.json();
      const raw  = data.content?.map(c => c.text || '').join('').trim() || '';
      const debrief = JSON.parse(raw.replace(/```json|```/g, '').trim());
      renderDebrief(debrief);
    } catch (err) {
      console.error('Circuit debrief failed:', err);
      renderDebriefError();
    }
  }

  const DEBRIEF_SYSTEM_PROMPT = `You are generating a circuit debrief report for a Key2MD MMI practice session. The student has just completed a multi-station MMI circuit.

Your job is to synthesise patterns across all stations into a structured, honest, actionable debrief. You are not a praise coach. You are an examiner who has watched every station and noticed things the student can't see from the inside.

Return ONLY valid JSON matching this schema exactly — no markdown, no preamble:

{
  "overall_band": "Poor|Unsatisfactory|Satisfactory|Good|Excellent",
  "real_day_estimate": "<2 sentences: if this were a real MMI day, where would this performance sit and why>",
  "criterion_averages": {
    "empathy":              {"avg": 1.0, "label": "...", "trend": "consistent|improving|declining|variable"},
    "communication":        {"avg": 1.0, "label": "...", "trend": "..."},
    "reasoning":            {"avg": 1.0, "label": "...", "trend": "..."},
    "reflection":           {"avg": 1.0, "label": "...", "trend": "..."},
    "real_world_awareness": {"avg": 1.0, "label": "...", "trend": "..."}
  },
  "stamina_pattern": {
    "detected": true,
    "description": "<2 sentences about whether quality held across the circuit or declined. Be specific about which stations>",
    "first_half_avg": 3.0,
    "second_half_avg": 3.0
  },
  "cross_station_patterns": [
    "<specific pattern observed across multiple stations — quote the stations>",
    "<second pattern if present>"
  ],
  "category_performance": [
    {"category": "Ethics", "avg_score": 3.0, "note": "<one line>"},
    {"category": "Role-Play", "avg_score": 2.5, "note": "<one line>"}
  ],
  "strongest_station": {
    "station_idx": 0,
    "category": "...",
    "reason": "<one sentence with specific quote from transcript or feedback>"
  },
  "weakest_station": {
    "station_idx": 0,
    "category": "...",
    "reason": "<one sentence>"
  },
  "the_one_thing": "<The single most important thing to fix before the real interview. One specific, actionable change. Not a list. Not encouragement. The thing.>",
  "polished_auditor_circuit": "<if the Polished Auditor trap appeared in 2+ stations, describe the pattern. Otherwise empty string>"
}`;

  function buildDebriefPrompt() {
    const stationSummaries = circuitResults.map((r, i) => {
      const fb = r.feedback;
      if (!fb) return `Station ${i + 1} (${r.station.category}): No feedback captured.`;

      const critScores = fb.per_prompt?.[0]?.scores || {};
      const scoreStr = Object.entries(critScores).map(([k, v]) => `${k}: ${v.score}`).join(', ');
      return `Station ${i + 1} (${r.station.category}):
  Overall: ${fb.overall?.label || '—'} (${fb.overall?.score || '—'}/5)
  Criterion scores: ${scoreStr}
  Biggest strength: ${fb.overall?.biggest_strength || '—'}
  Biggest improvement: ${fb.overall?.biggest_improvement || '—'}
  Polished auditor: ${fb.polished_auditor_detected ? 'YES — ' + fb.polished_auditor_explanation : 'No'}
  Per-prompt summaries: ${(fb.per_prompt || []).map((p, pi) => `Q${pi + 1}: ${p.summary || ''}`).join(' | ')}`;
    }).join('\n\n');

    const config = circuitConfig;
    return `## Circuit Configuration
Stations: ${config.size}
Tier: ${config.tier}
Timing preset: ${config.preset}
Specialist mode: ${config.specialistMode ? 'Yes' : 'No'}

## Station Results

${stationSummaries}

Generate the circuit debrief report. Be specific. Reference station numbers and quotes. The "the_one_thing" field is the most important — make it a genuine insight, not a platitude.`;
  }

  // ── Debrief render ────────────────────────────────────────────

  function renderDebrief(d) {
    const area = getMainArea();
    if (!area) return;

    // Clean up progress bar
    const pb = document.getElementById('circuitProgressBar');
    if (pb) pb.remove();

    const CRITERIA = {
      empathy: 'Empathy', communication: 'Communication', reasoning: 'Reasoning',
      reflection: 'Reflection', real_world_awareness: 'Real-world Awareness',
    };
    const BAND_COLORS = {
      Excellent: '#16a34a', Good: '#0ea5e9', Satisfactory: '#d97706',
      Unsatisfactory: '#ea580c', Poor: '#dc2626',
    };
    const bandColor = BAND_COLORS[d.overall_band] || '#6b7280';
    const TREND_ICONS = { consistent: '→', improving: '↑', declining: '↓', variable: '↕' };
    const TREND_COLORS = { consistent: '#6b7280', improving: '#16a34a', declining: '#dc2626', variable: '#d97706' };

    const criterionRows = Object.entries(d.criterion_averages || {}).map(([key, val]) => {
      const pct = Math.round((val.avg / 5) * 100);
      const barColor = val.avg >= 4 ? '#16a34a' : val.avg >= 3 ? '#0ea5e9' : val.avg >= 2 ? '#d97706' : '#dc2626';
      const trendIcon = TREND_ICONS[val.trend] || '→';
      const trendColor = TREND_COLORS[val.trend] || '#6b7280';
      return `
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <span style="font-size:0.82rem;font-weight:600;color:var(--navy);">${CRITERIA[key] || key}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:0.72rem;font-weight:700;color:${trendColor};">${trendIcon} ${val.trend}</span>
              <span style="font-size:0.9rem;font-weight:800;color:${barColor};">${val.avg.toFixed(1)}/5</span>
            </div>
          </div>
          <div style="height:8px;background:var(--gray100);border-radius:99px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width 0.6s;"></div>
          </div>
        </div>`;
    }).join('');

    const categoryRows = (d.category_performance || []).map(cp => {
      const color = cp.avg_score >= 4 ? '#16a34a' : cp.avg_score >= 3 ? '#0ea5e9' : cp.avg_score >= 2 ? '#d97706' : '#dc2626';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--gray50);border-radius:8px;margin-bottom:6px;">
        <span style="font-size:0.82rem;font-weight:600;color:var(--navy);">${cp.category}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:0.78rem;color:var(--gray400);">${cp.note}</span>
          <span style="font-size:0.9rem;font-weight:800;color:${color};">${cp.avg_score.toFixed(1)}</span>
        </div>
      </div>`;
    }).join('');

    const staminaBlock = d.stamina_pattern?.detected
      ? `<div style="background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);border-radius:10px;padding:14px 16px;margin-top:12px;">
          <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#dc2626;margin-bottom:6px;">⚠ Stamina drop detected</div>
          <div style="font-size:0.85rem;color:var(--gray700);line-height:1.65;">${d.stamina_pattern.description}</div>
          <div style="display:flex;gap:16px;margin-top:10px;">
            <div style="font-size:0.78rem;color:var(--gray500);">First half avg: <strong style="color:var(--navy);">${d.stamina_pattern.first_half_avg?.toFixed(1)}</strong></div>
            <div style="font-size:0.78rem;color:var(--gray500);">Second half avg: <strong style="color:var(--navy);">${d.stamina_pattern.second_half_avg?.toFixed(1)}</strong></div>
          </div>
        </div>`
      : `<div style="background:rgba(74,222,128,0.06);border:1px solid rgba(74,222,128,0.2);border-radius:10px;padding:12px 14px;margin-top:12px;">
          <div style="font-size:0.82rem;color:var(--gray700);">✅ No significant stamina drop detected. ${d.stamina_pattern?.description || ''}</div>
        </div>`;

    const patternsList = (d.cross_station_patterns || []).map(p =>
      `<li style="margin-bottom:10px;color:var(--gray700);font-size:0.85rem;line-height:1.65;">${p}</li>`
    ).join('');

    const polishedBlock = d.polished_auditor_circuit
      ? `<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:14px 16px;margin-top:16px;">
          <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#d97706;margin-bottom:6px;">⚠ Polished Auditor Pattern — across multiple stations</div>
          <div style="font-size:0.85rem;color:var(--gray700);line-height:1.65;">${d.polished_auditor_circuit}</div>
        </div>` : '';

    area.innerHTML = `
      <div style="max-width:780px;margin:0 auto;padding:0 0 48px;">

        <!-- Header -->
        <div style="text-align:center;padding:32px 24px;background:linear-gradient(135deg,rgba(124,58,237,0.08),rgba(14,165,233,0.05));border:1px solid rgba(124,58,237,0.15);border-radius:20px;margin-bottom:24px;">
          <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#7c3aed;margin-bottom:10px;">
            Circuit Complete · ${circuitResults.length} stations · ${circuitConfig.tier === 'premium' ? 'Premium' : 'Transcript'} tier
          </div>
          <div style="display:inline-block;font-size:2rem;font-weight:900;color:${bandColor};background:${bandColor}15;padding:8px 28px;border-radius:50px;border:2px solid ${bandColor}40;margin-bottom:12px;">
            ${d.overall_band}
          </div>
          <p style="color:var(--gray600);font-size:0.92rem;line-height:1.7;max-width:540px;margin:0 auto;">${d.real_day_estimate}</p>
        </div>

        <!-- The One Thing -->
        <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border-radius:16px;padding:24px 28px;margin-bottom:24px;">
          <div style="font-size:0.65rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:10px;">The one thing to fix before your real interview</div>
          <div style="font-size:1.05rem;font-weight:700;line-height:1.6;">${d.the_one_thing}</div>
        </div>

        <!-- Grid: criterion heatmap + category performance -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:20px 22px;">
            <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray400);margin-bottom:16px;">Criterion Heatmap</div>
            ${criterionRows}
          </div>
          <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:20px 22px;">
            <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray400);margin-bottom:14px;">Performance by Category</div>
            ${categoryRows}
            <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--gray100);">
              <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:6px;">
                <span style="color:var(--gray500);">Best station: <strong style="color:var(--navy);">${d.strongest_station?.category || '—'}</strong></span>
                <span style="color:#16a34a;font-weight:600;">S${(d.strongest_station?.station_idx ?? 0) + 1}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:0.78rem;">
                <span style="color:var(--gray500);">Needs work: <strong style="color:var(--navy);">${d.weakest_station?.category || '—'}</strong></span>
                <span style="color:#dc2626;font-weight:600;">S${(d.weakest_station?.station_idx ?? 0) + 1}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Stamina -->
        <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:20px 22px;margin-bottom:20px;">
          <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray400);margin-bottom:4px;">Stamina Pattern</div>
          ${staminaBlock}
        </div>

        <!-- Cross-station patterns -->
        ${patternsList ? `
        <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:20px 22px;margin-bottom:20px;">
          <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray400);margin-bottom:12px;">Cross-station Patterns</div>
          <ul style="padding:0 0 0 18px;margin:0;">${patternsList}</ul>
        </div>` : ''}

        ${polishedBlock}

        <!-- Per-station quick view -->
        <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:20px 22px;margin-bottom:24px;">
          <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray400);margin-bottom:14px;">Station Results</div>
          ${circuitResults.map((r, i) => {
            const fb = r.feedback;
            const score = fb?.overall?.score || '—';
            const label = fb?.overall?.label || '—';
            const scoreColor = BAND_COLORS[label] || '#6b7280';
            return `
              <div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--gray100);">
                <div style="width:28px;height:28px;border-radius:50%;background:rgba(124,58,237,0.1);color:#7c3aed;font-size:0.72rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:0.82rem;font-weight:600;color:var(--navy);">${r.station.category}</div>
                  <div style="font-size:0.72rem;color:var(--gray400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.station.scenario.substring(0, 80)}…</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="font-size:1rem;font-weight:800;color:${scoreColor};">${score}/5</div>
                  <div style="font-size:0.68rem;color:${scoreColor};font-weight:600;">${label}</div>
                </div>
              </div>`;
          }).join('')}
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
          <button onclick="MMICircuit.runAgain()" style="padding:12px 28px;border-radius:50px;border:none;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:0.92rem;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(124,58,237,0.3);transition:all 0.2s;">
            ↺ Run Another Circuit
          </button>
          <button onclick="MMICircuit.reviewStations()" style="padding:12px 28px;border-radius:50px;border:1px solid var(--gray200);background:#fff;color:var(--navy);font-size:0.92rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.2s;">
            Review Individual Stations
          </button>
        </div>
      </div>
    `;
  }

  function renderDebriefError() {
    const area = getMainArea();
    if (!area) return;
    area.innerHTML = `
      <div style="text-align:center;padding:48px 24px;">
        <div style="font-size:2rem;margin-bottom:16px;">⚠️</div>
        <h3 style="font-size:1.1rem;font-weight:700;color:var(--navy);margin:0 0 10px;">Debrief generation failed</h3>
        <p style="color:var(--gray500);font-size:0.88rem;line-height:1.7;max-width:380px;margin:0 auto 24px;">Your per-station feedback was saved. The circuit debrief requires an internet connection — please try again.</p>
        <button onclick="MMICircuit.generateDebrief()" style="padding:12px 28px;border-radius:50px;border:none;background:#7c3aed;color:#fff;font-size:0.88rem;font-weight:700;cursor:pointer;font-family:inherit;">Retry Debrief →</button>
      </div>
    `;
  }

  function runAgain() {
    abortCircuit();
    renderCircuitIdle();
  }

  function reviewStations() {
    // Scroll back to show per-station feedback which was rendered inline during the circuit
    alert('Per-station feedback was shown after each station. Use "Run Another Circuit" to do a new circuit, or switch to MMI mode to review individual stations.');
  }

  return {
    init,
    activateCircuitMode,
    deactivateCircuitMode,
    setSize,
    setTier,
    updateCreditDisplay,
    startCircuit,
    skipRest,
    abortCircuit,
    generateDebrief,
    runAgain,
    reviewStations,
  };

})();

// Auto-init
document.addEventListener('DOMContentLoaded', () => MMICircuit.init());
