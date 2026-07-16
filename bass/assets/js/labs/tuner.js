/* Bass Tutor — microphone tuner. getUserMedia → AnalyserNode (fftSize 8192) →
   normalized autocorrelation (NSDF-style) with parabolic peak refinement →
   nearest note + cents, median-smoothed. Works down past low E (41.2 Hz).
   Degrades honestly: insecure context or no mic → reference tones only.     */
(function () {
  "use strict";

  const TARGETS = [
    { name: "E", midi: 28, freq: 41.2 },
    { name: "A", midi: 33, freq: 55.0 },
    { name: "D", midi: 38, freq: 73.42 },
    { name: "G", midi: 43, freq: 98.0 },
  ];

  document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);
    if (!$("tuner-note")) return;

    const noteEl = $("tuner-note"), freqEl = $("tuner-freq"),
          statusEl = $("tuner-status"), needle = $("tuner-needle"),
          meter = $("tuner-meter-el"), enableBtn = $("tuner-enable");

    let analyser = null, buf = null, stream = null, raf = 0;
    const centsHistory = [];

    /* ---------- reference tones (always available) ---------- */

    document.querySelectorAll("[data-tuner-note]").forEach((pad) => {
      pad.addEventListener("click", () => {
        const t = TARGETS.find((x) => x.name === pad.dataset.tunerNote);
        window.BTAudio.pluck(t.midi, { dur: 2.5 });
        document.querySelectorAll("[data-tuner-note]").forEach((p) =>
          p.classList.toggle("active", p === pad));
        statusEl.textContent = `reference: ${t.name} (${t.freq.toFixed(1)} Hz)`;
      });
    });

    /* ---------- pitch detection ---------- */

    function detect() {
      analyser.getFloatTimeDomainData(buf);
      const sr = window.BTAudio.context.sampleRate;
      const N = buf.length;

      // noise gate
      let rms = 0;
      for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / N);
      if (rms < 0.008) return null;

      // normalized square-difference (McLeod-style NSDF)
      const maxLag = Math.floor(sr / 30);   // down to 30 Hz
      const minLag = Math.floor(sr / 400);  // up to 400 Hz (covers fret 12 on G)
      const nsdf = new Float32Array(maxLag + 1);
      for (let lag = minLag; lag <= maxLag; lag++) {
        let acf = 0, m = 0;
        for (let i = 0; i < N - lag; i++) {
          acf += buf[i] * buf[i + lag];
          m += buf[i] * buf[i] + buf[i + lag] * buf[i + lag];
        }
        nsdf[lag] = m > 0 ? (2 * acf) / m : 0;
      }

      // first prominent peak after the first positive-going zero crossing
      let start = minLag;
      while (start < maxLag && nsdf[start] > 0) start++;      // leave the lag-0 lobe
      let bestLag = -1, bestVal = 0;
      for (let lag = start + 1; lag < maxLag; lag++) {
        if (nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1] && nsdf[lag] > bestVal) {
          bestVal = nsdf[lag];
          bestLag = lag;
        }
      }
      if (bestLag < 0 || bestVal < 0.86) return null;         // clarity threshold

      // parabolic interpolation around the peak
      const a = nsdf[bestLag - 1], b = nsdf[bestLag], c = nsdf[bestLag + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      return sr / (bestLag + shift);
    }

    function loop() {
      const freq = detect();
      if (freq) {
        const midiFloat = window.BT.freqToMidi(freq);
        const nearest = Math.round(midiFloat);
        const cents = (midiFloat - nearest) * 100;
        centsHistory.push(cents);
        if (centsHistory.length > 5) centsHistory.shift();
        const smooth = [...centsHistory].sort((x, y) => x - y)[Math.floor(centsHistory.length / 2)];

        const name = window.BT.midiToNote(nearest);
        noteEl.innerHTML = `${name.replace(/\d+$/, "")}<span class="oct">${name.match(/\d+$/)?.[0] ?? ""}</span>`;
        freqEl.textContent = `${freq.toFixed(1)} Hz · ${smooth > 0 ? "+" : ""}${smooth.toFixed(0)} cents`;
        needle.style.left = `${50 + Math.max(-50, Math.min(50, smooth))}%`;
        const inTune = Math.abs(smooth) <= 5;
        meter.classList.toggle("in-tune", inTune);
        statusEl.textContent = inTune ? "in tune ✓"
          : smooth > 0 ? "a little sharp — loosen slightly" : "a little flat — tighten slightly";
      } else {
        statusEl.textContent = "listening… (pluck one string, near the neck, and let it ring)";
      }
      raf = requestAnimationFrame(loop);
    }

    /* ---------- mic plumbing with honest fallbacks ---------- */

    async function enable() {
      if (!window.isSecureContext) {
        statusEl.innerHTML = "The microphone needs a secure page (https or localhost). " +
          "On GitHub Pages and <code>npm run dev</code> it works; over plain LAN http it can't. " +
          "The reference tones above still do — tune by ear.";
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        statusEl.textContent = "This browser doesn't offer microphone access — use the reference tones above.";
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
        });
      } catch {
        statusEl.textContent = "Microphone permission was declined — no problem: tune by ear with the reference tones above.";
        return;
      }
      const ctx = window.BTAudio.ensure();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      buf = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      enableBtn.textContent = "Microphone on ✓";
      enableBtn.disabled = true;
      statusEl.textContent = "listening…";
      loop();
    }

    enableBtn.addEventListener("click", enable);

    // release the mic when leaving
    window.addEventListener("pagehide", () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    });
  });
})();
