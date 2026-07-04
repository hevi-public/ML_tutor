/* ML Tutor — backpropagation, one visible step at a time. A single neuron on
   a single example: z = w·x + b, p = σ(z), L = (p − y)². Forward pass reveals
   values left to right; backward pass reveals nudge-effects right to left,
   each narrated as one application of the chain rule. The numbers come from
   the site's real autodiff engine (autodiff.js). Container: #backprop-demo. */
(function () {
  "use strict";

  const ML = window.ML;
  const X_VAL = 2.0, Y_VAL = 1; // the training example: input 2, truth "yes"
  const LR = 0.8;               // gentle enough that improvement takes a few
                                // visible cycles (0.417 → 0.129 → 0.050 → …)

  let wVal = -0.5, bVal = 0.4;
  let stepIdx = 0;
  let nodes, narration; // rebuilt every render
  let root, canvas, view, sayEl, prevBtn, nextBtn, applyBtn, lossTrail = [];

  function build() {
    const w = new ML.Value(wVal, [], "", "w");
    const x = new ML.Value(X_VAL, [], "", "x");
    const b = new ML.Value(bVal, [], "", "b");
    const m = w.mul(x);
    const z = m.add(b);
    const p = z.sigmoid();
    const L = p.sub(Y_VAL).pow(2);
    L.backward();

    const f = (v) => v.toFixed(3);
    // Layout in fractions of the canvas: inputs left, loss right
    nodes = [
      { v: w, label: "w  (a knob)", fx: 0.08, fy: 0.18, showVal: 0, showGrad: 8 },
      { v: x, label: "x  (input)", fx: 0.08, fy: 0.5, showVal: 0, showGrad: 99 },
      { v: b, label: "b  (a knob)", fx: 0.08, fy: 0.82, showVal: 0, showGrad: 8 },
      { v: m, label: "m = w·x", fx: 0.32, fy: 0.34, showVal: 1, showGrad: 7 },
      { v: z, label: "z = m + b", fx: 0.52, fy: 0.5, showVal: 2, showGrad: 7 },
      { v: p, label: "p = σ(z)", fx: 0.72, fy: 0.5, showVal: 3, showGrad: 6 },
      { v: L, label: "L = (p − y)²", fx: 0.92, fy: 0.5, showVal: 4, showGrad: 5 },
    ];
    const edges = [[0, 3], [1, 3], [3, 4], [2, 4], [4, 5], [5, 6]];

    narration = [
      `The setup. Knobs: w = ${f(wVal)}, b = ${f(bVal)}. Example: input x = ${X_VAL}, truth y = ${Y_VAL} ("yes"). Step forward →`,
      `FORWARD ① multiply: m = w·x = ${f(wVal)} × ${X_VAL} = ${f(m.data)}`,
      `FORWARD ② add the offset: z = m + b = ${f(m.data)} + ${f(bVal)} = ${f(z.data)}`,
      `FORWARD ③ squash: p = σ(z) = ${f(p.data)} — the model says "${Math.round(p.data * 100)}% yes". Truth is yes, so… not great.`,
      `FORWARD ④ grade it: L = (p − y)² = (${f(p.data)} − 1)² = ${f(L.data)}. Forward pass done. Now: which knob is to blame, and by how much?`,
      `BACKWARD ① seed at the end: dL/dL = 1. (The loss's effect on itself.)`,
      `BACKWARD ② one step back: dL/dp = 2(p − y) = ${f(p.grad)}. Negative = raising p would LOWER the loss. Makes sense: truth is 1, p is below it.`,
      `BACKWARD ③ through the squasher, chain rule: dL/dz = dL/dp × σ′(z) = ${f(p.grad)} × ${f(p.data * (1 - p.data))} = ${f(z.grad)}. (Same number flows to m — adding doesn't change blame.)`,
      `BACKWARD ④ arrive at the knobs: dL/dw = dL/dz × x = ${f(z.grad)} × ${X_VAL} = ${f(w.grad)}, and dL/db = dL/dz × 1 = ${f(b.grad)}. Every knob now knows its nudge. That IS backpropagation.`,
    ];
    nodes.edges = edges;
  }

  function draw() {
    view.clear();
    const W = view.width(), H = view.height();
    const ctx = view.ctx;
    const boxW = Math.min(110, W * 0.16), boxH = 46;

    ctx.strokeStyle = ML.cssVar("--border");
    ctx.lineWidth = 1.5;
    for (const [a, bIdx] of nodes.edges) {
      const A = nodes[a], B = nodes[bIdx];
      ctx.beginPath();
      ctx.moveTo(A.fx * W + boxW / 2, A.fy * H);
      ctx.lineTo(B.fx * W - boxW / 2, B.fy * H);
      ctx.stroke();
    }

    for (const n of nodes) {
      const cx = n.fx * W, cy = n.fy * H;
      const active =
        (stepIdx >= 1 && stepIdx <= 4 && n.showVal === stepIdx) ||
        (stepIdx >= 5 && n.showGrad === stepIdx);
      ctx.fillStyle = ML.cssVar("--bg");
      ctx.strokeStyle = active ? ML.cssVar("--accent") : ML.cssVar("--border");
      ctx.lineWidth = active ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = ML.cssVar("--text-soft");
      ctx.font = "11px sans-serif";
      ctx.fillText(n.label, cx, cy - boxH / 2 + 13);

      if (stepIdx >= n.showVal) {
        ctx.fillStyle = ML.cssVar("--text");
        ctx.font = "600 13px ui-monospace, monospace";
        ctx.fillText(n.v.data.toFixed(3), cx, cy + 3);
      }
      if (stepIdx >= n.showGrad) {
        ctx.fillStyle = ML.cssVar("--bad");
        ctx.font = "12px ui-monospace, monospace";
        ctx.fillText("∂: " + n.v.grad.toFixed(3), cx, cy + boxH / 2 - 6);
      }
    }

    sayEl.textContent = narration[stepIdx];
    prevBtn.disabled = stepIdx === 0;
    nextBtn.disabled = stepIdx === narration.length - 1;
    applyBtn.disabled = stepIdx !== narration.length - 1;

    const trail = lossTrail.map((l) => l.toFixed(3)).join(" → ");
    root.querySelector('[data-out="trail"]').textContent =
      trail ? `loss so far: ${trail}` : "";
  }

  function apply() {
    const L = nodes[6].v, w = nodes[0].v, b = nodes[2].v;
    lossTrail.push(L.data);
    wVal -= LR * w.grad;
    bVal -= LR * b.grad;
    stepIdx = 0;
    build();
    draw();
    sayEl.textContent =
      `Nudged: w → ${wVal.toFixed(3)}, b → ${bVal.toFixed(3)} (each moved against its gradient). ` +
      `Run the passes again and watch the loss shrink.`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("backprop-demo");
    if (!root) return;
    canvas = root.querySelector("canvas");
    view = ML.view(canvas, { xMin: 0, xMax: 1, yMin: 0, yMax: 1, aspect: 0.42 });
    view.onDraw = draw;
    sayEl = root.querySelector('[data-out="say"]');
    prevBtn = root.querySelector('[data-nav="prev"]');
    nextBtn = root.querySelector('[data-nav="next"]');
    applyBtn = root.querySelector('[data-action="apply"]');

    prevBtn.addEventListener("click", () => { if (stepIdx > 0) { stepIdx--; draw(); } });
    nextBtn.addEventListener("click", () => { if (stepIdx < narration.length - 1) { stepIdx++; draw(); } });
    applyBtn.addEventListener("click", apply);
    root.querySelector('[data-action="reset"]').addEventListener("click", () => {
      wVal = -0.5; bVal = 0.4; stepIdx = 0; lossTrail = [];
      build(); draw();
    });

    build();
    view.resize();
  });
})();
