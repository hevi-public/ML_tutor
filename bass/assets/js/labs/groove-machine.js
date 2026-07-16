/* Bass Tutor — groove machine: a chord-loop play-along band. Pick a
   progression, key, style pattern, and tempo; it loops clicks + chord pads +
   optional bass root cues while highlighting the chart, and shows the current
   chord's tones on a fretboard. Deep-linkable via the URL hash:
     groove-machine.html#prog=12bar&key=A&style=shuffle&bpm=96
   Style pages preset themselves into it with those links.

   One lookahead scheduler (25 ms timer, wider horizon while hidden) owns the
   whole timeline — clicks, pads, and cues all land on the audio clock.      */
(function () {
  "use strict";

  /* ---------- Progressions (functions of key → bars of chord symbols) ---------- */

  const PROGRESSIONS = {
    "12bar": {
      name: "12-bar blues",
      bars(key) {
        const d = window.BT.diatonicChords(key, "major");
        const I = d[0].root + "7", IV = d[3].root + "7", V = d[4].root + "7";
        return [I, I, I, I, IV, IV, I, I, V, IV, I, V].map((c) => [c]);
      },
    },
    "1564": {
      name: "I – V – vi – IV",
      bars(key) {
        const d = window.BT.diatonicChords(key, "major");
        return [d[0].symbol, d[4].symbol, d[5].symbol, d[3].symbol].map((c) => [c]);
      },
    },
    "251": {
      name: "ii – V – I",
      bars(key) {
        const d = window.BT.diatonicChords(key, "major", { sevenths: true });
        return [[d[1].symbol], [d[4].symbol], [d[0].symbol], [d[0].symbol]];
      },
    },
    vamp: {
      name: "One-chord vamp",
      bars(key) {
        return [[key + "7"], [key + "7"]];
      },
    },
    doowop: {
      name: "I – vi – IV – V",
      bars(key) {
        const d = window.BT.diatonicChords(key, "major");
        return [d[0].symbol, d[5].symbol, d[3].symbol, d[4].symbol].map((c) => [c]);
      },
    },
    custom: { name: "Custom", bars: null }, // parsed from the text box
  };

  // "Am7 D7 | G | C" → [["Am7","D7"],["G"],["C"]]
  function parseCustom(text) {
    const bars = text.split("|").map((b) => b.trim()).filter(Boolean)
      .map((b) => b.split(/\s+/).filter(Boolean));
    for (const bar of bars) {
      for (const sym of bar) {
        if (!window.BT.chord(sym)) return { error: sym };
      }
    }
    return bars.length ? { bars } : { error: "(empty)" };
  }

  /* ---------- Styles: per-chord bass patterns, per-bar pad rhythms ----------
     Bass events: { t (beats), deg ("R"|"5"|"5d"|"8"|"b7"|"3"|"ghost"|"walk"), dur, gain }
     Pad hits:    { t, dur } — pads always play the current chord.            */

  const STYLES = {
    rock8: {
      name: "Rock straight 8ths",
      sub: 2,
      bass: [
        { t: 0, deg: "R", dur: 0.5 }, { t: 0.5, deg: "R", dur: 0.5 },
        { t: 1, deg: "R", dur: 0.5 }, { t: 1.5, deg: "R", dur: 0.5 },
        { t: 2, deg: "R", dur: 0.5 }, { t: 2.5, deg: "R", dur: 0.5 },
        { t: 3, deg: "R", dur: 0.5 }, { t: 3.5, deg: "R", dur: 0.5 },
      ],
      pads: [{ t: 0, dur: 4 }],
    },
    shuffle: {
      name: "Blues shuffle",
      sub: 3,
      bass: [
        { t: 0, deg: "R", dur: 0.6 }, { t: 0.67, deg: "R", dur: 0.3 },
        { t: 1, deg: "3", dur: 0.6 }, { t: 1.67, deg: "3", dur: 0.3 },
        { t: 2, deg: "5", dur: 0.6 }, { t: 2.67, deg: "5", dur: 0.3 },
        { t: 3, deg: "6", dur: 0.6 }, { t: 3.67, deg: "6", dur: 0.3 },
      ],
      pads: [{ t: 0, dur: 1.9 }, { t: 2, dur: 1.9 }],
    },
    funk16: {
      name: "Funk 16ths",
      sub: 4,
      bass: [
        { t: 0, deg: "R", dur: 0.4, gain: 1.1 },
        { t: 0.75, deg: "ghost", dur: 0.15 },
        { t: 1, deg: "ghost", dur: 0.15 },
        { t: 1.5, deg: "8", dur: 0.3 },
        { t: 2, deg: "R", dur: 0.4 },
        { t: 2.75, deg: "b7", dur: 0.25 },
        { t: 3.25, deg: "ghost", dur: 0.15 },
        { t: 3.5, deg: "5", dur: 0.4 },
      ],
      pads: [{ t: 0.5, dur: 0.4 }, { t: 2.5, dur: 0.4 }],
    },
    onedrop: {
      name: "Reggae one drop",
      sub: 2,
      bass: [
        // the silence on beat 1 IS the style
        { t: 1, deg: "R", dur: 0.9 },
        { t: 2.5, deg: "R", dur: 0.4 },
        { t: 3, deg: "5d", dur: 0.9 },
      ],
      pads: [{ t: 1, dur: 0.35 }, { t: 3, dur: 0.35 }], // the skank chops
    },
    motown: {
      name: "Motown pulse",
      sub: 2,
      bass: [
        { t: 0, deg: "R", dur: 1.4 },
        { t: 1.5, deg: "R", dur: 0.45 },
        { t: 2, deg: "5", dur: 0.9 },
        { t: 3, deg: "6", dur: 0.45 },
        { t: 3.5, deg: "b7", dur: 0.45 },
      ],
      pads: [{ t: 0, dur: 1.9 }, { t: 2, dur: 1.9 }],
    },
    walk4: {
      name: "Walking 4s",
      sub: 1,
      bass: "walk", // generated per bar: R - tone - tone - approach
      pads: [{ t: 0, dur: 1.9 }, { t: 2, dur: 1.9 }],
    },
    clickonly: {
      name: "Metronome only",
      sub: 1,
      bass: [],
      pads: [],
    },
  };

  // Degree → semitone offset from the chord root (bass register).
  function degOffset(deg, chord) {
    const has = (n) => chord.intervals.includes(n);
    switch (deg) {
      case "R": return 0;
      case "3": return has(3) ? 3 : 4;
      case "5": return 7;
      case "5d": return -5;               // the low fifth
      case "6": return 9;
      case "b7": return has(10) ? 10 : has(11) ? 11 : 10;
      case "8": return 12;
      default: return 0;
    }
  }

  function walkBar(chord, nextChord) {
    const third = degOffset("3", chord), fifth = 7;
    const approach = (nextChord.rootMidi - 1) - chord.rootMidi;
    return [
      { t: 0, deg: 0, dur: 0.95 },
      { t: 1, deg: third, dur: 0.95 },
      { t: 2, deg: fifth, dur: 0.95 },
      { t: 3, deg: approach, dur: 0.95 },
    ];
  }

  /* ---------- The machine ---------- */

  document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);
    const progSel = $("gm-prog"), keySel = $("gm-key"), styleSel = $("gm-style");
    const customRow = $("gm-custom-row"), customIn = $("gm-custom");
    const bpmIn = $("gm-bpm"), bpmOut = $("gm-bpm-out");
    const chartEl = $("gm-chart"), status = $("gm-status");
    const playBtn = $("gm-play");
    const padsChk = $("gm-pads"), cuesChk = $("gm-cues"), countChk = $("gm-count");
    if (!progSel) return;

    // populate selects
    for (const [id, p] of Object.entries(PROGRESSIONS)) {
      progSel.add(new Option(p.name, id));
    }
    for (const k of ["C", "G", "D", "A", "E", "F", "Bb", "Eb"]) {
      keySel.add(new Option(k, k));
    }
    for (const [id, s] of Object.entries(STYLES)) {
      styleSel.add(new Option(s.name, id));
    }

    const fb = window.BTFret.create(document.querySelector("#gm-neck .fretboard-wrap"),
      { frets: 12 });

    let chart = [];        // [{ syms: ["Am7"], chords: [chordObj] }]
    let cells = [];
    let running = false;
    let timer = 0, raf = 0;
    let barIdx = 0, nextBarTime = 0, countIn = 0;
    let uiQueue = [];
    let shownChord = null;

    function chordObj(sym) {
      const c = window.BT.chord(sym);
      let rootMidi = window.BT.noteToMidi(c.root + "1");
      if (rootMidi === null || rootMidi < 28) rootMidi = window.BT.noteToMidi(c.root + "2");
      return { ...c, rootMidi };
    }

    function rebuildChart() {
      const prog = PROGRESSIONS[progSel.value];
      customRow.hidden = progSel.value !== "custom";
      let bars;
      if (progSel.value === "custom") {
        const parsed = parseCustom(customIn.value || "Am7 | D7 | Am7 | E7");
        if (parsed.error) {
          status.textContent = `Couldn't read the chord "${parsed.error}" — try symbols like Am7, D7, Gmaj7, F#m.`;
          return false;
        }
        bars = parsed.bars;
      } else {
        bars = prog.bars(keySel.value);
      }
      chart = bars.map((syms) => ({ syms, chords: syms.map(chordObj) }));
      chartEl.replaceChildren();
      cells = chart.map((bar) => {
        const c = document.createElement("span");
        c.className = "cell";
        c.textContent = bar.syms.join(" ");
        chartEl.appendChild(c);
        return c;
      });
      status.textContent = `${chart.length} bars · ${PROGRESSIONS[progSel.value].name}` +
        (progSel.value === "custom" ? "" : ` in ${keySel.value}`);
      return true;
    }

    function scheduleBar(index, when) {
      const spb = 60 / Number(bpmIn.value);
      const style = STYLES[styleSel.value];
      const bar = chart[index % chart.length];
      const perChord = 4 / bar.chords.length;

      // clicks
      for (let b = 0; b < 4; b++) {
        for (let s = 0; s < style.sub; s++) {
          const t = when + (b + s / style.sub) * spb;
          if (s === 0) window.BTAudio.click(t, b === 0 ? "accent" : "beat", 0.9);
          else if (style.sub > 1) window.BTAudio.click(t, "sub", 0.5);
        }
      }

      bar.chords.forEach((chord, ci) => {
        const cStart = when + ci * perChord * spb;
        const relTo = (absTime) => Math.max(0, absTime - window.BTAudio.now());
        // pads (style hits are bar-relative; keep the ones inside this chord's slice)
        if (padsChk.checked) {
          for (const hit of style.pads) {
            if (hit.t >= perChord * (ci + 1) || hit.t < perChord * ci) continue;
            const abs = cStart + (hit.t - perChord * ci) * spb;
            window.BTAudio.chordPad(
              chord.intervals.map((s) => chord.rootMidi + 12 + s),
              { when: relTo(abs), dur: Math.min(hit.dur, perChord) * spb, gain: 0.42 });
          }
        }
        // bass cues
        if (cuesChk.checked) {
          let events;
          if (style.bass === "walk") {
            const nextBar = chart[(index + (ci === bar.chords.length - 1 ? 1 : 0)) % chart.length];
            const nextChord = ci === bar.chords.length - 1
              ? nextBar.chords[0] : bar.chords[ci + 1];
            events = walkBar(chord, nextChord).map((e) => ({ ...e, offset: e.deg }));
          } else {
            events = style.bass
              .filter((e) => e.t >= perChord * ci && e.t < perChord * (ci + 1))
              .map((e) => ({ ...e, t: e.t - perChord * ci,
                offset: e.deg === "ghost" ? 0 : degOffset(e.deg, chord) }));
          }
          for (const e of events) {
            const rel = relTo(cStart + e.t * spb);
            if (e.deg === "ghost") {
              window.BTAudio.pluck(chord.rootMidi, { when: rel, dur: 0.25, gain: 0.5, mute: true });
            } else {
              window.BTAudio.pluck(chord.rootMidi + e.offset,
                { when: rel, dur: e.dur * spb * 1.15, gain: e.gain || 0.95 });
            }
          }
        }
      });

      uiQueue.push({ time: when, index });
    }

    function schedulerTick() {
      if (!running) return;
      const horizon = document.hidden ? 2.0 : 0.15;
      const spb = 60 / Number(bpmIn.value);
      while (nextBarTime < window.BTAudio.now() + horizon) {
        if (countIn > 0) {
          for (let b = 0; b < 4; b++) {
            window.BTAudio.click(nextBarTime + b * spb, b === 0 ? "accent" : "beat", 1);
          }
          uiQueue.push({ time: nextBarTime, index: -1 });
          countIn--;
        } else {
          scheduleBar(barIdx, nextBarTime);
          barIdx++;
        }
        nextBarTime += 4 * spb;
      }
    }

    function uiTick() {
      if (!running) return;
      const now = window.BTAudio.now();
      while (uiQueue.length && uiQueue[0].time <= now) {
        const ev = uiQueue.shift();
        if (ev.index === -1) {
          status.textContent = "count-in…";
        } else {
          const i = ev.index % chart.length;
          cells.forEach((c, j) => c.classList.toggle("now", j === i));
          status.textContent = `bar ${i + 1} of ${chart.length} — ${chart[i].syms.join(" · ")}`;
          const chord = chart[i].chords[0];
          if (shownChord !== chord.symbol) {
            shownChord = chord.symbol;
            fb.clear();
            fb.markPcs(chord.pcs, { rootPc: window.BT.pc(chord.root) });
          }
        }
      }
      raf = requestAnimationFrame(uiTick);
    }

    function start() {
      if (!rebuildChart()) return;
      window.BTAudio.ensure();
      running = true;
      barIdx = 0;
      countIn = countChk.checked ? 1 : 0;
      nextBarTime = window.BTAudio.now() + 0.15;
      uiQueue = [];
      shownChord = null;
      schedulerTick();
      timer = setInterval(schedulerTick, 25);
      raf = requestAnimationFrame(uiTick);
      playBtn.textContent = "■ Stop";
    }

    function stop() {
      running = false;
      clearInterval(timer);
      cancelAnimationFrame(raf);
      window.BTAudio.stopAll();
      cells.forEach((c) => c.classList.remove("now"));
      playBtn.textContent = "▶ Play";
      status.textContent = "stopped";
    }

    playBtn.addEventListener("click", () => (running ? stop() : start()));

    bpmIn.addEventListener("input", () => { bpmOut.textContent = bpmIn.value; updateHash(); });
    [progSel, keySel, styleSel].forEach((el) =>
      el.addEventListener("change", () => { if (running) stop(); rebuildChart(); updateHash(); }));
    customIn?.addEventListener("change", () => { if (running) stop(); rebuildChart(); });

    /* ---------- URL hash presets ---------- */

    function updateHash() {
      const params = new URLSearchParams({
        prog: progSel.value, key: keySel.value,
        style: styleSel.value, bpm: bpmIn.value,
      });
      history.replaceState(null, "", "#" + params.toString());
    }

    function applyHash() {
      if (!location.hash) return;
      const params = new URLSearchParams(location.hash.slice(1));
      if (params.get("prog") && PROGRESSIONS[params.get("prog")]) progSel.value = params.get("prog");
      if (params.get("key")) keySel.value = params.get("key");
      if (params.get("style") && STYLES[params.get("style")]) styleSel.value = params.get("style");
      if (params.get("bpm")) { bpmIn.value = params.get("bpm"); bpmOut.textContent = bpmIn.value; }
    }

    window.addEventListener("hashchange", () => {
      if (running) stop();
      applyHash();
      rebuildChart();
    });

    applyHash();
    bpmOut.textContent = bpmIn.value;
    rebuildChart();
  });
})();
