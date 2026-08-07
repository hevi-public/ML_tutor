# Web Dev Reference — backend section plan (handoff document)

**For the next session.** This plan extends the existing `web/` track with the
backend stack: **Kotlin · Spring Boot · Gradle · PostgreSQL · jOOQ · Jackson**.
It is written to be executed without this session's context — everything you
need is either in this file or in `web/PLAN.md`, which documents the
architecture you are building on. **Read `web/PLAN.md` first.**

Decisions already made with the user: full parity with the frontend sections
(change-ledger records, now/was cards, version badges, official-docs registry,
search aliases), not a lighter pass.

---

## 1. Ground truth, checked 2026-08-06

Verified directly against Maven Central (`repo1.maven.org` — reachable from the
build container) and `services.gradle.org` (also reachable); PostgreSQL server
via web search. Re-verify with the commands in §7 before writing content.

| Tool (ledger id) | Current | The arc worth documenting |
|---|---|---|
| Kotlin (`kotlin`) | **2.4.10** (2.4.20-Beta2 in flight) | 1.9 → 2.0 (K2 compiler, May 2024) → 2.1/2.2 (guard conditions, non-local break/continue, context parameters) → 2.4. kapt → KSP2 (KSP `2.3.11`). |
| Spring Boot (`spring`) | **4.1.0** (4.0.x maintained at 4.0.7) | Boot 3 → 4 / Framework `7.0.8` (Nov 2025): JSpecify null-safety, API versioning, HTTP service clients, modularization. Spring Security `7.1.0`. The 2→3 `javax`→`jakarta` break is the legacy panel. |
| Gradle (`gradle`) | **9.7.0** | 8 → 9 (Aug 2025): Kotlin DSL default, configuration cache on by default, version catalogs as the norm, convention plugins replacing `allprojects`/`buildSrc` idioms. |
| PostgreSQL (`postgres`) | **18** (Sep 2025); 19 at beta 2, GA expected Sep/Oct 2026 | 15 (MERGE) → 16 → 17 (JSON_TABLE, incremental backup) → 18 (async I/O, `uuidv7()`, virtual generated columns). JDBC driver `42.7.13`. |
| jOOQ (`jooq`) | **3.21.7** | The MULTISET/row-DTO mapping arc, implicit joins, Kotlin/coroutines support, codegen strategies (Testcontainers vs DDLDatabase). |
| Jackson (`jackson`) | **3.2.1** GA under `tools.jackson`; 2.x line at 2.22.1 | The 2 → 3 break: `com.fasterxml.jackson.*` → `tools.jackson.*` package rename, `JsonMapper` builder default, immutability. **Verify whether Boot 4 manages Jackson 3 via the `spring-boot-dependencies` BOM before writing this page — it determines the whole framing.** |

