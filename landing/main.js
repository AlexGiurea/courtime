/* ═══════════════════════════════════════════════════════════
   Courtime — landing page behaviour
   No dependencies, no network. Everything is IntersectionObserver
   driven; nothing listens to scroll.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = typeof window.IntersectionObserver === 'function';

  /* ── 1. sticky nav hairline ──────────────────────────────── */
  (function nav() {
    var bar = document.getElementById('nav');
    var sentinel = document.getElementById('top-sentinel');
    if (!bar || !sentinel || !hasIO) return;
    new IntersectionObserver(function (entries) {
      bar.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }).observe(sentinel);
  })();

  /* ── 2. scroll reveals ───────────────────────────────────── */
  (function reveals() {
    var items = document.querySelectorAll('[data-reveal]');
    if (!hasIO || reduce) {
      for (var i = 0; i < items.length; i++) items[i].classList.add('is-in');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    for (var j = 0; j < items.length; j++) io.observe(items[j]);
  })();

  /* ── 3. the hero: paper → verified grid → every phone ────── */
  (function hero() {
    var stage = document.getElementById('hero-stage');
    if (!stage) return;

    /* measure each handwriting stroke so it can draw itself in */
    var strokes = stage.querySelectorAll('[data-draw]');
    for (var i = 0; i < strokes.length; i++) {
      var len = 120;
      try { len = Math.ceil(strokes[i].getTotalLength()) + 2; } catch (err) { /* keep fallback */ }
      strokes[i].style.setProperty('--len', len);
    }

    if (reduce || !hasIO) { stage.setAttribute('data-phase', 'done'); return; }

    /* phase, time from the start of the run */
    var SCRIPT = [
      ['write', 60],
      ['scan', 1780],
      ['snap', 3060],
      ['phone', 4140],
      ['done', 5240]
    ];
    var timers = [];
    var playing = false;
    var seen = false;

    function clear() {
      for (var t = 0; t < timers.length; t++) clearTimeout(timers[t]);
      timers = [];
    }

    function play() {
      clear();
      playing = true;
      stage.setAttribute('data-phase', 'idle');
      void stage.offsetWidth; /* flush, so replays restart cleanly */
      SCRIPT.forEach(function (step) {
        timers.push(setTimeout(function () {
          stage.setAttribute('data-phase', step[0]);
          if (step[0] === 'done') playing = false;
        }, step[1]));
      });
    }

    new IntersectionObserver(function (entries) {
      var e = entries[0];
      if (e.intersectionRatio === 0) { seen = false; return; }
      if (e.intersectionRatio >= 0.3 && !seen && !playing) { seen = true; play(); }
    }, { threshold: [0, 0.3] }).observe(stage);

    var replay = stage.querySelector('[data-replay]');
    if (replay) replay.addEventListener('click', play);
  })();

  /* ── 4. the live micro-demo: desk moves a court, phone knows ── */
  (function liveDemo() {
    var root = document.getElementById('views-demo');
    var chip = document.getElementById('move-chip');
    var row = document.getElementById('pro-row');
    var toast = document.getElementById('pro-toast');
    if (!root || !chip || !row || !toast || reduce || !hasIO) return;

    var court = row.querySelector('[data-court]');
    var from = root.querySelector('.deskcol[data-col="3"]');
    var to = root.querySelector('.deskcol[data-col="2"]');
    if (!court || !from || !to) return;

    function measure() {
      var dx = to.getBoundingClientRect().left - from.getBoundingClientRect().left;
      chip.style.setProperty('--dx', dx.toFixed(2) + 'px');
    }
    measure();

    if (typeof window.ResizeObserver === 'function') {
      new ResizeObserver(measure).observe(root);
    } else {
      window.addEventListener('resize', measure);
    }

    var timers = [];
    var running = false;

    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

    function cycle() {
      if (!running) return;
      measure();
      chip.classList.add('is-moved');

      at(420, function () {
        court.textContent = 'Court 2';
        row.classList.remove('is-changed');
        void row.offsetWidth;
        row.classList.add('is-changed');
        toast.classList.add('is-on');
      });
      at(3600, function () { toast.classList.remove('is-on'); });
      at(5200, function () {
        chip.classList.remove('is-moved');
        court.textContent = 'Court 3';
        row.classList.remove('is-changed');
      });
      at(8600, cycle);
    }

    new IntersectionObserver(function (entries) {
      var live = entries[0].isIntersecting;
      if (live === running) return;
      running = live;
      if (running) {
        at(700, cycle);
      } else {
        for (var t = 0; t < timers.length; t++) clearTimeout(timers[t]);
        timers = [];
        chip.classList.remove('is-moved');
        row.classList.remove('is-changed');
        toast.classList.remove('is-on');
        court.textContent = 'Court 3';
      }
    }, { threshold: 0.35 }).observe(root);
  })();
})();

/* ---------- theme ----------
   Shares the same localStorage key as the app, so a club that has set the app
   to dark finds the marketing site already dark on the same browser. */
(function () {
  var button = document.getElementById("theme-btn");
  if (!button) return;

  function current() {
    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";
  }

  button.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("courtime-theme", next);
    } catch (e) {
      /* storage disabled — the choice still holds for this visit */
    }
  });
})();
