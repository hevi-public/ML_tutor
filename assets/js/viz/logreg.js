/* ML Tutor — logistic regression demo: two classes of dots, a probability
   landscape painted behind them, and gradient descent finding the boundary
   live. Click to add dots of the selected class. Container: #logreg-demo. */
(function () {
  "use strict";

  const ML = window.ML;
  const X_MIN = 0, X_MAX = 10, Y_MIN = 0, Y_MAX = 8;

  let view, model, points, addClass = 1, training = false;
  let root, lossEl, accEl, trainBtn;

  function makeData() {
    return [
      ...ML.makeBlob(22, 3.2, 5.3, 1.1, 0, 1),     // class 0: "stayed home"
      ...ML.makeBlob(22, 6.8, 2.8, 1.1, 1, 100),   // class 1: "bought ice cream"
    ];
  }

  function draw() {
    view.clear();

    // probability landscape: blue where the model says class 1, red where 0,
    // stronger color = more confident, near-white ribbon = the 50/50 boundary
    view.paintRegions((x, y) => {
      const p = model.predictProba([x, y]);
      const conf = Math.abs(p - 0.5) * 0.55;
      return p >= 0.5 ? ML.rgba("--accent", conf) : ML.rgba("--bad", conf);
    }, 8);

    view.grid(2);

    for (const p of points) {
      view.dot(p.x[0], p.x[1], 5, p.y ? ML.cssVar("--accent") : ML.cssVar("--bad"));
    }

    const loss = model.trainStep(points, 0); // lr 0 = just compute the loss
    lossEl.textContent = loss.toFixed(3);
    accEl.textContent = (model.accuracy(points) * 100).toFixed(0) + "%";
  }

  function train() {
    if (training) return;
    training = true;
    trainBtn.disabled = true;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frames = reduceMotion ? 0 : 90;

    function tick() {
      for (let i = 0; i < (frames > 0 ? 6 : 2000); i++) model.trainStep(points, 0.5);
      draw();
      if (frames-- > 0) requestAnimationFrame(tick);
      else { training = false; trainBtn.disabled = false; }
    }
    tick();
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("logreg-demo");
    if (!root) return;
    const canvas = root.querySelector("canvas");
    view = ML.view(canvas, { xMin: X_MIN, xMax: X_MAX, yMin: Y_MIN, yMax: Y_MAX });
    view.onDraw = draw;

    points = makeData();
    model = new ML.LogReg(2);
    lossEl = root.querySelector('[data-out="loss"]');
    accEl = root.querySelector('[data-out="acc"]');
    trainBtn = root.querySelector('[data-action="train"]');

    trainBtn.addEventListener("click", train);
    root.querySelector('[data-action="reset"]').addEventListener("click", () => {
      points = makeData();
      model = new ML.LogReg(2);
      draw();
    });

    const classBtns = root.querySelectorAll("[data-class]");
    classBtns.forEach((btn) =>
      btn.addEventListener("click", () => {
        addClass = +btn.dataset.class;
        classBtns.forEach((b) => b.classList.toggle("secondary", b !== btn));
      }));

    canvas.addEventListener("click", (e) => {
      const d = view.pointerData(e);
      points.push({ x: [d.x, d.y], y: addClass });
      draw();
    });

    view.resize();
  });
})();
