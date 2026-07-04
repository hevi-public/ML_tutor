/* ML Tutor — one neuron, one input: output = activation(w·input + b).
   Sliders for w and b, buttons to swap the activation, live curve.
   Container: #neuron-demo. */
(function () {
  "use strict";

  const ML = window.ML;
  const X_MIN = -6, X_MAX = 6, Y_MIN = -1.6, Y_MAX = 1.6;

  const ACTS = {
    step: { f: (z) => (z >= 0 ? 1 : 0), note: "the original 1958 perceptron: all-or-nothing. Historic, but its jumps have no usable slope — gradient descent can't feel its way along a cliff." },
    sigmoid: { f: (z) => 1 / (1 + Math.exp(-z)), note: "the smooth yes/no from logistic regression. Trainable — but nearly flat far from zero, where learning slows to a crawl." },
    tanh: { f: Math.tanh, note: "sigmoid's centered sibling: outputs −1 to +1. The default hidden-layer choice for small networks like this site's playground." },
    relu: { f: (z) => Math.max(0, z), note: "\"off below the threshold, a plain ramp above.\" Crude-looking, cheap, and the workhorse of modern deep learning." },
  };

  let view, w = 1, b = 0, actName = "tanh";
  let root, noteEl;

  function draw() {
    view.clear();
    view.grid(2);

    // zero lines
    view.ctx.strokeStyle = ML.cssVar("--text-soft");
    view.ctx.beginPath();
    const o = view.toPx(0, 0);
    view.ctx.moveTo(0, o.y); view.ctx.lineTo(view.width(), o.y);
    view.ctx.moveTo(o.x, 0); view.ctx.lineTo(o.x, view.height());
    view.ctx.stroke();

    // the neuron's response curve
    const act = ACTS[actName].f;
    view.ctx.strokeStyle = ML.cssVar("--accent");
    view.ctx.lineWidth = 2.5;
    view.ctx.beginPath();
    let started = false;
    for (let px = 0; px <= view.width(); px += 2) {
      const x = X_MIN + (px / view.width()) * (X_MAX - X_MIN);
      const p = view.toPx(x, act(w * x + b));
      started ? view.ctx.lineTo(p.x, p.y) : view.ctx.moveTo(p.x, p.y);
      started = true;
    }
    view.ctx.stroke();

    noteEl.textContent = ACTS[actName].note;
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("neuron-demo");
    if (!root) return;
    view = ML.view(root.querySelector("canvas"),
      { xMin: X_MIN, xMax: X_MAX, yMin: Y_MIN, yMax: Y_MAX, aspect: 0.5 });
    view.onDraw = draw;
    noteEl = root.querySelector('[data-out="note"]');

    const wS = root.querySelector('[data-param="w"]');
    const bS = root.querySelector('[data-param="b"]');
    const wO = root.querySelector('[data-out="w"]');
    const bO = root.querySelector('[data-out="b"]');
    wS.addEventListener("input", () => { w = +wS.value; wO.value = w.toFixed(1); draw(); });
    bS.addEventListener("input", () => { b = +bS.value; bO.value = b.toFixed(1); draw(); });

    const btns = root.querySelectorAll("[data-act]");
    btns.forEach((btn) => btn.addEventListener("click", () => {
      actName = btn.dataset.act;
      btns.forEach((x) => x.classList.toggle("secondary", x !== btn));
      draw();
    }));

    view.resize();
  });
})();
