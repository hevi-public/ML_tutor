/* ML Tutor — mini ML library: vector/matrix helpers.
   Everything on this site trains in the browser, in plain JavaScript you can
   read. This file is the arithmetic; models.js builds the learners on top.
   Global namespace: ML (on window in pages, on self in Web Workers) */
(function (root) {
  "use strict";

  const ML = (root.ML = root.ML || {});

  ML.vec = {
    dot(a, b) {
      let s = 0;
      for (let i = 0; i < a.length; i++) s += a[i] * b[i];
      return s;
    },
    add(a, b) { return a.map((v, i) => v + b[i]); },
    sub(a, b) { return a.map((v, i) => v - b[i]); },
    scale(a, s) { return a.map((v) => v * s); },
    dist2(a, b) {
      let s = 0;
      for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
      return s;
    },
    dist(a, b) { return Math.sqrt(ML.vec.dist2(a, b)); },
    mean(vectors) {
      const out = new Array(vectors[0].length).fill(0);
      for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i];
      return out.map((s) => s / vectors.length);
    },
  };

  // Deterministic pseudo-randomness for repeatable datasets (same dots on
  // every visit — screenshots and prose can refer to specific points).
  ML.rand = {
    uniform(i) {
      const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return v - Math.floor(v);
    },
    // Roughly normal via sum of uniforms (central limit theorem in action)
    normal(i) {
      let s = 0;
      for (let k = 0; k < 6; k++) s += ML.rand.uniform(i * 6 + k);
      return (s - 3) / 1.2;
    },
    // Mutable LCG for "reshuffle"-style buttons
    lcg(seed) {
      let s = (seed * 2654435761) % 4294967296;
      return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
    },
  };

  // Gaussian blob generator: n points around [cx, cy] with spread sd
  ML.makeBlob = function (n, cx, cy, sd, label, seedOffset = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({
        x: [cx + ML.rand.normal(seedOffset + i) * sd,
            cy + ML.rand.normal(seedOffset + i + 5000) * sd],
        y: label,
      });
    }
    return pts;
  };
})(typeof window !== "undefined" ? window : self);
