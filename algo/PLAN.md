# Algorithms Tutor — Project Plan

A zero-build, static HTML/CSS/JS course that takes a learner from working
programmer to algorithms expert. Sibling of the ML Tutor at the repo root, the
Bass Tutor in `bass/`, the Git Tutor in `git/` and the Web Dev Reference in
`web/`: same architecture, same pedagogy, its own content, engines, and
localStorage namespace. Open `algo/index.html` (or `npm run dev:algo`) and learn.

What makes this one different from its siblings: it is written for the **senior
software developer who started a CS degree and never got to the later stages** —
the CS course you skipped, taught through the systems you already ship. And
**every algorithm on the site is one steppable implementation**: the code that
is taught is the code that draws the animation is the code the labs grade you
against. They cannot drift apart.

---

## 1. Goals

- **Working-dev calibrated.** No CS degree assumed, but no beginner programming
  either: fast on coding mechanics, from-scratch on the theory — Big-O, proofs,
  graph theory — that the later years of uni would have covered.
- **Watch it run.** Every algorithm is steppable: play, pause, single-step,
  scrub backwards, with the data structure drawn live and operation counters
  running. Nothing is explained that can't also be watched.
- **Graphs are the centerpiece.** Two full units, plus a graph editor: draw
  your own graph and run any algorithm from the course on it.
- **Where you'll meet this.** Every page names the production systems the topic
  lives in — caches, build systems, storage engines — and the LLM-era systems
  that made half of this newly urgent: vector search, knowledge graphs,
  orchestration DAGs, tokenizers. A standing box, not an afterthought.
- **Complexity you can measure.** Operation counters plot real counts against n
  next to the claimed Big-O curve, so "this is O(n log n)" is a checkable
  claim, not a slogan.
- **Proofs on tap, never forced.** "Show the proof" layers for invariants,
  exchange arguments, the cut property, recursion trees and lower bounds — you
  can finish the course without opening one, or read every line.
- **Graded labs.** Implement the function; the harness tests it against cases
  (including adversarial ones) and tells you what complexity your code actually
  exhibited.

## 2. Curriculum (site sections = folders)

Twelve units rather than the family's usual nine: graph theory gets double
coverage by design, and visualisation and production systems each earn a unit
of their own.

