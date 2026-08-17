/* Algorithms Tutor — the growth-rate racer (01-foundations/big-o.html).

   Draws the classic growth curves — log n, n, n log n, n², 2ⁿ — on one canvas,
   with a slider for n. The point of the widget is the moment the reader drags
   n up and watches n² and 2ⁿ leave the screen while log n barely moves: growth
   *rate* is the thing Big-O talks about, and no table of numbers makes that
   as obvious as the picture does.

   A read-out under the chart shows the actual values at the chosen n, because
   the curves alone hide how absurd the numbers get (2ⁿ at n=60 outruns any
   computer on Earth).

   Zero dependencies; theme-aware (reads CSS custom properties, redraws on
   theme flips). window.GrowthRacer.init(hostId) wires one instance. */
(function () {
  "use strict";

  const CURVES = [
    { label: "log n",   f: (n) => Math.log2(Math.max(n, 1)), color: "#0ea5e9" },
    { label: "n",       f: (n) => n,                          color: "#22c55e" },
    { label: "n log n", f: (n) => n * Math.log2(Math.max(n, 1)), color: "#eab308" },
    { label: "n²",      f: (n) => n * n,                      color: "#f97316" },
    { label: "2ⁿ",      f: (n) => Math.pow(2, n),             color: "#ef4444" },
  ];

  function fmt(x) {
    if (!isFinite(x)) return "more than fits in a number";
    if (x >= 1e15) return x.toExponential(1).replace("e+", " × 10^");
    if (x >= 1000) return Math.round(x).toLocaleString("en-US");
    return (Math.round(x * 10) / 10).toString();
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function init(hostId) {
    const host = document.getElementById(hostId);
    if (!host) return;

    host.innerHTML = `
      <canvas width="880" height="420" aria-label="Growth curves for log n, n, n log n, n squared and 2 to the n"></canvas>
      <p class="racer-controls">
        <label>input size n: <strong class="n-out"></strong><br>
          <input type="range" min="4" max="120" value="16" step="1" aria-label="input size n">
        </label>
      </p>
      <div class="counters" aria-live="off"></div>
      <p class="racer-note"></p>`;

    const canvas = host.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const slider = host.querySelector("input");
    const nOut = host.querySelector(".n-out");
    const chips = host.querySelector(".counters");
    const note = host.querySelector(".racer-note");

    chips.innerHTML = CURVES.map((c) =>
      `<span class="counter" style="border-color:${c.color}">${c.label}: <span class="n"></span></span>`
    ).join("");
    const chipOuts = [...chips.querySelectorAll(".n")];

    function draw() {
      const n = Number(slider.value);
      nOut.textContent = n;

      const W = canvas.width, H = canvas.height;
      const padL = 46, padB = 30, padT = 12, padR = 12;
      ctx.clearRect(0, 0, W, H);

      // The y-scale follows the biggest *bounded* curve at this n (n²), so the
      // polynomial curves stay readable while 2ⁿ visibly escapes the chart —
      // which is exactly the lesson.
      const yMax = Math.max(n * n, 32);
      const xTo = (x) => padL + (x / n) * (W - padL - padR);
      const yTo = (y) => H - padB - (Math.min(y, yMax) / yMax) * (H - padB - padT);

      // axes
      ctx.strokeStyle = cssVar("--border") || "#ccc";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB);
      ctx.stroke();
      ctx.fillStyle = cssVar("--text-soft") || "#888";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText("steps", 6, padT + 12);
      ctx.fillText("items (up to n = " + n + ")", W - padR - 150, H - 8);

      for (const [i, curve] of CURVES.entries()) {
        ctx.strokeStyle = curve.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let escaped = false;
        for (let x = 1; x <= n; x += n / 400) {
          const y = curve.f(x);
          if (x === 1) ctx.moveTo(xTo(x), yTo(y));
          else ctx.lineTo(xTo(x), yTo(y));
          if (y > yMax && !escaped) escaped = true;
        }
        ctx.stroke();

        // label at the curve's exit point
        const yEnd = curve.f(n);
        ctx.fillStyle = curve.color;
        ctx.font = "bold 13px system-ui, sans-serif";
        const ly = Math.max(yTo(yEnd) - 4, padT + 12 + i * 2);
        ctx.fillText(curve.label + (escaped ? " ↑" : ""), W - padR - 54, ly);

        chipOuts[i].textContent = fmt(yEnd);
      }

      note.textContent =
        n >= 50
          ? `At n = ${n}, the 2ⁿ machine needs ${fmt(Math.pow(2, n))} steps — that's not "slow", that's "never finishes". The log n one needs ${fmt(Math.log2(n))}.`
          : `Drag n up and watch which curves leave the chart first. The gap between them is what Big-O names.`;
    }

    slider.addEventListener("input", draw);
    // Redraw when the theme flips (axis/labels read CSS custom properties)
    new MutationObserver(draw).observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme"],
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", draw);
    draw();
  }

  window.GrowthRacer = { init };
})();
