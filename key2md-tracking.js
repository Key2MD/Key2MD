(function () {
  function track(name, params) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', name, Object.assign({ event_category: 'site' }, params || {}));
  }

  document.addEventListener('click', function (event) {
    var target = event.target.closest('a,button');
    if (!target) return;

    var explicit = target.getAttribute('data-track');
    if (explicit) {
      track(explicit, { event_label: target.textContent.trim().slice(0, 80) });
      return;
    }

    var href = target.getAttribute('href') || '';
    if (href.indexOf('calendly.com') !== -1) {
      track('calendly_click', { event_category: 'conversion', event_label: href });
    } else if (/checkout|buy|pro/i.test(target.id + ' ' + target.className + ' ' + target.textContent)) {
      track('checkout_intent', { event_category: 'conversion', event_label: target.textContent.trim().slice(0, 80) });
    } else if (href.indexOf('medical-school-chances.html') !== -1) {
      track('calculator_click', { event_category: 'navigation', event_label: href });
    } else if (href.indexOf('practice.html') !== -1 || href.indexOf('gamsat-s2-practice.html') !== -1) {
      track('practice_tool_click', { event_category: 'navigation', event_label: href });
    }
  }, { passive: true });
})();
