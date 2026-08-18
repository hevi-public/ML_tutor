/* Algorithms Tutor — shared page behavior: theme toggle, header/breadcrumb
   injection, prev/next footer nav, keyboard shortcuts, KaTeX rendering.
   Adapted from the git tutor's site.js (same contract, "algo:" meta prefix)
   plus the ML tutor's renderMath — this course needs Θ-notation typeset
   properly, so pages that use math load KaTeX (see assets/page-template.html).

   Page contract (see assets/page-template.html):
     <meta name="algo:unit"  content="Foundations">
     <meta name="algo:root"  content="../">          relative path to algo/ root
     <meta name="algo:prev"  content="counting-steps.html|Counting steps">
     <meta name="algo:next"  content="recursion.html|Recursion">
     <meta name="algo:home"  content="index.html">   optional Home override
*/
(function () {
  "use strict";

  const meta = (name) => {
    const el = document.querySelector(`meta[name="algo:${name}"]`);
    return el ? el.content : "";
  };
  const ROOT = meta("root") || "./";

  const HOME = meta("home") || "index.html";

  /* ---------- Theme ---------- */

  const THEME_KEY = "algo-tutor:theme";
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
    brand.innerHTML = "Algo<span>Tutor</span>";
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
      ["map.html", "Map"],
      ["search.html", "Search"],
      ["glossary.html", "Glossary"],
      ["notation.html", "Notation"],
      ["flashcards.html", "Cards"],
    ]) {
      const a = document.createElement("a");
      a.className = "header-link";
      a.href = ROOT + href;
      a.textContent = label;
      header.appendChild(a);
    }

    // The sibling courses on this site
    for (const [href, label, title] of [
      ["../index.html", "ML ↗", "The machine-learning course on this site"],
      ["../git/index.html", "Git ↗", "The advanced-git course on this site"],
    ]) {
      const sister = document.createElement("a");
      sister.className = "header-link sister";
      sister.href = ROOT + href;
      sister.title = title;
      sister.textContent = label;
      header.appendChild(sister);
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
    });
  }

  /* ---------- Math (KaTeX) ---------- */

  // Renders every <span class="math"> (inline) and <div class="math">
  // (display) whose text content is LaTeX source. Pages that use math load
  // KaTeX themselves; on pages that don't, this is a no-op.
  function renderMath() {
    if (typeof katex === "undefined") return;
    document.querySelectorAll(".math").forEach((el) => {
      const src = el.textContent;
      try {
        katex.render(src, el, {
          displayMode: el.tagName === "DIV",
          throwOnError: false,
        });
      } catch (err) {
        console.warn("KaTeX failed on:", src, err);
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
      '<circle cx="50" cy="50" r="46" fill="#047857"/>' +
      '<text x="50" y="70" font-size="54" font-family="serif" font-style="italic" font-weight="700" fill="white" text-anchor="middle">Θ</text></svg>');
    document.head.appendChild(link);
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildHeader();
    buildPageNav();
    initKeys();
    renderMath();
    addFavicon();
  });
})();
