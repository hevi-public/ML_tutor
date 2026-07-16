# Bass Tutor — Project Plan

A zero-build, static HTML/CSS/JS course that takes a learner from novice to
expert on bass guitar and the music theory behind it. Sibling of the ML Tutor
at the repo root: same architecture, same pedagogy, its own content, engines,
and localStorage namespace. Open `bass/index.html` (or `npm run dev:bass`) and
learn.

---

## 1. Goals

- **Novice → expert path**: a guided curriculum — reading music, the fretboard,
  theory, technique, bass lines, styles — with a self-assessment entry point for
  learners with prior knowledge.
- **Practice-first**: every topic page ends with concrete practice exercises —
  notation + tab, playable in the browser, with tempo targets and a practice log.
- **Interactive first**: every concept is hearable and tappable — an SVG
  fretboard you can play, notation that plays itself, a metronome, ear training,
  a play-along groove machine, a microphone tuner.
- **Plain language first**: everyday words before jargon, every symbol named and
  tappable, counting written out ("1 & 2 &"), no term used before it's taught.

## 2. Curriculum (site sections = folders)

| # | Unit | Key pages |
|---|------|-----------|
| 0 | **Start Here** | welcome & how to use the site · gear & setup · tuning · self-assessment → suggested starting point |
| 1 | **Reading Music** | the staff & bass clef · rhythm & counting · tab ↔ notation · time signatures |
| 2 | **The Fretboard** | strings & fret math · notes on the fretboard (landmarks, octave shapes) · intervals as shapes · positions & fingering |
| 3 | **Theory Core** | intervals · the major scale · keys & the circle of fifths · minor scales · pentatonics & blues · triads · 7th chords & symbols · diatonic harmony (Roman numerals, Nashville numbers) |
| 4 | **Technique** | right hand · left hand · timing & groove · tone & dynamics · how to practice |
| 5 | **Bass Lines** | the bassist's job · roots & chord tones · approach notes · walking bass 101 · the 12-bar blues · song forms & charts |
| 6 | **Styles** | rock · blues shuffle · funk · soul/Motown · reggae · jazz walking — each with playable grooves and groove-machine presets |
| 7 | **Practice Labs** | fretboard trainer · ear trainer · groove machine (play-along) · tuner (microphone) · practice-routine builder |
| 8 | **Expert Track** | modes · chord extensions · harmonic analysis · transcription · improvisation & fills · advanced techniques (slap, tapping, harmonics, 5-string) · next steps & listening list |

Cross-cutting pages: **Glossary** (every term, plain English first), **Symbol
Reference** (`notation.html` — every music symbol: name, how to say it, what it
means for a bass player), **Concept Map**, **Search**, **Flashcards** (spaced
repetition over terms, symbols, and missed quiz questions).

## 3. Site architecture

```
bass/
├── index.html              # landing: path picker, progress resume
├── PLAN.md
├── assets/
│   ├── css/site.css        # adapted from the ML site: same theming, amber accent,
│   │                       #   music components (fretboard, score, practice cards…)
│   ├── page-template.html  # the page contract — copy to start a new topic page
│   └── js/
│       ├── site.js         # nav injection, prev/next, theme ("bass:" meta prefix)
│       ├── progress.js     # window.BassProgress, localStorage "bass-tutor:*"
│       ├── quiz.js         # declarative quizzes (same engine as the ML site)
│       ├── glossary.js     # term popovers + glossary page renderer
│       ├── notation.js     # music-symbol chips & popovers (no KaTeX here)
│       ├── practice.js     # practice cards: render, play, log (bass-tutor:practice)
│       ├── music/          # the "mini library" of this site (vanilla JS):
│       │   ├── theory.js   #   window.BT — notes, intervals, scales, chords, keys
│       │   ├── audio.js    #   window.BTAudio — plucked-bass synth, metronome, drone
│       │   ├── fretboard.js#   window.BTFret — interactive SVG fretboard
│       │   └── score.js    #   window.BTScore — VexFlow wrapper (notation + tab)
│       ├── viz/            # one module per bespoke visualization
│       └── labs/           # one module per practice lab
├── data/
│   ├── glossary.json       # terms: plain-English line + precise definition + links
│   ├── notation.json       # music symbols: name, pronunciation, meaning, aliases
│   ├── search-index.json   # generated: npm run build:bass
│   └── exercise-index.json # generated: every practice exercise on the site
├── 00-start/ … 08-expert/  # one folder per unit, one HTML page per topic
├── glossary.html · notation.html · map.html · search.html · flashcards.html
```

