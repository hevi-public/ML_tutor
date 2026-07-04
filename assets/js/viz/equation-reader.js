/* ML Tutor — equation reader: step through an equation piece by piece,
   showing each piece rendered, how to say it aloud, and what it means.

   Markup:
     <div class="demo eq-reader">
       <div class="math equation">FULL LATEX (rendered by site.js)</div>
       <div class="reader-ui"></div>
       <script type="application/json" class="steps">
         [ { "latex": "\\hat{y}", "say": "y-hat", "means": "the prediction" }, … ]
       </script>
     </div> */
(function () {
  "use strict";

  function initReader(root) {
    const dataEl = root.querySelector("script.steps");
    const ui = root.querySelector(".reader-ui");
    if (!dataEl || !ui) return;

    let steps;
    try {
      steps = JSON.parse(dataEl.textContent);
    } catch (err) {
      console.warn("equation-reader: bad steps JSON", err);
      return;
    }

    let i = 0;
    ui.innerHTML =
      `<div class="step-box">
         <span class="step-piece"></span>
         <p class="step-say"></p>
         <p class="step-means"></p>
       </div>
       <div class="buttons">
         <button class="action secondary" type="button" data-nav="-1">← Previous piece</button>
         <span class="step-count"></span>
         <button class="action" type="button" data-nav="1">Next piece →</button>
       </div>`;

    const piece = ui.querySelector(".step-piece");
    const say = ui.querySelector(".step-say");
    const means = ui.querySelector(".step-means");
    const count = ui.querySelector(".step-count");
    const prevBtn = ui.querySelector('[data-nav="-1"]');
    const nextBtn = ui.querySelector('[data-nav="1"]');

    function show() {
      const s = steps[i];
      if (typeof katex !== "undefined") {
        katex.render(s.latex, piece, { throwOnError: false });
      } else {
        piece.textContent = s.latex;
      }
      say.innerHTML = `<strong>Say it:</strong> “${s.say}”`;
      means.innerHTML = `<strong>It means:</strong> ${s.means}`;
      count.textContent = `${i + 1} / ${steps.length}`;
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i === steps.length - 1;
    }

    prevBtn.addEventListener("click", () => { if (i > 0) { i--; show(); } });
    nextBtn.addEventListener("click", () => { if (i < steps.length - 1) { i++; show(); } });
    show();
  }

  document.addEventListener("DOMContentLoaded", () => {
    // site.js renders the full equation on DOMContentLoaded; queue behind it.
    setTimeout(() => document.querySelectorAll(".eq-reader").forEach(initReader), 0);
  });
})();
