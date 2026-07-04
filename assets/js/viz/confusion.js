/* ML Tutor — spam filter threshold demo: a model has scored 100 emails from
   0 (surely fine) to 1 (surely spam). Drag the cutoff and watch the four kinds
   of outcome — and accuracy, precision, recall — trade off live.
   Container: #confusion-demo. */
(function () {
  "use strict";

  function pseudoRandom(i) {
    const v = Math.sin(i * 269.5 + 183.3) * 43758.5453;
    return v - Math.floor(v);
  }

  // 60 legit emails scoring mostly low, 40 spam scoring mostly high, overlapping.
  function makeEmails() {
    const emails = [];
    for (let i = 0; i < 60; i++) {
      const s = 0.28 + (pseudoRandom(i) - 0.5) * 0.42 + (pseudoRandom(i + 500) - 0.5) * 0.18;
      emails.push({ score: Math.min(0.97, Math.max(0.02, s)), spam: false });
    }
    for (let i = 0; i < 40; i++) {
      const s = 0.68 + (pseudoRandom(i + 1000) - 0.5) * 0.44 + (pseudoRandom(i + 1500) - 0.5) * 0.18;
      emails.push({ score: Math.min(0.98, Math.max(0.03, s)), spam: true });
    }
    return emails;
  }

  const emails = makeEmails();
  let threshold = 0.5;
  let canvas, ctx, root;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function counts() {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const e of emails) {
      const flagged = e.score >= threshold;
      if (flagged && e.spam) tp++;
      else if (flagged && !e.spam) fp++;
      else if (!flagged && !e.spam) tn++;
      else fn++;
    }
    return { tp, fp, tn, fn };
  }

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const xFor = (score) => 10 + score * (w - 20);

    // flagged zone tint
    ctx.fillStyle = cssVar("--bad-soft");
    ctx.fillRect(xFor(threshold), 0, w - xFor(threshold), h);

    // band labels
    ctx.fillStyle = cssVar("--text-soft");
    ctx.font = "12px sans-serif";
    ctx.fillText("real emails (not spam)", 10, 16);
    ctx.fillText("actual spam", 10, h / 2 + 16);
    ctx.fillText("← looks fine … score … looks spammy →", w / 2 - 110, h - 6);

    // dots: legit in top band, spam in bottom band
    emails.forEach((e, i) => {
      const jitter = (pseudoRandom(i + 3000) - 0.5) * (h / 2 - 46);
      const y = (e.spam ? (3 * h) / 4 - 4 : h / 4 - 4) + jitter;
      const flagged = e.score >= threshold;
      // wrongly-handled emails glow red; correctly-handled use calm colors
      const wrong = flagged !== e.spam;
      ctx.fillStyle = wrong ? cssVar("--bad") : e.spam ? cssVar("--text-soft") : cssVar("--accent");
      ctx.beginPath();
      ctx.arc(xFor(e.score), y, wrong ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // threshold line
    ctx.strokeStyle = cssVar("--text");
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(xFor(threshold), 0); ctx.lineTo(xFor(threshold), h - 18);
    ctx.stroke();
    ctx.setLineDash([]);

    updateReadout();
  }

  function updateReadout() {
    const { tp, fp, tn, fn } = counts();
    const set = (k, v) => { root.querySelector(`[data-out="${k}"]`).textContent = v; };
    set("tp", tp); set("fp", fp); set("tn", tn); set("fn", fn);

    const acc = (tp + tn) / emails.length;
    const prec = tp + fp ? tp / (tp + fp) : 1;
    const rec = tp + fn ? tp / (tp + fn) : 0;
    set("acc", (acc * 100).toFixed(0) + "%");
    set("prec", (prec * 100).toFixed(0) + "%");
    set("rec", (rec * 100).toFixed(0) + "%");
    set("thresh", threshold.toFixed(2));
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.width * 0.42 * dpr;
    canvas.style.height = rect.width * 0.42 + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("confusion-demo");
    if (!root) return;
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");

    const slider = root.querySelector('[data-param="threshold"]');
    slider.addEventListener("input", () => { threshold = +slider.value; draw(); });

    window.addEventListener("resize", resize);
    resize();
  });
})();
