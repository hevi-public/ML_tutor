/* Web Dev Reference — shared page behaviour: theme toggle, header/breadcrumb
   injection, prev/next nav, keyboard shortcuts, copy buttons on code blocks.
   Adapted from the ML Tutor's assets/js/site.js (same contract, "web:" meta
   prefix, no KaTeX — reference pages have code, not equations).

   Page contract (see web/assets/page-template.html):
     <meta name="web:section" content="Angular">
     <meta name="web:root"    content="../">        relative path to web/ root
     <meta name="web:prev"    content="di.html|Dependency injection">
     <meta name="web:next"    content="../02-rxjs/overview.html|RxJS overview">
     <meta name="web:versions" content="Angular 22.0.8 · TypeScript 7.0.2">
*/
(function () {
  "use strict";

  const meta = (name) => {
    const el = document.querySelector(`meta[name="web:${name}"]`);
    return el ? el.content : "";
  };
  const ROOT = meta("root") || "./";

  /* ---------- Theme ----------
     Own namespace, so the three tracks don't fight over one preference. */

  const THEME_KEY = "web-ref:theme";
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    } else {
      delete document.documentElement.dataset.theme; // follow the system
    }
  }
  applyTheme(localStorage.getItem(THEME_KEY));

  function cycleTheme() {
    const current = localStorage.getItem(THEME_KEY);
    const next = current === "dark" ? "light" : current === "light" ? null : "dark";
    if (next) localStorage.setItem(THEME_KEY, next);
    else localStorage.removeItem(THEME_KEY);
    applyTheme(next);
    updateThemeButton();
  }

  function themeLabel() {
    const t = localStorage.getItem(THEME_KEY);
    return t === "dark" ? "🌙 dark" : t === "light" ? "☀️ light" : "🖥 auto";
  }

  let themeButton;
  function updateThemeButton() {
    if (themeButton) themeButton.textContent = themeLabel();
  }

  /* ---------- Header ---------- */

  function buildHeader() {
    const header = document.createElement("header");
    header.className = "site-header";

    const brand = document.createElement("a");
    brand.className = "brand";
    brand.href = ROOT + "index.html";
    brand.innerHTML = "Web<span>Ref</span>";
    header.appendChild(brand);

    const crumb = document.createElement("nav");
    crumb.className = "breadcrumb";
    crumb.setAttribute("aria-label", "Breadcrumb");
    const section = meta("section");
    const title = document.querySelector("h1")?.textContent || document.title;
    crumb.innerHTML = section
      ? `<a href="${ROOT}index.html">Reference</a> › ${section} › ${title}`
      : `<a href="${ROOT}index.html">Reference</a> › ${title}`;
    header.appendChild(crumb);

    for (const [href, label] of [
      ["docs-index.html", "Docs"],
      ["deprecations.html", "Changes"],
      ["timeline.html", "Timeline"],
      ["search.html", "Search"],
    ]) {
      const a = document.createElement("a");
      a.className = "header-link";
      a.href = ROOT + href;
      a.textContent = label;
      header.appendChild(a);
    }

    themeButton = document.createElement("button");
    themeButton.type = "button";
    themeButton.className = "theme-toggle";
    themeButton.title = "Switch color theme (auto → dark → light)";
    themeButton.setAttribute("aria-label", "Switch color theme");
    themeButton.addEventListener("click", cycleTheme);
    header.appendChild(themeButton);
    updateThemeButton();

    document.body.prepend(header);
  }

  /* ---------- Prev / next nav ---------- */

  function parseNav(value) {
    if (!value) return null;
    const [href, label] = value.split("|");
    return { href, label: label || href };
  }

  function buildPageNav() {
    const prev = parseNav(meta("prev"));
    const next = parseNav(meta("next"));
    if (!prev && !next) return;

    const nav = document.createElement("nav");
    nav.className = "page-nav";
    nav.setAttribute("aria-label", "Previous and next page");

    if (prev) {
      const a = document.createElement("a");
      a.className = "prev";
      a.href = prev.href;
      a.rel = "prev";
      a.innerHTML = `<span class="dir">← Previous</span>${prev.label}`;
      nav.appendChild(a);
    }
    if (next) {
      const a = document.createElement("a");
      a.className = "next";
      a.href = next.href;
      a.rel = "next";
      a.innerHTML = `<span class="dir">Next →</span>${next.label}`;
      nav.appendChild(a);
    }
    document.querySelector("main")?.appendChild(nav);
  }

  /* ---------- "Written against" stamp ----------
     Every page records the versions its claims were checked against, so
     staleness is visible rather than silent. */

  function buildVersionStamp() {
    const versions = meta("versions");
    if (!versions) return;
    const p = document.createElement("p");
    p.className = "written-against";
    p.innerHTML = `Written against <strong>${versions}</strong>. ` +
      `Spot something out of date? The claim lives in ` +
      `<code>web/data/changes.json</code>.`;
    document.querySelector("main")?.appendChild(p);
  }

  /* ---------- Copy buttons on code blocks ---------- */

  function addCopyButtons() {
    document.querySelectorAll("main pre > code").forEach((code) => {
      const pre = code.parentElement;
      if (pre.parentElement?.classList.contains("code-wrap")) return;

      const wrap = document.createElement("div");
      wrap.className = "code-wrap";
      pre.replaceWith(wrap);
      wrap.appendChild(pre);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "copy";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      btn.addEventListener("click", async () => {
        // Strip diff markers so a copied diff is runnable code.
        const text = [...code.querySelectorAll(".del")].length
          ? [...code.childNodes]
              .filter((n) => !(n.classList && n.classList.contains("del")))
              .map((n) => n.textContent)
              .join("")
          : code.textContent;
        try {
          await navigator.clipboard.writeText(text.trim());
          btn.textContent = "copied";
          btn.classList.add("copied");
        } catch {
          btn.textContent = "press ⌘C";
        }
        setTimeout(() => {
          btn.textContent = "copy";
          btn.classList.remove("copied");
        }, 1600);
      });
      wrap.appendChild(btn);
    });
  }

  /* ---------- Keyboard shortcuts ---------- */

  function initKeys() {
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") document.querySelector(".page-nav .prev")?.click();
      if (e.key === "ArrowRight") document.querySelector(".page-nav .next")?.click();
      if (e.key === "/") {
        e.preventDefault();
        const onPage = document.getElementById("search-input");
        if (onPage) onPage.focus();
        else location.href = ROOT + "search.html";
      }
    });
  }

  /* ---------- Printing: unfold the collapsible layers ---------- */

  let openedForPrint = [];
  window.addEventListener("beforeprint", () => {
    openedForPrint = [...document.querySelectorAll("details:not([open])")];
    openedForPrint.forEach((d) => (d.open = true));
  });
  window.addEventListener("afterprint", () => {
    openedForPrint.forEach((d) => (d.open = false));
    openedForPrint = [];
  });

  /* ---------- Favicon ---------- */

  function addFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect width="100" height="100" rx="22" fill="#2563eb"/>' +
      '<text x="50" y="70" font-size="54" font-family="ui-monospace,Menlo,monospace" ' +
      'font-weight="700" fill="white" text-anchor="middle">&lt;/&gt;</text></svg>');
    document.head.appendChild(link);
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildHeader();
    buildPageNav();
    buildVersionStamp();
    addCopyButtons();
    initKeys();
    addFavicon();
  });

  // changes.js renders its now/was code samples after this file has run, and
  // those are the snippets most worth copying — so wire them up too. The
  // function skips anything already wrapped, so re-running it is free.
  document.addEventListener("webref:changes-rendered", addCopyButtons);
})();