| # | Unit | Key pages |
|---|------|-----------|
| 0 | **Start here** | how this tutor works · **what is an algorithm?** (flagship: linear vs binary search racing through a phone book — fine at 100 names, hopeless at a billion) · where should you start? (placement for a working dev) |
| 1 | **Foundations** | counting steps · **Big-O, Θ and Ω** (flagship: growth-rate racer) · recursion · recurrences & the Master theorem · logs, sums and friends · proving an algorithm correct · amortized analysis |
| 2 | **Data structures** | arrays & linked lists · stacks, queues & deques · **hash tables** (flagship: live hashing, collisions, load-factor slider) · binary search trees · balanced trees (AVL & red-black) · heaps & priority queues · union-find |
| 3 | **Sorting & searching** | binary search, done right · elementary sorts · merge sort · **quicksort** (flagship: pivot explorer, build-your-own-worst-case) · heapsort · sorting without comparing · why n log n is the floor (the site's first impossibility result) · order statistics: quickselect |
| 4 | **Graphs I: fundamentals** | graphs & how to store them (the graph editor debuts) · **breadth-first search** (flagship: frontier animation) · depth-first search · DAGs & topological sort (run on this site's own prerequisite map) · connected components · cycles & two-coloring · implicit graphs: grids, mazes, puzzles |
| 5 | **Graphs II: the classics** | **Dijkstra's algorithm** (flagship: live priority-queue panel, edit weights mid-run) · Bellman-Ford & negative weights · all pairs: Floyd-Warshall · A* & heuristic search · minimum spanning trees · strongly connected components · max flow, min cut · bipartite matching |
| 6 | **Design strategies** | choosing a strategy · greedy algorithms · Huffman coding · **dynamic programming** (flagship: naive fib call tree vs the memo table lighting up) · DP on sequences · knapsack & friends · DP on trees & bitmasks · backtracking & pruning |
| 7 | **Strings** | substring search, naively · **Knuth-Morris-Pratt** (flagship: failure-function stepper) · Rabin-Karp & rolling hashes · tries · suffix arrays |
| 8 | **Visualisation** | why visualise? · drawing trees (Reingold–Tilford) · **drawing graphs: force-directed layout** (flagship: springs, Fruchterman–Reingold, Barnes–Hut) · drawing DAGs (Sugiyama's layers) · matrices, treemaps & bundling: which picture for what · projections: seeing high dimensions |
| 9 | **Production & LLM systems** | dependency graphs & orchestration · **vector search & HNSW** (flagship: nearest-neighbour search as graph traversal) · knowledge graphs & graph RAG · tokenizers: tries meet BPE · beam search · caching & eviction · probabilistic structures · consistent hashing & rate limiters · storage engines: B-trees vs LSM |
| 10 | **Practice labs** | write your own sorts · build a hash table · **graph playground** (flagship: draw any graph, run everything from units 4–5 on it) · pathfinding race · dynamic programming lab · the gym (timed mixed drills) |
| 11 | **Expert track** | **P, NP and NP-completeness** (flagship: verifier vs solver) · reductions in practice · approximation algorithms · randomized algorithms · when theory meets the clock · bit tricks · very big & very parallel · where this goes next |

82 content pages, ~20 graded labs. Cross-cutting pages: **Glossary** (~120
terms, plain English first), **Notation reference** (`notation.html` — every
symbol used anywhere on the site: O, Θ, Ω, ω, o, lg, ⌊x⌋/⌈x⌉, ∑, T(n),
G=(V,E), |V| and |E|, deg(v), w(u,v), δ(s,v), mod, C(n,k) — its name, how to
pronounce it, what it means, and a link to the page that teaches it),
**Concept Map**, **Search**, **Flashcards**.

Two units are deliberately self-referential, because self-reference is the
cheapest proof that this stuff is real:

- **Unit 8 teaches the site's own renderers.** The tidy-tree layout on the BST
  pages, the force-directed layout behind the concept map and the graph
  editor's auto-arrange, and the layered DAG drawing are all algorithms — with
  their own histories, trade-offs and complexity bounds. Barnes–Hut needs the
  quadtrees idea (divide & conquer, unit 3); Sugiyama's layer assignment *is*
  topological sort (unit 4); crossing minimization is NP-hard (unit 11), which
  is why every real tool uses the barycenter heuristic (greedy, unit 6). The
  closing page, *which picture for what*, is the practical payoff: node-link vs
  adjacency matrix for dense graphs, treemaps for hierarchies, edge bundling,
  small multiples — and honest guidance on when each one misleads.
- **Unit 4's topological-sort page sorts this site's own prerequisite graph**
  — the same data that draws the concept map.

Unit 9 is the "why now" unit: the learner has shipped code that uses these
without the theory. Topological sort *is* the build system, the package
resolver and the agent-pipeline orchestrator; HNSW — the index inside most
vector databases — is greedy graph search over layered small-world graphs,
i.e. units 4–5 applied; knowledge-graph retrieval is BFS with scoring; BPE
tokenization is greedy merging over a trie; the KV cache is eviction policy;
Bloom filters, consistent hashing and B-trees vs LSM are the storage
interview, answered properly.

## 3. Site architecture

```
algo/
├── index.html              # landing: hero, resume box, unit list
├── PLAN.md
├── assets/
│   ├── css/site.css        # cloned from the family stylesheet, green accent,
│   │                       #   plus stepper / counter / lab styles
│   ├── page-template.html  # the page contract — copy to start a new page
│   └── js/
│       ├── site.js         # nav injection, prev/next, theme ("algo:" meta prefix)
│       ├── progress.js     # window.AlgoProgress, localStorage "algo-tutor:*"
│       ├── quiz.js         # declarative quizzes (same engine as the other sites)
│       ├── glossary.js     # term popovers + glossary page renderer
│       ├── notation.js     # symbol chips & popovers on KaTeX output
│       ├── algo/           # the mini-library: every algorithm as a steppable generator
│       │   ├── steps.js    #   the step-event contract + recorder/player (scrubbing)
│       │   ├── sorts.js · structures.js · graphs.js · dp.js · strings.js
│       │   └── random.js   #   seeded PRNG so demos and prose agree
│       ├── viz/            # renderers: array.js, tree.js, graph.js, grid.js,
│       │                   #   table.js, callstack.js, complexity-chart.js,
│       │                   #   layout.js (tidy tree, force-directed, sugiyama —
│       │                   #   unit 8's subject matter)
│       ├── graph-editor.js # draw nodes/edges, weights, directed toggle,
│       │                   #   URL-hash serialization
│       └── labs/
│           ├── runner.js   # Web Worker sandbox: run learner code with a timeout
│           └── checks.js   # grading vocabulary: correctness + operation counts
├── data/
│   ├── glossary.json       # terms: plain-English line + precise definition
│   ├── notation.json       # every symbol: name, pronunciation, meaning
│   ├── search-index.json   # generated: npm run build:algo
│   └── lab-index.json      # generated: every lab on the site
├── 00-start/ … 11-expert/  # one folder per unit, one HTML page per topic
└── glossary.html · notation.html · map.html · search.html · flashcards.html
```

**Page contract** (`assets/page-template.html`): every page declares
`<meta name="algo:unit|root|prev|next">`; `site.js` injects the header,
breadcrumb and prev/next footer. Inline JSON blocks: `class="quiz"` (quiz.js),
`class="symbols"` (notation.js), `class="lab"` (labs/runner.js at runtime,
`scripts/build-algo-index.js` at build time). One standing element this track
adds to the family contract: **`.box.in-the-wild` — "Where you'll meet this"**
— every page names the production and LLM-era systems the topic shows up in,
linking into unit 9 where a whole page exists.

**localStorage namespace** (`algo-tutor:*`, never colliding with the sibling
tutors on the same origin): `theme`, `progress`, `missed`, `cards`, `labs`,
`graphs` (saved playground graphs).

## 4. The engine

Three decisions hold the whole thing together:

- **One steppable implementation per algorithm.** Everything in
  `assets/js/algo/` is an ES generator that yields typed step events —
  `{type:'compare', i, j}`, `{type:'swap', i, j}`, `{type:'visit', node}`,
  `{type:'relax', edge, dist}`, `{type:'call'|'return'}` for recursion,
  `{type:'cell', i, j, value}` for DP tables. The player (`steps.js`) records
  yielded steps so the learner can scrub backwards; renderers in `viz/`
  subscribe to the event types they know how to draw. The taught code, the
  animated code and the reference the labs race against are the same function.
- **Counters are the curriculum.** Every step event increments operation
  counters (comparisons, swaps, reads, priority-queue ops).
  `complexity-chart.js` runs the same generator across a range of n — in a Web
  Worker so big n never freezes the page — and plots the empirical counts next
  to the claimed curve. Show first, prove in a layer.
- **The graph editor is a first-class input device.** Learners draw graphs (or
  load deterministic presets from the seeded PRNG), and every page in units
  4–5 runs its algorithm on *that* graph. Graphs serialize into the URL hash,
  so prose can deep-link into configured demos and learners can share them.
  Its auto-arrange button is the force-directed layout that unit 8 then opens
  up and teaches.

**Labs**: the learner writes a JS function in a plain `<textarea>`
(highlight.js for display — no editor dependency), executed in a Web Worker
sandbox with a timeout, so an infinite loop is a teachable moment rather than
a hung tab. The harness feeds correctness cases including adversarial ones
(sorted input to a naive quicksort, collision-heavy hash keys), and hands the
learner's code instrumented proxies so it can report *"your sort made ~n²
comparisons on shuffled input — that's not the O(n log n) you claimed."*
Hints and solutions are available and mark the lab as **assisted**, so "I did
this one unaided" stays meaningful.

## 5. Libraries (kept minimal, managed via npm — `package.json`)

- **KaTeX** — required. Recurrences, Θ-notation and proofs rendered as
  paraphrase would defeat the point. (The Git Tutor deliberately skips KaTeX;
  this track deliberately doesn't.) Loaded only on pages that use it.
- **highlight.js** — code display, already vendored for the siblings.
- **http-server** (dev dependency) — `npm run dev:algo`.
- **Zero new npm dependencies.** SVG for graphs and trees (clickable nodes),
  canvas for large arrays, grids and charts. No D3 — the layout algorithms
  are course content, so vendoring them would be cheating. No CodeMirror.

## 6. Pedagogy mechanics

### Plain language first

The reader is an experienced developer, so the family principle bends but
doesn't break: respect their engineering fluency, and build the *theory*
vocabulary from scratch.

- Everyday words before jargon: "the algorithm keeps a to-do list of places to
  look next — that list is called the **frontier**." Never the reverse.
- No term or symbol used before the site has introduced it; every jargon term
  is hoverable everywhere (glossary.js), plain-English line first.
- Analogies drawn from software the reader already ships: hash tables arrive
  via caches and database indexes, DAGs via build systems, amortized analysis
  via the dynamic array they've appended to a million times.
- Deliberate off-ramp: by units 9–11 standard terminology and CLRS-style
  conventions dominate (still hoverable), so the reader graduates able to read
  the textbooks and papers.

### Plain-language math

- Every displayed equation is immediately followed by an **"In plain
  English"** line. `T(n) = 2T(n/2) + O(n)` → *"solving a problem of size n
  costs two half-size problems plus a linear amount of stitching."*
- Every symbol in every equation is hoverable (notation.js + the per-page
  `class="symbols"` legend): name, pronunciation, what it stands for here.
  O(n log n) gets a pronunciation like any Greek letter does.
- Layered collapsibles: *the idea in words → the math → the proof*. You can
  finish the entire course without opening a proof layer.
- **Proofs are privileges, not prerequisites**: no quiz outside unit 11
  requires one.

### Page flow

*The idea → Watch it run → Where you'll meet this → The details / the proof
(layered) → The code → Lab (where present) → Check your understanding → Where
this goes next.* Quizzes gate "mark complete" but never block navigation;
missed questions become flashcards automatically.

## 7. Build order (milestones)

1. **Skeleton** — `algo/` folders, adapted family engines (site/progress/quiz/
   glossary/notation with the `algo:` prefix and `algo-tutor:*` namespace),
   recolored stylesheet, page template, landing page, and one complete sample
   page (`01-foundations/big-o.html`: growth-rate racer, KaTeX, symbols,
   quiz) proving the whole stack. Plumbing lands here, functional on arrival:
   `dev:algo`/`build:algo` scripts, `scripts/build-algo-index.js`, the
   Pages-workflow step, README blurb, root cross-link.
2. **The stepper engine** — steps.js contract, player with scrubbing,
   array/callstack renderers, seeded PRNG, counters + complexity-chart.
3. **Units 0–1** — start and foundations; notation.json complete (it's small
   and known up front), glossary seeded (~40 terms).
4. **Units 2–3** — data structures and sorting; tree and table renderers
   mature here.
5. **The graph engine + units 4–5** — graph editor, graph/grid renderers,
   presets. The centerpiece; budgeted as the largest milestone.
6. **Units 6–8** — strategies, strings, visualisation. The DP table walker
   and string steppers land here, and `viz/layout.js` graduates from
   infrastructure to subject matter (unit 8 teaches what milestones 2–5
   built); the concept map gets its force layout.
7. **Unit 9 + labs (unit 10)** — the production/LLM unit (live tokenizer,
   toy-scale HNSW demo, the rest honestly narrated), worker sandbox, grading
   harness, lab-index.json, six lab pages.
8. **Unit 11 + integration and polish** — expert pages, concept map wired to
   prereq metadata, search aliases, flashcards, cross-tutor links, README,
   a11y/mobile/print pass.

## 8. Open decisions (defaults chosen, easy to change)

- **JavaScript is the single implementation language**; runnable JS is ground
  truth. CLRS-style pseudocode appears only as a collapsible layer on flagship
  pages — the off-ramp principle applied to notation.
- **Scrub-back by recording steps**, capped (~5,000 events); past the cap the
  player re-runs the generator to the target step. Memory bound beats CPU
  bound at teaching-sized inputs.
- **SVG for graphs and trees, canvas for arrays, grids and charts** —
  clickability where the learner points at things, throughput where n grows.
- **Honest scale in unit 9.** The HNSW demo runs the real algorithm on toy
  2-D embeddings; real embedding models are out of scope and the page says so
  (`.box.sim-note`, the family honesty rule). Same for storage engines: B-tree
  splits are animated, fsync is narrated.
- **Flow depth**: Edmonds-Karp runnable; Dinic's and push-relabel narrated in
  layers.
- **No external judge, no LeetCode-volume ambitions.** The gym is small and
  self-contained; this site teaches implementation and reasoning, not grind.
- **Deterministic demos**: seeded PRNG wherever prose quotes an outcome;
  learner-drawn graphs are the exception by design.
- **`<textarea>` + highlight.js is enough for lab-sized functions.** Revisit
  only if lab feedback demands it.
