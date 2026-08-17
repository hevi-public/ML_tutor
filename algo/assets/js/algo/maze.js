/* Algorithms Tutor — implicit graphs: mazes and grids (units 4–5, labs).

   The teaching point of this module is what it DOESN'T contain: no node
   list, no edge list. A cell's neighbors are computed on demand — the graph
   exists only as a rule, which is how game maps, puzzle states and crawl
   frontiers work in practice.

   Maze model: { w, h, walls: Set("x,y"), start: [x,y], goal: [x,y] }
   Events reuse the graph vocabulary with u = "x,y" cell keys, plus
   {type:'path', cells} when the goal is reached. */
(function () {
  "use strict";

  const key = (x, y) => x + "," + y;

  // Seeded random maze: carve a perfect maze (recursive backtracker), then
  // knock out a few extra walls so multiple routes exist (better for A* vs
  // BFS comparisons).
  function generate(w, h, seed, extraOpenings = Math.floor(w * h / 12)) {
    const rand = window.AlgoRandom.rng(seed);
    const walls = new Set();
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) walls.add(key(x, y));
    const carve = (x, y) => walls.delete(key(x, y));
    const stack = [[1, 1]];
    carve(1, 1);
    const DIRS = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const options = DIRS
        .map(([dx, dy]) => [x + dx, y + dy, x + dx / 2, y + dy / 2])
        .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && walls.has(key(nx, ny)));
      if (!options.length) { stack.pop(); continue; }
      const [nx, ny, mx, my] = options[Math.floor(rand() * options.length)];
      carve(mx, my); carve(nx, ny);
      stack.push([nx, ny]);
    }
    let knocked = 0;
    while (knocked < extraOpenings) {
      const x = 1 + Math.floor(rand() * (w - 2));
      const y = 1 + Math.floor(rand() * (h - 2));
      if (walls.has(key(x, y))) { walls.delete(key(x, y)); knocked++; }
    }
    return { w, h, walls, start: [1, 1], goal: [w - 2, h - 2] };
  }

  // THE implicit-graph move: neighbors are computed, never stored.
  function neighbors(maze, x, y) {
    const out = [];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < maze.w && ny < maze.h && !maze.walls.has(key(nx, ny)))
        out.push([nx, ny]);
    }
    return out;
  }

  function reconstruct(parent, endKey) {
    const cells = [];
    for (let k = endKey; k; k = parent.get(k)) cells.unshift(k);
    return cells;
  }

  function* gridBfs(maze) {
    const startK = key(...maze.start), goalK = key(...maze.goal);
    const parent = new Map([[startK, null]]);
    const queue = [maze.start];
    yield { type: "discover", u: startK, from: null };
    while (queue.length) {
      const [x, y] = queue.shift();
      const uK = key(x, y);
      yield { type: "visit", u: uK };
      if (uK === goalK) {
        const cells = reconstruct(parent, goalK);
        yield { type: "path", cells };
        yield { type: "done", length: cells.length - 1 };
        return cells;
      }
      for (const [nx, ny] of neighbors(maze, x, y)) {
        const vK = key(nx, ny);
        if (!parent.has(vK)) {
          parent.set(vK, uK);
          queue.push([nx, ny]);
          yield { type: "discover", u: vK, from: uK };
        }
      }
    }
    yield { type: "done", length: -1 };
    return null;
  }

  // A* on the same maze: identical loop, but the frontier is ordered by
  // g (steps so far) + h (Manhattan distance to the goal). h admissible ⇒
  // the found path is provably shortest.
  function* gridAstar(maze, weight = 1) {
    const [gx, gy] = maze.goal;
    const hDist = (x, y) => (Math.abs(gx - x) + Math.abs(gy - y)) * weight;
    const startK = key(...maze.start), goalK = key(...maze.goal);
    const parent = new Map([[startK, null]]);
    const g = new Map([[startK, 0]]);
    const open = [[maze.start, hDist(...maze.start)]];
    yield { type: "discover", u: startK, from: null };
    while (open.length) {
      let bi = 0;                                  // extract-min on f = g+h
      for (let i = 1; i < open.length; i++) if (open[i][1] < open[bi][1]) bi = i;
      const [x, y] = open.splice(bi, 1)[0][0];
      const uK = key(x, y);
      yield { type: "visit", u: uK };
      if (uK === goalK) {
        const cells = reconstruct(parent, goalK);
        yield { type: "path", cells };
        yield { type: "done", length: cells.length - 1 };
        return cells;
      }
      for (const [nx, ny] of neighbors(maze, x, y)) {
        const vK = key(nx, ny);
        const alt = g.get(uK) + 1;
        if (!g.has(vK) || alt < g.get(vK)) {
          g.set(vK, alt);
          parent.set(vK, uK);
          open.push([[nx, ny], alt + hDist(nx, ny)]);
          yield { type: "discover", u: vK, from: uK };
        }
      }
    }
    yield { type: "done", length: -1 };
    return null;
  }

  window.AlgoMaze = { generate, neighbors, gridBfs, gridAstar, key };
})();
