/* ML Tutor — mini ML library: 2-D toy datasets for the playground.
   All deterministic (same dots every visit). Domain: x,y in [-6, 6].
   Each returns [{x: [x1, x2], y: 0|1}, …]. Requires matrix.js. */
(function (root) {
  "use strict";

  const ML = root.ML;
  const u = ML.rand.uniform;

  ML.datasets = {
    blobs(n = 120) {
      return [
        ...ML.makeBlob(n / 2, -2.4, -1.8, 1.1, 0, 41),
        ...ML.makeBlob(n / 2, 2.4, 1.8, 1.1, 1, 4141),
      ];
    },

    // A ring of one class around a core of the other — no straight line helps
    circle(n = 120) {
      const pts = [];
      for (let i = 0; i < n / 2; i++) {
        const r = Math.sqrt(u(i)) * 2.0;
        const a = u(i + 7000) * Math.PI * 2;
        pts.push({ x: [r * Math.cos(a), r * Math.sin(a)], y: 1 });
      }
      for (let i = 0; i < n / 2; i++) {
        const r = 3.4 + u(i + 8000) * 1.6;
        const a = u(i + 9000) * Math.PI * 2;
        pts.push({ x: [r * Math.cos(a), r * Math.sin(a)], y: 0 });
      }
      return pts;
    },

    moons(n = 120) {
      const pts = [];
      for (let i = 0; i < n / 2; i++) {
        const a = u(i) * Math.PI;
        pts.push({ x: [Math.cos(a) * 3 - 1.5 + ML.rand.normal(i + 100) * 0.35,
                       Math.sin(a) * 3 - 0.8 + ML.rand.normal(i + 200) * 0.35], y: 0 });
      }
      for (let i = 0; i < n / 2; i++) {
        const a = u(i + 300) * Math.PI;
        pts.push({ x: [1.5 - Math.cos(a) * 3 + ML.rand.normal(i + 400) * 0.35,
                       0.8 - Math.sin(a) * 3 + ML.rand.normal(i + 500) * 0.35], y: 1 });
      }
      return pts;
    },

    // The classic two interleaved arms — the playground's boss level
    spiral(n = 120) {
      const pts = [];
      for (let label = 0; label < 2; label++) {
        for (let i = 0; i < n / 2; i++) {
          const t = (i / (n / 2)) * 3.2 + 0.4;         // radius grows with angle
          const a = t * 2.2 + label * Math.PI;
          pts.push({
            x: [t * 1.5 * Math.cos(a) + ML.rand.normal(i + label * 999) * 0.18,
                t * 1.5 * Math.sin(a) + ML.rand.normal(i + label * 999 + 50) * 0.18],
            y: label,
          });
        }
      }
      return pts;
    },
  };
})(typeof window !== "undefined" ? window : self);
