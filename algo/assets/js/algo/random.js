/* Algorithms Tutor — seeded pseudo-random numbers, so demos and prose agree.

   Every demo that quotes an outcome in prose uses a fixed seed; every demo
   with a "shuffle" button re-seeds from the clock. mulberry32: tiny, fast,
   plenty good for teaching-sized inputs (this is a classroom, not a casino —
   the crypto page in unit 11 says why that distinction matters). */
(function () {
  "use strict";

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  window.AlgoRandom = {
    rng(seed) {
      return mulberry32(seed === undefined ? Date.now() : seed);
    },

    // n distinct-ish values in [lo, hi), nice for bar charts
    ints(n, lo, hi, seed) {
      const rand = this.rng(seed);
      return Array.from({ length: n }, () => lo + Math.floor(rand() * (hi - lo)));
    },

    // Fisher–Yates, taught by name on the randomized-algorithms page
    shuffle(array, seed) {
      const rand = this.rng(seed);
      const a = array.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
})();
