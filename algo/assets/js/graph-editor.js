/* Algorithms Tutor — the graph editor: the course's first-class input device
   (PLAN.md §4, decision 3). Learners draw a graph and every unit 4–5 page
   runs its algorithm on THAT graph.

   AlgoGraphEditor.create(host, { graph, onChange, weights, directed }) →
     { getGraph(), setGraph(g), refresh() }

   Interactions (also listed in the on-page hint):
     · click empty space        → add a node
     · click node, click node   → add edge between them (weight from the box);
                                  clicking an existing edge's pair removes it
     · click node, press Delete → remove the node (and its edges)
     · click node, click it again → deselect
     · drag a node              → move it
   URL-hash sync: #g=<base64 json> — shareable, and prose can deep-link
   configured graphs. Auto-arrange here is a plain circle; the force-directed
   upgrade is unit 8's subject matter and replaces this button's innards. */
(function () {
  "use strict";

  const NAMES = "abcdefghijklmnopqrstuvwxyz".split("");

  function serialize(graph) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(graph))));
  }
  function deserialize(s) {
    try { return JSON.parse(decodeURIComponent(escape(atob(s)))); }
    catch { return null; }
  }

  function create(host, options = {}) {
    let graph = options.graph || { directed: false, nodes: [], edges: [] };
    // load from the URL hash when present (deep links win over the default)
    const m = location.hash.match(/g=([A-Za-z0-9+/=]+)/);
    if (m && !options.ignoreHash) {
      const fromHash = deserialize(m[1]);
      if (fromHash && fromHash.nodes) graph = fromHash;
    }

    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="buttons" style="margin-bottom:0.5rem">
        ${options.weights ? `<label class="hint" style="margin:0">edge weight
          <input type="number" class="ge-weight" value="1" min="1" max="99"
            style="width:3.5rem;font:inherit;padding:0.15rem 0.3rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)"></label>` : ""}
        ${options.directedToggle ? `<label class="hint" style="margin:0">
          <input type="checkbox" class="ge-directed"> directed</label>` : ""}
        <button type="button" class="action secondary ge-arrange">arrange in a circle</button>
        <button type="button" class="action secondary ge-clear">clear</button>
        <button type="button" class="action secondary ge-share">copy share link</button>
        <span class="hint ge-hint" style="margin:0"></span>
      </div>
      <div class="ge-svg-host"></div>
      <p class="hint">Click empty space to add a node · click two nodes to
      connect them (again to disconnect) · drag to move · select + Delete to
      remove. Every demo on this page runs on this graph.</p>`;
    host.appendChild(wrap);

    const svgHost = wrap.querySelector(".ge-svg-host");
    const viz = window.AlgoGraphViz.create(svgHost, {
      width: 860, height: options.height || 340, label: "Editable graph" });
    const svg = svgHost.querySelector("svg");
    svg.style.cursor = "crosshair";
    svg.setAttribute("tabindex", "0");

    let selected = null;
    let dragging = null, moved = false;

    const dirBox = wrap.querySelector(".ge-directed");
    if (dirBox) {
      dirBox.checked = !!graph.directed;
      dirBox.addEventListener("change", () => { graph.directed = dirBox.checked; changed(); });
    }

    function toGraphCoords(evt) {
      const r = svg.getBoundingClientRect();
      const vx = ((evt.clientX - r.left) / r.width) * 860;
      const vy = ((evt.clientY - r.top) / r.height) * (options.height || 340);
      // invert the renderer's padding transform
      return {
        x: Math.min(1, Math.max(0, (vx - 30) / (860 - 60))),
        y: Math.min(1, Math.max(0, (vy - 24) / ((options.height || 340) - 48))),
      };
    }

    function nodeAt(evt) {
      const p = toGraphCoords(evt);
      const H = options.height || 340;
      let best = null, bestD = Infinity;
      for (const n of graph.nodes) {
        const dx = (n.x - p.x) * (860 - 60), dy = (n.y - p.y) * (H - 48);
        const d = Math.hypot(dx, dy);
        if (d < 22 && d < bestD) { best = n; bestD = d; }
      }
      return best;
    }

    function nextId() {
      for (const c of NAMES) if (!graph.nodes.some((n) => n.id === c)) return c;
      let i = 1;
      while (graph.nodes.some((n) => n.id === "n" + i)) i++;
      return "n" + i;
    }

    function changed() {
      draw();
      if (options.onChange) options.onChange(graph);
    }

    function draw() {
      const snap = selected
        ? { nodeState: { [selected]: "frontier" } } : {};
      viz.draw(graph, snap, null);
    }

    svg.addEventListener("pointerdown", (evt) => {
      const hit = nodeAt(evt);
      if (hit) { dragging = hit; moved = false; svg.setPointerCapture(evt.pointerId); }
    });
    svg.addEventListener("pointermove", (evt) => {
      if (!dragging) return;
      const p = toGraphCoords(evt);
      dragging.x = p.x; dragging.y = p.y;
      moved = true;
      draw();
    });
    svg.addEventListener("pointerup", (evt) => {
      if (dragging && moved) { dragging = null; changed(); return; }
      dragging = null;
      const hit = nodeAt(evt);
      if (!hit) {                                   // empty space: add node
        const p = toGraphCoords(evt);
        graph.nodes.push({ id: nextId(), x: p.x, y: p.y });
        selected = null;
        changed();
        return;
      }
      if (selected === null) { selected = hit.id; draw(); return; }
      if (selected === hit.id) { selected = null; draw(); return; }
      // two distinct nodes: toggle the edge
      const idx = graph.edges.findIndex((e) =>
        (e.u === selected && e.v === hit.id) ||
        (!graph.directed && e.u === hit.id && e.v === selected));
      if (idx >= 0) graph.edges.splice(idx, 1);
      else {
        const e = { u: selected, v: hit.id };
        const wInput = wrap.querySelector(".ge-weight");
        if (options.weights && wInput) e.w = Number(wInput.value) || 1;
        graph.edges.push(e);
      }
      selected = null;
      changed();
    });
    svg.addEventListener("keydown", (evt) => {
      if ((evt.key === "Delete" || evt.key === "Backspace") && selected) {
        graph.nodes = graph.nodes.filter((n) => n.id !== selected);
        graph.edges = graph.edges.filter((e) => e.u !== selected && e.v !== selected);
        selected = null;
        changed();
        evt.preventDefault();
      }
    });

    wrap.querySelector(".ge-clear").addEventListener("click", () => {
      graph.nodes = []; graph.edges = []; selected = null; changed();
    });
    wrap.querySelector(".ge-arrange").addEventListener("click", () => {
      const n = graph.nodes.length;
      graph.nodes.forEach((node, i) => {          // plain circle — unit 8's
        const angle = (2 * Math.PI * i) / n;      // force layout upgrades this
        node.x = 0.5 + 0.42 * Math.cos(angle);
        node.y = 0.5 + 0.44 * Math.sin(angle);
      });
      changed();
    });
    wrap.querySelector(".ge-share").addEventListener("click", (evt) => {
      const url = location.origin + location.pathname + "#g=" + serialize(graph);
      history.replaceState(null, "", "#g=" + serialize(graph));
      if (navigator.clipboard) navigator.clipboard.writeText(url);
      evt.target.textContent = "link copied!";
      setTimeout(() => { evt.target.textContent = "copy share link"; }, 1500);
    });

    draw();
    if (options.onChange) options.onChange(graph);

    return {
      getGraph: () => graph,
      setGraph: (g) => { graph = g; if (dirBox) dirBox.checked = !!g.directed; selected = null; changed(); },
      refresh: draw,
    };
  }

  window.AlgoGraphEditor = { create, serialize, deserialize };
})();
