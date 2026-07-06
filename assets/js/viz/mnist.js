/* ML Tutor — MNIST lab page script: drives the worker, renders the rotating
   test-digit grid, the accuracy readout, and the draw-a-digit pad.
   Container: #mnist-lab. */
(function () {
  "use strict";

  const SIZE = 28;
  let root, worker = null, running = false;
  let gridCanvas, gridCtx, padCanvas, padCtx, drawing = false, classifyTimer = null;

  function ensureWorker() {
    if (worker) return;
    worker = new Worker("../assets/js/workers/mnist-worker.js");
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "ready") {
        root.querySelector('[data-out="data"]').textContent =
          `${msg.trainN} training digits, ${msg.testN} held-out test digits`;
      } else if (msg.type === "progress") {
        root.querySelector('[data-out="step"]').textContent = msg.step;
        root.querySelector('[data-out="loss"]').textContent = msg.loss.toFixed(3);
        root.querySelector('[data-out="train-acc"]').textContent = (msg.trainAcc * 100).toFixed(0) + "%";
        root.querySelector('[data-out="test-acc"]').textContent = (msg.testAcc * 100).toFixed(0) + "%";
        drawGrid(msg.samples);
      } else if (msg.type === "classified") {
        showVerdict(msg.probs);
      }
    };
  }

  /* ---------- test digit grid ---------- */

  function drawGrid(samples) {
    const cols = 10, cell = gridCanvas.clientWidth / cols;
    const rows = Math.ceil(samples.length / cols);
    const scale = cell / SIZE;

    gridCtx.clearRect(0, 0, gridCanvas.clientWidth, gridCanvas.clientHeight);
    samples.forEach((s, k) => {
      const gx = (k % cols) * cell, gy = Math.floor(k / cols) * cell;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const v = 255 - s.pixels[y * SIZE + x]; // dark ink on light
          gridCtx.fillStyle = `rgb(${v},${v},${v})`;
          gridCtx.fillRect(gx + x * scale, gy + y * scale, scale + 0.5, scale + 0.5);
        }
      }
      const ok = s.pred === s.label;
      gridCtx.strokeStyle = ok ? "rgba(21,128,61,0.7)" : "rgba(185,28,28,0.9)";
      gridCtx.lineWidth = ok ? 1.5 : 3;
      gridCtx.strokeRect(gx + 1, gy + 1, cell - 2, cell - 2);
      gridCtx.fillStyle = ok ? "rgb(21,128,61)" : "rgb(185,28,28)";
      gridCtx.font = "bold " + Math.round(cell * 0.28) + "px sans-serif";
      gridCtx.fillText(s.pred, gx + cell * 0.72, gy + cell * 0.3);
    });
  }

  function resizeGrid() {
    const dpr = window.devicePixelRatio || 1;
    const rect = gridCanvas.getBoundingClientRect();
    const h = (rect.width / 10) * 2;
    gridCanvas.width = rect.width * dpr;
    gridCanvas.height = h * dpr;
    gridCanvas.style.height = h + "px";
    gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- draw pad ---------- */

  function padPos(e) {
    const rect = padCanvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function stroke(e) {
    if (!drawing) return;
    e.preventDefault();
    const { x, y } = padPos(e);
    const w = padCanvas.clientWidth;
    padCtx.fillStyle = "#000";
    padCtx.beginPath();
    padCtx.arc(x, y, w / 16, 0, Math.PI * 2); // thick strokes, MNIST-like
    padCtx.fill();
    scheduleClassify();
  }

  function scheduleClassify() {
    clearTimeout(classifyTimer);
    classifyTimer = setTimeout(classifyPad, 150);
  }

  function classifyPad() {
    if (!worker) return;
    // downsample the pad to 28×28 grayscale, white-on-black like MNIST
    const off = document.createElement("canvas");
    off.width = off.height = SIZE;
    const octx = off.getContext("2d");
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, SIZE, SIZE);
    octx.drawImage(padCanvas, 0, 0, SIZE, SIZE);
    const img = octx.getImageData(0, 0, SIZE, SIZE).data;
    const pixels = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
      pixels[i] = 1 - img[i * 4] / 255; // invert: ink = high
    }
    worker.postMessage({ type: "classify", pixels, id: 1 });
  }

  function showVerdict(probs) {
    const best = probs.indexOf(Math.max(...probs));
    const el = root.querySelector('[data-out="verdict"]');
    const ranked = probs
      .map((p, d) => ({ p, d }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 3);
    el.innerHTML = `I think it's a <strong style="font-size:1.4em">${best}</strong> — ` +
      ranked.map((r) => `${r.d}: ${(r.p * 100).toFixed(0)}%`).join(" · ");
  }

  function clearPad() {
    padCtx.fillStyle = "#fff";
    padCtx.fillRect(0, 0, padCanvas.clientWidth, padCanvas.clientHeight);
    root.querySelector('[data-out="verdict"]').textContent =
      "draw a digit, then read my mind";
  }

  function resizePad() {
    const dpr = window.devicePixelRatio || 1;
    const rect = padCanvas.getBoundingClientRect();
    padCanvas.width = rect.width * dpr;
    padCanvas.height = rect.width * dpr;
    padCanvas.style.height = rect.width + "px";
    padCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearPad();
  }

  /* ---------- wiring ---------- */

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("mnist-lab");
    if (!root) return;
    gridCanvas = root.querySelector("canvas.digit-grid");
    gridCtx = gridCanvas.getContext("2d");
    padCanvas = root.querySelector("canvas.draw-pad");
    padCtx = padCanvas.getContext("2d");

    const trainBtn = root.querySelector('[data-action="train"]');
    trainBtn.addEventListener("click", () => {
      ensureWorker();
      if (running) {
        worker.postMessage({ type: "stop" });
        running = false;
        trainBtn.textContent = "Train";
      } else {
        worker.postMessage({
          type: "start",
          config: {
            hidden: +root.querySelector('[data-param="hidden"]').value,
            lr: 0.1,
            seed: Date.now() % 100000,
          },
        });
        running = true;
        trainBtn.textContent = "Pause";
      }
    });

    padCanvas.addEventListener("mousedown", (e) => { drawing = true; stroke(e); });
    padCanvas.addEventListener("mousemove", stroke);
    window.addEventListener("mouseup", () => (drawing = false));
    padCanvas.addEventListener("touchstart", (e) => { drawing = true; stroke(e); }, { passive: false });
    padCanvas.addEventListener("touchmove", stroke, { passive: false });
    padCanvas.addEventListener("touchend", () => (drawing = false));
    root.querySelector('[data-action="clear"]').addEventListener("click", clearPad);

    window.addEventListener("resize", () => { resizeGrid(); resizePad(); });
    resizeGrid();
    resizePad();
  });
})();
