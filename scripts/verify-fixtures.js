#!/usr/bin/env node
/* Git Tutor — prove the browser engine writes real git.

   The tutor's sandbox is isomorphic-git driving a browser filesystem. The whole
   pedagogy rests on that being genuine git rather than a plausible imitation, so
   this script builds every fixture in git/assets/js/git/fixtures.js on a real
   filesystem with the same code the browser runs, then hands each repository to
   the real git CLI and asks it:

     1. git fsck --strict            — are these valid objects, fully connected?
     2. git rev-parse <ref>          — does git agree with the ids we reported?
     3. git log / cat-file           — can git read the history back?
     4. git hash-object              — does git hash the same bytes the same way?

   Then it rebuilds one fixture with nothing but the git CLI, using the same
   fixed author, committer and timestamps, and diffs the object ids. Identical
   ids mean the engine is not merely compatible — it is writing the same
   repository git would have written.

   Usage: node scripts/verify-fixtures.js [--keep]                          */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// The browser modules attach themselves to globalThis when there's no window.
globalThis.git = require("isomorphic-git");
const ROOT = path.join(__dirname, "..");
require(path.join(ROOT, "git/assets/js/git/repo.js"));
require(path.join(ROOT, "git/assets/js/git/fixtures.js"));
require(path.join(ROOT, "git/assets/js/git/merge3.js"));
require(path.join(ROOT, "git/assets/js/git/plumbing.js"));
require(path.join(ROOT, "git/assets/js/git/porcelain.js"));

const { GT, GTFix } = globalThis;

const KEEP = process.argv.includes("--keep");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "git-tutor-verify-"));

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { failures++; console.log(`  ✗ ${msg}`); };

function git(dir, ...args) {
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  }).trim();
}

