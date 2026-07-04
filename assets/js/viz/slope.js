/* ML Tutor — slope explorer: drag a ball along a curvy hill, see the tangent
   line and its slope; release the ball and watch it roll downhill (which is
   gradient descent in one dimension). Container: #slope-demo. */
(function () {
  "use strict";

  const X_MIN = -4, X_MAX = 4, Y_MIN = -1, Y_MAX = 7;

  // A hilly function with one shallow and one deep valley
  function f(x) {
    return 0.06 * x * x * x * x - 0.5 * x * x + 0.4 * x + 3.2;
  }
  function slope(x) {
    const h = 1e-4;
    return (f(x + h) - f(x - h)) / (2 * h);
  }

  const state = { x: -3.1, dragging: false, rolling: false };
  let canvas, ctx, outSlope, outVerdict, rollBtn;

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
  function toDataX(px) {
    return X_MIN + (px / canvas.clientWidth) * (X_MAX - X_MIN);
  }

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // curve
    ctx.strokeStyle = cssVar("--text-soft");
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 2) {
      const p = toPx({ x: toDataX(px), y: f(toDataX(px)) });
      px === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // tangent line at the ball
    const s = slope(state.x);
    const y0 = f(state.x);
    ctx.strokeStyle = cssVar("--accent");
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    const t1 = toPx({ x: state.x - 1.4, y: y0 - 1.4 * s });
    const t2 = toPx({ x: state.x + 1.4, y: y0 + 1.4 * s });
    ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // ball
    const b = toPx({ x: state.x, y: y0 });
    ctx.fillStyle = cssVar("--accent");
    ctx.beginPath();
    ctx.arc(b.x, b.y, 9, 0, Math.PI * 2);
    ctx.fill();

    updateReadout(s);
  }

  function updateReadout(s) {
    outSlope.textContent = s.toFixed(2);
    outVerdict.textContent =
      Math.abs(s) < 0.05 ? "flat — the ball would stay put (a valley or hilltop!)"
      : s > 0 ? "uphill to the right — downhill is to the LEFT"
      : "downhill to the right — downhill is to the RIGHT";
  }

  function roll() {
    if (state.rolling) return;
    state.rolling = true;
    rollBtn.disabled = true;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lr = 0.02;
    let steps = 0;

    function tick() {
      // gradient descent in one dimension: move against the slope
      for (let i = 0; i < (reduceMotion ? 4000 : 3); i++) {
        state.x -= lr * slope(state.x);
        steps++;
      }
      draw();
      if (Math.abs(slope(state.x)) > 0.01 && steps < 5000 && !reduceMotion) {
        requestAnimationFrame(tick);
      } else {
        if (reduceMotion) draw();
        state.rolling = false;
        rollBtn.disabled = false;
      }
    }
    tick();
  }

  function onMove(e) {
    if (!state.dragging) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    state.x = Math.max(X_MIN, Math.min(X_MAX, toDataX(src.clientX - rect.left)));
    draw();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.width * 0.55 * dpr;
    canvas.style.height = rect.width * 0.55 + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("slope-demo");
    if (!root) return;
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");
    outSlope = root.querySelector('[data-out="slope"]');
    outVerdict = root.querySelector('[data-out="verdict"]');
    rollBtn = root.querySelector('[data-action="roll"]');

    rollBtn.addEventListener("click", roll);
    root.querySelector('[data-action="reset"]').addEventListener("click", () => {
      state.x = -3.1; draw();
    });
    canvas.addEventListener("mousedown", (e) => { state.dragging = true; onMove(e); });
    canvas.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", () => (state.dragging = false));
    canvas.addEventListener("touchstart", (e) => { state.dragging = true; onMove(e); }, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", () => (state.dragging = false));
    window.addEventListener("resize", resize);
    resize();
  });
})();
