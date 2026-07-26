# Git Tutor — Project Plan

A zero-build, static HTML/CSS/JS course on the advanced half of git, for people
who already use it. Sibling of the ML Tutor at the repo root and the Bass Tutor
in `bass/`: same architecture, same pedagogy, its own content, engines, and
localStorage namespace. Open `git/index.html` (or `npm run dev:git`) and learn.

What makes this one different from its siblings: **every exercise runs against a
real git repository inside the browser.** Not a simulation of git — a full git
implementation writing real objects, real trees and real refs to a real
filesystem, which the CI pipeline checks against the actual `git` binary on
every deploy.

---

## 1. Goals

- **Advanced, not introductory.** The reader commits, branches and pushes
  already. No page explains what a commit is; every page explains what a command
  *does to the repository*.
- **Practise the frightening commands somewhere safe.** Nobody rehearses
  `rebase --onto` on the repository they get paid to look after, which is
  precisely why so few people are fluent in it. Each page ships a sandbox and a
  reset button.
- **Show the machinery.** Where a lesson has a file behind it —
  `.git/HEAD`, `logs/HEAD`, `rebase-merge/git-rebase-todo`, `BISECT_LOG` — the
  page opens that file. Half of git's mystique is that its state is invisible.
- **Graded by the repository, not by the keystrokes.** A lab passes when the
  repository is in the right shape, however you got it there.
- **Never fake anything.** Where the sandbox can't do something, it says so, by
  name, in a `.box.sim-note` — and typing the command says so too.

## 2. Curriculum (site sections = folders)