**Page contract** (`assets/page-template.html`): every page declares
`<meta name="bass:unit|root|prev|next">`; `site.js` injects the header,
breadcrumb, and prev/next footer. Inline JSON blocks:
`class="quiz"` (consumed by quiz.js), `class="symbols"` (notation.js),
`class="practice"` (practice.js at runtime, `scripts/build-bass-index.js` at
build time). Quiz/page ids are stable slugs; exercise ids are globally unique,
prefixed with the page slug.

**Vendored libraries**: the one dependency beyond the shared repo tooling is
**VexFlow 4** (`vexflow@^4.2.5`, script-tag UMD exposing `Vex.Flow`) for
notation + tab rendering. Unit pages load it via
`../../node_modules/vexflow/build/cjs/vexflow.js` (root-level bass pages:
`../node_modules/…`). No KaTeX, no highlight.js on bass pages. Everything else
is hand-written vanilla JS — Web Audio needs no library.

**Audio rules**: no sound before a user gesture — every play path goes through
`BTAudio.ensure()` inside the click/tap handler. The metronome schedules on the
audio clock with a lookahead that widens while the tab is hidden, so it never
gaps in background tabs.

**localStorage namespace** (`bass-tutor:*`, never colliding with the ML site's
`ml-tutor:*` on the same origin): `theme`, `progress`, `missed`, `cards`,
`practice`, `trainer`, `ear`.

## 4. Pedagogy mechanics

Same governing principle as the ML site, applied to music:

- **Everyday words before jargon.** "Two frets apart" before "whole step";
  "the home note" before "root"; "how fast the beat goes" before "tempo".
- **Every jargon term is tappable everywhere** (glossary.js); the popover leads
  with the one-line plain-English version.
- **Every notated example is playable** and followed by the counting written
  out in plain text ("1 & 2 & 3 & 4 &" with the played beats bolded).
- **No symbol before it's named.** Symbol chips under examples name each glyph
  (♭ "flat — one fret down"). The symbol reference is searchable by
  descriptions ("the fancy F", "squiggle that means rest").
- **Practice is graded, not vague.** Exercises say what "done" sounds like,
  give a starting tempo and a target tempo, and get logged so the routine
  builder can schedule reviews.
- **Deliberate off-ramp**: by Units 6–8 standard terminology dominates (still
  tappable) — chord charts, Roman numerals, style names — so the learner can
  walk into a rehearsal or a real chart fluent.

### Page flow

*The idea → Hear it / find it (interactive) → The details (layered
disclosure) → Practice (playable, loggable) → Quiz → What's next.*
Quizzes gate "mark complete" but never block navigation. Missed quiz questions
become flashcards automatically.

## 5. Build order (milestones)

1. **Skeleton** — adapted engines + template + landing + reference shells +
   welcome page. Proves the contract.
2. **Music core** — theory.js, audio.js, fretboard.js, score.js, practice.js +
   the fretboard flagship page + tuning page. Proves fretboard, synth, VexFlow,
   practice cards end-to-end.
3. **Reference layer** — glossary + symbol data, search index builder wired
   (`npm run build:bass`), flashcards live.
4. **Units 0–2** complete.
5. **Unit 3** (theory core) + circle-of-fifths viz.
6. **Units 4–5** (technique, bass lines).
7. **Labs + Unit 6** (styles with groove-machine presets).
8. **Unit 8 + concept map + polish** (a11y, print, mobile) — then the GitHub
   Pages deployment workflow.

## 6. Open decisions (defaults chosen, easy to change)

- 4-string EADG throughout; 5-string concepts covered on one Expert page
  (`BT.TUNINGS` already carries `bass5` for a future toggle).
- Balanced style coverage (rock/blues/funk-soul/reggae/jazz get equal depth).
- Karplus-Strong pluck synthesis; the `BTAudio.pluck()` API hides the
  synthesis, so internals can be swapped if the low E sounds thin.
- Serve via `file://` where possible; anything using `fetch()` (glossary,
  search, flashcards, routine builder) needs an http server and degrades with a
  friendly message, same as the ML site.
