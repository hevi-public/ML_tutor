/* Marble player — the flattening operators, actually simulated.

   switchMap / mergeMap / concatMap / exhaustMap differ in exactly one respect:
   what happens when a new outer value arrives while an inner stream from a
   previous one is still running. Prose says that; a timeline shows it.

   The simulation below runs in virtual time over a shared source, so the four
   operators are compared on identical input. Each outer marble spawns an inner
   stream of three emissions; the operator decides whether that inner is
   cancelled, queued, ignored, or run alongside the others.

   Mount: <div class="demo" id="marbles"></div> */
(function () {
  "use strict";

  const FRAMES = 60;          // virtual time units drawn across the timeline
  const INNER_GAP = 5;        // frames between an inner stream's emissions
  const INNER_COUNT = 3;

  const OPERATORS = {
    switchMap: {
      label: "switchMap",
      blurb: "Cancels the inner stream still running and switches to the new one. " +
             "The default choice for anything where only the latest matters.",
      use: "Type-ahead search, loading data for the currently selected id.",
    },
    mergeMap: {
      label: "mergeMap",
      blurb: "Runs every inner stream concurrently and interleaves the results. " +
             "Nothing is cancelled and nothing waits — so output order is not input order.",
      use: "Independent parallel work: uploading several files at once.",
    },
    concatMap: {
      label: "concatMap",
      blurb: "Queues each inner stream and runs them strictly in order, one after " +
             "the other. Order is guaranteed; latency accumulates.",
      use: "Writes that must not reorder — a sequence of PATCH requests.",
    },
    exhaustMap: {
      label: "exhaustMap",
      blurb: "Ignores new outer values entirely while an inner stream is running. " +
             "The dropped values are gone, which is usually the point.",
      use: "Submit buttons — the double-click does nothing.",
    },
  };

  // Outer emissions, in frames. Deliberately overlapping so the operators differ.
  const DEFAULT_SOURCE = [2, 10, 14, 34];

  /* Returns { outputs:[{t, from, index}], inners:[{from, start, events:[…], cancelledAt}] } */
  function simulate(op, source) {
    const inners = [];
    const outputs = [];

    const innerEvents = (start) =>
      Array.from({ length: INNER_COUNT }, (_, i) => start + (i + 1) * INNER_GAP);

    if (op === "mergeMap") {
      source.forEach((t, idx) => {
        const events = innerEvents(t);
        inners.push({ from: idx, start: t, events, cancelledAt: null });
        events.forEach((e, i) => outputs.push({ t: e, from: idx, index: i }));
      });
    }

    if (op === "switchMap") {
      source.forEach((t, idx) => {
        const events = innerEvents(t);
        // The previous inner is cancelled the moment this one starts.
        const prev = inners[inners.length - 1];
        if (prev && prev.cancelledAt === null) {
          const last = prev.events[prev.events.length - 1];
          if (t < last) prev.cancelledAt = t;
        }
        inners.push({ from: idx, start: t, events, cancelledAt: null });
      });
      for (const inner of inners) {
        inner.events.forEach((e, i) => {
          if (inner.cancelledAt === null || e < inner.cancelledAt) {
            outputs.push({ t: e, from: inner.from, index: i });
          }
        });
      }
    }

    if (op === "concatMap") {
      let cursor = 0;
      source.forEach((t, idx) => {
        const start = Math.max(t, cursor);
        const events = innerEvents(start);
        inners.push({ from: idx, start, events, cancelledAt: null, queuedFrom: t });
        events.forEach((e, i) => outputs.push({ t: e, from: idx, index: i }));
        cursor = events[events.length - 1];
      });
    }

    if (op === "exhaustMap") {
      let busyUntil = -1;
      source.forEach((t, idx) => {
        if (t <= busyUntil) {
          inners.push({ from: idx, start: t, events: [], ignored: true });
          return;
        }
        const events = innerEvents(t);
        inners.push({ from: idx, start: t, events, cancelledAt: null });
        events.forEach((e, i) => outputs.push({ t: e, from: idx, index: i }));
        busyUntil = events[events.length - 1];
      });
    }

    outputs.sort((a, b) => a.t - b.t);
    return { inners, outputs };
  }

  document.addEventListener("DOMContentLoaded", () => {
    const mount = document.getElementById("marbles");
    if (!mount) return;

    let op = "switchMap";
    let source = [...DEFAULT_SOURCE];
    let playhead = FRAMES;
    let timer = null;

    mount.innerHTML = `
      <div class="buttons mb-ops">${Object.entries(OPERATORS)
        .map(([k, v]) => `<button type="button" class="action ${k === op ? "" : "secondary"}"
              data-op="${k}">${v.label}</button>`).join("")}</div>
      <svg viewBox="0 0 620 230" role="img"
           aria-label="Marble diagram comparing how a flattening operator handles overlapping inner streams">
        <g class="mb-body"></g>
      </svg>
      <div class="buttons">
        <button type="button" class="action" data-act="play">▶ Play</button>
        <button type="button" class="action secondary" data-act="reset">Reset source</button>
      </div>
      <p class="readout" id="mb-readout"></p>
      <p class="hint">Click anywhere on the <strong>source</strong> line to add a
      value; click a marble to remove it. All four operators run on whatever
      source you build.</p>`;

    const svg = mount.querySelector("svg");
    const body = svg.querySelector(".mb-body");
    const readout = mount.querySelector("#mb-readout");
    const NS = "http://www.w3.org/2000/svg";

    const X0 = 40, X1 = 590;
    const xOf = (t) => X0 + (t / FRAMES) * (X1 - X0);
    const tOf = (x) => Math.round(((x - X0) / (X1 - X0)) * FRAMES);

    const COLORS = ["#2563eb", "#a21caf", "#15803d", "#b45309", "#0891b2"];

    function line(y, label, cls) {
      const g = document.createElementNS(NS, "g");
      const l = document.createElementNS(NS, "line");
      l.setAttribute("x1", X0); l.setAttribute("y1", y);
      l.setAttribute("x2", X1); l.setAttribute("y2", y);
      l.setAttribute("class", "mb-line " + (cls || ""));
      g.appendChild(l);

      const arrow = document.createElementNS(NS, "polygon");
      arrow.setAttribute("points", `${X1},${y} ${X1 - 8},${y - 4} ${X1 - 8},${y + 4}`);
      arrow.setAttribute("class", "mb-arrow");
      g.appendChild(arrow);

      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", 4); t.setAttribute("y", y + 4);
      t.setAttribute("class", "mb-axis-label");
      t.textContent = label;
      g.appendChild(t);
      return g;
    }

    function marble(x, y, text, color, cls, onClick) {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "mb-marble " + (cls || ""));
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 9);
      c.setAttribute("fill", color);
      g.appendChild(c);
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", x); t.setAttribute("y", y + 4);
      t.setAttribute("class", "mb-marble-text");
      t.textContent = text;
      g.appendChild(t);
      if (onClick) {
        g.style.cursor = "pointer";
        g.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
      }
      return g;
    }

    function draw() {
      const { inners, outputs } = simulate(op, source);
      body.replaceChildren();

      // source line
      const srcY = 30;
      const srcLine = line(srcY, "source", "clickable");
      srcLine.style.cursor = "crosshair";
      body.appendChild(srcLine);

      source.forEach((t, idx) => {
        if (t > playhead) return;
        body.appendChild(marble(xOf(t), srcY, String(idx + 1), COLORS[idx % COLORS.length],
          "", () => { source = source.filter((s) => s !== t); playhead = FRAMES; draw(); }));
      });

      // inner streams
      inners.forEach((inner, i) => {
        const y = 70 + i * 32;
        if (y > 175) return;
        const g = line(y, `inner ${inner.from + 1}`, "inner");
        body.appendChild(g);

        if (inner.ignored) {
          const t = document.createElementNS(NS, "text");
          t.setAttribute("x", xOf(inner.start) + 12);
          t.setAttribute("y", y + 4);
          t.setAttribute("class", "mb-note ignored");
          t.textContent = "never subscribed — outer value dropped";
          body.appendChild(t);
          return;
        }

        if (inner.queuedFrom != null && inner.queuedFrom < inner.start) {
          const wait = document.createElementNS(NS, "line");
          wait.setAttribute("x1", xOf(inner.queuedFrom));
          wait.setAttribute("y1", y);
          wait.setAttribute("x2", xOf(inner.start));
          wait.setAttribute("y2", y);
          wait.setAttribute("class", "mb-wait");
          body.appendChild(wait);
        }

        for (const [j, e] of inner.events.entries()) {
          if (e > playhead) continue;
          const cancelled = inner.cancelledAt !== null && e >= inner.cancelledAt;
          body.appendChild(marble(xOf(e), y, String(j + 1),
            COLORS[inner.from % COLORS.length], cancelled ? "cancelled" : ""));
        }

        if (inner.cancelledAt !== null && inner.cancelledAt <= playhead) {
          const x = xOf(inner.cancelledAt);
          const cross = document.createElementNS(NS, "path");
          cross.setAttribute("d", `M${x - 6},${y - 6} L${x + 6},${y + 6} M${x + 6},${y - 6} L${x - 6},${y + 6}`);
          cross.setAttribute("class", "mb-cancel");
          body.appendChild(cross);
        }
      });

      // output line
      const outY = 205;
      body.appendChild(line(outY, "output", "output"));
      for (const o of outputs) {
        if (o.t > playhead) continue;
        body.appendChild(marble(xOf(o.t), outY, String(o.index + 1),
          COLORS[o.from % COLORS.length]));
      }

      const dropped = inners.filter((i) => i.ignored).length;
      // != null, not !== null: an ignored inner has no cancelledAt at all, and
      // exhaustMap must never be described as cancelling anything — it drops
      // the outer value instead, which is a different promise to the caller.
      const cancelled = inners.filter((i) => i.cancelledAt != null).length;
      readout.innerHTML =
        `<strong>${OPERATORS[op].label}</strong> — ${OPERATORS[op].blurb} ` +
        `<em>${OPERATORS[op].use}</em><br>` +
        `On this source: <strong>${outputs.length}</strong> values out of ` +
        `${source.length * INNER_COUNT} possible` +
        (cancelled ? `, ${cancelled} inner stream${cancelled > 1 ? "s" : ""} cancelled` : "") +
        (dropped ? `, ${dropped} outer value${dropped > 1 ? "s" : ""} dropped` : "") + ".";
    }

    svg.addEventListener("click", (evt) => {
      const pt = svg.getBoundingClientRect();
      const x = ((evt.clientX - pt.left) / pt.width) * 620;
      const y = ((evt.clientY - pt.top) / pt.height) * 230;
      if (y > 48) return;                    // only the source line is editable
      const t = tOf(x);
      if (t < 0 || t > FRAMES - 16) return;  // leave room for the inner stream
      if (source.some((s) => Math.abs(s - t) < 3)) return;
      source = [...source, t].sort((a, b) => a - b);
      playhead = FRAMES;
      draw();
    });

    mount.querySelectorAll("[data-op]").forEach((btn) => {
      btn.addEventListener("click", () => {
        op = btn.dataset.op;
        mount.querySelectorAll("[data-op]").forEach((b) =>
          b.classList.toggle("secondary", b.dataset.op !== op));
        playhead = FRAMES;
        draw();
      });
    });

    mount.querySelector('[data-act="play"]').addEventListener("click", () => {
      clearInterval(timer);
      playhead = 0;
      draw();
      timer = setInterval(() => {
        playhead += 1;
        draw();
        if (playhead >= FRAMES) clearInterval(timer);
      }, 45);
    });

    mount.querySelector('[data-act="reset"]').addEventListener("click", () => {
      clearInterval(timer);
      source = [...DEFAULT_SOURCE];
      playhead = FRAMES;
      draw();
    });

    draw();
  });
})();
