# Web Dev Reference — architecture

A working developer's reference for the Angular stack, as the site's third
track. Unlike the ML and bass tutors it is **not a course**: there is no
progress tracking, no quizzes, and no linear expectation. It is meant to be
searched, not read.

Current as of **2026-07-28**: Angular 22.0.8 · RxJS 7.8.2 · Vitest 4.1.10 ·
pnpm 11.17.0 · TypeScript 7.0.2.

---

## 1. The governing idea: one ledger

Every versioned claim on this site exists exactly once, as a record in
`data/changes.json`:

```json
{
  "id": "ng.templates.control-flow",
  "tool": "angular", "topic": "templates", "page": "01-angular/templates.html",
  "title": "Conditionals and loops in a template",
  "now": "@if / @for / @switch",
  "was": "*ngIf / *ngFor / *ngSwitch",
  "since": "17", "deprecated": null, "removed": null,
  "why": "…",
  "migration": "ng generate @angular/core:control-flow",
  "code": { "now": "…", "was": "…" },
  "docs": ["ng.guide.control-flow"]
}
```

A topic page embeds it by id and writes only page-specific prose:

```html
<div class="change" data-change="ng.templates.control-flow">
  <p class="change-note">Optional extra context.</p>
</div>
```

`assets/js/changes.js` renders the head (title, tool tag, version badges), the
now/was sides, a unified-diff toggle, the "why", the migration command and the
doc chips.

**The payoff:** `deprecations.html`, `timeline.html` and `migrations.html` are
generated from these same records. A wrong version number is wrong in one
place, and one edit fixes the page *and* all three cross-cutting views. They
cannot drift apart because there is no second copy.

Prose and code snippets outside change cards are hand-authored HTML, so pages
remain searchable, printable and readable without JavaScript.

## 2. Files

```
web/
├── index.html            landing + live version dashboard
├── versions.html         release history, support windows, upgrade commands
├── timeline.html         what landed per version, newest first    ┐
├── deprecations.html     the full ledger, filterable              ├ generated
├── migrations.html       schematics, and what has none            │ from the
├── docs-index.html       every official link, filterable          ┘ ledger
├── search.html           pages + change records + official docs
├── glossary.html         32 terms
├── assets/
│   ├── css/site.css      @imports the shared design system, then adds
│   │                     reference components (change cards, badges, tool
│   │                     tags, cheat tables, doc chips, copy buttons)
│   ├── page-template.html
│   └── js/
│       ├── site.js       "web:" meta prefix; theme, nav, copy buttons
│       ├── data.js       one cached loader for the three JSON files
│       ├── changes.js    renders now/was cards + the LCS diff view
│       ├── hubs.js       ledger / timeline / migrations / docs-index
│       ├── search.js     one index, three result groups
│       ├── docs.js       resolves data-doc ids to chips
│       ├── version-filter.js  "I'm on Angular 19" → annotates every badge
│       ├── versions.js   the dashboard and release tables
│       └── viz/          signal-graph · change-detection · marbles
├── data/
│   ├── changes.json      the ledger — the single source of versioned truth
│   ├── links.json        every official doc URL, referenced by id
│   ├── versions.json     release dates + support windows (npm registry)
│   ├── glossary.json
│   ├── aliases.json      search-only: how people actually phrase things
│   └── search-index.json generated
├── 01-angular/  (12)  02-rxjs/ (7)  03-vitest/ (6)  04-pnpm/ (5)
```

## 3. Page contract

```html
<meta name="web:section"  content="Angular">
<meta name="web:root"     content="../">
<meta name="web:prev"     content="di.html|Dependency injection">
<meta name="web:next"     content="async-data.html|Async data">
<meta name="web:versions" content="Angular 22.0.8">
```

`web:versions` stamps the page footer with what its claims were checked
against, so staleness is visible rather than silent.

Page flow — deliberately not the tutor flow:

*At a glance → Do it this way now → What it replaced (change cards) → Gotchas
→ Live demo → Legacy panel → Official docs*

All 30 section pages form one unbroken `prev`/`next` chain, Angular → RxJS →
Vitest → pnpm.

## 4. Links: registered, never inline

Doc URLs live only in `data/links.json` and are referenced by id. Pages keep
the real `href` in the markup — so links work without JS and in print — plus a
`data-doc` naming the registry entry.

`scripts/check-links.js` enforces this in three passes:

1. **Referential integrity** (offline) — every `data-doc` id resolves; every
   documentation `href` matches what the registry says; orphaned entries are
   reported. This is the pass CI runs.
2. **Liveness** — HEAD with GET fallback, concurrency 8. Redirects are reported
   with the final URL, because a 301 means the doc moved.
3. **Anchors** — for `#fragment` URLs, confirm the anchor still exists. This is
   the rot that actually happens.

Each entry records how its URL was grounded: `typings` (asserted by an `@see`
in the published package's own type definitions — the strongest offline
signal), `search`, or `unverified`. Run `npm run check:links` locally to settle
the unverified ones; the authoring environment's network policy blocks the
documentation hosts.

## 5. Search

One index, built by `scripts/build-web-index.js` from three sources, rendered
in three groups ordered by best hit:

| Source | Marked | Why it matters |
|---|---|---|
| Page prose + headings | — | |
| `changes.json` records | *change* | Searching a retired API finds its replacement |
| `links.json` | ↗ *official* | Jump straight to angular.dev |

`aliases.json` maps real phrasings onto pages — "view not updating" → change
detection, "NG0203" → DI, "npmrc ignored" → pnpm config. `search.html` is
excluded from its own index; listing example queries in its prose made it
outrank the records those queries are meant to find.

## 6. Demos

Each implements the thing rather than animating a recording, so the numbers on
screen are real:

- **`viz/signal-graph.js`** — a working miniature signal system. The graph is
  asymmetric on purpose: one branch ends in an effect, the other has no reader,
  so laziness is observable. Recompute counters are real counts.
- **`viz/change-detection.js`** — one tree, one event, three strategies.
  Encodes the zoneless migration trap: a `setTimeout` mutating a plain field
  schedules nothing.
- **`viz/marbles.js`** — simulates the four flattening operators over a shared,
  editable source in virtual time.

Plus the cross-cutting **version filter**: set your versions once and every
badge site-wide annotates itself, persisted under `web-ref:versions`.

## 7. Maintenance

```bash
npm run dev:web                  # http://localhost:8010/web/index.html
npm run build:web                # rebuild data/search-index.json
npm run check:links              # all three passes
npm run check:links -- --offline # pass 1 only (what CI runs)
```

**To record a change:** add one record to `data/changes.json`, reference any
new doc URLs by id from `data/links.json`, embed it on the relevant page with
`data-change`, and rebuild the index. The ledger, timeline and migration views
pick it up automatically.

**Accuracy policy:** prefer the published package over prose. Type definitions
carry `@deprecated` tags with versions and `@see` doc paths; `CHANGELOG.md`
gives exact version-in/version-out; `schematics/migrations.json` and
`collection.json` list the real migration names. Three errors in this reference
were caught that way — a migration schematic that does not exist, a pnpm CLI
flag that does not exist, and a mis-stated zoneless timeline.

## 8. Out of scope

NgRx and other state libraries, Nx, Angular Material component reference,
Playwright/Cypress e2e. Room for `05-*` sections; the `web/` naming is
deliberately broader than the current four tools.
