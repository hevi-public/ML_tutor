/* Algorithms Tutor — binary tree renderer (SVG). Draws a BST/heap snapshot
   with the current step event highlighted: visited = amber ring, freshly
   inserted = green fill, found = green ring.

   Layout: in-order rank → x, depth → y — the simple textbook placement. The
   proper tidy-tree algorithm (Reingold–Tilford) is unit 8's subject matter,
   where this renderer's layout is upgraded and taught.

   Snapshot shape (matches AlgoStructures' BST state):
     { nodes: { id: {value,left,right} }, root }
   Heap mode: pass { array: [...] } instead and the implicit tree is drawn
   (parent i → children 2i+1, 2i+2), which IS the heap lesson. */
(function () {
  "use strict";

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function create(host, options = {}) {
    const W = options.width || 860, H = options.height || 300;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("role", "img");
    if (options.label) svg.setAttribute("aria-label", options.label);
    host.appendChild(svg);

    // Convert a heap array into BST-shaped nodes for one code path below
    function heapToNodes(a) {
      const nodes = {};
      a.forEach((value, i) => {
        nodes[i] = {
          value,
          left: 2 * i + 1 < a.length ? 2 * i + 1 : null,
          right: 2 * i + 2 < a.length ? 2 * i + 2 : null,
        };
      });
      return { nodes, root: a.length ? 0 : null };
    }

    function draw(snapshot, event) {
      const { nodes, root } = snapshot.array
        ? heapToNodes(snapshot.array)
        : snapshot;
      svg.innerHTML = "";
      if (root == null) {
        svg.innerHTML = `<text x="16" y="30" font-size="14" fill="var(--text-soft)">(empty)</text>`;
        return;
      }

      // in-order rank → x slot; depth → y row
      const pos = {};
      let rank = 0, maxDepth = 0;
      (function walk(id, depth) {
        if (id == null) return;
        const n = nodes[id];
        walk(n.left, depth + 1);
        pos[id] = { rank: rank++, depth };
        maxDepth = Math.max(maxDepth, depth);
        walk(n.right, depth + 1);
      })(root, 0);

      const xTo = (r) => 30 + (r + 0.5) * ((W - 60) / rank);
      const yTo = (d) => 30 + d * ((H - 60) / Math.max(maxDepth, 1));
      const R = Math.min(17, Math.max(10, (W - 60) / rank / 2.4));

      let edges = "", circles = "";
      for (const [idStr, n] of Object.entries(nodes)) {
        const id = isNaN(Number(idStr)) ? idStr : Number(idStr);
        if (!(id in pos)) continue; // detached (mid-operation)
        const { rank: r, depth: d } = pos[id];
        const x = xTo(r), y = yTo(d);
        for (const childId of [n.left, n.right]) {
          if (childId != null && childId in pos) {
            const c = pos[childId];
            edges += `<line x1="${x}" y1="${y}" x2="${xTo(c.rank)}" y2="${yTo(c.depth)}"
                        stroke="var(--border)" stroke-width="1.5"/>`;
          }
        }
        let fill = "var(--bg-inset)", stroke = "var(--border)", strokeW = 1.5;
        if (event) {
          if (event.type === "visit" && event.id === id) { stroke = "#d97706"; strokeW = 3; }
          if (event.type === "insert" && event.id === id) { fill = "var(--accent-soft)"; stroke = "var(--accent)"; strokeW = 3; }
          if (event.type === "found" && event.id === id) { stroke = "var(--good)"; strokeW = 3; }
          if ((event.type === "swap" || event.type === "compare") &&
              (event.i === id || event.j === id)) {
            stroke = event.type === "swap" ? "var(--bad)" : "#d97706"; strokeW = 3;
          }
          if (event.type === "set" && event.i === id) { fill = "var(--accent-soft)"; stroke = "var(--accent)"; strokeW = 3; }
        }
        circles += `<circle cx="${x}" cy="${y}" r="${R}" fill="${fill}"
                      stroke="${stroke}" stroke-width="${strokeW}"/>
                    <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="${R * 0.85}"
                      fill="var(--text)">${n.value}</text>`;
      }
      svg.innerHTML = edges + circles;
    }

    return { draw };
  }

  window.AlgoTreeViz = { create };
})();
