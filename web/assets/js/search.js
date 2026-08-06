/* Web Dev Reference — search over one index, three kinds of result.

     k:"page"    a reference page (or a glossary term / alias)
     k:"change"  a now/was record, deep-linked to its card on the page
     k:"doc"     an official documentation link, opened off-site

   The point of folding docs into the same box is that "httpResource" should
   either explain itself here or send you straight to angular.dev without you
   having to decide which of two search boxes to use. Searching a retired API
   ("toPromise", "destroy$", "retryWhen") hits the change record that names its
   replacement, which is the single most useful thing this index does. */
(function () {
  "use strict";

  const ROOT = document.querySelector('meta[name="web:root"]')?.content || "./";

  const GROUPS = [
    { k: "page", label: "On this site" },
    { k: "change", label: "What changed" },
    { k: "doc", label: "Official docs" },
  ];

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  document.addEventListener("DOMContentLoaded", async () => {
    const input = document.getElementById("search-input");
    const resultsEl = document.getElementById("search-results");
    const countEl = document.getElementById("search-count");
    if (!input || !resultsEl) return;

    let index;
    try {
      index = await (await fetch(ROOT + "data/search-index.json")).json();
    } catch {
      resultsEl.innerHTML =
        "<p>Couldn't load the search index — start the dev server: <code>npm run dev:web</code>, " +
        "and run <code>npm run build:web</code> if you have edited pages.</p>";
      return;
    }

    for (const e of index) {
      e._t = e.t.toLowerCase();
      e._h = (e.h || []).join(" ").toLowerCase();
      e._b = (e.b || "").toLowerCase();
    }

    /* People type "unsubscribe" and the record is titled "Unsubscribing", so a
       plain substring test misses it. Stripping a common suffix down to a stem
       of at least four characters closes that gap without pulling in a real
       stemmer: unsubscribe → unsubscrib ← unsubscribing. */
    function variants(term) {
      const out = [term];
      const stem = term.replace(/(ing|ed|es|s|e)$/, "");
      if (stem.length >= 4 && stem !== term) out.push(stem);
      return out;
    }

    function search(q) {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];

      const scored = [];
      for (const e of index) {
        let score = 0, ok = true;

        for (const term of terms) {
          const forms = variants(term);
          // An exact form scores higher than a stem match, so "signal" still
          // beats "signals" on a page about signals.
          const hit = (hay) => {
            if (hay.includes(forms[0])) return 1;
            return forms.length > 1 && hay.includes(forms[1]) ? 0.6 : 0;
          };

          const inT = hit(e._t), inH = hit(e._h), inB = hit(e._b);
          if (!inT && !inH && !inB) { ok = false; break; }

          score += e._t === term ? 12 : inT * 5;
          score += inH * 3;
          score += inB * 1;
        }

        if (!ok) continue;
        // A change record is usually the better answer for an API-shaped query:
        // it names the replacement rather than merely mentioning the old name.
        if (e.k === "change") score += 1.5;
        scored.push({ e, score });
      }
      return scored.sort((a, b) => b.score - a.score);
    }

    function excerpt(e, q) {
      const term = q.toLowerCase().split(/\s+/)[0];
      const i = e._b.indexOf(term);
      if (i < 0) return e.b.slice(0, 150) + (e.b.length > 150 ? "…" : "");
      const start = Math.max(0, i - 60);
      return (start ? "…" : "") + e.b.slice(start, i + 100) + "…";
    }

    function badgesFor(e) {
      const out = [];
      if (e.tool) out.push(`<span class="tool-tag ${e.tool}">${escapeHtml(e.tool)}</span>`);
      if (e.k === "change") {
        if (e.since) out.push(`<span class="badge since">since ${escapeHtml(e.since)}</span>`);
        if (e.removed) out.push(`<span class="badge removed">removed ${escapeHtml(e.removed)}</span>`);
        else if (e.deprecated) out.push(`<span class="badge deprecated">deprecated ${escapeHtml(e.deprecated)}</span>`);
      }
      if (e.k === "doc" && e.kind) out.push(`<span class="badge">${escapeHtml(e.kind)}</span>`);
      return out.join(" ");
    }

    function href(e) {
      return e.k === "doc" ? e.u : ROOT + e.u;
    }

    function render() {
      const q = input.value.trim();
      if (!q) {
        resultsEl.innerHTML = "";
        countEl.textContent = "";
        return;
      }

      const hits = search(q);
      countEl.textContent = `${hits.length} result${hits.length === 1 ? "" : "s"}`;

      if (!hits.length) {
        resultsEl.innerHTML =
          `<p>Nothing for “${escapeHtml(q)}”. Try the API name rather than the concept — ` +
          `the index knows old names too, so <code>toPromise</code> or <code>*ngIf</code> ` +
          `will find what replaced them.</p>`;
        return;
      }

      // Groups stay grouped — that is what makes results scannable — but the
      // group holding the best hit leads. Otherwise a passing mention on a page
      // buries the change record that actually answers the query.
      const ordered = GROUPS
        .map((g) => ({ ...g, best: hits.find(({ e }) => e.k === g.k)?.score ?? -1 }))
        .filter((g) => g.best >= 0)
        .sort((a, b) => b.best - a.best);

      let html = "";
      for (const group of ordered) {
        const inGroup = hits.filter(({ e }) => e.k === group.k).slice(0, 12);
        if (!inGroup.length) continue;

        html += `<section class="results-group">
          <h3>${group.label} <span class="n">${inGroup.length}</span></h3>`;

        for (const { e } of inGroup) {
          const external = e.k === "doc" ? ' target="_blank" rel="noopener"' : "";
          html += `<article class="result ${e.k}">
            <h4><a href="${escapeHtml(href(e))}"${external}>${escapeHtml(e.t)}</a></h4>
            <p class="meta">${badgesFor(e)}<span class="where">${escapeHtml(e.unit || "")}</span></p>
            <p class="snip">${escapeHtml(excerpt(e, q))}</p>
          </article>`;
        }
        html += "</section>";
      }
      resultsEl.innerHTML = html;
    }

    input.addEventListener("input", render);

    // Arriving from the header link or the "/" shortcut on another page.
    const preset = new URLSearchParams(location.search).get("q");
    if (preset) {
      input.value = preset;
      render();
    }
    input.focus();
  });
})();