| # | Unit | Key pages |
|---|------|-----------|
| 0 | **Start here** | how this tutor works (and why it's really git) · the one mental model |
| 1 | **Internals & plumbing** | objects and hashes · blobs, trees, commits · refs, HEAD & symbolic refs · the index · revision syntax · **a commit, by hand** (flagship) |
| 2 | **History rewriting** | amend · reset vs revert · cherry-pick · interactive rebase · squash/fixup/autosquash · rebase --onto · rebase vs merge · reflog recovery · rewriting published history |
| 3 | **Debugging & forensics** | bisect · blame -M/-C · the pickaxe (-S vs -G) · reflog archaeology · fsck and dangling objects |
| 4 | **Workflow & collaboration** | stash tricks · worktrees · refspecs and remotes · --force-with-lease · merge strategies and rerere · hooks · submodules and subtrees |
| 5 | **Drills** | recovery drill (4 timed scenarios) · free sandbox |
| 6 | **Expert track** | packfiles and gc · notes and replace refs · big repositories · when not to rewrite |

35 content pages, 38 labs. Cross-cutting pages: **Glossary** (60 terms, plain
English first), **Syntax reference** (`notation.html` — every revision selector,
range, refspec, pathspec and tree mode: what it's called, how to say it, what it
selects), **Concept Map**, **Search**, **Flashcards**.

## 3. Site architecture

```
git/
├── index.html              # landing: hero, resume box, unit list, BUILT gate
├── PLAN.md
├── assets/
│   ├── css/site.css        # cloned from the ML stylesheet: same theming, violet
│   │                       #   accent, plus terminal / DAG / object / lab styles
│   ├── page-template.html  # the page contract — copy to start a new page
│   └── js/
│       ├── site.js         # nav injection, prev/next, theme ("git:" meta prefix)
│       ├── progress.js     # window.GitProgress, localStorage "git-tutor:*"
│       ├── quiz.js         # declarative quizzes (same engine as the other sites)
│       ├── glossary.js     # term popovers + glossary page renderer
│       ├── notation.js     # syntax chips & popovers (no KaTeX here)
│       ├── lab.js          # the lab runner: seed, mount, grade (cf. practice.js)
│       ├── git/            # the "mini library" of this site (vanilla JS):
│       │   ├── repo.js     #   window.GT       — FS, repo lifecycle, refs, REFLOGS
│       │   ├── plumbing.js #   window.GTPlumb  — hashing, trees, revision syntax
│       │   ├── merge3.js   #   window.GTMerge  — diff3 merge, unified diff
│       │   ├── porcelain.js#   window.GTPorc   — the commands isomorphic-git lacks
│       │   ├── fixtures.js #   window.GTFix    — 14 deterministic histories
│       │   └── cli.js      #   window.GTCli    — argv → engine, git-faithful output
│       ├── viz/            # terminal.js, dag.js, objects.js
│       └── labs/checks.js  # window.GTChecks — the goal-predicate vocabulary
├── data/
│   ├── glossary.json       # terms: plain-English line + precise definition
│   ├── notation.json       # git syntax: name, pronunciation, what it selects
│   ├── search-index.json   # generated: npm run build:git
│   └── lab-index.json      # generated: every lab on the site
├── 00-start/ … 06-expert/  # one folder per unit, one HTML page per topic
└── glossary.html · notation.html · map.html · search.html · flashcards.html
```

**Page contract** (`assets/page-template.html`): every page declares
`<meta name="git:unit|root|prev|next">`; `site.js` injects the header,
breadcrumb and prev/next footer. Inline JSON blocks: `class="quiz"` (quiz.js),
`class="symbols"` (notation.js), `class="lab"` (lab.js at runtime,
`scripts/build-git-index.js` at build time). Quiz ids are stable page slugs; lab
ids are globally unique and prefixed with the page slug.

**Vendored libraries** — two files, loaded only on pages that have a lab:

- `isomorphic-git` (UMD global `git`), **pinned to exactly 1.34.0**. From 1.36
  the UMD bundle stopped carrying its own Buffer polyfill and throws
  `Buffer is not defined` in a browser. A caret range here breaks every lab.
- `@isomorphic-git/lightning-fs` (global `LightningFS`), an IndexedDB-backed
  filesystem.

**localStorage namespace** (`git-tutor:*`, never colliding with `ml-tutor:*` or
`bass-tutor:*` on the same origin): `theme`, `progress`, `missed`, `cards`,
`labs`, `history`.

## 4. The engine

isomorphic-git supplies a real object database, refs, trees and the index. It
stops short of most of what this course is about, so `porcelain.js` implements
the rest **on top of the real plumbing**: reset, revert, amend, cherry-pick,
rebase (including the interactive todo file and `--autosquash`), bisect, fsck,
blame with `-M`/`-C`, the pickaxe, and fetch/push between two local
repositories.

Three decisions hold the whole thing together:

- **Every ref update goes through `GT.updateRef`**, which appends a real reflog
  line in git's own format. isomorphic-git maintains no `.git/logs`, so without
  this the recovery half of the course would be a lie. `git reflog` here is a
  parser for files this engine wrote.
- **One replay primitive.** `GTPorc.applyCommit` replays what a commit changed
  onto a different parent, via a three-way merge of (parent tree, target tree,
  commit tree). cherry-pick, revert and every step of rebase are that primitive
  with different arguments — which is exactly the claim the lessons make about
  git itself.
- **Deterministic fixtures.** Fixed author, committer and timestamps, so object
  ids are reproducible across browsers and runs, and prose can quote them.
  Learner commits use the real clock, so lab checks assert *structure* — counts,
  messages, trees, ancestry, reflog contents — and never a literal id.

**What the sandbox deliberately doesn't do**, each disclosed on the page that
would use it: `gc`/packing (nothing is ever packed, so nothing is ever really
collected), the network (a "remote" is a second repository on the same
filesystem, and fetch/push copy objects under git's real fast-forward and lease
rules), `filter-repo`, `git submodule` porcelain, `worktree`, `rerere`,
`bisect run`, and `--lost-found`. Hooks run, but as JavaScript rather than shell.

## 5. Pedagogy mechanics

- **Respect the reader's experience.** Start from the mechanism, not the
  vocabulary. Where a term is introduced it's a glossary term, tappable
  everywhere.
- **The error message is the lesson.** Output copies git's real wording,
  rejections and hints, because "Updates were rejected because…" teaches better
  than a paraphrase.
- **Layered depth.** `<details class="layer">` for the files on disk, the edge
  cases and the flags — skimmable at the top, complete underneath.
- **Labs are graded, not guided.** Goals check the repository. Hints and
  solutions are available and mark the lab as assisted, so "I did this one
  unaided" stays meaningful.
- **Honesty over polish.** A `.box.sim-note` wherever something is narrated
  rather than executed. The CLI's unknown-command path names real git commands
  it doesn't implement and points at the page that covers them.

### Page flow

*The idea → Try it (a real repository) → The details (layered) → Lab → Quiz →
Where this goes next.* Quizzes gate "mark complete" but never block navigation;
missed questions become flashcards automatically.

## 6. Build order (milestones)

1. **The engine** — repo/plumbing/merge3/porcelain/fixtures, and
   `scripts/verify-fixtures.js` proving it against the real git CLI. *Done.*
2. **The command line** — `cli.js`: 40 git commands plus the shell commands you
   need to practise with, git-faithful output, honest refusals. *Done.*
3. **The UI** — terminal, commit-graph SVG, object explorer, checks, lab runner;
   cloned site/progress/quiz/glossary/notation engines and stylesheet. *Done.*
4. **Reference layer** — glossary, syntax reference, landing page,
   `npm run build:git` wired with its validations. *Done.*
5. **Units 1 and 2** — internals, then the headline rewriting unit. *Done.*
6. **Unit 3** — forensics. *Done.*
7. **Units 4–6** — collaboration, drills, expert track. *Done.*
8. **Integration and polish** — concept map, cross-tutor links, README, the
   Pages workflow (including `verify:git` in CI), accessibility and mobile pass.
   *Done.*

## 7. Open decisions (defaults chosen, easy to change)

- **isomorphic-git pinned, not ranged.** Revisit only with a browser test; the
  Buffer regression above is the reason.
- **No network features.** A CORS-proxied clone would be possible and would add
  one genuinely new lesson (the wire protocol) at the cost of a dependency on
  somebody else's server. Not worth it for a static site.
- **Loose objects only.** Implementing packfile writing would make the gc page
  runnable and buy nothing else. The page narrates it instead.
- **Hooks are JavaScript.** The alternative — pretending a shell exists — would
  teach a false reflex. The page is explicit about which parts are real.
- **Fixtures share one small Python codebase**, so the learner recognises the
  files across units and can concentrate on the git.
