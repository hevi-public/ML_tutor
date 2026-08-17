/* Algorithms Tutor — maze/grid renderer (canvas). Draws an AlgoMaze with
   per-cell search states: frontier (amber), visited (soft green), the final
   path (accent), walls, start and goal. */
(function () {
  "use strict";

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function create(canvas, maze) {
    const ctx = canvas.getContext("2d");
    const cell = Math.floor(Math.min(canvas.width / maze.w, canvas.height / maze.h));
    const ox = Math.floor((canvas.width - cell * maze.w) / 2);

    function draw(snap, event) {
      const ns = (snap && snap.nodeState) || {};
      const path = (snap && snap.pathCells) || [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let x = 0; x < maze.w; x++) {
        for (let y = 0; y < maze.h; y++) {
          const k = x + "," + y;
          let fill = cssVar("--bg") || "#fff";
          if (maze.walls.has(k)) fill = cssVar("--text-soft") || "#667";
          else if (path.includes(k)) fill = cssVar("--accent") || "#047857";
          else if (ns[k] === "visited") fill = cssVar("--accent-soft") || "#d1fae5";
          else if (ns[k] === "frontier") fill = "#d97706";
          if (event && event.u === k && event.type === "visit") fill = "#b45309";
          ctx.fillStyle = fill;
          ctx.fillRect(ox + x * cell, y * cell, cell - 1, cell - 1);
        }
      }
      const mark = (pt, color, glyph) => {
        const [x, y] = pt;
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.floor(cell * 0.8)}px system-ui, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(glyph, ox + x * cell + cell / 2, y * cell + cell / 2 + 1);
      };
      mark(maze.start, cssVar("--text") || "#123", "●");
      mark(maze.goal, cssVar("--bad") || "#b91c1c", "★");
    }

    return { draw };
  }

  window.AlgoGridViz = { create };
})();