These six become new tool ids in the data model. Version-filter should expose
`kotlin`, `spring`, `gradle`, `postgres` (jooq/jackson badges still render;
they just aren't in the "I'm on" bar — same as rxjs vs typescript today).

## 2. What already exists — do not rebuild it

The whole rendering/search/validation stack is built and generic:

- **Ledger** (`web/data/changes.json`) → now/was cards, deprecations, timeline,
  migrations — all generated. You add *records*, not views.
- **Link registry** (`web/data/links.json`) + `scripts/check-links.js` (three
  passes; CI runs `--offline`). You add *entries*, referenced by `data-doc`.
- **Search** (`scripts/build-web-index.js`) — pages + records + docs + aliases.
- **Version filter, copy buttons, diff view, print styles, dark mode** — free.
- Page contract + flow: see `web/assets/page-template.html` and `web/PLAN.md` §3.

## 3. Integration touchpoints (exact, exhaustive)

Adding a tool id touches exactly these places — this list is the part of this
plan that saves you an afternoon:

1. `web/data/versions.json` — a `tools.<id>` entry each (release lines with
   dates + headlines; support windows for postgres and spring which have real
   EOL policies).
2. `web/data/links.json` — `sites` entries for the new hosts
   (`kotlinlang.org`, `docs.spring.io` + `spring.io`, `docs.gradle.org`,
   `postgresql.org`, `jooq.org`, `github.com/FasterXML` / Jackson docs) and the
   link entries. New hosts are picked up by `check-links.js` automatically
   (DOC_HOSTS derives from `sites`).
3. `web/assets/js/data.js` — `TOOL_LABEL` map (add six).
4. `web/assets/js/version-filter.js` — `TOOLS` array (add
   `kotlin, spring, gradle, postgres`).
5. `web/assets/css/site.css` — `.tool-tag.<id>` colors in **three** places
   (light, `@media prefers-color-scheme: dark`, and the
   `html[data-theme="dark"]` overrides) plus `.timeline-entry.<id>`
   border-colors. Follow the existing pattern exactly; pick distinct hues
   (suggest: kotlin violet, spring green, gradle teal, postgres blue, jooq
   orange, jackson slate).
6. `scripts/build-web-index.js` — the hardcoded `DIRS` array (add the new
   section folders).
7. `web/index.html` — landing cards for the new sections.
8. Nav chain: `web/04-pnpm/angular-and-pnpm.html` currently has no `web:next`;
   point it at `05-kotlin/overview.html` and keep one unbroken chain through
   all new pages (walk it programmatically when done — see §7).
9. `web/data/aliases.json` — problem-phrased search aliases per section.
10. `web/data/glossary.json` — new terms (K2, structured concurrency, virtual
    threads, configuration cache, version catalog, MVCC, MULTISET, BOM…).
11. `web/PLAN.md` and root `README.md` — extend, and update the "Out of scope /
    `05-*` is free" note.

## 4. Page inventory (21 pages, four sections)

**05-kotlin (4):**
`overview` (the 1.9→2.4 arc; K2 in one page) ·
`language` (features by version, each a ledger record with a badge) ·
`coroutines` (structured concurrency, Flow — plus the decision page's twin:
**coroutines or virtual threads?** Boot's `spring.threads.virtual.enabled`,
Java 21 LTS baseline — mirror the signals-vs-rxjs page's shape) ·
`kotlin-on-the-jvm` (kapt→KSP migration, Java interop, JSpecify null-safety)

**06-spring (8):**
`overview` (Boot 3→4 / Framework 7 arc; the jakarta break as legacy panel) ·
`config-and-starters` (configuration properties, profiles, `@ConfigurationProperties` + records/data classes) ·
`web` (controllers; RestClient vs WebClient vs declarative HTTP interfaces —
a now/was with three generations) ·
`data-and-transactions` (`@Transactional` semantics + gotchas, JDBC/jOOQ wiring — not JPA-centric) ·
`security` (Security 6→7: lambda DSL, `authorizeHttpRequests`, the
`WebSecurityConfigurerAdapter` removal as a *removed* ledger record) ·
`serialization` (Jackson 2→3 lives here; kotlin-module; records/data classes) ·
`observability` (Actuator, Micrometer, structured logging in Boot 3.4+) ·
`testing` (slices, Testcontainers `@ServiceConnection`, MockK vs Mockito,
`RestTestClient`/`MockMvc` — verify current names against Boot 4 typings)

**07-gradle (4):**
`overview` (8→9 arc) ·
`kotlin-dsl-and-catalogs` (`libs.versions.toml` as the now; `ext`/buildSrc
constants as the was) ·
`structure` (convention plugins vs `allprojects`/`subprojects`; `build-logic`) ·
`performance` (configuration cache — the big 9.x behaviour change — build
cache, toolchains)

**08-data (5):**
`postgres-overview` (15→18 arc, 19 beta; support windows — Postgres has real
five-year EOL dates, use the same computed status pills as Angular) ·
`postgres-features` (uuidv7, MERGE, JSON_TABLE, generated columns — each a
ledger record with `since`) ·
`schema-and-migrations` (Flyway/Liquibase current practice, jOOQ codegen
against migrated schema) ·
`jooq` (the model; codegen strategies; jOOQ vs JPA one honest table) ·
`jooq-queries` (MULTISET nested mapping — the headline feature — Kotlin data
class projection, implicit joins, coroutines/R2DBC caveats)

Suggested live demos (optional, pick at most two, same "implement it, don't
animate it" bar as the existing three):
- **Transaction-isolation visualizer** (08-data): two concurrent sessions,
  pick an isolation level, watch which anomaly appears. Genuinely hard to
  learn from prose; a small state machine implements it honestly.
- **Structured-concurrency visualizer** (05-kotlin): a scope tree where
  cancelling a parent cancels children, a failing child fails the scope —
  same SVG style as the signal graph.

## 5. Milestones (one commit each, verified before each commit)

1. **Data model + touchpoints** — everything in §3, with `versions.json`
   populated and 2–3 seed ledger records per tool; landing cards say "soon".
2. **05-kotlin** (4 pages + records).
3. **06-spring part I** — overview, config, web, serialization (Jackson 2→3).
4. **06-spring part II** — data/tx, security, observability, testing.
5. **07-gradle** (4 pages).
6. **08-data** (5 pages + isolation demo if doing it).
7. **Polish** — aliases, glossary, nav-chain walk, full browser sweep,
   `web/PLAN.md` + README updates.

## 6. Accuracy policy (what "verify" means here)

Same principle as the frontend sections — **the published artifact beats
prose** — with JVM sources:

- **Maven Central is reachable** from the container (verified 2026-08-06):
  `https://repo1.maven.org/maven2/<group-path>/<artifact>/maven-metadata.xml`
  for current versions;  `-sources.jar` for `@Deprecated(since=…)` and KDoc;
  the **`spring-boot-dependencies` POM** to see exactly which Jackson/jOOQ
  versions Boot manages — settle the Jackson-3-in-Boot-4 question there.
- **`services.gradle.org/versions/current`** for Gradle (reachable).
- Doc hosts (kotlinlang.org, docs.spring.io, postgresql.org, jooq.org,
  docs.gradle.org) are **blocked** by the network policy, same as the frontend
  hosts were: ground URLs in web-search results or KDoc `@see` paths, mark
  anything ungroundable `"verified": "unverified"`, and rely on
  `npm run check:links` run locally by the user. Never invent a URL.
- Release *dates* for the version tables: web search against official blogs;
  Maven Central metadata has no per-version dates.
- Stamp every page's `web:versions` meta with what it was checked against.

## 7. Verification (definition of done, per milestone)

```bash
npm run dev:web                    # serve
npm run build:web                  # index build must pass
npm run check:links -- --offline   # referential integrity must be clean
```

Plus the browser sweep the frontend sections used (Playwright + the
pre-installed Chromium at /opt/pw-browsers/chromium): every page renders with
no console errors, every `data-change` resolves (an unresolved id renders a
loud red box — count them), no empty doc chips, no horizontal overflow at
1000px and 390px, dark mode holds, and the prev/next chain from
`01-angular/overview.html` reaches every section page exactly once. The
existing verification scripts from this branch's history are a good template.

## 8. Out of scope (unchanged unless the user says otherwise)

JPA/Hibernate as a first-class section (jOOQ is the chosen data layer; JPA
appears only in the jOOQ-vs-JPA comparison), Kubernetes/Docker beyond the
Gradle image-building note, Kafka/messaging, GraphQL. The naming leaves
`09-*` free.
