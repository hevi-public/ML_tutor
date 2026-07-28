/* Build script for the git sub-site: crawl git/ HTML pages + glossary + syntax
   reference into a compact client-side search index, and collect every lab into
   a lab index for the drills page.

   It also validates, and throws rather than shipping a broken page: a lab whose
   fixture doesn't exist, a goal naming a check that isn't in checks.js, a
   duplicate lab id or a malformed JSON block would all fail silently in the
   browser (the lab would simply never go green), so they fail loudly here.

   Run after content changes: npm run build:git */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "git");
const DIRS = ["00-start", "01-internals", "02-rewriting", "03-forensics",
              "04-workflow", "05-labs", "06-expert"]
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

/* ---------- what a lab is allowed to refer to ----------
   Both lists are read out of the engine's own source, so they can't drift from
   what actually exists. */

function fixtureNames() {
  const src = fs.readFileSync(
    path.join(ROOT, "assets/js/git/fixtures.js"), "utf8");
  const table = src.slice(src.indexOf("function fixtureTable()"),
    src.indexOf("/* ---------- the sample codebase"));
  return new Set([...table.matchAll(/^\s{4,6}"([a-z0-9-]+)": \{$/gm)].map((m) => m[1]));
}

function checkNames() {
  const src = fs.readFileSync(
    path.join(ROOT, "assets/js/labs/checks.js"), "utf8");
  const start = src.indexOf("/* CHECK-VOCABULARY-START */");
  const end = src.indexOf("/* CHECK-VOCABULARY-END */");
  if (start === -1 || end === -1) {
    throw new Error("checks.js is missing its CHECK-VOCABULARY sentinels");
  }
  return new Set([...src.slice(start, end).matchAll(/define\("([a-zA-Z]+)"/g)]
    .map((m) => m[1]));
}

const FIXTURES = fixtureNames();
const CHECKS = checkNames();
if (!FIXTURES.size) throw new Error("no fixtures found in fixtures.js");
if (!CHECKS.size) throw new Error("no checks found in checks.js");

/* ---------- unescaped placeholders ----------

   These pages are full of things like <upstream> and <rev>:<path>. Written
   literally in prose or a <pre>, a browser eats them as unknown tags and the
   reader sees a sentence with a hole in it — which is invisible in the source and
   obvious on the page. Anything that isn't a tag we actually use gets flagged. */

const HTML_TAGS = new Set(`a abbr b body br button circle code dd details div dfn dl
dt em form g h1 h2 h3 h4 h5 head hr html i input kbd label li link main meta nav ol
p path pre rect script section span strong style sub summary sup svg table tbody td
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

// --- pages (and their lab + quiz blocks) ---
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))
  .concat(...DIRS.map((d) => fs.readdirSync(path.join(ROOT, d))
    .filter((f) => f.endsWith(".html")).map((f) => d + "/" + f)));

/* A page's trailing <script> registers its custom lab checks. A syntax error in
   there is silent apart from one console message, and the symptom is a lab that
   can never pass — so parse it here instead of finding out in the browser. */
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
    .replace(/\s*—\s*Git Tutor\s*$/, "");
  const unit = (html.match(/name="git:unit" content="([^"]+)"/) || [, ""])[1]
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

  // labs: indexed for search and the drills page, and validated hard
  const block = jsonBlock(html, "lab", rel);
  if (block) {
    for (const lab of block.labs || []) {
      if (!lab.id) throw new Error(`lab without an id in ${rel}`);
      if (seenLabIds.has(lab.id)) {
        throw new Error(`duplicate lab id "${lab.id}" (in ${rel})`);
      }
      seenLabIds.add(lab.id);
      if (!lab.fixture || !FIXTURES.has(lab.fixture)) {
        throw new Error(
          `lab "${lab.id}" in ${rel} wants fixture "${lab.fixture}", which ` +
          `fixtures.js doesn't define (have: ${[...FIXTURES].join(", ")})`);
      }
      // A free-play lab is a sandbox rather than an exercise, so it has no goals.
      if (!lab.free && (!lab.goals || !lab.goals.length)) {
        throw new Error(`lab "${lab.id}" in ${rel} has no goals, so it can never pass`);
      }
      for (const goal of lab.goals || []) {
        const name = Object.keys(goal.check || {})[0];
        if (!name) throw new Error(`goal without a check in lab "${lab.id}" (${rel})`);
        if (!CHECKS.has(name)) {
          throw new Error(
            `lab "${lab.id}" in ${rel} uses check "${name}", which checks.js ` +
            `doesn't define (have: ${[...CHECKS].join(", ")})`);
        }
        if (!goal.text) throw new Error(`goal without text in lab "${lab.id}" (${rel})`);
      }
      labs.push({
        id: lab.id, title: lab.title, task: lab.task || "",
        fixture: lab.fixture, page: rel, pageTitle: title, unit,
        goals: (lab.goals || []).length,
      });
      entries.push({
        t: `Lab: ${lab.title}`, u: `${rel}#lab-${lab.id}`,
        unit: "Labs", h: [], b: lab.task || "",
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

// --- git syntax (aliases make "the squiggle" and "two dots" findable) ---
const notation = JSON.parse(fs.readFileSync(path.join(ROOT, "data/notation.json"), "utf8"));
for (const group of Object.values(notation)) {
  for (const e of group.entries) {
    entries.push({
      t: `${e.sym} — ${e.name}`, u: "notation.html", unit: "Syntax",
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
