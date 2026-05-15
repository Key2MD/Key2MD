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

 window.Key2MDTrack = window.Key2MDTrack || {};
 window.Key2MDTrack.track = track;
 window.Key2MDTrack.funnel = funnel;
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
	 onReady(function () {
	 enhanceSimpleNav();
	 enhanceStandaloneNav();
	 enhanceK2Nav();
	 });
	 funnel('page_view', { referrer: document.referrer || '' });

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
 } else if (/book a free|15-min|intro call/i.test(target.textContent || '')) {
 track('intro_call_click', { event_category: 'conversion', event_label: href || target.textContent.trim().slice(0, 80) });
 } else if (/send enquiry|enquire/i.test(target.textContent || '')) {
 track('enquiry_intent', { event_category: 'conversion', event_label: target.textContent.trim().slice(0, 80) });
 }

 if (href.indexOf('calendly.com') !== -1) {
 track('calendly_click', { event_category: 'conversion', event_label: href });
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
