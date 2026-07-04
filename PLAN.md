# ML Interactive Tutor — Project Plan

A zero-build, static HTML/CSS/JS site that takes a learner from novice to expert in
machine learning. Everything runs in the browser — no server-side code, no framework,
no build step. Open `index.html` (or `python3 -m http.server`) and learn.

---

## 1. Goals

- **Novice → expert path**: a guided curriculum with prerequisites, checkpoints, and
  increasing depth (intuition → visual → math → from-scratch implementation).
- **Comprehensive documentation**: every concept gets its own page, hyperlinked into a
  concept graph (glossary terms link everywhere they appear).
- **Interactive first**: every major concept has at least one manipulable demo —
  sliders, canvas visualizations, in-browser training — not just prose.
- **Explorable**: multiple entry points — linear course path, concept map, glossary,
  full-text search, "I want to understand X" quick links.

## 2. Curriculum (site sections = folders)

Each unit is a folder of pages; each page ends with a quiz + links onward.

| # | Unit | Key pages |
|---|------|-----------|
| 0 | **Start Here** | What is ML, how to use this site, self-assessment quiz that suggests a starting point |
| 1 | **Math Foundations** | *Written for people whose school math is a faint memory.* Starts with **"How to read math"**: the Greek alphabet (θ "theta", σ "sigma", λ "lambda"…), operator symbols (∑ "sum of", ∂ "partial derivative", ∈ "is in", |x| "absolute value"…), and how to read whole equations aloud in English. Then vectors & matrices, derivatives & gradients, probability, statistics — each rebuilt from everyday intuition (a vector is an arrow / a list of numbers; a derivative is "how fast this changes if I nudge that") with interactive refreshers (drag a vector, see the dot product change) |
| 2 | **Core Concepts** | Data & features, train/val/test, loss functions, overfitting & regularization, bias–variance, evaluation metrics (interactive confusion matrix, ROC curve you can drag thresholds on) |
| 3 | **Classical ML** | Linear regression, logistic regression, kNN, decision trees, random forests, SVM, naive Bayes, k-means, PCA — each with a canvas decision-boundary / fit explorer |
| 4 | **Neural Networks** | Perceptron, MLP, activation functions, backpropagation (step-through animation), gradient descent & optimizers (SGD/momentum/Adam race visualizer), initialization, regularization (dropout demo) |
| 5 | **Deep Learning** | CNNs (interactive convolution filter on an image), embeddings (2-D projection explorer), attention & transformers (attention-weight demo). *RNNs/LSTMs folded into the attention page as historical context — attention is what a modern learner needs.* |
| 6 | **Modern ML** | LLMs & tokenization (live tokenizer demo), fine-tuning vs prompting, RLHF, diffusion models (noise/denoise slider), evaluation of generative models |
| 7 | **Practice Labs** | In-browser playgrounds: train an MLP on toy 2-D datasets (TensorFlow-Playground style), MNIST digit classifier trained in a Web Worker, k-means on your own pasted data |
| 8 | **Expert Track** | Backprop derived from scratch, implementing autodiff in JS, reading papers guide, bias/fairness, when ML fails, annotated further-reading list |

Cross-cutting pages: **Glossary** (every term, ~150 entries), **Notation Reference**
(`notation.html` — every symbol used anywhere on the site: its name, how to pronounce
it, what it means in ML, and a link to the page that teaches it; searchable, and the
target of every symbol tooltip), **Concept Map** (SVG graph of all topics, clickable),
**Search**, **Progress Dashboard**, **Flashcards** (spaced repetition over glossary +
quiz misses).

## 3. Site architecture

```
ml/
├── index.html              # landing: path picker, progress resume, concept map teaser
├── PLAN.md
├── assets/
│   ├── css/site.css        # shared styles, dark mode via prefers-color-scheme + toggle
│   └── js/
│       ├── site.js         # nav injection, prev/next, breadcrumbs, theme, deep links
│       ├── progress.js     # localStorage progress + dashboard rendering
│       ├── quiz.js         # declarative quizzes from JSON blocks, instant feedback
│       ├── glossary.js     # term tooltips (<dfn>/data-term → popover from glossary.json)
│       ├── notation.js     # symbol tooltips on KaTeX output + inline symbol legends
│       ├── search.js       # client-side index (built JSON) + results page
│       ├── viz/            # one module per visualization (gradient-descent.js, …)
│       └── ml/             # tiny ML lib in vanilla JS: matrix.js, autodiff.js,
│                           #   models.js (linreg, logreg, knn, tree, kmeans, mlp)
├── data/
│   ├── glossary.json       # terms: plain-English line + precise definition + links
│   ├── notation.json       # every symbol: name, pronunciation, meaning, aliases
│   ├── search-index.json   # generated: page → headings/keywords
│   └── datasets/           # iris.json, moons/spirals generators, mnist-mini (subset)
├── 00-start/ … 08-expert/  # one folder per unit, one HTML page per topic
├── glossary.html
├── notation.html           # "How to read math" reference: all symbols, searchable
├── map.html                # interactive SVG concept map
├── search.html
└── progress.html
```

**Page template contract**: every topic page declares `<meta name="unit">`,
`<meta name="prereqs">`, and uses shared markup slots (`<nav data-site-nav>`, quiz
`<script type="application/json" class="quiz">`) so `site.js` can wire navigation,
prerequisites banners, and quizzes uniformly.

## 4. HTML/JS features we deliberately exercise

