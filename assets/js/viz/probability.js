/* ML Tutor — coin flip simulator: flip a fair coin many times and watch the
   running share of heads wander early, then settle onto 50% — the law of
   large numbers, seen rather than stated. Container: #coin-demo. */
(function () {
  "use strict";

  const state = { flips: 0, heads: 0, history: [] }; // history: share after each flip

  let canvas, ctx, outFlips, outHeads, outShare;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function flip(n) {
    for (let i = 0; i < n; i++) {
      state.flips++;
      if (Math.random() < 0.5) state.heads++;
      // Keep the drawn history manageable: store every k-th point once large
      const share = state.heads / state.flips;
      if (state.flips <= 1000 || state.flips % 25 === 0) {
        state.history.push({ n: state.flips, share });
      }
    }
    draw();
  }

  function reset() {
    state.flips = 0; state.heads = 0; state.history = [];
    draw();
  }

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // 50% line
    ctx.strokeStyle = cssVar("--good");
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = cssVar("--text-soft");
    ctx.font = "12px sans-serif";
    ctx.fillText("50% — what “fair” means in the long run", 8, h / 2 - 6);
    ctx.fillText("100% heads", 8, 14);
    ctx.fillText("0% heads", 8, h - 6);

    if (state.history.length > 1) {
      // log-ish x axis so the wild early swings stay visible
      const maxN = state.history[state.history.length - 1].n;
      ctx.strokeStyle = cssVar("--accent");
      ctx.lineWidth = 2;
      ctx.beginPath();
      state.history.forEach((pt, i) => {
        const x = (Math.log(pt.n) / Math.log(Math.max(maxN, 2))) * (w - 20) + 10;
        const y = h - pt.share * h;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    outFlips.textContent = state.flips;
    outHeads.textContent = state.heads;
    outShare.textContent = state.flips
      ? ((state.heads / state.flips) * 100).toFixed(1) + "%" : "–";
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.width * 0.45 * dpr;
    canvas.style.height = rect.width * 0.45 + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("coin-demo");
    if (!root) return;
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");
    outFlips = root.querySelector('[data-out="flips"]');
    outHeads = root.querySelector('[data-out="heads"]');
    outShare = root.querySelector('[data-out="share"]');

    root.querySelectorAll("[data-flip]").forEach((btn) =>
      btn.addEventListener("click", () => flip(+btn.dataset.flip)));
    root.querySelector('[data-action="reset"]').addEventListener("click", reset);
    window.addEventListener("resize", resize);
    resize();
  });
})();
