/* Link checker for the Web Dev Reference (web/).

   The promise of this track is "every official doc is one click away", which is
   only true for as long as the links resolve. Three passes, cheapest first:

     1. Referential integrity  — offline. Every data-doc="..." in a page and every
        id in a changes.json docs[] array must exist in data/links.json; no page
        may hard-code a URL to a documentation host; no registry entry may be
        orphaned. This is the pass that enforces "links.json is the only place a
        URL lives".
     2. Liveness               — network. HEAD (falling back to GET) every URL.
        Redirects are followed but reported with the final URL, because a 301 is
        the actionable signal: the doc moved, update the one line in links.json.
     3. Anchors                — network. For URLs with a #fragment, confirm the
        anchor still exists. This is the failure that actually happens: the page
        survives a docs rewrite but the section id is renamed, so the link still
        returns 200 while dropping you at the top of a very long guide.

   Usage:
     npm run check:links              all three passes
     npm run check:links -- --offline pass 1 only (no network)

   Exits non-zero if any hard failure is found. Deliberately NOT part of the
   Pages deploy: a documentation site having a bad afternoon must not stop this
   site from shipping. */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "web");
const OFFLINE = process.argv.includes("--offline");
const CONCURRENCY = 8;
const TIMEOUT_MS = 15000;

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "data/links.json"), "utf8"));
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "data/changes.json"), "utf8"));

