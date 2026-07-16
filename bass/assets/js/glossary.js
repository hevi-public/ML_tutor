/* Bass Tutor — glossary engine. Same engine as the ML Tutor's glossary.js,
   pointed at the bass:root meta and bass/data/glossary.json. Two jobs:

   1. On content pages: any <dfn data-term="interval">interval</dfn> becomes
      clickable and opens a popover — plain-English line first, precise
      definition second (the site's plain-language rule applies to the
      glossary itself).

   2. On glossary.html: renders the full glossary from data/glossary.json into
      #glossary-app, grouped alphabetically, with a live filter box.

   Entries live in data/glossary.json, keyed by slug:
     { "interval": { "term", "plain", "definition", "also": [aliases],
                     "see": [slugs], "taughtIn": {href,title} } }

   Note: entries are fetched, so this needs an http server (npm run dev). Over
   file:// the terms degrade gracefully to plain text. */
(function () {
  "use strict";

  const metaEl = document.querySelector('meta[name="bass:root"]');
  const ROOT = metaEl ? metaEl.content : "./";

  let glossary = null;
  let dialog = null;

  async function load() {
    try {
      const res = await fetch(ROOT + "data/glossary.json");
      if (!res.ok) throw new Error(res.status);
      glossary = await res.json();
    } catch (err) {
      console.warn("glossary.js: could not load glossary.json —", err.message);
    }
  }

  /* ---------- Popovers on content pages ---------- */

  function buildDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "popover";
    dialog.innerHTML =
      '<h4></h4><p class="plain"></p><p class="means"></p><p class="see"></p>' +
      '<p class="close-hint">Click anywhere or press Esc to close</p>';
    dialog.addEventListener("click", (e) => {
      if (e.target.tagName !== "A") dialog.close();
    });
    document.body.appendChild(dialog);
  }

  function showTerm(slug) {
    const entry = glossary[slug];
    if (!entry || !dialog) return;
    dialog.querySelector("h4").textContent =
      entry.term + (entry.also ? ` (also: ${entry.also.join(", ")})` : "");
    dialog.querySelector(".plain").innerHTML = `<strong>${entry.plain}</strong>`;
    dialog.querySelector(".means").textContent = entry.definition;
    dialog.querySelector(".see").innerHTML =
      `<a href="${ROOT}glossary.html#${slug}">Full glossary entry →</a>`;
    dialog.showModal();
  }

  function wireTerms() {
    document.querySelectorAll("[data-term]").forEach((el) => {
      const slug = el.dataset.term;
      const entry = glossary[slug];
      if (!entry) {
        console.warn(`glossary.js: no entry for "${slug}"`);
        return;
      }
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.title = entry.plain;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        showTerm(slug);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          showTerm(slug);
        }
      });
    });
  }

  /* ---------- Full glossary page ---------- */

  function renderGlossaryPage(app) {
    const slugs = Object.keys(glossary).sort((a, b) =>
      glossary[a].term.localeCompare(glossary[b].term));

    const controls = document.createElement("div");
    controls.className = "glossary-controls";
    controls.innerHTML =
      `<input type="search" placeholder="Filter — try “groove”, “half step”, or a symbol like ♭"
              aria-label="Filter glossary entries">
       <p class="count"></p>`;
    app.appendChild(controls);
    const input = controls.querySelector("input");
    const count = controls.querySelector(".count");

    const list = document.createElement("div");
    app.appendChild(list);

    let currentLetter = "";
    const entryEls = slugs.map((slug) => {
      const e = glossary[slug];
      const letter = e.term[0].toUpperCase();
      if (letter !== currentLetter) {
        currentLetter = letter;
        const h = document.createElement("h2");
        h.className = "letter-head";
        h.textContent = letter;
        h.dataset.letter = letter;
        list.appendChild(h);
      }

      const art = document.createElement("article");
      art.className = "glossary-entry";
      art.id = slug;
      const also = e.also
        ? `<span class="aliases">also called: ${e.also.join(", ")}</span>` : "";
      const see = e.see?.length
        ? `<p class="see">See also: ${e.see
            .filter((s) => glossary[s])
            .map((s) => `<a href="#${s}">${glossary[s].term}</a>`)
            .join(" · ")}</p>` : "";
      const taught = e.taughtIn
        ? `<p class="see">Taught in: <a href="${ROOT}${e.taughtIn.href}">${e.taughtIn.title}</a></p>` : "";
      art.innerHTML =
        `<h3>${e.term} ${also}</h3>
         <p class="plain"><strong>${e.plain}</strong></p>
         <p>${e.definition}</p>
         ${see}${taught}`;
      list.appendChild(art);
      return { art, haystack: `${e.term} ${(e.also || []).join(" ")} ${e.plain} ${e.definition}`.toLowerCase() };
    });

    function applyFilter() {
      const q = input.value.trim().toLowerCase();
      let shown = 0;
      for (const { art, haystack } of entryEls) {
        const hit = !q || haystack.includes(q);
        art.hidden = !hit;
        if (hit) shown++;
      }
      list.querySelectorAll(".letter-head").forEach((h) => {
        let el = h.nextElementSibling, any = false;
        while (el && !el.classList.contains("letter-head")) {
          if (!el.hidden) any = true;
          el = el.nextElementSibling;
        }
        h.hidden = !any;
      });
      count.textContent = q ? `${shown} of ${entryEls.length} terms` : `${entryEls.length} terms`;
    }
    input.addEventListener("input", applyFilter);
    applyFilter();

    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const app = document.getElementById("glossary-app");
    if (!app && !document.querySelector("[data-term]")) return;
    await load();
    if (!glossary) {
      if (app) app.innerHTML =
        "<p>Couldn't load the glossary data. If you opened this file directly, " +
        "start the dev server instead: <code>npm run dev</code></p>";
      return;
    }
    buildDialog();
    wireTerms();
    if (app) renderGlossaryPage(app);
  });
})();
