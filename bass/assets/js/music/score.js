/* Bass Tutor — notation + tab rendering, the site's single VexFlow consumer.

   BTScore.render(el, spec) draws standard bass-clef notation with a linked
   4-line TAB staff underneath, recolored to currentColor so themes just work.
   If VexFlow isn't loaded (file:// before npm install, or the page didn't
   include it) it degrades to a readable text tab.

   Spec shape (also consumed by BTAudio.toEvents for playback):
   { "clef": "bass", "keySignature": "F", "time": "4/4", "tempo": 90,
     "measures": [
       { "chord": "F7",                        // optional symbol over the bar
         "notes": [
           { "keys": ["f/2"], "duration": "q",       // WRITTEN pitch (see below)
             "fret": [{ "str": 4, "fret": 1 }],       // optional; derived if absent
             "annotation": "1" },                     // optional text under note
           { "keys": ["d/3"], "duration": "qr" }      // r suffix = rest
         ] } ] }

   Pitch convention: like every published bass chart, notation is WRITTEN one
   octave above where the bass actually sounds — the open E string is written
   e/2 (one ledger line below the staff) but sounds E1. Authors write the
   standard written pitch; playback (BTAudio.toEvents) and tab derivation
   transpose down an octave automatically.

   Durations: w h q 8 16 (+ "dots": 1). Tab strings use the tab convention
   str 1 = top line = G … str 4 = low E (theory.js string indices are the
   opposite; BTScore converts when deriving positions).                      */
