/* ML Tutor — shared canvas plumbing for the 2-D demos: data-space <-> pixel
   mapping, retina scaling, theme colors. Requires matrix.js (window.ML). */
(function () {
  "use strict";

  const ML = window.ML;

  ML.cssVar = function (name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };

  // "--accent" + alpha -> "rgba(r,g,b,a)" (theme vars are #rrggbb hex)
  ML.rgba = function (varName, alpha) {
    const hex = ML.cssVar(varName).replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  // A drawing surface over a fixed data-space rectangle.
  ML.view = function (canvas, { xMin, xMax, yMin, yMax, aspect = 0.62 }) {
    const ctx = canvas.getContext("2d");
    const v = {
      ctx,
      onDraw: null,
      width: () => canvas.clientWidth,
      height: () => canvas.clientHeight,
      toPx(x, y) {
        return {
          x: ((x - xMin) / (xMax - xMin)) * canvas.clientWidth,
          y: canvas.clientHeight - ((y - yMin) / (yMax - yMin)) * canvas.clientHeight,
        };
      },
      toData(px, py) {
        return {
          x: xMin + (px / canvas.clientWidth) * (xMax - xMin),
          y: yMin + ((canvas.clientHeight - py) / canvas.clientHeight) * (yMax - yMin),
        };
      },
      pointerData(e) {
        const rect = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return v.toData(src.clientX - rect.left, src.clientY - rect.top);
      },
      clear() { ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight); },
      grid(step = 2) {
        ctx.strokeStyle = ML.cssVar("--border");
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = Math.ceil(xMin / step) * step; gx <= xMax; gx += step) {
          const p = v.toPx(gx, 0);
          ctx.moveTo(p.x, 0); ctx.lineTo(p.x, canvas.clientHeight);
        }
        for (let gy = Math.ceil(yMin / step) * step; gy <= yMax; gy += step) {
          const p = v.toPx(0, gy);
          ctx.moveTo(0, p.y); ctx.lineTo(canvas.clientWidth, p.y);
        }
        ctx.stroke();
      },
      dot(x, y, r, fillStyle) {
        const p = v.toPx(x, y);
        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      },
      // Paint the whole background by asking classify(x, y) for a color
      // (or null for none) on a coarse grid of cells.
      paintRegions(classify, cell = 10) {
        for (let px = 0; px < canvas.clientWidth; px += cell) {
          for (let py = 0; py < canvas.clientHeight; py += cell) {
            const d = v.toData(px + cell / 2, py + cell / 2);
            const color = classify(d.x, d.y);
            if (!color) continue;
            ctx.fillStyle = color;
            ctx.fillRect(px, py, cell, cell);
          }
        }
      },
      resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.width * aspect * dpr;
        canvas.style.height = rect.width * aspect + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (v.onDraw) v.onDraw();
      },
    };
    window.addEventListener("resize", v.resize);
    return v;
  };
})();