- **Canvas 2D** — all training/boundary visualizations; **SVG** — concept map, diagrams.
- **Web Workers** — training loops off the main thread (MNIST lab stays responsive).
- **localStorage** — progress, quiz scores, flashcard scheduling, theme.
- **`<details>/<summary>`** — progressive disclosure ("Show the math", "Show the code").
- **`<dialog>`** — glossary popovers, quiz results.
- **`<input type="range">` + `<output>`** — every hyperparameter slider.
- **`<template>`** — quiz/flashcard rendering.
- **URL hash deep links** — link straight to a section or a demo preset
  (`mlp.html#preset=spiral&lr=0.03`), so explanations can hyperlink into *configured*
  demos.
- **`prefers-color-scheme`, `prefers-reduced-motion`** — respected everywhere.
- **Print stylesheet** — each unit prints as clean documentation.
- **Keyboard navigation** — ←/→ prev/next page, `/` focuses search.

## 5. Libraries (kept minimal, managed via npm — `package.json`)

- **KaTeX** — math rendering. Non-negotiable for units 1, 4, 8.
- **highlight.js** — code samples.
- **http-server** (dev dependency) — `npm run dev` serves the site locally.
- Pages reference libraries via relative paths into `node_modules/` (works over both
  http and file://). No build step yet; if one becomes useful later, npm scripts are
  the place for it.
- Everything else vanilla: charts and demos are custom canvas (better pedagogy, no
  dependency weight). No D3.

## 6. Pedagogy mechanics

### Plain language first (the site's governing principle)

The target reader did math a long time ago and is new to ML jargon. So, everywhere —
prose, math, demos, quizzes:

- **Everyday words before jargon.** Every concept opens with an analogy or plain
  description; the technical term is introduced *after* the idea ("the model's guesses
  get graded — that grade is called the **loss**"). Never the reverse.
- **No term used before it's introduced** — same rule as for math symbols. The page
  template's prereq metadata is checked against the glossary so a page can't casually
  use "regularization" if no prereq page has taught it.
- **Every jargon term is hoverable everywhere** (glossary.js): the popover leads with
  the one-line plain-English version, then the precise definition. Glossary entries
  are written in that order too.
- **Demos speak plainly.** Sliders and labels say "how big a step the model takes"
  with the jargon in parentheses ("learning rate"), not the other way round — until
  later units, where the wording gradually flips to standard terminology so the reader
  finishes fluent in it.
- **Quizzes test understanding, not vocabulary** — asked in plain words; jargon
  recall is what flashcards are for.
- **Search understands plain phrasing.** Aliases in the index: "how wrong the model
  is" → loss, "overfitting/memorizing" → overfitting, "that E-looking symbol" → ∑.
- **Deliberate off-ramp:** by Units 6–8 the training wheels loosen — standard
  terminology and notation dominate (still hoverable), so the reader can graduate to
  real papers and docs. "Expert" includes *speaking the language*.

### Plain-language math (the same principle, applied to notation)

- Every displayed equation is immediately followed by an **"In plain English"** line —
  the same statement as a sentence. Example: `ŷ = wx + b` → *"the prediction
  (y-hat) is the input times a weight, plus a starting offset."*
- Every symbol in every equation is **hoverable/tappable**: a popover gives its name
  ("θ — theta"), pronunciation, what it stands for here, and a link to the Notation
  Reference. Implemented in `notation.js` by wrapping KaTeX output spans using a
  per-page symbol legend (`<script type="application/json" class="symbols">`).
- First use of any symbol on a page also gets an inline legend box under the
  equation: one line per symbol ("w — 'weight': how much the input matters").
- Collapsible math sections are layered: *"Show the idea in words" → "Show the math"
  → "Show the derivation"* — you can follow the entire course without ever opening
  the derivation layer.
- No symbol is ever used before the site has named it. The search index includes
  symbol names, so searching "sigma" or "that E-looking symbol" (aliases like
  "curly E", "upside-down A" are indexed too) finds the right entry.

### Page flow

- Each page: *Intuition → Interactive demo → Math (collapsible) → Code (JS, runnable)
  → Quiz → What's next*.
- Quizzes gate "mark complete" but never block navigation.
- Prereq banner on each page: "This assumes [gradients] — 5-min refresher" links.
- Spaced-repetition flashcards auto-generated from missed quiz questions.
- Progress dashboard shows the concept map colored by mastery.

## 7. Build order (milestones)

1. **Skeleton** — template, site.css, site.js nav/theme, index, one complete sample
   page (linear regression with live-fit canvas demo + quiz). Proves the whole stack.
2. **Core engine** — quiz.js, progress.js, glossary.js + glossary.json seed.
3. **Units 0–2** content + demos.
4. **ml/ mini-library + Unit 3** (classical ML demos reuse it). *Done for the
   core path (logreg, kNN, trees+forests, k-means); SVM, naive Bayes, PCA are
   backlog — slot them in whenever, the library and template make each a
   one-page job. autodiff.js lands with Unit 4, which is what needs it.*
5. **Units 4–5** + the MLP playground lab (Web Worker training).
6. **Units 6–8**, concept map, search, flashcards.
7. **Polish** — a11y pass, print styles, cross-browser check, offline check.

## 8. Open decisions (defaults chosen, easy to change)

- Serve via `file://` where possible; anything using `fetch()` (search, glossary JSON)
  needs `python3 -m http.server` — we'll inline critical JSON as `<script type="application/json">`
  fallbacks so file:// still works fully.
- MNIST subset size: ~2k samples (~1.5 MB JSON) to keep the repo light.
- English only, no i18n scaffolding for v1.
