/* Bass Tutor — interactive SVG fretboard. Renders a 4-string neck (G on top,
   low E at the bottom, like every chord chart), realistic fret spacing, inlay
   dots, tappable cells that play through BTAudio, and markable note positions.

   const fb = BTFret.create(el, { frets: 12, onTap(pos) {...} });
   fb.mark([{ string: 1, fret: 3, label: "C", cls: "root" }]);
   fb.markPcs([0, 4, 7], { rootPc: 0 });        // mark a chord/scale everywhere
   fb.clear();

   String indices follow theory.js: 0 = low E … 3 = G. All colors come from
   CSS classes (fb-*) so themes just work.                                   */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs = {}, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function create(container, opts = {}) {
    const o = {
      tuning: window.BT.TUNINGS.bass4,
      frets: 12,
      names: false,          // label every tap target with its note name
      interactive: true,     // taps play the note
      playOnTap: true,
      onTap: null,
      ...opts,
    };

    const strings = o.tuning.length;
    const LEFT = 46;               // room for open-string labels
    const NUT = LEFT + 14;
    const RIGHT = 24;
    const TOP = 18;
    const GAP = 38;                // between strings
    const BOTTOM = 34;             // room for fret numbers
    const W = 900;
    const H = TOP + (strings - 1) * GAP + BOTTOM;
    const boardW = W - NUT - RIGHT;

    // Real spacing: fret n sits at 1 - 2^(-n/12), normalized to the neck width.
    const full = 1 - Math.pow(2, -o.frets / 12);
    const fretX = (n) => NUT + boardW * ((1 - Math.pow(2, -n / 12)) / full);
    const cellX = (fret) => fret === 0
      ? LEFT - 14                              // open notes sit left of the nut
      : (fretX(fret - 1) + fretX(fret)) / 2;
    // string 0 (low E) at the bottom
    const stringY = (s) => TOP + (strings - 1 - s) * GAP;

    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`,
      role: container.getAttribute("role") ? null : "img",
    });
    svg.classList.add("fretboard");
    container.appendChild(svg);

    // board background
    el("rect", {
      class: "fb-board", x: NUT, y: TOP - 12,
      width: boardW, height: (strings - 1) * GAP + 24, rx: 3,
    }, svg);

    // frets + numbers
    for (let f = 1; f <= o.frets; f++) {
      el("line", { class: "fb-fret", x1: fretX(f), y1: TOP - 12,
                   x2: fretX(f), y2: TOP + (strings - 1) * GAP + 12 }, svg);
    }
    el("line", { class: "fb-nut", x1: NUT, y1: TOP - 12,
                 x2: NUT, y2: TOP + (strings - 1) * GAP + 12 }, svg);

    // inlays
    const midY = TOP + ((strings - 1) * GAP) / 2;
    for (const f of [3, 5, 7, 9, 12, 15, 17, 19, 21]) {
      if (f > o.frets) break;
      if (f === 12) {
        el("circle", { class: "fb-inlay", cx: cellX(f), cy: midY - GAP, r: 5 }, svg);
        el("circle", { class: "fb-inlay", cx: cellX(f), cy: midY + GAP, r: 5 }, svg);
      } else {
        el("circle", { class: "fb-inlay", cx: cellX(f), cy: midY, r: 5 }, svg);
      }
      const num = el("text", { class: "fb-fretnum", x: cellX(f),
                               y: TOP + (strings - 1) * GAP + 28,
                               "text-anchor": "middle" }, svg);
      num.textContent = f;
    }

    // strings (thicker = lower) + open-string labels
    for (let s = 0; s < strings; s++) {
      el("line", {
        class: "fb-string", x1: LEFT, y1: stringY(s), x2: W - RIGHT, y2: stringY(s),
        "stroke-width": 4.5 - s,
      }, svg);
      const lbl = el("text", { class: "fb-openlbl", x: 14, y: stringY(s) + 4 }, svg);
      lbl.textContent = o.tuning[s].replace(/\d+$/, "");
    }

    const marksLayer = el("g", {}, svg);
    const hitsLayer = el("g", {}, svg);

    function flash(string, fret) {
      const g = el("g", { class: "fb-note mark" }, svg);
      el("circle", { cx: cellX(fret), cy: stringY(string), r: 13 }, g);
      setTimeout(() => g.remove(), 350);
    }

    // invisible tap targets over every cell (including open strings)
    if (o.interactive) {
      for (let s = 0; s < strings; s++) {
        for (let f = 0; f <= o.frets; f++) {
          const r = el("rect", {
            x: f === 0 ? LEFT - 28 : fretX(f - 1),
            y: stringY(s) - GAP / 2,
            width: f === 0 ? NUT - LEFT + 26 : fretX(f) - fretX(f - 1),
            height: GAP,
            fill: "transparent",
            "data-string": s, "data-fret": f,
          }, hitsLayer);
          r.style.cursor = "pointer";
          r.addEventListener("click", () => {
            const pos = { string: s, fret: f, ...window.BT.noteAt(s, f, o.tuning) };
            if (o.playOnTap && window.BTAudio) window.BTAudio.pluck(pos.midi);
            flash(s, f);
            o.onTap?.(pos);
          });
        }
      }
    }

    const api = {
      el: svg,
      opts: o,

      // marks: [{ string, fret, label?, cls? }] — cls: root|mark|good|dim
      mark(marks) {
        for (const m of marks) {
          const g = el("g", { class: `fb-note ${m.cls || "mark"}` }, marksLayer);
          el("circle", { cx: cellX(m.fret), cy: stringY(m.string), r: 13 }, g);
          const label = m.label !== undefined
            ? m.label
            : window.BT.noteAt(m.string, m.fret, o.tuning).name.replace(/\d+$/, "");
          if (label) {
            const t = el("text", { x: cellX(m.fret), y: stringY(m.string) + 4 }, g);
            t.textContent = label;
          }
        }
        return api;
      },

      // Mark every position of the given pitch classes; the root gets .root.
      markPcs(pcs, { rootPc = null, maxFret = o.frets, labels = "names" } = {}) {
        for (const p of pcs) {
          const marks = window.BT.positions(p, { tuning: o.tuning, maxFret })
            .map((pos) => ({
              ...pos,
              cls: p === rootPc ? "root" : "mark",
              label: labels === "names"
                ? window.BT.midiToNote(pos.midi).replace(/\d+$/, "")
                : labels === "none" ? "" : undefined,
            }));
          api.mark(marks);
        }
        return api;
      },

      clear() {
        marksLayer.replaceChildren();
        return api;
      },

      destroy() {
        svg.remove();
      },
    };

    return api;
  }

  window.BTFret = { create };
})();
