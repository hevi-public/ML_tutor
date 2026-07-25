/* Git Tutor — three-way file merge.  window.GTMerge

   Cherry-pick, revert and rebase are all "apply the difference this commit made,
   somewhere else". Doing that honestly needs a three-way merge: compare the
   commit's parent (the base) against both the commit (theirs) and where you're
   applying it (ours). isomorphic-git keeps its merge driver internal, so this
   module provides one — line-based diff3, the same shape of output git writes,
   conflict markers included.

   Everything here is line-oriented, like git's default text merge. Binary files
   are not something this tutor's fixtures contain.                          */
(function (root) {
  "use strict";

  /* ---------- longest common subsequence ----------
     Fixture files are tens of lines, so the plain O(n·m) table is the right
     trade: obvious to read, fast enough to run on every keystroke. */

  function lcsPairs(a, b) {
    const n = a.length;
    const m = b.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i][j] = a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    const pairs = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        pairs.push([i, j]);
        i++;
        j++;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        i++;
      } else {
        j++;
      }
    }
    return pairs;
  }

  /** Regions where `other` departs from `base`, as
      {baseStart, baseEnd, otherStart, otherEnd} half-open ranges. */
  function changedRegions(base, other) {
    const pairs = lcsPairs(base, other);
    const regions = [];
    let bi = 0;
    let oi = 0;
    for (const [pb, po] of pairs) {
      if (pb > bi || po > oi) {
        regions.push({ baseStart: bi, baseEnd: pb, otherStart: oi, otherEnd: po });
      }
      bi = pb + 1;
      oi = po + 1;
    }
    if (bi < base.length || oi < other.length) {
      regions.push({
        baseStart: bi, baseEnd: base.length, otherStart: oi, otherEnd: other.length,
      });
    }
    return regions;
  }

  const sameLines = (a, b) => a.length === b.length && a.every((l, i) => l === b[i]);

  /* ---------- diff3 ---------- */

  /** Merge two sets of edits to the same base.
      Returns { lines, conflicts } — conflicts counts the regions where both
      sides changed the same lines differently. */
  function mergeLines(baseLines, ourLines, theirLines, labels = {}) {
    const ourRegions = changedRegions(baseLines, ourLines);
    const theirRegions = changedRegions(baseLines, theirLines);

    const ourLabel = labels.ours || "HEAD";
    const theirLabel = labels.theirs || "incoming";

    const out = [];
    let conflicts = 0;
    let basePos = 0;
    let oi = 0;
    let ti = 0;

    while (oi < ourRegions.length || ti < theirRegions.length) {
      const o = ourRegions[oi];
      const t = theirRegions[ti];

      // Only one side has edits left, or the next edits don't touch each other.
      if (!t || (o && o.baseEnd <= t.baseStart)) {
        out.push(...baseLines.slice(basePos, o.baseStart));
        out.push(...ourLines.slice(o.otherStart, o.otherEnd));
        basePos = o.baseEnd;
        oi++;
        continue;
      }
      if (!o || t.baseEnd <= o.baseStart) {
        out.push(...baseLines.slice(basePos, t.baseStart));
        out.push(...theirLines.slice(t.otherStart, t.otherEnd));
        basePos = t.baseEnd;
        ti++;
        continue;
      }

      // The two sides overlap. Grow the window until neither side has an edit
      // crossing its edge, so a conflict is reported as one region.
      let start = Math.min(o.baseStart, t.baseStart);
      let end = Math.max(o.baseEnd, t.baseEnd);
      let oEnd = oi;
      let tEnd = ti;
      let grew = true;
      while (grew) {
        grew = false;
        while (oEnd + 1 < ourRegions.length && ourRegions[oEnd + 1].baseStart <= end) {
          oEnd++;
          end = Math.max(end, ourRegions[oEnd].baseEnd);
          grew = true;
        }
        while (tEnd + 1 < theirRegions.length && theirRegions[tEnd + 1].baseStart <= end) {
          tEnd++;
          end = Math.max(end, theirRegions[tEnd].baseEnd);
          grew = true;
        }
      }

      // Reconstruct what each side says about base[start, end).
      const ourSide = rebuild(baseLines, ourLines, ourRegions.slice(oi, oEnd + 1), start, end);
      const theirSide = rebuild(baseLines, theirLines, theirRegions.slice(ti, tEnd + 1), start, end);

      out.push(...baseLines.slice(basePos, start));
      if (sameLines(ourSide, theirSide)) {
        // Both sides made the same edit — git takes it once, no conflict.
        out.push(...ourSide);
      } else {
        conflicts++;
        out.push(`<<<<<<< ${ourLabel}`);
        out.push(...ourSide);
        out.push("=======");
        out.push(...theirSide);
        out.push(`>>>>>>> ${theirLabel}`);
      }
      basePos = end;
      oi = oEnd + 1;
      ti = tEnd + 1;
    }

    out.push(...baseLines.slice(basePos));
    return { lines: out, conflicts };
  }

  /** One side's version of base[start, end), given that side's edit regions. */
  function rebuild(baseLines, otherLines, regions, start, end) {
    const out = [];
    let pos = start;
    for (const r of regions) {
      out.push(...baseLines.slice(pos, Math.max(start, r.baseStart)));
      out.push(...otherLines.slice(r.otherStart, r.otherEnd));
      pos = Math.max(pos, r.baseEnd);
    }
    out.push(...baseLines.slice(pos, end));
    return out;
  }

  const splitLines = (text) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

  /** Merge three file versions given as strings.
      Returns { text, conflicts }. */
  function mergeText(base, ours, theirs, labels) {
    if (ours === theirs) return { text: ours, conflicts: 0 };
    if (base === ours) return { text: theirs, conflicts: 0 };
    if (base === theirs) return { text: ours, conflicts: 0 };
    const result = mergeLines(
      splitLines(base || ""), splitLines(ours || ""), splitLines(theirs || ""), labels);
    return {
      text: result.lines.length ? result.lines.join("\n") + "\n" : "",
      conflicts: result.conflicts,
    };
  }

  /* ---------- unified diff, for `git show` / `git diff` output ---------- */

  function unifiedDiff(oldText, newText, options = {}) {
    const a = splitLines(oldText || "");
    const b = splitLines(newText || "");
    const context = options.context === undefined ? 3 : options.context;
    const pairs = lcsPairs(a, b);

    // Mark which lines survive; everything else is a - or a +.
    const keptA = new Set(pairs.map(([i]) => i));
    const keptB = new Set(pairs.map(([, j]) => j));

    const ops = [];
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j] && keptA.has(i) && keptB.has(j)) {
        ops.push({ kind: " ", text: a[i] });
        i++;
        j++;
      } else if (i < a.length && !keptA.has(i)) {
        ops.push({ kind: "-", text: a[i] });
        i++;
      } else if (j < b.length && !keptB.has(j)) {
        ops.push({ kind: "+", text: b[j] });
        j++;
      } else if (i < a.length) {
        ops.push({ kind: " ", text: a[i] });
        i++;
        j++;
      } else {
        ops.push({ kind: "+", text: b[j] });
        j++;
      }
    }

    // Group into hunks with `context` unchanged lines around each change.
    const changed = ops.map((op) => op.kind !== " ");
    const keep = new Array(ops.length).fill(false);
    ops.forEach((_, idx) => {
      if (!changed[idx]) return;
      for (let k = Math.max(0, idx - context); k <= Math.min(ops.length - 1, idx + context); k++) {
        keep[k] = true;
      }
    });

    const hunks = [];
    let cur = null;
    let oldLine = 1;
    let newLine = 1;
    ops.forEach((op, idx) => {
      const startOld = oldLine;
      const startNew = newLine;
      if (keep[idx]) {
        if (!cur) cur = { oldStart: startOld, newStart: startNew, oldCount: 0, newCount: 0, lines: [] };
        cur.lines.push(op.kind + op.text);
        if (op.kind !== "+") cur.oldCount++;
        if (op.kind !== "-") cur.newCount++;
      } else if (cur) {
        hunks.push(cur);
        cur = null;
      }
      if (op.kind !== "+") oldLine++;
      if (op.kind !== "-") newLine++;
    });
    if (cur) hunks.push(cur);

    if (!hunks.length) return "";
    const path = options.path || "file";
    const head = [
      `diff --git a/${path} b/${path}`,
      options.oldMissing ? "new file mode 100644" : null,
      options.newMissing ? "deleted file mode 100644" : null,
      `--- ${options.oldMissing ? "/dev/null" : "a/" + path}`,
      `+++ ${options.newMissing ? "/dev/null" : "b/" + path}`,
    ].filter(Boolean);
    const body = hunks.map((h) =>
      [`@@ -${h.oldStart},${h.oldCount} +${h.newStart},${h.newCount} @@`, ...h.lines].join("\n"));
    return head.concat(body).join("\n") + "\n";
  }

  /** Does `text` contain the pickaxe string? Used by log -S (counts of
      occurrences differing between parent and child) and log -G (regex). */
  function countOccurrences(text, needle) {
    if (!text || !needle) return 0;
    let count = 0;
    let from = 0;
    for (;;) {
      const at = text.indexOf(needle, from);
      if (at === -1) return count;
      count++;
      from = at + needle.length;
    }
  }

  root.GTMerge = {
    mergeText,
    mergeLines,
    unifiedDiff,
    changedRegions,
    lcsPairs,
    splitLines,
    countOccurrences,
  };
})(typeof window === "undefined" ? globalThis : window);
