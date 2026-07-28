# ML Tutor, Bass Tutor & Web Dev Reference

Two interactive, novice-to-expert courses and one working developer's reference
on a single static site — plain HTML/CSS/JS, no build step, everything runs in
your browser. Plain language first: every symbol is named, every concept opens
with an everyday analogy before the jargon arrives.

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
- **[Web Dev Reference](web/index.html)** (`web/`) — Angular, RxJS, Vitest and
  pnpm, in a reference shape rather than a course one: what the current best
  practice is, what it replaced, why it changed, and the official docs one click
  away. Every versioned claim is a record in one ledger
  (`web/data/changes.json`), so the pages, the deprecation list and the timeline
  cannot drift apart.

## Run it locally

```bash
npm install
npm run dev        # serves on http://localhost:8010 (ML tutor)
npm run dev:bass   # same server, opens the bass tutor
npm run dev:web    # same server, opens the web dev reference
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

**Web Dev Reference** — a reference track, not a course, so the page shape is
different: *at a glance → do it this way now → what it replaced and why →
gotchas → live demo → legacy panel → official docs*. 38 pages across four
sections — Angular (12), RxJS (7), Vitest (6), pnpm (5) — plus cross-cutting
views generated from the change ledger: a deprecation list, a version timeline,
a migration-schematic index, and a searchable index of every official doc it
links to. Search covers three kinds of result at once — pages, change records
(so searching a retired API like `toPromise` finds its replacement), and the
official docs — with aliases for how people actually phrase things ("view not
updating" → change detection, "NG0203" → dependency injection).

Three live demos, each implementing the thing rather than animating a
recording: a working signal graph (real recompute counters, showing laziness
and glitch-free propagation), a change-detection visualiser (one tree, one
event, three strategies), and a marble player simulating the four flattening
operators over an editable source. Plus a version filter — set which versions
you're on and every badge site-wide tells you whether it applies to you yet.

All three sites keep state in `localStorage` under separate namespaces
(`ml-tutor:*` / `bass-tutor:*` / `web-ref:*`) — nothing leaves your browser.

## Maintenance scripts

```bash
npm run build:index   # rebuild data/search-index.json (ML) after editing pages
npm run build:bass    # rebuild bass/data/search-index.json + exercise-index.json
npm run build:web     # rebuild web/data/search-index.json (pages + changes + docs)
npm run check:links   # validate web/data/links.json — see below
npm run fetch:mnist   # regenerate data/datasets/mnist-mini.json (already committed)
```

`check:links` runs three passes over the Web Dev Reference's documentation
links: referential integrity (offline — every `data-doc` id resolves, and every
documentation `href` matches what the registry says), liveness, and anchor
existence for `#fragment` URLs. Add `-- --offline` to skip the network passes;
that is the form CI runs, since a documentation site being unreachable should
never block a deploy.

See `PLAN.md` (ML), `bass/PLAN.md` (bass) and `web/PLAN.md` (reference) for
architecture and the page-template contracts (`assets/page-template.html`,
`bass/assets/page-template.html` for topic pages,
`bass/assets/session-template.html` for hands-on sessions,
`web/assets/page-template.html` for reference pages).

`web/PLAN.md` also documents the reference track's one structural rule: every
versioned claim lives once in `web/data/changes.json`, and the deprecation
list, timeline and migration index are generated from it — so correcting a
version number is a one-line edit that fixes the page and all three views at
once.
