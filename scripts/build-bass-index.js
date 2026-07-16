/* Build script for the bass sub-site: crawl bass/ HTML pages + glossary +
   notation into a compact client-side search index, and collect every practice
   exercise into an exercise index for the routine-builder lab.
   Run after content changes: npm run build:bass */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "bass");
const DIRS = ["00-start", "01-reading", "02-fretboard", "03-theory",
              "04-technique", "05-basslines", "06-styles", "07-labs",
              "08-expert"]
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

const entries = [];
const exercises = [];
const seenExerciseIds = new Set();

// --- pages (and their practice blocks) ---
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))
  .concat(...DIRS.map((d) => fs.readdirSync(path.join(ROOT, d))
    .filter((f) => f.endsWith(".html")).map((f) => d + "/" + f)));

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const title = (html.match(/<title>(.*?)<\/title>/) || [, rel])[1]
    .replace(/\s*—\s*Bass Tutor\s*$/, "");
  const unit = (html.match(/name="bass:unit" content="([^"]+)"/) || [, ""])[1]
    .replace(/&amp;/g, "&");
  const headings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)]
    .map((m) => textify(m[1]));
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/);
  const body = textify(mainMatch ? mainMatch[0] : html).slice(0, 2000);
  entries.push({ t: title, u: rel, unit, h: headings, b: body });

  // practice exercises: indexed for search and for the routine builder
  const practiceMatch = html.match(
    /<script type="application\/json" class="practice">([\s\S]*?)<\/script>/);
  if (practiceMatch) {
    let block;
    try {
      block = JSON.parse(practiceMatch[1]);
    } catch (err) {
      throw new Error(`bad practice JSON in ${rel}: ${err.message}`);
    }
    for (const ex of block.exercises || []) {
      if (!ex.id) throw new Error(`practice exercise without id in ${rel}`);
      if (seenExerciseIds.has(ex.id)) {
        throw new Error(`duplicate exercise id "${ex.id}" (in ${rel})`);
      }
      seenExerciseIds.add(ex.id);
      exercises.push({
        id: ex.id, title: ex.title, goal: ex.goal || "",
        tempo: ex.tempo || null, page: rel, pageTitle: title, unit,
      });
      entries.push({
        t: `Practice: ${ex.title}`, u: `${rel}#practice-${ex.id}`,
        unit: "Practice", h: [], b: ex.goal || "",
      });
    }
  }
}

// --- glossary terms (searchable individually, deep-linked) ---
const glossary = JSON.parse(fs.readFileSync(path.join(ROOT, "data/glossary.json"), "utf8"));
for (const [slug, e] of Object.entries(glossary)) {
  entries.push({
    t: e.term, u: `glossary.html#${slug}`, unit: "Glossary",
    h: e.also || [],
    b: `${e.plain} ${e.definition}`,
  });
}

// --- music symbols (aliases make "the fancy F" findable) ---
const notation = JSON.parse(fs.readFileSync(path.join(ROOT, "data/notation.json"), "utf8"));
for (const group of Object.values(notation)) {
  for (const e of group.entries) {
    entries.push({
      t: `${e.sym} — ${e.name}`, u: "notation.html", unit: "Symbols",
      h: e.aliases || [],
      b: `say ${e.say}. ${e.means}`,
    });
  }
}

const outSearch = path.join(ROOT, "data", "search-index.json");
fs.writeFileSync(outSearch, JSON.stringify(entries));
console.log(`wrote ${outSearch}: ${entries.length} entries, ${(fs.statSync(outSearch).size / 1024).toFixed(0)} KB`);

const outEx = path.join(ROOT, "data", "exercise-index.json");
fs.writeFileSync(outEx, JSON.stringify(exercises));
console.log(`wrote ${outEx}: ${exercises.length} exercises`);
