/* CADT Workshop 2026 · progressive enhancement only. The page works without it. */
(function () {
  'use strict';

  // Nav: solid background after scrolling.
  var nav = document.querySelector('.nav');
  function onScroll() { if (nav) nav.classList.toggle('scrolled', window.scrollY > 24); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile menu.
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    function closeMenu() { links.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); }
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  // Tabs (program days), keyboard navigable, deep-linkable via #day-2.
  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = Array.prototype.slice.call(root.querySelectorAll('[role="tabpanel"]'));
    function activate(i, focus) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (panels[j]) panels[j].hidden = !on;
      });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { activate(i, false); if (t.dataset.id) history.replaceState(null, '', '#' + t.dataset.id); });
      t.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') n = 0;
        if (e.key === 'End') n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); activate(n, true); }
      });
    });
    function fromHash() {
      var idx = -1;
      tabs.forEach(function (t, i) { if (t.dataset.id && location.hash === '#' + t.dataset.id) idx = i; });
      if (idx >= 0) { activate(idx, false); root.scrollIntoView({ block: 'start' }); }
    }
    activate(0, false);
    fromHash();
    window.addEventListener('hashchange', fromHash);
  });

  // Countdown.
  var cd = document.querySelector('[data-countdown]');
  if (cd) {
    var target = new Date(cd.getAttribute('data-countdown')).getTime();
    if (!isNaN(target)) {
      cd.hidden = false;
      var tick = function () {
        var diff = target - Date.now();
        if (diff <= 0) { cd.classList.add('done'); cd.textContent = 'Happening now'; return; }
        var d = Math.floor(diff / 864e5); diff -= d * 864e5;
        var h = Math.floor(diff / 36e5); diff -= h * 36e5;
        var m = Math.floor(diff / 6e4);
        var set = function (k, v) { var el = cd.querySelector('[data-unit="' + k + '"]'); if (el) el.textContent = String(v); };
        set('days', d); set('hours', h); set('minutes', m);
      };
      tick();
      setInterval(tick, 30000);
    }
  }

  // Figure lightbox using the native dialog element.
  var dlg = document.getElementById('lightbox');
  if (dlg && typeof dlg.showModal === 'function') {
    var img = dlg.querySelector('img');
    var cap = dlg.querySelector('.lb-caption');
    var cred = dlg.querySelector('.lb-credit');
    document.querySelectorAll('[data-lightbox]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        img.src = btn.getAttribute('data-src');
        img.alt = btn.getAttribute('data-alt') || '';
        cap.textContent = btn.getAttribute('data-caption') || '';
        var c = btn.getAttribute('data-credit');
        cred.textContent = c ? 'Credit: ' + c : '';
        dlg.showModal();
      });
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    var close = dlg.querySelector('.lb-close');
    if (close) close.addEventListener('click', function () { dlg.close(); });
  }

  // Footer year.
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
