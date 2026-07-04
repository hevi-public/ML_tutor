/* ML Tutor — the MLP playground. Pick a dataset and a network shape, press
   train, and watch the decision landscape form live. Training runs in a Web
   Worker (assets/js/workers/mlp-worker.js); this file only draws.
   Container: #playground. */
(function () {
  "use strict";

  const ML = window.ML;
  const DOMAIN = 6;

  let root, view, lossView, worker = null, running = false;
  let dataset = "circle", points = [];
  let lastGrid = null, lastGW = 0, lastGH = 0;
  let lossHistory = [];
  let seed = 1;

  function config() {
    const hidden = +root.querySelector('[data-param="layers"]').value;
    const width = +root.querySelector('[data-param="width"]').value;
    const sizes = [2, ...Array(hidden).fill(width), 1];
    return {
      sizes,
      activation: root.querySelector('[data-param="activation"]').value,
      lr: +root.querySelector('[data-param="lr"]').value,
      dataset,
      seed,
    };
  }

  function describeNet() {
    const c = config();
    root.querySelector('[data-out="shape"]').textContent =
      `2 inputs → ${c.sizes.slice(1, -1).map((n) => n + " neurons").join(" → ")} → 1 answer`;
  }

  function draw() {
    view.clear();

    if (lastGrid) {
      const cellW = view.width() / lastGW, cellH = view.height() / lastGH;
      for (let gy = 0; gy < lastGH; gy++) {
        for (let gx = 0; gx < lastGW; gx++) {
          const p = lastGrid[gy * lastGW + gx];
          const conf = Math.abs(p - 0.5) * 0.55;
          view.ctx.fillStyle = p >= 0.5 ? ML.rgba("--accent", conf) : ML.rgba("--bad", conf);
          // grid row 0 is y = -DOMAIN (bottom): flip vertically for canvas
          view.ctx.fillRect(gx * cellW, view.height() - (gy + 1) * cellH, cellW + 1, cellH + 1);
        }
      }
    }

    for (const p of points) {
      view.dot(p.x[0], p.x[1], 4, ML.cssVar(p.y ? "--accent" : "--bad"));
    }
  }

  function drawLoss() {
    lossView.clear();
    const ctx = lossView.ctx;
    const W = lossView.width(), H = lossView.height();
    ctx.fillStyle = ML.cssVar("--text-soft");
    ctx.font = "11px sans-serif";
    ctx.fillText("loss over training →", 8, 14);
    if (lossHistory.length < 2) return;
    const max = Math.max(...lossHistory, 0.75);
    ctx.strokeStyle = ML.cssVar("--accent");
    ctx.lineWidth = 2;
    ctx.beginPath();
    lossHistory.forEach((l, i) => {
      const x = 8 + (i / (lossHistory.length - 1)) * (W - 16);
      const y = 8 + (1 - l / max) * (H - 16); // high loss at top, zero at bottom
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  function stop() {
    running = false;
    if (worker) worker.postMessage({ type: "stop" });
    root.querySelector('[data-action="train"]').textContent = "Train";
  }

  function start() {
    if (!worker) {
      worker = new Worker("../assets/js/workers/mlp-worker.js");
      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type !== "progress") return;
        lastGrid = msg.grid; lastGW = msg.gw; lastGH = msg.gh;
        lossHistory.push(msg.loss);
        if (lossHistory.length > 400) lossHistory = lossHistory.filter((_, i) => i % 2 === 0);
        root.querySelector('[data-out="step"]').textContent = msg.step;
        root.querySelector('[data-out="loss"]').textContent = msg.loss.toFixed(3);
        root.querySelector('[data-out="acc"]').textContent = (msg.acc * 100).toFixed(0) + "%";
        draw();
        drawLoss();
      };
    }
    lossHistory = [];
    lastGrid = null;
    worker.postMessage({ type: "start", config: config() });
    running = true;
    root.querySelector('[data-action="train"]').textContent = "Pause";
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("playground");
    if (!root) return;
    view = ML.view(root.querySelector("canvas.board"),
      { xMin: -DOMAIN, xMax: DOMAIN, yMin: -DOMAIN, yMax: DOMAIN, aspect: 0.75 });
    view.onDraw = draw;
    lossView = ML.view(root.querySelector("canvas.losschart"),
      { xMin: 0, xMax: 1, yMin: 0, yMax: 1, aspect: 0.22 });
    lossView.onDraw = drawLoss;

    points = ML.datasets[dataset]();

    root.querySelectorAll("[data-dataset]").forEach((btn) =>
      btn.addEventListener("click", () => {
        dataset = btn.dataset.dataset;
        root.querySelectorAll("[data-dataset]").forEach((b) =>
          b.classList.toggle("secondary", b !== btn));
        points = ML.datasets[dataset]();
        stop();
        lastGrid = null;
        lossHistory = [];
        draw(); drawLoss();
      }));

    root.querySelector('[data-action="train"]').addEventListener("click", () => {
      running ? stop() : start();
    });
    root.querySelector('[data-action="reset"]').addEventListener("click", () => {
      stop();
      seed++;               // fresh random starting weights
      lastGrid = null;
      lossHistory = [];
      draw(); drawLoss();
      root.querySelector('[data-out="step"]').textContent = "0";
    });

    // Any architecture change restarts cleanly
    root.querySelectorAll("select, input[type=range]").forEach((el) =>
      el.addEventListener("input", () => {
        const out = root.querySelector(`[data-out="${el.dataset.param}"]`);
        if (out && el.type === "range") out.value = el.value;
        describeNet();
        stop();
      }));

    describeNet();
    view.resize();
    lossView.resize();
  });
})();
