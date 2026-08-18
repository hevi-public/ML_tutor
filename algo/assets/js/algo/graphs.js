/* Algorithms Tutor — graph algorithms as steppable generators (units 4–5).

   The graph model shared by the editor, the renderer and every generator:
     { directed: bool,
       nodes: [{ id, x, y, label? }],          // x,y in 0..1 (layout space)
       edges: [{ u, v, w }] }                  // w optional (default 1)

   Generators take (graph, ...) and consult an adjacency index built by
   AlgoGraphs.adjacency(graph). Events:
     {type:'visit', u}            u is being processed (pulled from frontier)
     {type:'discover', u, from}   u entered the frontier via edge from→u
     {type:'check', u, v}         looking along edge u→v
     {type:'relax', u, v, dist}   improved v's best-known distance via u
     {type:'settle', u, dist}     u's distance is now final
     {type:'order', u, k}         u assigned position k (topological sort)
     {type:'tree-edge', u, v}     edge accepted into the spanning tree / SCC
     {type:'reject', u, v}        edge considered and discarded
     {type:'cycle', nodes}        a cycle was detected
     {type:'component', id, n}    a finished component/SCC, sequence number
     {type:'flow', path, value}   an augmenting path carrying `value`
     {type:'done', ...}           algorithm-specific summary */
