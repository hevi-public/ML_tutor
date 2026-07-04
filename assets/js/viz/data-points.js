/* ML Tutor — table ↔ chart linker: the same data shown as a notebook table and
   as dots on a chart. Hover a row to light up its dot; hover a dot to light up
   its row. One idea: a data point is a row AND a dot — same thing, two views.
   Container: #data-demo with a <table> and a <canvas>; rows carry data-x/data-y. */
(function () {
  "use strict";

  let canvas, ctx, rows, points;
  let hovered = -1;
  const PAD = 34;
  let X_MIN, X_MAX, Y_MIN, Y_MAX;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function toPx(p) {
    const w = canvas.clientWidth - PAD * 1.5, h = canvas.clientHeight - PAD * 1.5;
    return {
      x: PAD + ((p.x - X_MIN) / (X_MAX - X_MIN)) * w,
      y: PAD / 2 + h - ((p.y - Y_MIN) / (Y_MAX - Y_MIN)) * h,
    };
  }

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // axes
    ctx.strokeStyle = cssVar("--border");
    ctx.beginPath();
    ctx.moveTo(PAD, PAD / 2); ctx.lineTo(PAD, h - PAD);
    ctx.lineTo(w - PAD / 2, h - PAD);
    ctx.stroke();
    ctx.fillStyle = cssVar("--text-soft");
    ctx.font = "12px sans-serif";
    ctx.fillText(canvas.dataset.xlabel || "input →", w / 2 - 30, h - 8);
    ctx.save();
    ctx.translate(12, h / 2 + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(canvas.dataset.ylabel || "answer →", 0, 0);
    ctx.restore();

    points.forEach((p, i) => {
      const px = toPx(p);
      ctx.fillStyle = i === hovered ? cssVar("--bad") : cssVar("--accent");
      ctx.beginPath();
      ctx.arc(px.x, px.y, i === hovered ? 8 : 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function setHover(i) {
    if (i === hovered) return;
    hovered = i;
    rows.forEach((row, ri) => row.classList.toggle("row-hot", ri === i));
    draw();
  }

  function onCanvasMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = -1, bestD = 18;
    points.forEach((p, i) => {
      const px = toPx(p);
      const d = Math.hypot(px.x - mx, px.y - my);
      if (d < bestD) { best = i; bestD = d; }
    });
    setHover(best);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.width * 0.62 * dpr;
    canvas.style.height = rect.width * 0.62 + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("data-demo");
    if (!root) return;
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");
    rows = [...root.querySelectorAll("tbody tr")];
    points = rows.map((r) => ({ x: +r.dataset.x, y: +r.dataset.y }));

    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const padX = (Math.max(...xs) - Math.min(...xs)) * 0.12 || 1;
    const padY = (Math.max(...ys) - Math.min(...ys)) * 0.15 || 1;
    X_MIN = Math.min(...xs) - padX; X_MAX = Math.max(...xs) + padX;
    Y_MIN = Math.min(...ys) - padY; Y_MAX = Math.max(...ys) + padY;

    rows.forEach((row, i) => {
      row.addEventListener("mouseenter", () => setHover(i));
      row.addEventListener("mouseleave", () => setHover(-1));
    });
    canvas.addEventListener("mousemove", onCanvasMove);
    canvas.addEventListener("mouseleave", () => setHover(-1));
    window.addEventListener("resize", resize);
    resize();
  });
})();
