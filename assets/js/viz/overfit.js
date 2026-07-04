/* ML Tutor — overfitting demo: fit a polynomial ("bendy curve") to dots that are
   split into a practice set (train, filled dots) and a hidden exam set (test,
   hollow dots). Fit on train only; grade on both; watch the two grades disagree
   as the curve gets bendier.

   Container: element with class .overfit-demo. Modes via data attributes:
     data-degrees="slider"  — degree slider 1..12 (overfitting page)
     data-degrees="1,11"    — two buttons: simple vs very bendy (train/test page) */
(function () {
  "use strict";

  const X_MIN = 0, X_MAX = 10, Y_MIN = -1, Y_MAX = 9;
  const N_POINTS = 30, TRAIN_FRACTION = 0.7;

  function pseudoRandom(i) {
    const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  }

  function makePoints() {
    // Hidden truth: a gentle curve. Noise keeps any fit from being perfect.
    const pts = [];
    for (let i = 0; i < N_POINTS; i++) {
      const x = X_MIN + ((X_MAX - X_MIN) * (i + 0.5)) / N_POINTS;
      const y = 3.4 + 0.35 * x + 1.6 * Math.sin(x * 0.85) + (pseudoRandom(i) - 0.5) * 2.4;
      pts.push({ x, y });
    }
    return pts;
  }

  // Deterministic shuffle so "reshuffle" is repeatable within a session
  function split(points, seed) {
    const idx = points.map((_, i) => i);
    let s = seed * 2654435761 % 4294967296;
    for (let i = idx.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) % 4294967296;
      const j = s % (i + 1);
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const nTrain = Math.round(points.length * TRAIN_FRACTION);
    return {
      train: idx.slice(0, nTrain).map((i) => points[i]),
      test: idx.slice(nTrain).map((i) => points[i]),
    };
  }

  /* ----- polynomial least squares (x normalized to [-1,1] for stability) ----- */

  function norm(x) { return (x - (X_MIN + X_MAX) / 2) / ((X_MAX - X_MIN) / 2); }

  function polyfit(points, degree) {
    const n = degree + 1;
    const A = Array.from({ length: n }, () => new Float64Array(n));
    const b = new Float64Array(n);
    for (const p of points) {
      const u = norm(p.x);
      const pow = new Float64Array(n);
      let v = 1;
      for (let i = 0; i < n; i++) { pow[i] = v; v *= u; }
      for (let i = 0; i < n; i++) {
        b[i] += pow[i] * p.y;
        for (let j = 0; j < n; j++) A[i][j] += pow[i] * pow[j];
      }
    }
    for (let i = 0; i < n; i++) A[i][i] += 1e-9; // tiny ridge for numerical safety
    return solve(A, b);
  }

  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      [M[col], M[piv]] = [M[piv], M[col]];
      for (let r = 0; r < n; r++) {
        if (r === col || M[col][col] === 0) continue;
        const f = M[r][col] / M[col][col];
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map((row, i) => (row[i] === 0 ? 0 : row[n] / row[i]));
  }

  function evalPoly(coef, x) {
    const u = norm(x);
    let y = 0, v = 1;
    for (const c of coef) { y += c * v; v *= u; }
    return y;
  }

  function mse(coef, points) {
    if (!points.length) return 0;
    let s = 0;
    for (const p of points) {
      const e = p.y - evalPoly(coef, p.x);
      s += e * e;
    }
    return s / points.length;
  }

  /* ----- one demo instance ----- */

  function initDemo(root) {
    const canvas = root.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const outTrain = root.querySelector('[data-out="train"]');
    const outTest = root.querySelector('[data-out="test"]');
    const outVerdict = root.querySelector('[data-out="verdict"]');
    const slider = root.querySelector('[data-param="degree"]');
    const degOut = root.querySelector('[data-out="degree"]');

    const points = makePoints();
    let seed = 1;
    let sets = split(points, seed);
    let degree = slider ? +slider.value : +(root.dataset.degrees.split(",")[0]);
    let coef = polyfit(sets.train, degree);

    function cssVar(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    function toPx(p) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      return {
        x: ((p.x - X_MIN) / (X_MAX - X_MIN)) * w,
        y: h - ((p.y - Y_MIN) / (Y_MAX - Y_MIN)) * h,
      };
    }

    function refit() {
      coef = polyfit(sets.train, degree);
      draw();
    }

    function draw() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // curve
      ctx.strokeStyle = cssVar("--accent");
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let started = false;
      for (let px = 0; px <= w; px += 2) {
        const x = X_MIN + (px / w) * (X_MAX - X_MIN);
        const y = evalPoly(coef, x);
        if (y < Y_MIN - 4 || y > Y_MAX + 4) { started = false; continue; }
        const p = toPx({ x, y });
        started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        started = true;
      }
      ctx.stroke();

      // train dots: filled; test dots: hollow
      for (const p of sets.train) {
        const px = toPx(p);
        ctx.fillStyle = cssVar("--text");
        ctx.beginPath(); ctx.arc(px.x, px.y, 4.5, 0, Math.PI * 2); ctx.fill();
      }
      for (const p of sets.test) {
        const px = toPx(p);
        ctx.strokeStyle = cssVar("--bad");
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px.x, px.y, 5, 0, Math.PI * 2); ctx.stroke();
      }

      const trainLoss = mse(coef, sets.train);
      const testLoss = mse(coef, sets.test);
      outTrain.textContent = trainLoss.toFixed(2);
      outTest.textContent = testLoss.toFixed(2);
      if (degOut) degOut.value = degree;

      const ratio = testLoss / Math.max(trainLoss, 0.01);
      outVerdict.textContent =
        degree <= 1 && trainLoss > 1.2
          ? "underfitting — too simple to catch the bend in the data"
          : ratio > 3
          ? "overfitting — memorizing the practice dots, flunking the hidden ones"
          : "about right — practice and exam grades roughly agree";
    }

    if (slider) {
      slider.addEventListener("input", () => { degree = +slider.value; refit(); });
    }
    root.querySelectorAll("[data-degree]").forEach((btn) => {
      btn.addEventListener("click", () => {
        degree = +btn.dataset.degree;
        root.querySelectorAll("[data-degree]").forEach((b) =>
          b.classList.toggle("secondary", b !== btn));
        refit();
      });
    });
    const reshuffle = root.querySelector('[data-action="reshuffle"]');
    if (reshuffle) {
      reshuffle.addEventListener("click", () => {
        sets = split(points, ++seed);
        refit();
      });
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.width * 0.58 * dpr;
      canvas.style.height = rect.width * 0.58 + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    window.addEventListener("resize", resize);
    resize();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".overfit-demo").forEach(initDemo);
  });
})();
