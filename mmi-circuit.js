/**
 * mmi-circuit.js - Key2MD MMI Circuit Mode
 * Drop in after mmi-feedback-render.js
 *
 * Manages: circuit config, station sequencing, inter-station rest,
 * per-station feedback collection, aggregate debrief via Claude API.
 */

const MMICircuit = (() => {

 // -- Constants -------------------------------------------------
 const REST_SECONDS = 120; // 2-min rest between stations
 const CIRCUIT_SIZES = [4, 5, 6, 8];
 const BUNDLE_SIZES = { transcript: 5, premium: 6 };
 const BUNDLE_PRICES = { transcript: 30, premium: 60 };
 const BUNDLE_PACK_IDS = { transcript: 'mmi_transcript_5', premium: 'mmi_premium_6' };

 // Pricing display (mirrors CREDIT_PACKS in worker)
 const CREDIT_PRICE = { transcript: 7, premium: 12 };

 // -- State -----------------------------------------------------
 let circuitActive = false;
 let circuitConfig = null; // { size, tier, specialistMode, preset }
 let circuitStations = []; // shuffled, category-balanced array of station objects
 let circuitIdx = 0; // current station index (0-based)
 let circuitResults = []; // [{station, feedback, durationSec, tier}]
 let restTimerInterval = null;
 let restSecondsLeft = 0;
 let onCircuitEnd = null; // callback when all stations + debrief done

 // -- Category balance ------------------------------------------
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

 // -- Public API ------------------------------------------------

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

 // Hide normal practice panels.
 // 'categoryCard' is the unified outer wrapper; the inner aliases
 // (casperCategoryCard / mmiCategoryCard) are kept here for safety so
 // legacy callers continue to work even if the outer ID isn't present.
 // 'bottomRail' is the new under-main-content rail (Stats, Heatmap,
 // Friday Classes, Weekly Tips) - must be hidden during a circuit.
 const panels = ['categoryCard','casperCategoryCard','mmiCategoryCard','mmiOptionsCard','mmiCircuitCard','casperClassCard','webcamPanel','startBtn','scenarioCard','bottomRail'];
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
 // Restore non-mode-specific panels. The category card is intentionally
 // NOT touched here - setMode()/applyModeUI() in practice.html owns that
 // visibility and gets called by the mode pill's onclick. Doing it here
 // too caused both CASPer and MMI category cards to be shown at once.
 const sb = document.getElementById('startBtn');
 if (sb) sb.style.display = '';
 const sc = document.getElementById('scenarioCard');
 if (sc) sc.style.display = '';
 // Restore the bottom rail (was hidden during circuit takeover).
 const br = document.getElementById('bottomRail');
 if (br) br.style.display = '';
 }

 // -- Config panel (sidebar) ------------------------------------

 function renderConfigPanel() {
 const sidebar = document.querySelector('aside.sidebar');
 if (!sidebar) return;

 const defaultTier = 'transcript';
 const defaultSize = BUNDLE_SIZES[defaultTier];

 const panel = document.createElement('div');
 panel.id = 'circuitConfigPanel';
 panel.style.display = 'none';
 panel.innerHTML = `
 <div class="sidebar-card" style="border-color:rgba(124,58,237,0.25);background:rgba(124,58,237,0.04);">
 <h3 style="color:#7c3aed;font-size:0.8rem;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;margin-bottom:14px;">Circuit Setup</h3>

 <div style="margin-bottom:14px;">
 <div style="font-size:0.72rem;font-weight:700;color:var(--gray500);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Stations</div>
 <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
 ${CIRCUIT_SIZES.map(n => {
 const isDefault = n === defaultSize;
 return `<button class="circuit-size-btn${isDefault?' active':''}" data-size="${n}" data-active="${isDefault?'1':''}" onclick="MMICircuit.setSize(${n})" style="padding:8px 4px;border-radius:8px;border:1px solid ${isDefault?'rgba(124,58,237,0.5)':'var(--gray200)'};background:${isDefault?'rgba(124,58,237,0.1)':'var(--gray50)'};color:${isDefault?'#7c3aed':'var(--gray600)'};font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;">${n}</button>`;
 }).join('')}
 </div>
 </div>

 <div style="margin-bottom:14px;">
 <div style="font-size:0.72rem;font-weight:700;color:var(--gray500);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Tier</div>
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
 <button class="circuit-tier-btn active" data-tier="transcript" data-active="1" onclick="MMICircuit.setTier('transcript')" style="padding:8px 6px;border-radius:8px;border:1px solid rgba(124,58,237,0.5);background:rgba(124,58,237,0.1);color:#7c3aed;font-size:0.78rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;"> Transcript</button>
 <button class="circuit-tier-btn" data-tier="premium" data-active="" onclick="MMICircuit.setTier('premium')" style="padding:8px 6px;border-radius:8px;border:1px solid var(--gray200);background:var(--gray50);color:var(--gray600);font-size:0.78rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;">Premium</button>
 </div>
 </div>

 <div style="margin-bottom:14px;">
 <div style="font-size:0.72rem;font-weight:700;color:var(--gray500);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Timing</div>
 <select id="circuitPreset" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--gray200);background:#fff;color:var(--navy);font-size:0.83rem;font-weight:600;font-family:inherit;">
 <option value="standard">Standard (2 min read | 5 min answer)</option>
 <option value="extended">Extended (2 min read | 8 min answer)</option>
 <option value="quickfire">Quickfire (45s read | 4 min answer)</option>
 </select>
 </div>

 <div style="margin-bottom:12px;" id="circuitSpecialistRow">
 <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 10px;border-radius:8px;border:1px solid var(--gray200);background:var(--gray50);">
 <input type="checkbox" id="circuitSpecialist" style="accent-color:#7c3aed;width:15px;height:15px;">
 <div>
 <div style="font-size:0.82rem;font-weight:600;color:var(--gray800);">Specialist Mode</div>
 <div style="font-size:0.68rem;color:var(--gray400);line-height:1.4;">Higher bar - RACS/RANZCO/ACRRM</div>
 </div>
 </label>
 </div>

 <div style="margin-bottom:16px;" id="circuitWeaknessRow">
 <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 10px;border-radius:8px;border:1px solid var(--gray200);background:var(--gray50);">
 <input type="checkbox" id="circuitWeakness" style="accent-color:#7c3aed;width:15px;height:15px;">
 <div>
 <div style="font-size:0.82rem;font-weight:600;color:var(--gray800);">Target my weak areas</div>
 <div style="font-size:0.68rem;color:var(--gray400);line-height:1.4;">Weights stations toward your lowest-scoring categories</div>
 </div>
 </label>
 </div>

 <div id="circuitPricingBox" style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:8px;padding:10px 12px;margin-bottom:14px;">
 <div id="circuitCreditDisplay" style="font-size:1rem;font-weight:800;color:#7c3aed;"></div>
 <div id="circuitBundleNote" style="font-size:0.72rem;color:var(--gray500);margin-top:4px;"></div>
 </div>

 <button id="circuitStartBtn" onclick="MMICircuit.startCircuit()" style="width:100%;padding:12px;border-radius:50px;border:none;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:0.92rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;box-shadow:0 4px 16px rgba(124,58,237,0.3);">
 Start Circuit ->
 </button>
 </div>
 `;
 sidebar.appendChild(panel);
 updateCreditDisplay();
 }

 function setSize(n) {
 document.querySelectorAll('.circuit-size-btn').forEach(btn => {
 const active = parseInt(btn.dataset.size) === n;
 btn.dataset.active = active ? '1' : '';
 btn.style.border = active ? '1px solid rgba(124,58,237,0.5)' : '1px solid var(--gray200)';
 btn.style.background = active ? 'rgba(124,58,237,0.1)' : 'var(--gray50)';
 btn.style.color = active ? '#7c3aed' : 'var(--gray600)';
 });
 updateCreditDisplay();
 }

 function setTier(tier) {
 document.querySelectorAll('.circuit-tier-btn').forEach(btn => {
 const active = btn.dataset.tier === tier;
 btn.dataset.active = active ? '1' : '';
 btn.style.border = active ? '1px solid rgba(124,58,237,0.5)' : '1px solid var(--gray200)';
 btn.style.background = active ? 'rgba(124,58,237,0.1)' : 'var(--gray50)';
 btn.style.color = active ? '#7c3aed' : 'var(--gray600)';
 });
 // snap size to the bundle size for the new tier
 setSize(BUNDLE_SIZES[tier]);
 }

 function updateCreditDisplay() {
 const activeSize = parseInt([...document.querySelectorAll('.circuit-size-btn')]
 .find(b => b.dataset.active === '1')?.dataset.size || BUNDLE_SIZES.transcript);
 const activeTier = ([...document.querySelectorAll('.circuit-tier-btn')]
 .find(b => b.dataset.active === '1')?.dataset.tier) || 'transcript';

 const bundleSize = BUNDLE_SIZES[activeTier];
 const bundlePrice = BUNDLE_PRICES[activeTier];
 const individualTotal = activeSize * CREDIT_PRICE[activeTier];

 const el = document.getElementById('circuitCreditDisplay');
 const noteEl = document.getElementById('circuitBundleNote');
 if (!el) return;

 if (activeSize === bundleSize) {
 el.innerHTML = `${activeSize} stations &bull; <span style="color:#16a34a;">$${bundlePrice}</span> with bundle`;
 if (noteEl) noteEl.innerHTML = `Save $${individualTotal - bundlePrice} vs individual &bull; <a href="plans.html#mmi-section" style="color:#7c3aed;font-weight:600;text-decoration:none;">Buy ${activeTier} bundle -></a>`;
 } else {
 el.innerHTML = `${activeSize} stations &bull; $${individualTotal} in credits`;
 if (noteEl) noteEl.innerHTML = `$${CREDIT_PRICE[activeTier]}/credit &bull; <a href="plans.html#mmi-section" style="color:#7c3aed;font-weight:600;text-decoration:none;">Buy credits -></a>`;
 }
 }

 function bindEvents() {
 // Mode pill click - note: setMode() in practice.html (called from the
 // pill's inline onclick) is the single source of truth for showing/hiding
 // the regular practice panels. We only need to act here when leaving
 // Circuit mode - and we must NOT touch panel visibility (setMode/applyModeUI
 // does that). Otherwise we cause the "two category cards visible" race.
 document.addEventListener('click', e => {
 if (e.target.id === 'modeCircuit' && e.target.dataset.tool === 'mmi-circuit') {
 activateCircuitMode();
 } else if (e.target.id === 'modeCasper' || e.target.id === 'modeMMI') {
 // Only deactivate if Circuit panels are actually showing.
 const cp = document.getElementById('circuitConfigPanel');
 const isCircuitVisible = cp && cp.style.display === 'block';
 if (circuitActive) abortCircuit();
 if (isCircuitVisible) deactivateCircuitMode();
 }
 });
 }

 // -- Circuit main area rendering -------------------------------

 function getMainArea() {
 return document.getElementById('circuitMainArea');
 }

 const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

 // The circuit reuses the normal MMI recording UI for each station, then hides
 // it during rests and the debrief so only the circuit screen shows. launchStation
 // re-shows it (via showNativePracticeUI + setMode('mmi')) before the next station.
 const NATIVE_PRACTICE_IDS = ['scenarioCard','webcamPanel','mmiSpeakingArea','aiFeedbackWrapMMI','mmiSubmitWrap','answerSection','btnGetAIWrap','btnGetAITopWrap'];
 function hideNativePracticeUI() {
 NATIVE_PRACTICE_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
 }
 function showNativePracticeUI() {
 NATIVE_PRACTICE_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
 }

 function renderCircuitIdle() {
 const area = getMainArea();
 if (!area) return;
 hideNativePracticeUI();
 area.innerHTML = `
 <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:500px;text-align:center;padding:40px 24px;">
 <div style="font-size:4rem;margin-bottom:20px;"></div>
 <h2 style="font-size:1.6rem;font-weight:800;color:var(--navy);margin:0 0 12px;">MMI Circuit Mode</h2>
 <p style="color:var(--gray500);font-size:0.95rem;line-height:1.7;max-width:480px;margin:0 0 28px;">
 Back-to-back stations with 2-minute rests - exactly like interview day. Configure your circuit in the sidebar and press Start.
 </p>
 <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:560px;width:100%;margin-bottom:32px;">
 <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:12px;padding:18px 12px;">
 <div style="font-size:1.4rem;margin-bottom:8px;"></div>
 <div style="font-size:0.82rem;font-weight:700;color:var(--navy);margin-bottom:4px;">Balanced stations</div>
 <div style="font-size:0.72rem;color:var(--gray400);line-height:1.5;">Categories spread evenly - no two Ethics or Role-Play back-to-back</div>
 </div>
 <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:12px;padding:18px 12px;">
 <div style="font-size:1.4rem;margin-bottom:8px;">T</div>
 <div style="font-size:0.82rem;font-weight:700;color:var(--navy);margin-bottom:4px;">2-min rest</div>
 <div style="font-size:0.72rem;color:var(--gray400);line-height:1.5;">Timed break between every station - hold yourself to interview conditions</div>
 </div>
 <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:12px;padding:18px 12px;">
 <div style="font-size:1.4rem;margin-bottom:8px;"></div>
 <div style="font-size:0.82rem;font-weight:700;color:var(--navy);margin-bottom:4px;">Circuit debrief</div>
 <div style="font-size:0.72rem;color:var(--gray400);line-height:1.5;">Cross-station patterns, stamina analysis, and a real-day estimate at the end</div>
 </div>
 </div>
 <button onclick="MMICircuit.startCircuit()" style="padding:14px 36px;border-radius:50px;border:none;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:1rem;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 6px 24px rgba(124,58,237,0.35);transition:all 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
 > Start Circuit
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
 In a real MMI you would now walk to the next room. Use this time to reset - breathe, let go of that station.
 </div>
 <div style="font-size:4rem;font-weight:800;color:#7c3aed;font-variant-numeric:tabular-nums;margin-bottom:8px;line-height:1;" id="circuitRestTimer">2:00</div>
 <div style="font-size:0.78rem;color:var(--gray400);margin-bottom:28px;">Rest time remaining</div>
 <div style="background:rgba(255,255,255,0.6);border:1px solid var(--gray200);border-radius:12px;padding:14px 18px;text-align:left;margin-bottom:20px;">
 <div style="font-size:0.65rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray400);margin-bottom:6px;">Next station</div>
 <div style="font-size:0.82rem;font-weight:700;color:var(--navy);margin-bottom:4px;">${nextStation.category}</div>
 <div style="font-size:0.78rem;color:var(--gray500);line-height:1.5;">${nextStation.scenario.substring(0, 120)}${nextStation.scenario.length > 120 ? '...' : ''}</div>
 </div>
 <button onclick="MMICircuit.skipRest()" style="padding:10px 24px;border-radius:50px;border:1px solid rgba(124,58,237,0.3);background:transparent;color:#7c3aed;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:inherit;">
 Skip rest ->
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
 <h3 style="font-size:1.2rem;font-weight:800;color:var(--navy);margin:0 0 10px;">Generating your circuit debrief...</h3>
 <p style="color:var(--gray400);font-size:0.88rem;line-height:1.7;max-width:400px;">Analysing patterns across all ${circuitResults.length} stations. This takes 20-30 seconds.</p>
 <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:20px;" id="circuitDebriefSteps">
 <span class="circuit-debrief-step active"> Criterion heatmap</span>
 <span class="circuit-debrief-step"> Stamina pattern</span>
 <span class="circuit-debrief-step"> Cross-station patterns</span>
 <span class="circuit-debrief-step"> Real-day estimate</span>
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

 // -- Circuit flow ----------------------------------------------

 function getConfig() {
 const activeSize = parseInt([...document.querySelectorAll('.circuit-size-btn')]
 .find(b => b.dataset.active === '1')?.dataset.size || '4');
 const activeTier = ([...document.querySelectorAll('.circuit-tier-btn')]
 .find(b => b.dataset.active === '1')?.dataset.tier) || 'transcript';
 const preset = document.getElementById('circuitPreset')?.value || 'standard';
 const specialist = document.getElementById('circuitSpecialist')?.checked || false;
 const weakness = document.getElementById('circuitWeakness')?.checked || false;
 return { size: activeSize || 4, tier: activeTier, preset, specialistMode: specialist, weaknessMode: weakness };
 }

 function renderCreditPaywall(cfg, balance) {
 const area = getMainArea();
 if (!area) return;
 hideNativePracticeUI();
 const need = cfg.size;
 const tier = cfg.tier;
 const bundleSize = BUNDLE_SIZES[tier];
 const bundlePrice = BUNDLE_PRICES[tier];
 const isBundleSize = need === bundleSize;
 const plansUrl = 'plans.html#mmi-section';
 area.innerHTML = `
 <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;text-align:center;padding:40px 24px;">
 <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.2);border-radius:20px;padding:36px 32px;max-width:460px;width:100%;">
 <div style="font-size:2rem;margin-bottom:12px;"></div>
 <h3 style="font-size:1.2rem;font-weight:800;color:var(--navy);margin:0 0 8px;">Credits needed to start</h3>
 <p style="font-size:0.88rem;color:var(--gray500);line-height:1.6;margin:0 0 20px;">
 You have <strong>${balance}</strong> ${tier} credit${balance===1?'':'s'}. A ${need}-station circuit needs <strong>${need}</strong>.
 </p>
 ${isBundleSize ? `
 <a href="${plansUrl}" style="display:block;padding:13px 20px;border-radius:50px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:0.92rem;font-weight:700;text-decoration:none;margin-bottom:10px;box-shadow:0 4px 16px rgba(124,58,237,0.3);">
 Buy ${need}-station bundle &bull; $${bundlePrice} ->
 </a>
 <div style="font-size:0.72rem;color:var(--gray400);margin-bottom:16px;">Save $${need * CREDIT_PRICE[tier] - bundlePrice} vs individual credits</div>
 ` : `
 <a href="${plansUrl}" style="display:block;padding:13px 20px;border-radius:50px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:0.92rem;font-weight:700;text-decoration:none;margin-bottom:16px;box-shadow:0 4px 16px rgba(124,58,237,0.3);">
 Buy credits ->
 </a>
 `}
 <button onclick="MMICircuit.abortCircuit()" style="background:none;border:none;color:var(--gray400);font-size:0.82rem;cursor:pointer;font-family:inherit;text-decoration:underline;">Back to setup</button>
 </div>
 </div>
 `;
 }

 // Ranks the student's MMI categories from weakest to strongest using their saved
 // marks (same source as weaknessDrill). Returns [] when there is not enough data.
 async function fetchWeakCategoryRanking() {
 try {
 const auth = window.Key2MDAuth;
 const token = (auth && auth.getToken) ? auth.getToken() : '';
 if (!token) return [];
 const base = window.API_BASE || 'https://key2md-api.brittainmbbs.workers.dev';
 const res = await fetch(`${base}/api/mmi/reviews?limit=50&source=mmi`, { headers: { Authorization: `Bearer ${token}` } });
 const data = await res.json().catch(() => ({}));
 const agg = {};
 (data.reviews || []).forEach(r => {
 const cat = r.station_category; let sc = null;
 try { sc = JSON.parse(r.ai_feedback_json || '{}')?.overall?.score; } catch (e) {}
 if (cat && typeof sc === 'number') { (agg[cat] = agg[cat] || []).push(sc); }
 });
 return Object.keys(agg)
 .map(cat => ({ cat, avg: agg[cat].reduce((a, b) => a + b, 0) / agg[cat].length, n: agg[cat].length }))
 .sort((a, b) => a.avg - b.avg);
 } catch (e) { return []; }
 }

 // Weights selection toward the weakest categories (~70% of the circuit), keeping
 // variety and avoiding two of the same category back-to-back. Falls back cleanly.
 function weaknessShuffle(stations, count, ranking) {
 if (!ranking || !ranking.length) return balancedShuffle(stations, count);
 const weakCats = ranking.map(r => r.cat);
 const weakTarget = Math.max(1, Math.round(count * 0.7));
 const byCat = {};
 stations.forEach(s => { const c = s.category || 'General'; (byCat[c] = byCat[c] || []).push(s); });
 Object.values(byCat).forEach(arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } });
 const picked = [];
 const used = new Set();
 let added = true;
 while (picked.length < weakTarget && added) {
 added = false;
 for (const cat of weakCats) {
 if (picked.length >= weakTarget) break;
 const arr = byCat[cat];
 if (!arr || !arr.length) continue;
 const next = arr.find(s => !used.has(s));
 if (next && (picked.length === 0 || picked[picked.length - 1].category !== cat)) {
 picked.push(next); used.add(next); added = true;
 }
 }
 }
 if (picked.length < count) {
 const rest = balancedShuffle(stations.filter(s => !used.has(s)), count - picked.length);
 rest.forEach(s => { if (!used.has(s) && picked.length < count) { picked.push(s); used.add(s); } });
 }
 if (picked.length < count) {
 for (const s of stations) { if (picked.length >= count) break; if (!used.has(s)) { picked.push(s); used.add(s); } }
 }
 return picked.slice(0, count);
 }

 async function startCircuit() {
 if (!window.Key2MDAuth?.isLoggedIn()) {
 window.Key2MDAuth?.showAuthModal('signup');
 return;
 }

 const cfg = getConfig();
 const limits = window.Key2MDAuth?.getLimits();
 const creditKey = cfg.tier === 'premium' ? 'mmi_premium_credits' : 'mmi_transcript_credits';
 const balance = limits ? (limits[creditKey] || 0) : null;
 const hasPro = limits && (limits.mmi_pro_tier || limits.mmi_pro_expires_at > Date.now());

 if (balance !== null && !hasPro && balance < cfg.size) {
 renderCreditPaywall(cfg, balance);
 return;
 }

 circuitConfig = cfg;
 circuitResults = [];
 circuitIdx = 0;
 circuitActive = true;

 // Build the station pool from MMI_STATIONS
 const allStations = window.MMI_STATIONS || [];
 if (allStations.length < circuitConfig.size) {
 alert('Not enough MMI stations available. Please check practice-stations.js.');
 return;
 }

 if (cfg.weaknessMode) {
 const ranking = await fetchWeakCategoryRanking();
 if (ranking.length) {
 circuitStations = weaknessShuffle(allStations, circuitConfig.size, ranking);
 } else {
 circuitStations = balancedShuffle(allStations, circuitConfig.size);
 circuitConfig.weaknessMode = false;
 if (window.showPracticeNotice) window.showPracticeNotice('Not enough marked MMI stations yet to target weak areas - running a balanced circuit. This will use your weak areas once you have a few marks.', 'info');
 }
 } else {
 circuitStations = balancedShuffle(allStations, circuitConfig.size);
 }

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
 <div style="margin-left:auto;font-size:0.72rem;color:var(--gray400);">${circuitConfig.tier === 'premium' ? 'Premium' : 'Transcript'} | ${circuitConfig.specialistMode ? 'Specialist Mode' : 'Med School'}${circuitConfig.weaknessMode ? ' | Weakness focus' : ''}</div>
 </div>

 <div id="circuitFeedbackWrap" style="margin-top:16px;"></div>
 </div>
 `;

 // Make sure the native MMI recording UI (hidden during rest/debrief) is back.
 showNativePracticeUI();

 // Override the global MMI state so the existing recording machinery runs
 // We inject the station into the global pool at index 0 so loadStation() picks it up
 if (window.setMode) window.setMode('mmi');

 // Directly configure the MMI engine state variables used by practice.html
 window.mmiCurrentPrompts = getPrompts(station);
 window.mmiSpecialistMode = circuitConfig.specialistMode;
 window.mmiPremiumMode = circuitConfig.tier === 'premium';

 // Set the active preset so the engine uses correct timing
 if (window.selectMMIPreset) window.selectMMIPreset(circuitConfig.preset);
 if (window.mmiActivePreset !== undefined) window.mmiActivePreset = circuitConfig.preset;

 // Inject station into the global pool so the existing UI renders it
 window.pool = [station];
 window.currentIdx = 0;
 window.sessionActive = true;

 // Route the marked result straight to the circuit. submitMMIForFeedback checks
 // for this hook on its 'done' stage and skips the prediction/feedback UI, so no
 // per-station feedback is shown during the run (the circuit is a true mock).
 window._circuitCapture = (data) => onStationComplete(data, station);

 if (window.loadStation) window.loadStation();
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

 function onStationComplete(data, station) {
 window._circuitCapture = null;
 const feedback = (data && (data.feedback || data)) || null;
 const reviewId = (data && data.review_id) || null;

 circuitResults.push({
 station,
 feedback,
 stationIdx: circuitIdx,
 tier: circuitConfig.tier,
 reviewId,
 });

 // Hide the native recording UI so only the rest/debrief screen shows.
 hideNativePracticeUI();

 const isLast = circuitIdx >= circuitConfig.size - 1;

 if (isLast) {
 // All stations done - go straight to debrief
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
 window._circuitCapture = null;
 showNativePracticeUI();
 circuitResults = [];
 circuitStations = [];
 circuitIdx = 0;
 }

 // -- Progress bar ----------------------------------------------

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
 const done = i < currentIdx;
 const current = i === currentIdx;
 const color = done ? '#7c3aed' : current ? '#7c3aed' : 'var(--gray200)';
 const size = current ? '32px' : '24px';
 return `
 <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
 <div style="width:${size};height:${size};border-radius:50%;background:${done?'#7c3aed':current?'rgba(124,58,237,0.15)':'var(--gray100)'};border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:800;color:${done?'#fff':current?'#7c3aed':'var(--gray400)'};transition:all 0.3s;">
 ${done ? 'OK' : i + 1}
 </div>
 <div style="font-size:0.6rem;color:${current?'#7c3aed':'var(--gray400)'};font-weight:${current?'700':'400'};white-space:nowrap;max-width:52px;overflow:hidden;text-overflow:ellipsis;">${s.category.split(' ')[0]}</div>
 </div>
 ${i < circuitStations.length - 1 ? `<div style="height:2px;flex:1;background:${done?'#7c3aed':'var(--gray200)'};margin-bottom:18px;transition:background 0.3s;"></div>` : ''}
 `;
 }).join('');

 pb.innerHTML = `
 <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#7c3aed;margin-bottom:10px;">
 Circuit Progress - ${currentIdx + 1} of ${circuitStations.length}
 </div>
 <div style="display:flex;align-items:center;gap:0;">${dots}</div>
 `;
 }

 // -- Debrief generation ----------------------------------------

 async function generateDebrief() {
 renderDebriefLoading();
 if (window._circuitDebriefInterval) clearInterval(window._circuitDebriefInterval);

 const debriefPrompt = buildDebriefPrompt();
 const token = window.Key2MDAuth?.getToken();
 const reviewIds = circuitResults.map(r => r.reviewId).filter(Boolean);
 const base = window.API_BASE || 'https://key2md-api.brittainmbbs.workers.dev';

 try {
 const res = await fetch(`${base}/api/mmi/circuit-debrief`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${token}`,
 },
 body: JSON.stringify({ prompt: debriefPrompt, review_ids: reviewIds, circuit_meta: { station_count: circuitConfig.size, tier: circuitConfig.tier } }),
 });
 const data = await res.json();
 if (!res.ok || !data.debrief) {
 console.error('Circuit debrief failed:', data);
 renderDebriefError();
 return;
 }
 renderDebrief(data.debrief);
 } catch (err) {
 console.error('Circuit debrief failed:', err);
 renderDebriefError();
 }
 }

 function buildDebriefPrompt() {
 const stationSummaries = circuitResults.map((r, i) => {
 const fb = r.feedback;
 if (!fb) return `Station ${i + 1} (${r.station.category}): No feedback captured.`;

 const critScores = fb.per_prompt?.[0]?.scores || {};
 const scoreStr = Object.entries(critScores).map(([k, v]) => `${k}: ${v.score}`).join(', ');
 return `Station ${i + 1} (${r.station.category}):
 Overall: ${fb.overall?.label || '-'} (${fb.overall?.score || '-'}/5)
 Criterion scores: ${scoreStr}
 Biggest strength: ${fb.overall?.biggest_strength || '-'}
 Biggest improvement: ${fb.overall?.biggest_improvement || '-'}
 Polished auditor: ${fb.polished_auditor_detected ? 'YES - ' + fb.polished_auditor_explanation : 'No'}
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

Generate the circuit debrief report. Be specific. Reference station numbers and quotes. The "the_one_thing" field is the most important - make it a genuine insight, not a platitude.`;
 }

 // -- Debrief render --------------------------------------------

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
 const TREND_ICONS = { consistent: '->', improving: '', declining: '', variable: 'up/down' };
 const TREND_COLORS = { consistent: '#6b7280', improving: '#16a34a', declining: '#dc2626', variable: '#d97706' };

 const criterionRows = Object.entries(d.criterion_averages || {}).map(([key, val]) => {
 const pct = Math.round((val.avg / 5) * 100);
 const barColor = val.avg >= 4 ? '#16a34a' : val.avg >= 3 ? '#0ea5e9' : val.avg >= 2 ? '#d97706' : '#dc2626';
 const trendIcon = TREND_ICONS[val.trend] || '->';
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
 <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#dc2626;margin-bottom:6px;">Stamina drop detected</div>
 <div style="font-size:0.85rem;color:var(--gray700);line-height:1.65;">${d.stamina_pattern.description}</div>
 <div style="display:flex;gap:16px;margin-top:10px;">
 <div style="font-size:0.78rem;color:var(--gray500);">First half avg: <strong style="color:var(--navy);">${d.stamina_pattern.first_half_avg?.toFixed(1)}</strong></div>
 <div style="font-size:0.78rem;color:var(--gray500);">Second half avg: <strong style="color:var(--navy);">${d.stamina_pattern.second_half_avg?.toFixed(1)}</strong></div>
 </div>
 </div>`
 : `<div style="background:rgba(74,222,128,0.06);border:1px solid rgba(74,222,128,0.2);border-radius:10px;padding:12px 14px;margin-top:12px;">
 <div style="font-size:0.82rem;color:var(--gray700);">OK No significant stamina drop detected. ${d.stamina_pattern?.description || ''}</div>
 </div>`;

 const patternsList = (d.cross_station_patterns || []).map(p =>
 `<li style="margin-bottom:10px;color:var(--gray700);font-size:0.85rem;line-height:1.65;">${p}</li>`
 ).join('');

 const polishedBlock = d.polished_auditor_circuit
 ? `<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:14px 16px;margin-top:16px;">
 <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#d97706;margin-bottom:6px;">Polished Auditor Pattern - across multiple stations</div>
 <div style="font-size:0.85rem;color:var(--gray700);line-height:1.65;">${d.polished_auditor_circuit}</div>
 </div>` : '';

 area.innerHTML = `
 <div style="max-width:780px;margin:0 auto;padding:0 0 48px;">

 <!-- Header -->
 <div style="text-align:center;padding:32px 24px;background:linear-gradient(135deg,rgba(124,58,237,0.08),rgba(14,165,233,0.05));border:1px solid rgba(124,58,237,0.15);border-radius:20px;margin-bottom:24px;">
 <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#7c3aed;margin-bottom:10px;">
 Circuit Complete | ${circuitResults.length} stations | ${circuitConfig.tier === 'premium' ? 'Premium' : 'Transcript'} tier
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
 <span style="color:var(--gray500);">Best station: <strong style="color:var(--navy);">${d.strongest_station?.category || '-'}</strong></span>
 <span style="color:#16a34a;font-weight:600;">S${(d.strongest_station?.station_idx ?? 0) + 1}</span>
 </div>
 <div style="display:flex;justify-content:space-between;font-size:0.78rem;">
 <span style="color:var(--gray500);">Needs work: <strong style="color:var(--navy);">${d.weakest_station?.category || '-'}</strong></span>
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

 <!-- Per-station results (expandable) -->
 <div style="background:#fff;border:1px solid var(--gray200);border-radius:16px;padding:20px 22px;margin-bottom:20px;">
 <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
 <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray400);">Station Results</div>
 <button onclick="MMICircuit.expandAllStations()" style="background:none;border:none;color:#7c3aed;font-size:0.74rem;font-weight:700;cursor:pointer;font-family:inherit;">Expand all</button>
 </div>
 <div style="font-size:0.74rem;color:var(--gray400);margin-bottom:6px;">Tap a station to see its full marking - withheld during the circuit, like the real day.</div>
 ${circuitResults.map((r, i) => {
 const fb = r.feedback;
 const score = fb?.overall?.score || '-';
 const label = fb?.overall?.label || '-';
 const scoreColor = BAND_COLORS[label] || '#6b7280';
 return `
 <div class="circuit-station-item" style="border-bottom:1px solid var(--gray100);">
 <button onclick="MMICircuit.toggleStationDetail(${i})" style="width:100%;display:flex;align-items:center;gap:14px;padding:10px 0;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;">
 <div style="width:28px;height:28px;border-radius:50%;background:rgba(124,58,237,0.1);color:#7c3aed;font-size:0.72rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
 <div style="flex:1;min-width:0;">
 <div style="font-size:0.82rem;font-weight:600;color:var(--navy);">${esc(r.station.category)}</div>
 <div style="font-size:0.72rem;color:var(--gray400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(r.station.scenario.substring(0, 80))}...</div>
 </div>
 <div style="text-align:right;flex-shrink:0;">
 <div style="font-size:1rem;font-weight:800;color:${scoreColor};">${score}/5</div>
 <div style="font-size:0.68rem;color:${scoreColor};font-weight:600;">${esc(label)}</div>
 </div>
 <span class="circuit-station-caret" id="circuitCaret${i}" style="color:var(--gray300);font-size:1.1rem;font-weight:700;flex-shrink:0;width:14px;text-align:center;">+</span>
 </button>
 <div id="circuitStationDetail${i}" style="display:none;padding-bottom:12px;"></div>
 </div>`;
 }).join('')}
 </div>

 <!-- Human review upsell -->
 ${circuitResults.some(r => r.reviewId) ? `
 <div id="circuitReviewUpsell" style="background:linear-gradient(135deg,rgba(124,58,237,0.06),rgba(14,165,233,0.04));border:1.5px solid rgba(124,58,237,0.2);border-radius:16px;padding:24px 22px;margin-bottom:24px;">
 <div style="font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#7c3aed;margin-bottom:6px;">Personal coaching</div>
 <div style="font-size:1rem;font-weight:800;color:var(--navy);margin-bottom:6px;">Have Dan watch your recording</div>
 <p style="font-size:0.84rem;color:var(--gray600);line-height:1.6;margin:0 0 16px;">Pick one station below. Dan will watch the full recording and send you personalised feedback within 48 hours - $50.</p>
 <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
 ${circuitResults.map((r, i) => {
 if (!r.reviewId) return '';
 const score = r.feedback?.overall?.score || '-';
 const safeCategory = (r.station.category || '').replace(/'/g, "\\'");
 const safeName = (r.station.scenario || '').substring(0, 60).replace(/'/g, "\\'");
 return `<button onclick="MMICircuit.selectReviewStation(this,'${r.reviewId}','${safeCategory}','${safeName}')"
 data-review-id="${r.reviewId}"
 style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;border:1.5px solid var(--gray200);background:#fff;cursor:pointer;font-family:inherit;transition:all 0.15s;text-align:left;">
 <div style="width:24px;height:24px;border-radius:50%;background:rgba(124,58,237,0.1);color:#7c3aed;font-size:0.72rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
 <div style="flex:1;font-size:0.83rem;font-weight:600;color:var(--navy);">${r.station.category}</div>
 <div style="font-size:0.88rem;font-weight:700;color:var(--gray500);">${score}/5</div>
 </button>`;
 }).join('')}
 </div>
 <button id="circuitReviewBuyBtn" onclick="MMICircuit.buyCircuitReview()" disabled
 style="width:100%;padding:13px;border-radius:50px;border:none;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:0.92rem;font-weight:700;cursor:pointer;font-family:inherit;opacity:0.4;transition:all 0.2s;">
 Select a station above
 </button>
 </div>` : ''}

 <!-- Actions -->
 <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
 <button onclick="MMICircuit.runAgain()" style="padding:12px 28px;border-radius:50px;border:none;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:0.92rem;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(124,58,237,0.3);transition:all 0.2s;">
 Run Another Circuit
 </button>
 <button onclick="MMICircuit.expandAllStations()" style="padding:12px 28px;border-radius:50px;border:1px solid var(--gray200);background:#fff;color:var(--navy);font-size:0.92rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.2s;">
 Review Each Station
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
 <div style="font-size:2rem;margin-bottom:16px;">!</div>
 <h3 style="font-size:1.1rem;font-weight:700;color:var(--navy);margin:0 0 10px;">Debrief generation failed</h3>
 <p style="color:var(--gray500);font-size:0.88rem;line-height:1.7;max-width:380px;margin:0 auto 24px;">Your per-station feedback was saved. The circuit debrief requires an internet connection - please try again.</p>
 <button onclick="MMICircuit.generateDebrief()" style="padding:12px 28px;border-radius:50px;border:none;background:#7c3aed;color:#fff;font-size:0.88rem;font-weight:700;cursor:pointer;font-family:inherit;">Retry Debrief -></button>
 </div>
 `;
 }

 let _selectedReviewId = null;
 let _selectedStationName = null;
 let _selectedStationCategory = null;

 function selectReviewStation(btn, reviewId, category, name) {
 _selectedReviewId = reviewId;
 _selectedStationName = name;
 _selectedStationCategory = category;
 document.querySelectorAll('[data-review-id]').forEach(b => {
 b.style.border = '1.5px solid var(--gray200)';
 b.style.background = '#fff';
 });
 btn.style.border = '1.5px solid #7c3aed';
 btn.style.background = 'rgba(124,58,237,0.06)';
 const buyBtn = document.getElementById('circuitReviewBuyBtn');
 if (buyBtn) {
 buyBtn.disabled = false;
 buyBtn.style.opacity = '1';
 buyBtn.textContent = `Have Dan review: ${category} - $50`;
 }
 }

 async function buyCircuitReview() {
 if (!_selectedReviewId) return;
 const buyBtn = document.getElementById('circuitReviewBuyBtn');
 if (buyBtn) { buyBtn.disabled = true; buyBtn.textContent = 'Opening checkout...'; }
 try {
 const token = window.Key2MDAuth?.getToken();
 const apiBase = (typeof window !== 'undefined' && window.location.hostname !== 'www.key2md.com')
 ? 'https://key2md.workers.dev' : '';
 const resp = await fetch(`${apiBase}/api/mmi/circuit-review-checkout`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
 body: JSON.stringify({
 review_id: _selectedReviewId,
 station_name: _selectedStationName || _selectedStationCategory,
 station_category: _selectedStationCategory,
 success_url: window.location.href + (window.location.href.includes('?') ? '&' : '?') + 'circuit_review=success',
 cancel_url: window.location.href,
 }),
 });
 const data = await resp.json();
 if (data.checkout_url) {
 window.location.href = data.checkout_url;
 } else {
 if (buyBtn) { buyBtn.disabled = false; buyBtn.style.opacity = '1'; buyBtn.textContent = `Have Dan review: ${_selectedStationCategory} - $50`; }
 alert(data.message || 'Could not open checkout. Please try again.');
 }
 } catch {
 if (buyBtn) { buyBtn.disabled = false; buyBtn.style.opacity = '1'; buyBtn.textContent = `Have Dan review: ${_selectedStationCategory} - $50`; }
 alert('Connection error. Please try again.');
 }
 }

 function runAgain() {
 abortCircuit();
 renderCircuitIdle();
 }

 function renderStationDetail(r) {
 const fb = r && r.feedback;
 if (!fb) return '<div style="padding:12px;color:var(--gray400);font-size:0.82rem;">No feedback was captured for this station.</div>';
 const CRIT = { empathy: 'Empathy', communication: 'Communication', reasoning: 'Reasoning', reflection: 'Reflection', real_world_awareness: 'Real-world Awareness' };
 const sums = {}, counts = {};
 (fb.per_prompt || []).forEach(pp => {
 Object.keys(CRIT).forEach(k => {
 const v = pp && pp.scores && pp.scores[k] && pp.scores[k].score;
 if (typeof v === 'number') { sums[k] = (sums[k] || 0) + v; counts[k] = (counts[k] || 0) + 1; }
 });
 });
 const critRows = Object.keys(CRIT).map(k => {
 if (!counts[k]) return '';
 const a = Math.round((sums[k] / counts[k]) * 10) / 10;
 const col = a >= 4 ? '#16a34a' : a >= 3 ? '#0ea5e9' : a >= 2 ? '#d97706' : '#dc2626';
 const pct = Math.max(0, Math.min(100, (a / 5) * 100));
 return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><span style="font-size:0.74rem;color:var(--gray600);width:140px;flex-shrink:0;">${CRIT[k]}</span><div style="flex:1;height:6px;background:var(--gray100);border-radius:99px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${col};"></div></div><strong style="font-size:0.76rem;color:${col};width:26px;text-align:right;">${a}</strong></div>`;
 }).join('');
 const promptSummaries = (fb.per_prompt || []).map((pp, i) =>
 `<div style="margin-bottom:6px;"><span style="font-size:0.68rem;font-weight:800;color:var(--gray400);">Q${i + 1}</span> <span style="font-size:0.8rem;color:var(--gray600);line-height:1.55;">${esc(pp.summary || '')}</span></div>`
 ).join('');
 const o = fb.overall || {};
 const auditor = fb.polished_auditor_detected
 ? `<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:0.78rem;color:var(--gray700);"><strong style="color:#d97706;">Polished Auditor:</strong> ${esc(fb.polished_auditor_explanation || '')}</div>`
 : '';
 return `<div style="padding:14px 16px;background:var(--gray50);border-radius:10px;margin-top:4px;">
 ${critRows ? `<div style="margin-bottom:12px;">${critRows}</div>` : ''}
 ${auditor}
 ${o.biggest_strength ? `<div style="font-size:0.82rem;margin-bottom:6px;"><strong style="color:#16a34a;">Landed:</strong> <span style="color:var(--gray700);">${esc(o.biggest_strength)}</span></div>` : ''}
 ${(o.biggest_change || o.biggest_improvement) ? `<div style="font-size:0.82rem;margin-bottom:6px;"><strong style="color:#d97706;">Work on:</strong> <span style="color:var(--gray700);">${esc(o.biggest_change || o.biggest_improvement)}</span></div>` : ''}
 ${promptSummaries ? `<div style="margin-top:8px;border-top:1px solid var(--gray100);padding-top:8px;">${promptSummaries}</div>` : ''}
 ${r.reviewId ? `<div style="margin-top:10px;"><a href="history.html" style="font-size:0.78rem;color:#7c3aed;font-weight:700;text-decoration:none;">Open full feedback in history -></a></div>` : ''}
 </div>`;
 }

 function toggleStationDetail(i) {
 const panel = document.getElementById('circuitStationDetail' + i);
 const caret = document.getElementById('circuitCaret' + i);
 if (!panel) return;
 if (panel.style.display === 'none') {
 if (!panel.dataset.rendered) { panel.innerHTML = renderStationDetail(circuitResults[i]); panel.dataset.rendered = '1'; }
 panel.style.display = 'block';
 if (caret) caret.textContent = '-';
 } else {
 panel.style.display = 'none';
 if (caret) caret.textContent = '+';
 }
 }

 function expandAllStations() {
 circuitResults.forEach((r, i) => {
 const panel = document.getElementById('circuitStationDetail' + i);
 if (panel && panel.style.display === 'none') toggleStationDetail(i);
 });
 const first = document.querySelector('.circuit-station-item');
 if (first) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
 toggleStationDetail,
 expandAllStations,
 selectReviewStation,
 buyCircuitReview,
 };

})();

// Auto-init
document.addEventListener('DOMContentLoaded', () => MMICircuit.init());
