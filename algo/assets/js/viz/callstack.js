/* Algorithms Tutor — call-stack renderer. Draws the stack of active frames
   from 'call'/'return' step events, so recursion stops being invisible.

   Works from the stepper's snapshots: the page's capture() closure maintains
   a frames array (push on call, pop on return) and snapshots it; this just
   draws whatever stack it's handed, newest frame on top, with the returning
   frame flashed red and the calling frame amber. */
(function () {
  "use strict";

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function create(canvas) {
    const ctx = canvas.getContext("2d");

    function draw(snapshot, event) {
      const frames = snapshot.frames || [];
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const rowH = 30, pad = 8;
      const maxRows = Math.floor((H - pad * 2) / rowH);
      const start = Math.max(0, frames.length - maxRows); // deep stacks: show the top

      ctx.font = "14px ui-monospace, Menlo, monospace";
      ctx.textBaseline = "middle";

      if (!frames.length) {
        ctx.fillStyle = cssVar("--text-soft") || "#888";
        ctx.fillText("(stack empty)", pad + 4, H / 2);
      }

      for (let k = start; k < frames.length; k++) {
        const rowFromBottom = k - start;
        const y = H - pad - (rowFromBottom + 1) * rowH;
        const isTop = k === frames.length - 1;
        let box = cssVar("--bg-inset") || "#eee";
        if (isTop && event) {
          if (event.type === "call") box = cssVar("--accent-soft") || "#d1fae5";
          if (event.type === "return") box = cssVar("--bad-soft") || "#fdd";
        }
        ctx.fillStyle = box;
        ctx.fillRect(pad, y + 3, W - pad * 2, rowH - 6);
        ctx.strokeStyle = isTop ? (cssVar("--accent") || "#047857") : (cssVar("--border") || "#ccc");
        ctx.lineWidth = isTop ? 2 : 1;
        ctx.strokeRect(pad, y + 3, W - pad * 2, rowH - 6);
        ctx.fillStyle = cssVar("--text") || "#222";
        ctx.fillText(frames[k], pad + 10, y + rowH / 2);
      }

      // depth gauge
      ctx.fillStyle = cssVar("--text-soft") || "#888";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`depth: ${frames.length}` + (start ? ` (showing top ${maxRows})` : ""), pad + 2, 12);
    }

    return { draw };
  }

  window.AlgoCallstackViz = { create };
})();
