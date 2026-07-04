/* ML Tutor — attention explorer: click any word in a sentence and see how
   much it "looks at" every other word. Weights are hand-authored to mirror
   what trained transformers actually do on these classic sentences (the page
   is honest about this). Pure DOM — no canvas. Container: #attn-demo. */
(function () {
  "use strict";

  const SENTENCES = [
    {
      label: "…because it was too big",
      words: ["The", "trophy", "didn't", "fit", "in", "the", "suitcase",
              "because", "it", "was", "too", "big"],
      // hand-authored rows for interesting words; others get a neighbor default
      focus: {
        8: { 1: 0.52, 6: 0.13, 11: 0.20 },   // "it" → trophy (big things don't fit)
        11: { 1: 0.45, 8: 0.25 },            // "big" → trophy, it
        3: { 1: 0.38, 6: 0.3 },              // "fit" → trophy, suitcase
      },
    },
    {
      label: "…because it was too small",
      words: ["The", "trophy", "didn't", "fit", "in", "the", "suitcase",
              "because", "it", "was", "too", "small"],
      focus: {
        8: { 6: 0.52, 1: 0.13, 11: 0.20 },   // "it" → suitcase (small things can't hold)
        11: { 6: 0.45, 8: 0.25 },
        3: { 1: 0.38, 6: 0.3 },
      },
    },
    {
      label: "the river bank",
      words: ["She", "sat", "on", "the", "bank", "and", "watched", "the",
              "river", "flow"],
      focus: {
        4: { 8: 0.5, 9: 0.18, 1: 0.12 },     // "bank" → river, flow: the meaning-picker
      },
    },
  ];

  let root, current = 0, selected = null;

  function weightsFor(s, i) {
    const n = s.words.length;
    const w = new Array(n).fill(0);
    if (s.focus[i]) {
      let used = 0;
      for (const [j, v] of Object.entries(s.focus[i])) { w[+j] = v; used += v; }
      w[i] = Math.max(w[i], 0.12); used += 0.12;
      const rest = Math.max(0, 1 - used) / Math.max(1, n - Object.keys(s.focus[i]).length - 1);
      for (let j = 0; j < n; j++) if (!w[j]) w[j] = rest;
    } else {
      // default: mostly self and immediate neighbors
      for (let j = 0; j < n; j++) {
        w[j] = j === i ? 0.4 : Math.abs(j - i) === 1 ? 0.18 : 0.24 / Math.max(1, n - 3);
      }
    }
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map((v) => v / sum);
  }

  function render() {
    const s = SENTENCES[current];
    const holder = root.querySelector('[data-out="sentence"]');
    holder.innerHTML = "";
    const weights = selected != null ? weightsFor(s, selected) : null;

    s.words.forEach((word, i) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "attn-word";
      if (i === selected) chip.classList.add("selected");
      chip.innerHTML = `<span class="w">${word}</span><span class="bar"><span></span></span>`;
      if (weights && i !== selected) {
        chip.querySelector(".bar span").style.width = (weights[i] * 100 / Math.max(...weights)) + "%";
        chip.style.setProperty("--strength", weights[i] / Math.max(...weights));
      }
      chip.addEventListener("click", () => { selected = i; render(); });
      holder.appendChild(chip);
    });

    const say = root.querySelector('[data-out="say"]');
    if (selected == null) {
      say.textContent = "click a word — try “it”";
    } else {
      const ranked = s.words
        .map((w, i) => ({ w, i, v: weights[i] }))
        .filter((x) => x.i !== selected)
        .sort((a, b) => b.v - a.v)
        .slice(0, 3);
      say.innerHTML = `“<strong>${s.words[selected]}</strong>” pays most attention to: ` +
        ranked.map((r) => `<strong>${r.w}</strong> (${(r.v * 100).toFixed(0)}%)`).join(", ");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("attn-demo");
    if (!root) return;

    const picker = root.querySelector('[data-out="picker"]');
    SENTENCES.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "action" + (i ? " secondary" : "");
      btn.textContent = s.label;
      btn.addEventListener("click", () => {
        current = i;
        // keep "it"/the interesting word selected when switching trophy variants
        selected = s.focus[8] ? 8 : s.focus[4] ? 4 : null;
        picker.querySelectorAll("button").forEach((b) =>
          b.classList.toggle("secondary", b !== btn));
        render();
      });
      picker.appendChild(btn);
    });

    selected = 8; // start on "it" — the money shot
    render();
  });
})();
