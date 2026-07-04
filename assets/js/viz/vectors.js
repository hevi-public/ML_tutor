/* ML Tutor — vector playground: drag two arrows around, watch their number-list
   form and their dot product update live. Container: #vectors-demo. */
(function () {
  "use strict";

  const RANGE = 5; // data space: -RANGE..RANGE both axes

  const state = {
    a: { x: 3, y: 1 },
    b: { x: 1, y: 2.5 },
    dragging: null,
  };

  let canvas, ctx, outA, outB, outDot, outVerdict;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function toPx(p) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return { x: (p.x + RANGE) / (2 * RANGE) * w, y: h - (p.y + RANGE) / (2 * RANGE) * h };
  }

  function toData(px, py) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return { x: (px / w) * 2 * RANGE - RANGE, y: ((h - py) / h) * 2 * RANGE - RANGE };
  }

  function drawArrow(from, to, color) {
    const a = toPx(from), b = toPx(to);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // arrowhead
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - 12 * Math.cos(ang - 0.4), b.y - 12 * Math.sin(ang - 0.4));
    ctx.lineTo(b.x - 12 * Math.cos(ang + 0.4), b.y - 12 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // grid + axes
    ctx.strokeStyle = cssVar("--border");
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = -RANGE; g <= RANGE; g++) {
      const px = toPx({ x: g, y: 0 }).x, py = toPx({ x: 0, y: g }).y;
      ctx.moveTo(px, 0); ctx.lineTo(px, h);
      ctx.moveTo(0, py); ctx.lineTo(w, py);
    }
    ctx.stroke();
    ctx.strokeStyle = cssVar("--text-soft");
    ctx.beginPath();
    const o = toPx({ x: 0, y: 0 });
    ctx.moveTo(o.x, 0); ctx.lineTo(o.x, h);
    ctx.moveTo(0, o.y); ctx.lineTo(w, o.y);
    ctx.stroke();

    const origin = { x: 0, y: 0 };
    drawArrow(origin, state.a, cssVar("--accent"));
    drawArrow(origin, state.b, cssVar("--good"));

    // labels near heads
    ctx.font = "600 15px sans-serif";
    ctx.fillStyle = cssVar("--accent");
    const pa = toPx(state.a);
    ctx.fillText("a", pa.x + 8, pa.y - 8);
    ctx.fillStyle = cssVar("--good");
    const pb = toPx(state.b);
    ctx.fillText("b", pb.x + 8, pb.y - 8);

    updateReadout();
  }

  function updateReadout() {
    const { a, b } = state;
    const dot = a.x * b.x + a.y * b.y;
    outA.textContent = `[${a.x.toFixed(1)}, ${a.y.toFixed(1)}]`;
    outB.textContent = `[${b.x.toFixed(1)}, ${b.y.toFixed(1)}]`;
    outDot.textContent = dot.toFixed(2);
    outVerdict.textContent =
      dot > 0.5 ? "positive — the arrows lean the same way"
      : dot < -0.5 ? "negative — they lean opposite ways"
      : "about zero — they're at right angles (unrelated directions)";
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { px: src.clientX - rect.left, py: src.clientY - rect.top };
  }

  function nearestHead(px, py) {
    for (const key of ["a", "b"]) {
      const p = toPx(state[key]);
      if (Math.hypot(p.x - px, p.y - py) < 22) return key;
    }
    return null;
  }

  function onDown(e) {
    const { px, py } = pointerPos(e);
    state.dragging = nearestHead(px, py);
    if (state.dragging) e.preventDefault();
  }

  function onMove(e) {
    if (!state.dragging) return;
    e.preventDefault();
    const { px, py } = pointerPos(e);
    const p = toData(px, py);
    state[state.dragging] = {
      x: Math.max(-RANGE, Math.min(RANGE, p.x)),
      y: Math.max(-RANGE, Math.min(RANGE, p.y)),
    };
    draw();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.width * 0.75 * dpr;
    canvas.style.height = rect.width * 0.75 + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("vectors-demo");
    if (!root) return;
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");
    outA = root.querySelector('[data-out="a"]');
    outB = root.querySelector('[data-out="b"]');
    outDot = root.querySelector('[data-out="dot"]');
    outVerdict = root.querySelector('[data-out="verdict"]');

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", () => (state.dragging = null));
    canvas.addEventListener("touchstart", onDown, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", () => (state.dragging = null));
    window.addEventListener("resize", resize);
    resize();
  });
})();
