/* Algorithms Tutor — DP table renderer (HTML). Draws a 2-D grid of cells
   from a snapshot:
     { cells: { "i,j": value }, rowLabels: [...], colLabels: [...],
       trace: Set("i,j")?, note? }
   Highlights the event's current cell; trace cells get the accent wash.
   Small on purpose: DP tables are the one viz where plain <table> beats
   canvas — the values ARE the picture. */
(function () {
  "use strict";

  function create(host, options = {}) {
    function draw(rows, cols, snap, event) {
      snap = snap || {};
      const cells = snap.cells || {};
      const trace = snap.trace || new Set();
      const rl = options.rowLabels || [];
      const cl = options.colLabels || [];
      let html = "<table style='border-collapse:collapse;font-family:var(--mono);font-size:0.85rem'>";
      html += "<tr><td></td>" + Array.from({ length: cols }, (_, j) =>
        `<td style="padding:0.12rem 0.45rem;color:var(--text-soft);text-align:center">${cl[j] ?? j}</td>`
      ).join("") + "</tr>";
      for (let i = 0; i < rows; i++) {
        html += `<tr><td style="padding:0.12rem 0.45rem;color:var(--text-soft)">${rl[i] ?? i}</td>`;
        for (let j = 0; j < cols; j++) {
          const key = i + "," + j;
          const v = cells[key];
          const hot = event && event.i === i && (event.j === undefined ? j === 0 : event.j === j);
          const inTrace = trace.has ? trace.has(key) : trace[key];
          let style = "padding:0.12rem 0.45rem;text-align:center;border:1px solid var(--border);min-width:1.9rem;";
          if (inTrace) style += "background:var(--accent-soft);color:var(--accent);font-weight:700;";
          if (hot) style += "outline:2.5px solid #d97706;";
          if (v === undefined) style += "opacity:0.3;";
          html += `<td style="${style}">${v === undefined ? "·" : v}</td>`;
        }
        html += "</tr>";
      }
      host.innerHTML = html + "</table>" +
        (snap.note ? `<p class="hint" style="margin:0.4rem 0 0">${snap.note}</p>` : "");
    }
    return { draw };
  }

  window.AlgoTableViz = { create };
})();
