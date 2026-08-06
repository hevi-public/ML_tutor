/* Signal dependency graph — a working miniature of Angular's reactive graph.

   This is not an animation of a recording: signal/computed/effect below are a
   real (small) implementation with the same three properties that matter, and
   the diagram is drawn from the graph they actually build. That is the point —
   the recompute counters are real counts, so the two behaviours people find
   surprising can be observed rather than asserted:

     · computed is LAZY. Changing a source marks dependents dirty; nothing
       recomputes until something reads them.
     · propagation is GLITCH-FREE. When two computeds share a source, an effect
       reading both never sees one updated and the other stale — it runs once,
       after the whole graph has settled.

   Mount: <div class="demo" id="signal-graph"></div> */
(function () {
  "use strict";

  /* ---------- a miniature signal system ---------- */

  let activeConsumer = null;   // the computed/effect currently being evaluated
  let batchDepth = 0;
  const pendingEffects = new Set();

  const nodes = [];            // everything, for drawing

  function flush() {
    if (batchDepth > 0) return;
    // Run each dirty effect once, after the graph has settled.
    const toRun = [...pendingEffects];
    pendingEffects.clear();
    for (const e of toRun) e.run();
  }

  function batch(fn) {
    batchDepth++;
    try { fn(); } finally { batchDepth--; flush(); }
  }

  function makeNode(kind, name, extra) {
    const node = {
      kind, name, dependents: new Set(), sources: new Set(),
      computeCount: 0, dirty: false, value: undefined, ...extra,
    };
    nodes.push(node);
    return node;
  }

  function trackRead(node) {
    if (activeConsumer) {
      node.dependents.add(activeConsumer);
      activeConsumer.sources.add(node);
    }
  }

  /* Marking is eager and cheap; recomputing is lazy and happens on read. */
  function markDirty(node) {
    for (const dep of node.dependents) {
      if (dep.kind === "effect") {
        pendingEffects.add(dep);
      } else if (!dep.dirty) {
        dep.dirty = true;
        markDirty(dep);
      }
    }
  }

  function signal(name, initial) {
    const node = makeNode("signal", name, { value: initial });
    const read = () => { trackRead(node); return node.value; };
    read.node = node;
    read.set = (v) => {
      if (Object.is(node.value, v)) return;   // equality check: no change, no work
      node.value = v;
      markDirty(node);
      flush();
    };
    return read;
  }

  function computed(name, fn) {
    const node = makeNode("computed", name, { dirty: true, fn });
    const read = () => {
      trackRead(node);
      if (node.dirty) {
        // Dependencies are re-tracked on every run, so a branch not taken
        // creates no dependency.
        for (const s of node.sources) s.dependents.delete(node);
        node.sources.clear();
        const prev = activeConsumer;
        activeConsumer = node;
        try { node.value = node.fn(); } finally { activeConsumer = prev; }
        node.computeCount++;
        node.dirty = false;
        node.justRan = true;
      }
      return node.value;
    };
    read.node = node;
    return read;
  }

  function effect(name, fn) {
    const node = makeNode("effect", name, { fn });
    node.run = () => {
      for (const s of node.sources) s.dependents.delete(node);
      node.sources.clear();
      const prev = activeConsumer;
      activeConsumer = node;
      try { node.fn(); } finally { activeConsumer = prev; }
      node.computeCount++;
      node.justRan = true;
    };
    node.run();
    return node;
  }

  /* ---------- the demo graph ---------- */

  document.addEventListener("DOMContentLoaded", () => {
    const mount = document.getElementById("signal-graph");
    if (!mount) return;

    const log = [];
    const addLog = (msg) => {
      log.unshift(msg);
      if (log.length > 8) log.pop();
    };

    // first ─┬─ full ── greeting ── effect      (the effect keeps this branch live)
    //        │
    // last  ─┴─ initials                        (nothing reads this until you do)
    //
    // The second branch is the point: with no effect depending on it, `initials`
    // goes dirty and *stays* dirty until the Read button reads it. That is what
    // laziness looks like, and it is invisible in a graph where an effect reads
    // everything.
    const first = signal("first", "Ada");
    const last = signal("last", "Lovelace");
    const full = computed("full", () => `${first()} ${last()}`);
    const initials = computed("initials", () => `${first()[0]}${last()[0]}`);
    const greeting = computed("greeting", () => `Hello, ${full()}!`);
    effect("effect", () => {
      addLog(`effect ran → "${greeting()}"`);
    });

    const LAYOUT = {
      first:    { x: 70,  y: 55,  label: "first" },
      last:     { x: 70,  y: 160, label: "last" },
      full:     { x: 250, y: 70,  label: "full" },
      initials: { x: 250, y: 175, label: "initials" },
      greeting: { x: 425, y: 70,  label: "greeting" },
      effect:   { x: 425, y: 175, label: "effect" },
    };

    mount.innerHTML = `
      <svg viewBox="0 0 560 240" role="img"
           aria-label="Signal dependency graph: two signals feed two computed values, which feed an effect">
        <g class="edges"></g><g class="nodes"></g>
      </svg>
      <div class="controls">
        <div class="control">
          <label for="sg-first">first</label>
          <input id="sg-first" type="text" value="Ada" autocomplete="off">
        </div>
        <div class="control">
          <label for="sg-last">last</label>
          <input id="sg-last" type="text" value="Lovelace" autocomplete="off">
        </div>
      </div>
      <div class="buttons">
        <button type="button" class="action" data-act="read">Read initials</button>
        <button type="button" class="action secondary" data-act="both">Change both (one batch)</button>
        <button type="button" class="action secondary" data-act="same">Set first to the same value</button>
      </div>
      <p class="readout" id="sg-readout"></p>
      <p class="hint">Recompute counts are real. Type in a box, then watch what
      does <em>not</em> run until something reads it.</p>
      <ol class="sg-log" id="sg-log"></ol>`;

    const svg = mount.querySelector("svg");
    const edgesG = svg.querySelector(".edges");
    const nodesG = svg.querySelector(".nodes");
    const readout = mount.querySelector("#sg-readout");
    const logEl = mount.querySelector("#sg-log");

    const NS = "http://www.w3.org/2000/svg";
    const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));

    function draw() {
      edgesG.replaceChildren();
      nodesG.replaceChildren();

      for (const node of nodes) {
        const from = LAYOUT[node.name];
        if (!from) continue;
        for (const dep of node.dependents) {
          const to = LAYOUT[dep.name];
          if (!to) continue;
          const line = document.createElementNS(NS, "line");
          line.setAttribute("x1", from.x + 46);
          line.setAttribute("y1", from.y + 18);
          line.setAttribute("x2", to.x - 46);
          line.setAttribute("y2", to.y + 18);
          line.setAttribute("class", "sg-edge" + (dep.dirty ? " dirty" : ""));
          edgesG.appendChild(line);
        }
      }

      for (const node of nodes) {
        const pos = LAYOUT[node.name];
        if (!pos) continue;

        const g = document.createElementNS(NS, "g");
        g.setAttribute("class",
          `sg-node ${node.kind}` +
          (node.dirty ? " dirty" : "") +
          (node.justRan ? " ran" : ""));

        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", pos.x - 46);
        rect.setAttribute("y", pos.y);
        rect.setAttribute("width", 92);
        rect.setAttribute("height", 36);
        rect.setAttribute("rx", node.kind === "signal" ? 18 : 6);
        g.appendChild(rect);

        const name = document.createElementNS(NS, "text");
        name.setAttribute("x", pos.x);
        name.setAttribute("y", pos.y + 15);
        name.setAttribute("class", "sg-name");
        name.textContent = pos.label;
        g.appendChild(name);

        const meta = document.createElementNS(NS, "text");
        meta.setAttribute("x", pos.x);
        meta.setAttribute("y", pos.y + 29);
        meta.setAttribute("class", "sg-meta");
        meta.textContent = node.kind === "signal"
          ? String(node.value)
          : node.dirty ? "dirty — not run" : `ran ${node.computeCount}×`;
        g.appendChild(meta);

        nodesG.appendChild(g);
        node.justRan = false;
      }

      const dirty = nodes.filter((n) => n.dirty).map((n) => n.name);
      readout.innerHTML = dirty.length
        ? `Stale, waiting to be read: <strong>${dirty.join(", ")}</strong>`
        : `Everything up to date. Recomputes so far — ` +
          `full <strong>${byName.full.computeCount}</strong>, ` +
          `initials <strong>${byName.initials.computeCount}</strong>, ` +
          `greeting <strong>${byName.greeting.computeCount}</strong>, ` +
          `effect <strong>${byName.effect.computeCount}</strong>.`;

      logEl.innerHTML = log.map((l) => `<li>${l}</li>`).join("");
    }

    mount.querySelector("#sg-first").addEventListener("input", (e) => {
      const v = e.target.value || " ";
      addLog(`first.set("${v.trim()}") → marks dependents dirty`);
      first.set(v);
      draw();
    });
    mount.querySelector("#sg-last").addEventListener("input", (e) => {
      const v = e.target.value || " ";
      addLog(`last.set("${v.trim()}") → marks dependents dirty`);
      last.set(v);
      draw();
    });

    mount.querySelector('[data-act="read"]').addEventListener("click", () => {
      const before = byName.initials.computeCount;
      const value = initials();
      addLog(byName.initials.computeCount > before
        ? `read initials → was dirty, recomputed now: "${value}"`
        : `read initials → still cached, no work done`);
      draw();
    });

    mount.querySelector('[data-act="both"]').addEventListener("click", () => {
      const before = byName.effect.computeCount;
      batch(() => {
        first.set("Grace");
        last.set("Hopper");
      });
      addLog(`changed both in one batch → effect ran ` +
        `${byName.effect.computeCount - before}× (never sees a half-updated graph)`);
      mount.querySelector("#sg-first").value = "Grace";
      mount.querySelector("#sg-last").value = "Hopper";
      draw();
    });

    mount.querySelector('[data-act="same"]').addEventListener("click", () => {
      const before = byName.full.computeCount;
      first.set(first());
      addLog(byName.full.computeCount === before && !byName.full.dirty
        ? `set the same value → equality check stopped it, nothing marked dirty`
        : `set the same value → something recomputed (unexpected)`);
      draw();
    });

    draw();
  });
})();
