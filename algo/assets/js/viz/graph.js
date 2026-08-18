/* Algorithms Tutor — graph renderer (SVG). Draws the shared graph model
   (see algo/graphs.js) with per-step highlights.

   The page keeps a state object updated by a tracked generator wrapper:
     { nodeState: { id: "visited"|"frontier"|"settled"|"cycle"|... },
       nodeLabel: { id: "3" }          (e.g. distances, topo order),
       edgeState: { "u→v": "tree"|"active"|"reject"|"path" } }
   and capture() snapshots it. draw(graph, snap, event) renders everything.

   Colors: frontier = amber ring, visited/settled = green, tree/path edges =
   thick accent, rejected = dashed red, the current check = amber edge. */
(function () {
  "use strict";

  const edgeKey = (u, v) => `${u}→${v}`;

  function create(host, options = {}) {
    const W = options.width || 860, H = options.height || 360;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("role", "img");
    if (options.label) svg.setAttribute("aria-label", options.label);
    host.appendChild(svg);
    const R = options.r || 17;

    function pos(graph, id) {
      const n = graph.nodes.find((n) => n.id === id);
      return { x: 30 + n.x * (W - 60), y: 24 + n.y * (H - 48) };
    }

    function draw(graph, snap, event) {
      snap = snap || {};
      const ns = snap.nodeState || {}, nl = snap.nodeLabel || {}, es = snap.edgeState || {};
      let defs = "";
      if (graph.directed) {
        defs = `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-soft)"/></marker>
                <marker id="arr-hot" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)"/></marker></defs>`;
      }

      let edges = "", labels = "";
      for (const e of graph.edges) {
        const a = pos(graph, e.u), b = pos(graph, e.v);
        // shorten to the node rim so arrowheads sit outside the circle
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const ax = a.x + (dx / len) * R, ay = a.y + (dy / len) * R;
        const bx = b.x - (dx / len) * (R + (graph.directed ? 3 : 0));
        const by = b.y - (dy / len) * (R + (graph.directed ? 3 : 0));

        const state = es[edgeKey(e.u, e.v)] ||
          (!graph.directed ? es[edgeKey(e.v, e.u)] : undefined);
        const isActive = event && event.type === "check" &&
          ((event.u === e.u && event.v === e.v) ||
           (!graph.directed && event.u === e.v && event.v === e.u));
        let stroke = "var(--border)", width = 1.8, dash = "", marker = graph.directed ? "url(#arr)" : "";
        if (state === "tree" || state === "path") { stroke = "var(--accent)"; width = 4; marker = graph.directed ? "url(#arr-hot)" : ""; }
        if (state === "reject") { stroke = "var(--bad)"; dash = "5,4"; }
        if (isActive) { stroke = "#d97706"; width = 3.5; }
        edges += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${stroke}"
                   stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}
                   ${marker ? `marker-end="${marker}"` : ""}/>`;
        if (e.w !== undefined) {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          labels += `<rect x="${mx - 11}" y="${my - 10}" width="22" height="16" rx="4"
                       fill="var(--bg)" opacity="0.92"/>
                     <text x="${mx}" y="${my + 3}" text-anchor="middle" font-size="11.5"
                       fill="var(--text-soft)">${e.w}</text>`;
        }
      }

      let nodes = "";
      for (const n of graph.nodes) {
        const { x, y } = pos(graph, n.id);
        const state = ns[n.id];
        let fill = "var(--bg-inset)", stroke = "var(--border)", sw = 1.8;
        if (state === "frontier") { stroke = "#d97706"; sw = 3.5; }
        if (state === "visited" || state === "settled") { fill = "var(--accent-soft)"; stroke = "var(--accent)"; sw = 2.5; }
        if (state === "cycle") { fill = "var(--bad-soft)"; stroke = "var(--bad)"; sw = 3; }
        if (event && (event.u === n.id || (event.type !== "check" && event.v === n.id))) sw += 1;
        const extra = nl[n.id] !== undefined
          ? `<text x="${x}" y="${y - R - 5}" text-anchor="middle" font-size="11.5"
               font-weight="700" fill="var(--accent)">${nl[n.id]}</text>` : "";
        nodes += `<circle cx="${x}" cy="${y}" r="${R}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
                  <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12.5"
                    fill="var(--text)">${n.label || n.id}</text>${extra}`;
      }

      svg.innerHTML = defs + edges + labels + nodes;
    }

    return { draw };
  }

  /* Default event → viz-state mapping, shared by the unit 4–5 pages. A page
     wraps its generator: apply each event to a state object, yield it on, and
     let capture() snapshot the state. Pages with special needs override. */
  function applyEvent(state, e) {
    state.nodeState = state.nodeState || {};
    state.nodeLabel = state.nodeLabel || {};
    state.edgeState = state.edgeState || {};
    switch (e.type) {
      case "discover":
        if (state.nodeState[e.u] !== "visited" && state.nodeState[e.u] !== "settled")
          state.nodeState[e.u] = "frontier";
        break;
      case "visit":
        state.nodeState[e.u] = "visited";
        break;
      case "settle":
        state.nodeState[e.u] = "settled";
        state.nodeLabel[e.u] = e.dist;
        break;
      case "relax":
        state.nodeLabel[e.v] = e.dist;
        break;
      case "order":
        state.nodeState[e.u] = "visited";
        state.nodeLabel[e.u] = "#" + (e.k + 1);
        break;
      case "tree-edge":
        state.edgeState[edgeKey(e.u, e.v)] = "tree";
        break;
      case "reject":
        state.edgeState[edgeKey(e.u, e.v)] = "reject";
        break;
      case "cycle":
        for (const id of e.nodes) state.nodeState[id] = "cycle";
        break;
      case "flow":
        for (const [u, v] of e.path) state.edgeState[edgeKey(u, v)] = "path";
        break;
    }
  }

  window.AlgoGraphViz = { create, edgeKey, applyEvent };
})();
