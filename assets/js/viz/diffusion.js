/* ML Tutor — diffusion demo: a small procedural picture, a noise dial from
   "clean" to "pure static", and animated walks in both directions. The
   forward direction (adding noise) is the real thing; the backward animation
   illustrates what a trained denoiser learns to do (the page is honest that
   here we know the answer, whereas the real model must guess it).
   Container: #diffusion-demo. */
(function () {
  "use strict";

  const ML = window.ML;
  const IW = 64, IH = 48;

  let root, canvas, ctx, slider, tOut;
  let clean, noise, t = 0, seed = 0, animating = false;

  // A colorful little landscape: sky, sun, hills, water.
  function makeImage() {
    const img = new Float32Array(IW * IH * 3);
    for (let y = 0; y < IH; y++) {
      for (let x = 0; x < IW; x++) {
        let r, g, b;
        const horizon = IH * 0.55;
        if (y < horizon) {
          const f = y / horizon;
          r = 120 + f * 80; g = 170 + f * 40; b = 235;         // sky
          const dx = x - 48, dy = y - 10;
          if (dx * dx + dy * dy < 36) { r = 255; g = 225; b = 90; } // sun
        } else if (y < IH * 0.78) {
          const hill = Math.sin(x * 0.18) * 3 + IH * 0.6;
          const dark = y < hill ? 0.75 : 1;
          r = 70 * dark; g = 150 * dark; b = 60 * dark;        // hills
        } else {
          r = 50; g = 110; b = 190;                            // water
          if ((x + y * 2) % 9 < 2) { r += 40; g += 40; b += 40; } // ripples
        }
        const i = (y * IW + x) * 3;
        img[i] = r; img[i + 1] = g; img[i + 2] = b;
      }
    }
    return img;
  }

  function makeNoise(s) {
    const n = new Float32Array(IW * IH * 3);
    for (let i = 0; i < n.length; i++) n[i] = 128 + ML.rand.normal(i + s * 977) * 70;
    return n;
  }

  function draw() {
    const scale = canvas.clientWidth / IW;
    // linear blend clean→noise; the real forward process is the same idea
    // with carefully scheduled coefficients
    for (let y = 0; y < IH; y++) {
      for (let x = 0; x < IW; x++) {
        const i = (y * IW + x) * 3;
        const r = clean[i] * (1 - t) + noise[i] * t;
        const g = clean[i + 1] * (1 - t) + noise[i + 1] * t;
        const b = clean[i + 2] * (1 - t) + noise[i + 2] * t;
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
      }
    }
    tOut.textContent = t === 0 ? "clean picture"
      : t >= 0.999 ? "pure static — the picture is gone"
      : `${Math.round(t * 100)}% noise`;
    slider.value = t;
  }

  function walk(target, done) {
    if (animating) return;
    animating = true;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) { t = target; draw(); animating = false; if (done) done(); return; }
    const dir = Math.sign(target - t) * 0.02;
    (function tick() {
      t = Math.max(0, Math.min(1, t + dir));
      draw();
      if ((dir > 0 && t < target) || (dir < 0 && t > target)) requestAnimationFrame(tick);
      else { animating = false; if (done) done(); }
    })();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = (rect.width / IW) * IH * dpr;
    canvas.style.height = (rect.width / IW) * IH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("diffusion-demo");
    if (!root) return;
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");
    slider = root.querySelector('[data-param="t"]');
    tOut = root.querySelector('[data-out="t"]');

    clean = makeImage();
    noise = makeNoise(seed);

    slider.addEventListener("input", () => { t = +slider.value; draw(); });
    root.querySelector('[data-action="forward"]').addEventListener("click", () => walk(1));
    root.querySelector('[data-action="back"]').addEventListener("click", () => walk(0));
    root.querySelector('[data-action="renoise"]').addEventListener("click", () => {
      noise = makeNoise(++seed);
      draw();
    });

    window.addEventListener("resize", resize);
    resize();
  });
})();
