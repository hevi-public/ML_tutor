/* Build script for the Web Dev Reference (web/): crawl the HTML pages, the change
   ledger and the official-docs registry into one client-side search index.

   Search on this track returns three kinds of result, all from this one index:
     k:"page"   the reference pages themselves
     k:"change" a now/was record from data/changes.json, deep-linked to its card
     k:"doc"    an official documentation link from data/links.json

   Run after content changes: npm run build:web */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "web");
const DIRS = ["01-angular", "02-rxjs", "03-vitest", "04-pnpm",
  "05-kotlin", "06-spring", "07-gradle", "08-data"]
  .filter((d) => fs.existsSync(path.join(ROOT, d)));

function textify(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

const entries = [];

/* ---------- pages ---------- */

// search.html is the search UI, not content. Indexing it means every page that
// lists example queries ("toPromise", "*ngIf") outranks the records those
// queries are meant to find.
const NOT_CONTENT = new Set(["search.html"]);

const pages = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith(".html") && !NOT_CONTENT.has(f))
  .concat(...DIRS.map((d) => fs.readdirSync(path.join(ROOT, d))
    .filter((f) => f.endsWith(".html")).map((f) => d + "/" + f)));

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const title = (html.match(/<title>(.*?)<\/title>/) || [, rel])[1]
    .replace(/\s*—\s*Web Dev Reference\s*$/, "");
  const section = (html.match(/name="web:section" content="([^"]+)"/) || [, ""])[1]
    .replace(/&amp;/g, "&");
  const headings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)]
    .map((m) => textify(m[1]));
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/);
  const body = textify(mainMatch ? mainMatch[0] : html).slice(0, 2000);
  entries.push({ k: "page", t: title, u: rel, unit: section || "Reference", h: headings, b: body });
}

/* ---------- change records ----------
   Indexed on their own so that searching for the *old* API ("destroy$",
   "retryWhen", "toPromise") lands on the card that tells you what replaced it,
   even though the badge text is rendered at runtime. */

const ledger = readJson("data/changes.json");
const seenChangeIds = new Set();

for (const c of ledger.changes) {
  if (!c.id) throw new Error("change record without an id");
  if (seenChangeIds.has(c.id)) throw new Error(`duplicate change id "${c.id}"`);
  seenChangeIds.add(c.id);
  if (!c.page) throw new Error(`change "${c.id}" has no page`);

  // Both sides of the change are searchable terms, plus the code samples —
  // that is what makes searching an old symbol find its replacement.
  const terms = [c.now, c.was, c.code?.now, c.code?.was]
    .filter(Boolean).join(" ");

  entries.push({
    k: "change",
    t: c.title,
    u: `${c.page}#change-${c.id}`,
    unit: ledger._toolNames?.[c.tool] || c.tool,
    tool: c.tool,
    since: c.since || null,
    deprecated: c.deprecated || null,
    removed: c.removed || null,
    h: [c.now, c.was].filter(Boolean),
    b: `${terms} ${c.why || ""}`.slice(0, 1200),
  });
}

/* ---------- official docs ---------- */

const registry = readJson("data/links.json");

for (const [id, link] of Object.entries(registry.links)) {
  entries.push({
    k: "doc",
    t: link.title,
    u: link.url,
    unit: "Official docs",
    tool: link.tool,
    kind: link.kind,
    verified: link.verified || "unverified",
    h: link.tags || [],
    b: `${link.title} ${(link.tags || []).join(" ")}`,
  });
}

/* ---------- glossary (optional until milestone 2) ---------- */

const glossaryPath = path.join(ROOT, "data/glossary.json");
if (fs.existsSync(glossaryPath)) {
  const glossary = readJson("data/glossary.json");
  for (const [slug, e] of Object.entries(glossary)) {
    if (slug.startsWith("_")) continue;
    entries.push({
      k: "page", t: e.term, u: `glossary.html#${slug}`, unit: "Glossary",
      h: e.see || [], b: `${e.plain || ""} ${e.definition || ""}`,
    });
  }
}

/* ---------- aliases ----------
   How people actually phrase things, mapped onto the page that answers it.
   These are search-only entries: they never render as pages. */

const aliasPath = path.join(ROOT, "data/aliases.json");
if (fs.existsSync(aliasPath)) {
  const aliases = readJson("data/aliases.json");
  for (const a of aliases.aliases || []) {
    entries.push({
      k: "page", t: a.title, u: a.u, unit: a.unit || "Reference",
      h: a.phrases || [], b: (a.phrases || []).join(" "),
    });
  }
}

const out = path.join(ROOT, "data", "search-index.json");
fs.writeFileSync(out, JSON.stringify(entries));

const counts = entries.reduce((acc, e) => ((acc[e.k] = (acc[e.k] || 0) + 1), acc), {});
console.log(
  `wrote ${out}: ${entries.length} entries ` +
  `(${counts.page || 0} page, ${counts.change || 0} change, ${counts.doc || 0} doc), ` +
  `${(fs.statSync(out).size / 1024).toFixed(0)} KB`
);
