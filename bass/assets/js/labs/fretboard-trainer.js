/* Bass Tutor — fretboard trainer. Two games:
   "name" — a fret is marked, pick its note name from twelve buttons.
   "find" — a note name + string is prompted, tap the right fret.
   Timed rounds (60 s) or zen mode; streaks; bests per mode+range in
   localStorage "bass-tutor:trainer"; misses feed the flashcards deck via
   BassProgress.recordMiss.                                                  */
(function () {
  "use strict";

  const KEY = "bass-tutor:trainer";
  const STRINGS = ["E", "A", "D", "G"];

  function loadBests() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { return {}; }
  }
  function saveBests(b) { localStorage.setItem(KEY, JSON.stringify(b)); }

  document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);
    if (!$("ft-start")) return;

    const fb = window.BTFret.create(document.querySelector("#ft-neck .fretboard-wrap"), {
      frets: 12,
      names: false,
      playOnTap: false,
      onTap: handleTap,
    });

    const prompt = $("ft-prompt"), feedback = $("ft-feedback");
    const answersWrap = $("ft-answers");
    const statScore = $("ft-score"), statStreak = $("ft-streak"),
          statBest = $("ft-best"), statTime = $("ft-time");

    let mode = "name";          // "name" | "find"
    let maxFret = 5;
    let timed = true;
    let running = false;
    let score = 0, streak = 0, timeLeft = 60;
    let timer = 0;
    let current = null;         // { string, fret, midi, name, pc }
    let recent = [];

    // answer buttons (sharps for simplicity; ♯/♭ pairs both accepted mentally)
    const NAMES = window.BT.NAMES_SHARP;
    NAMES.forEach((n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.textContent = n;
      b.addEventListener("click", () => answerName(n));
      answersWrap.appendChild(b);
    });

    function bestKey() { return `${mode}:${maxFret}`; }
    function showBest() {
      const b = loadBests()[bestKey()];
      statBest.textContent = b ? String(b) : "—";
    }

    function nextQuestion() {
      fb.clear();
      feedback.textContent = "";
      let q;
      do {
        q = { string: Math.floor(Math.random() * 4),
              fret: Math.floor(Math.random() * (maxFret + 1)) };
      } while (recent.some((r) => r.string === q.string && r.fret === q.fret));
      recent.push(q);
      if (recent.length > 3) recent.shift();
      const note = window.BT.noteAt(q.string, q.fret);
      current = { ...q, ...note, pc: window.BT.pc(note.midi) };

      if (mode === "name") {
        fb.mark([{ string: q.string, fret: q.fret, label: "?", cls: "root" }]);
        prompt.textContent = `What note is marked? (${STRINGS[q.string]} string, fret ${q.fret})`;
      } else {
        prompt.textContent = `Find ${window.BT.NAMES_SHARP[current.pc]} on the ${STRINGS[q.string]} string`;
      }
    }

    function result(correct, answerText) {
      if (correct) {
        score++; streak++;
        window.BTAudio.pluck(current.midi, { dur: 0.8 });
        feedback.textContent = `✓ ${current.name.replace(/\d+$/, "")}`;
      } else {
        streak = 0;
        window.BTAudio.pluck(current.midi, { dur: 0.5, mute: true });
        feedback.textContent = `✗ it's ${current.name.replace(/\d+$/, "")} — ${answerText}`;
        if (window.BassProgress) {
          window.BassProgress.recordMiss("fretboard-trainer",
            mode === "name"
              ? `Fretboard: what note is at fret ${current.fret} of the ${STRINGS[current.string]} string?`
              : `Fretboard: where is ${window.BT.NAMES_SHARP[current.pc]} on the ${STRINGS[current.string]} string (frets 0–${maxFret})?`,
            mode === "name"
              ? current.name.replace(/\d+$/, "")
              : `fret ${current.fret}`,
            "Anchor it to a landmark: dots at 3-5-7-9-12, octave shapes, and the 5th-fret rule.");
        }
      }
      statScore.textContent = score;
      statStreak.textContent = streak;
      setTimeout(() => { if (running) nextQuestion(); }, correct ? 350 : 1100);
    }

    function answerName(n) {
      if (!running || mode !== "name" || !current) return;
      result(window.BT.pc(n) === current.pc, `you said ${n}`);
    }

    function handleTap(pos) {
      if (!running || mode !== "find" || !current) {
        window.BTAudio.pluck(pos.midi, { dur: 0.6 }); // free play when idle
        return;
      }
      if (pos.string !== current.string) {
        feedback.textContent = `stay on the ${STRINGS[current.string]} string…`;
        return;
      }
      result(pos.midi % 12 === current.pc && pos.fret <= maxFret,
        `you tapped fret ${pos.fret}`);
    }

    function finish() {
      running = false;
      clearInterval(timer);
      prompt.textContent = `Round over — ${score} correct.`;
      feedback.textContent = "";
      fb.clear();
      const bests = loadBests();
      if (!bests[bestKey()] || score > bests[bestKey()]) {
        bests[bestKey()] = score;
        saveBests(bests);
        prompt.textContent += " New best! 🎉";
      }
      showBest();
      $("ft-start").textContent = "▶ Start round";
    }

    $("ft-start").addEventListener("click", () => {
      if (running) { finish(); return; }
      window.BTAudio.ensure();
      running = true;
      score = 0; streak = 0; recent = [];
      statScore.textContent = "0";
      statStreak.textContent = "0";
      $("ft-start").textContent = "■ End round";
      if (timed) {
        timeLeft = 60;
        statTime.textContent = timeLeft;
        timer = setInterval(() => {
          if (document.hidden) return; // pause while hidden
          timeLeft--;
          statTime.textContent = timeLeft;
          if (timeLeft <= 0) finish();
        }, 1000);
      } else {
        statTime.textContent = "∞";
      }
      nextQuestion();
    });

    document.querySelectorAll("[data-ft-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mode = btn.dataset.ftMode;
        document.querySelectorAll("[data-ft-mode]").forEach((b) => {
          b.classList.toggle("secondary", b !== btn);
          b.setAttribute("aria-pressed", String(b === btn));
        });
        answersWrap.hidden = mode !== "name";
        if (running) finish();
        prompt.textContent = mode === "name"
          ? "Name the marked note. Press start."
          : "Tap the prompted note on the neck. Press start.";
        showBest();
      });
    });

    document.querySelectorAll("[data-ft-range]").forEach((btn) => {
      btn.addEventListener("click", () => {
        maxFret = Number(btn.dataset.ftRange);
        document.querySelectorAll("[data-ft-range]").forEach((b) => {
          b.classList.toggle("secondary", b !== btn);
          b.setAttribute("aria-pressed", String(b === btn));
        });
        if (running) finish();
        showBest();
      });
    });

    $("ft-timed").addEventListener("change", (e) => {
      timed = e.target.checked;
      statTime.textContent = timed ? "60" : "∞";
    });

    showBest();
  });
})();
