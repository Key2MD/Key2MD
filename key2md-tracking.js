(function () {
 var GA_ID = 'G-BZ01FP28PC';
 if (!window.dataLayer) window.dataLayer = [];
 if (typeof window.gtag !== 'function') {
 window.gtag = function () { window.dataLayer.push(arguments); };
 window.gtag('js', new Date());
 window.gtag('config', GA_ID);
 if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
 var s = document.createElement('script');
 s.async = true;
 s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
 document.head.appendChild(s);
 }
 }

 function track(name, params) {
 if (typeof window.gtag !== 'function') return;
 window.gtag('event', name, Object.assign({
 event_category: 'site',
 page_path: location.pathname,
 page_title: document.title
 }, params || {}));
 }

 var FUNNEL_KEY = 'key2md_funnel_v1';
 var FUNNEL_ENDPOINT = 'https://key2md-api.brittainmbbs.workers.dev/api/funnel-event';
 var ATTRIBUTION_KEY = 'k2md_attribution';
 var ANON_KEY = 'k2md_anon_id';
 var CF_WEB_ANALYTICS_TOKEN = '134e62e87abb4de7b27a7e543bebf782';
 var CHECKOUT_RE = /\/api\/(?:checkout\/create|pro\/checkout|gamsat-s2\/checkout|casper-class\/checkout|masterclass\/checkout|casper-mock\/checkout|casper-mock\/manual-review\/checkout|mmi\/checkout|tutoring\/checkout|marking\/checkout|marking\/bundle\/checkout)(?:[?#]|$)/;

 function safeJsonParse(raw, fallback) {
 try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
 }

 function cleanText(value, max) {
 return String(value || '').trim().slice(0, max || 240);
 }

 function anonId() {
 try {
 var existing = localStorage.getItem(ANON_KEY);
 if (existing) return existing;
 var random = (window.crypto && crypto.getRandomValues)
 ? Array.from(crypto.getRandomValues(new Uint8Array(12))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('')
 : Math.random().toString(36).slice(2) + Date.now().toString(36);
 var id = 'anon_' + random;
 localStorage.setItem(ANON_KEY, id);
 return id;
 } catch (e) {
 return 'anon_unavailable';
 }
 }

 function captureAttribution() {
 try {
 var existing = safeJsonParse(localStorage.getItem(ATTRIBUTION_KEY), null);
 if (existing && existing.first_seen) return existing;
 var qs = new URLSearchParams(location.search || '');
 var data = {
 first_seen: new Date().toISOString(),
 landing_page: location.pathname + location.search,
 referrer: document.referrer || '',
 anonymous_id: anonId()
 };
 ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (key) {
 var value = qs.get(key);
 if (value) data[key] = cleanText(value, 180);
 });
 if (!data.utm_source && document.referrer) {
 try { data.referrer_host = new URL(document.referrer).hostname; } catch (e) {}
 }
 localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(data));
 return data;
 } catch (e) {
 return { anonymous_id: anonId(), landing_page: location.pathname + location.search, referrer: document.referrer || '' };
 }
 }

 function getAttribution() {
 var data = safeJsonParse(localStorage.getItem(ATTRIBUTION_KEY), null) || captureAttribution();
 if (!data.anonymous_id) data.anonymous_id = anonId();
 return data;
 }

 function withAttributionPayload(payload) {
 var body = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.assign({}, payload) : {};
 if (!body.attribution && !body.k2md_attribution) body.attribution = getAttribution();
 if (!body.anonymous_id && !body.k2md_anonymous_id) body.anonymous_id = anonId();
 return body;
 }

 function attributionEventParams(params) {
 var attr = getAttribution();
 return Object.assign({
 anonymous_id: anonId(),
 utm_source: attr.utm_source || '',
 utm_medium: attr.utm_medium || '',
 utm_campaign: attr.utm_campaign || '',
 utm_term: attr.utm_term || '',
 utm_content: attr.utm_content || '',
 referrer: attr.referrer || '',
 landing_page: attr.landing_page || ''
 }, cleanParams(params || {}));
 }

 function sendToolEvent(stage, params) {
 var data = attributionEventParams(Object.assign({ source: 'browser_tool_telemetry' }, params || {}));
 funnel(stage, data);
 }

 function loadCloudflareWebAnalytics() {
 try {
 var token = cleanText(window.KEY2MD_CF_WEB_ANALYTICS_TOKEN || (document.querySelector('meta[name="cf-web-analytics-token"]') || {}).content || CF_WEB_ANALYTICS_TOKEN, 120);
 if (!token || token === 'REPLACE_WITH_CLOUDFLARE_WEB_ANALYTICS_TOKEN') return;
 if (document.querySelector('script[src*="cloudflareinsights.com/beacon.min.js"]')) return;
 var s = document.createElement('script');
 s.defer = true;
 s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
 s.setAttribute('data-cf-beacon', JSON.stringify({ token: token }));
 document.head.appendChild(s);
 } catch (e) {}
 }

 function instrumentFetch() {
 if (window.__k2mdFetchInstrumented || typeof window.fetch !== 'function') return;
 var originalFetch = window.fetch.bind(window);
 window.fetch = function (input, init) {
 var url = typeof input === 'string' ? input : (input && input.url) || '';
 var options = init ? Object.assign({}, init) : {};
 try {
 var method = String(options.method || (input && input.method) || 'GET').toUpperCase();
 var isCheckout = method === 'POST' && CHECKOUT_RE.test(url);
 if (isCheckout && typeof options.body === 'string') {
 var parsed = safeJsonParse(options.body, null);
 if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
 options.body = JSON.stringify(withAttributionPayload(parsed));
 sendToolEvent('checkout_started', { path: new URL(url, location.origin).pathname });
 }
 }
 if (method === 'POST' && /\/api\/review\/stream(?:[?#]|$)/.test(url)) sendToolEvent('feedback_requested', { path: '/api/review/stream' });
 if (method === 'POST' && /\/api\/casper-mock\/start(?:[?#]|$)/.test(url)) sendToolEvent('mock_started', { path: '/api/casper-mock/start' });
 if (/\/api\/casper-mock\/station(?:[?#]|$)/.test(url)) sendToolEvent('station_started', { path: '/api/casper-mock/station', mode: 'mock' });
 } catch (e) {}
 var response = originalFetch(input, options);
 try {
 if (/\/api\/auth\/signup(?:[?#]|$)/.test(url)) {
 response.then(function (res) {
 if (res && res.ok) sendToolEvent('signup_completed', { path: '/api/auth/signup' });
 }).catch(function () {});
 }
 } catch (e) {}
 return response;
 };
 window.__k2mdFetchInstrumented = true;
 }

 function cleanParams(params) {
 var out = {};
 Object.keys(params || {}).forEach(function (key) {
 var value = params[key];
 if (value === null || value === undefined) return;
 if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value;
 });
 return out;
 }

 function readFunnel() {
 try {
 var raw = localStorage.getItem(FUNNEL_KEY);
 var parsed = raw ? JSON.parse(raw) : { first_seen: new Date().toISOString(), events: [], milestones: {} };
 if (!parsed.funnel_id) parsed.funnel_id = 'fn_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
 return parsed;
 } catch (e) {
 return { funnel_id: 'fn_' + Math.random().toString(36).slice(2) + Date.now().toString(36), first_seen: new Date().toISOString(), events: [], milestones: {} };
 }
 }

 function writeFunnel(data) {
 try { localStorage.setItem(FUNNEL_KEY, JSON.stringify(data)); } catch (e) {}
 }

 function funnel(stage, params) {
 if (!stage) return;
 var data = readFunnel();
 var event = Object.assign({
 stage: String(stage),
 at: new Date().toISOString(),
 path: location.pathname,
 title: document.title
 }, cleanParams(params || {}));
 data.events = data.events || [];
 data.milestones = data.milestones || {};
 data.events.push(event);
 if (data.events.length > 120) data.events = data.events.slice(-120);
 data.milestones[event.stage] = event.at;
 data.last_seen = event.at;
 writeFunnel(data);
 track('k2_funnel_stage', Object.assign({ event_category: 'funnel', event_label: event.stage }, cleanParams(params || {})));
 sendServerFunnel(data.funnel_id, event, params || {});
 }

 function sendServerFunnel(funnelId, event, params) {
 try {
 var payload = Object.assign({
 funnel_id: funnelId,
 stage: event.stage,
 path: event.path,
 title: event.title,
 at: event.at
 }, cleanParams(params || {}));
 var json = JSON.stringify(payload);
 if (navigator.sendBeacon) {
 var blob = new Blob([json], { type: 'application/json' });
 navigator.sendBeacon(FUNNEL_ENDPOINT, blob);
 return;
 }
 fetch(FUNNEL_ENDPOINT, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: json,
 keepalive: true
 }).catch(function () {});
 } catch (e) {}
 }

 function textLabel(target) {
 return (target.getAttribute('data-track-label') || target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
 }

 function explicitParams(target) {
 var params = {
 event_category: target.getAttribute('data-track-category') || 'conversion',
 event_label: textLabel(target)
 };
 var detail = target.getAttribute('data-track-detail');
 var plan = target.getAttribute('data-plan') || target.getAttribute('data-track-plan');
 var value = target.getAttribute('data-track-value');
 var href = target.getAttribute('href') || '';
 if (detail) params.detail = detail;
 if (plan) params.plan = plan;
	 if (href) params.link_url = href;
	 if (value && !Number.isNaN(Number(value))) params.value = Number(value);
	 return params;
	 }

	 function onReady(fn) {
	 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
	 else fn();
	 }

	 function makeMenuButton(className, label) {
	 var button = document.createElement('button');
	 button.type = 'button';
	 button.className = className;
	 button.setAttribute('aria-label', label || 'Toggle menu');
	 button.setAttribute('aria-expanded', 'false');
	 for (var i = 0; i < 3; i++) button.appendChild(document.createElement('span'));
	 return button;
	 }

	 function enhanceSimpleNav() {
	 document.querySelectorAll('.simple-nav').forEach(function (nav, index) {
	 if (nav.dataset.mobileNavReady === 'true') return;
	 var inner = nav.querySelector('.simple-nav-inner');
	 var links = nav.querySelector('.simple-links');
	 if (!inner || !links) return;
	 var button = nav.querySelector('.simple-menu-toggle') || makeMenuButton('simple-menu-toggle', 'Toggle menu');
	 if (!links.id) links.id = 'simpleMobileNav' + (index ? index + 1 : '');
	 button.setAttribute('aria-controls', links.id);
	 if (!button.parentNode) inner.insertBefore(button, links);
	 function setOpen(open) {
	 nav.classList.toggle('simple-nav-open', open);
	 button.classList.toggle('open', open);
	 button.setAttribute('aria-expanded', open ? 'true' : 'false');
	 }
	 button.addEventListener('click', function () {
	 setOpen(!nav.classList.contains('simple-nav-open'));
	 });
	 links.querySelectorAll('a').forEach(function (link) {
	 link.addEventListener('click', function () { setOpen(false); });
	 });
	 document.addEventListener('click', function (event) {
	 if (!nav.contains(event.target)) setOpen(false);
	 });
	 document.addEventListener('keydown', function (event) {
	 if (event.key === 'Escape') setOpen(false);
	 });
	 nav.dataset.mobileNavReady = 'true';
	 });
	 }

	 function enhanceStandaloneNav() {
	 document.querySelectorAll('header.nav, .nav').forEach(function (nav, index) {
	 if (nav.dataset.mobileNavReady === 'true') return;
	 var links = nav.querySelector('.nav-links');
	 if (!links) return;
	 var inner = nav.querySelector('.nav-inner') || nav;
	 var button = nav.querySelector('.nav-menu-toggle') || makeMenuButton('nav-menu-toggle', 'Toggle menu');
	 if (!links.id) links.id = 'primaryNavLinks' + (index ? index + 1 : '');
	 button.setAttribute('aria-controls', links.id);
	 if (!button.parentNode) inner.insertBefore(button, links);
	 function setOpen(open) {
	 links.classList.toggle('open', open);
	 button.classList.toggle('open', open);
	 button.setAttribute('aria-expanded', open ? 'true' : 'false');
	 }
	 button.addEventListener('click', function () {
	 setOpen(!links.classList.contains('open'));
	 });
	 links.querySelectorAll('a').forEach(function (link) {
	 link.addEventListener('click', function () { setOpen(false); });
	 });
	 document.addEventListener('click', function (event) {
	 if (!nav.contains(event.target)) setOpen(false);
	 });
	 document.addEventListener('keydown', function (event) {
	 if (event.key === 'Escape') setOpen(false);
	 });
	 nav.dataset.mobileNavReady = 'true';
	 });
	 }

	 function enhanceK2Nav() {
	 document.querySelectorAll('.k2-header').forEach(function (header) {
	 if (header.dataset.mobileNavReady === 'true') return;
	 var button = header.querySelector('#k2Hamburger, .k2-hamburger');
	 var menu = header.querySelector('#k2MobileNav, .k2-mobile-nav');
	 if (!button || !menu) return;
	 if (!menu.id) menu.id = 'k2MobileNav';
	 button.setAttribute('aria-controls', menu.id);
	 button.setAttribute('aria-expanded', menu.classList.contains('open') ? 'true' : 'false');
	 function closeMenu() {
	 button.classList.remove('open');
	 menu.classList.remove('open');
	 button.setAttribute('aria-expanded', 'false');
	 }
	 button.addEventListener('click', function () {
	 setTimeout(function () {
	 button.setAttribute('aria-expanded', menu.classList.contains('open') ? 'true' : 'false');
	 }, 0);
	 });
	 menu.querySelectorAll('a').forEach(function (link) {
	 link.addEventListener('click', closeMenu);
	 });
	 document.addEventListener('click', function (event) {
	 if (!header.contains(event.target)) closeMenu();
	 });
	 document.addEventListener('keydown', function (event) {
	 if (event.key === 'Escape') closeMenu();
	 });
	 header.dataset.mobileNavReady = 'true';
	 });
	 }

 function newsletterPageKind() {
 var path = location.pathname.split('/').pop() || 'index.html';
 if (/^blog-[^/]+\.html$/i.test(path)) return 'blog';
 if (/^(gemsas-gpa-calculator|medical-school-chances)\.html$/i.test(path)) return 'calculator';
 return '';
 }

 function newsletterCopy(kind) {
 if (kind === 'calculator') {
 return {
 badge: 'Weekly admissions tips',
 title: 'Get your next admissions move in plain English.',
 body: 'Join Dan\'s weekly Key2MD email for CASPer, MMI, GAMSAT S2 and preference strategy notes that are specific enough to use.',
 source: 'calculator_bottom_capture'
 };
 }
 return {
 badge: 'Free weekly teaching notes',
 title: 'Get the next useful Key2MD breakdown.',
 body: 'One short email each week from Dan: examiner logic, common answer mistakes, and what stronger students actually do differently.',
 source: 'blog_bottom_capture'
 };
 }

 function injectNewsletterCapture() {
 var kind = newsletterPageKind();
 if (!kind || document.querySelector('.k2md-newsletter-capture')) return;
 var footer = document.querySelector('footer');
 var main = document.querySelector('main') || document.body;
 if (!footer && !main) return;
 var copy = newsletterCopy(kind);
 var wrap = document.createElement('section');
 wrap.className = 'k2md-newsletter-capture';
 wrap.innerHTML = [
 '<style>',
 '.k2md-newsletter-capture{font-family:Inter,DM Sans,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#071326;color:#fff;padding:36px 18px;border-top:1px solid rgba(14,165,233,.16);border-bottom:1px solid rgba(14,165,233,.16)}',
 '.k2md-newsletter-capture *{box-sizing:border-box}',
 '.k2md-newsletter-inner{max-width:1040px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,420px);gap:24px;align-items:center}',
 '.k2md-newsletter-badge{display:inline-flex;width:max-content;margin-bottom:10px;padding:5px 10px;border-radius:999px;background:rgba(14,165,233,.12);border:1px solid rgba(56,189,248,.25);color:#7dd3fc;font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em}',
 '.k2md-newsletter-title{margin:0 0 8px;color:#fff;font-size:clamp(1.35rem,2.2vw,2rem);line-height:1.15;font-weight:850;letter-spacing:0}',
 '.k2md-newsletter-body{margin:0;color:rgba(255,255,255,.68);font-size:.95rem;line-height:1.65;max-width:620px}',
 '.k2md-newsletter-form{display:flex;gap:10px;align-items:stretch}',
 '.k2md-newsletter-input{min-width:0;flex:1;height:46px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#fff;padding:0 14px;font:inherit;font-size:.9rem;outline:none}',
 '.k2md-newsletter-input:focus{border-color:#38bdf8;background:rgba(14,165,233,.09)}',
 '.k2md-newsletter-input::placeholder{color:rgba(255,255,255,.42)}',
 '.k2md-newsletter-btn{height:46px;border:0;border-radius:8px;background:#f59e0b;color:#0a1628;padding:0 18px;font:inherit;font-size:.86rem;font-weight:850;cursor:pointer;white-space:nowrap}',
 '.k2md-newsletter-btn:disabled{opacity:.65;cursor:wait}',
 '.k2md-newsletter-note{margin:8px 0 0;color:rgba(255,255,255,.42);font-size:.75rem;line-height:1.45}',
 '.k2md-newsletter-status{display:none;margin-top:8px;font-size:.82rem;font-weight:750;line-height:1.45}',
 '.k2md-newsletter-status.ok{display:block;color:#86efac}.k2md-newsletter-status.err{display:block;color:#fca5a5}',
 '@media(max-width:760px){.k2md-newsletter-inner{grid-template-columns:1fr}.k2md-newsletter-form{flex-direction:column}.k2md-newsletter-btn,.k2md-newsletter-input{width:100%}}',
 '</style>',
 '<div class="k2md-newsletter-inner">',
 '<div><div class="k2md-newsletter-badge">' + copy.badge + '</div><h2 class="k2md-newsletter-title">' + copy.title + '</h2><p class="k2md-newsletter-body">' + copy.body + '</p></div>',
 '<form class="k2md-newsletter-form" data-source="' + copy.source + '">',
 '<div style="flex:1;min-width:0"><input class="k2md-newsletter-input" type="email" name="email" placeholder="Your email address" autocomplete="email"><div class="k2md-newsletter-status" aria-live="polite"></div><p class="k2md-newsletter-note">No spam. Unsubscribe anytime. Reply directly to reach Dan.</p></div>',
 '<button class="k2md-newsletter-btn" type="submit">Subscribe</button>',
 '</form>',
 '</div>'
 ].join('');
 if (footer && footer.parentNode) footer.parentNode.insertBefore(wrap, footer);
 else main.appendChild(wrap);
 funnel('newsletter_capture_shown', { source: copy.source, page_kind: kind });
 var form = wrap.querySelector('form');
 var input = wrap.querySelector('input');
 var button = wrap.querySelector('button');
 var status = wrap.querySelector('.k2md-newsletter-status');
 form.addEventListener('submit', function (event) {
 event.preventDefault();
 var email = cleanText(input.value, 180).toLowerCase();
 if (!email || email.indexOf('@') === -1 || email.indexOf('.') === -1) {
 status.className = 'k2md-newsletter-status err';
 status.textContent = 'Enter a valid email address.';
 input.focus();
 return;
 }
 button.disabled = true;
 button.textContent = 'Subscribing...';
 status.className = 'k2md-newsletter-status';
 status.textContent = '';
 fetch('https://key2md-api.brittainmbbs.workers.dev/api/email/subscribe', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(withAttributionPayload({ email: email, source: copy.source, page: location.pathname }))
 }).then(function (res) {
 if (!res.ok) throw new Error('subscribe_failed');
 status.className = 'k2md-newsletter-status ok';
 status.textContent = 'You are in. Check your inbox for Dan.';
 form.classList.add('is-done');
 input.disabled = true;
 button.textContent = 'Subscribed';
 track('email_subscribe', { event_category: 'conversion', event_label: copy.source });
 funnel('email_subscribe', { source: copy.source, page_kind: kind });
 }).catch(function () {
 status.className = 'k2md-newsletter-status err';
 status.textContent = 'That did not send. Try again, or email Dan directly.';
 button.disabled = false;
 button.textContent = 'Subscribe';
 });
 });
 }

 window.Key2MDTrack = window.Key2MDTrack || {};
 window.Key2MDTrack.track = track;
 window.Key2MDTrack.funnel = funnel;
 window.Key2MDTrack.getAttribution = getAttribution;
 window.Key2MDTrack.anonymousId = anonId;
 window.Key2MDTrack.toolEvent = sendToolEvent;
 window.Key2MDTrack.classPlanSelect = function (plan) {
 track('class_plan_select', { event_category: 'conversion', event_label: plan, plan: plan });
 funnel('class_plan_select', { plan: plan });
 };
 window.Key2MDTrack.classCheckoutStart = function (plan) {
 track('class_checkout_start', { event_category: 'conversion', event_label: plan, plan: plan });
 funnel('class_checkout_start', { plan: plan });
 };
	 window.Key2MDTrack.stripeRedirect = function (product, plan) {
	 track('stripe_redirect', { event_category: 'conversion', event_label: product + (plan ? ':' + plan : ''), product: product, plan: plan || '' });
	 funnel('stripe_redirect', { product: product, plan: plan || '' });
	 };
	 captureAttribution();
	 instrumentFetch();
	 loadCloudflareWebAnalytics();
	 onReady(function () {
	 enhanceSimpleNav();
	 enhanceStandaloneNav();
	 enhanceK2Nav();
	 injectNewsletterCapture();
	 });
	 funnel('page_view', attributionEventParams({ referrer: document.referrer || '', source: 'browser_page_view' }));

 document.addEventListener('click', function (event) {
 var target = event.target.closest('a,button');
 if (!target) return;

 var explicit = target.getAttribute('data-track');
 if (explicit) {
 track(explicit, explicitParams(target));
 funnel(explicit, explicitParams(target));
 return;
 }

 var href = target.getAttribute('href') || '';
 if (/copy my result|share result|email me my plan/i.test(target.textContent || '')) {
 track('calculator_result_action', { event_category: 'conversion', event_label: target.textContent.trim().slice(0, 80) });
 } else if (/service-|tutor-|coaching-/i.test(href)) {
 track('service_page_click', { event_category: 'navigation', event_label: href });
 } else if (/preference discussion|preferences discussion/i.test(target.textContent || '')) {
 track('preference_discussion_click', { event_category: 'conversion', event_label: href || target.textContent.trim().slice(0, 80) });
 } else if (/send enquiry|enquire/i.test(target.textContent || '')) {
 track('enquiry_intent', { event_category: 'conversion', event_label: target.textContent.trim().slice(0, 80) });
 }

 if (href.indexOf('calendly.com') !== -1) {
 track('calendly_click', { event_category: 'conversion', event_label: href });
 } else if (href.indexOf('booking.html') !== -1) {
 track('booking_page_click', { event_category: 'conversion', event_label: href });
 } else if (href.indexOf('casper-class.html') !== -1) {
 track('class_page_click', { event_category: 'navigation', event_label: href });
 } else if (/checkout|buy|pro/i.test(target.id + ' ' + target.className + ' ' + target.textContent)) {
 track('checkout_intent', { event_category: 'conversion', event_label: target.textContent.trim().slice(0, 80) });
 funnel('checkout_intent', { event_label: target.textContent.trim().slice(0, 80) });
 } else if (href.indexOf('medical-school-chances.html') !== -1) {
 track('calculator_click', { event_category: 'navigation', event_label: href });
 } else if (href.indexOf('practice.html') !== -1 || href.indexOf('gamsat-s2-practice.html') !== -1) {
 track('practice_tool_click', { event_category: 'navigation', event_label: href });
 }
 }, { passive: true });
})();
