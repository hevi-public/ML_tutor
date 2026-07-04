/* ML Tutor — build-a-function: three ReLU neurons, each contributing a bent
   ramp; their sum (thick line) shows how simple pieces compose into curves.
   Presets show ramp → bump → wiggle. Container: #builder-demo. */
(function () {
  "use strict";

  const ML = window.ML;
  const X_MIN = -6, X_MAX = 6, Y_MIN = -3, Y_MAX = 3;
  const UNIT_COLORS = ["--bad", "--good", "#b08015"];

  // Each unit: slope w (into the neuron), kink position k (so bias = −w·k),
  // and height v (the neuron's outgoing weight).
  let units = [
    { w: 1, k: -2, v: 1 },
    { w: -1, k: 2, v: 1 },
    { w: 1, k: 0, v: 0 },
  ];

  const PRESETS = {
    ramp: [{ w: 1, k: 0, v: 1 }, { w: 0, k: 0, v: 0 }, { w: 0, k: 0, v: 0 }],
    bump: [{ w: 1.5, k: -2, v: 1 }, { w: 1.5, k: 0, v: -2 }, { w: 1.5, k: 2, v: 1 }],
    wiggle: [{ w: 1.2, k: -3, v: 1.6 }, { w: 1.8, k: 0, v: -2.6 }, { w: 1.4, k: 2.5, v: 2.2 }],
  };

  let view, root;

  const relu = (z) => Math.max(0, z);
  const unitOut = (u, x) => u.v * relu(u.w * (x - u.k));
  const total = (x) => units.reduce((s, u) => s + unitOut(u, x), 0);

  function drawCurve(fn, color, width) {
    view.ctx.strokeStyle = color;
    view.ctx.lineWidth = width;
    view.ctx.beginPath();
    let started = false;
    for (let px = 0; px <= view.width(); px += 2) {
      const x = X_MIN + (px / view.width()) * (X_MAX - X_MIN);
      const y = Math.max(Y_MIN - 1, Math.min(Y_MAX + 1, fn(x)));
      const p = view.toPx(x, y);
      started ? view.ctx.lineTo(p.x, p.y) : view.ctx.moveTo(p.x, p.y);
      started = true;
    }
    view.ctx.stroke();
  }

  function draw() {
    view.clear();
    view.grid(2);
    view.ctx.strokeStyle = ML.cssVar("--text-soft");
    view.ctx.beginPath();
    const o = view.toPx(0, 0);
    view.ctx.moveTo(0, o.y); view.ctx.lineTo(view.width(), o.y);
    view.ctx.stroke();

    units.forEach((u, i) => {
      if (u.v !== 0 && u.w !== 0) {
        const c = UNIT_COLORS[i];
        drawCurve((x) => unitOut(u, x), c.startsWith("--") ? ML.rgba(c, 0.55) : c, 1.5);
      }
    });
    drawCurve(total, ML.cssVar("--accent"), 3);
  }

  function syncSliders() {
    units.forEach((u, i) => {
      for (const key of ["w", "k", "v"]) {
        const s = root.querySelector(`[data-unit="${i}"][data-param="${key}"]`);
        const out = root.querySelector(`[data-unit="${i}"][data-out="${key}"]`);
        s.value = u[key];
        out.value = (+u[key]).toFixed(1);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("builder-demo");
    if (!root) return;
    view = ML.view(root.querySelector("canvas"),
      { xMin: X_MIN, xMax: X_MAX, yMin: Y_MIN, yMax: Y_MAX, aspect: 0.5 });
    view.onDraw = draw;

    root.querySelectorAll("input[type=range]").forEach((s) => {
      s.addEventListener("input", () => {
        units[+s.dataset.unit][s.dataset.param] = +s.value;
        root.querySelector(`[data-unit="${s.dataset.unit}"][data-out="${s.dataset.param}"]`)
          .value = (+s.value).toFixed(1);
        draw();
      });
    });

    root.querySelectorAll("[data-preset]").forEach((btn) =>
      btn.addEventListener("click", () => {
        units = PRESETS[btn.dataset.preset].map((u) => ({ ...u }));
        syncSliders();
        draw();
      }));

    syncSliders();
    view.resize();
  });
})();
