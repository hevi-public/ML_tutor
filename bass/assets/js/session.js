/* Bass Tutor — session runtime for the hands-on course (bass/sessions/).
   Loaded LAST on session pages (after practice.js), it adds the play-mode
   chrome around ordinary page content:

   - numbers every <section class="step"> and tracks which one you're on
   - injects the fixed session bar: prev/next step, metronome (BTAudio),
     and a "keep awake" toggle (Screen Wake Lock, hidden if unsupported)
   - renders the shared tune-up widget into any [data-tuneup]
   - wires [data-session-done] to BassProgress (quiz completion converges
     on the same slug, so either path marks the session complete)

   Page contract (see assets/session-template.html):
     <body class="session">
     <main data-session-id="session-07" data-bpm="80"> …
       <section class="step" data-title="Tune up"> … </section>            */
(function () {
  "use strict";

  const BPM_MIN = 40, BPM_MAX = 200, BPM_STEP = 5;

  document.addEventListener("DOMContentLoaded", () => {
    const main = document.querySelector("main[data-session-id]");
    if (!main) return;

    const sessionId = main.dataset.sessionId;
    const steps = [...main.querySelectorAll("section.step")];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- Step numbering ---------- */

    steps.forEach((step, i) => {
      const h2 = step.querySelector("h2");
      if (h2 && !h2.querySelector(".step-num")) {
        const chip = document.createElement("span");
        chip.className = "step-num";
        chip.textContent = i + 1;
        chip.setAttribute("aria-hidden", "true");
        h2.prepend(chip);
      }
    });

    /* ---------- Session bar ---------- */

    const bar = document.createElement("nav");
    bar.className = "session-bar";
    bar.setAttribute("aria-label", "Session controls");

    const prevBtn = btn("sb-prev", "◀", "Previous step");
    const stepBox = document.createElement("div");
    stepBox.className = "sb-step";
    stepBox.setAttribute("aria-live", "polite");
    const countEl = document.createElement("span");
    countEl.className = "sb-count";
    const titleEl = document.createElement("span");
    titleEl.className = "sb-title";
    stepBox.append(countEl, titleEl);
    const nextBtn = btn("sb-next", "Next ▶", "Next step");
    const spacer = document.createElement("span");
    spacer.className = "sb-spacer";
    spacer.setAttribute("aria-hidden", "true");
    const bpmDown = btn("sb-bpm-down", "−5", "Metronome slower");
    const metroBtn = btn("sb-metro", "", "Metronome on/off");
    metroBtn.setAttribute("aria-pressed", "false");
    const bpmUp = btn("sb-bpm-up", "+5", "Metronome faster");

    bar.append(prevBtn, stepBox, nextBtn, spacer, bpmDown, metroBtn, bpmUp);

    function btn(cls, text, label) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sb-btn " + cls;
      b.textContent = text;
      b.setAttribute("aria-label", label);
      return b;
    }

    /* ---------- Current-step tracking ---------- */

    let current = 0;
    function setCurrent(i, { announce = true } = {}) {
      current = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach((s, si) => s.classList.toggle("current", si === current));
      countEl.textContent = `${current + 1} / ${steps.length}`;
      titleEl.textContent =
        steps[current].dataset.title ||
        steps[current].querySelector("h2")?.textContent || "";
      if (!announce) stepBox.removeAttribute("aria-live");
      prevBtn.disabled = current === 0;
      updateNext();
    }

    // A thin band across the middle of the viewport decides the current step.
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(steps.indexOf(entry.target));
        }
      }, { rootMargin: "-40% 0px -55% 0px", threshold: 0 });
      steps.forEach((s) => io.observe(s));
    }

    function goTo(i) {
      const step = steps[Math.max(0, Math.min(steps.length - 1, i))];
      step.scrollIntoView({
        block: "start",
        behavior: reducedMotion ? "auto" : "smooth",
      });
      setCurrent(steps.indexOf(step));
    }

    prevBtn.addEventListener("click", () => goTo(current - 1));

    /* ---------- Next / Finish ---------- */

    const doneBtn = main.querySelector("[data-session-done]");

    function isDone() {
      return Boolean(window.BassProgress && BassProgress.isComplete(sessionId));
    }

    function markDone() {
      if (window.BassProgress) BassProgress.markComplete(sessionId);
      if (doneBtn) {
        doneBtn.textContent = "✓ Done — nice work";
        doneBtn.disabled = true;
      }
      updateNext();
    }

    function updateNext() {
      const last = steps.length - 1;
      if (current >= last) {
        nextBtn.textContent = isDone() ? "✓ Done" : "Finish ✓";
        nextBtn.classList.toggle("done", isDone());
        nextBtn.disabled = isDone();
        nextBtn.setAttribute("aria-label", "Finish session");
      } else {
        nextBtn.textContent = current === last - 1 ? "Finish ▶" : "Next ▶";
        nextBtn.classList.remove("done");
        nextBtn.disabled = false;
        nextBtn.setAttribute("aria-label", "Next step");
      }
    }

    nextBtn.addEventListener("click", () => {
      if (current >= steps.length - 1) markDone();
      else goTo(current + 1);
    });

    if (doneBtn) {
      if (isDone()) {
        doneBtn.textContent = "✓ Done — nice work";
        doneBtn.disabled = true;
      }
      doneBtn.addEventListener("click", markDone);
    }

    /* ---------- Metronome ---------- */

    let bpm = clampBpm(Number(main.dataset.bpm) || 80);
    let metroOn = false;

    function clampBpm(v) { return Math.max(BPM_MIN, Math.min(BPM_MAX, v)); }
    function renderMetro() {
      metroBtn.textContent = `♩ ${bpm}`;
      metroBtn.setAttribute("aria-pressed", String(metroOn));
      metroBtn.setAttribute("aria-label",
        metroOn ? `Metronome running at ${bpm} beats per minute — tap to stop`
                : `Start metronome at ${bpm} beats per minute`);
    }

    metroBtn.addEventListener("click", () => {
      if (!window.BTAudio) return;
      metroOn = !metroOn;
      if (metroOn) BTAudio.metronome.start({ bpm });   // user gesture: sound ok
      else BTAudio.metronome.stop();
      renderMetro();
    });

    function nudgeBpm(delta) {
      bpm = clampBpm(bpm + delta);
      if (metroOn && window.BTAudio) BTAudio.metronome.setBpm(bpm);
      renderMetro();
    }
    bpmDown.addEventListener("click", () => nudgeBpm(-BPM_STEP));
    bpmUp.addEventListener("click", () => nudgeBpm(BPM_STEP));
    renderMetro();

    window.addEventListener("pagehide", () => {
      if (metroOn && window.BTAudio) BTAudio.metronome.stop();
    });

    /* ---------- Keep-awake (Screen Wake Lock) ---------- */

    if ("wakeLock" in navigator) {
      const wakeBtn = btn("sb-wake", "", "Keep the screen awake while you practice");
      wakeBtn.setAttribute("aria-pressed", "false");
      bar.appendChild(wakeBtn);

      let wanted = false;
      let sentinel = null;

      function renderWake() {
        const held = wanted && sentinel;
        wakeBtn.setAttribute("aria-pressed", String(Boolean(held)));
        // the label collapses to the icon inside the landscape rail (CSS)
        wakeBtn.innerHTML = (held ? "☀" : "☾") + '<span class="sb-label"> Awake</span>';
      }
      renderWake();

      async function acquire() {
        try {
          sentinel = await navigator.wakeLock.request("screen");
          sentinel.addEventListener("release", () => { sentinel = null; renderWake(); });
        } catch {
          wanted = false;           // e.g. battery saver — fail quietly
          sentinel = null;
        }
        renderWake();
      }

      wakeBtn.addEventListener("click", async () => {
        wanted = !wanted;
        if (wanted) await acquire();
        else if (sentinel) { await sentinel.release(); sentinel = null; }
        renderWake();
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && wanted && !sentinel) acquire();
      });
    }

    /* ---------- Tune-up widget ---------- */

    // One shared implementation of the tuning.html reference pads: tap a pad
    // to hear its string and hold it as a drone; tap again to stop.
    for (const host of main.querySelectorAll("[data-tuneup]")) {
      const grid = document.createElement("div");
      grid.className = "pad-grid";
      const notes = [
        ["E1", "E", "thickest"], ["A1", "A", ""], ["D2", "D", ""], ["G2", "G", "thinnest"],
      ];
      let droneHandle = null, droneNote = null;

      function stopDrone() {
        if (droneHandle) droneHandle.stop();
        droneHandle = null;
        droneNote = null;
        grid.querySelectorAll(".pad").forEach((p) => p.classList.remove("active"));
      }

      for (const [note, label, sub] of notes) {
        const pad = document.createElement("button");
        pad.type = "button";
        pad.className = "pad";
        pad.innerHTML = `<strong>${label}</strong><span class="sub">${sub || "open string"}</span>`;
        pad.addEventListener("click", () => {
          if (!window.BTAudio || !window.BT) return;
          if (droneNote === note) { stopDrone(); return; }
          stopDrone();
          const midi = BT.noteToMidi(note);
          droneHandle = BTAudio.drone(midi, { gain: 0.15 });
          BTAudio.pluck(midi, { dur: 2 });
          droneNote = note;
          pad.classList.add("active");
        });
        grid.appendChild(pad);
      }
      host.appendChild(grid);

      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "Tap a pad — it sounds and holds while you tune that " +
        "string. Listen for the slow wobble between the two sounds: slower " +
        "wobble = closer, no wobble = in tune. Tap again to stop.";
      host.appendChild(hint);

      window.addEventListener("pagehide", stopDrone);
    }

    /* ---------- Practice-card safety net ---------- */

    // Cards render into [data-practice-slot] targets (practice.js); if an id
    // had no slot the card landed in a hidden .practice-root — surface it.
    const root = main.querySelector(".practice-root[hidden]");
    if (root && root.children.length) root.hidden = false;

    document.body.appendChild(bar);
    setCurrent(0, { announce: false });
    stepBox.setAttribute("aria-live", "polite");
  });
})();
