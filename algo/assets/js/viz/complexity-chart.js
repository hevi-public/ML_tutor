/* Algorithms Tutor — "complexity you can measure" (PLAN.md §4, decision 2).

   Runs one or more step-generators across a range of input sizes, counts
   their events (no rendering), and plots the measured counts next to the
   claimed Big-O curve — so "insertion sort is Θ(n²)" becomes a picture of
   dots landing on a parabola, not a slogan.

   AlgoComplexityChart.render(host, {
     series: [{ label, make: (n) => generator, count?: [types], color,
                claim: { label, f: (n) => number } }],
     sizes:  [8, 16, 32, …]        input sizes to measure (kept modest — this
                                    runs on the main thread; Web-Worker mode
                                    arrives with the labs milestone)
   })
   Each claimed curve is scaled to pass through the series' last measured
   point, because Big-O hides constants — the SHAPE is the claim being tested. */
(function () {
  "use strict";

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function measure(make, types) {
    let total = 0;
    const counts = {};
    for (const event of make()) {
      if (!types || types.includes(event.type)) {
        counts[event.type] = (counts[event.type] || 0) + 1;
        total++;
      }
    }
    return types ? total : total;
  }

  function render(host, options) {
    const canvas = document.createElement("canvas");
    canvas.width = 880; canvas.height = 400;
    canvas.setAttribute("aria-label", "Measured operation counts against the claimed growth curves");
    host.appendChild(canvas);
    const legend = document.createElement("div");
    legend.className = "counters";
    host.appendChild(legend);
    const ctx = canvas.getContext("2d");

    const sizes = options.sizes;
    const data = options.series.map((s) => ({
      ...s,
      points: sizes.map((n) => ({ n, y: measure(() => s.make(n), s.count) })),
    }));

    legend.innerHTML = data.map((s) =>
      `<span class="counter" style="border-color:${s.color}">● ${s.label}` +
      (s.claim ? ` <span style="color:var(--text-soft)">vs ${s.claim.label}</span>` : "") +
      `</span>`
    ).join("");

    function draw() {
      const W = canvas.width, H = canvas.height;
      const padL = 56, padB = 30, padT = 12, padR = 12;
      const yMax = Math.max(...data.flatMap((s) => s.points.map((p) => p.y))) * 1.05;
      const xMax = sizes[sizes.length - 1];
      const xTo = (n) => padL + (n / xMax) * (W - padL - padR);
      const yTo = (y) => H - padB - (y / yMax) * (H - padB - padT);

      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = cssVar("--border") || "#ccc";
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB);
      ctx.stroke();
      ctx.fillStyle = cssVar("--text-soft") || "#888";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText("operations", 6, padT + 12);
      ctx.fillText("n", W - padR - 12, H - 8);

      for (const s of data) {
        // the claimed shape, scaled through the last measured point (dashed)
        if (s.claim) {
          const last = s.points[s.points.length - 1];
          const scale = last.y / (s.claim.f(last.n) || 1);
          ctx.strokeStyle = s.color;
          ctx.setLineDash([6, 5]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let n = sizes[0]; n <= xMax; n += Math.max(1, xMax / 300)) {
            const y = s.claim.f(n) * scale;
            if (n === sizes[0]) ctx.moveTo(xTo(n), yTo(y));
            else ctx.lineTo(xTo(n), yTo(y));
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // the measured dots
        ctx.fillStyle = s.color;
        for (const p of s.points) {
          ctx.beginPath();
          ctx.arc(xTo(p.n), yTo(p.y), 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    draw();
    new MutationObserver(draw).observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme"],
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", draw);
  }

  window.AlgoComplexityChart = { render };
})();
