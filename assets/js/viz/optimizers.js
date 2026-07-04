/* ML Tutor — optimizer race: SGD, momentum, and Adam descend the same
   narrow valley from the same start. The valley is steep across, shallow
   along — the classic terrain where plain SGD zigzags and struggles.
   Container: #optim-demo. */
(function () {
  "use strict";

  const ML = window.ML;
  const X_MIN = -10, X_MAX = 2, Y_MIN = -3, Y_MAX = 3;
  const START = [-9, 2.2];
  const GOAL_EPS = 0.02;

  // Steep in y, gentle in x: L = 0.02·x² + y². Minimum at (0, 0).
  const f = (x, y) => 0.02 * x * x + y * y;
  const grad = (x, y) => [0.04 * x, 2 * y];

  const RACERS = {
    sgd: {
      name: "SGD", color: "--bad",
      init: () => ({}),
      step(p, g, s, lr) { return [p[0] - lr * g[0], p[1] - lr * g[1]]; },
    },
    momentum: {
      name: "Momentum", color: "--good",
      init: () => ({ v: [0, 0] }),
      step(p, g, s, lr) {
        s.v = [0.9 * s.v[0] - lr * g[0], 0.9 * s.v[1] - lr * g[1]];
        return [p[0] + s.v[0], p[1] + s.v[1]];
      },
    },
    adam: {
      name: "Adam", color: "--accent",
      init: () => ({ m: [0, 0], v: [0, 0], t: 0 }),
      step(p, g, s, lr) {
        s.t++;
        const out = [0, 0];
        for (let i = 0; i < 2; i++) {
          s.m[i] = 0.9 * s.m[i] + 0.1 * g[i];
          s.v[i] = 0.999 * s.v[i] + 0.001 * g[i] * g[i];
          const mh = s.m[i] / (1 - 0.9 ** s.t);
          const vh = s.v[i] / (1 - 0.999 ** s.t);
          out[i] = p[i] - (lr * 3) * mh / (Math.sqrt(vh) + 1e-8);
        }
        return out;
      },
    },
  };

  let view, root, lr = 0.4, racers = null, running = false, tick = 0;

  function reset() {
    running = false;
    tick = 0;
    racers = Object.entries(RACERS).map(([key, def]) => ({
      key, def,
      pos: [...START],
      state: def.init(),
      trail: [[...START]],
      done: false, steps: 0,
    }));
    draw();
  }

  function drawContours() {
    // shade by loss value — dark valley floor, light rim
    const ctx = view.ctx;
    const cell = 8;
    for (let px = 0; px < view.width(); px += cell) {
      for (let py = 0; py < view.height(); py += cell) {
        const d = view.toData(px + cell / 2, py + cell / 2);
        const v = Math.min(1, f(d.x, d.y) / 9);
        ctx.fillStyle = ML.rgba("--text-soft", 0.04 + v * 0.3);
        ctx.fillRect(px, py, cell, cell);
      }
    }
    // goal marker
    const g = view.toPx(0, 0);
    view.ctx.strokeStyle = ML.cssVar("--text");
    view.ctx.lineWidth = 1.5;
    view.ctx.beginPath();
    view.ctx.arc(g.x, g.y, 7, 0, Math.PI * 2);
    view.ctx.stroke();
  }

  function draw() {
    view.clear();
    drawContours();

    for (const r of racers) {
      const color = ML.cssVar(r.def.color);
      view.ctx.strokeStyle = color;
      view.ctx.lineWidth = 2;
      view.ctx.beginPath();
      r.trail.forEach(([x, y], i) => {
        const p = view.toPx(x, y);
        i ? view.ctx.lineTo(p.x, p.y) : view.ctx.moveTo(p.x, p.y);
      });
      view.ctx.stroke();
      view.dot(r.pos[0], r.pos[1], 6, color);
    }

    for (const r of racers) {
      const el = root.querySelector(`[data-out="${r.key}"]`);
      el.textContent = r.done
        ? `arrived in ${r.steps} steps`
        : `loss ${f(r.pos[0], r.pos[1]).toFixed(3)} after ${r.steps} steps`;
    }
  }

  // One tick for every racer; returns true when the race is over
  function stepAll() {
    tick++;
    for (const r of racers) {
      if (r.done) continue;
      const g = grad(r.pos[0], r.pos[1]);
      r.pos = r.def.step(r.pos, g, r.state, lr);
      // clamp runaway divergence so the chart stays readable
      r.pos[0] = Math.max(X_MIN - 2, Math.min(X_MAX + 2, r.pos[0]));
      r.pos[1] = Math.max(Y_MIN - 2, Math.min(Y_MAX + 2, r.pos[1]));
      r.trail.push([...r.pos]);
      r.steps++;
      if (f(r.pos[0], r.pos[1]) < GOAL_EPS) r.done = true;
    }
    return racers.every((r) => r.done) || tick > 900;
  }

  function animate() {
    if (!running) return;
    const over = stepAll();
    draw();
    if (over) { running = false; return; }
    requestAnimationFrame(animate);
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("optim-demo");
    if (!root) return;
    view = ML.view(root.querySelector("canvas"),
      { xMin: X_MIN, xMax: X_MAX, yMin: Y_MIN, yMax: Y_MAX, aspect: 0.5 });
    view.onDraw = draw;

    const lrS = root.querySelector('[data-param="lr"]');
    const lrO = root.querySelector('[data-out="lr"]');
    lrS.addEventListener("input", () => {
      lr = +lrS.value;
      lrO.value = lr.toFixed(2);
      reset();
    });

    root.querySelector('[data-action="race"]').addEventListener("click", () => {
      reset();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        while (!stepAll()) { /* run the whole race instantly */ }
        draw();
      } else {
        running = true;
        animate();
      }
    });

    reset();
    view.resize();
  });
})();
