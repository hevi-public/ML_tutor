/* Bass Tutor — Web Audio engine. Plucked-bass synthesis (Karplus-Strong),
   sequenced playback, a drift-free metronome, drones, and soft chord pads.
   No libraries, no worklets.

   Autoplay rules: no AudioContext exists until the first user gesture — every
   public sound method calls ensure() first, and pages only call these from
   click/tap handlers. iOS suspends contexts aggressively, so ensure() also
   resumes an existing context every time.

   The metronome uses the classic lookahead pattern: a 25 ms timer schedules
   clicks on the audio clock slightly ahead; while the tab is hidden the
   horizon widens to 2 s so background-tab timer throttling never gaps the
   beat. UI callbacks are driven by requestAnimationFrame against the audio
   clock, never by the timer.                                                */
(function () {
  "use strict";

  let ctx = null;
  let master = null;
  const active = new Set(); // every playing/scheduled node, so stops are clean

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function track(node) {
    active.add(node);
    node.addEventListener?.("ended", () => active.delete(node));
    return node;
  }

  function stopAll() {
    for (const node of active) {
      try { node.stop ? node.stop() : node.disconnect(); } catch { /* already done */ }
    }
    active.clear();
  }

  /* ---------- Plucked bass (Karplus-Strong into cached buffers) ---------- */

  const pluckCache = new Map(); // "midi:durBucket:mute" → AudioBuffer

  function renderPluck(midi, dur, mute) {
    const sr = ctx.sampleRate;
    const freq = window.BT.midiToFreq(midi);
    const N = Math.round(sr / freq);
    const len = Math.ceil(sr * dur);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);

    // excitation: noise burst, gently lowpassed so the attack isn't glassy
    const burst = new Float32Array(N + 1);
    let lp = 0;
    for (let i = 0; i <= N; i++) {
      lp = 0.6 * lp + 0.4 * (Math.random() * 2 - 1);
      burst[i] = lp;
    }

    // string loop: averaged two-tap feedback = the pluck's natural decay;
    // "brightness" blends how much averaging happens (less = brighter)
    const feedback = mute ? 0.86 : 0.996;
    const delay = new Float32Array(N + 1).map((_, i) => burst[i]);
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const cur = delay[idx];
      const nxt = delay[(idx + 1) % (N + 1)];
      out[i] = cur;
      delay[idx] = feedback * 0.5 * (cur + nxt);
      idx = (idx + 1) % (N + 1);
    }

    // overall envelope: fast attack, exponential-ish body, fade the tail out
    const fade = Math.floor(sr * 0.02);
    for (let i = 0; i < len; i++) {
      let g = 1;
      if (i < 64) g = i / 64;
      if (i > len - fade) g *= (len - i) / fade;
      out[i] *= g;
    }
    return buf;
  }

  // pluck(28) — low open E. Options: when (s, relative), dur (s), gain, mute.
  function pluck(midi, { when = 0, dur = 1.6, gain = 1, mute = false } = {}) {
    ensure();
    const bucket = mute ? 0.4 : Math.min(3, Math.max(0.5, Math.round(dur * 2) / 2));
    const key = `${midi}:${bucket}:${mute ? 1 : 0}`;
    if (!pluckCache.has(key)) pluckCache.set(key, renderPluck(midi, bucket, mute));
    const src = ctx.createBufferSource();
    src.buffer = pluckCache.get(key);
    const g = ctx.createGain();
    g.gain.value = 0.8 * gain;
    src.connect(g).connect(master);
    src.start(ctx.currentTime + when);
    track(src);
    return src;
  }

  /* ---------- Sequenced playback ---------- */

  // events: [{ midi|null, t, dur }] with t/dur in beats (null midi = rest).
  // Returns { stop() }. onStep(index) fires as each event actually sounds.
  function playSeq(events, { bpm = 90, gain = 1, mute = false, onStep, onDone } = {}) {
    ensure();
    const spb = 60 / bpm;
    const t0 = ctx.currentTime + 0.08;
    for (const e of events) {
      if (e.midi === null || e.midi === undefined) continue;
      pluck(e.midi, {
        when: t0 - ctx.currentTime + e.t * spb,
        dur: Math.max(0.4, e.dur * spb * 1.1),
        gain, mute: mute || e.ghost,
      });
    }
    let raf = 0, i = 0, stopped = false;
    const total = events.length
      ? (events[events.length - 1].t + events[events.length - 1].dur) * spb : 0;
    const tick = () => {
      if (stopped) return;
      const now = ctx.currentTime - t0;
      while (i < events.length && events[i].t * spb <= now) { onStep?.(i, events[i]); i++; }
      if (now < total + 0.3) raf = requestAnimationFrame(tick);
      else onDone?.();
    };
    if (onStep || onDone) raf = requestAnimationFrame(tick);
    return { stop() { stopped = true; cancelAnimationFrame(raf); stopAll(); } };
  }

  /* ---------- Metronome ---------- */

  const metronome = {
    running: false,
    _timer: 0, _raf: 0, _next: 0, _beat: 0, _queue: [],
    _opts: {},

    start(opts = {}) {
      ensure();
      this.stop();
      this._opts = {
        bpm: 90, beatsPerBar: 4, subdivision: 1, accent: true, gain: 1,
        onTick: null, ...opts,
      };
      this.running = true;
      this._beat = 0;
      this._next = ctx.currentTime + 0.1;
      this._queue = [];
      const schedule = () => {
        if (!this.running) return;
        const horizon = document.hidden ? 2.0 : 0.12;
        const o = this._opts;
        while (this._next < ctx.currentTime + horizon) {
          const perBeat = 60 / o.bpm;
          const subs = o.subdivision;
          const isBarStart = this._beat % (o.beatsPerBar * subs) === 0;
          const isBeat = this._beat % subs === 0;
          this._click(this._next,
            isBarStart && o.accent ? "accent" : isBeat ? "beat" : "sub", o.gain);
          this._queue.push({ time: this._next, index: this._beat });
          this._next += perBeat / subs;
          this._beat++;
        }
      };
      schedule();
      this._timer = setInterval(schedule, 25);
      document.addEventListener("visibilitychange", schedule);
      this._schedFn = schedule;

      const ui = () => {
        if (!this.running) return;
        const o = this._opts;
        while (this._queue.length && this._queue[0].time <= ctx.currentTime) {
          const ev = this._queue.shift();
          // skip stale events after a hidden stretch — lights catch up silently
          if (ctx.currentTime - ev.time < 0.2 && o.onTick) o.onTick(ev.index, ev.time);
        }
        this._raf = requestAnimationFrame(ui);
      };
      this._raf = requestAnimationFrame(ui);
      return this;
    },

    _click(when, kind, gain) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = kind === "accent" ? 1760 : kind === "beat" ? 1320 : 990;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(
        (kind === "sub" ? 0.12 : 0.3) * gain, when + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      osc.connect(g).connect(master);
      osc.start(when);
      osc.stop(when + 0.08);
      track(osc);
    },

    setBpm(bpm) { this._opts.bpm = bpm; },

    stop() {
      this.running = false;
      clearInterval(this._timer);
      cancelAnimationFrame(this._raf);
      if (this._schedFn) document.removeEventListener("visibilitychange", this._schedFn);
      this._queue = [];
    },
  };

  // A single metronome-style click at an absolute context time (used by labs
  // that run their own bar scheduler). kind: "accent" | "beat" | "sub".
  function click(when, kind = "beat", gain = 1) {
    ensure();
    metronome._click(when, kind, gain);
  }

  /* ---------- Drone & pads ---------- */

  function drone(midi, { gain = 0.13 } = {}) {
    ensure();
    const freq = window.BT.midiToFreq(midi);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(300, freq * 6);
    const oscs = [-4, 3].map((cents) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(lp);
      o.start();
      return track(o);
    });
    lp.connect(g).connect(master);
    return {
      stop() {
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
        setTimeout(() => oscs.forEach((o) => { try { o.stop(); } catch {} }), 400);
      },
    };
  }

  // A soft sustained chord (triangle waves through a lowpass).
  function chordPad(midis, { when = 0, dur = 2, gain = 0.2 } = {}) {
    ensure();
    const t = ctx.currentTime + when;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain / Math.max(1, midis.length - 1), t + 0.04);
    g.gain.setValueAtTime(gain / Math.max(1, midis.length - 1), t + dur - 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    for (const m of midis) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = window.BT.midiToFreq(m);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
      track(o);
    }
    lp.connect(g).connect(master);
  }

  /* ---------- Score-spec playback ---------- */

  const DUR_BEATS = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25, 32: 0.125 };

  // Flatten a score spec (see music/score.js) into playable events in beats.
  // Specs use standard bass WRITTEN pitch, one octave above sounding — so
  // playback transposes down an octave (written e/2 sounds as E1).
  // spec.swing: eighth-note pairs play long-short (triplet feel) — written
  // straight, leaned in playback, exactly like a real chart marked "shuffle".
  function toEvents(spec) {
    const events = [];
    let t = 0;
    for (const measure of spec.measures || []) {
      for (const n of measure.notes || []) {
        const code = String(n.duration).replace(/r$/, "");
        let beats = DUR_BEATS[code] ?? 1;
        if (n.dots) beats *= 1.5;
        const isRest = /r$/.test(String(n.duration)) || n.rest;
        if (!isRest) {
          events.push({
            midi: window.BT.noteToMidi(n.keys[0]) - 12, // written → sounding
            t, dur: beats, ghost: Boolean(n.ghost),
          });
        }
        t += beats;
      }
    }
    if (spec.swing) {
      for (const e of events) {
        const frac = e.t % 1;
        if (Math.abs(frac - 0.5) < 1e-6) {           // offbeat eighth: play late…
          e.t = Math.floor(e.t) + 2 / 3;
          if (e.dur === 0.5) e.dur = 1 / 3;          // …and short
        } else if (frac < 1e-6 && e.dur === 0.5) {
          e.dur = 2 / 3;                             // on-beat eighth: long
        }
      }
    }
    return events;
  }

  function playScore(spec, opts = {}) {
    return playSeq(toEvents(spec), { bpm: spec.tempo || 90, ...opts });
  }

  window.BTAudio = {
    ensure, pluck, playSeq, playScore, toEvents,
    metronome, click, drone, chordPad, stopAll,
    now: () => (ctx ? ctx.currentTime : 0),
    get context() { return ctx; },
  };
})();
