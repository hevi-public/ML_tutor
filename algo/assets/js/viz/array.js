/* Algorithms Tutor — array renderer: bars on a canvas, colored by what the
   current step event is doing. The stepper hands it (snapshot, event, index);
   it draws the whole state each frame (teaching-sized inputs, so a full
   redraw is cheap and scrubbing backwards costs nothing).

   Colors: comparing = amber outline, swapping/writing = red fill,
   focus region = tinted band, settled ('sorted' positions seen so far are the
   caller's business — pass them in the snapshot as `sortedUpTo`/`sortedSet`
   if the page wants them shown green; simplest pages skip it). */
(function () {
  "use strict";

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function create(canvas) {
    const ctx = canvas.getContext("2d");

    function draw(snapshot, event) {
      const a = snapshot.array;
      const n = a.length;
      const W = canvas.width, H = canvas.height;
      const max = snapshot.max || Math.max(...a, 1);
      const gap = n > 60 ? 0 : 2;
      const barW = (W - 8) / n;

      ctx.clearRect(0, 0, W, H);

      // focus band (binary search's lo..hi, a sort's current sub-array)
      if (event && event.type === "focus") {
        ctx.fillStyle = cssVar("--accent-soft") || "#d1fae5";
        ctx.fillRect(4 + event.lo * barW, 0, (event.hi - event.lo + 1) * barW, H);
      }

      for (let i = 0; i < n; i++) {
        const h = Math.max(2, (a[i] / max) * (H - 14));
        let fill = cssVar("--text-soft") || "#889";
        if (snapshot.sorted && snapshot.sorted.has(i)) fill = cssVar("--good") || "#15803d";
        if (event) {
          if ((event.type === "swap" || event.type === "set") &&
              (event.i === i || event.j === i)) fill = cssVar("--bad") || "#b91c1c";
          else if (event.type === "compare" && (event.i === i || event.j === i))
            fill = "#d97706";
          else if (event.type === "found" && event.i === i) fill = cssVar("--good") || "#15803d";
          else if (event.type === "focus" && event.mid === i) fill = "#d97706";
        }
        ctx.fillStyle = fill;
        ctx.fillRect(4 + i * barW, H - 8 - h, Math.max(1, barW - gap), h);
      }

      // baseline
      ctx.fillStyle = cssVar("--border") || "#ccc";
      ctx.fillRect(0, H - 6, W, 1);
    }

    return { draw };
  }

  window.AlgoArrayViz = { create };
})();
