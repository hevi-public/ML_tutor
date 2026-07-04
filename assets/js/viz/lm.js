/* ML Tutor — two pocket-sized language demos on one page.

   1. #tokenizer-demo: a greedy subword tokenizer — type text, watch it split
      into colored tokens from a small vocabulary (longest match wins).
   2. #lm-demo: a word-level bigram language model trained (instantly) on a
      tiny embedded corpus. Shows the full probability table for the next
      word; generate greedily or by sampling. An LLM is this idea with
      attention, a trillion times the text, and billions of knobs. */
(function () {
  "use strict";

  /* ================= tokenizer ================= */

  const VOCAB = [
    "walk", "talk", "play", "break", "read", "build", "learn", "think",
    "un", "re", "pre", "over",
    "ing", "ed", "er", "ers", "est", "able", "ful", "ness", "ly", "s",
    "the", "and", "is", "a", "of", "to", "in", "it",
  ].sort((a, b) => b.length - a.length); // longest first

  function tokenize(text) {
    const tokens = [];
    let i = 0;
    const lower = text.toLowerCase();
    while (i < lower.length) {
      if (lower[i] === " ") { i++; continue; }
      let matched = null;
      for (const v of VOCAB) {
        if (lower.startsWith(v, i)) { matched = v; break; }
      }
      if (matched) {
        tokens.push({ t: matched, known: true });
        i += matched.length;
      } else {
        tokens.push({ t: lower[i], known: false }); // unknown → single character
        i++;
      }
    }
    return tokens;
  }

  function initTokenizer() {
    const root = document.getElementById("tokenizer-demo");
    if (!root) return;
    const input = root.querySelector("input");
    const out = root.querySelector('[data-out="tokens"]');
    const count = root.querySelector('[data-out="count"]');

    function render() {
      const tokens = tokenize(input.value);
      out.innerHTML = "";
      tokens.forEach((tok, i) => {
        const chip = document.createElement("span");
        chip.className = "token-chip" + (tok.known ? " c" + (i % 4) : " unk");
        chip.textContent = tok.t;
        chip.title = tok.known ? "vocabulary piece" : "not in vocabulary — falls back to a single character";
        out.appendChild(chip);
      });
      count.textContent = `${tokens.length} tokens`;
    }
    input.addEventListener("input", render);
    render();
  }

  /* ================= bigram language model ================= */

  const CORPUS = `
    the cat sat on the mat . the dog sat on the rug . the cat chased the mouse .
    the dog chased the cat . the mouse ran under the table . the cat drank the milk .
    the dog ate the bone . the sun rose over the hill . the rain fell on the roof .
    the cat slept under the tree . the dog slept by the fire . the sun set behind the hill .
    the mouse ate the cheese . the cat watched the mouse . the dog watched the door .
    the rain fell on the garden . the cat sat by the fire . the mouse hid under the floor .
  `.trim().split(/\s+/);

  // counts[w] = { next: count } — the model's entire "knowledge"
  const counts = {};
  for (let i = 0; i < CORPUS.length - 1; i++) {
    const w = CORPUS[i], nx = CORPUS[i + 1];
    (counts[w] = counts[w] || {})[nx] = (counts[w][nx] || 0) + 1;
  }

  function nextDistribution(word) {
    const opts = counts[word] || counts["."];
    const total = Object.values(opts).reduce((a, b) => a + b, 0);
    return Object.entries(opts)
      .map(([w, c]) => ({ w, p: c / total }))
      .sort((a, b) => b.p - a.p);
  }

  function initLM() {
    const root = document.getElementById("lm-demo");
    if (!root) return;
    let text = ["the", "cat"];
    const textEl = root.querySelector('[data-out="text"]');
    const distEl = root.querySelector('[data-out="dist"]');
    const rnd = (window.ML ? window.ML.rand.lcg(7) : Math.random);

    function render() {
      textEl.innerHTML = text.map((w, i) =>
        i >= text.length - 1 ? `<strong>${w}</strong>` : w).join(" ");
      const dist = nextDistribution(text[text.length - 1]);
      distEl.innerHTML = dist.slice(0, 6).map(({ w, p }) =>
        `<div class="prob-row">
           <span class="prob-word">${w}</span>
           <span class="prob-bar"><span style="width:${p * 100}%"></span></span>
           <span class="prob-val">${(p * 100).toFixed(0)}%</span>
         </div>`).join("");
    }

    function addWord(sample) {
      const dist = nextDistribution(text[text.length - 1]);
      let choice;
      if (sample) {
        let r = (typeof rnd === "function" ? rnd() : Math.random());
        choice = dist[dist.length - 1].w;
        for (const { w, p } of dist) { r -= p; if (r <= 0) { choice = w; break; } }
      } else {
        choice = dist[0].w;
      }
      text.push(choice);
      if (text.length > 60) text = text.slice(-60);
      render();
    }

    root.querySelector('[data-action="greedy"]').addEventListener("click", () => addWord(false));
    root.querySelector('[data-action="sample"]').addEventListener("click", () => addWord(true));
    root.querySelector('[data-action="auto"]').addEventListener("click", () => {
      for (let i = 0; i < 15; i++) addWord(true);
    });
    root.querySelector('[data-action="restart"]').addEventListener("click", () => {
      text = ["the", "cat"];
      render();
    });
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTokenizer();
    initLM();
  });
})();