(function () {
  "use strict";

  function adjacency(graph) {
    const adj = new Map(graph.nodes.map((n) => [n.id, []]));
    for (const e of graph.edges) {
      adj.get(e.u).push({ to: e.v, w: e.w ?? 1 });
      if (!graph.directed) adj.get(e.v).push({ to: e.u, w: e.w ?? 1 });
    }
    return adj;
  }

  /* ---------- traversal: the frontier IS the algorithm ---------- */

  // container: "queue" (BFS) or "stack" (DFS) — one loop, two orders.
  function* traverse(graph, start, container) {
    const adj = adjacency(graph);
    const seen = new Set([start]);
    const frontier = [start];
    yield { type: "discover", u: start, from: null };
    while (frontier.length) {
      const u = container === "queue" ? frontier.shift() : frontier.pop();
      yield { type: "visit", u };
      for (const { to } of adj.get(u)) {
        yield { type: "check", u, v: to };
        if (!seen.has(to)) {
          seen.add(to);
          frontier.push(to);
          yield { type: "discover", u: to, from: u };
        }
      }
    }
    yield { type: "done", visited: seen.size };
  }
  const bfs = (graph, start) => traverse(graph, start, "queue");
  const dfs = (graph, start) => traverse(graph, start, "stack");

  // BFS that records parents — unweighted shortest paths.
  function* bfsPaths(graph, start) {
    const adj = adjacency(graph);
    const parent = new Map([[start, null]]);
    const dist = new Map([[start, 0]]);
    const queue = [start];
    yield { type: "discover", u: start, from: null };
    while (queue.length) {
      const u = queue.shift();
      yield { type: "visit", u };
      yield { type: "settle", u, dist: dist.get(u) };
      for (const { to } of adj.get(u)) {
        yield { type: "check", u, v: to };
        if (!parent.has(to)) {
          parent.set(to, u);
          dist.set(to, dist.get(u) + 1);
          queue.push(to);
          yield { type: "discover", u: to, from: u };
        }
      }
    }
    return { parent, dist };
  }

  /* ---------- topological sort (Kahn's algorithm) ---------- */

  function* topoSort(graph) {
    const adj = adjacency(graph);
    const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
    for (const e of graph.edges) indeg.set(e.v, indeg.get(e.v) + 1);
    const ready = graph.nodes.map((n) => n.id).filter((id) => indeg.get(id) === 0);
    const order = [];
    for (const id of ready) yield { type: "discover", u: id, from: null };
    while (ready.length) {
      const u = ready.shift();
      order.push(u);
      yield { type: "order", u, k: order.length - 1 };
      for (const { to } of adj.get(u)) {
        yield { type: "check", u, v: to };
        indeg.set(to, indeg.get(to) - 1);
        if (indeg.get(to) === 0) {
          ready.push(to);
          yield { type: "discover", u: to, from: u };
        }
      }
    }
    if (order.length < graph.nodes.length) {
      const stuck = graph.nodes.map((n) => n.id).filter((id) => !order.includes(id));
      yield { type: "cycle", nodes: stuck };   // leftovers all sit on cycles
      return null;
    }
    yield { type: "done", order };
    return order;
  }

  /* ---------- connected components (undirected) ---------- */

  function* components(graph) {
    const adj = adjacency(graph);
    const seen = new Set();
    let comp = 0;
    for (const { id } of graph.nodes) {
      if (seen.has(id)) continue;
      comp++;
      let size = 0;
      const stack = [id];
      seen.add(id);
      yield { type: "discover", u: id, from: null };
      while (stack.length) {
        const u = stack.pop();
        size++;
        yield { type: "visit", u, comp };
        for (const { to } of adj.get(u)) {
          if (!seen.has(to)) {
            seen.add(to);
            stack.push(to);
            yield { type: "discover", u: to, from: u };
          }
        }
      }
      yield { type: "component", id: comp, n: size };
    }
    yield { type: "done", components: comp };
    return comp;
  }

  /* ---------- cycle detection & two-coloring ---------- */

  // Undirected two-coloring: succeeds ⇔ bipartite; an odd cycle is the witness.
  function* twoColor(graph) {
    const adj = adjacency(graph);
    const color = new Map();
    for (const { id } of graph.nodes) {
      if (color.has(id)) continue;
      color.set(id, 0);
      yield { type: "discover", u: id, from: null };
      const queue = [id];
      while (queue.length) {
        const u = queue.shift();
        yield { type: "visit", u, color: color.get(u) };
        for (const { to } of adj.get(u)) {
          yield { type: "check", u, v: to };
          if (!color.has(to)) {
            color.set(to, 1 - color.get(u));
            queue.push(to);
            yield { type: "discover", u: to, from: u };
          } else if (color.get(to) === color.get(u)) {
            yield { type: "cycle", nodes: [u, to] };   // same-color edge: odd cycle
            yield { type: "done", bipartite: false };
            return false;
          }
        }
      }
    }
    yield { type: "done", bipartite: true };
    return true;
  }

  /* ---------- Dijkstra (non-negative weights) ---------- */

  // The frontier is a priority queue: unit 2's heap, imported conceptually.
  // Teaching-sized graphs, so a linear-scan PQ keeps the code transparent;
  // the page says so and quotes the heap-backed bound.
  function* dijkstra(graph, start) {
    const adj = adjacency(graph);
    const dist = new Map(graph.nodes.map((n) => [n.id, Infinity]));
    const parent = new Map();
    const settled = new Set();
    dist.set(start, 0);
    yield { type: "relax", u: null, v: start, dist: 0 };
    for (;;) {
      let u = null, best = Infinity;              // extract-min
      for (const [id, d] of dist) {
        if (!settled.has(id) && d < best) { best = d; u = id; }
      }
      if (u === null) break;
      settled.add(u);
      yield { type: "settle", u, dist: best };    // the greedy commitment
      for (const { to, w } of adj.get(u)) {
        yield { type: "check", u, v: to };
        const alt = best + w;
        if (alt < dist.get(to)) {
          dist.set(to, alt);
          parent.set(to, u);
          yield { type: "relax", u, v: to, dist: alt };
        }
      }
    }
    yield { type: "done" };
    return { dist, parent };
  }

  /* ---------- Bellman-Ford (any weights; detects negative cycles) ---------- */

  function* bellmanFord(graph, start) {
    // Directed edge list — undirected graphs with negative edges are
    // degenerate for this algorithm, and the page says why.
    const edges = graph.edges.map((e) => ({ u: e.u, v: e.v, w: e.w ?? 1 }));
    if (!graph.directed) {
      for (const e of graph.edges) edges.push({ u: e.v, v: e.u, w: e.w ?? 1 });
    }
    const dist = new Map(graph.nodes.map((n) => [n.id, Infinity]));
    const parent = new Map();
    dist.set(start, 0);
    const n = graph.nodes.length;
    for (let round = 1; round < n; round++) {
      let changed = false;
      yield { type: "round", k: round };
      for (const { u, v, w } of edges) {
        if (dist.get(u) === Infinity) continue;
        yield { type: "check", u, v };
        const alt = dist.get(u) + w;
        if (alt < dist.get(v)) {
          dist.set(v, alt);
          parent.set(v, u);
          changed = true;
          yield { type: "relax", u, v, dist: alt };
        }
      }
      if (!changed) break;                        // early exit: already stable
    }
    for (const { u, v, w } of edges) {            // one more round: the tell
      if (dist.get(u) !== Infinity && dist.get(u) + w < dist.get(v)) {
        yield { type: "cycle", nodes: [u, v] };
        yield { type: "done", negativeCycle: true };
        return null;
      }
    }
    yield { type: "done", negativeCycle: false };
    return { dist, parent };
  }

  /* ---------- Floyd-Warshall (all-pairs shortest paths) ---------- */

  // The matrix-shaped one: n rounds, each asking "does going THROUGH k help
  // any pair?". Events: {type:'round', k}, {type:'check', u, v, via},
  // {type:'relax', u, v, dist} when a cell improves.
  function* floydWarshall(graph) {
    const ids = graph.nodes.map((n) => n.id);
    const dist = {};
    for (const i of ids) {
      dist[i] = {};
      for (const j of ids) dist[i][j] = i === j ? 0 : Infinity;
    }
    for (const e of graph.edges) {
      const w = e.w ?? 1;
      dist[e.u][e.v] = Math.min(dist[e.u][e.v], w);
      if (!graph.directed) dist[e.v][e.u] = Math.min(dist[e.v][e.u], w);
    }
    for (const k of ids) {
      yield { type: "round", k };
      for (const i of ids) {
        for (const j of ids) {
          if (i === j || dist[i][k] === Infinity || dist[k][j] === Infinity) continue;
          yield { type: "check", u: i, v: j, via: k };
          const alt = dist[i][k] + dist[k][j];
          if (alt < dist[i][j]) {
            dist[i][j] = alt;
            yield { type: "relax", u: i, v: j, dist: alt };
          }
        }
      }
    }
    yield { type: "done" };
    return dist;
  }

  /* ---------- minimum spanning tree ---------- */

  // Kruskal: sort edges, take each unless it closes a cycle — union-find's
  // starring role (unit 2's dsu, inlined without events for clarity here).
  function* kruskal(graph) {
    const ids = graph.nodes.map((n) => n.id);
    const index = new Map(ids.map((id, i) => [id, i]));
    const parent = ids.map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const edges = graph.edges.slice().sort((a, b) => (a.w ?? 1) - (b.w ?? 1));
    const tree = [];
    let total = 0;
    for (const e of edges) {
      yield { type: "check", u: e.u, v: e.v };
      const ru = find(index.get(e.u)), rv = find(index.get(e.v));
      if (ru === rv) {
        yield { type: "reject", u: e.u, v: e.v };  // would close a cycle
      } else {
        parent[ru] = rv;
        tree.push(e);
        total += e.w ?? 1;
        yield { type: "tree-edge", u: e.u, v: e.v };
      }
      if (tree.length === ids.length - 1) break;
    }
    yield { type: "done", total, edges: tree.length };
    return tree;
  }

  // Prim: grow one tree from a seed, always via the cheapest crossing edge.
  function* prim(graph, start) {
    const adj = adjacency(graph);
    const inTree = new Set([start]);
    yield { type: "visit", u: start };
    const tree = [];
    let total = 0;
    while (inTree.size < graph.nodes.length) {
      let best = null;
      for (const u of inTree) {                    // cheapest edge leaving the tree
        for (const { to, w } of adj.get(u)) {
          if (!inTree.has(to) && (!best || w < best.w)) best = { u, v: to, w };
        }
      }
      if (!best) break;                            // disconnected graph
      inTree.add(best.v);
      tree.push(best);
      total += best.w;
      yield { type: "tree-edge", u: best.u, v: best.v };
      yield { type: "visit", u: best.v };
    }
    yield { type: "done", total, edges: tree.length };
    return tree;
  }

  /* ---------- strongly connected components (Tarjan) ---------- */

  function* tarjanSCC(graph) {
    const adj = adjacency(graph);
    const index = new Map(), low = new Map(), onStack = new Set();
    const stack = [];
    let counter = 0, comp = 0;
    const sccs = [];

    function* strongConnect(u) {
      index.set(u, counter); low.set(u, counter); counter++;
      stack.push(u); onStack.add(u);
      yield { type: "visit", u };
      for (const { to } of adj.get(u)) {
        yield { type: "check", u, v: to };
        if (!index.has(to)) {
          yield { type: "discover", u: to, from: u };
          yield* strongConnect(to);
          low.set(u, Math.min(low.get(u), low.get(to)));
        } else if (onStack.has(to)) {
          low.set(u, Math.min(low.get(u), index.get(to)));
        }
      }
      if (low.get(u) === index.get(u)) {           // u roots an SCC
        comp++;
        const members = [];
        for (;;) {
          const w = stack.pop(); onStack.delete(w);
          members.push(w);
          if (w === u) break;
        }
        sccs.push(members);
        yield { type: "component", id: comp, n: members.length, nodes: members };
      }
    }

    for (const { id } of graph.nodes) {
      if (!index.has(id)) yield* strongConnect(id);
    }
    yield { type: "done", components: comp };
    return sccs;
  }

  /* ---------- max flow (Edmonds-Karp: BFS augmenting paths) ---------- */

  function* maxFlow(graph, source, sink) {
    // Residual capacities as nested maps; reverse edges start at 0.
    const cap = new Map();
    const ensure = (a, b) => {
      if (!cap.has(a)) cap.set(a, new Map());
      if (!cap.get(a).has(b)) cap.get(a).set(b, 0);
    };
    for (const e of graph.edges) {
      ensure(e.u, e.v); ensure(e.v, e.u);
      cap.get(e.u).set(e.v, cap.get(e.u).get(e.v) + (e.w ?? 1));
    }
    let flow = 0;
    for (;;) {
      // BFS for the shortest augmenting path in the residual graph
      const parent = new Map([[source, null]]);
      const queue = [source];
      while (queue.length && !parent.has(sink)) {
        const u = queue.shift();
        for (const [v, c] of (cap.get(u) || new Map())) {
          if (c > 0 && !parent.has(v)) {
            parent.set(v, u);
            queue.push(v);
            yield { type: "discover", u: v, from: u };
          }
        }
      }
      if (!parent.has(sink)) break;                // no path: done, min cut found
      const path = [];
      let bottleneck = Infinity;
      for (let v = sink; parent.get(v) !== null; v = parent.get(v)) {
        const u = parent.get(v);
        path.unshift([u, v]);
        bottleneck = Math.min(bottleneck, cap.get(u).get(v));
      }
      for (const [u, v] of path) {                 // push flow, open reverse edges
        cap.get(u).set(v, cap.get(u).get(v) - bottleneck);
        cap.get(v).set(u, cap.get(v).get(u) + bottleneck);
      }
      flow += bottleneck;
      yield { type: "flow", path, value: bottleneck, total: flow };
    }
    yield { type: "done", flow };
    return flow;
  }

  /* ---------- deterministic presets (seeded via AlgoRandom) ---------- */

  function preset(name) {
    const P = {
      // A small city map: nice for BFS/DFS/Dijkstra
      city: {
        directed: false,
        nodes: [
          { id: "A", x: 0.08, y: 0.30 }, { id: "B", x: 0.28, y: 0.12 },
          { id: "C", x: 0.30, y: 0.55 }, { id: "D", x: 0.52, y: 0.30 },
          { id: "E", x: 0.55, y: 0.75 }, { id: "F", x: 0.75, y: 0.15 },
          { id: "G", x: 0.78, y: 0.52 }, { id: "H", x: 0.93, y: 0.33 },
        ],
        edges: [
          { u: "A", v: "B", w: 4 }, { u: "A", v: "C", w: 2 },
          { u: "B", v: "D", w: 5 }, { u: "C", v: "D", w: 8 },
          { u: "C", v: "E", w: 10 }, { u: "D", v: "F", w: 6 },
          { u: "D", v: "G", w: 2 }, { u: "E", v: "G", w: 3 },
          { u: "F", v: "H", w: 1 }, { u: "G", v: "H", w: 7 },
          { u: "B", v: "F", w: 12 },
        ],
      },
      // A build-system DAG: for topological sort
      build: {
        directed: true,
        nodes: [
          { id: "util", x: 0.10, y: 0.50 }, { id: "log", x: 0.30, y: 0.20 },
          { id: "db", x: 0.32, y: 0.75 }, { id: "auth", x: 0.55, y: 0.45 },
          { id: "api", x: 0.75, y: 0.25 }, { id: "ui", x: 0.78, y: 0.70 },
          { id: "app", x: 0.93, y: 0.48 },
        ],
        edges: [
          { u: "util", v: "log" }, { u: "util", v: "db" },
          { u: "log", v: "auth" }, { u: "db", v: "auth" },
          { u: "auth", v: "api" }, { u: "auth", v: "ui" },
          { u: "api", v: "app" }, { u: "ui", v: "app" },
        ],
      },
      // Two clusters plus an isolate: for components
      islands: {
        directed: false,
        nodes: [
          { id: "1", x: 0.12, y: 0.25 }, { id: "2", x: 0.28, y: 0.12 },
          { id: "3", x: 0.25, y: 0.45 }, { id: "4", x: 0.42, y: 0.30 },
          { id: "5", x: 0.65, y: 0.65 }, { id: "6", x: 0.80, y: 0.50 },
          { id: "7", x: 0.85, y: 0.80 }, { id: "8", x: 0.55, y: 0.10 },
        ],
        edges: [
          { u: "1", v: "2" }, { u: "1", v: "3" }, { u: "2", v: "4" },
          { u: "3", v: "4" }, { u: "5", v: "6" }, { u: "5", v: "7" },
          { u: "6", v: "7" },
        ],
      },
      // Directed with cycles: for SCC
      services: {
        directed: true,
        nodes: [
          { id: "gw", x: 0.08, y: 0.40 }, { id: "usr", x: 0.32, y: 0.20 },
          { id: "ord", x: 0.35, y: 0.65 }, { id: "pay", x: 0.60, y: 0.75 },
          { id: "inv", x: 0.62, y: 0.35 }, { id: "ntf", x: 0.85, y: 0.20 },
          { id: "rpt", x: 0.90, y: 0.60 },
        ],
        edges: [
          { u: "gw", v: "usr" }, { u: "usr", v: "ord" }, { u: "ord", v: "pay" },
          { u: "pay", v: "ord" },                          // cycle: ord ⇄ pay
          { u: "ord", v: "inv" }, { u: "inv", v: "usr" },  // cycle: usr→ord→inv→usr
          { u: "inv", v: "ntf" }, { u: "pay", v: "rpt" },
        ],
      },
      // A flow network: source s, sink t
      pipes: {
        directed: true,
        nodes: [
          { id: "s", x: 0.06, y: 0.45 }, { id: "a", x: 0.32, y: 0.20 },
          { id: "b", x: 0.32, y: 0.72 }, { id: "c", x: 0.62, y: 0.20 },
          { id: "d", x: 0.62, y: 0.72 }, { id: "t", x: 0.92, y: 0.45 },
        ],
        edges: [
          { u: "s", v: "a", w: 10 }, { u: "s", v: "b", w: 8 },
          { u: "a", v: "c", w: 6 }, { u: "a", v: "d", w: 4 },
          { u: "b", v: "d", w: 9 }, { u: "c", v: "t", w: 8 },
          { u: "d", v: "t", w: 10 }, { u: "b", v: "a", w: 3 },
        ],
      },
    };
    // deep copy so callers can mutate freely
    return JSON.parse(JSON.stringify(P[name]));
  }

  window.AlgoGraphs = {
    adjacency,
    bfs, dfs, bfsPaths,
    topoSort, components, twoColor,
    dijkstra, bellmanFord, floydWarshall,
    kruskal, prim,
    tarjanSCC, maxFlow,
    preset,
  };
})();
