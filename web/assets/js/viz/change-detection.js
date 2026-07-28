/* Change-detection visualiser.

   Same component tree, same event, three strategies — the question it answers
   is "which components does Angular actually visit, and why?".

   The rules encoded below:
     zone + Default  every component is checked on every event, wherever it came
                     from. This is why the old default did not scale.
     zone + OnPush   an event marks its own component and every ancestor dirty;
                     only dirty components are checked.
     zoneless        nothing is scheduled by browser activity at all. A signal
                     write marks the views that *read* that signal, and only
                     those are refreshed. Mutating a plain field schedules
                     nothing — which is the migration trap worth seeing.

   Mount: <div class="demo" id="cd-viz"></div> */
(function () {
  "use strict";

  // parent → children. `reads` marks components that read the demo signal.
  const TREE = {
    App:        { children: ["Header", "Sidebar", "Content"], x: 250, y: 10 },
    Header:     { children: [], x: 60, y: 75 },
    Sidebar:    { children: ["FilterList", "UserBadge"], x: 250, y: 75 },
    Content:    { children: ["Table", "Chart"], x: 440, y: 75 },
    FilterList: { children: [], x: 175, y: 145 },
    UserBadge:  { children: [], x: 320, y: 145, reads: true },
    Table:      { children: [], x: 400, y: 145 },
    Chart:      { children: [], x: 520, y: 145 },
  };

  const PARENT = {};
  for (const [name, node] of Object.entries(TREE)) {
    for (const child of node.children) PARENT[child] = name;
  }

  const ancestorsOf = (name) => {
    const out = [];
    for (let n = name; n; n = PARENT[n]) out.push(n);
    return out;
  };

  const EVENTS = {
    click:   { label: "Click a button in Table", origin: "Table",
               kind: "dom", writes: "field" },
    timer:   { label: "setTimeout fires in Chart, sets a plain field", origin: "Chart",
               kind: "async", writes: "field" },
    signal:  { label: "A signal that UserBadge reads changes", origin: "UserBadge",
               kind: "signal", writes: "signal" },
  };

  const MODES = {
    "zone-default": "zone.js + Default",
    "zone-onpush": "zone.js + OnPush",
    "zoneless": "Zoneless + signals",
  };

  /* Returns { checked:Set, rendered:Set, note:string } */
  function simulate(mode, eventKey) {
    const ev = EVENTS[eventKey];
    const all = Object.keys(TREE);

    if (mode === "zone-default") {
      return {
        checked: new Set(all),
        rendered: new Set(ev.writes === "field" || ev.writes === "signal" ? [ev.origin] : []),
        note: `zone.js noticed the ${ev.kind === "signal" ? "change" : ev.kind + " event"} and ` +
              `Angular re-checked <strong>every one of the ${all.length} components</strong>, ` +
              `comparing every binding — to find the one that changed.`,
      };
    }

    if (mode === "zone-onpush") {
      const path = ancestorsOf(ev.origin);
      return {
        checked: new Set(path),
        rendered: new Set([ev.origin]),
        note: `zone.js still scheduled a pass, but OnPush lets Angular skip any ` +
              `component not marked dirty. The event marked <strong>${ev.origin}</strong> ` +
              `and its ancestors, so <strong>${path.length} of ${all.length}</strong> ` +
              `were checked.`,
      };
    }

    // zoneless
    if (ev.writes === "signal") {
      const readers = all.filter((n) => TREE[n].reads);
      const path = new Set(readers.flatMap(ancestorsOf));
      return {
        checked: path,
        rendered: new Set(readers),
        note: `No zone, no guessing. The signal knows <strong>${readers.join(", ")}</strong> ` +
              `read it, so only that view is refreshed — Angular walks down to it and ` +
              `touches nothing else.`,
      };
    }

    return {
      checked: new Set(),
      rendered: new Set(),
      danger: true,
      note: `<strong>Nothing happened at all.</strong> Without zone.js, a ` +
            `${ev.kind === "dom" ? "DOM event handler" : "setTimeout callback"} that ` +
            `mutates a plain field schedules no change detection, so the screen still ` +
            `shows the old value. This is the migration trap: code that worked under ` +
            `zone.js silently stops updating. The fix is to make that state a signal.`,
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    const mount = document.getElementById("cd-viz");
    if (!mount) return;

    mount.innerHTML = `
      <svg viewBox="0 0 600 200" role="img"
           aria-label="A component tree showing which components change detection visits">
        <g class="cd-edges"></g><g class="cd-nodes"></g>
      </svg>
      <div class="controls">
        <div class="control">
          <label for="cd-mode">Strategy</label>
          <select id="cd-mode">${Object.entries(MODES)
            .map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
        </div>
        <div class="control">
          <label for="cd-event">What happens</label>
          <select id="cd-event">${Object.entries(EVENTS)
            .map(([v, e]) => `<option value="${v}">${e.label}</option>`).join("")}</select>
        </div>
      </div>
      <p class="readout" id="cd-readout"></p>
      <p class="hint">
        <span class="cd-key checked"></span> checked (bindings compared) &nbsp;
        <span class="cd-key rendered"></span> actually re-rendered &nbsp;
        <span class="cd-key reads"></span> reads the signal
      </p>`;

    const svg = mount.querySelector("svg");
    const edgesG = svg.querySelector(".cd-edges");
    const nodesG = svg.querySelector(".cd-nodes");
    const readout = mount.querySelector("#cd-readout");
    const modeSel = mount.querySelector("#cd-mode");
    const eventSel = mount.querySelector("#cd-event");
    const NS = "http://www.w3.org/2000/svg";

    function draw() {
      const mode = modeSel.value;
      const result = simulate(mode, eventSel.value);

      edgesG.replaceChildren();
      nodesG.replaceChildren();

      for (const [name, node] of Object.entries(TREE)) {
        for (const child of node.children) {
          const c = TREE[child];
          const line = document.createElementNS(NS, "line");
          line.setAttribute("x1", node.x + 40);
          line.setAttribute("y1", node.y + 30);
          line.setAttribute("x2", c.x + 40);
          line.setAttribute("y2", c.y);
          line.setAttribute("class", "cd-edge" +
            (result.checked.has(child) && result.checked.has(name) ? " active" : ""));
          edgesG.appendChild(line);
        }
      }

      for (const [name, node] of Object.entries(TREE)) {
        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", "cd-node" +
          (result.checked.has(name) ? " checked" : "") +
          (result.rendered.has(name) ? " rendered" : "") +
          (node.reads ? " reads" : ""));

        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x);
        rect.setAttribute("y", node.y);
        rect.setAttribute("width", 80);
        rect.setAttribute("height", 30);
        rect.setAttribute("rx", 5);
        g.appendChild(rect);

        const label = document.createElementNS(NS, "text");
        label.setAttribute("x", node.x + 40);
        label.setAttribute("y", node.y + 19);
        label.setAttribute("class", "cd-label");
        label.textContent = name;
        g.appendChild(label);

        nodesG.appendChild(g);
      }

      readout.innerHTML =
        `<strong>${result.checked.size}</strong> of ` +
        `${Object.keys(TREE).length} components checked. ${result.note}`;
      readout.classList.toggle("danger", Boolean(result.danger));
    }

    modeSel.addEventListener("change", draw);
    eventSel.addEventListener("change", draw);
    draw();
  });
})();
