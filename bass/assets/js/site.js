/* Bass Tutor — shared page behavior: theme toggle, header/breadcrumb injection,
   prev/next footer nav, keyboard shortcuts. Adapted from the ML Tutor's site.js
   (same contract, "bass:" meta prefix, no KaTeX — music pages don't need math).

   Page contract (see assets/page-template.html):
     <meta name="bass:unit"  content="Theory Core">
     <meta name="bass:root"  content="../">          relative path to bass/ root
     <meta name="bass:prev"  content="../02-fretboard/positions-and-fingering.html|Positions">
     <meta name="bass:next"  content="major-scale.html|The major scale">
     <meta name="bass:home"  content="reference.html">  optional Home override
*/
(function () {
  "use strict";

  const meta = (name) => {
    const el = document.querySelector(`meta[name="bass:${name}"]`);
    return el ? el.content : "";
  };
  const ROOT = meta("root") || "./";

  // Two versions share one site: the hands-on sessions (bass/index.html, the
  // default) and the reference course (bass/reference.html). Unit pages
  // (00…08 except the shared 07-labs) belong to the reference course, so
  // their Home is the reference landing; everything else Homes to the
  // sessions landing. <meta name="bass:home"> overrides per page if needed.
  const IN_REFERENCE = /\/(0[0-6]|08)-[a-z-]+\//.test(location.pathname) ||
    /\/reference\.html$/.test(location.pathname);
  const HOME = meta("home") || (IN_REFERENCE ? "reference.html" : "index.html");

  /* ---------- Theme ---------- */

  const THEME_KEY = "bass-tutor:theme";
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    } else {
      delete document.documentElement.dataset.theme; // follow the system
    }
  }
  applyTheme(localStorage.getItem(THEME_KEY));

  function cycleTheme() {
    // system -> dark -> light -> system
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
    brand.href = ROOT + HOME;
    brand.innerHTML = "Bass<span>Tutor</span>";
    header.appendChild(brand);

    const crumb = document.createElement("nav");
    crumb.className = "breadcrumb";
    crumb.setAttribute("aria-label", "Breadcrumb");
    const unit = meta("unit");
    const title = document.querySelector("h1")?.textContent || document.title;
    crumb.innerHTML = unit
      ? `<a href="${ROOT}${HOME}">Home</a> › ${unit} › ${title}`
      : `<a href="${ROOT}${HOME}">Home</a> › ${title}`;
    header.appendChild(crumb);

    for (const [href, label] of [
      ["glossary.html", "Glossary"],
      ["notation.html", "Symbols"],
      ["map.html", "Map"],
      ["search.html", "Search"],
    ]) {
      const a = document.createElement("a");
      a.className = "header-link";
      a.href = ROOT + href;
      a.textContent = label;
      header.appendChild(a);
    }

    // The other version of this course (sessions ⇄ reference)
    const version = document.createElement("a");
    version.className = "header-link version";
    if (IN_REFERENCE) {
      version.href = ROOT + "index.html";
      version.textContent = "Sessions";
      version.title = "The hands-on version: guided practice sessions, bass in hand";
    } else {
      version.href = ROOT + "reference.html";
      version.textContent = "Reference";
      version.title = "The reference course: every topic in full depth";
    }
    header.appendChild(version);

    // The sibling course living at the repo root
    const sister = document.createElement("a");
    sister.className = "header-link sister";
    sister.href = ROOT + "../index.html";
    sister.title = "The machine-learning course on this site";
    sister.textContent = "ML ↗";
    header.appendChild(sister);

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

  /* ---------- Prev / next footer nav ---------- */

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

  /* ---------- Favicon (shared, injected — no per-page markup) ---------- */

  function addFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="46" fill="#b7500e"/>' +
      '<text x="50" y="72" font-size="58" font-family="sans-serif" font-weight="700" fill="white" text-anchor="middle">♪</text></svg>');
    document.head.appendChild(link);
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildHeader();
    buildPageNav();
    initKeys();
    addFavicon();
  });
})();
