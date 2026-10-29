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

  // Hero timelapse. The "today" image is masked by a soft circle that grows from
  // the harbor, so the city spreads over the natural coast as time runs forward.
  // Plays once on load (skipped with reduced motion); then the slider, a drag on
  // the image, or the play button scrubs it. Without JS the "today" image shows.
  var cmp = document.querySelector('[data-compare]');
  if (cmp) {
    var stage = cmp.querySelector('.cmp-stage');
    var after = cmp.querySelector('.cmp-after');
    var range = cmp.querySelector('.cmp-range');
    var play = cmp.querySelector('.cmp-play');
    var capEl = cmp.querySelector('figcaption');
    var ox = parseFloat(cmp.getAttribute('data-origin-x')) / 100;
    var oy = parseFloat(cmp.getAttribute('data-origin-y')) / 100;
    var t = 1, anim = null;
    var setMask = function (v) { after.style.webkitMaskImage = v; after.style.maskImage = v; };
    var render = function () {
      var w = stage.clientWidth, h = stage.clientHeight;
      var cx = ox * w, cy = oy * h;
      var far = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
      var feather = 0.22 * w;
      if (t >= 1) setMask('none');
      else {
        var r = t * (far + feather);
        setMask('radial-gradient(circle at ' + cx + 'px ' + cy + 'px, #000 ' + Math.max(0, r - feather) + 'px, transparent ' + r + 'px)');
      }
      range.value = String(Math.round(t * 1000));
      range.style.setProperty('--p', (t * 100) + '%');
      var label = t < 0.5 ? range.getAttribute('data-before-label') : range.getAttribute('data-after-label');
      range.setAttribute('aria-valuetext', label);
      capEl.textContent = capEl.getAttribute(t < 0.5 ? 'data-before-caption' : 'data-after-caption');
    };
    var stop = function () { if (anim) { cancelAnimationFrame(anim); anim = null; } };
    var animate = function (from, to, ms) {
      stop();
      var t0 = null;
      var step = function (now) {
        if (t0 === null) t0 = now;
        var k = Math.min(1, (now - t0) / ms);
        var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        t = from + (to - from) * e;
        render();
        anim = k < 1 ? requestAnimationFrame(step) : null;
      };
      anim = requestAnimationFrame(step);
    };
    range.addEventListener('input', function () { stop(); t = Number(range.value) / 1000; render(); });
    play.addEventListener('click', function () { t = 0; render(); animate(0, 1, 4200); });
    var dragging = false;
    var fromPointer = function (e) {
      var b = stage.getBoundingClientRect();
      t = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
      render();
    };
    stage.addEventListener('pointerdown', function (e) { dragging = true; stop(); stage.setPointerCapture(e.pointerId); fromPointer(e); });
    stage.addEventListener('pointermove', function (e) { if (dragging) fromPointer(e); });
    stage.addEventListener('pointerup', function () { dragging = false; });
    stage.addEventListener('pointercancel', function () { dragging = false; });
    window.addEventListener('resize', render);

    var imgs = Array.prototype.slice.call(stage.querySelectorAll('img'));
    Promise.all(imgs.map(function (im) { return im.decode ? im.decode().catch(function () {}) : Promise.resolve(); })).then(function () {
      cmp.classList.add('is-live');
      cmp.querySelector('.cmp-controls').hidden = false;
      var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (still) { t = 1; render(); return; }
      t = 0; render();
      // Start once the figure is mostly on screen (it sits below the fold on phones).
      var go = function () { setTimeout(function () { if (t === 0 && !dragging) animate(0, 1, 4200); }, 700); };
      if (!('IntersectionObserver' in window)) { go(); return; }
      var io = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { io.disconnect(); go(); }
      }, { threshold: 0.6 });
      io.observe(stage);
    });
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
