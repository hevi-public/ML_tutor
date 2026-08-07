/* Web Dev Reference — renders web/data/versions.json.

   One data file feeds two views, so the numbers can never disagree:
     [data-version-dash]   the landing page's "what's current" cards
     [data-version-table]  versions.html's release + support-window table

   Support status is computed from the dates in the data rather than stored, so
   a version silently ages out of support without anyone editing a field. */
(function () {
  "use strict";

  const ROOT = document.querySelector('meta[name="web:root"]')?.content || "./";
  const TODAY = new Date();

  const fmt = (iso) =>
    iso ? new Date(iso + "T00:00:00Z").toLocaleDateString(undefined,
      { year: "numeric", month: "short" }) : "—";

  /* Status is computed from whatever dates the release carries: past `eol` is
     out of support; past `activeUntil` (for tools with an active/LTS split,
     like Angular) is LTS; otherwise active. Tools with a single published
     clock (PostgreSQL, Spring Boot) carry only `eol`. */
  function statusOf(release) {
    if (!release.date) return { key: "future", label: "not released" };
    const eol = release.eol ? new Date(release.eol) : null;
    const activeUntil = release.activeUntil ? new Date(release.activeUntil) : null;
    if (eol && TODAY > eol) return { key: "eol", label: "out of support" };
    if (activeUntil && TODAY > activeUntil) return { key: "lts", label: "LTS" };
    return { key: "active", label: "active" };
  }

  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  /* ---------- landing dashboard ---------- */

  function renderDash(mount, data) {
    const list = el("ul", "version-grid");

    for (const [key, tool] of Object.entries(data.tools)) {
      if (key === "typescript") continue; // supporting cast, shown in the table
      const card = el("li", "version-card");
      card.appendChild(el("span", `tool-tag ${key}`, tool.name));

      const current = tool.releases.find((r) => r.v === tool.currentMajor);
      card.appendChild(el("strong", "num", tool.current));
      card.appendChild(el("span", "when",
        current?.date ? `released ${fmt(current.date)}` : "current"));

      if (current?.headline) {
        card.appendChild(el("p", null, current.headline));
      }
      list.appendChild(card);
    }

    mount.replaceChildren(list);
  }

  /* ---------- versions.html table ---------- */

  function renderTable(mount, data) {
    mount.replaceChildren(); // drop the "loading" placeholder

    for (const [key, tool] of Object.entries(data.tools)) {
      if (!tool.releases.length) continue;

      const head = el("h2", null, tool.name);
      head.id = key;
      mount.appendChild(head);

      const meta = el("p", null,
        `<strong>Current: ${tool.current}</strong> · ${tool.cadence}`);
      mount.appendChild(meta);
      mount.appendChild(el("p", null, tool.policy));

      // The Support column exists wherever the data carries a published
      // clock — not for a hardcoded list of tools.
      const hasWindows = tool.releases.some((r) => r.eol || r.activeUntil);

      const scroll = el("div", "table-scroll");
      const table = el("table", "cheat");
      table.innerHTML =
        "<thead><tr><th>Version</th><th>Released</th>" +
        (hasWindows ? "<th>Support</th>" : "") +
        "<th>What landed</th></tr></thead>";

      const tbody = el("tbody");
      for (const r of tool.releases) {
        const tr = el("tr");
        tr.appendChild(el("td", null, `<strong>${r.v}</strong>`));
        tr.appendChild(el("td", null,
          r.date ? fmt(r.date) : `<em>${r.prerelease || "unreleased"}</em>`));

        if (hasWindows) {
          const s = statusOf(r);
          tr.appendChild(el("td", null,
            `<span class="status ${s.key}">${s.label}</span>` +
            (r.eol ? `<br><small>ends ${fmt(r.eol)}</small>` : "")));
        }

        tr.appendChild(el("td", null, r.headline || ""));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      scroll.appendChild(table);
      mount.appendChild(scroll);
    }
  }

  /* ---------- boot ---------- */

  document.addEventListener("DOMContentLoaded", async () => {
    const dash = document.querySelector("[data-version-dash]");
    const table = document.querySelector("[data-version-table]");
    if (!dash && !table) return;

    let data;
    try {
      const res = await fetch(ROOT + "data/versions.json");
      data = await res.json();
    } catch {
      const msg = "Version data needs the local server — run <code>npm run dev:web</code>.";
      if (dash) dash.innerHTML = `<div class="box">${msg}</div>`;
      if (table) table.innerHTML = `<div class="box">${msg}</div>`;
      return;
    }

    if (dash) renderDash(dash, data);
    if (table) renderTable(table, data);

    document.querySelectorAll("[data-checked-on]").forEach((n) => {
      n.textContent = fmt(data.checkedOn);
    });
  });
})();
