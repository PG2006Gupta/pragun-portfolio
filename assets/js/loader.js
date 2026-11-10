/* ============================================================
   ENTRANCE — loader.js
   Drives the geodesic gate, then hands off to portfolio.html.
   Progress is tied to real asset loading with a comfortable
   minimum duration and a hard ceiling, so it can never stall.
   ============================================================ */
(function () {
  'use strict';

  var gate = document.getElementById('gate');
  if (!gate) return;

  var canvas   = document.getElementById('poly');
  var nameEl   = document.getElementById('name');
  var pctEl    = document.getElementById('statusPct');
  var labelEl  = document.getElementById('statusLabel');
  var skipLink = document.getElementById('skipLink');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Keep the construction visible long enough to feel intentional.
  // The old session shortcut made repeat visits look like a one-second flash.
  var MIN_MS  = reduceMotion ? 2200 : 4200;   // watchable minimum build-up
  var CAP_MS  = reduceMotion ? 4000 : 6500;   // hard ceiling — never stalls
  var HOLD_MS = reduceMotion ? 420 : 760;     // beat between last face and the name
  var EXIT_MS = reduceMotion ? 520 : 1060;    // exit animation length
  var PORTFOLIO = 'portfolio.html';

  /* ---------- 1. split the name into per-letter reveal units ---------- */
  (function splitName() {
    if (!nameEl) return;
    var words = (nameEl.getAttribute('data-name') || nameEl.textContent || 'Pragun Gupta').trim().split(/\s+/);
    var frag = document.createDocumentFragment();
    var i = 0;
    words.forEach(function (word, w) {
      var wordWrap = document.createElement('span');
      wordWrap.className = 'nm-word';
      word.split('').forEach(function (ch) {
        var outer = document.createElement('span');
        outer.className = 'nm-char';
        outer.style.setProperty('--i', i++);
        var inner = document.createElement('span');
        inner.textContent = ch;
        outer.appendChild(inner);
        wordWrap.appendChild(outer);
      });
      frag.appendChild(wordWrap);
      if (w === words.length - 1) {
        var dotWrap = document.createElement('span');
        dotWrap.className = 'nm-word';
        var dotChar = document.createElement('span');
        dotChar.className = 'nm-char';
        dotChar.style.setProperty('--i', i++);
        var dot = document.createElement('span');
        dot.className = 'dot';
        dot.textContent = '.';
        dotChar.appendChild(dot);
        dotWrap.appendChild(dotChar);
        frag.appendChild(dotWrap);
      }
    });
    nameEl.textContent = '';
    nameEl.appendChild(frag);
    nameEl.setAttribute('aria-label', 'Pragun Gupta');
  })();

  /* ---------- 2. the geometry ---------- */
  function resolveDetail() {
    var w = window.innerWidth;
    if (w < 560) return 1;    // 80 faces — light on small phones
    return 2;                 // 320 faces
  }

  var poly = null;
  try {
    if (window.PolygonGate && canvas) {
      poly = window.PolygonGate.create(canvas, {
        detail: resolveDetail(),
        reduceMotion: reduceMotion,
        startAngle: -0.55
      });
    }
  } catch (err) { poly = null; }
  if (poly) window.__gate = poly;              // handy for QA
  if (!poly && canvas) canvas.style.display = 'none';
  if (!poly) gate.classList.add('is-static');

  /* ---------- 3. real asset preloading (weights sum to 1) ---------- */
  var assets = [
    { weight: 0.34, guard: 5200, run: function (done) { warm(PORTFOLIO, done); } },
    { weight: 0.18, guard: 3600, run: function (done) { image('public/images/pragun-profile.png', done); } },
    { weight: 0.30, guard: 3600, run: function (done) {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(done, done);
        } else { done(); }
      }
    },
    { weight: 0.18, guard: 3600, run: function (done) { warm('assets/css/styles.css', done); } }
  ];

  var loadedWeight = 0;
  var real = 0;              // 0..1 real completion

  assets.forEach(function (asset) {
    var settled = false;
    function settle() {
      if (settled) return;
      settled = true;
      loadedWeight += asset.weight;
      real = Math.min(1, loadedWeight);
    }
    try { asset.run(settle); } catch (e) { settle(); }
    // every asset gets a watchdog, so a stalled request can never hold the gate
    setTimeout(settle, asset.guard);
  });

  function warm(url, done) {
    try {
      fetch(url, { credentials: 'same-origin', cache: 'force-cache' })
        .then(function (r) { return r.text(); })
        .then(done, done);
    } catch (e) { done(); }
  }
  function image(src, done) {
    var img = new Image();
    img.onload = done;
    img.onerror = done;
    img.src = src;
  }

  /* ---------- 4. progress engine ---------- */
  // Always build the entrance on a fresh visit. The previous sessionStorage
  // shortcut made the loading scene disappear on repeat visits and in previews.
  var t0 = performance.now();
  var lastT = t0;
  var p = 0;                 // displayed progress 0..1
  var completed = false;
  var ready = false;         // name revealed — entry allowed
  var leaving = false;
  var completeAt = 0;
  var raf = 0;

  function frame(now) {
    var dt = Math.min(250, now - lastT);   // tolerate slow frames on mobile GPUs
    lastT = now;
    var elapsed = now - t0;

    // Two limits, whichever is slower wins:
    //   paced  — a constant, watchable climb that completes at MIN_MS
    //   assets — real preload completion (with a small head start)
    var paced = Math.min(1.05, elapsed / MIN_MS);
    var assetsGoal = 0.22 + 0.775 * real;
    var floor = Math.min(1, elapsed / (MIN_MS * 1.9)) * 0.55;   // never stalls
    var goal = elapsed >= CAP_MS ? 1 : Math.min(paced, Math.max(assetsGoal, floor));

    // ease toward the goal — smooth, monotonic, no jumps
    var k = 1 - Math.exp(-dt / (reduceMotion ? 55 : 120));
    p += (goal - p) * k;
    if (p < 0) p = 0;
    if (p > 1) p = 1;

    if (poly) poly.setProgress(p);
    gate.style.setProperty('--glow', p.toFixed(3));
    if (pctEl) {
      var shown = completed ? 100 : Math.min(99, Math.round(p * 100));
      pctEl.textContent = (shown < 10 ? '0' : '') + shown + '%';
    }

    if (!completed) {
      if ((p >= 0.985 && real >= 0.999) || elapsed >= CAP_MS) {
        completed = true;
        p = 1;
        if (poly) poly.setProgress(1);
        finish();
      }
    }

    if (completed && !ready && now - completeAt >= HOLD_MS) reveal();

    raf = requestAnimationFrame(frame);
  }

  function finish() {
    completeAt = performance.now();
    if (poly) poly.setComplete(reduceMotion ? 0.85 : 1);
    if (labelEl) labelEl.textContent = 'Geometry complete';
    if (pctEl) pctEl.textContent = '100%';
    gate.style.setProperty('--glow', '1');
    gate.classList.add('is-complete');
    // if frames are starved, the name still arrives on schedule
    setTimeout(reveal, HOLD_MS + 420);
  }

  function reveal() {
    if (ready) return;
    ready = true;
    gate.classList.add('is-done');
  }

  raf = requestAnimationFrame(frame);

  /* Safety nets — if frames are throttled (background tab, starved GPU, old
     device) the gate still completes and the name still arrives. */
  setTimeout(function () {
    if (completed) return;
    completed = true;
    p = 1;
    if (poly) poly.setProgress(1);
    finish();
  }, CAP_MS + 260);

  setTimeout(function () {
    if (!completed) return;
    reveal();
  }, CAP_MS + HOLD_MS + 900);

  /* ---------- 5. entrance triggers ---------- */
  function canEnter() { return !leaving; }

  function requestEnter() {
    if (!canEnter()) return;
    if (ready) { startExit(); return; }

    // Impatient visitor: complete instantly, hold one beat, then leave.
    if (!completed) {
      completed = true;
      p = 1;
      if (poly) poly.setProgress(1);
      finish();
    }
    reveal();
    setTimeout(startExit, reduceMotion ? 90 : 240);
  }

  var exitStart = 0;
  function startExit() {
    if (leaving) return;
    leaving = true;
    gate.classList.add('is-leaving');
    exitStart = performance.now();
    animateExit();
    setTimeout(function () { location.href = PORTFOLIO; }, EXIT_MS);
  }

  function animateExit() {
    function tick(now) {
      var v = Math.min(1, (now - exitStart) / EXIT_MS);
      var eased = reduceMotion ? v : v * v * (3 - 2 * v);
      if (poly) poly.setExit(eased);
      if (v < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // wheel — down only. Capture at the document level so the gesture still
  // reaches the gate when the page is hosted inside the live preview iframe.
  var wheelAcc = 0;
  function onWheel(e) {
    if (leaving) return;
    if (e.deltaY < 0) { wheelAcc = 0; return; }   // scrolling up never enters
    wheelAcc += Math.max(1, e.deltaY);
    if (wheelAcc > 18) { wheelAcc = 0; requestEnter(); }
  }
  document.addEventListener('wheel', onWheel, { passive: true, capture: true });

  // touch — swipe up
  var touchY = null, touchX = null;
  window.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { touchY = null; return; }
    touchY = e.touches[0].clientY;
    touchX = e.touches[0].clientX;
  }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (touchY === null || leaving) return;
    var dy = touchY - e.touches[0].clientY;
    var dx = Math.abs(touchX - e.touches[0].clientX);
    if (dy > 46 && dy > dx) { touchY = null; requestEnter(); }
  }, { passive: true });
  window.addEventListener('touchend', function () { touchY = null; }, { passive: true });

  // No click or pointer-movement shortcut: the visible “Scroll down to enter”
  // cue is intentionally activated by a real scroll/swipe (or keyboard).

  // keyboard — Enter / Space / ArrowDown / PageDown
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar' || k === 'ArrowDown' || k === 'PageDown') {
      if (document.activeElement === skipLink) return;   // let the link behave as a link
      e.preventDefault();
      requestEnter();
    }
  });

  /* ---------- 6. pointer parallax + resize ---------- */
  var px = 0, py = 0, targetPx = 0, targetPy = 0;
  window.addEventListener('pointermove', function (e) {
    targetPx = (e.clientX / window.innerWidth) * 2 - 1;
    targetPy = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  (function pointerLoop() {
    px += (targetPx - px) * 0.06;
    py += (targetPy - py) * 0.06;
    if (poly && !reduceMotion) poly.setPointer(px, py);
    requestAnimationFrame(pointerLoop);
  })();

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (poly) poly.resize(); }, 140);
  });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { if (poly) poly.resize(); }, 260);
  });

  /* ---------- 7. back / forward cache ---------- */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    leaving = false;
    gate.classList.remove('is-leaving');
    gate.classList.add('is-done', 'is-complete');
    ready = true;
    completed = true;
    if (poly) { poly.setExit(0); poly.setComplete(1); poly.setProgress(1); }
    if (pctEl) pctEl.textContent = '100%';
    if (labelEl) labelEl.textContent = 'Geometry complete';
  });

  window.addEventListener('pagehide', function () { cancelAnimationFrame(raf); });
})();
