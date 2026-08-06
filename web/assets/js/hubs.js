/* Web Dev Reference — the cross-cutting views.

   All four are generated from web/data/changes.json and web/data/links.json,
   which is the whole point: the deprecation ledger, the timeline, the migration
   index and the docs index cannot disagree with the topic pages, because none
   of them holds its own copy of the facts.

   Each renderer activates only if its mount element is on the page:
     [data-ledger]      deprecations.html
     [data-timeline]    timeline.html
     [data-migrations]  migrations.html
     [data-docs-index]  docs-index.html */
(function () {
  "use strict";

  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const code = (s) => `<code>${escapeHtml(s)}</code>`;

  function toolTag(tool) {
    return `<span class="tool-tag ${tool}">${escapeHtml(WebRef.toolLabel(tool))}</span>`;
  }

  function chip(id, link) {
    const cls = link.verified === "unverified" ? "doc-chip unverified" : "doc-chip";
    return `<a class="${cls}" href="${escapeHtml(link.url)}" data-doc="${escapeHtml(id)}" ` +
      `target="_blank" rel="noopener"><span class="kind">${escapeHtml(link.kind)}</span> ` +
      `${escapeHtml(link.title)}</a>`;
  }

  /* Link a change back to the page that explains it, once that page exists. */
  function pageLink(change, pagesBuilt) {
    const title = escapeHtml(change.title);
    if (!pagesBuilt.has(change.page)) return `<strong>${title}</strong>`;
    return `<a href="${WebRef.root}${escapeHtml(change.page)}#change-${escapeHtml(change.id)}">` +
      `<strong>${title}</strong></a>`;
  }

  /* Which section pages actually exist yet — the sections land milestone by
     milestone, so a ledger row must not link into a 404.

     Read from the generated search index rather than probed with HEAD requests:
     the index is built by crawling the real files, so it is already the
     authoritative list, and asking costs one cached fetch instead of a burst of
     404s in the console. */
  async function builtPages() {
    try {
      const index = await (await fetch(WebRef.root + "data/search-index.json")).json();
      return new Set(index.filter((e) => e.k === "page").map((e) => e.u));
    } catch {
      return new Set(); // no links rather than broken links
    }
  }

  /* ---------- shared filter bar ---------- */

  function buildFilters(mount, { tools, onChange, extra }) {
    const bar = document.createElement("div");
    bar.className = "filter-bar";

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Filter…";
    search.setAttribute("aria-label", "Filter this list");
    bar.appendChild(search);

    const toolSel = document.createElement("select");
    toolSel.setAttribute("aria-label", "Filter by tool");
    toolSel.innerHTML = `<option value="">All tools</option>` +
      tools.map((t) => `<option value="${t}">${escapeHtml(WebRef.toolLabel(t))}</option>`).join("");
    bar.appendChild(toolSel);

    let extraSel = null;
    if (extra) {
      extraSel = document.createElement("select");
      extraSel.setAttribute("aria-label", extra.label);
      extraSel.innerHTML = extra.options
        .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
      bar.appendChild(extraSel);
    }

    const fire = () => onChange({
      q: search.value.trim().toLowerCase(),
      tool: toolSel.value,
      extra: extraSel ? extraSel.value : "",
    });

    search.addEventListener("input", fire);
    toolSel.addEventListener("change", fire);
    extraSel?.addEventListener("change", fire);

    mount.appendChild(bar);
    return fire;
  }

  /* ---------- deprecation ledger ---------- */

  function renderLedger(mount, data, pagesBuilt) {
    const body = document.createElement("div");

    const matches = (c, f) => {
      if (f.tool && c.tool !== f.tool) return false;
      if (f.extra === "deprecated" && !c.deprecated && !c.removed) return false;
      if (f.extra === "removed" && !c.removed) return false;
      if (f.extra === "migratable" && !c.migration) return false;
      if (f.q) {
        const hay = `${c.title} ${c.now} ${c.was} ${c.why} ${c.migration || ""}`.toLowerCase();
        if (!hay.includes(f.q)) return false;
      }
      return true;
    };

    const draw = (f) => {
      const rows = data.changes.filter((c) => matches(c, f));
      if (!rows.length) {
        body.innerHTML = `<p class="empty-note">Nothing matches that filter.</p>`;
        return;
      }

      body.innerHTML = `<p style="font-size:.88rem;color:var(--text-soft)">
          Showing <strong>${rows.length}</strong> of ${data.changes.length} records.</p>
        <div class="table-scroll"><table class="cheat">
        <thead><tr>
          <th>What</th><th>Use now</th><th>Instead of</th>
          <th>Status</th><th>Automated migration</th>
        </tr></thead><tbody>` +
        rows.map((c) => {
          const status = [
            c.since ? `<span class="badge since" data-tool="${c.tool}" data-version="${c.since}" data-kind="since">since ${escapeHtml(c.since)}</span>` : "",
            c.deprecated ? `<span class="badge deprecated" data-tool="${c.tool}" data-version="${c.deprecated}" data-kind="deprecated">deprecated ${escapeHtml(c.deprecated)}</span>` : "",
            c.removed ? `<span class="badge removed" data-tool="${c.tool}" data-version="${c.removed}" data-kind="removed">removed ${escapeHtml(c.removed)}</span>` : "",
          ].filter(Boolean).join(" ");

          return `<tr>
            <td class="ledger-row-tool">${toolTag(c.tool)}<br>${pageLink(c, pagesBuilt)}</td>
            <td>${escapeHtml(c.now)}</td>
            <td>${escapeHtml(c.was || "—")}</td>
            <td>${status}</td>
            <td>${c.migration ? code(c.migration) : "<em>by hand</em>"}</td>
          </tr>`;
        }).join("") +
        `</tbody></table></div>`;

      document.dispatchEvent(new CustomEvent("webref:changes-rendered"));
    };

    const fire = buildFilters(mount, {
      tools: [...new Set(data.changes.map((c) => c.tool))],
      extra: {
        label: "Filter by status",
        options: [
          { value: "", label: "Everything" },
          { value: "deprecated", label: "Deprecated or removed" },
          { value: "removed", label: "Removed only" },
          { value: "migratable", label: "Has an automated migration" },
        ],
      },
      onChange: draw,
    });

    mount.appendChild(body);
    fire();
  }

  /* ---------- timeline ---------- */

  function renderTimeline(mount, data, pagesBuilt) {
    const body = document.createElement("div");

    // A change is placed at the earliest version it did anything in — usually
    // `since`, but a pure removal is placed at the removal.
    const placed = data.changes.map((c) => ({
      change: c,
      version: c.since || c.deprecated || c.removed,
    })).filter((p) => p.version);

    const releaseDate = (tool, version) => {
      const major = String(version).split(".")[0];
      return data.versions.tools[tool]?.releases
        .find((r) => r.v === major || r.v === version)?.date || null;
    };

    const draw = (f) => {
      const rows = placed.filter(({ change: c }) => {
        if (f.tool && c.tool !== f.tool) return false;
        if (f.q) {
          const hay = `${c.title} ${c.now} ${c.was} ${c.why}`.toLowerCase();
          if (!hay.includes(f.q)) return false;
        }
        return true;
      });

      if (!rows.length) {
        body.innerHTML = `<p class="empty-note">Nothing matches that filter.</p>`;
        return;
      }

      // Group by tool+version, newest release date first.
      const groups = new Map();
      for (const p of rows) {
        const key = `${p.change.tool}@${p.version}`;
        if (!groups.has(key)) {
          groups.set(key, {
            tool: p.change.tool, version: p.version,
            date: releaseDate(p.change.tool, p.version), items: [],
          });
        }
        groups.get(key).items.push(p.change);
      }

      const ordered = [...groups.values()].sort((a, b) => {
        if (a.date && b.date) return b.date.localeCompare(a.date);
        return b.version.localeCompare(a.version, undefined, { numeric: true });
      });

      body.innerHTML = ordered.map((g) => {
        const when = g.date
          ? new Date(g.date + "T00:00:00Z").toLocaleDateString(undefined,
              { year: "numeric", month: "long" })
          : "";
        return `<div class="timeline-version">
            ${toolTag(g.tool)}<h3>${escapeHtml(WebRef.toolLabel(g.tool))} ${escapeHtml(g.version)}</h3>
            <span class="date">${escapeHtml(when)}</span>
          </div>` +
          g.items.map((c) => `<div class="timeline-entry ${c.tool}">
            <h4>${pageLink(c, pagesBuilt)}</h4>
            <div class="swap"><strong>${escapeHtml(c.now)}</strong>` +
            (c.was ? `<span class="arrow">replaced</span><span class="was">${escapeHtml(c.was)}</span>` : "") +
            `</div>
            <p>${escapeHtml(c.why || "")}</p>
          </div>`).join("");
      }).join("");
    };

    const fire = buildFilters(mount, {
      tools: [...new Set(data.changes.map((c) => c.tool))],
      onChange: draw,
    });

    mount.appendChild(body);
    fire();
  }

  /* ---------- migrations ---------- */

  function renderMigrations(mount, data, pagesBuilt) {
    const withMigration = data.changes.filter((c) => c.migration);
    const byHand = data.changes.filter((c) => !c.migration && c.was);

    const rows = (list, note) => list.length
      ? `<div class="table-scroll"><table class="cheat">
          <thead><tr><th>Command</th><th>What it rewrites</th><th>Tool</th></tr></thead>
          <tbody>${list.map((c) => `<tr>
            <td>${c.migration ? code(c.migration) : `<em>${escapeHtml(note)}</em>`}</td>
            <td>${pageLink(c, pagesBuilt)}<br>
                <span style="font-size:.86rem;color:var(--text-soft)">
                  ${escapeHtml(c.was || "")} → ${escapeHtml(c.now)}</span></td>
            <td>${toolTag(c.tool)}</td>
          </tr>`).join("")}</tbody></table></div>`
      : `<p class="empty-note">None recorded yet.</p>`;

    mount.innerHTML =
      `<h2>Run by a schematic</h2>
       <p>These rewrite your source for you. Run them from a clean working tree —
       they edit files in place — and read the diff before committing.</p>
       ${rows(withMigration)}
       <h2>By hand</h2>
       <p>No schematic exists for these, either because the replacement is not a
       mechanical substitution or because the old form still works.</p>
       ${rows(byHand, "no schematic")}`;
  }

  /* ---------- docs index ---------- */

  function renderDocsIndex(mount, data) {
    const body = document.createElement("div");
    const entries = Object.entries(data.links);

    const draw = (f) => {
      const rows = entries.filter(([id, l]) => {
        if (f.tool && l.tool !== f.tool) return false;
        if (f.extra && l.kind !== f.extra) return false;
        if (f.q) {
          const hay = `${id} ${l.title} ${(l.tags || []).join(" ")} ${l.url}`.toLowerCase();
          if (!hay.includes(f.q)) return false;
        }
        return true;
      });

      if (!rows.length) {
        body.innerHTML = `<p class="empty-note">Nothing matches that filter.</p>`;
        return;
      }

      const byTool = new Map();
      for (const [id, l] of rows) {
        if (!byTool.has(l.tool)) byTool.set(l.tool, []);
        byTool.get(l.tool).push([id, l]);
      }

      body.innerHTML = `<p style="font-size:.88rem;color:var(--text-soft)">
          Showing <strong>${rows.length}</strong> of ${entries.length} links.</p>` +
        [...byTool.entries()].map(([tool, list]) =>
          `<h2>${escapeHtml(WebRef.toolLabel(tool))}</h2>
           <ul class="doc-links">${list.map(([id, l]) =>
             `<li>${chip(id, l)}</li>`).join("")}</ul>`).join("");
    };

    const kinds = [...new Set(entries.map(([, l]) => l.kind))];
    const fire = buildFilters(mount, {
      tools: [...new Set(entries.map(([, l]) => l.tool))],
      extra: {
        label: "Filter by kind",
        options: [{ value: "", label: "All kinds" }]
          .concat(kinds.map((k) => ({ value: k, label: k }))),
      },
      onChange: draw,
    });

    mount.appendChild(body);
    fire();
  }

  /* ---------- boot ---------- */

  document.addEventListener("DOMContentLoaded", async () => {
    const mounts = {
      ledger: document.querySelector("[data-ledger]"),
      timeline: document.querySelector("[data-timeline]"),
      migrations: document.querySelector("[data-migrations]"),
      docs: document.querySelector("[data-docs-index]"),
    };
    if (!Object.values(mounts).some(Boolean)) return;

    let data;
    try {
      data = await WebRef.data();
    } catch {
      for (const m of Object.values(mounts)) {
        if (m) m.innerHTML =
          `<p class="empty-note">This view is generated from the change ledger, which
           needs the local server — run <code>npm run dev:web</code>.</p>`;
      }
      return;
    }

    const pagesBuilt = await builtPages();

    if (mounts.ledger) { mounts.ledger.replaceChildren(); renderLedger(mounts.ledger, data, pagesBuilt); }
    if (mounts.timeline) { mounts.timeline.replaceChildren(); renderTimeline(mounts.timeline, data, pagesBuilt); }
    if (mounts.migrations) { mounts.migrations.replaceChildren(); renderMigrations(mounts.migrations, data, pagesBuilt); }
    if (mounts.docs) { mounts.docs.replaceChildren(); renderDocsIndex(mounts.docs, data); }
  });
})();
