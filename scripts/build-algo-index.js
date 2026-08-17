/* Build script for the algo sub-site: crawl algo/ HTML pages + glossary +
   notation reference into a compact client-side search index, and collect
   every lab into a lab index (empty until the lab engine lands, milestone 7).

   It also validates, and throws rather than shipping a broken page: a
   duplicate quiz/page id, an out-of-range quiz answer, a malformed JSON block
   or an unescaped <placeholder> in prose would all fail silently in the
   browser, so they fail loudly here.

   When the lab engine (assets/js/labs/) lands, this script grows the same
   fixture/check-vocabulary validation as build-git-index.js — the sentinels
   are already marked below.

   Run after content changes: npm run build:algo */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "algo");
const DIRS = ["00-start", "01-foundations", "02-structures", "03-sorting",
              "04-graphs", "05-graphs-advanced", "06-strategies", "07-strings",
              "08-visualisation", "09-systems", "10-labs", "11-expert"]
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

/* ---------- unescaped placeholders ----------

   Prose here is full of things like <details> the-tag and <T> the-placeholder.
   Written literally, a browser eats an unknown tag and the reader sees a
   sentence with a hole in it — invisible in the source, obvious on the page.
   Anything that isn't a tag we actually use gets flagged. */

const HTML_TAGS = new Set(`a abbr b body br button canvas circle code dd details div dfn dl
dt em form g h1 h2 h3 h4 h5 head hr html i input kbd label li line link main meta nav ol
p path polyline pre rect script section span strong style sub summary sup svg table tbody td
text textarea th thead title tr tspan ul`.split(/\s+/).filter(Boolean));

function checkPlaceholders(html, rel) {
  const prose = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const found = [];
  for (const match of prose.matchAll(/<\/?([A-Za-z][\w-]*)/g)) {
    const tag = match[1].toLowerCase();
    if (HTML_TAGS.has(tag)) continue;
    const line = prose.slice(0, match.index).split("\n").length;
    found.push(`${rel}:${line}: <${match[1]}… should be &lt;${match[1]}&gt;`);
  }
  if (found.length) {
    throw new Error("unescaped placeholder(s) — a browser will treat these as " +
      "tags and drop them:\n  " + found.join("\n  "));
  }
}

const entries = [];
const labs = [];
const seenLabIds = new Set();
const seenQuizIds = new Set();

function jsonBlock(html, className, rel) {
  const match = html.match(
    new RegExp(`<script type="application/json" class="${className}">([\\s\\S]*?)</script>`));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    throw new Error(`bad ${className} JSON in ${rel}: ${err.message}`);
  }
}

// --- pages (and their quiz + lab blocks) ---
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))
  .concat(...DIRS.map((d) => fs.readdirSync(path.join(ROOT, d))
    .filter((f) => f.endsWith(".html")).map((f) => d + "/" + f)));

/* A page's trailing <script> wires its demos. A syntax error in there is
   silent apart from one console message, and the symptom is a demo that never
   appears — so parse it here instead of finding out in the browser. */
function checkPageScript(html, rel) {
  const match = html.match(/<script>\n([\s\S]*?)<\/script>\s*<\/main>/);
  if (!match) return;
  try {
    // eslint-disable-next-line no-new-func
    new Function(match[1]);
  } catch (err) {
    throw new Error(`the page script in ${rel} doesn't parse: ${err.message}`);
  }
}

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  checkPlaceholders(html, rel);
  checkPageScript(html, rel);
  const title = (html.match(/<title>(.*?)<\/title>/) || [, rel])[1]
    .replace(/\s*—\s*Algorithms Tutor\s*$/, "");
  const unit = (html.match(/name="algo:unit" content="([^"]+)"/) || [, ""])[1]
    .replace(/&amp;/g, "&");
  const headings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)]
    .map((m) => textify(m[1]));
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/);
  const body = textify(mainMatch ? mainMatch[0] : html).slice(0, 2000);
  entries.push({ t: title, u: rel, unit, h: headings, b: body });

  // quiz ids double as page ids for progress, so they must be unique
  const quiz = jsonBlock(html, "quiz", rel);
  if (quiz) {
    if (!quiz.id) throw new Error(`quiz without an id in ${rel}`);
    if (seenQuizIds.has(quiz.id)) {
      throw new Error(`duplicate quiz/page id "${quiz.id}" (in ${rel})`);
    }
    seenQuizIds.add(quiz.id);
    for (const q of quiz.questions || []) {
      if (!Array.isArray(q.choices) || q.choices.length < 2) {
        throw new Error(`quiz question without choices in ${rel}`);
      }
      if (typeof q.answer !== "number" || !q.choices[q.answer]) {
        throw new Error(`quiz question with an out-of-range answer in ${rel}`);
      }
    }
  }

  /* LAB-VALIDATION-START — grows fixture/check validation with the lab engine */
  const block = jsonBlock(html, "lab", rel);
  if (block) {
    for (const lab of block.labs || []) {
      if (!lab.id) throw new Error(`lab without an id in ${rel}`);
      if (seenLabIds.has(lab.id)) {
        throw new Error(`duplicate lab id "${lab.id}" (in ${rel})`);
      }
      seenLabIds.add(lab.id);
      labs.push({
        id: lab.id, title: lab.title, task: lab.task || "",
        page: rel, pageTitle: title, unit,
        goals: (lab.goals || []).length,
      });
      entries.push({
        t: `Lab: ${lab.title}`, u: `${rel}#lab-${lab.id}`,
        unit: "Labs", h: [], b: lab.task || "",
      });
    }
  }
  /* LAB-VALIDATION-END */
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

// --- notation (aliases make "the horseshoe" and "the E-looking symbol" findable) ---
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

const outSearch = path.join(ROOT, "data", "search-index.json");
fs.writeFileSync(outSearch, JSON.stringify(entries));
console.log(`wrote ${outSearch}: ${entries.length} entries, ${(fs.statSync(outSearch).size / 1024).toFixed(0)} KB`);

const outLabs = path.join(ROOT, "data", "lab-index.json");
fs.writeFileSync(outLabs, JSON.stringify(labs));
console.log(`wrote ${outLabs}: ${labs.length} labs across ${pages.length} pages`);
