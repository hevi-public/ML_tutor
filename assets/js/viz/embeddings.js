/* ML Tutor — embedding explorer: ~26 words with small hand-crafted meaning-
   vectors, projected to 2-D by PCA (computed live). Hover a word to see its
   nearest neighbors by full-vector similarity; try vector arithmetic with the
   analogy widget. Container: #embed-demo. */
(function () {
  "use strict";

  const ML = window.ML;

  // Hand-crafted 6-dim meaning vectors:
  // [gender (m −1 / f +1), royalty, young, animal, food, vehicle]
  const WORDS = {
    man:      [-1, 0, 0, 0, 0, 0],
    woman:    [ 1, 0, 0, 0, 0, 0],
    boy:      [-1, 0, 1, 0, 0, 0],
    girl:     [ 1, 0, 1, 0, 0, 0],
    king:     [-1, 1, 0, 0, 0, 0],
    queen:    [ 1, 1, 0, 0, 0, 0],
    prince:   [-1, 1, 1, 0, 0, 0],
    princess: [ 1, 1, 1, 0, 0, 0],
    dog:      [ 0, 0, 0, 1, 0, 0],
    puppy:    [ 0, 0, 1, 1, 0, 0],
    cat:      [ 0.1, 0, 0, 1, 0, 0],
    kitten:   [ 0.1, 0, 1, 1, 0, 0],
    horse:    [ 0, 0, 0, 1.1, 0, 0.2],
    lion:     [ 0, 0.6, 0, 1.1, 0, 0],   // "king of beasts" — royalty rubs off
    apple:    [ 0, 0, 0, 0, 1, 0],
    banana:   [ 0, 0, 0, 0, 1.05, 0],
    bread:    [ 0, 0, 0, 0, 0.9, 0],
    cake:     [ 0, 0, 0.3, 0, 1, 0],     // parties skew young
    milk:     [ 0, 0, 0.4, 0.2, 0.8, 0],
    car:      [ 0, 0, 0, 0, 0, 1],
    truck:    [ 0, 0, 0, 0, 0, 1.1],
    bicycle:  [ 0, 0, 0.3, 0, 0, 0.9],
    train:    [ 0, 0, 0, 0, 0, 1.05],
    bus:      [ 0, 0, 0.1, 0, 0, 1],
    throne:   [ 0, 1.1, 0, 0, 0, 0],
    crown:    [ 0, 1.05, 0, 0, 0, 0],
  };

  const names = Object.keys(WORDS);
  const dim = 6;

  /* ---------- tiny PCA: top-2 directions by power iteration ---------- */

  function pca2() {
    const n = names.length;
    const mean = new Array(dim).fill(0);
    for (const w of names) for (let d = 0; d < dim; d++) mean[d] += WORDS[w][d] / n;
    const X = names.map((w) => WORDS[w].map((v, d) => v - mean[d]));

    const C = Array.from({ length: dim }, () => new Array(dim).fill(0));
    for (const row of X)
      for (let i = 0; i < dim; i++)
        for (let j = 0; j < dim; j++) C[i][j] += (row[i] * row[j]) / n;

    function topEigen(M) {
      let v = Array.from({ length: dim }, (_, i) => 0.3 + 0.1 * i);
      for (let it = 0; it < 200; it++) {
        const nv = M.map((row) => row.reduce((s, m, j) => s + m * v[j], 0));
        const len = Math.hypot(...nv);
        v = nv.map((x) => x / len);
      }
      const lambda = v.reduce((s, vi, i) =>
        s + vi * M[i].reduce((t, m, j) => t + m * v[j], 0), 0);
      return { v, lambda };
    }

    const e1 = topEigen(C);
    // deflate and repeat for the second direction
    const C2 = C.map((row, i) => row.map((m, j) => m - e1.lambda * e1.v[i] * e1.v[j]));
    const e2 = topEigen(C2);

    const proj = {};
    names.forEach((w, i) => {
      proj[w] = [
        X[i].reduce((s, x, d) => s + x * e1.v[d], 0),
        X[i].reduce((s, x, d) => s + x * e2.v[d], 0),
      ];
    });
    return proj;
  }

  /* ---------- similarity ---------- */

  function cosine(a, b) {
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    if (!la || !lb) return 0;
    return ML.vec.dot(a, b) / (la * lb);
  }

  function nearest(vec, exclude, k = 4) {
    return names
      .filter((w) => !exclude.includes(w))
      .map((w) => ({ w, sim: cosine(vec, WORDS[w]) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, k);
  }

  /* ---------- drawing ---------- */

  let root, view, proj, hovered = null;
  let X_MIN, X_MAX, Y_MIN, Y_MAX;

  function draw() {
    view.clear();
    const hl = hovered ? nearest(WORDS[hovered], [hovered]).map((n) => n.w) : [];

    for (const w of names) {
      const [x, y] = proj[w];
      const isH = w === hovered, isN = hl.includes(w);
      view.dot(x, y, isH ? 7 : 4.5,
        isH ? ML.cssVar("--accent") : isN ? ML.cssVar("--good") : ML.cssVar("--text-soft"));
      view.ctx.fillStyle = isH ? ML.cssVar("--accent")
        : isN ? ML.cssVar("--good") : ML.cssVar("--text");
      view.ctx.font = (isH || isN ? "600 " : "") + "13px sans-serif";
      const p = view.toPx(x, y);
      view.ctx.fillText(w, p.x + 8, p.y + 4);
    }

    const nn = root.querySelector('[data-out="nn"]');
    nn.innerHTML = hovered
      ? `closest to <strong>${hovered}</strong>: ` +
        nearest(WORDS[hovered], [hovered])
          .map((n) => `${n.w} (${n.sim.toFixed(2)})`).join(" · ")
      : "hover a word to see its nearest neighbors (by full-vector similarity)";
  }

  function runAnalogy() {
    const g = (id) => root.querySelector(`[data-an="${id}"]`).value;
    const A = WORDS[g("a")], B = WORDS[g("b")], C = WORDS[g("c")];
    const target = A.map((v, i) => v - B[i] + C[i]);
    const best = nearest(target, [g("a"), g("b"), g("c")], 1)[0];
    root.querySelector('[data-out="analogy"]').innerHTML =
      `<strong>${g("a")}</strong> − <strong>${g("b")}</strong> + <strong>${g("c")}</strong> ` +
      `≈ <strong style="color: var(--accent)">${best.w}</strong> (similarity ${best.sim.toFixed(2)})`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("embed-demo");
    if (!root) return;

    proj = pca2();
    const xs = names.map((w) => proj[w][0]), ys = names.map((w) => proj[w][1]);
    const padX = (Math.max(...xs) - Math.min(...xs)) * 0.18;
    const padY = (Math.max(...ys) - Math.min(...ys)) * 0.18;
    X_MIN = Math.min(...xs) - padX; X_MAX = Math.max(...xs) + padX * 2.2; // room for labels
    Y_MIN = Math.min(...ys) - padY; Y_MAX = Math.max(...ys) + padY;

    view = ML.view(root.querySelector("canvas"),
      { xMin: X_MIN, xMax: X_MAX, yMin: Y_MIN, yMax: Y_MAX, aspect: 0.7 });
    view.onDraw = draw;

    root.querySelector("canvas").addEventListener("mousemove", (e) => {
      const d = view.pointerData(e);
      let best = null, bestDist = Infinity;
      for (const w of names) {
        const dx = proj[w][0] - d.x, dy = proj[w][1] - d.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; best = w; }
      }
      const range = (X_MAX - X_MIN) * 0.05;
      hovered = bestDist < range * range ? best : null;
      draw();
    });
    root.querySelector("canvas").addEventListener("mouseleave", () => {
      hovered = null; draw();
    });

    // analogy selects
    for (const [id, def] of [["a", "king"], ["b", "man"], ["c", "woman"]]) {
      const sel = root.querySelector(`[data-an="${id}"]`);
      for (const w of names) {
        const opt = document.createElement("option");
        opt.value = opt.textContent = w;
        if (w === def) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", runAnalogy);
    }
    runAnalogy();
    view.resize();
  });
})();
