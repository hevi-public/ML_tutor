/* ML Tutor — plain-language symbol support.

   A page declares its symbols once:

     <script type="application/json" class="symbols">
       { "w": { "name": "w — “weight”", "pron": "say: double-u",
                "means": "how much the input matters" }, ... }
     </script>

   Then:
   - <ul class="symbol-legend" data-symbols="ŷ,w,x,b"></ul> renders a chip row
     under an equation (one chip per symbol, click for details).
   - Any <span data-sym="w">w</span> in prose becomes clickable.
   - After KaTeX renders, matching glyphs inside equations become clickable too.
   All three open the same popover: name, pronunciation, what it stands for here. */
(function () {
  "use strict";

  let symbols = {};
  let dialog;

  function loadSymbols() {
    const el = document.querySelector('script.symbols[type="application/json"]');
    if (!el) return;
    try {
      symbols = JSON.parse(el.textContent);
    } catch (err) {
      console.warn("notation.js: bad symbols JSON", err);
    }
  }

  function buildDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "popover";
    dialog.innerHTML =
      '<h4></h4><p class="pron"></p><p class="means"></p>' +
      '<p class="close-hint">Click anywhere or press Esc to close</p>';
    dialog.addEventListener("click", () => dialog.close());
    document.body.appendChild(dialog);
  }

  function showSymbol(key) {
    const info = symbols[key];
    if (!info || !dialog) return;
    dialog.querySelector("h4").textContent = info.name || key;
    dialog.querySelector(".pron").textContent = info.pron || "";
    dialog.querySelector(".means").textContent = info.means || "";
    dialog.showModal();
  }

  function makeClickable(el, key) {
    const info = symbols[key];
    if (!info) return;
    el.dataset.sym = key;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.title = `${info.name}${info.pron ? " · " + info.pron : ""}`;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      showSymbol(key);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showSymbol(key);
      }
    });
  }

  function buildLegends() {
    document.querySelectorAll("ul.symbol-legend[data-symbols]").forEach((ul) => {
      ul.dataset.symbols.split(",").forEach((raw) => {
        const key = raw.trim();
        const info = symbols[key];
        if (!info) return;
        const li = document.createElement("li");
        li.innerHTML = `<span class="sym">${key}</span> — ${info.short || info.means || ""}`;
        makeClickable(li, key);
        ul.appendChild(li);
      });
    });
  }

  function wireProse() {
    document.querySelectorAll("[data-sym]").forEach((el) => {
      if (!el.closest("ul.symbol-legend")) makeClickable(el, el.dataset.sym);
    });
  }

  // Best-effort: tag matching glyphs inside KaTeX output. KaTeX emits one span
  // per atom (e.g. <span class="mord mathnormal">w</span>), so exact text
  // matches are safe. Glyphs inside accent constructions (ŷ) are skipped —
  // the bare letter there isn't the symbol it looks like.
  function wireKatex() {
    document.querySelectorAll(".katex-html span").forEach((span) => {
      if (span.children.length) return;
      if (span.closest(".accent")) return;
      const key = span.textContent.trim();
      if (key && symbols[key] && !span.dataset.sym) makeClickable(span, key);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadSymbols();
    if (!Object.keys(symbols).length) return;
    buildDialog();
    buildLegends();
    wireProse();
    // site.js renders KaTeX on DOMContentLoaded too; run after it settles.
    setTimeout(wireKatex, 0);
  });
})();
