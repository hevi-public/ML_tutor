# ML Tutor, Bass Tutor & Git Tutor

Three interactive courses on one static site — plain HTML/CSS/JS,
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
- **[Git Tutor](git/index.html)** (`git/`) — the advanced half of git, for people
  who already use it: history rewriting, the object database, forensics, and the
  collaboration commands. Every exercise runs against a **real git repository in
  your browser** — a full git implementation (isomorphic-git) on a browser
  filesystem — so `rebase --onto` and `reset --hard` can be practised on a
  repository that doesn't matter.

## Run it locally

```bash
npm install
npm run dev        # serves on http://localhost:8010 (ML tutor)
npm run dev:bass   # same server, opens the bass tutor
npm run dev:git    # same server, opens the git tutor
```

Opening `index.html` directly from disk mostly works too, but pages that
`fetch()` data (glossary, search, flashcards, the MNIST lab, the routine
builder) need the server, the bass tuner's microphone needs a secure context
(localhost or https), and the git tutor's sandboxes need IndexedDB, which
browsers deny to `file://` pages — those labs say so and tell you to serve the
site.

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` deploys all three tutors to GitHub Pages on every
push to `main`: it installs the vendored libraries (KaTeX, highlight.js,
VexFlow, isomorphic-git, lightning-fs), rebuilds the search indexes, verifies
the git sandbox against the runner's real `git` binary, and publishes the site —
ML tutor at the site root, bass tutor under `/bass/`, git tutor under `/git/`.

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

**Git Tutor** — Units 0–6 (start here → internals & plumbing → history
rewriting → debugging & forensics → workflow & collaboration → drills → expert
track): 35 pages and 38 graded labs. Each lab seeds a real repository in the
browser and checks your work by inspecting it — commit counts, trees, ancestry,
reflog contents — never by matching what you typed. `git rebase -i` opens the
actual `.git/rebase-merge/git-rebase-todo`; `git reflog` parses a real
`.git/logs/HEAD`; a `pre-commit` hook really can refuse your commit. The engine
is isomorphic-git plus this tutor's own implementations of the commands it
lacks (reset, revert, rebase, cherry-pick, bisect, reflog, fsck, blame -M/-C,
the pickaxe, and fetch/push against a second local repository). Where the
sandbox can't do something — gc, the network, `filter-repo`, `git submodule` —
the page says so instead of pretending. Its own glossary (60 terms), a git
syntax reference, concept map, search and flashcards.

All three sites keep progress in `localStorage` under separate namespaces
(`ml-tutor:*` / `bass-tutor:*` / `git-tutor:*`) — nothing leaves your browser.

## Maintenance scripts

```bash
npm run build:index   # rebuild data/search-index.json (ML) after editing pages
npm run build:bass    # rebuild bass/data/search-index.json + exercise-index.json
npm run build:git     # rebuild git/data/search-index.json + lab-index.json
npm run verify:git    # build every git fixture and check it against the real git CLI
npm run fetch:mnist   # regenerate data/datasets/mnist-mini.json (already committed)
```

`build:git` validates as well as indexes: it fails on a duplicate lab or page
id, a lab naming a fixture or a goal check that doesn't exist, a quiz answer out
of range, an unescaped `<placeholder>` in prose, or a page script that doesn't
parse. `verify:git` is the one that matters most — it builds all 14 sandbox
histories with the browser engine and hands them to the real `git` binary,
checking `fsck --strict`, every ref, and that the same history built by the git
CLI at the same timestamps produces identical commit, tree and blob ids.

See `PLAN.md` (ML), `bass/PLAN.md` (bass) and `git/PLAN.md` (git) for
architecture and the page-template contracts (`assets/page-template.html`,
`bass/assets/page-template.html` and `git/assets/page-template.html` for topic
pages, `bass/assets/session-template.html` for hands-on sessions).
