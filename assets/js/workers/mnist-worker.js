/* ML Tutor — MNIST trainer. Fetches the mini dataset itself, trains a
   softmax MLP on mini-batches, streams progress. Protocol:
     in:  { type: "start", config: { hidden, lr, seed } }
          { type: "stop" }
          { type: "classify", pixels: Float32Array(784), id }
     out: { type: "ready", trainN, testN }
          { type: "progress", step, loss, trainAcc, testAcc,
            samples: [{ pixels: Uint8Array, label, pred }] }   // rotating test preview
          { type: "classified", id, probs: number[10] }        // for the draw pad */
"use strict";

importScripts("../ml/matrix.js", "../ml/mlp.js");

const SIZE = 784;
let net = null, config = null, running = false, step = 0;
let train = null, test = null; // {xs: [Float32Array], ys: [int], raw: Uint8Array}
let rnd = null;
let previewOffset = 0;

function decode(pack) {
  const bin = atob(pack.pixels);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  const xs = [], ys = pack.labels;
  for (let k = 0; k < ys.length; k++) {
    const x = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) x[i] = raw[k * SIZE + i] / 255;
    xs.push(x);
  }
  return { xs, ys, raw };
}

async function loadData() {
  if (train) return;
  const res = await fetch("../../../data/datasets/mnist-mini.json");
  const data = await res.json();
  train = decode(data.train);
  test = decode(data.test);
  postMessage({ type: "ready", trainN: train.ys.length, testN: test.ys.length });
}

function subsetAccuracy(set, n) {
  // accuracy on a rotating slice — cheap enough to run every report
  let ok = 0;
  const start = (step * 7) % Math.max(1, set.ys.length - n);
  for (let i = start; i < start + n && i < set.ys.length; i++) {
    if (net.predict(set.xs[i]) === set.ys[i]) ok++;
  }
  return ok / Math.min(n, set.ys.length);
}

function report(loss) {
  // a rotating window of test digits with current predictions
  const samples = [];
  for (let k = 0; k < 20; k++) {
    const i = (previewOffset + k) % test.ys.length;
    samples.push({
      pixels: test.raw.slice(i * SIZE, (i + 1) * SIZE),
      label: test.ys[i],
      pred: net.predict(test.xs[i]),
    });
  }
  previewOffset = (previewOffset + 20) % test.ys.length;
  postMessage({
    type: "progress", step, loss,
    trainAcc: subsetAccuracy(train, 200),
    testAcc: subsetAccuracy(test, 200),
    samples,
  });
}

function loop() {
  if (!running) return;
  let loss = 0;
  const BATCH = 32, CHUNK = 25;
  for (let c = 0; c < CHUNK; c++) {
    const batch = [];
    for (let b = 0; b < BATCH; b++) {
      const i = Math.floor(rnd() * train.ys.length);
      batch.push({ x: train.xs[i], y: train.ys[i] });
    }
    loss = net.trainBatch(batch, config.lr);
    step++;
  }
  report(loss);
  setTimeout(loop, 0);
}

onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === "start") {
    await loadData();
    config = msg.config;
    net = new self.ML.MLPSoftmax([SIZE, config.hidden, 10], config.seed || 1);
    rnd = self.ML.rand.lcg(config.seed || 1);
    step = 0;
    running = true;
    loop();
  } else if (msg.type === "stop") {
    running = false;
  } else if (msg.type === "classify") {
    if (!net) return;
    postMessage({ type: "classified", id: msg.id, probs: [...net.predictProbs(msg.pixels)] });
  }
};
