/* Bass Tutor — plain-language symbol support. Same engine as the ML Tutor's
   notation.js, minus the KaTeX wiring (music pages carry no rendered math);
   here the "symbols" are music notation: ♭, ♯, 𝄢, P5, ii, Δ7, chord symbols…

   A page declares its symbols once:

     <script type="application/json" class="symbols">
       { "♭": { "name": "♭ — flat", "pron": "say: flat",
                "means": "lower the note by one fret (a half step)" }, ... }
     </script>

   Then:
   - <ul class="symbol-legend" data-symbols="♭,♯,P5"></ul> renders a chip row
     (one chip per symbol, click for details).
   - Any <span data-sym="♭">♭</span> in prose becomes clickable.
   Both open the same popover: name, pronunciation, what it stands for here. */
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

  document.addEventListener("DOMContentLoaded", () => {
    loadSymbols();
    if (!Object.keys(symbols).length) return;
    buildDialog();
    buildLegends();
    wireProse();
  });
})();
