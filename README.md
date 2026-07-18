# ML Tutor & Bass Tutor

Two interactive, novice-to-expert courses on one static site — plain HTML/CSS/JS,
no build step, everything runs in your browser. Plain language first: every
symbol is named, every concept opens with an everyday analogy before the jargon
arrives.

- **[ML Tutor](index.html)** (site root) — machine learning: math foundations →
  classical models → neural networks → LLMs & diffusion, with models that train
  live in your browser.
- **[Bass Tutor](bass/index.html)** (`bass/`) — bass guitar & music theory, in
  two selectable versions: **hands-on sessions** (the default — 34 guided
  practice sessions, bass in hand from the first minute, built for a tablet on
  a music stand) and the **[reference course](bass/reference.html)** (every
  topic concept-first, in full layered depth). Both share a playable fretboard,
  notation that plays itself, practice exercises with a log, ear training, a
  groove machine, and a microphone tuner.

## Run it locally

```bash
npm install
npm run dev        # serves on http://localhost:8010 (ML tutor)
npm run dev:bass   # same server, opens the bass tutor
```

Opening `index.html` directly from disk mostly works too, but pages that
`fetch()` data (glossary, search, flashcards, the MNIST lab, the routine
builder) need the server, and the bass tuner's microphone needs a secure
context (localhost or https).

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` deploys both tutors to GitHub Pages on every push
to `main`: it installs the vendored libraries (KaTeX, highlight.js, VexFlow),
rebuilds both search indexes, and publishes the site — ML tutor at the site
root, bass tutor under `/bass/`.

One-time setup: after the first push to `main`, the workflow enables Pages
automatically. If that first run complains about Pages not being configured,
flip **Settings → Pages → Build and deployment → Source** to **GitHub Actions**
and re-run it. The site lands at `https://<owner>.github.io/<repo>/`.

Prefer self-hosting? Any static file server works:
`python3 -m http.server` in the repo root serves both tutors (mic-based
features need https or localhost).

## What's inside

**ML Tutor** — Units 0–8 (what is ML → math foundations → core concepts →
classical models → neural networks → deep learning → LLMs & diffusion →
hands-on labs → expert track), a TensorFlow-Playground-style MLP trainer and an
MNIST lab training in Web Workers on the site's own mini ML library
(`assets/js/ml/`), a glossary, a math-notation guide, a concept map, full-text
search, and spaced-repetition flashcards.

**Bass Tutor** — two versions of one curriculum, sharing engines and progress:

- *Hands-on sessions* (`bass/index.html`, the default): 34 guided practice
  sessions in 6 phases (first sounds → fretboard & rhythm → theory in your
  hands → grooves & lines → styles → expert moves). Practice-first — every
  session tunes up, warms up, plays something new, then explains why it worked,
  with "go deeper" links into the reference course. Tablet-friendly play mode:
  big type, step cards, a fixed session bar with prev/next, metronome, and a
  screen wake-lock toggle (bottom bar in portrait, thumb rail in landscape).
- *Reference course* (`bass/reference.html`): Units 0–8 (start here → reading
  music → the fretboard → theory core → technique → bass lines → styles →
  practice labs → expert track), every topic concept-first in full layered
  depth.

Both are built on ~50 reference pages + 34 session pages with playable
notation+tab (VexFlow) and practice exercises that log into a routine builder,
on the site's own music library (`bass/assets/js/music/`: note math, a
Karplus-Strong bass synth, a drift-free metronome, an interactive SVG
fretboard). Labs: fretboard trainer, ear trainer, groove machine (play-along
band with style presets), microphone tuner, routine builder. Its own glossary
(90 terms), music-symbol reference, concept map, search, and flashcards.

Both sites keep progress in `localStorage` under separate namespaces
(`ml-tutor:*` / `bass-tutor:*`) — nothing leaves your browser.

## Maintenance scripts

```bash
npm run build:index   # rebuild data/search-index.json (ML) after editing pages
npm run build:bass    # rebuild bass/data/search-index.json + exercise-index.json
npm run fetch:mnist   # regenerate data/datasets/mnist-mini.json (already committed)
```

See `PLAN.md` (ML) and `bass/PLAN.md` (bass) for architecture and the
page-template contracts (`assets/page-template.html`,
`bass/assets/page-template.html` for topic pages,
`bass/assets/session-template.html` for hands-on sessions).
