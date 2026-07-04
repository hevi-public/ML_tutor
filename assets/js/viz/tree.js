/* ML Tutor — decision tree demo: axis-aligned regions from yes/no questions,
   a depth dial to overfit with, the tree's actual questions rendered as a
   flowchart, and a "plant a forest" button that averages 25 shaky trees into
   one steady map. Container: #tree-demo. */
(function () {
  "use strict";

  const ML = window.ML;
  const X_MIN = 0, X_MAX = 10, Y_MIN = 0, Y_MAX = 8;
  const FEATURE_NAMES = ["temperature", "humidity"];

  let view, points, tree, forest = null, depth = 3;
  let root, questionsEl, leavesEl, verdictEl;

  function makeData() {
    // Two classes with genuine structure + a sprinkle of noisy rebels,
    // so deep trees have something tempting to memorize.
    const pts = [
      ...ML.makeBlob(20, 2.8, 5.8, 1.0, 0, 11),
      ...ML.makeBlob(14, 7.5, 5.9, 0.9, 0, 431),
      ...ML.makeBlob(26, 5.0, 2.6, 1.5, 1, 211),
    ];
    for (let i = 0; i < 6; i++) {
      pts.push({
        x: [1.5 + ML.rand.uniform(i + 77) * 7, 1.2 + ML.rand.uniform(i + 999) * 6],
        y: i % 2,
      });
    }
    return pts;
  }

  function refit() {
    tree = new ML.DecisionTree({ maxDepth: depth }).fit(points);
    forest = null;
    draw();
  }

  function draw() {
    view.clear();

    if (forest) {
      view.paintRegions((x, y) => {
        const p = forest.predictProba([x, y]);
        const conf = Math.abs(p - 0.5) * 0.5;
        return p >= 0.5 ? ML.rgba("--accent", conf) : ML.rgba("--bad", conf);
      }, 8);
    } else {
      view.paintRegions((x, y) => {
        const label = tree.predict([x, y]);
        return ML.rgba(label ? "--accent" : "--bad", 0.2);
      }, 8);
    }

    view.grid(2);
    for (const p of points) {
      view.dot(p.x[0], p.x[1], 5, ML.cssVar(p.y ? "--accent" : "--bad"));
    }

    leavesEl.textContent = forest
      ? `${forest.nTrees} trees, voting together`
      : `${tree.leafCount} answer boxes (leaves)`;
    verdictEl.textContent = forest
      ? "the forest's map is smoother — individual trees' memorized noise averages away"
      : depth <= 2
      ? "shallow: broad strokes only — may miss real structure"
      : depth <= 4
      ? "moderate: captures the pattern without chasing every stray dot"
      : "deep: watch it carve tiny boxes around individual noisy dots — memorization, visible";

    renderQuestions();
  }

  // The tree's actual questions, as nested indented text
  function renderQuestions() {
    if (forest) {
      questionsEl.innerHTML = "<em>25 trees each have their own flowchart — too many to show, which is rather the point.</em>";
      return;
    }
    const lines = [];
    (function walk(node, indent) {
      const pad = "&nbsp;".repeat(indent * 4);
      if (node.leaf) {
        lines.push(`${pad}→ say <strong>${node.label ? "class B (blue)" : "class A (red)"}</strong>`
          + ` <span class="soft">(${node.count} dots here, ${(node.purity * 100).toFixed(0)}% agree)</span>`);
        return;
      }
      lines.push(`${pad}Is ${FEATURE_NAMES[node.feature]} ≤ ${node.thresh.toFixed(1)}?`);
      lines.push(`${pad}<span class="soft">yes:</span>`);
      walk(node.left, indent + 1);
      lines.push(`${pad}<span class="soft">no:</span>`);
      walk(node.right, indent + 1);
    })(tree.root, 0);
    questionsEl.innerHTML = lines.join("<br>");
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("tree-demo");
    if (!root) return;
    const canvas = root.querySelector("canvas");
    view = ML.view(canvas, { xMin: X_MIN, xMax: X_MAX, yMin: Y_MIN, yMax: Y_MAX });
    view.onDraw = draw;

    points = makeData();
    questionsEl = root.querySelector('[data-out="questions"]');
    leavesEl = root.querySelector('[data-out="leaves"]');
    verdictEl = root.querySelector('[data-out="verdict"]');

    const slider = root.querySelector('[data-param="depth"]');
    const depthOut = root.querySelector('[data-out="depth"]');
    slider.addEventListener("input", () => {
      depth = +slider.value;
      depthOut.value = depth;
      refit();
    });

    root.querySelector('[data-action="forest"]').addEventListener("click", () => {
      forest = new ML.RandomForest({ nTrees: 25, maxDepth: 7 }).fit(points);
      draw();
    });
    root.querySelector('[data-action="single"]').addEventListener("click", refit);

    tree = new ML.DecisionTree({ maxDepth: depth }).fit(points);
    view.resize();
  });
})();
