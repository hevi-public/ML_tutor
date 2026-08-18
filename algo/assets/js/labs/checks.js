/* Algorithms Tutor — the labs' grading vocabulary. This file is included in
   each lab's testSource (string-concatenated into the worker), so it must
   stay dependency-free and ES5-friendly-ish. It provides:

     CHECKS.isSorted(arr)             non-decreasing?
     CHECKS.sameMultiset(a, b)        same elements, any order? (no items
                                      invented or dropped — catches the
                                      classic "sorts by overwriting" bug)
     CHECKS.deepEqual(a, b)           structural equality
     CHECKS.countingArray(arr)        a proxied copy that counts reads/writes
                                      → { data, counts } — "your sort made
                                      ~n² reads" comes from here
     CHECKS.seededInts(n, lo, hi, s)  deterministic test inputs (mulberry32,
                                      same generator as the demos)
     CHECKS.adversarial(kind, n)      canonical nasty inputs: "sorted",
                                      "reverse", "equal", "sawtooth"

   Exposed on self as CHECKS inside the worker; also on window for pages
   that want to show the same fixtures. */
(function (scope) {
  "use strict";

  function isSorted(arr) {
    for (let i = 1; i < arr.length; i++) if (arr[i - 1] > arr[i]) return false;
    return true;
  }

  function sameMultiset(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const count = new Map();
    for (const x of a) count.set(x, (count.get(x) || 0) + 1);
    for (const x of b) {
      if (!count.has(x)) return false;
      const c = count.get(x) - 1;
      if (c === 0) count.delete(x); else count.set(x, c);
    }
    return count.size === 0;
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
    }
    if (a && b && typeof a === "object") {
      const ka = Object.keys(a), kb = Object.keys(b);
      return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
    }
    return false;
  }

  // A copy of arr whose reads and writes are counted via Proxy — the
  // instrument behind "what complexity did your code actually exhibit?".
  function countingArray(arr) {
    const counts = { reads: 0, writes: 0 };
    const data = new Proxy(arr.slice(), {
      get(target, prop, recv) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) counts.reads++;
        return Reflect.get(target, prop, recv);
      },
      set(target, prop, value, recv) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) counts.writes++;
        return Reflect.set(target, prop, value, recv);
      },
    });
    return { data, counts };
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededInts(n, lo, hi, seed) {
    const rand = mulberry32(seed);
    return Array.from({ length: n }, () => lo + Math.floor(rand() * (hi - lo + 1)));
  }

  function adversarial(kind, n) {
    const a = Array.from({ length: n }, (_, i) => i + 1);
    if (kind === "sorted") return a;
    if (kind === "reverse") return a.reverse();
    if (kind === "equal") return new Array(n).fill(7);
    if (kind === "sawtooth") return a.map((x, i) => (i % 2 ? x : n - x));
    return a;
  }

  scope.CHECKS = {
    isSorted, sameMultiset, deepEqual,
    countingArray, seededInts, adversarial,
  };
})(typeof self !== "undefined" ? self : window);
