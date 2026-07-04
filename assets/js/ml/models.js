/* ML Tutor — mini ML library: the models. Requires matrix.js (window.ML).
   Each model is small enough to read over coffee — that's the point.
   Points are {x: [x1, x2, …], y: label}. */
(function () {
  "use strict";

  const ML = window.ML;
  const { dot, dist2, mean } = ML.vec;

  /* ---------- Logistic regression: a line that speaks in probabilities ---------- */

  ML.LogReg = class {
    constructor(nFeatures = 2) {
      this.w = new Array(nFeatures).fill(0);
      this.b = 0;
    }

    static sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

    // Probability that this input belongs to class 1
    predictProba(x) { return ML.LogReg.sigmoid(dot(this.w, x) + this.b); }
    predict(x) { return this.predictProba(x) >= 0.5 ? 1 : 0; }

    // One gradient descent step on the log loss; returns the current loss
    trainStep(points, lr = 0.5) {
      const n = points.length;
      const gw = new Array(this.w.length).fill(0);
      let gb = 0, loss = 0;
      for (const p of points) {
        const prob = this.predictProba(p.x);
        const err = prob - p.y; // a tidy fact: d(loss)/d(z) = prob − y
        for (let i = 0; i < gw.length; i++) gw[i] += err * p.x[i];
        gb += err;
        const clamped = Math.min(Math.max(prob, 1e-9), 1 - 1e-9);
        loss += p.y ? -Math.log(clamped) : -Math.log(1 - clamped);
      }
      for (let i = 0; i < this.w.length; i++) this.w[i] -= (lr * gw[i]) / n;
      this.b -= (lr * gb) / n;
      return loss / n;
    }

    accuracy(points) {
      let ok = 0;
      for (const p of points) if (this.predict(p.x) === p.y) ok++;
      return ok / points.length;
    }
  };

  /* ---------- k-nearest neighbors: no training, just memory ---------- */

  // Returns {label, neighbors: [{p, d}], votes: {label: count}}
  ML.knnPredict = function (points, k, query) {
    const ranked = points
      .map((p) => ({ p, d: dist2(p.x, query) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k);
    const votes = {};
    for (const { p } of ranked) votes[p.y] = (votes[p.y] || 0) + 1;
    let label = null, best = -1;
    for (const [l, c] of Object.entries(votes)) {
      if (c > best) { best = c; label = +l; }
    }
    return { label, neighbors: ranked, votes };
  };

  /* ---------- Decision tree: a flowchart of yes/no questions ---------- */

  function gini(points) {
    if (!points.length) return 0;
    const counts = {};
    for (const p of points) counts[p.y] = (counts[p.y] || 0) + 1;
    let g = 1;
    for (const c of Object.values(counts)) g -= (c / points.length) ** 2;
    return g;
  }

  function majority(points) {
    const counts = {};
    for (const p of points) counts[p.y] = (counts[p.y] || 0) + 1;
    let label = null, best = -1;
    for (const [l, c] of Object.entries(counts)) {
      if (c > best) { best = c; label = +l; }
    }
    return { label, purity: best / points.length, count: points.length };
  }

  ML.DecisionTree = class {
    constructor({ maxDepth = 4, minSamples = 4 } = {}) {
      this.maxDepth = maxDepth;
      this.minSamples = minSamples;
      this.root = null;
      this.leafCount = 0;
    }

    fit(points) {
      this.leafCount = 0;
      this.root = this._build(points, 0);
      return this;
    }

    _build(points, depth) {
      const maj = majority(points);
      if (depth >= this.maxDepth || points.length < this.minSamples || maj.purity === 1) {
        this.leafCount++;
        return { leaf: true, ...maj };
      }

      // Try every midpoint between sorted values on every feature;
      // keep the question that leaves the two groups purest.
      let best = null;
      const nF = points[0].x.length;
      for (let f = 0; f < nF; f++) {
        const values = [...new Set(points.map((p) => p.x[f]))].sort((a, b) => a - b);
        for (let i = 1; i < values.length; i++) {
          const thresh = (values[i - 1] + values[i]) / 2;
          const left = points.filter((p) => p.x[f] <= thresh);
          const right = points.filter((p) => p.x[f] > thresh);
          if (!left.length || !right.length) continue;
          const score =
            (left.length * gini(left) + right.length * gini(right)) / points.length;
          if (!best || score < best.score) best = { f, thresh, left, right, score };
        }
      }
      if (!best || best.score >= gini(points) - 1e-9) {
        this.leafCount++;
        return { leaf: true, ...maj };
      }
      return {
        leaf: false,
        feature: best.f,
        thresh: best.thresh,
        count: points.length,
        left: this._build(best.left, depth + 1),
        right: this._build(best.right, depth + 1),
      };
    }

    predict(x) {
      let node = this.root;
      while (!node.leaf) node = x[node.feature] <= node.thresh ? node.left : node.right;
      return node.label;
    }
  };

  /* ---------- Random forest: many shaky trees, one steady vote ---------- */

  ML.RandomForest = class {
    constructor({ nTrees = 20, maxDepth = 6, seed = 1 } = {}) {
      this.nTrees = nTrees;
      this.maxDepth = maxDepth;
      this.seed = seed;
      this.trees = [];
    }

    fit(points) {
      this.trees = [];
      const rnd = ML.rand.lcg(this.seed);
      for (let t = 0; t < this.nTrees; t++) {
        // Bootstrap: sample n points WITH replacement — each tree sees a
        // slightly different world, so each memorizes different noise.
        const sample = [];
        for (let i = 0; i < points.length; i++) {
          sample.push(points[Math.floor(rnd() * points.length)]);
        }
        this.trees.push(new ML.DecisionTree({ maxDepth: this.maxDepth }).fit(sample));
      }
      return this;
    }

    // Share of trees voting class 1 — averaging is what smooths the noise
    predictProba(x) {
      let votes = 0;
      for (const tree of this.trees) votes += tree.predict(x);
      return votes / this.trees.length;
    }
    predict(x) { return this.predictProba(x) >= 0.5 ? 1 : 0; }
  };

  /* ---------- k-means: clustering without an answer key ---------- */

  ML.KMeans = class {
    constructor(k, points, seed = 1) {
      this.k = k;
      this.points = points;
      this.labels = new Array(points.length).fill(0);
      const rnd = ML.rand.lcg(seed);
      // Start centers on k distinct random points
      const used = new Set();
      this.centers = [];
      while (this.centers.length < k) {
        const i = Math.floor(rnd() * points.length);
        if (!used.has(i)) { used.add(i); this.centers.push([...points[i].x]); }
      }
    }

    // Step 1: every point joins its nearest center. Returns how many switched.
    assign() {
      let changed = 0;
      this.points.forEach((p, i) => {
        let best = 0, bestD = Infinity;
        this.centers.forEach((c, ci) => {
          const d = dist2(p.x, c);
          if (d < bestD) { bestD = d; best = ci; }
        });
        if (this.labels[i] !== best) changed++;
        this.labels[i] = best;
      });
      return changed;
    }

    // Step 2: every center moves to the average of its members
    update() {
      for (let ci = 0; ci < this.k; ci++) {
        const members = this.points.filter((_, i) => this.labels[i] === ci);
        if (members.length) this.centers[ci] = mean(members.map((p) => p.x));
      }
    }

    // Total squared distance from points to their centers — k-means' "loss"
    inertia() {
      let s = 0;
      this.points.forEach((p, i) => { s += dist2(p.x, this.centers[this.labels[i]]); });
      return s;
    }
  };
})();
