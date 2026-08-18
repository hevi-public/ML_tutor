/* Algorithms Tutor — layout algorithms (unit 8's subject matter AND the
   site's own machinery). Three classics, honestly simplified:

   tidyTree(root)         — Reingold–Tilford-style tidy tree layout. Returns
                            {nodes: [{id, label, x, y, depth}], links}, x,y
                            in 0..1. Simplification: leaf-counting layout
                            with subtree centering (the R-T contour-merge
                            optimization is narrated, not implemented).
   forceLayout(graph)     — generator: spring-embedder ticks. Each yield is
                            {type:'tick', k, positions, movement}; positions
                            mutate graph.nodes' x,y in 0..1. Deterministic
                            (seeded start via AlgoRandom when available).
   sugiyama(graph)        — DAG layer assignment (longest path), barycenter
                            ordering sweeps, returns positioned nodes.
                            Events: {type:'layer'}, {type:'order'}. */
(function () {
  "use strict";

  /* ---------- tidy tree ---------- */

  function tidyTree(root) {
    // pass 1: leaf counts + depth
    let maxDepth = 0;
    (function measure(node, depth) {
      node._depth = depth;
      maxDepth = Math.max(maxDepth, depth);
      const kids = node.children || [];
      node._leaves = kids.length ? 0 : 1;
      for (const k of kids) { measure(k, depth + 1); node._leaves += k._leaves; }
    })(root, 0);
    // pass 2: assign x by leaf slots, center parents over children
    const nodes = [], links = [];
    let slot = 0;
    (function place(node) {
      const kids = node.children || [];
      if (!kids.length) {
        node._x = slot++;
      } else {
        for (const k of kids) { place(k); links.push({ from: node, to: k }); }
        node._x = (kids[0]._x + kids[kids.length - 1]._x) / 2;   // center parent
      }
      nodes.push(node);
    })(root);
    const totalLeaves = Math.max(1, slot - 1);
    for (const n of nodes) {
      n.x = totalLeaves === 0 ? 0.5 : n._x / totalLeaves;
      n.y = maxDepth === 0 ? 0.5 : n._depth / maxDepth;
    }
    return { nodes, links, depth: maxDepth };
  }

  /* ---------- force-directed (Fruchterman-Reingold flavored) ---------- */

  function* forceLayout(graph, options = {}) {
    const N = graph.nodes.length;
    if (!N) { yield { type: "done", ticks: 0 }; return; }
    const iterations = options.iterations || 120;
    const k = options.k || Math.sqrt(1 / N);          // ideal spring length
    // seeded start unless positions should be kept
    if (!options.keepPositions) {
      const rand = window.AlgoRandom ? window.AlgoRandom.rng(options.seed ?? 42) : Math.random;
      for (const n of graph.nodes) { n.x = 0.15 + rand() * 0.7; n.y = 0.15 + rand() * 0.7; }
    }
    const idx = new Map(graph.nodes.map((n) => [n.id, n]));
    let temp = options.temp || 0.10;                  // max move per tick, cools
    for (let it = 1; it <= iterations; it++) {
      const disp = new Map(graph.nodes.map((n) => [n.id, { x: 0, y: 0 }]));
      for (let i = 0; i < N; i++) {                   // repulsion: all pairs
        for (let j = i + 1; j < N; j++) {
          const a = graph.nodes[i], b = graph.nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d = Math.hypot(dx, dy) || 0.001;
          const rep = (k * k) / d;                    // k²/d pushes apart
          dx /= d; dy /= d;
          disp.get(a.id).x += dx * rep; disp.get(a.id).y += dy * rep;
          disp.get(b.id).x -= dx * rep; disp.get(b.id).y -= dy * rep;
        }
      }
      for (const e of graph.edges) {                  // attraction along edges
        const a = idx.get(e.u), b = idx.get(e.v);
        let dx = a.x - b.x, dy = a.y - b.y;
        let d = Math.hypot(dx, dy) || 0.001;
        const att = (d * d) / k;                      // d²/k pulls together
        dx /= d; dy /= d;
        disp.get(a.id).x -= dx * att; disp.get(a.id).y -= dy * att;
        disp.get(b.id).x += dx * att; disp.get(b.id).y += dy * att;
      }
      let movement = 0;
      for (const n of graph.nodes) {                  // move, capped by temperature
        const d = disp.get(n.id);
        const len = Math.hypot(d.x, d.y) || 0.001;
        const step = Math.min(len, temp);
        n.x = Math.min(0.97, Math.max(0.03, n.x + (d.x / len) * step));
        n.y = Math.min(0.95, Math.max(0.05, n.y + (d.y / len) * step));
        movement += step;
      }
      temp *= 0.96;                                   // cool: big moves early, tweaks late
      yield { type: "tick", k: it, movement: movement / N };
      if (movement / N < 0.0008) break;               // converged
    }
    yield { type: "done" };
  }

  /* ---------- Sugiyama-style DAG layering ---------- */

  function* sugiyama(graph) {
    // 1. layer by longest path from sources
    const layer = new Map(graph.nodes.map((n) => [n.id, 0]));
    const adj = new Map(graph.nodes.map((n) => [n.id, []]));
    const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
    for (const e of graph.edges) {
      adj.get(e.u).push(e.v);
      indeg.set(e.v, indeg.get(e.v) + 1);
    }
    const ready = graph.nodes.map((n) => n.id).filter((id) => indeg.get(id) === 0);
    while (ready.length) {                            // Kahn again — units compose
      const u = ready.shift();
      for (const v of adj.get(u)) {
        layer.set(v, Math.max(layer.get(v), layer.get(u) + 1));
        indeg.set(v, indeg.get(v) - 1);
        if (indeg.get(v) === 0) ready.push(v);
      }
    }
    const maxLayer = Math.max(...layer.values(), 0);
    const byLayer = Array.from({ length: maxLayer + 1 }, () => []);
    for (const n of graph.nodes) byLayer[layer.get(n.id)].push(n.id);
    yield { type: "layer", layers: byLayer.map((l) => l.slice()) };

    // 2. barycenter sweeps: order each layer by the average position of
    //    neighbors in the layer above — crossing reduction's workhorse
    const pos = new Map();
    const setPositions = () => {
      byLayer.forEach((ids) => ids.forEach((id, i) => pos.set(id, i)));
    };
    setPositions();
    const parents = new Map(graph.nodes.map((n) => [n.id, []]));
    for (const e of graph.edges) parents.get(e.v).push(e.u);
    for (let sweep = 0; sweep < 3; sweep++) {
      for (let L = 1; L <= maxLayer; L++) {
        byLayer[L].sort((a, b) => {
          const bary = (id) => {
            const ps = parents.get(id);
            return ps.length ? ps.reduce((s, p) => s + pos.get(p), 0) / ps.length : pos.get(id);
          };
          return bary(a) - bary(b);
        });
        setPositions();
      }
      yield { type: "order", sweep: sweep + 1, layers: byLayer.map((l) => l.slice()) };
    }

    // 3. coordinates
    const idx = new Map(graph.nodes.map((n) => [n.id, n]));
    byLayer.forEach((ids, L) => {
      ids.forEach((id, i) => {
        const n = idx.get(id);
        n.x = ids.length === 1 ? 0.5 : 0.08 + (i / (ids.length - 1)) * 0.84;
        n.y = maxLayer === 0 ? 0.5 : 0.08 + (L / maxLayer) * 0.84;
      });
    });
    yield { type: "done", layers: byLayer };
    return byLayer;
  }

  window.AlgoLayout = { tidyTree, forceLayout, sugiyama };
})();
