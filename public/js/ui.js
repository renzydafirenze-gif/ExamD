// ============================================================
// ExamD - lapisan gerak kecil & bersama
// - .rise / .pop masuk satu per satu saat section muncul (sekali saja)
// - crossfade foto login (data-crossfade)
// Semua hanya transform/opacity; tanpa JS, konten tetap utuh.
// ============================================================
'use strict';

(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Crossfade foto: siklus antar gambar dalam kontainer [data-crossfade]
  function initCrossfades() {
    var stacks = document.querySelectorAll('[data-crossfade]');
    stacks.forEach(function (stack) {
      var frames = stack.querySelectorAll('img');
      if (frames.length < 2) return;
      var cur = 0;
      function show(i) {
        frames.forEach(function (f, k) { f.classList.toggle('is-on', k === i); });
      }
      show(0);
      if (reduce.matches) { show(0); return; } // diam di foto pertama
      setInterval(function () {
        if (document.hidden) return;
        cur = (cur + 1) % frames.length;
        show(cur);
      }, 5600);
    });
  }

  // Masuk per bagian: heading dulu, teks, lalu media (jeda 60-90ms)
  function initRises() {
    var items = document.querySelectorAll('.rise, .pop');
    if (!('IntersectionObserver' in window) || reduce.matches) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }

  // Stempel satu kali
  function init() {
    initCrossfades();
    initRises();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
