/* Algorithms Tutor — data structures as steppable generators (unit 2).

   Same one-implementation rule as sorts.js: these ARE the taught code, the
   animation source, and the lab references. Each structure keeps its state in
   a plain object the page's capture() closure can snapshot cheaply.

   Event vocabulary added here:
     {type:'hash', key, h}            hashed a key to a slot index
     {type:'probe', slot}             looked at a slot (open addressing)
     {type:'place', slot, key}        stored a key
     {type:'chain-walk', slot, k}     walked a chain link (chaining)
     {type:'visit', id}               looked at a tree/DSU node
     {type:'insert', id, parent, dir} attached a new tree node
     {type:'compress', node, to}      union-find path compression re-pointing
     {type:'union', a, b}             merged two sets
     plus compare/swap on the heap's backing array (array.js renders those) */
(function () {
  "use strict";

  /* ---------- hash table ---------- */

  // Deliberately simple string hash (djb2-ish) — the hash-tables page shows
  // its arithmetic live, digit by digit.
  function hashString(key, buckets) {
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
    return h % buckets;
  }

  // Chaining table: state = { buckets: [ [key,…], … ] }
  function* chainInsert(state, key) {
    const h = hashString(key, state.buckets.length);
    yield { type: "hash", key, h };
    const chain = state.buckets[h];
    for (let k = 0; k < chain.length; k++) {
      yield { type: "chain-walk", slot: h, k };
      if (chain[k] === key) return false; // already present
    }
    chain.push(key);
    yield { type: "place", slot: h, key };
    return true;
  }

  // Open addressing (linear probing): state = { slots: [key|null, …] }
  function* probeInsert(state, key) {
    const n = state.slots.length;
    const h = hashString(key, n);
    yield { type: "hash", key, h };
    for (let d = 0; d < n; d++) {
      const slot = (h + d) % n;
      yield { type: "probe", slot };
      if (state.slots[slot] === key) return false;
      if (state.slots[slot] == null) {
        state.slots[slot] = key;
        yield { type: "place", slot, key };
        return true;
      }
    }
    yield { type: "full" };
    return false;
  }

  /* ---------- binary search tree ---------- */

  // state = { nodes: { id: {value,left,right} }, root, nextId }
  function* bstInsert(state, value) {
    const id = state.nextId++;
    state.nodes[id] = { value, left: null, right: null };
    if (state.root == null) {
      state.root = id;
      yield { type: "insert", id, parent: null, dir: "root" };
      return id;
    }
    let cur = state.root;
    for (;;) {
      yield { type: "visit", id: cur };
      const dir = value < state.nodes[cur].value ? "left" : "right";
      const next = state.nodes[cur][dir];
      if (next == null) {
        state.nodes[cur][dir] = id;
        yield { type: "insert", id, parent: cur, dir };
        return id;
      }
      cur = next;
    }
  }

  function* bstSearch(state, value) {
    let cur = state.root;
    while (cur != null) {
      yield { type: "visit", id: cur };
      const v = state.nodes[cur].value;
      if (v === value) { yield { type: "found", id: cur }; return cur; }
      cur = value < v ? state.nodes[cur].left : state.nodes[cur].right;
    }
    yield { type: "not-found" };
    return null;
  }

  /* ---------- AVL tree (BST + forced balance) ---------- */

  // Same state shape as the BST, plus per-node height. Insert walks down like
  // bstInsert, then walks back up rebalancing: any node whose subtrees differ
  // in height by more than 1 gets rotated. Events add:
  //   {type:'rotate', pivot, dir}   a single rotation around pivot
  function avlHeight(state, id) { return id == null ? 0 : state.nodes[id].h; }
  function avlUpdate(state, id) {
    const n = state.nodes[id];
    n.h = 1 + Math.max(avlHeight(state, n.left), avlHeight(state, n.right));
  }

  function avlRotate(state, id, dir) {           // dir: "left" | "right"
    const other = dir === "left" ? "right" : "left";
    const n = state.nodes[id];
    const pivot = n[other];                      // child rising to the top
    const p = state.nodes[pivot];
    n[other] = p[dir];
    p[dir] = id;
    avlUpdate(state, id);
    avlUpdate(state, pivot);
    return pivot;                                // new subtree root
  }

  function* avlInsertAt(state, cur, value, newId) {
    if (cur == null) {
      yield { type: "insert", id: newId, parent: null, dir: "leaf" };
      return newId;
    }
    yield { type: "visit", id: cur };
    const node = state.nodes[cur];
    const dir = value < node.value ? "left" : "right";
    node[dir] = yield* avlInsertAt(state, node[dir], value, newId);
    avlUpdate(state, cur);

    const balance = avlHeight(state, node.left) - avlHeight(state, node.right);
    if (balance > 1) {                           // left-heavy
      const l = state.nodes[node.left];
      if (avlHeight(state, l.left) < avlHeight(state, l.right)) {
        node.left = avlRotate(state, node.left, "left");
        yield { type: "rotate", pivot: node.left, dir: "left" };
      }
      const newRoot = avlRotate(state, cur, "right");
      yield { type: "rotate", pivot: newRoot, dir: "right" };
      return newRoot;
    }
    if (balance < -1) {                          // right-heavy
      const r = state.nodes[node.right];
      if (avlHeight(state, r.right) < avlHeight(state, r.left)) {
        node.right = avlRotate(state, node.right, "right");
        yield { type: "rotate", pivot: node.right, dir: "right" };
      }
      const newRoot = avlRotate(state, cur, "left");
      yield { type: "rotate", pivot: newRoot, dir: "left" };
      return newRoot;
    }
    return cur;
  }

  function* avlInsert(state, value) {
    const id = state.nextId++;
    state.nodes[id] = { value, left: null, right: null, h: 1 };
    state.root = yield* avlInsertAt(state, state.root, value, id);
    return id;
  }

  /* ---------- binary heap (array-backed, min-heap) ---------- */

  function* heapPush(a, value) {
    a.push(value);
    let i = a.length - 1;
    yield { type: "set", i, value };
    while (i > 0) {                       // sift up
      const parent = (i - 1) >> 1;
      yield { type: "compare", i, j: parent };
      if (a[i] >= a[parent]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      yield { type: "swap", i, j: parent };
      i = parent;
    }
  }

  function* heapPop(a) {
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      yield { type: "set", i: 0, value: last };
      let i = 0;                          // sift down
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let smallest = i;
        if (l < a.length) {
          yield { type: "compare", i: l, j: smallest };
          if (a[l] < a[smallest]) smallest = l;
        }
        if (r < a.length) {
          yield { type: "compare", i: r, j: smallest };
          if (a[r] < a[smallest]) smallest = r;
        }
        if (smallest === i) break;
        [a[i], a[smallest]] = [a[smallest], a[i]];
        yield { type: "swap", i, j: smallest };
        i = smallest;
      }
    }
    yield { type: "popped", value: top };
    return top;
  }

  /* ---------- union-find (disjoint sets) ---------- */

  // state = { parent: [ … ] } — parent[i] === i means i is a root
  function* dsuFind(state, x) {
    const path = [];
    let root = x;
    for (;;) {
      yield { type: "visit", id: root };
      if (state.parent[root] === root) break;
      path.push(root);
      root = state.parent[root];
    }
    for (const node of path) {            // path compression
      if (state.parent[node] !== root) {
        state.parent[node] = root;
        yield { type: "compress", node, to: root };
      }
    }
    return root;
  }

  function* dsuUnion(state, a, b) {
    const ra = yield* dsuFind(state, a);
    const rb = yield* dsuFind(state, b);
    if (ra !== rb) {
      state.parent[ra] = rb;              // (rank/size union taught as a layer)
      yield { type: "union", a: ra, b: rb };
      return true;
    }
    yield { type: "same-set", a, b };
    return false;
  }

  window.AlgoStructures = {
    hashString,
    chainInsert, probeInsert,
    bstInsert, bstSearch,
    avlInsert,
    heapPush, heapPop,
    dsuFind, dsuUnion,
  };
})();
