/* Algorithms Tutor — design strategies as steppable generators (unit 6).

   Greedy, dynamic programming and backtracking demos. Event vocabulary adds:
     {type:'call', frame, args}      entering a recursive call
     {type:'return', frame, value}   leaving it
     {type:'hit', key}               memo cache answered instead of recursing
     {type:'cell', i, j?, val, ...}  a DP table cell got its final value
     {type:'trace', cells}           the traceback path through the table
     {type:'take'|'skip', ...}       greedy/backtracking decisions
     {type:'place'|'unplace', ...}   backtracking moves
     {type:'merge', a, b, node}      Huffman tree merges */
(function () {
  "use strict";

  /* ---------- fib: the one-slide argument for memoization ---------- */

  function* fibNaive(n, depth = 0) {
    yield { type: "call", frame: "fib(" + n + ")", n, depth };
    if (n <= 1) {
      yield { type: "return", frame: "fib(" + n + ")", value: n, depth };
      return n;
    }
    const a = yield* fibNaive(n - 1, depth + 1);
    const b = yield* fibNaive(n - 2, depth + 1);
    yield { type: "return", frame: "fib(" + n + ")", value: a + b, depth };
    return a + b;
  }

  function* fibMemo(n, memo = new Map(), depth = 0) {
    yield { type: "call", frame: "fib(" + n + ")", n, depth };
    if (memo.has(n)) {
      yield { type: "hit", key: n, value: memo.get(n), depth };
      yield { type: "return", frame: "fib(" + n + ")", value: memo.get(n), depth };
      return memo.get(n);
    }
    let result;
    if (n <= 1) result = n;
    else {
      const a = yield* fibMemo(n - 1, memo, depth + 1);
      const b = yield* fibMemo(n - 2, memo, depth + 1);
      result = a + b;
    }
    memo.set(n, result);
    yield { type: "cell", i: n, val: result };       // the table filling in
    yield { type: "return", frame: "fib(" + n + ")", value: result, depth };
    return result;
  }

  /* ---------- greedy: interval scheduling (earliest finish first) ---------- */

  // intervals: [{id, start, end}] — returns the accepted set.
  function* intervalScheduling(intervals) {
    const sorted = intervals.slice().sort((a, b) => a.end - b.end);
    yield { type: "sorted", order: sorted.map((iv) => iv.id) };
    const accepted = [];
    let lastEnd = -Infinity;
    for (const iv of sorted) {
      yield { type: "check", id: iv.id, start: iv.start, end: iv.end };
      if (iv.start >= lastEnd) {
        accepted.push(iv);
        lastEnd = iv.end;
        yield { type: "take", id: iv.id };
      } else {
        yield { type: "skip", id: iv.id, conflict: true };
      }
    }
    yield { type: "done", count: accepted.length };
    return accepted;
  }

  /* ---------- Huffman coding ---------- */

  // freqs: [{ch, f}] — returns the tree root {ch?, f, left?, right?}.
  function* huffman(freqs) {
    let forest = freqs.map((x) => ({ ch: x.ch, f: x.f }));
    let id = 0;
    while (forest.length > 1) {
      forest.sort((a, b) => a.f - b.f);
      const a = forest.shift(), b = forest.shift();
      const node = { id: "n" + (id++), f: a.f + b.f, left: a, right: b };
      forest.push(node);
      yield { type: "merge", a, b, node, remaining: forest.length };
    }
    yield { type: "done", root: forest[0] };
    return forest[0];
  }

  // Walk a Huffman tree into {ch: code} — plain helper, no events.
  function huffmanCodes(root) {
    const codes = {};
    (function walk(node, prefix) {
      if (!node) return;
      if (node.ch !== undefined) { codes[node.ch] = prefix || "0"; return; }
      walk(node.left, prefix + "0");
      walk(node.right, prefix + "1");
    })(root, "");
    return codes;
  }

  /* ---------- DP on sequences ---------- */

  // Longest increasing subsequence, O(n²) table version.
  function* lis(arr) {
    const n = arr.length;
    const len = new Array(n).fill(1);
    const prev = new Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) {
        yield { type: "check", i, j };
        if (arr[j] < arr[i] && len[j] + 1 > len[i]) {
          len[i] = len[j] + 1;
          prev[i] = j;
          yield { type: "cell", i, val: len[i], from: j };
        }
      }
      yield { type: "cell", i, val: len[i], final: true };
    }
    let best = 0;
    for (let i = 1; i < n; i++) if (len[i] > len[best]) best = i;
    const chain = [];
    for (let i = best; i >= 0; i = prev[i]) { chain.unshift(i); if (prev[i] === -1) break; }
    yield { type: "trace", cells: chain };
    yield { type: "done", length: len[best], chain };
    return { length: len[best], chain };
  }

  // Edit distance (Levenshtein) with traceback.
  function* editDistance(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) { d[i][0] = i; yield { type: "cell", i, j: 0, val: i }; }
    for (let j = 1; j <= n; j++) { d[0][j] = j; yield { type: "cell", i: 0, j, val: j }; }
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        yield { type: "cell", i, j, val: d[i][j], match: cost === 0 };
      }
    }
    // traceback: walk arrows home from (m, n)
    const cells = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      cells.unshift([i, j]);
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { i--; j--; }
      else if (i > 0 && d[i][j] === d[i - 1][j] + 1) i--;
      else j--;
    }
    cells.unshift([0, 0]);
    yield { type: "trace", cells };
    yield { type: "done", distance: d[m][n] };
    return d[m][n];
  }

  /* ---------- 0/1 knapsack ---------- */

  // items: [{id, w, v}], capacity W. Table d[i][c] = best value using first
  // i items within capacity c.
  function* knapsack(items, W) {
    const n = items.length;
    const d = Array.from({ length: n + 1 }, () => new Array(W + 1).fill(0));
    for (let i = 1; i <= n; i++) {
      const { w, v } = items[i - 1];
      for (let c = 0; c <= W; c++) {
        d[i][c] = d[i - 1][c];                        // skip item i
        let took = false;
        if (w <= c && d[i - 1][c - w] + v > d[i][c]) {
          d[i][c] = d[i - 1][c - w] + v;              // take item i
          took = true;
        }
        yield { type: "cell", i, j: c, val: d[i][c], took };
      }
    }
    // traceback: which items made the total
    const chosen = [];
    let c = W;
    for (let i = n; i > 0; i--) {
      if (d[i][c] !== d[i - 1][c]) { chosen.unshift(items[i - 1].id); c -= items[i - 1].w; }
    }
    yield { type: "done", best: d[n][W], chosen };
    return { best: d[n][W], chosen };
  }

  /* ---------- backtracking: N-Queens ---------- */

  function* nQueens(n) {
    const cols = [];                                  // cols[r] = column of queen in row r
    let solutions = 0, firstSolution = null;
    function* place(row) {
      if (row === n) {
        solutions++;
        if (!firstSolution) firstSolution = cols.slice();
        yield { type: "solution", cols: cols.slice(), count: solutions };
        return;
      }
      for (let c = 0; c < n; c++) {
        const ok = cols.every((qc, qr) => qc !== c && Math.abs(qc - c) !== row - qr);
        yield { type: "check", row, col: c, ok };
        if (!ok) { yield { type: "reject", row, col: c }; continue; }
        cols.push(c);
        yield { type: "place", row, col: c, cols: cols.slice() };
        yield* place(row + 1);
        cols.pop();
        yield { type: "unplace", row, col: c, cols: cols.slice() };
      }
    }
    yield* place(0);
    yield { type: "done", solutions, first: firstSolution };
    return { solutions, first: firstSolution };
  }

  window.AlgoDP = {
    fibNaive, fibMemo,
    intervalScheduling,
    huffman, huffmanCodes,
    lis, editDistance, knapsack,
    nQueens,
  };
})();
