/* ML Tutor — k-nearest-neighbors demo: move the mouse and watch the k closest
   dots vote on the cursor's class, live. Slider for k; toggle to paint the
   whole map's decision regions. Container: #knn-demo. */
(function () {
  "use strict";

  const ML = window.ML;
  const X_MIN = 0, X_MAX = 10, Y_MIN = 0, Y_MAX = 8;
  const COLORS = ["--bad", "--accent", "--good"];
  const NAMES = ["cats", "dogs", "rabbits"];

  let view, points, k = 3, showRegions = false, cursor = null;
  let root, voteEl;

  function makeData() {
    return [
      ...ML.makeBlob(16, 2.6, 5.6, 1.0, 0, 7),
      ...ML.makeBlob(16, 7.2, 5.4, 1.1, 1, 300),
      ...ML.makeBlob(16, 5.0, 2.2, 1.0, 2, 600),
    ];
  }

  function draw() {
    view.clear();

    if (showRegions) {
      view.paintRegions((x, y) => {
        const { label } = ML.knnPredict(points, k, [x, y]);
        return ML.rgba(COLORS[label], 0.16);
      }, 9);
    }

    view.grid(2);

    // lines from cursor to its k nearest, then the vote
    if (cursor) {
      const { label, neighbors, votes } = ML.knnPredict(points, k, cursor);
      view.ctx.strokeStyle = ML.cssVar("--text-soft");
      view.ctx.setLineDash([4, 4]);
      view.ctx.beginPath();
      const c = view.toPx(cursor[0], cursor[1]);
      for (const { p } of neighbors) {
        const q = view.toPx(p.x[0], p.x[1]);
        view.ctx.moveTo(c.x, c.y);
        view.ctx.lineTo(q.x, q.y);
      }
      view.ctx.stroke();
      view.ctx.setLineDash([]);

      view.dot(cursor[0], cursor[1], 8, ML.rgba(COLORS[label], 0.9));
      view.ctx.strokeStyle = ML.cssVar("--text");
      view.ctx.lineWidth = 2;
      view.ctx.beginPath();
      view.ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
      view.ctx.stroke();

      const tally = Object.entries(votes)
        .sort((a, b) => b[1] - a[1])
        .map(([l, n]) => `${NAMES[l]} ${n}`)
        .join(", ");
      voteEl.textContent = `${tally} → it's a ${NAMES[label].replace(/s$/, "")}`;
    } else {
      voteEl.textContent = "move the mouse over the chart";
    }

    for (const p of points) {
      view.dot(p.x[0], p.x[1], 5, ML.cssVar(COLORS[p.y]));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("knn-demo");
    if (!root) return;
    const canvas = root.querySelector("canvas");
    view = ML.view(canvas, { xMin: X_MIN, xMax: X_MAX, yMin: Y_MIN, yMax: Y_MAX });
    view.onDraw = draw;

    points = makeData();
    voteEl = root.querySelector('[data-out="vote"]');
    const kOut = root.querySelector('[data-out="k"]');
    const slider = root.querySelector('[data-param="k"]');

    slider.addEventListener("input", () => {
      k = +slider.value;
      kOut.value = k;
      draw();
    });

    root.querySelector('[data-action="regions"]').addEventListener("click", (e) => {
      showRegions = !showRegions;
      e.target.textContent = showRegions ? "Hide the map" : "Paint the whole map";
      draw();
    });

    canvas.addEventListener("mousemove", (e) => {
      const d = view.pointerData(e);
      cursor = [d.x, d.y];
      draw();
    });
    canvas.addEventListener("mouseleave", () => { cursor = null; draw(); });
    canvas.addEventListener("click", (e) => {
      // clicking adopts the cursor point into the data with its predicted class
      const d = view.pointerData(e);
      const { label } = ML.knnPredict(points, k, [d.x, d.y]);
      points.push({ x: [d.x, d.y], y: label });
      draw();
    });

    view.resize();
  });
})();
