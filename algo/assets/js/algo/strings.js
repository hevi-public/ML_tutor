/* Algorithms Tutor — string algorithms as steppable generators (unit 7).

   Events:
     {type:'align', s}              pattern slides to text position s
     {type:'compare', ti, pi, ok}   text[ti] vs pattern[pi]
     {type:'found', at}             full match starting at text index `at`
     {type:'shift', from, to, by}   the pattern jumps (KMP's whole point)
     {type:'fail', pi, val}         failure-function entry computed
     {type:'hash', s, h, match}     rolling hash at window s
     {type:'node', path, ch, made}  trie descent (made = node created)
     {type:'word', word}            trie word terminator set/hit
     {type:'rank', order}           suffix-array ordering snapshot */
(function () {
  "use strict";

  /* ---------- naive substring search ---------- */

  function* naiveSearch(text, pat) {
    const n = text.length, m = pat.length;
    const hits = [];
    for (let s = 0; s + m <= n; s++) {
      yield { type: "align", s };
      let ok = true;
      for (let i = 0; i < m; i++) {
        const match = text[s + i] === pat[i];
        yield { type: "compare", ti: s + i, pi: i, ok: match };
        if (!match) { ok = false; break; }
      }
      if (ok) { hits.push(s); yield { type: "found", at: s }; }
    }
    yield { type: "done", hits };
    return hits;
  }

  /* ---------- KMP ---------- */

  // failure[i] = length of the longest proper prefix of pat[0..i] that is
  // also a suffix of it — "where can the pattern pretend to restart?"
  function* buildFailure(pat) {
    const m = pat.length;
    const fail = new Array(m).fill(0);
    let k = 0;
    for (let i = 1; i < m; i++) {
      while (k > 0 && pat[i] !== pat[k]) {
        yield { type: "compare", ti: i, pi: k, ok: false };
        k = fail[k - 1];
      }
      if (pat[i] === pat[k]) {
        yield { type: "compare", ti: i, pi: k, ok: true };
        k++;
      }
      fail[i] = k;
      yield { type: "fail", pi: i, val: k };
    }
    yield { type: "done", fail };
    return fail;
  }

  function* kmpSearch(text, pat) {
    const fail = [];
    for (const e of buildFailure(pat)) if (e.type === "fail") fail[e.pi] = e.val;
    fail[-1] = 0;
    if (pat.length) fail[0] = fail[0] ?? 0;
    const hits = [];
    let k = 0;                                        // chars of pat matched
    for (let i = 0; i < text.length; i++) {
      while (k > 0 && text[i] !== pat[k]) {
        const jump = fail[k - 1];
        yield { type: "compare", ti: i, pi: k, ok: false };
        yield { type: "shift", from: i - k, to: i - jump, by: k - jump };
        k = jump;
      }
      const match = text[i] === pat[k];
      yield { type: "compare", ti: i, pi: k, ok: match };
      if (match) k++;
      if (k === pat.length) {
        hits.push(i - k + 1);
        yield { type: "found", at: i - k + 1 };
        k = fail[k - 1];
      }
    }
    yield { type: "done", hits };
    return hits;
  }

  /* ---------- Rabin-Karp (rolling hash) ---------- */

  const B = 256, MOD = 1000003;

  function* rabinKarp(text, pat) {
    const n = text.length, m = pat.length;
    if (m > n) { yield { type: "done", hits: [] }; return []; }
    let ph = 0, th = 0, pow = 1;
    for (let i = 0; i < m; i++) {
      ph = (ph * B + pat.charCodeAt(i)) % MOD;
      th = (th * B + text.charCodeAt(i)) % MOD;
      if (i < m - 1) pow = (pow * B) % MOD;
    }
    yield { type: "hash", s: -1, h: ph, pattern: true };
    const hits = [];
    for (let s = 0; s + m <= n; s++) {
      const candidate = th === ph;
      yield { type: "hash", s, h: th, match: candidate };
      if (candidate) {                                // hashes agree: verify
        let ok = true;
        for (let i = 0; i < m; i++) {
          const match = text[s + i] === pat[i];
          yield { type: "compare", ti: s + i, pi: i, ok: match };
          if (!match) { ok = false; break; }          // a spurious hit
        }
        if (ok) { hits.push(s); yield { type: "found", at: s }; }
      }
      if (s + m < n) {                                // roll: drop left, add right
        th = (th - text.charCodeAt(s) * pow % MOD + MOD * B) % MOD;
        th = (th * B + text.charCodeAt(s + m)) % MOD;
      }
    }
    yield { type: "done", hits };
    return hits;
  }

  /* ---------- tries ---------- */

  // Node: { children: {ch: node}, word: bool }
  const trieNode = () => ({ children: {}, word: false });

  function* trieInsert(root, word) {
    let node = root, path = "";
    for (const ch of word) {
      path += ch;
      const made = !node.children[ch];
      if (made) node.children[ch] = trieNode();
      node = node.children[ch];
      yield { type: "node", path, ch, made };
    }
    node.word = true;
    yield { type: "word", word };
    return root;
  }

  function* trieLookup(root, prefix) {
    let node = root, path = "";
    for (const ch of prefix) {
      path += ch;
      if (!node.children[ch]) {
        yield { type: "node", path, ch, made: false, miss: true };
        yield { type: "done", found: false, completions: [] };
        return null;
      }
      node = node.children[ch];
      yield { type: "node", path, ch, made: false };
    }
    // collect completions under this node (DFS, no events — instant)
    const completions = [];
    (function walk(n, suffix) {
      if (n.word) completions.push(prefix + suffix);
      for (const ch of Object.keys(n.children).sort())
        walk(n.children[ch], suffix + ch);
    })(node, "");
    yield { type: "done", found: true, completions };
    return completions;
  }

  /* ---------- suffix arrays ---------- */

  // Teaching-sized: sort suffix indexes by string compare, yielding the
  // evolving order. O(n² log n) — honest about it; the page narrates the
  // O(n log n) doubling construction.
  function* suffixArray(s) {
    const idx = Array.from({ length: s.length }, (_, i) => i);
    idx.sort((a, b) => (s.slice(a) < s.slice(b) ? -1 : 1));
    for (let k = 0; k < idx.length; k++) {
      yield { type: "rank", k, i: idx[k], suffix: s.slice(idx[k]) };
    }
    yield { type: "done", sa: idx.slice() };
    return idx;
  }

  window.AlgoStrings = {
    naiveSearch,
    buildFailure, kmpSearch,
    rabinKarp,
    trieNode, trieInsert, trieLookup,
    suffixArray,
  };
})();