const DOC_HOSTS = Object.values(registry.sites).map((s) =>
  s.base.replace(/^https?:\/\//, ""));

const problems = [];   // hard failures — non-zero exit
const warnings = [];   // worth knowing, not fatal

function fail(msg) { problems.push(msg); }
function warn(msg) { warnings.push(msg); }

/* ---------- collect every html file under web/ ---------- */

function htmlFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === "data" || name === "assets") continue;
      out.push(...htmlFiles(full));
    } else if (name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

/* ---------- pass 1: referential integrity ---------- */

const referenced = new Set();

function pass1() {
  const files = htmlFiles(ROOT);

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const html = fs.readFileSync(file, "utf8");

    // Every <a> is checked from both directions:
    //   · a data-doc id must exist in the registry;
    //   · a link to a documentation host must carry a data-doc, and its href
    //     must match what the registry says.
    // Keeping the real href in the markup means links work with JS disabled and
    // in print; the data-doc is what lets this script prove they are current.
    for (const m of html.matchAll(/<a\b[^>]*>/g)) {
      const tag = m[0];
      const href = (tag.match(/href="([^"]*)"/) || [])[1];
      const docAttr = (tag.match(/data-doc="([^"]*)"/) || [])[1];

      if (docAttr) {
        const ids = docAttr.split(/[\s,]+/).filter(Boolean);
        for (const id of ids) {
          referenced.add(id);
          if (!registry.links[id]) {
            fail(`${rel}: data-doc="${id}" is not in links.json`);
          }
        }
        // A chip names exactly one doc, so href and registry must agree.
        if (href && ids.length === 1 && registry.links[ids[0]]) {
          const expected = registry.links[ids[0]].url;
          if (href !== expected) {
            fail(`${rel}: data-doc="${ids[0]}" points at ${expected} but the href is ${href}`);
          }
        }
        continue;
      }

      if (!href) continue;
      const host = href.replace(/^https?:\/\//, "").split("/")[0];
      if (DOC_HOSTS.includes(host)) {
        fail(`${rel}: documentation URL ${href} has no data-doc — register it in links.json so it can be checked`);
      }
    }
  }

  for (const c of ledger.changes) {
    for (const id of c.docs || []) {
      referenced.add(id);
      if (!registry.links[id]) {
        fail(`changes.json: "${c.id}" references docs id "${id}", which is not in links.json`);
      }
    }
  }

  // versions.json names a docs id per tool — also a real reference, so it counts
  // both for validity and for deciding whether an entry is orphaned.
  const versionsPath = path.join(ROOT, "data/versions.json");
  if (fs.existsSync(versionsPath)) {
    const versions = JSON.parse(fs.readFileSync(versionsPath, "utf8"));
    for (const [tool, meta] of Object.entries(versions.tools || {})) {
      if (!meta.docs) continue;
      referenced.add(meta.docs);
      if (!registry.links[meta.docs]) {
        fail(`versions.json: tool "${tool}" references docs id "${meta.docs}", which is not in links.json`);
      }
    }
  }

  for (const id of Object.keys(registry.links)) {
    if (!referenced.has(id)) {
      warn(`links.json: "${id}" is not referenced by any page or change record`);
    }
  }

  const unverified = Object.entries(registry.links)
    .filter(([, l]) => (l.verified || "unverified") === "unverified");
  if (unverified.length) {
    warn(`${unverified.length} link(s) marked "unverified" — pass 2 will settle them: ` +
      unverified.map(([id]) => id).join(", "));
  }
}

/* ---------- passes 2 & 3: liveness and anchors ---------- */

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

async function checkOne(id, link) {
  const url = link.url;
  const hash = new URL(url).hash.replace(/^#/, "");
  const result = { id, url, status: null, finalUrl: null, note: "" };

  let res;
  try {
    res = await fetchWithTimeout(url, { method: "HEAD" });
    // Plenty of docs sites (angular.dev among them) are unfriendly to HEAD.
    if (res.status === 403 || res.status === 405 || res.status === 501) {
      res = await fetchWithTimeout(url, { method: "GET" });
    }
  } catch (err) {
    result.status = "error";
    result.note = err.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : err.message;
    return result;
  }

  result.status = res.status;
  result.finalUrl = res.url;

  if (!res.ok) return result;

  // Pass 3 — only worth a body read when the link claims a section.
  if (hash) {
    try {
      const body = await (await fetchWithTimeout(url, { method: "GET" })).text();
      const found =
        body.includes(`id="${hash}"`) ||
        body.includes(`id='${hash}'`) ||
        body.includes(`name="${hash}"`);
      if (!found) result.note = `anchor #${hash} not found on the page`;
    } catch (err) {
      result.note = `could not verify anchor #${hash}: ${err.message}`;
    }
  }

  return result;
}

async function pass23() {
  const links = Object.entries(registry.links);
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < links.length) {
      const [id, link] = links[cursor++];
      results.push(await checkOne(id, link));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, links.length) }, worker)
  );

  const ok = [], redirected = [], broken = [], errored = [], anchors = [];

  for (const r of results) {
    if (r.status === "error") { errored.push(r); continue; }
    if (r.status >= 400) { broken.push(r); continue; }
    // Compare ignoring a trailing slash — that difference is not a real move.
    const norm = (u) => u.replace(/\/$/, "");
    if (r.finalUrl && norm(r.finalUrl) !== norm(r.url)) redirected.push(r);
    else if (r.note) anchors.push(r);
    else ok.push(r);
    if (r.note && !anchors.includes(r)) anchors.push(r);
  }

  console.log(`\n  ok           ${ok.length}`);
  for (const r of redirected) {
    warn(`redirected: ${r.id}\n      ${r.url}\n   →  ${r.finalUrl}   (update links.json)`);
  }
  for (const r of anchors) {
    warn(`${r.id}: ${r.note}`);
  }
  for (const r of broken) {
    fail(`${r.id}: HTTP ${r.status} — ${r.url}`);
  }
  for (const r of errored) {
    fail(`${r.id}: ${r.note} — ${r.url}`);
  }
}

/* ---------- run ---------- */

(async () => {
  console.log(`Checking ${Object.keys(registry.links).length} links in web/data/links.json`);

  console.log("\npass 1 — referential integrity");
  pass1();

  if (OFFLINE) {
    console.log("\npasses 2 & 3 — skipped (--offline)");
  } else {
    console.log("\npasses 2 & 3 — liveness and anchors");
    await pass23();
  }

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  · ${w}`);
  }

  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
  }

  console.log("\nNo problems found.");
})();
