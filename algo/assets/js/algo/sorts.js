/* Algorithms Tutor — searching and sorting, as steppable generators.

   Every function here follows the site's one-implementation rule (PLAN.md §4):
   it IS the code shown on the page, the code the stepper animates, and the
   reference the labs race. Each yields typed step events and mutates (its copy
   of) the array in place, so a capture() closure over the same array snapshots
   the state the renderer draws.

   Event vocabulary used here:
     {type:'compare', i, j}        looked at a[i] vs a[j] (or a[i] vs target)
     {type:'swap', i, j}           exchanged two elements
     {type:'set', i, value}        wrote a value (merge sort's copy-back)
     {type:'focus', lo, hi, mid?}  the region the algorithm is considering
     {type:'found', i} / {type:'not-found'}   search verdicts
     {type:'sorted', i}            position i is in its final place */
(function () {
  "use strict";

  /* ---------- searching ---------- */

  function* linearSearch(a, target) {
    for (let i = 0; i < a.length; i++) {
      yield { type: "compare", i, j: -1 };
      if (a[i] === target) { yield { type: "found", i }; return i; }
    }
    yield { type: "not-found" };
    return -1;
  }

  // Requires a sorted array — the invariant is the subject of 03-sorting/binary-search.html
  function* binarySearch(a, target) {
    let lo = 0, hi = a.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      yield { type: "focus", lo, hi, mid };
      yield { type: "compare", i: mid, j: -1 };
      if (a[mid] === target) { yield { type: "found", i: mid }; return mid; }
      if (a[mid] < target) lo = mid + 1;
      else hi = mid - 1;
    }
    yield { type: "not-found" };
    return -1;
  }

  /* ---------- elementary sorts ---------- */

  function* bubbleSort(a) {
    for (let end = a.length - 1; end > 0; end--) {
      let swapped = false;
      for (let i = 0; i < end; i++) {
        yield { type: "compare", i, j: i + 1 };
        if (a[i] > a[i + 1]) {
          [a[i], a[i + 1]] = [a[i + 1], a[i]];
          swapped = true;
          yield { type: "swap", i, j: i + 1 };
        }
      }
      yield { type: "sorted", i: end };
      if (!swapped) break;
    }
  }

  function* selectionSort(a) {
    for (let i = 0; i < a.length - 1; i++) {
      let min = i;
      for (let j = i + 1; j < a.length; j++) {
        yield { type: "compare", i: min, j };
        if (a[j] < a[min]) min = j;
      }
      if (min !== i) {
        [a[i], a[min]] = [a[min], a[i]];
        yield { type: "swap", i, j: min };
      }
      yield { type: "sorted", i };
    }
  }

  function* insertionSort(a) {
    for (let i = 1; i < a.length; i++) {
      const value = a[i];
      let j = i - 1;
      while (j >= 0) {
        yield { type: "compare", i: j, j: i };
        if (a[j] <= value) break;
        a[j + 1] = a[j];
        yield { type: "set", i: j + 1, value: a[j] };
        j--;
      }
      a[j + 1] = value;
      yield { type: "set", i: j + 1, value };
    }
  }

  /* ---------- divide & conquer ---------- */

  function* mergeSort(a, lo = 0, hi = a.length - 1) {
    if (lo >= hi) return;
    const mid = (lo + hi) >> 1;
    yield { type: "focus", lo, hi, mid };
    yield* mergeSort(a, lo, mid);
    yield* mergeSort(a, mid + 1, hi);
    // merge a[lo..mid] and a[mid+1..hi]
    const left = a.slice(lo, mid + 1), right = a.slice(mid + 1, hi + 1);
    let i = 0, j = 0, k = lo;
    while (i < left.length && j < right.length) {
      yield { type: "compare", i: lo + i, j: mid + 1 + j };
      const takeLeft = left[i] <= right[j];
      a[k] = takeLeft ? left[i++] : right[j++];
      yield { type: "set", i: k, value: a[k] };
      k++;
    }
    while (i < left.length) { a[k] = left[i++]; yield { type: "set", i: k, value: a[k] }; k++; }
    while (j < right.length) { a[k] = right[j++]; yield { type: "set", i: k, value: a[k] }; k++; }
  }

  function* quickSort(a, lo = 0, hi = a.length - 1) {
    if (lo >= hi) { if (lo === hi) yield { type: "sorted", i: lo }; return; }
    yield { type: "focus", lo, hi };
    // Lomuto partition, last element as pivot — the pivot-strategy explorer on
    // the quicksort page swaps this line out and watches the worst case appear.
    const pivot = a[hi];
    let i = lo;
    for (let j = lo; j < hi; j++) {
      yield { type: "compare", i: j, j: hi };
      if (a[j] < pivot) {
        if (i !== j) { [a[i], a[j]] = [a[j], a[i]]; yield { type: "swap", i, j }; }
        i++;
      }
    }
    if (i !== hi) { [a[i], a[hi]] = [a[hi], a[i]]; yield { type: "swap", i, j: hi }; }
    yield { type: "sorted", i };
    yield* quickSort(a, lo, i - 1);
    yield* quickSort(a, i + 1, hi);
  }

  window.AlgoSorts = {
    linearSearch, binarySearch,
    bubbleSort, selectionSort, insertionSort,
    mergeSort, quickSort,
  };
})();
