/* Build script: crawl all HTML pages + glossary + notation into a compact
   client-side search index. Run after content changes: npm run build:index */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIRS = ["00-start", "01-math", "02-core", "03-classical", "04-neural",
              "05-deep", "06-modern", "07-labs", "08-expert"];

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

// --- pages ---
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))
  .concat(...DIRS.map((d) => fs.readdirSync(path.join(ROOT, d))
    .filter((f) => f.endsWith(".html")).map((f) => d + "/" + f)));

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const title = (html.match(/<title>(.*?)<\/title>/) || [, rel])[1]
    .replace(/\s*—\s*ML Tutor\s*$/, "");
  const unit = (html.match(/name="ml:unit" content="([^"]+)"/) || [, ""])[1]
    .replace(/&amp;/g, "&");
  const headings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)]
    .map((m) => textify(m[1]));
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/);
  const body = textify(mainMatch ? mainMatch[0] : html).slice(0, 2000);
  entries.push({ t: title, u: rel, unit, h: headings, b: body });
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

// --- notation symbols (aliases make "curly d" findable) ---
const notation = JSON.parse(fs.readFileSync(path.join(ROOT, "data/notation.json"), "utf8"));
for (const group of Object.values(notation)) {
  for (const e of group.entries) {
    entries.push({
      t: `${e.sym} — ${e.name}`, u: "notation.html", unit: "Notation",
      h: e.aliases || [],
      b: `say ${e.say}. ${e.means}`,
    });
  }
}

const out = path.join(ROOT, "data", "search-index.json");
fs.writeFileSync(out, JSON.stringify(entries));
console.log(`wrote ${out}: ${entries.length} entries, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
