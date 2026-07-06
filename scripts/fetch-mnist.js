/* Build script: download MNIST, sample a balanced ~2k subset, and write
   data/datasets/mnist-mini.json (base64 pixels + labels).
   Run once: npm run fetch:mnist  (the JSON is committed, so users never need to) */
"use strict";

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const BASE = "https://storage.googleapis.com/cvdf-datasets/mnist/";
const TRAIN_PER_CLASS = 150; // 1500 train
const TEST_PER_CLASS = 50;   // 500 test

async function fetchGz(name) {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return zlib.gunzipSync(Buffer.from(await res.arrayBuffer()));
}

function parseImages(buf) {
  if (buf.readUInt32BE(0) !== 2051) throw new Error("bad image magic");
  const n = buf.readUInt32BE(4), rows = buf.readUInt32BE(8), cols = buf.readUInt32BE(12);
  return { n, rows, cols, pixels: buf.subarray(16) };
}

function parseLabels(buf) {
  if (buf.readUInt32BE(0) !== 2049) throw new Error("bad label magic");
  return buf.subarray(8);
}

function sampleBalanced(images, labels, perClass, skipIdx) {
  const picked = [];
  const counts = new Array(10).fill(0);
  for (let i = 0; i < images.n; i++) {
    if (skipIdx && skipIdx.has(i)) continue;
    const label = labels[i];
    if (counts[label] >= perClass) continue;
    counts[label]++;
    picked.push(i);
    if (picked.length === perClass * 10) break;
  }
  return picked;
}

(async () => {
  console.log("downloading MNIST…");
  const [imgBuf, lblBuf] = await Promise.all([
    fetchGz("train-images-idx3-ubyte.gz"),
    fetchGz("train-labels-idx1-ubyte.gz"),
  ]);
  const images = parseImages(imgBuf);
  const labels = parseLabels(lblBuf);
  console.log(`parsed ${images.n} images, ${images.rows}x${images.cols}`);

  const trainIdx = sampleBalanced(images, labels, TRAIN_PER_CLASS, null);
  const testIdx = sampleBalanced(images, labels, TEST_PER_CLASS, new Set(trainIdx));

  function pack(indices) {
    const size = images.rows * images.cols;
    const out = Buffer.alloc(indices.length * size);
    const lbl = [];
    indices.forEach((idx, k) => {
      images.pixels.copy(out, k * size, idx * size, (idx + 1) * size);
      lbl.push(labels[idx]);
    });
    return { pixels: out.toString("base64"), labels: lbl };
  }

  const data = {
    rows: images.rows,
    cols: images.cols,
    train: pack(trainIdx),
    test: pack(testIdx),
  };
  const outPath = path.join(__dirname, "..", "data", "datasets", "mnist-mini.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data));
  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`wrote ${outPath} (${mb} MB): ${data.train.labels.length} train / ${data.test.labels.length} test`);
})();
