/* Git Tutor — the commit graph.  window.GTDag

   Hand-rolled inline SVG, in the same idiom as the site's concept map: no
   library, one <svg viewBox> with circles and paths, styled by CSS custom
   properties so it themes with the rest of the site.

   What it draws that matters pedagogically:
     · lanes per branch, with the first-parent spine emphasised
     · ref pills (branches, tags, remote-tracking refs) and the HEAD arrow,
       drawn dashed when HEAD is detached
     · commits that no ref points to any more, dimmed — the payoff of the
       reflog and fsck lessons is seeing that they are still there

   Accessibility: the SVG carries a generated summary as its label, and the same
   graph is rendered as an ordered list inside a <details> so it can be read
   linearly. Re-renders are debounced, and transitions respect
   prefers-reduced-motion via the stylesheet.                                 */
(function (root) {
  "use strict";

  const GT = root.GT;
  const P = () => root.GTPlumb;

  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value));
    }
    return node;
  };

  /* ---------- building the graph ---------- */

  /**
   * Collect commits worth drawing and lay them out.
   * `includeUnreachable` adds commits that only the reflog still remembers.
   */
  async function build(dir, options = {}) {
    const max = options.max || 40;
    const refs = await P().allRefs(dir);
    const tips = refs.filter((r) => r.oid && r.full !== "HEAD").map((r) => r.oid);
    const headOid = await GT.resolve(dir, "HEAD");
    if (headOid) tips.push(headOid);

    const reachable = new Set();
    const commits = new Map();
    for (const tip of tips) {
      for (const entry of await P().ancestors(dir, tip)) {
        reachable.add(entry.oid);
        commits.set(entry.oid, entry.commit);
      }
    }

    const stranded = new Set();
    if (options.includeUnreachable) {
      for (const ref of ["HEAD", ...refs.filter((r) => r.kind === "branch").map((r) => r.full)]) {
        for (const entry of await GT.readReflog(dir, ref)) {
          for (const oid of [entry.oldOid, entry.newOid]) {
            if (!oid || oid === GT.ZERO || reachable.has(oid)) continue;
            try {
              const { commit } = await root.git.readCommit({ ...GT.ctx(dir), oid });
              commits.set(oid, commit);
              stranded.add(oid);
            } catch { /* gone for good */ }
          }
        }
      }
    }

    // Newest first, and trimmed: a lesson graph should fit on screen.
    const ordered = [...commits.entries()]
      .map(([oid, commit]) => ({ oid, commit }))
      .sort((a, b) => b.commit.committer.timestamp - a.commit.committer.timestamp)
      .slice(0, max);
    const kept = new Set(ordered.map((n) => n.oid));

    // Lane assignment: walk newest → oldest, keeping each chain in its column.
    const lanes = [];
    const laneOf = new Map();
    for (const node of ordered) {
      let lane = laneOf.get(node.oid);
      if (lane === undefined) {
        lane = lanes.findIndex((occupant) => occupant === null || occupant === node.oid);
        if (lane === -1) lane = lanes.length;
        laneOf.set(node.oid, lane);
      }
      lanes[lane] = null;
      const [first, ...others] = node.commit.parent;
      if (first && kept.has(first) && !laneOf.has(first)) {
        laneOf.set(first, lane);
        lanes[lane] = first;
      }
      for (const other of others) {
        if (!kept.has(other) || laneOf.has(other)) continue;
        let free = lanes.findIndex((occupant) => occupant === null);
        if (free === -1) free = lanes.length;
        laneOf.set(other, free);
        lanes[free] = other;
      }
    }

    const head = refs.find((r) => r.full === "HEAD");
    const nodes = ordered.map((node, index) => ({
      oid: node.oid,
      short: node.oid.slice(0, 7),
      subject: node.commit.message.split("\n")[0],
      author: node.commit.author.name,
      timestamp: node.commit.committer.timestamp,
      parents: node.commit.parent.filter((p) => kept.has(p)),
      lane: laneOf.get(node.oid) || 0,
      row: index,
      unreachable: stranded.has(node.oid),
      isHead: node.oid === headOid,
      refs: refs
        .filter((r) => r.oid === node.oid && r.full !== "HEAD")
        .map((r) => ({ name: r.name, kind: r.kind })),
    }));

    return {
      nodes,
      head: head && head.detached ? { detached: true, oid: headOid } : {
        detached: false,
        branch: head && head.points ? head.points.replace("refs/heads/", "") : null,
        oid: headOid,
      },
      laneCount: Math.max(1, ...nodes.map((n) => n.lane + 1)),
    };
  }

  /* ---------- drawing ---------- */

  const ROW = 46;
  const LANE = 34;
  const LEFT = 26;
  const TOP = 26;

  function draw(host, graph, options = {}) {
    host.innerHTML = "";
    host.classList.add("dag");

    if (!graph.nodes.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No commits yet — this repository has an empty history.";
      host.appendChild(empty);
      return;
    }

    const labelLeft = LEFT + graph.laneCount * LANE + 14;
    const width = Math.max(560, labelLeft + 320);
    const height = TOP * 2 + (graph.nodes.length - 1) * ROW;

    const wrap = document.createElement("div");
    wrap.className = "dag-scroll";
    const svg = svgEl("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width: "100%",
      height,
      role: "img",
      "aria-label": summarize(graph),
    });

    const x = (lane) => LEFT + lane * LANE;
    const y = (row) => TOP + row * ROW;
    const byOid = new Map(graph.nodes.map((n) => [n.oid, n]));

    // Edges first, so nodes sit on top of them.
    for (const node of graph.nodes) {
      node.parents.forEach((parentOid, index) => {
        const parent = byOid.get(parentOid);
        if (!parent) return;
        const x1 = x(node.lane);
        const y1 = y(node.row);
        const x2 = x(parent.lane);
        const y2 = y(parent.row);
        const path = x1 === x2
          ? `M ${x1} ${y1} L ${x2} ${y2}`
          // A curve when the lane changes, so merges and branch points read.
          : `M ${x1} ${y1} C ${x1} ${y1 + ROW * 0.5}, ${x2} ${y2 - ROW * 0.5}, ${x2} ${y2}`;
        svg.appendChild(svgEl("path", {
          d: path,
          class: `dag-edge${index > 0 ? " dag-edge-merge" : ""}` +
            (node.unreachable || parent.unreachable ? " dag-edge-lost" : ""),
          fill: "none",
        }));
      });
    }

    for (const node of graph.nodes) {
      const group = svgEl("g", {
        class: `dag-node${node.unreachable ? " dag-lost" : ""}${node.isHead ? " dag-at-head" : ""}`,
        tabindex: "0",
        role: "button",
        "aria-label": `${node.short} ${node.subject}` +
          (node.unreachable ? " (no branch points here)" : ""),
      });

      group.appendChild(svgEl("circle", {
        cx: x(node.lane), cy: y(node.row), r: node.isHead ? 8 : 6, class: "dag-dot",
      }));

      const label = svgEl("text", {
        x: labelLeft, y: y(node.row) + 4, class: "dag-label",
      });
      const oid = svgEl("tspan", { class: "dag-oid" });
      oid.textContent = node.short;
      label.appendChild(oid);
      const subject = svgEl("tspan", { class: "dag-subject", dx: "8" });
      subject.textContent = node.subject.length > 38
        ? node.subject.slice(0, 37) + "…"
        : node.subject;
      label.appendChild(subject);
      group.appendChild(label);

      // Ref pills to the left of the graph, HEAD first.
      let pillX = 0;
      const pills = [];
      if (node.isHead) {
        pills.push({
          text: graph.head.detached ? "HEAD (detached)" : "HEAD",
          kind: graph.head.detached ? "head-detached" : "head",
        });
      }
      for (const ref of node.refs) {
        pills.push({ text: ref.name, kind: ref.kind });
      }
      if (node.unreachable) pills.push({ text: "no ref", kind: "lost" });

      for (const pill of pills) {
        const chars = pill.text.length;
        const w = 12 + chars * 7;
        const px = labelLeft + 250 + pillX;
        group.appendChild(svgEl("rect", {
          x: px, y: y(node.row) - 11, width: w, height: 22, rx: 11,
          class: `dag-pill dag-pill-${pill.kind}`,
        }));
        const t = svgEl("text", {
          x: px + w / 2, y: y(node.row) + 4, class: "dag-pill-text",
          "text-anchor": "middle",
        });
        t.textContent = pill.text;
        group.appendChild(t);
        pillX += w + 6;
      }

      if (options.onSelect) {
        const select = () => options.onSelect(node);
        group.addEventListener("click", select);
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select();
          }
        });
      }
      svg.appendChild(group);
    }

    wrap.appendChild(svg);
    host.appendChild(wrap);
    host.appendChild(asText(graph));
  }

  function summarize(graph) {
    const tips = graph.nodes.flatMap((n) => n.refs.map((r) => r.name));
    const lost = graph.nodes.filter((n) => n.unreachable).length;
    return `Commit graph: ${graph.nodes.length} commits` +
      (tips.length ? `, refs ${tips.join(", ")}` : "") +
      (graph.head.detached ? ", HEAD detached" : `, HEAD on ${graph.head.branch}`) +
      (lost ? `, ${lost} commit(s) with no ref` : "") + ".";
  }

  /** The same graph, linearly, for screen readers and for copying into notes. */
  function asText(graph) {
    const details = document.createElement("details");
    details.className = "dag-text";
    details.appendChild(Object.assign(document.createElement("summary"), {
      textContent: "Show this graph as text",
    }));
    const list = document.createElement("ol");
    for (const node of graph.nodes) {
      const item = document.createElement("li");
      const refs = node.refs.map((r) => r.name);
      if (node.isHead) refs.unshift(graph.head.detached ? "HEAD (detached)" : "HEAD");
      item.textContent = `${node.short} — "${node.subject}"` +
        (node.parents.length ? ` — parent ${node.parents.map((p) => p.slice(0, 7)).join(", ")}` : " — root commit") +
        (refs.length ? ` — refs: ${refs.join(", ")}` : "") +
        (node.unreachable ? " — no ref points here" : "");
      list.appendChild(item);
    }
    details.appendChild(list);
    return details;
  }

  /* ---------- the mounted, self-refreshing view ---------- */

  function mount(host, options = {}) {
    const { dir } = options;
    let pending = null;

    async function render() {
      const graph = await build(dir, options);
      draw(host, graph, options);
      return graph;
    }

    // Commands arrive in bursts (a rebase moves refs several times); coalesce.
    function refresh() {
      if (pending) clearTimeout(pending);
      return new Promise((resolve) => {
        pending = setTimeout(() => {
          pending = null;
          render().then(resolve);
        }, 30);
      });
    }

    render();
    return { refresh, render };
  }

  root.GTDag = { mount, build, draw };
})(window);
