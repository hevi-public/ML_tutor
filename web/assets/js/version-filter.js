/* Web Dev Reference — "which of this applies to me?"

   The reader sets the versions they are actually on, once, and every version
   badge on every page annotates itself against that:

     since Angular 22   on 19  →  "not yet — needs 22"     (dimmed)
     since Angular 16   on 19  →  "available"              (outlined green)
     removed in RxJS 8  on 7   →  "still present"
     deprecated in 7    on 7   →  "deprecated for you"     (outlined red)

   Stored in localStorage under web-ref:versions, so it follows you across pages.
   A control is injected into any [data-version-filter] mount; badges are
   annotated on every page regardless, so the setting is worth making once. */
(function () {
  "use strict";

  const KEY = "web-ref:versions";
  const TOOLS = ["angular", "rxjs", "vitest", "pnpm"];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { return {}; }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  /* Majors only — that is the granularity every badge is written at. */
  const major = (v) => parseInt(String(v).split(".")[0], 10);

  function annotate(state) {
    for (const badge of document.querySelectorAll(".badge[data-tool][data-version]")) {
      badge.querySelector(".vf")?.remove();
      badge.classList.remove("vf-ok", "vf-future", "vf-warn");

      const mine = state[badge.dataset.tool];
      if (!mine) continue;

      const theirs = major(badge.dataset.version);
      const yours = major(mine);
      if (Number.isNaN(theirs) || Number.isNaN(yours)) continue;

      // The badge already says the version, so the annotation must not repeat
      // it — it answers only "does this apply to me?". The full sentence lives
      // in the title attribute.
      let text = "", cls = "", title = "";
      const label = WebRef.toolLabel(badge.dataset.tool);
      switch (badge.dataset.kind) {
        case "since":
          if (yours >= theirs) { text = "✓ have"; cls = "vf-ok"; title = `Available on your ${label} ${mine}`; }
          else { text = "not yet"; cls = "vf-future"; title = `Not available until ${label} ${theirs} — you are on ${mine}`; }
          break;
        case "deprecated":
          if (yours >= theirs) { text = "⚠ for you"; cls = "vf-warn"; title = `Deprecated as of your ${label} ${mine}`; }
          else { text = "not yet"; cls = "vf-future"; title = `Not deprecated until ${label} ${theirs} — you are on ${mine}`; }
          break;
        case "removed":
          if (yours >= theirs) { text = "⚠ gone"; cls = "vf-warn"; title = `Removed in your ${label} ${mine} — this will not build`; }
          else { text = "still here"; cls = "vf-ok"; title = `Still present on ${label} ${mine}; removed in ${theirs}`; }
          break;
      }
      if (!text) continue;

      const span = document.createElement("span");
      span.className = "vf";
      span.textContent = text;
      badge.appendChild(span);
      badge.classList.add(cls);
      badge.title = title;
    }
  }

  function buildControl(mount, versions, state) {
    const bar = document.createElement("div");
    bar.className = "filter-bar";

    const label = document.createElement("label");
    label.textContent = "I'm on:";
    bar.appendChild(label);

    for (const tool of TOOLS) {
      const meta = versions.tools[tool];
      if (!meta) continue;

      const select = document.createElement("select");
      select.setAttribute("aria-label", `Your ${meta.name} version`);

      const any = document.createElement("option");
      any.value = "";
      any.textContent = `${meta.name} — any`;
      select.appendChild(any);

      for (const r of meta.releases) {
        if (!r.date) continue; // unreleased lines aren't a version you're "on"
        const opt = document.createElement("option");
        opt.value = r.v;
        opt.textContent = `${meta.name} ${r.v}`;
        if (state[tool] && major(state[tool]) === major(r.v)) opt.selected = true;
        select.appendChild(opt);
      }

      select.addEventListener("change", () => {
        const next = load();
        if (select.value) next[tool] = select.value;
        else delete next[tool];
        save(next);
        annotate(next);
      });

      bar.appendChild(select);
    }

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "action secondary";
    clear.textContent = "clear";
    clear.addEventListener("click", () => {
      save({});
      annotate({});
      bar.querySelectorAll("select").forEach((s) => (s.value = ""));
    });
    bar.appendChild(clear);

    mount.replaceChildren(bar);
  }

  async function boot() {
    const state = load();

    // Badges may be rendered by changes.js after this fires, so annotate both
    // now and whenever cards finish rendering.
    annotate(state);
    document.addEventListener("webref:changes-rendered", () => annotate(load()));

    const mount = document.querySelector("[data-version-filter]");
    if (!mount) return;
    try {
      const data = await WebRef.data();
      buildControl(mount, data.versions, state);
    } catch {
      mount.replaceChildren();
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
