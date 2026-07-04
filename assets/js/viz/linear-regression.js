/* ML Tutor — linear regression live-fit demo.

   The learner drags two sliders (w = slope, b = starting point) to fit a line
   through scattered points, watches the "grade" (mean squared error) respond,
   can click to add their own points, and can let gradient descent take over
   and fit the line automatically, step by visible step. */
(function () {
  "use strict";

  // Data space the demo lives in (not pixels)
  const X_MIN = 0, X_MAX = 10, Y_MIN = -2, Y_MAX = 10;

  const state = {
    points: [],
    w: 0.2,
    b: 5,
    showResiduals: false,
    fitting: false,
  };

  let canvas, ctx, wSlider, bSlider, wOut, bOut, lossEl, bestEl, fitBtn;

  /* ---------- Data ---------- */

  function generatePoints(n = 26) {
    // A hidden "true" relationship with noise, so a good fit exists but no
    // line hits every point — that's the lesson.
    const trueW = 0.75, trueB = 1.5;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = X_MIN + ((X_MAX - X_MIN) * (i + 0.5)) / n;
      const noise = (pseudoRandom(i) - 0.5) * 3.2;
      pts.push({ x, y: trueW * x + trueB + noise });
    }
    return pts;
  }

  // Deterministic noise so the default scatter looks the same on every visit
  // (nice for screenshots and for talking about specific points in the text).
  function pseudoRandom(i) {
    const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  }

  /* ---------- Math ---------- */

  function predict(x) {
    return state.w * x + state.b;
  }

  function mse(w, b) {
    if (!state.points.length) return 0;
    let sum = 0;
    for (const p of state.points) {
      const err = p.y - (w * p.x + b);
      sum += err * err;
    }
    return sum / state.points.length;
  }

  // Closed-form best fit (ordinary least squares) — used only to show the
  // learner how close their hand-fit is to the best possible grade.
  function bestFit() {
    const n = state.points.length;
    if (n < 2) return { w: 0, b: n ? state.points[0].y : 0 };
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of state.points) {
      sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y;
    }
    const denom = n * sxx - sx * sx;
    if (Math.abs(denom) < 1e-12) return { w: 0, b: sy / n };
    const w = (n * sxy - sx * sy) / denom;
    return { w, b: (sy - w * sx) / n };
  }

  function gradients() {
    const n = state.points.length;
    let gw = 0, gb = 0;
    for (const p of state.points) {
      const err = p.y - predict(p.x);
      gw += -2 * p.x * err;
      gb += -2 * err;
    }
    return { gw: gw / n, gb: gb / n };
  }

  /* ---------- Canvas ---------- */

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function toPx(p) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return {
      x: ((p.x - X_MIN) / (X_MAX - X_MIN)) * w,
      y: h - ((p.y - Y_MIN) / (Y_MAX - Y_MIN)) * h,
    };
  }

  function toData(px, py) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return {
      x: X_MIN + (px / w) * (X_MAX - X_MIN),
      y: Y_MIN + ((h - py) / h) * (Y_MAX - Y_MIN),
    };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.width * 0.6 * dpr;
    canvas.style.height = rect.width * 0.6 + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = cssVar("--border");
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = X_MIN; gx <= X_MAX; gx += 2) {
      const px = toPx({ x: gx, y: 0 }).x;
      ctx.moveTo(px, 0); ctx.lineTo(px, h);
    }
    for (let gy = Math.ceil(Y_MIN / 2) * 2; gy <= Y_MAX; gy += 2) {
      const py = toPx({ x: 0, y: gy }).y;
      ctx.moveTo(0, py); ctx.lineTo(w, py);
    }
    ctx.stroke();

    // Zero axis
    if (Y_MIN < 0) {
      ctx.strokeStyle = cssVar("--text-soft");
      ctx.beginPath();
      const py = toPx({ x: 0, y: 0 }).y;
      ctx.moveTo(0, py); ctx.lineTo(w, py);
      ctx.stroke();
    }

    // Residuals: the little vertical "mistake bars" from each point to the line
    if (state.showResiduals) {
      ctx.strokeStyle = cssVar("--bad");
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (const p of state.points) {
        const a = toPx(p);
        const b2 = toPx({ x: p.x, y: predict(p.x) });
        ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The learner's line
    ctx.strokeStyle = cssVar("--accent");
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const p1 = toPx({ x: X_MIN, y: predict(X_MIN) });
    const p2 = toPx({ x: X_MAX, y: predict(X_MAX) });
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Points
    ctx.fillStyle = cssVar("--text");
    for (const p of state.points) {
      const px = toPx(p);
      ctx.beginPath();
      ctx.arc(px.x, px.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    updateReadout();
  }

  function updateReadout() {
    const loss = mse(state.w, state.b);
    const best = bestFit();
    const bestLoss = mse(best.w, best.b);
    lossEl.textContent = loss.toFixed(3);
    bestEl.textContent = bestLoss.toFixed(3);
    wOut.value = state.w.toFixed(2);
    bOut.value = state.b.toFixed(2);
    wSlider.value = state.w;
    bSlider.value = state.b;
  }

  /* ---------- Gradient descent animation ---------- */

  function autoFit() {
    if (state.fitting || state.points.length < 2) return;
    state.fitting = true;
    fitBtn.disabled = true;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lr = 0.008;
    const stepsPerFrame = 4;
    let frames = reduceMotion ? 0 : 140;

    function step() {
      for (let i = 0; i < (frames > 0 ? stepsPerFrame : 4000); i++) {
        const { gw, gb } = gradients();
        state.w -= lr * gw;
        state.b -= lr * gb;
        if (Math.abs(gw) < 1e-4 && Math.abs(gb) < 1e-4) { frames = 0; break; }
      }
      draw();
      if (frames-- > 0) {
        requestAnimationFrame(step);
      } else {
        state.fitting = false;
        fitBtn.disabled = false;
      }
    }
    step();
  }

  /* ---------- Wiring ---------- */

  function init() {
    const rootEl = document.getElementById("linreg-demo");
    if (!rootEl) return;

    canvas = rootEl.querySelector("canvas");
    ctx = canvas.getContext("2d");
    wSlider = rootEl.querySelector('[data-param="w"]');
    bSlider = rootEl.querySelector('[data-param="b"]');
    wOut = rootEl.querySelector('[data-out="w"]');
    bOut = rootEl.querySelector('[data-out="b"]');
    lossEl = rootEl.querySelector('[data-out="loss"]');
    bestEl = rootEl.querySelector('[data-out="best"]');
    fitBtn = rootEl.querySelector('[data-action="fit"]');

    state.points = generatePoints();

    wSlider.addEventListener("input", () => { state.w = +wSlider.value; draw(); });
    bSlider.addEventListener("input", () => { state.b = +bSlider.value; draw(); });

    rootEl.querySelector('[data-action="residuals"]').addEventListener("click", (e) => {
      state.showResiduals = !state.showResiduals;
      e.target.textContent = state.showResiduals
        ? "Hide the mistakes" : "Show the mistakes (residuals)";
      draw();
    });

    fitBtn.addEventListener("click", autoFit);

    rootEl.querySelector('[data-action="reset"]').addEventListener("click", () => {
      state.points = generatePoints();
      state.w = 0.2; state.b = 5;
      draw();
    });

    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const p = toData(e.clientX - rect.left, e.clientY - rect.top);
      state.points.push(p);
      draw();
    });

    window.addEventListener("resize", resize);
    resize();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
