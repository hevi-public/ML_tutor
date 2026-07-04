/* ML Tutor — k-means demo: unlabeled dots, k guessing-centers, and the
   two-step dance (color the dots, move the centers) run one step at a time
   so the algorithm's whole mind is visible. Container: #kmeans-demo. */
(function () {
  "use strict";

  const ML = window.ML;
  const X_MIN = 0, X_MAX = 10, Y_MIN = 0, Y_MAX = 8;
  const COLORS = ["--accent", "--bad", "--good", "#b08015", "#8b5cf6", "#0e9494"];

  let view, km, seed = 1, k = 3, phase = "assign"; // which step comes next
  let root, inertiaEl, phaseEl, stepBtn;

  function color(ci, alpha) {
    const c = COLORS[ci % COLORS.length];
    return c.startsWith("--") ? (alpha != null ? ML.rgba(c, alpha) : ML.cssVar(c)) : c;
  }

  function makeData() {
    return [
      ...ML.makeBlob(18, 2.4, 5.9, 0.8, -1, 21),
      ...ML.makeBlob(18, 7.4, 5.6, 0.9, -1, 500),
      ...ML.makeBlob(18, 4.8, 1.9, 0.8, -1, 900),
    ];
  }

  const points = makeData();
  let assigned = false; // dots stay gray until the first assign step

  function restart() {
    km = new ML.KMeans(k, points, seed);
    phase = "assign";
    assigned = false;
    updatePhaseUI();
    draw();
  }

  function draw() {
    view.clear();
    view.grid(2);

    points.forEach((p, i) => {
      const fill = assigned ? color(km.labels[i]) : ML.cssVar("--text-soft");
      view.dot(p.x[0], p.x[1], 5, fill);
    });

    // centers as big X marks
    km.centers.forEach((c, ci) => {
      const px = view.toPx(c[0], c[1]);
      view.ctx.strokeStyle = color(ci);
      view.ctx.lineWidth = 3.5;
      view.ctx.beginPath();
      view.ctx.moveTo(px.x - 9, px.y - 9); view.ctx.lineTo(px.x + 9, px.y + 9);
      view.ctx.moveTo(px.x + 9, px.y - 9); view.ctx.lineTo(px.x - 9, px.y + 9);
      view.ctx.stroke();
    });

    inertiaEl.textContent = assigned ? km.inertia().toFixed(1) : "–";
  }

  function updatePhaseUI(doneMsg) {
    if (doneMsg) {
      phaseEl.textContent = doneMsg;
      stepBtn.textContent = "Settled — press restart to try again";
      stepBtn.disabled = true;
      return;
    }
    stepBtn.disabled = false;
    if (phase === "assign") {
      phaseEl.textContent = "next: every dot joins its nearest ✕";
      stepBtn.textContent = "Step 1: color the dots";
    } else {
      phaseEl.textContent = "next: every ✕ moves to the middle of its dots";
      stepBtn.textContent = "Step 2: move the centers";
    }
  }

  function step() {
    if (phase === "assign") {
      const changed = km.assign();
      const firstRound = !assigned;
      assigned = true;
      if (!firstRound && changed === 0) {
        draw();
        updatePhaseUI("no dot wants to switch — k-means has settled");
        return;
      }
      phase = "update";
    } else {
      km.update();
      phase = "assign";
    }
    updatePhaseUI();
    draw();
  }

  function runToEnd() {
    if (!assigned) km.assign();
    assigned = true;
    for (let i = 0; i < 100; i++) {
      km.update();
      if (km.assign() === 0) break;
    }
    draw();
    updatePhaseUI("no dot wants to switch — k-means has settled");
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("kmeans-demo");
    if (!root) return;
    const canvas = root.querySelector("canvas");
    view = ML.view(canvas, { xMin: X_MIN, xMax: X_MAX, yMin: Y_MIN, yMax: Y_MAX });
    view.onDraw = draw;

    inertiaEl = root.querySelector('[data-out="inertia"]');
    phaseEl = root.querySelector('[data-out="phase"]');
    stepBtn = root.querySelector('[data-action="step"]');

    stepBtn.addEventListener("click", step);
    root.querySelector('[data-action="run"]').addEventListener("click", runToEnd);
    root.querySelector('[data-action="restart"]').addEventListener("click", () => {
      seed++;
      restart();
    });

    const slider = root.querySelector('[data-param="k"]');
    const kOut = root.querySelector('[data-out="k"]');
    slider.addEventListener("input", () => {
      k = +slider.value;
      kOut.value = k;
      restart();
    });

    km = new ML.KMeans(k, points, seed);
    updatePhaseUI();
    view.resize();
  });
})();
