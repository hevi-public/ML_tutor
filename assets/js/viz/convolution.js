/* ML Tutor — convolution explorer: a procedural image, a 3×3 kernel, and the
   filtered result side by side. Hover either panel to see the exact 3×3
   window × kernel arithmetic that produced one output pixel.
   Container: #conv-demo. */
(function () {
  "use strict";

  const ML = window.ML;
  const IW = 80, IH = 60; // image size in pixels (drawn scaled up)

  const KERNELS = {
    identity: { k: [[0,0,0],[0,1,0],[0,0,0]], abs: false, gain: 1,
      note: "copies each pixel — proof that the machinery itself changes nothing" },
    blur: { k: [[1/9,1/9,1/9],[1/9,1/9,1/9],[1/9,1/9,1/9]], abs: false, gain: 1,
      note: "each output pixel is the average of its neighborhood — detail melts away" },
    sharpen: { k: [[0,-1,0],[-1,5,-1],[0,-1,0]], abs: false, gain: 1,
      note: "boosts each pixel's difference from its neighbors — edges pop" },
    edges: { k: [[0,-1,0],[-1,4,-1],[0,-1,0]], abs: true, gain: 2,
      note: "responds only where brightness changes — flat areas go black, outlines glow" },
    vertical: { k: [[-1,0,1],[-2,0,2],[-1,0,1]], abs: true, gain: 1.5,
      note: "fires on left-right brightness changes: vertical lines glow, horizontal ones vanish" },
    horizontal: { k: [[-1,-2,-1],[0,0,0],[1,2,1]], abs: true, gain: 1.5,
      note: "the same detector rotated 90° — now only horizontal lines glow" },
  };

  let canvas, ctx, root, input, output, kernelName = "edges", cursor = null;

  // A simple scene with plenty of edges: sky, sun, house, roof, door, ground.
  function makeImage() {
    const img = new Float32Array(IW * IH);
    for (let y = 0; y < IH; y++) {
      for (let x = 0; x < IW; x++) {
        let v = y < IH * 0.62 ? 205 - y * 0.4 : 135;          // sky / ground
        const dx = x - 63, dy = y - 12;
        if (dx * dx + dy * dy < 49) v = 250;                   // sun
        if (x >= 18 && x < 42 && y >= 30 && y < 37) v = 110;   // roof band
        if (x >= 22 && x < 38 && y >= 37 && y < 52) v = 70;    // house
        if (x >= 28 && x < 32 && y >= 43 && y < 52) v = 30;    // door
        v += (ML.rand.uniform(y * IW + x) - 0.5) * 8;          // texture
        img[y * IW + x] = Math.max(0, Math.min(255, v));
      }
    }
    return img;
  }

  function convolve(img, spec) {
    const out = new Float32Array(IW * IH);
    for (let y = 0; y < IH; y++) {
      for (let x = 0; x < IW; x++) {
        let s = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const yy = Math.min(IH - 1, Math.max(0, y + ky));
            const xx = Math.min(IW - 1, Math.max(0, x + kx));
            s += img[yy * IW + xx] * spec.k[ky + 1][kx + 1];
          }
        }
        if (spec.abs) s = Math.abs(s);
        out[y * IW + x] = Math.max(0, Math.min(255, s * spec.gain));
      }
    }
    return out;
  }

  function panelGeom() {
    const W = canvas.clientWidth;
    const gap = W * 0.04;
    const pw = (W - gap) / 2;
    const scale = pw / IW;
    return { gap, pw, ph: IH * scale, scale };
  }

  function drawPanel(img, x0) {
    const { scale } = panelGeom();
    for (let y = 0; y < IH; y++) {
      for (let x = 0; x < IW; x++) {
        const v = img[y * IW + x];
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x0 + x * scale, y * scale, scale + 0.5, scale + 0.5);
      }
    }
  }

  function draw() {
    const { gap, pw, scale } = panelGeom();
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    drawPanel(input, 0);
    drawPanel(output, pw + gap);

    ctx.fillStyle = ML.cssVar("--text-soft");
    ctx.font = "12px sans-serif";
    ctx.fillText("input", 2, IH * scale + 14);
    ctx.fillText("after the filter", pw + gap + 2, IH * scale + 14);

    if (cursor) {
      ctx.strokeStyle = ML.cssVar("--accent");
      ctx.lineWidth = 2;
      // 3×3 window on the input, single pixel on the output
      ctx.strokeRect((cursor.x - 1) * scale, (cursor.y - 1) * scale, scale * 3, scale * 3);
      ctx.strokeRect(pw + gap + cursor.x * scale, cursor.y * scale, scale, scale);
    }

    updateReadout();
  }

  function updateReadout() {
    const spec = KERNELS[kernelName];
    root.querySelector('[data-out="note"]').textContent = spec.note;

    const grid = root.querySelector('[data-out="math"]');
    if (!cursor) {
      grid.innerHTML = "<em>hover the image to watch one pixel being computed</em>";
      return;
    }
    const { x, y } = cursor;
    let cells = [], sum = 0;
    for (let ky = -1; ky <= 1; ky++) {
      for (let kx = -1; kx <= 1; kx++) {
        const yy = Math.min(IH - 1, Math.max(0, y + ky));
        const xx = Math.min(IW - 1, Math.max(0, x + kx));
        const pv = input[yy * IW + xx];
        const kv = spec.k[ky + 1][kx + 1];
        sum += pv * kv;
        cells.push(`${Math.round(pv)}×${(+kv.toFixed(2))}`);
      }
    }
    if (spec.abs) sum = Math.abs(sum);
    sum = Math.max(0, Math.min(255, sum * spec.gain));
    grid.innerHTML =
      cells.map((c, i) => `<span>${c}</span>${i % 3 === 2 ? "<br>" : " + "}`).join("") +
      `→ output pixel: <strong>${Math.round(sum)}</strong>`;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const { ph } = { ph: (rect.width - rect.width * 0.04) / 2 / IW * IH };
    canvas.width = rect.width * dpr;
    canvas.height = (ph + 18) * dpr;
    canvas.style.height = ph + 18 + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById("conv-demo");
    if (!root) return;
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");

    input = makeImage();
    output = convolve(input, KERNELS[kernelName]);

    root.querySelectorAll("[data-kernel]").forEach((btn) =>
      btn.addEventListener("click", () => {
        kernelName = btn.dataset.kernel;
        root.querySelectorAll("[data-kernel]").forEach((b) =>
          b.classList.toggle("secondary", b !== btn));
        output = convolve(input, KERNELS[kernelName]);
        draw();
      }));

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const { gap, pw, scale } = panelGeom();
      let px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (px > pw + gap) px -= pw + gap; // either panel maps to the same pixel
      const x = Math.floor(px / scale), y = Math.floor(py / scale);
      cursor = x >= 0 && x < IW && y >= 0 && y < IH ? { x, y } : null;
      draw();
    });
    canvas.addEventListener("mouseleave", () => { cursor = null; draw(); });

    window.addEventListener("resize", resize);
    resize();
  });
})();