(function () {
  "use strict";

  const DUR_BEATS = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25, 32: 0.125 };

  function getVF() {
    return (window.Vex && window.Vex.Flow) || window.VexFlow || null;
  }

  /* ---------- Tab-position derivation ---------- */

  // Choose a playable position for each note that has no explicit fret:
  // stay low on the neck and near the previous note's fret.
  function derivePositions(spec) {
    let prevFret = 1;
    for (const measure of spec.measures || []) {
      for (const n of measure.notes || []) {
        if (/r$/.test(String(n.duration)) || n.rest || n.fret) {
          if (n.fret?.length) prevFret = n.fret[0].fret || prevFret;
          continue;
        }
        const midi = window.BT.noteToMidi(n.keys[0]) - 12; // written → sounding
        const options = window.BT.positions(midi, { maxFret: 14, exact: true });
        if (!options.length) { n.fret = []; continue; }
        options.sort((a, b) =>
          (Math.abs(a.fret - prevFret) + a.fret * 0.3) -
          (Math.abs(b.fret - prevFret) + b.fret * 0.3));
        const best = options[0];
        n.fret = [{ str: 4 - best.string, fret: best.fret }];
        if (best.fret > 0) prevFret = best.fret;
      }
    }
  }

  /* ---------- Text-tab fallback (also used for print/file://) ---------- */

  function textTab(spec) {
    derivePositions(spec);
    const lines = { 1: "G|", 2: "D|", 3: "A|", 4: "E|" };
    for (const measure of spec.measures || []) {
      for (const n of measure.notes || []) {
        const rest = /r$/.test(String(n.duration)) || n.rest;
        const pos = n.fret && n.fret[0];
        const width = Math.max(3, String(pos ? pos.fret : "").length + 2);
        for (const s of [1, 2, 3, 4]) {
          if (!rest && pos && pos.str === s) {
            lines[s] += String(pos.fret).padEnd(width, "-");
          } else {
            lines[s] += "-".repeat(width);
          }
        }
      }
      for (const s of [1, 2, 3, 4]) lines[s] += "|";
    }
    return [lines[1], lines[2], lines[3], lines[4]].join("\n");
  }

  /* ---------- VexFlow rendering ---------- */

  function render(el, spec, { showTab = true } = {}) {
    el.replaceChildren();
    el.classList.add("score-block");
    const VF = getVF();
    derivePositions(spec);

    if (!VF) {
      const pre = document.createElement("pre");
      pre.className = "score-fallback";
      pre.textContent = textTab(spec);
      el.appendChild(pre);
      const note = document.createElement("p");
      note.className = "score-caption";
      note.textContent = "(text tab shown — notation rendering needs the vendored VexFlow: npm install)";
      el.appendChild(note);
      return { el };
    }

    const measures = spec.measures || [];
    const [beatsPerBar, beatValue] = (spec.time || "4/4").split("/").map(Number);
    const clef = spec.clef || "bass";
    const key = spec.keySignature || "C";

    const availW = Math.max(320, Math.min(el.clientWidth || 640, 900));
    const perLine = Math.max(1, Math.min(measures.length, Math.floor(availW / 230)));
    const measureW = Math.floor((availW - 12) / perLine);
    const lineCount = Math.ceil(measures.length / perLine);
    const staveH = 78, tabH = showTab ? 74 : 0, lineH = staveH + tabH + 26;

    const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
    renderer.resize(availW, lineCount * lineH + 12);
    const ctx = renderer.getContext();

    measures.forEach((measure, mi) => {
      const line = Math.floor(mi / perLine);
      const col = mi % perLine;
      const x = 4 + col * measureW;
      const y = 6 + line * lineH;
      const lineStart = col === 0;

      const stave = new VF.Stave(x, y, measureW);
      if (lineStart) {
        stave.addClef(clef).addKeySignature(key);
        if (mi === 0 && spec.time) stave.addTimeSignature(spec.time);
      }
      stave.setContext(ctx).draw();

      let tabStave = null;
      if (showTab) {
        // no "TAB" clef glyph — it clips on a 4-line staff, and the numbers
        // under the notation read unambiguously as tab anyway
        tabStave = new VF.TabStave(x, y + staveH, measureW, { num_lines: 4 });
        tabStave.setContext(ctx).draw();
        new VF.StaveConnector(stave, tabStave)
          .setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
      }

      const notes = [];
      const tabNotes = [];
      (measure.notes || []).forEach((n, ni) => {
        const isRest = /r$/.test(String(n.duration)) || n.rest;
        const duration = String(n.duration).replace(/r$/, "") + (isRest ? "r" : "");
        // ghost notes render with an × notehead (key suffix "/x")
        const keys = isRest ? ["d/3"]
          : n.ghost ? n.keys.map((k) => k + "/x") : n.keys;
        const staveNote = new VF.StaveNote({
          clef,
          keys,
          duration,
          auto_stem: true,
        });
        if (n.dots) VF.Dot.buildAndAttach([staveNote], { all: true });
        if (mi !== undefined && ni === 0 && measure.chord) {
          staveNote.addModifier(new VF.Annotation(measure.chord)
            .setFont("sans-serif", 13, "bold")
            .setVerticalJustification(VF.Annotation.VerticalJustify.TOP));
        }
        if (n.annotation) {
          staveNote.addModifier(new VF.Annotation(n.annotation)
            .setFont("sans-serif", 10)
            .setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM));
        }
        notes.push(staveNote);

        if (showTab) {
          if (isRest) {
            // rests occupy time in the tab voice invisibly (ghost rest)
            const gn = new VF.GhostNote({ duration });
            tabNotes.push(gn);
          } else {
            const positions = ((n.fret || []).length ? n.fret : [{ str: 4, fret: 0 }])
              .map((p) => (n.ghost ? { ...p, fret: "X" } : p));
            const tn = new VF.TabNote({
              positions,
              duration: String(n.duration).replace(/r$/, ""),
            });
            if (n.dots) VF.Dot.buildAndAttach([tn], { all: true });
            tabNotes.push(tn);
          }
        }
      });

      const voice = new VF.Voice({ num_beats: beatsPerBar, beat_value: beatValue })
        .setMode(VF.Voice.Mode.SOFT).addTickables(notes);
      const voices = [voice];
      let tabVoice = null;
      if (showTab) {
        tabVoice = new VF.Voice({ num_beats: beatsPerBar, beat_value: beatValue })
          .setMode(VF.Voice.Mode.SOFT).addTickables(tabNotes);
        voices.push(tabVoice);
      }

      VF.Accidental.applyAccidentals([voice], key);
      const beams = VF.Beam.generateBeams(notes);

      const formatter = new VF.Formatter();
      formatter.joinVoices([voice]);
      if (tabVoice) formatter.joinVoices([tabVoice]);
      const noteArea = measureW - (stave.getNoteStartX() - stave.getX()) - 14;
      formatter.format(voices, Math.max(60, noteArea));

      voice.draw(ctx, stave);
      beams.forEach((b) => b.setContext(ctx).draw());
      if (tabVoice) tabVoice.draw(ctx, tabStave);
    });

    // Recolor to currentColor so dark mode / theme toggle work without re-render.
    for (const node of el.querySelectorAll("svg, svg *")) {
      for (const attr of ["fill", "stroke"]) {
        const v = node.getAttribute(attr);
        if (v && v !== "none" && v !== "transparent") node.setAttribute(attr, "currentColor");
      }
      if (node.style) {
        if (node.style.fill && node.style.fill !== "none") node.style.fill = "currentColor";
        if (node.style.stroke && node.style.stroke !== "none") node.style.stroke = "currentColor";
      }
    }

    if (spec.tempo) {
      const cap = document.createElement("p");
      cap.className = "score-caption";
      cap.textContent = `♩ = ${spec.tempo}`;
      el.appendChild(cap);
    }
    return { el };
  }

  /* ---------- Declarative wiring ----------
     Pages can embed specs as JSON and mark targets with data-score:
       <div class="score-block" data-score="ex1"></div>
       <script type="application/json" class="scores">{ "ex1": { … } }</script>
     Each target gets rendered on DOMContentLoaded; pair with a
     [data-play="ex1"] button and BTScore wires playback automatically.      */

  function initDeclarative() {
    const dataEl = document.querySelector('script.scores[type="application/json"]');
    if (!dataEl) return;
    let specs;
    try {
      specs = JSON.parse(dataEl.textContent);
    } catch (err) {
      console.warn("score.js: bad scores JSON", err);
      return;
    }
    document.querySelectorAll("[data-score]").forEach((target) => {
      const spec = specs[target.dataset.score];
      if (spec) render(target, spec, {
        showTab: target.dataset.tab !== "off",
      });
    });
    document.querySelectorAll("[data-play]").forEach((btn) => {
      const spec = specs[btn.dataset.play];
      if (!spec || !window.BTAudio) return;
      let handle = null;
      const label = btn.textContent;
      btn.addEventListener("click", () => {
        if (handle) {
          handle.stop(); handle = null;
          btn.textContent = label;
          return;
        }
        btn.textContent = "■ Stop";
        handle = window.BTAudio.playScore(spec, {
          bpm: Number(btn.dataset.bpm) || spec.tempo || 90,
          onDone() { btn.textContent = label; handle = null; },
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", initDeclarative);

  window.BTScore = { render, textTab, derivePositions };
})();
