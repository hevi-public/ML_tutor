/* Bass Tutor — music theory as pure functions. No DOM, no audio: notes,
   intervals, scales, chords, keys, and fretboard math. Everything else on the
   site (fretboard diagrams, notation, audio, labs) is built on this.

   Conventions:
   - Note names: letter + accidental + octave ("E1", "Bb2", "F#3"). Score specs
     use VexFlow's "eb/2" form — noteToMidi accepts both.
   - MIDI numbers: C-1 = 0, so open bass strings are E1=28 A1=33 D2=38 G2=43.
   - String indices: 0 = low E (thickest) … 3 = G, matching how you hold the
     instrument, NOT tab-line order (tab draws G on top).                     */
(function () {
  "use strict";

  const NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const NAMES_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

  /* ---------- Notes ---------- */

  // "E1", "Bb2", "F#3", "eb/2" (VexFlow style) → midi. Returns null if unparsable.
  function noteToMidi(name) {
    if (typeof name === "number") return name;
    const m = String(name).trim()
      .match(/^([A-Ga-g])(♯♯|##|x|♯|#|♭♭|bb|♭|b|♮|n)?\/?(-?\d+)$/);
    if (!m) return null;
    const letter = m[1].toUpperCase();
    const accStr = (m[2] || "").replace(/♯/g, "#").replace(/♭/g, "b");
    const acc = { "": 0, "#": 1, "##": 2, x: 2, b: -1, bb: -2, n: 0 }[accStr] ?? 0;
    const octave = parseInt(m[3], 10);
    return 12 * (octave + 1) + LETTER_PC[letter] + acc;
  }

  function midiToNote(midi, { flats = false } = {}) {
    const names = flats ? NAMES_FLAT : NAMES_SHARP;
    return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }

  const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const freqToMidi = (freq) => 69 + 12 * Math.log2(freq / 440); // float, for tuners

  // pitch class 0–11 from a midi number or a note name (octave optional)
  function pc(x) {
    if (typeof x === "number") return ((x % 12) + 12) % 12;
    const m = String(x).trim().match(/^([A-Ga-g])(♯♯|##|x|♯|#|♭♭|bb|♭|b|♮|n)?/);
    if (!m) return null;
    const accStr = (m[2] || "").replace(/♯/g, "#").replace(/♭/g, "b");
    const acc = { "": 0, "#": 1, "##": 2, x: 2, b: -1, bb: -2, n: 0 }[accStr] ?? 0;
    return ((LETTER_PC[m[1].toUpperCase()] + acc) % 12 + 12) % 12;
  }

  function transpose(name, semitones) {
    const midi = noteToMidi(name);
    if (midi === null) return null;
    const flats = /[b♭]/.test(name);
    return midiToNote(midi + semitones, { flats });
  }

  /* ---------- Intervals ---------- */

  const INTERVALS = [
    { short: "P1", name: "unison" },
    { short: "m2", name: "minor second" },
    { short: "M2", name: "major second" },
    { short: "m3", name: "minor third" },
    { short: "M3", name: "major third" },
    { short: "P4", name: "perfect fourth" },
    { short: "TT", name: "tritone" },
    { short: "P5", name: "perfect fifth" },
    { short: "m6", name: "minor sixth" },
    { short: "M6", name: "major sixth" },
    { short: "m7", name: "minor seventh" },
    { short: "M7", name: "major seventh" },
    { short: "P8", name: "octave" },
  ];

  // interval("E1","B1") or interval(28,35) → { semitones, short, name }
  function interval(a, b) {
    const ma = noteToMidi(a), mb = noteToMidi(b);
    const semitones = mb - ma;
    const idx = Math.abs(semitones) === 12 ? 12 : ((Math.abs(semitones) % 12) + 12) % 12;
    return { semitones, short: INTERVALS[idx].short, name: INTERVALS[idx].name };
  }

  /* ---------- Scales ---------- */

  const SCALES = {
    major:           [0, 2, 4, 5, 7, 9, 11],
    naturalMinor:    [0, 2, 3, 5, 7, 8, 10],
    harmonicMinor:   [0, 2, 3, 5, 7, 8, 11],
    melodicMinor:    [0, 2, 3, 5, 7, 9, 11],
    ionian:          [0, 2, 4, 5, 7, 9, 11],
    dorian:          [0, 2, 3, 5, 7, 9, 10],
    phrygian:        [0, 1, 3, 5, 7, 8, 10],
    lydian:          [0, 2, 4, 6, 7, 9, 11],
    mixolydian:      [0, 2, 4, 5, 7, 9, 10],
    aeolian:         [0, 2, 3, 5, 7, 8, 10],
    locrian:         [0, 1, 3, 5, 6, 8, 10],
    majorPentatonic: [0, 2, 4, 7, 9],
    minorPentatonic: [0, 3, 5, 7, 10],
    blues:           [0, 3, 5, 6, 7, 10],
  };

  // Which heptatonic degree (0-based letter offset) each step of the short
  // scales sits on, so they get spelled with the right letters.
  const SCALE_DEGREES = {
    majorPentatonic: [0, 1, 2, 4, 5],
    minorPentatonic: [0, 2, 3, 4, 6],
    blues:           [0, 2, 3, 4, 4, 6], // the b5 shares the 5th's letter, flattened
  };

  // Spell one pitch class on a required letter: pcOnLetter(6, "F") → "F#"
  function spellOnLetter(targetPc, letter) {
    let diff = targetPc - LETTER_PC[letter];
    diff = ((diff % 12) + 12) % 12;
    if (diff > 6) diff -= 12; // choose the small alteration (-2…+2)
    const acc = { "-2": "bb", "-1": "b", 0: "", 1: "#", 2: "##" }[diff];
    return acc === undefined ? null : letter + acc;
  }

  // scale("Eb","major") → ["Eb","F","G","Ab","Bb","C","D"] (correctly spelled)
  function scale(root, type) {
    const steps = SCALES[type];
    if (!steps) return null;
    const rootPc = pc(root);
    const rootLetter = String(root).trim()[0].toUpperCase();
    const rootLetterIdx = LETTERS.indexOf(rootLetter);
    const degreeOf = SCALE_DEGREES[type] || steps.map((_, i) => i);
    return steps.map((semis, i) => {
      const letter = LETTERS[(rootLetterIdx + degreeOf[i]) % 7];
      const name = spellOnLetter((rootPc + semis) % 12, letter);
      // fall back to plain sharp spelling if the letter needs a triple accidental
      return name ?? NAMES_SHARP[(rootPc + semis) % 12];
    });
  }

  const scalePcs = (root, type) =>
    (SCALES[type] || []).map((s) => (pc(root) + s) % 12);

  /* ---------- Keys ---------- */

  const SHARP_ORDER = ["F#", "C#", "G#", "D#", "A#", "E#", "B#"];
  const FLAT_ORDER = ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"];
  // index = how many sharps (+) / flats (−) the major key has
  const MAJOR_KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
                       F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };

  // keySignature("Eb") → { count: -3, accidentals: ["Bb","Eb","Ab"], vexKey: "Eb" }
  // keySignature("C", "minor") → the relative major's signature, vexKey "Cm"
  function keySignature(root, mode = "major") {
    let majorRoot = root;
    if (mode === "minor") {
      // relative major is a minor third up, spelled on the letter two above
      const letter = LETTERS[(LETTERS.indexOf(root[0].toUpperCase()) + 2) % 7];
      majorRoot = spellOnLetter((pc(root) + 3) % 12, letter);
    }
    const count = MAJOR_KEYS[majorRoot];
    if (count === undefined) return null;
    const accidentals = count >= 0
      ? SHARP_ORDER.slice(0, count)
      : FLAT_ORDER.slice(0, -count);
    return { count, accidentals,
             vexKey: mode === "minor" ? root + "m" : majorRoot };
  }

  /* ---------- Chords ---------- */

  const QUALITIES = {
    // intervals (semitones), which scale degrees the letters come from,
    // and a plain-English reading
    "":      { ints: [0, 4, 7],        degs: [0, 2, 4],       plain: "major" },
    maj:     { ints: [0, 4, 7],        degs: [0, 2, 4],       plain: "major" },
    m:       { ints: [0, 3, 7],        degs: [0, 2, 4],       plain: "minor" },
    min:     { ints: [0, 3, 7],        degs: [0, 2, 4],       plain: "minor" },
    dim:     { ints: [0, 3, 6],        degs: [0, 2, 4],       plain: "diminished" },
    aug:     { ints: [0, 4, 8],        degs: [0, 2, 4],       plain: "augmented" },
    sus2:    { ints: [0, 2, 7],        degs: [0, 1, 4],       plain: "suspended second" },
    sus4:    { ints: [0, 5, 7],        degs: [0, 3, 4],       plain: "suspended fourth" },
    "5":     { ints: [0, 7],           degs: [0, 4],          plain: "power chord (root and fifth)" },
    "6":     { ints: [0, 4, 7, 9],     degs: [0, 2, 4, 5],    plain: "major six" },
    m6:      { ints: [0, 3, 7, 9],     degs: [0, 2, 4, 5],    plain: "minor six" },
    maj7:    { ints: [0, 4, 7, 11],    degs: [0, 2, 4, 6],    plain: "major seven" },
    "7":     { ints: [0, 4, 7, 10],    degs: [0, 2, 4, 6],    plain: "dominant seven" },
    m7:      { ints: [0, 3, 7, 10],    degs: [0, 2, 4, 6],    plain: "minor seven" },
    min7:    { ints: [0, 3, 7, 10],    degs: [0, 2, 4, 6],    plain: "minor seven" },
    m7b5:    { ints: [0, 3, 6, 10],    degs: [0, 2, 4, 6],    plain: "minor seven flat five (half-diminished)" },
    dim7:    { ints: [0, 3, 6, 9],     degs: [0, 2, 4, 6],    plain: "diminished seven" },
    "9":     { ints: [0, 4, 7, 10, 14],  degs: [0, 2, 4, 6, 1], plain: "dominant nine" },
    maj9:    { ints: [0, 4, 7, 11, 14],  degs: [0, 2, 4, 6, 1], plain: "major nine" },
    m9:      { ints: [0, 3, 7, 10, 14],  degs: [0, 2, 4, 6, 1], plain: "minor nine" },
    add9:    { ints: [0, 4, 7, 14],    degs: [0, 2, 4, 1],    plain: "add nine" },
  };

  // chord("Cmaj7") or chord("C","maj7") →
  //   { root, quality, symbol, plain, intervals, pcs, notes }
  function chord(rootOrSymbol, quality) {
    let root = rootOrSymbol;
    if (quality === undefined) {
      const m = String(rootOrSymbol).trim().match(/^([A-G](?:♯|#|♭|b)?)(.*)$/);
      if (!m) return null;
      root = m[1].replace("♯", "#").replace("♭", "b");
      quality = m[2].trim();
    }
    const q = QUALITIES[quality];
    if (!q) return null;
    const rootPc = pc(root);
    const rootLetterIdx = LETTERS.indexOf(root[0].toUpperCase());
    const notes = q.ints.map((semis, i) => {
      const letter = LETTERS[(rootLetterIdx + q.degs[i]) % 7];
      return spellOnLetter((rootPc + semis) % 12, letter)
        ?? NAMES_SHARP[(rootPc + semis) % 12];
    });
    return {
      root, quality,
      symbol: root + quality,
      plain: `${root} ${q.plain}`,
      intervals: q.ints.slice(),
      pcs: q.ints.map((s) => (rootPc + s) % 12),
      notes,
    };
  }

  /* ---------- Diatonic harmony ---------- */

  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
  const DIATONIC = {
    major: {
      triads:   ["", "m", "m", "", "", "m", "dim"],
      sevenths: ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"],
    },
    minor: { // natural minor
      triads:   ["m", "dim", "", "m", "m", "", ""],
      sevenths: ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"],
    },
  };

  // diatonicChords("C") → [{ degree:1, roman:"I", nashville:"1", symbol:"C", … }, …]
  function diatonicChords(key, mode = "major", { sevenths = false } = {}) {
    const scaleType = mode === "minor" ? "naturalMinor" : "major";
    const notes = scale(key, scaleType);
    const qualities = DIATONIC[mode === "minor" ? "minor" : "major"][sevenths ? "sevenths" : "triads"];
    return notes.map((note, i) => {
      const q = qualities[i];
      const minorish = /^(m|dim)/.test(q) && !/^maj/.test(q);
      const suffix = q === "dim" ? "°" : q === "m7b5" ? "ø7"
        : q === "maj7" ? "Δ7" : /7/.test(q) ? "7" : "";
      const roman = (minorish ? ROMAN[i].toLowerCase() : ROMAN[i]) + suffix;
      const nashville = String(i + 1) + (minorish ? "-" : "");
      return { degree: i + 1, roman, nashville, root: note, quality: q,
               symbol: note + q, ...({ notes: chord(note, q)?.notes }) };
    });
  }

  /* ---------- Fretboard math ---------- */

  const TUNINGS = {
    bass4: ["E1", "A1", "D2", "G2"],
    bass5: ["B0", "E1", "A1", "D2", "G2"],
  };

  // noteAt(1, 3) → { midi: 36, name: "C2" } (3rd fret of the A string)
  function noteAt(string, fret, tuning = TUNINGS.bass4) {
    const midi = noteToMidi(tuning[string]) + fret;
    return { midi, name: midiToNote(midi) };
  }

  // Every place a pitch class (or exact midi) lives on the neck.
  // positions("C") → [{ string:0, fret:8, midi:36 }, { string:1, fret:3, … }, …]
  function positions(target, { tuning = TUNINGS.bass4, maxFret = 12, exact = false } = {}) {
    const found = [];
    const targetMidi = typeof target === "number" && target > 11 ? target : null;
    const targetPc = targetMidi !== null ? null : pc(target);
    tuning.forEach((open, string) => {
      const openMidi = noteToMidi(open);
      for (let fret = 0; fret <= maxFret; fret++) {
        const midi = openMidi + fret;
        if (exact || targetMidi !== null ? midi === targetMidi
                                         : midi % 12 === targetPc) {
          found.push({ string, fret, midi });
        }
      }
    });
    return found;
  }

  window.BT = {
    NAMES_SHARP, NAMES_FLAT, LETTERS, INTERVALS, SCALES, TUNINGS,
    CIRCLE_OF_FIFTHS: ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"],
    noteToMidi, midiToNote, midiToFreq, freqToMidi, pc, transpose,
    interval, scale, scalePcs, keySignature, chord, diatonicChords,
    noteAt, positions,
  };
})();
