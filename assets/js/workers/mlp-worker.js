/* ML Tutor — MLP playground trainer. Runs in a Web Worker so thousands of
   gradient steps never freeze the page. Protocol:
     in:  { type: "start", config: { sizes, activation, lr, dataset, seed } }
          { type: "stop" }
     out: { type: "progress", step, loss, acc, grid: Float32Array, gw, gh }
   The grid is the network's probability over the whole [-6,6]² domain,
   computed here so the main thread only ever paints. */
"use strict";

importScripts("../ml/matrix.js", "../ml/mlp.js", "../ml/datasets.js");

const GRID_W = 56, GRID_H = 56;
const DOMAIN = 6; // x,y in [-DOMAIN, DOMAIN]

let net = null;
let points = null;
let config = null;
let step = 0;
let running = false;

function probabilityGrid() {
  const grid = new Float32Array(GRID_W * GRID_H);
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const x = -DOMAIN + ((gx + 0.5) / GRID_W) * DOMAIN * 2;
      const y = -DOMAIN + ((gy + 0.5) / GRID_H) * DOMAIN * 2;
      grid[gy * GRID_W + gx] = net.predictProba([x, y]);
    }
  }
  return grid;
}

function report() {
  const loss = net.trainBatch(points, 0); // lr 0 = measure only
  const grid = probabilityGrid();
  postMessage(
    { type: "progress", step, loss, acc: net.accuracy(points), grid, gw: GRID_W, gh: GRID_H },
    [grid.buffer] // transfer, don't copy
  );
}

function loop() {
  if (!running) return;
  // A chunk of training between reports; setTimeout(0) keeps us reachable
  // for a "stop" message between chunks.
  for (let i = 0; i < 40; i++) {
    net.trainBatch(points, config.lr);
    step++;
  }
  report();
  setTimeout(loop, 0);
}

onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "start") {
    config = msg.config;
    net = new self.ML.MLP(config.sizes, config.activation, config.seed || 1);
    points = self.ML.datasets[config.dataset]();
    step = 0;
    running = true;
    report();
    loop();
  } else if (msg.type === "stop") {
    running = false;
  }
};
