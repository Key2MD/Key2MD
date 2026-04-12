/**
 * Key2MD Auth Module
 * 
 * Drop-in auth for practice tool pages.
 * Include this script, then call Key2MDAuth.init() on DOMContentLoaded.
 * 
 * Usage:
 *   <script src="auth.js"></script>
 *   <script>
 *     document.addEventListener('DOMContentLoaded', () => {
 *       Key2MDAuth.init({
 *         tool: 'casper',           // or 'gamsat'
 *         apiBase: 'https://key2md-api.YOUR_SUBDOMAIN.workers.dev',
 *         onAuthChange: (user) => { ... },  // called on login/logout
 *         onLimitsLoaded: (limits) => { ... },
 *       });
 *     });
 *   </script>
 */

const Key2MDAuth = (() => {
  // ── State ──
  let _user = null;
  let _limits = null;
  let _config = {};
  const TOKEN_KEY = 'key2md_token';

  // ── Public API ──

  function init(config) {
    _config = {
      tool: config.tool || 'casper',
      apiBase: config.apiBase || '',
      onAuthChange: config.onAuthChange || (() => {}),
      onLimitsLoaded: config.onLimitsLoaded || (() => {}),
    };

    injectAuthModal();
    injectAuthBar();
    checkSession();
  }

  function getUser() { return _user; }
  function getLimits() { return _limits; }
  function isLoggedIn() { return !!_user; }
  function isPro() { return _user?.tier === 'pro'; }
  function getToken() { return localStorage.getItem(TOKEN_KEY); }

  /**
   * Call this before making an AI review request.
   * Returns { allowed: true } or { allowed: false, reason: 'auth_required'|'limit_reached' }
   */
  function canReview() {
    if (!_user) return { allowed: false, reason: 'auth_required' };
    if (_user.tier === 'pro') return { allowed: true };
    if (!_limits) return { allowed: true }; // optimistic if limits not loaded yet
    const toolLimits = _limits[_config.tool];
if (toolLimits && toolLimits.remaining <= 0 && !toolLimits.credits) return { allowed: false, reason: 'limit_reached' };
    return { allowed: true };
  }

  /**
   * Make an AI review request through the authenticated worker.
   * This replaces direct fetch to the old PROXY_URL.
   */
  async function requestReview(messages, extraContext = {}) {
    const check = canReview();
    if (!check.allowed) {
      if (check.reason === 'auth_required') showAuthModal('signup');
      return { error: check.reason };
    }

    const token = getToken();
    const res = await fetch(`${_config.apiBase}/api/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        tool: _config.tool,
        model: extraContext.model || 'claude-sonnet-4-20250514',
        max_tokens: extraContext.max_tokens || 625,
        system: extraContext.system || undefined,
        use_credit: extraContext.use_credit || false,
        messages,
        question_context: extraContext.question || '',
        user_response: extraContext.response || '',
      }),
    });

    const data = await res.json();

    if (res.status === 401) {
      showAuthModal('signup');
      return { error: 'auth_required' };
    }
    if (res.status === 429) {
      showLimitReached();
      return { error: 'limit_reached', ...data };
    }

    // Refresh limits after successful review
    await loadLimits();

    return data;
  }

  // ── Session Management ──

  async function checkSession() {
    const token = getToken();
    if (!token) {
      setUser(null);
      return;
    }

    try {
      const res = await fetch(`${_config.apiBase}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        await loadLimits();
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }

  async function loadLimits() {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`${_config.apiBase}/api/limits`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      _limits = await res.json();
      _config.onLimitsLoaded(_limits);
      updateLimitUI();
    } catch {
      // silent fail
    }
  }

  function setUser(user) {
    _user = user;
    updateAuthBar();
    _config.onAuthChange(user);
  }

  // ── Auth Actions ──

  async function signup(email, password, name) {
    const res = await fetch(`${_config.apiBase}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');

    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    await loadLimits();
    hideAuthModal();
    return data;
  }

  async function login(email, password) {
    const res = await fetch(`${_config.apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    await loadLimits();
    hideAuthModal();
    return data;
  }

  async function logout() {
    const token = getToken();
    if (token) {
      fetch(`${_config.apiBase}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    _user = null;
    _limits = null;
    setUser(null);
  }

  // ── UI: Auth Modal ──

  function injectAuthModal() {
    if (document.getElementById('k2mdAuthModal')) return;

    const modal = document.createElement('div');
    modal.id = 'k2mdAuthModal';
    modal.innerHTML = `
      <style>
        #k2mdAuthModal { display:none; position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); align-items:center; justify-content:center; }
        #k2mdAuthModal.open { display:flex; }
        .k2md-auth-card { background:#0d1f3c; border:1px solid rgba(255,255,255,0.12); border-radius:20px; padding:40px 36px; max-width:420px; width:92%; position:relative; }
        .k2md-auth-close { position:absolute; top:16px; right:16px; background:rgba(255,255,255,0.08); border:none; color:#fff; width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:1rem; display:flex; align-items:center; justify-content:center; }
        .k2md-auth-title { color:#fff; font-size:1.3rem; font-weight:800; margin-bottom:6px; }
        .k2md-auth-sub { color:rgba(255,255,255,0.55); font-size:0.88rem; margin-bottom:24px; }
        .k2md-auth-input { width:100%; padding:12px 16px; border:1.5px solid rgba(255,255,255,0.15); border-radius:10px; font-size:0.92rem; font-family:inherit; color:#fff; background:rgba(255,255,255,0.06); outline:none; transition:border-color 0.2s; margin-bottom:14px; box-sizing:border-box; }
        .k2md-auth-input:focus { border-color:#0ea5e9; background:rgba(14,165,233,0.06); }
        .k2md-auth-input::placeholder { color:rgba(255,255,255,0.3); }
        .k2md-auth-btn { width:100%; padding:14px; border-radius:50px; border:none; background:#0ea5e9; color:#fff; font-size:0.95rem; font-weight:700; cursor:pointer; transition:all 0.2s; font-family:inherit; margin-top:4px; }
        .k2md-auth-btn:hover { background:#38bdf8; }
        .k2md-auth-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .k2md-auth-toggle { color:rgba(255,255,255,0.5); font-size:0.82rem; text-align:center; margin-top:18px; }
        .k2md-auth-toggle a { color:#38bdf8; cursor:pointer; font-weight:600; text-decoration:none; }
        .k2md-auth-toggle a:hover { text-decoration:underline; }
        .k2md-auth-error { background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); color:#fca5a5; font-size:0.82rem; padding:10px 14px; border-radius:8px; margin-bottom:14px; display:none; }
        .k2md-auth-perks { display:flex; flex-direction:column; gap:8px; margin-bottom:20px; }
        .k2md-auth-perk { display:flex; align-items:center; gap:10px; font-size:0.82rem; color:rgba(255,255,255,0.7); }
        .k2md-auth-perk::before { content:'✓'; color:#0ea5e9; font-weight:800; font-size:0.75rem; flex-shrink:0; }
        .k2md-auth-forgot { color:rgba(255,255,255,0.4); font-size:0.78rem; text-align:right; display:block; margin-top:-8px; margin-bottom:12px; cursor:pointer; text-decoration:none; }
        .k2md-auth-forgot:hover { color:#38bdf8; }
      </style>

      <div class="k2md-auth-card">
        <button class="k2md-auth-close" onclick="Key2MDAuth.hideAuthModal()">✕</button>
        
        <!-- Signup View -->
        <div id="k2mdAuthSignup">
          <div class="k2md-auth-title">Create your free account</div>
          <div class="k2md-auth-sub">Unlock AI-powered feedback on your responses</div>
          <div class="k2md-auth-perks">
            <div class="k2md-auth-perk">Server-saved practice history</div>
            <div class="k2md-auth-perk">2 free AI reviews per day (CASPer)</div>
            <div class="k2md-auth-perk">1 free AI review per day (GAMSAT S2)</div>
            <div class="k2md-auth-perk">Track your progress over time</div>
          </div>
          <div class="k2md-auth-error" id="k2mdSignupError"></div>
          <input class="k2md-auth-input" id="k2mdSignupName" type="text" placeholder="Your name (optional)" autocomplete="name">
          <input class="k2md-auth-input" id="k2mdSignupEmail" type="email" placeholder="Email address" autocomplete="email">
          <input class="k2md-auth-input" id="k2mdSignupPassword" type="password" placeholder="Password (8+ characters)" autocomplete="new-password">
          <button class="k2md-auth-btn" id="k2mdSignupBtn" onclick="Key2MDAuth._doSignup()">Create Free Account →</button>
          <div class="k2md-auth-toggle">Already have an account? <a onclick="Key2MDAuth.showAuthModal('login')">Log in</a></div>
        </div>

        <!-- Login View -->
        <div id="k2mdAuthLogin" style="display:none;">
          <div class="k2md-auth-title">Welcome back</div>
          <div class="k2md-auth-sub">Log in to continue your practice</div>
          <div class="k2md-auth-error" id="k2mdLoginError"></div>
          <input class="k2md-auth-input" id="k2mdLoginEmail" type="email" placeholder="Email address" autocomplete="email">
          <input class="k2md-auth-input" id="k2mdLoginPassword" type="password" placeholder="Password" autocomplete="current-password">
          <a class="k2md-auth-forgot" onclick="Key2MDAuth.showAuthModal('forgot')">Forgot password?</a>
          <button class="k2md-auth-btn" id="k2mdLoginBtn" onclick="Key2MDAuth._doLogin()">Log In →</button>
          <div class="k2md-auth-toggle">No account yet? <a onclick="Key2MDAuth.showAuthModal('signup')">Create one free</a></div>
        </div>

        <!-- Forgot Password View -->
        <div id="k2mdAuthForgot" style="display:none;">
          <div class="k2md-auth-title">Reset your password</div>
          <div class="k2md-auth-sub">Enter your email and we'll send a reset link</div>
          <div class="k2md-auth-error" id="k2mdForgotError"></div>
          <input class="k2md-auth-input" id="k2mdForgotEmail" type="email" placeholder="Email address" autocomplete="email">
          <button class="k2md-auth-btn" id="k2mdForgotBtn" onclick="Key2MDAuth._doForgot()">Send Reset Link →</button>
          <div class="k2md-auth-toggle"><a onclick="Key2MDAuth.showAuthModal('login')">← Back to login</a></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideAuthModal();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideAuthModal();
    });

    // Enter key to submit
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (document.getElementById('k2mdAuthSignup').style.display !== 'none') {
        if (document.activeElement?.closest('#k2mdAuthSignup')) _doSignup();
      } else if (document.getElementById('k2mdAuthLogin').style.display !== 'none') {
        if (document.activeElement?.closest('#k2mdAuthLogin')) _doLogin();
      }
    });
  }

  function showAuthModal(view = 'signup') {
    const modal = document.getElementById('k2mdAuthModal');
    if (!modal) return;

    document.getElementById('k2mdAuthSignup').style.display = view === 'signup' ? 'block' : 'none';
    document.getElementById('k2mdAuthLogin').style.display = view === 'login' ? 'block' : 'none';
    document.getElementById('k2mdAuthForgot').style.display = view === 'forgot' ? 'block' : 'none';

    // Clear errors
    document.getElementById('k2mdSignupError').style.display = 'none';
    document.getElementById('k2mdLoginError').style.display = 'none';
    document.getElementById('k2mdForgotError').style.display = 'none';

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus first input
    setTimeout(() => {
      const firstInput = modal.querySelector(`#k2mdAuth${view.charAt(0).toUpperCase() + view.slice(1)} input`);
      if (firstInput) firstInput.focus();
    }, 100);
  }

  function hideAuthModal() {
    const modal = document.getElementById('k2mdAuthModal');
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  function showLimitReached() {
    // Could show a custom modal or reuse the auth modal with upgrade info
    // For now, this is handled inline by the practice tool
  }

  // ── UI: Auth Bar (top of sidebar or page) ──

  function injectAuthBar() {
    // The practice pages should have a <div id="k2mdAuthBar"></div> 
    // where they want the auth status to appear
    updateAuthBar();
  }

  function updateAuthBar() {
    const bar = document.getElementById('k2mdAuthBar');
    if (!bar) return;

    if (_user) {
      bar.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(14,165,233,0.08);border:1px solid rgba(14,165,233,0.2);border-radius:10px;">
          <div>
            <div style="font-size:0.82rem;font-weight:700;color:var(--navy,#0a1628);">${_user.name || _user.email.split('@')[0]}</div>
            <div style="font-size:0.72rem;color:var(--gray400,#94a3b8);">${_user.tier === 'pro' ? '⭐ Pro' : 'Free account'}</div>
          </div>
          <button onclick="Key2MDAuth.logout()" style="background:none;border:1px solid var(--gray200,#e2e8f0);border-radius:6px;padding:5px 10px;font-size:0.72rem;color:var(--gray600,#475569);cursor:pointer;font-family:inherit;">Log out</button>
        </div>
      `;
    } else {
      bar.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;padding:14px 16px;background:rgba(14,165,233,0.05);border:1px solid rgba(14,165,233,0.15);border-radius:10px;">
          <div style="font-size:0.82rem;color:var(--gray600,#475569);line-height:1.4;">Create a free account to unlock AI-powered feedback</div>
          <div style="display:flex;gap:8px;">
            <button onclick="Key2MDAuth.showAuthModal('signup')" style="flex:1;padding:9px;border-radius:8px;border:none;background:#0ea5e9;color:#fff;font-size:0.82rem;font-weight:700;cursor:pointer;font-family:inherit;">Sign Up Free</button>
            <button onclick="Key2MDAuth.showAuthModal('login')" style="flex:1;padding:9px;border-radius:8px;border:1px solid var(--gray200,#e2e8f0);background:transparent;color:var(--gray600,#475569);font-size:0.82rem;font-weight:600;cursor:pointer;font-family:inherit;">Log In</button>
          </div>
        </div>
      `;
    }
  }

  function updateLimitUI() {
    // Update any limit display elements on the page
    if (!_limits) return;
    const toolLimits = _limits[_config.tool];
    if (!toolLimits) return;

    // Update the existing limit bar elements if they exist
    const countEl = document.getElementById('aiLimitCount') || document.getElementById('limitNote');
    const fillEl = document.getElementById('aiLimitFill');

    if (toolLimits.unlimited) {
      if (countEl) { countEl.textContent = '∞ Unlimited (Pro)'; countEl.className = 'ai-limit-count'; }
      if (fillEl) { fillEl.style.width = '100%'; fillEl.className = 'ai-limit-fill'; }
      return;
    }

    const remaining = Math.max(0, toolLimits.limit - toolLimits.used);
    const pct = (remaining / toolLimits.limit * 100);

    if (countEl) {
      countEl.textContent = remaining > 0 ? `${remaining} remaining` : 'Used for today';
      countEl.className = remaining === 0 ? 'ai-limit-count exhausted' : 'ai-limit-count';
    }
    if (fillEl) {
      fillEl.style.width = pct + '%';
      fillEl.className = remaining === 0 ? 'ai-limit-fill exhausted' : 'ai-limit-fill';
    }
  }

  // ── Internal Auth Actions ──

  async function _doSignup() {
    const btn = document.getElementById('k2mdSignupBtn');
    const errEl = document.getElementById('k2mdSignupError');
    const name = document.getElementById('k2mdSignupName').value.trim();
    const email = document.getElementById('k2mdSignupEmail').value.trim();
    const password = document.getElementById('k2mdSignupPassword').value;

    btn.disabled = true;
    btn.textContent = 'Creating account...';
    errEl.style.display = 'none';

    try {
      await signup(email, password, name);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Free Account →';
    }
  }

  async function _doLogin() {
    const btn = document.getElementById('k2mdLoginBtn');
    const errEl = document.getElementById('k2mdLoginError');
    const email = document.getElementById('k2mdLoginEmail').value.trim();
    const password = document.getElementById('k2mdLoginPassword').value;

    btn.disabled = true;
    btn.textContent = 'Logging in...';
    errEl.style.display = 'none';

    try {
      await login(email, password);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log In →';
    }
  }

  async function _doForgot() {
    const btn = document.getElementById('k2mdForgotBtn');
    const errEl = document.getElementById('k2mdForgotError');
    const email = document.getElementById('k2mdForgotEmail').value.trim();

    if (!email) {
      errEl.textContent = 'Please enter your email';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      await fetch(`${_config.apiBase}/api/auth/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      errEl.textContent = 'If an account exists with this email, a reset link has been sent.';
      errEl.style.display = 'block';
      errEl.style.background = 'rgba(34,197,94,0.12)';
      errEl.style.borderColor = 'rgba(34,197,94,0.3)';
      errEl.style.color = '#86efac';
    } catch {
      errEl.textContent = 'Something went wrong. Please try again.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Reset Link →';
    }
  }

  // ── Expose public API ──
  return {
    init,
    getUser,
    getLimits,
    isLoggedIn,
    isPro,
    getToken,
    canReview,
    requestReview,
    showAuthModal,
    hideAuthModal,
    logout,
    checkSession,
    // Internal (exposed for onclick handlers in injected HTML)
    _doSignup,
    _doLogin,
    _doForgot,
  };
})();
