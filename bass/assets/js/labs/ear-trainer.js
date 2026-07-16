/* Bass Tutor — ear trainer. Drills: intervals (ascending/descending/harmonic),
   triad qualities, seventh-chord qualities. Every question is replayable and
   never penalized for replays; stats per drill live in localStorage
   "bass-tutor:ear".                                                          */
(function () {
  "use strict";

  const KEY = "bass-tutor:ear";

  const DRILLS = {
    intervals: {
      name: "Intervals",
      choices: [
        ["m2", 1], ["M2", 2], ["m3", 3], ["M3", 4], ["P4", 5], ["TT", 6],
        ["P5", 7], ["m6", 8], ["M6", 9], ["m7", 10], ["M7", 11], ["P8", 12],
      ],
      starter: ["m3", "M3", "P4", "P5", "P8"],
    },
    triads: {
      name: "Triad quality",
      choices: [["major", [0, 4, 7]], ["minor", [0, 3, 7]],
                ["diminished", [0, 3, 6]], ["augmented", [0, 4, 8]]],
      starter: ["major", "minor"],
    },
    sevenths: {
      name: "Seventh chords",
      choices: [["maj7", [0, 4, 7, 11]], ["dom 7", [0, 4, 7, 10]],
                ["m7", [0, 3, 7, 10]], ["m7♭5", [0, 3, 6, 10]]],
      starter: ["maj7", "dom 7", "m7"],
    },
  };

  function loadStats() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { return {}; }
  }
  function saveStats(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

  document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);
    if (!$("et-answers")) return;

    const answers = $("et-answers"), prompt = $("et-prompt"),
          feedback = $("et-feedback"), subsetWrap = $("et-subset");
    const statRight = $("et-right"), statTotal = $("et-total"),
          statStreak = $("et-streak");

    let drill = "intervals";
    let direction = "asc";        // asc | desc | harmonic (intervals only)
    let enabled = new Set(DRILLS.intervals.starter);
    let current = null;
    let right = 0, total = 0, streak = 0;
    let awaiting = false;

    function rootMidi() { return 28 + Math.floor(Math.random() * 17); } // E1..A2

    function buildSubset() {
      subsetWrap.replaceChildren();
      for (const [label] of DRILLS[drill].choices) {
        const lab = document.createElement("label");
        lab.style.marginRight = "0.8rem";
        lab.style.fontSize = "0.9rem";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = enabled.has(label);
        cb.addEventListener("change", () => {
          if (cb.checked) enabled.add(label);
          else if (enabled.size > 2) enabled.delete(label);
          else cb.checked = true; // keep at least two options
          buildAnswers();
        });
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(" " + label));
        subsetWrap.appendChild(lab);
      }
    }

    function buildAnswers() {
      answers.replaceChildren();
      for (const [label] of DRILLS[drill].choices) {
        if (!enabled.has(label)) continue;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "choice";
        b.textContent = label;
        b.addEventListener("click", () => answer(label));
        answers.appendChild(b);
      }
    }

    function playCurrent() {
      if (!current) return;
      window.BTAudio.stopAll();
      if (drill === "intervals") {
        const [a, b] = current.midis;
        if (direction === "harmonic") {
          window.BTAudio.pluck(a, { dur: 1.7 });
          window.BTAudio.pluck(b, { dur: 1.7 });
        } else {
          window.BTAudio.pluck(a, { dur: 1.0 });
          window.BTAudio.pluck(b, { when: 0.75, dur: 1.4 });
        }
      } else {
        // chords: arpeggiate quickly then sustain as a pad
        current.midis.forEach((m, i) =>
          window.BTAudio.pluck(m, { when: i * 0.12, dur: 1.2, gain: 0.8 }));
        window.BTAudio.chordPad(current.midis.map((m) => m + 12),
          { when: 0.7, dur: 1.5, gain: 0.4 });
      }
    }

    function nextQuestion() {
      const pool = DRILLS[drill].choices.filter(([l]) => enabled.has(l));
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const root = rootMidi();
      if (drill === "intervals") {
        const semis = pick[1];
        const midis = direction === "desc" ? [root + semis, root] : [root, root + semis];
        current = { label: pick[0], midis };
      } else {
        current = { label: pick[0], midis: pick[1].map((s) => root + s) };
      }
      awaiting = true;
      feedback.textContent = "";
      prompt.textContent = "Listening…";
      playCurrent();
      setTimeout(() => { prompt.textContent = "What did you hear?"; }, 400);
    }

    function answer(label) {
      if (!awaiting || !current) return;
      awaiting = false;
      total++;
      const ok = label === current.label;
      if (ok) { right++; streak++; }
      else streak = 0;
      feedback.textContent = ok
        ? `✓ ${current.label}`
        : `✗ that was ${current.label} (you said ${label})`;
      statRight.textContent = right;
      statTotal.textContent = total;
      statStreak.textContent = streak;

      const stats = loadStats();
      const s = stats[drill] || { right: 0, total: 0, bestStreak: 0 };
      s.right += ok ? 1 : 0;
      s.total += 1;
      s.bestStreak = Math.max(s.bestStreak, streak);
      stats[drill] = s;
      saveStats(stats);

      setTimeout(nextQuestion, ok ? 700 : 1600);
    }

    $("et-next").addEventListener("click", () => {
      window.BTAudio.ensure();
      nextQuestion();
      $("et-next").textContent = "Skip →";
    });
    $("et-replay").addEventListener("click", () => { window.BTAudio.ensure(); playCurrent(); });

    document.querySelectorAll("[data-et-drill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        drill = btn.dataset.etDrill;
        enabled = new Set(DRILLS[drill].starter);
        document.querySelectorAll("[data-et-drill]").forEach((b) => {
          b.classList.toggle("secondary", b !== btn);
          b.setAttribute("aria-pressed", String(b === btn));
        });
        $("et-direction-row").hidden = drill !== "intervals";
        current = null;
        awaiting = false;
        prompt.textContent = "Press play to get a question.";
        feedback.textContent = "";
        $("et-next").textContent = "▶ Play a question";
        buildSubset();
        buildAnswers();
      });
    });

    document.querySelectorAll("[data-et-dir]").forEach((btn) => {
      btn.addEventListener("click", () => {
        direction = btn.dataset.etDir;
        document.querySelectorAll("[data-et-dir]").forEach((b) => {
          b.classList.toggle("secondary", b !== btn);
          b.setAttribute("aria-pressed", String(b === btn));
        });
        if (current) playCurrent();
      });
    });

    buildSubset();
    buildAnswers();
  });
})();