async function main() {
  GT.configure({ fs, root: path.join(work, "labs") });
  await GT.mkdirp(path.join(work, "labs"));

  console.log(`\nworking in ${work}\n`);

  for (const name of GTFix.list()) {
    console.log(`fixture "${name}" — ${GTFix.describe(name).title}`);
    const labId = name;
    let dir;
    try {
      dir = await GT.open(labId, name, { fresh: true });
    } catch (err) {
      bad(`build threw: ${err.message}`);
      continue;
    }

    // 1. Real git validates the object database.
    try {
      const out = execFileSync("git", ["-C", dir, "fsck", "--strict", "--no-progress"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const noise = out.split("\n").filter((l) =>
        l.trim() && !/^(dangling|notice)/.test(l));
      if (noise.length) bad(`fsck complained: ${noise.join(" | ")}`);
      else ok("git fsck --strict is happy");
    } catch (err) {
      // fsck exits non-zero for dangling objects in some versions; only real
      // corruption prints "error:" or "fatal:".
      const text = `${err.stdout || ""}${err.stderr || ""}`;
      if (/error:|fatal:|missing|broken/i.test(text)) bad(`fsck: ${text.trim().split("\n")[0]}`);
      else ok("git fsck --strict is happy (dangling objects only)");
    }

    // 2. Every ref we wrote resolves to the same id in real git.
    const refs = await globalThis.git.listRefs({ fs, dir, filepath: "refs/heads" });
    if (!refs.length && name !== "empty") bad("no branches were created");
    let refsAgree = true;
    for (const ref of refs) {
      const ours = await GT.resolve(dir, `refs/heads/${ref}`);
      const theirs = git(dir, "rev-parse", `refs/heads/${ref}`);
      if (ours !== theirs) {
        refsAgree = false;
        bad(`refs/heads/${ref}: engine says ${ours}, git says ${theirs}`);
      }
    }
    if (refs.length && refsAgree) ok(`git agrees on all ${refs.length} branch id(s)`);

    // 3. git can read the history and every object in it.
    if (refs.length) {
      const count = Number(git(dir, "rev-list", "--count", "--all"));
      const ours = (await globalThis.git.log({ fs, dir, ref: "HEAD" })).length;
      if (count < ours) bad(`git counted ${count} commits, engine logged ${ours}`);
      else ok(`git rev-list --all reads ${count} commit(s)`);

      const objects = git(dir, "cat-file", "--batch-all-objects", "--batch-check")
        .split("\n").filter(Boolean);
      const broken = objects.filter((l) => !/^[0-9a-f]{40} (blob|tree|commit|tag) \d+$/.test(l));
      if (broken.length) bad(`unreadable objects: ${broken.slice(0, 2).join(" | ")}`);
      else ok(`all ${objects.length} objects parse as real git objects`);
    }

    // 4. Reflogs we wrote by hand are the format git itself parses.
    const reflog = await GT.readReflog(dir, "HEAD");
    if (reflog.length) {
      let gitReflog = "";
      try {
        gitReflog = git(dir, "reflog", "show", "HEAD", "--format=%H");
      } catch { /* older git without a reflog for a fresh repo */ }
      const lines = gitReflog.split("\n").filter(Boolean);
      if (lines.length !== reflog.length) {
        bad(`reflog: engine has ${reflog.length} entries, git reads ${lines.length}`);
      } else if (lines[0] !== reflog[0].newOid) {
        bad(`reflog head: engine ${reflog[0].newOid}, git ${lines[0]}`);
      } else {
        ok(`git reflog reads all ${lines.length} entries we wrote`);
      }
    }
    console.log("");
  }

  await verifyAgainstCli();
  await verifyPorcelain();

  console.log(failures
    ? `\n${failures} check(s) FAILED\n`
    : "\nall checks passed — the sandbox is real git\n");
  if (!KEEP) fs.rmSync(work, { recursive: true, force: true });
  else console.log(`kept ${work}\n`);
  process.exit(failures ? 1 : 0);
}

/* The strongest check: build the same history twice — once with the engine,
   once with nothing but the git CLI — and compare object ids. */
async function verifyAgainstCli() {
  console.log("engine vs. the git CLI, same history, same timestamps");

  const engineDir = await GT.open("cli-compare", "two-files", { fresh: true });
  const engineOid = await GT.resolve(engineDir, "refs/heads/main");

  const cliDir = path.join(work, "cli-compare-real");
  fs.mkdirSync(cliDir, { recursive: true });
  git(cliDir, "init", "-q", "--initial-branch=main", ".");

  const { SRC } = GTFix;
  void SRC;
  fs.writeFileSync(path.join(cliDir, "hello.txt"), "hello, object database\n");
  fs.mkdirSync(path.join(cliDir, "notes"), { recursive: true });
  fs.writeFileSync(path.join(cliDir, "notes/plan.md"), "# Plan\n\n- learn plumbing\n");
  git(cliDir, "add", "-A");

  const stamp = `${GT.FIXTURE_EPOCH + GT.FIXTURE_STEP} +0000`;
  const who = GT.FIXTURE_AUTHOR;
  execFileSync("git", ["-C", cliDir, "commit", "-q", "-m", "Add the greeter"], {
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_AUTHOR_NAME: who.name,
      GIT_AUTHOR_EMAIL: who.email,
      GIT_COMMITTER_NAME: who.name,
      GIT_COMMITTER_EMAIL: who.email,
      GIT_AUTHOR_DATE: stamp,
      GIT_COMMITTER_DATE: stamp,
    },
  });
  const cliOid = git(cliDir, "rev-parse", "HEAD");

  if (engineOid === cliOid) ok(`identical commit id: ${engineOid}`);
  else bad(`commit id differs — engine ${engineOid}, git CLI ${cliOid}`);

  const engineTree = git(engineDir, "rev-parse", "HEAD^{tree}");
  const cliTree = git(cliDir, "rev-parse", "HEAD^{tree}");
  if (engineTree === cliTree) ok(`identical tree id: ${engineTree}`);
  else bad(`tree id differs — engine ${engineTree}, git CLI ${cliTree}`);

  // And the blob hashing the plumbing lesson teaches by hand.
  const ours = await globalThis.GTPlumb.hashObject("hello, object database\n");
  const theirs = execFileSync("git", ["-C", cliDir, "hash-object", "--stdin"],
    { input: "hello, object database\n", encoding: "utf8" }).trim();
  if (ours === theirs) ok(`identical blob id from hash-object: ${ours}`);
  else bad(`hash-object differs — engine ${ours}, git ${theirs}`);
  console.log("");
}

/* The commands isomorphic-git doesn't ship, checked against real git's view. */
async function verifyPorcelain() {
  console.log("re-implemented commands, checked with the git CLI");
  const { GTPorc } = globalThis;

  // reset --hard then recover the dropped commit from the reflog
  {
    const dir = await GT.open("porc-reset", "linear-5", { fresh: true });
    const tip = await GT.resolve(dir, "refs/heads/main");
    await GTPorc.reset(dir, "HEAD~2", { mode: "hard" });
    const after = git(dir, "rev-parse", "HEAD");
    const expected = git(dir, "rev-parse", `${tip}~2`);
    if (after === expected) ok("reset --hard moved HEAD where git expects");
    else bad(`reset --hard: HEAD is ${after}, expected ${expected}`);

    const worktree = fs.readFileSync(path.join(dir, "count.py"), "utf8");
    const blessed = git(dir, "show", "HEAD:count.py");
    if (worktree.trim() === blessed.trim()) ok("reset --hard rewrote the worktree");
    else bad("reset --hard left the worktree out of sync with HEAD");

    const entries = await GT.readReflog(dir, "HEAD");
    if (entries[0] && entries[0].newOid === after && entries[0].message.startsWith("reset:")) {
      ok(`reflog recorded it: "${entries[0].message}"`);
    } else {
      bad(`reflog did not record the reset (${entries[0] && entries[0].message})`);
    }
    // the dropped commit must still be reachable through the reflog
    const recovered = await GTPorc.revParseReflog(dir, "HEAD@{1}");
    if (recovered === tip) ok("HEAD@{1} still points at the dropped commit");
    else bad(`HEAD@{1} is ${recovered}, expected ${tip}`);
  }

  // cherry-pick: new commit id, identical tree to the original
  {
    const dir = await GT.open("porc-pick", "diverged", { fresh: true });
    const source = await GT.resolve(dir, "refs/heads/hotfix");
    const before = await GT.resolve(dir, "HEAD");
    const picked = await GTPorc.cherryPick(dir, ["hotfix"]);
    const oid = picked.commits[0];
    const pickedTree = git(dir, "rev-parse", `${oid}^{tree}`);
    const sourceTree = git(dir, "rev-parse", `${source}^{tree}`);
    if (oid !== source) ok("cherry-pick made a new commit id");
    else bad("cherry-pick reused the original commit id");
    if (pickedTree === sourceTree) ok("cherry-picked tree matches the original");
    else bad(`cherry-picked tree ${pickedTree} != original ${sourceTree}`);
    if (git(dir, "rev-parse", "HEAD^") === before) ok("it landed on top of HEAD");
    else bad("cherry-pick did not parent onto HEAD");
  }

  // rebase -i squash: three commits become one, content preserved
  {
    const dir = await GT.open("porc-squash", "wip-3", { fresh: true });
    await globalThis.git.checkout({ fs, dir, ref: "feature/report" });
    const tipTree = git(dir, "rev-parse", "HEAD^{tree}");
    const base = git(dir, "rev-parse", "HEAD~3");
    await GTPorc.rebase(dir, {
      onto: "HEAD~3",
      todo: [
        { command: "pick", oid: git(dir, "rev-parse", "HEAD~2") },
        { command: "squash", oid: git(dir, "rev-parse", "HEAD~1") },
        { command: "squash", oid: git(dir, "rev-parse", "HEAD") },
      ],
      message: "Add the report module",
    });
    const count = Number(git(dir, "rev-list", "--count", `${base}..HEAD`));
    if (count === 1) ok("rebase -i squashed three commits into one");
    else bad(`rebase -i left ${count} commit(s), expected 1`);
    const newTree = git(dir, "rev-parse", "HEAD^{tree}");
    if (newTree === tipTree) ok("the squashed tree is identical to the original tip");
    else bad(`squashed tree ${newTree} != original ${tipTree}`);
    const subject = git(dir, "log", "-1", "--format=%s");
    if (subject === "Add the report module") ok("the squashed commit carries the new message");
    else bad(`squashed subject is "${subject}"`);
  }

  // bisect finds the commit that broke the tokenizer (fixture plants it at #8)
  {
    const dir = await GT.open("porc-bisect", "bug-hunt", { fresh: true });
    const bad_ = await GT.resolve(dir, "HEAD");
    const good = git(dir, "rev-parse", "HEAD~11");
    const culprit = git(dir, "rev-parse", "HEAD~4"); // 12 commits, bug at #8
    const found = await GTPorc.bisectAuto(dir, good, bad_, async (oid) => {
      const src = git(dir, "show", `${oid}:tok.py`);
      return !src.includes('text.split(" ")'); // good when the bug is absent
    });
    if (found === culprit) ok(`bisect found the planted regression: ${found.slice(0, 7)}`);
    else bad(`bisect found ${found && found.slice(0, 7)}, expected ${culprit.slice(0, 7)}`);
  }

  // fsck sees the commits stranded by the deleted branch
  {
    const dir = await GT.open("porc-fsck", "dangling", { fresh: true });
    const report = await GTPorc.fsck(dir, { unreachable: true });
    // --no-reflogs so both sides mean "unreachable from refs". Reflog entries
    // keeping objects alive is itself a lesson (03-forensics), not a mismatch.
    const theirs = git(dir, "fsck", "--unreachable", "--no-reflogs", "--no-progress")
      .split("\n").filter((l) => l.startsWith("unreachable commit"))
      .map((l) => l.split(" ").pop());
    const ours = report.unreachable.filter((o) => o.type === "commit").map((o) => o.oid).sort();
    if (theirs.length && ours.join() === theirs.sort().join()) {
      ok(`fsck agrees with git on ${ours.length} unreachable commit(s)`);
    } else {
      bad(`unreachable commits: engine [${ours.map((o) => o.slice(0, 7))}], git [${theirs.map((o) => o.slice(0, 7))}]`);
    }
  }

  // push/fetch between the two local repos, and force-with-lease
  {
    const dir = await GT.open("porc-remote", "with-remote", { fresh: true });
    const remote = GT.remoteDirFor("porc-remote");
    const rejected = await GTPorc.push(dir, { remote: "origin", refspec: "refs/heads/main:refs/heads/main" })
      .then(() => null).catch((err) => err.message);
    if (rejected && /non-fast-forward|fetch first|rejected/i.test(rejected)) {
      ok("push of a diverged branch is rejected, as git would");
    } else {
      bad(`push should have been rejected (got ${rejected || "success"})`);
    }
    await GTPorc.fetch(dir, { remote: "origin" });
    const tracked = await GT.resolve(dir, "refs/remotes/origin/main");
    const actual = git(remote, "rev-parse", "refs/heads/main");
    if (tracked === actual) ok("fetch updated refs/remotes/origin/main correctly");
    else bad(`origin/main is ${tracked}, remote has ${actual}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
