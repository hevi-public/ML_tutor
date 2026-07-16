/* Bass Tutor — interactive circle of fifths (SVG). Renders into #cof-demo's
   .cof-wrap: outer ring = major keys, inner ring = relative minors. Clicking a
   key highlights it and its neighbors, reports its key signature, and plays
   its scale root. The host page reads the selection via the "cofselect"
   CustomEvent if it wants to react.                                          */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const MAJORS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
  const MINORS = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "Bbm", "Fm", "Cm", "Gm", "Dm"];

  function polar(cx, cy, r, deg) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function wedge(cx, cy, r0, r1, a0, a1) {
    const [x0, y0] = polar(cx, cy, r1, a0);
    const [x1, y1] = polar(cx, cy, r1, a1);
    const [x2, y2] = polar(cx, cy, r0, a1);
    const [x3, y3] = polar(cx, cy, r0, a0);
    return `M ${x0} ${y0} A ${r1} ${r1} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 0 0 ${x3} ${y3} Z`;
  }

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const host = document.querySelector("#cof-demo .cof-wrap");
    if (!host) return;
    const readout = document.getElementById("cof-readout");

    const svg = el("svg", { viewBox: "0 0 420 420", role: "img" });
    svg.setAttribute("aria-label",
      "Circle of fifths: twelve major keys arranged clockwise by fifths, relative minors inside");
    host.appendChild(svg);

    const segs = [];
    MAJORS.forEach((key, i) => {
      const a0 = i * 30 - 15, a1 = i * 30 + 15;

      const gM = el("g", { class: "cof-seg" }, svg);
      el("path", { d: wedge(210, 210, 130, 195, a0, a1) }, gM);
      const [tx, ty] = polar(210, 210, 163, i * 30);
      const tM = el("text", { x: tx, y: ty + 5 }, gM);
      tM.textContent = key;

      const gm = el("g", { class: "cof-seg minor" }, svg);
      el("path", { d: wedge(210, 210, 72, 128, a0, a1) }, gm);
      const [mx, my] = polar(210, 210, 100, i * 30);
      const tm = el("text", { x: mx, y: my + 4 }, gm);
      tm.textContent = MINORS[i];

      segs.push({ i, key, gM, gm });
      gM.addEventListener("click", () => select(i, "major"));
      gm.addEventListener("click", () => select(i, "minor"));
    });

    const centre = el("text", {
      x: 210, y: 216, "text-anchor": "middle",
      fill: "var(--text-soft)", "font-size": "13",
    }, svg);
    centre.textContent = "tap a key";

    function describe(count) {
      if (count === 0) return "no sharps or flats";
      const what = count > 0 ? "sharp" : "flat";
      const n = Math.abs(count);
      return `${n} ${what}${n > 1 ? "s" : ""}`;
    }

    function select(i, mode) {
      segs.forEach((s) => {
        s.gM.classList.remove("active", "related");
        s.gm.classList.remove("active", "related");
      });
      const s = segs[i];
      const left = segs[(i + 11) % 12], right = segs[(i + 1) % 12];
      if (mode === "major") {
        s.gM.classList.add("active");
        s.gm.classList.add("related");
      } else {
        s.gm.classList.add("active");
        s.gM.classList.add("related");
      }
      left.gM.classList.add("related");
      right.gM.classList.add("related");

      const majorKey = s.key;
      const minorKey = MINORS[i].replace(/m$/, "");
      const sig = window.BT.keySignature(majorKey);
      const label = mode === "major" ? `${majorKey} major` : `${minorKey} minor`;
      centre.textContent = label;

      if (readout) {
        const accList = sig.count === 0 ? "" :
          ` (${sig.accidentals.join(", ")})`;
        readout.innerHTML =
          `<strong>${label}</strong> — ${describe(sig.count)}${accList}. ` +
          `Relative ${mode === "major" ? "minor" : "major"}: ` +
          `<strong>${mode === "major" ? minorKey + " minor" : majorKey + " major"}</strong> — same notes, different home. ` +
          `Fifth up: ${right.key} · fifth down: ${left.key} (each one accidental away).`;
      }

      if (window.BTAudio && window.BT) {
        const rootName = mode === "major" ? majorKey : minorKey;
        const rootMidi = window.BT.noteToMidi(rootName + "2");
        const steps = window.BT.SCALES[mode === "major" ? "major" : "naturalMinor"];
        const events = steps.concat([12]).map((semi, j) =>
          ({ midi: rootMidi + semi, t: j * 0.5, dur: 0.45 }));
        window.BTAudio.playSeq(events, { bpm: 132 });
      }

      host.dispatchEvent(new CustomEvent("cofselect", {
        bubbles: true, detail: { key: mode === "major" ? majorKey : minorKey, mode },
      }));
    }
  });
})();
