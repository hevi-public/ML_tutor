/* Web Dev Reference — the one data loader.

   changes.js, docs.js, version-filter.js and search.js all need the same three
   JSON files. Loading them here once, behind a cached promise, means a page with
   twelve change cards still makes one request per file.

   window.WebRef.data() -> Promise<{ changes, changeById, links, versions }> */
(function () {
  "use strict";

  const ROOT = document.querySelector('meta[name="web:root"]')?.content || "./";

  let cached = null;

  async function loadAll() {
    const [changesDoc, linksDoc, versionsDoc] = await Promise.all([
      fetch(ROOT + "data/changes.json").then((r) => r.json()),
      fetch(ROOT + "data/links.json").then((r) => r.json()),
      fetch(ROOT + "data/versions.json").then((r) => r.json()),
    ]);

    const changeById = new Map(changesDoc.changes.map((c) => [c.id, c]));

    return {
      changes: changesDoc.changes,
      changeById,
      links: linksDoc.links,
      sites: linksDoc.sites,
      versions: versionsDoc,
    };
  }

  const TOOL_LABEL = {
    angular: "Angular", rxjs: "RxJS", vitest: "Vitest",
    pnpm: "pnpm", typescript: "TypeScript",
  };

  window.WebRef = {
    root: ROOT,

    data() {
      if (!cached) cached = loadAll();
      return cached;
    },

    toolLabel(tool) {
      return TOOL_LABEL[tool] || tool;
    },

    /* A <span class="tool-tag angular">Angular</span> for any tool id. */
    toolTag(tool) {
      const span = document.createElement("span");
      span.className = `tool-tag ${tool}`;
      span.textContent = TOOL_LABEL[tool] || tool;
      return span;
    },

    /* Version badges for a change record: since / deprecated / removed.
       Text reads as the tool would say it — "Angular 16", "RxJS 7". */
    badgesFor(change) {
      const out = [];
      const label = TOOL_LABEL[change.tool] || change.tool;
      const add = (kind, version, prefix) => {
        if (!version) return;
        const b = document.createElement("span");
        b.className = `badge ${kind}`;
        b.dataset.tool = change.tool;
        b.dataset.version = version;
        b.dataset.kind = kind;
        b.textContent = `${prefix} ${label} ${version}`;
        out.push(b);
      };
      add("since", change.since, "since");
      add("deprecated", change.deprecated, "deprecated in");
      add("removed", change.removed, "removed in");
      return out;
    },

    /* An official-doc chip. Keeps the real href in the markup so the link works
       without JS and in print; check-links.js verifies href and registry agree. */
    docChip(id, link) {
      const a = document.createElement("a");
      a.className = "doc-chip" + (link.verified === "unverified" ? " unverified" : "");
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.dataset.doc = id;
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = link.kind;
      a.appendChild(kind);
      a.appendChild(document.createTextNode(" " + link.title));
      return a;
    },

    /* Minimal line diff (LCS) — enough for the now/was unified view. */
    diffLines(oldText, newText) {
      const a = (oldText || "").split("\n");
      const b = (newText || "").split("\n");
      const n = a.length, m = b.length;

      // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:]
      const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          lcs[i][j] = a[i] === b[j]
            ? lcs[i + 1][j + 1] + 1
            : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
      }

      const out = [];
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (a[i] === b[j]) { out.push({ type: "same", text: a[i] }); i++; j++; }
        else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ type: "del", text: a[i] }); i++; }
        else { out.push({ type: "add", text: b[j] }); j++; }
      }
      while (i < n) out.push({ type: "del", text: a[i++] });
      while (j < m) out.push({ type: "add", text: b[j++] });
      return out;
    },
  };
})();
