/* Algorithms Tutor — the stepper: one implementation per algorithm, watched.

   The contract (algo/PLAN.md §4): every algorithm in assets/js/algo/ is an ES
   generator that yields typed step events — {type:'compare', i, j},
   {type:'swap', i, j}, {type:'set', i, value}, {type:'visit', node},
   {type:'relax', edge}, {type:'call'|'return', frame}, {type:'cell', i, j} —
   and the SAME generator is the taught code, the animation source, and the
   reference the labs race. This file is the half that watches:

   AlgoSteps.record(makeGen, capture, cap?) →
     { steps: [event…], states: [snapshot…], counts: {type: n}, truncated }
       Runs the generator to completion (or to the cap, default 5000 — scrub
       memory is bounded; see PLAN.md §8), capturing a cheap state snapshot
       after every event via capture(), so scrubbing is O(1) per frame.

   AlgoSteps.player(host, options) →
     Transport UI (⏮ ‹ ▶/⏸ › ⏭ + scrub slider + speed) over a recording.
     options: {
       make:    () => generator          (fresh generator per run)
       capture: () => snapshot           (called after each step)
       render:  (snapshot, event, index) (draw current state; event may be null)
       counters: { compare: "comparisons", swap: "swaps", … }  (chips to show;
                  counts are cumulative up to the scrub position)
       speed:   steps per second at 1× (default 4)
     }
     Returns { reset(makeGen?), goTo(i) } so pages can re-seed the input. */
(function () {
  "use strict";

  const DEFAULT_CAP = 5000;

  function record(makeGen, capture, cap = DEFAULT_CAP) {
    const gen = makeGen();
    const steps = [];
    const states = [capture()]; // state before any step
    const counts = {};
    let truncated = false;
    for (const event of gen) {
      steps.push(event);
      counts[event.type] = (counts[event.type] || 0) + 1;
      states.push(capture());
      if (steps.length >= cap) { truncated = true; break; }
    }
    // A generator may still mutate state after its final yield (e.g. an AVL
    // insert re-pointing ancestors on the way out of the recursion), so the
    // end-of-scrub snapshot is re-captured once the generator has finished.
    if (!truncated) states[states.length - 1] = capture();
    return { steps, states, counts, truncated };
  }

  // Cumulative counts of each event type up to (and including) step index-1:
  // precomputed prefix tallies so the chips are O(1) while scrubbing.
  function prefixCounts(steps, types) {
    const rows = [Object.fromEntries(types.map((t) => [t, 0]))];
    for (const s of steps) {
      const prev = rows[rows.length - 1];
      const next = { ...prev };
      if (next[s.type] !== undefined) next[s.type] += 1;
      rows.push(next);
    }
    return rows;
  }

  function player(host, options) {
    const counterTypes = Object.keys(options.counters || {});
    let rec, tallies, index, timer = null;

    const ui = document.createElement("div");
    ui.className = "stepper";
    ui.innerHTML = `
      <div class="buttons" role="group" aria-label="Playback controls">
        <button type="button" class="action secondary" data-act="start" title="Back to the start">⏮</button>
        <button type="button" class="action secondary" data-act="back" title="One step back">‹ step</button>
        <button type="button" class="action" data-act="play">▶ play</button>
        <button type="button" class="action secondary" data-act="fwd" title="One step forward">step ›</button>
        <button type="button" class="action secondary" data-act="end" title="Jump to the end">⏭</button>
        <label class="speed">speed
          <select aria-label="Playback speed">
            <option value="1">1×</option><option value="3" selected>3×</option>
            <option value="10">10×</option><option value="30">30×</option>
          </select>
        </label>
      </div>
      <input type="range" class="scrub" min="0" value="0" step="1"
             aria-label="Scrub through the algorithm's steps">
      <div class="counters" aria-live="off"></div>
      <p class="hint step-line" aria-live="polite"></p>`;
    host.appendChild(ui);

    const scrub = ui.querySelector(".scrub");
    const playBtn = ui.querySelector('[data-act="play"]');
    const speedSel = ui.querySelector("select");
    const chipsHost = ui.querySelector(".counters");
    const stepLine = ui.querySelector(".step-line");

    chipsHost.innerHTML = counterTypes.map((t) =>
      `<span class="counter">${options.counters[t]}: <span class="n" data-count="${t}">0</span></span>`
    ).join("") + `<span class="counter">step <span class="n" data-count="__pos"></span></span>`;

    function goTo(i) {
      index = Math.max(0, Math.min(i, rec.steps.length));
      scrub.value = index;
      const event = index > 0 ? rec.steps[index - 1] : null;
      options.render(rec.states[index], event, index);
      for (const t of counterTypes) {
        chipsHost.querySelector(`[data-count="${t}"]`).textContent = tallies[index][t];
      }
      chipsHost.querySelector('[data-count="__pos"]').textContent =
        `${index} / ${rec.steps.length}`;
      stepLine.textContent = event && options.describe ? options.describe(event) : "";
      if (index === rec.steps.length) pause();
    }

    function play() {
      if (timer || index >= rec.steps.length) return;
      playBtn.textContent = "⏸ pause";
      const base = options.speed || 4;
      timer = setInterval(() => {
        if (index >= rec.steps.length) return pause();
        goTo(index + 1);
      }, 1000 / (base * Number(speedSel.value)));
    }

    function pause() {
      if (timer) clearInterval(timer);
      timer = null;
      playBtn.textContent = "▶ play";
    }

    ui.addEventListener("click", (e) => {
      const act = e.target.dataset?.act;
      if (!act) return;
      if (act === "play") (timer ? pause : play)();
      else {
        pause();
        if (act === "start") goTo(0);
        if (act === "back") goTo(index - 1);
        if (act === "fwd") goTo(index + 1);
        if (act === "end") goTo(rec.steps.length);
      }
    });
    scrub.addEventListener("input", () => { pause(); goTo(Number(scrub.value)); });
    speedSel.addEventListener("change", () => { if (timer) { pause(); play(); } });

    function reset(makeGen) {
      pause();
      if (makeGen) options.make = makeGen;
      rec = record(options.make, options.capture, options.cap);
      tallies = prefixCounts(rec.steps, counterTypes);
      scrub.max = rec.steps.length;
      if (rec.truncated) {
        stepLine.textContent =
          `(recording capped at ${rec.steps.length} steps — a bigger input than the scrubber holds)`;
      }
      goTo(0);
    }

    reset();
    return { reset, goTo, play, pause };
  }

  /* Run a generator to completion WITHOUT rendering, just counting events —
     the measurement half of "complexity you can measure". Used by
     complexity-chart.js and by lab grading. */
  function measure(makeGen) {
    const counts = {};
    let total = 0;
    for (const event of makeGen()) {
      counts[event.type] = (counts[event.type] || 0) + 1;
      total++;
    }
    return { counts, total };
  }

  window.AlgoSteps = { record, player, measure };
})();
