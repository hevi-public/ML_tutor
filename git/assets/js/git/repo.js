/* Git Tutor — the sandbox repository layer.  window.GT

   Every lab on this site runs against a REAL git repository. isomorphic-git
   (UMD global `git`) reads and writes genuine loose/packed objects, real trees,
   real refs; @isomorphic-git/lightning-fs (global `LightningFS`) gives it a
   POSIX-ish filesystem backed by IndexedDB. Nothing here is simulated: the
   object ids you see are SHA-1 hashes of real git objects, and the fixture
   histories hash identically to the same history built by the git CLI
   (see selftest.html and scripts/verify-fixtures.js).

   This module owns four things the rest of the engine builds on:

     1. Filesystem + repo lifecycle — one FS, one directory per lab, plus a
        sibling directory per lab that plays the part of a remote.
     2. Ref updates that WRITE REFLOGS. isomorphic-git does not maintain
        .git/logs/*, so GT.updateRef/GT.commit do it in git's own format. That
        is why every command in this tutor routes through GT: if a ref moved
        without a reflog line, the recovery lessons would be a lie.
     3. fs.flush() after every mutation — LightningFS may apply writes out of
        order, which can corrupt a repo if the tab dies mid-command.
     4. Deterministic identity for fixture commits (fixed name/email/timestamp)
        so lesson prose can quote real object ids.

   Node (scripts/verify-fixtures.js) uses the same code with the real fs:
     GT.configure({ fs: require("fs"), root: "/tmp/…" })                      */
(function (root) {
  "use strict";

  const isNode = typeof window === "undefined";

  /* ---------- identity ----------

     Fixture history is authored by one fictional person at fixed times, so
     every object id is reproducible. The learner's own commits use the real
     clock — their ids differ from ours by design, and no lab check ever
     hardcodes a learner id. */

  const FIXTURE_AUTHOR = {
    name: "Ada Rivera",
    email: "ada@example.com",
  };

  // 2024-03-04T09:00:00Z. Fixtures step forward from here in 10-minute hops.
  const FIXTURE_EPOCH = 1709542800;
  const FIXTURE_STEP = 600;

  const ZERO = "0000000000000000000000000000000000000000";

  /* ---------- state ---------- */

  const state = {
    fs: null,
    root: "/labs",
    author: { name: "You", email: "you@example.com" },
  };

  function theFs() {
    if (state.fs) return state.fs;
    if (isNode) throw new Error("GT.configure({ fs }) first");
    if (!root.LightningFS) throw new Error("LightningFS is missing");
    if (!root.git) throw new Error("isomorphic-git is missing");
    state.fs = new root.LightningFS("git-tutor");
    return state.fs;
  }

  // LightningFS exposes promises under .promises, as does node:fs.
  const pfs = () => theFs().promises;

  async function flush() {
    const fs = theFs();
    if (typeof fs.flush === "function") await fs.flush();
  }

  /* ---------- paths ---------- */

  const dirFor = (labId) => `${state.root}/${labId}`;
  const remoteDirFor = (labId) => `${state.root}/${labId}.remote`;
  const ctx = (dir) => ({ fs: theFs(), dir });

  async function exists(path) {
    try {
      await pfs().stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async function mkdirp(path) {
    const parts = path.split("/").filter(Boolean);
    let sofar = "";
    for (const part of parts) {
      sofar += "/" + part;
      if (!(await exists(sofar))) {
        try { await pfs().mkdir(sofar); } catch { /* raced or exists */ }
      }
    }
  }

  async function rmrf(path) {
    let entries;
    try {
      entries = await pfs().readdir(path);
    } catch {
      // not a directory (or gone): try unlink and give up quietly
      try { await pfs().unlink(path); } catch { /* already gone */ }
      return;
    }
    for (const entry of entries) await rmrf(`${path}/${entry}`);
    try { await pfs().rmdir(path); } catch { /* already gone */ }
  }

  /* ---------- file helpers used by fixtures, labs and checks ---------- */

  async function writeFile(dir, filepath, contents) {
    const full = `${dir}/${filepath}`;
    const slash = full.lastIndexOf("/");
    if (slash > 0) await mkdirp(full.slice(0, slash));
    await pfs().writeFile(full, contents, "utf8");
    await flush();
  }

  async function readFile(dir, filepath) {
    const data = await pfs().readFile(`${dir}/${filepath}`, "utf8");
    return typeof data === "string" ? data : new TextDecoder().decode(data);
  }

  async function removeFile(dir, filepath) {
    try { await pfs().unlink(`${dir}/${filepath}`); } catch { /* gone */ }
    await flush();
  }

  // Worktree files, excluding .git. Used by status/DAG/lab checks.
  async function listWorktree(dir, sub = "") {
    const base = sub ? `${dir}/${sub}` : dir;
    let entries = [];
    try { entries = await pfs().readdir(base); } catch { return []; }
    const out = [];
    for (const entry of entries) {
      if (!sub && entry === ".git") continue;
      const rel = sub ? `${sub}/${entry}` : entry;
      const stat = await pfs().stat(`${dir}/${rel}`);
      if (stat.isDirectory()) out.push(...(await listWorktree(dir, rel)));
      else out.push(rel);
    }
    return out.sort();
  }

  /* ---------- reflog ----------

     git's format, one line per ref movement:

       <old-oid> <new-oid> <name> <email> <unix-ts> <tz>\t<message>

     Written to .git/logs/HEAD and .git/logs/<ref>. Reading these back is
     genuinely reading git's reflog — `git reflog` in this tutor is not a
     recreation of the idea, it is a parser for these files.               */

  function tzOffsetString(minutesWestOfUTC) {
    // git stores the offset as seen by a human: +0200 for UTC+2.
    const east = -minutesWestOfUTC;
    const sign = east < 0 ? "-" : "+";
    const abs = Math.abs(east);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    return `${sign}${hh}${mm}`;
  }

  function reflogPath(dir, ref) {
    return ref === "HEAD"
      ? `${dir}/.git/logs/HEAD`
      : `${dir}/.git/logs/${ref}`;
  }

  async function appendReflog(dir, ref, oldOid, newOid, message, when) {
    const w = when || {};
    const ts = w.timestamp || Math.floor(Date.now() / 1000);
    const tz = tzOffsetString(
      w.timezoneOffset === undefined ? new Date().getTimezoneOffset() : w.timezoneOffset);
    const who = w.author || state.author;
    const line = `${oldOid || ZERO} ${newOid} ${who.name} <${who.email}> ` +
      `${ts} ${tz}\t${message}\n`;

    const path = reflogPath(dir, ref);
    const slash = path.lastIndexOf("/");
    await mkdirp(path.slice(0, slash));
    let existing = "";
    try {
      const raw = await pfs().readFile(path, "utf8");
      existing = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    } catch { /* first entry */ }
    await pfs().writeFile(path, existing + line, "utf8");
    await flush();
  }

  function parseReflog(text) {
    return text.split("\n").filter(Boolean).map((line) => {
      const [meta, message = ""] = line.split("\t");
      const parts = meta.split(" ");
      const oldOid = parts[0];
      const newOid = parts[1];
      const emailAt = parts.findIndex((p) => p.startsWith("<"));
      const name = parts.slice(2, emailAt).join(" ");
      const email = (parts[emailAt] || "<>").slice(1, -1);
      return {
        oldOid,
        newOid,
        name,
        email,
        timestamp: Number(parts[emailAt + 1]),
        timezone: parts[emailAt + 2] || "+0000",
        message,
      };
    });
  }

  // Newest first, the order `git reflog` prints and `@{n}` counts in.
  async function readReflog(dir, ref = "HEAD") {
    let text = "";
    try {
      const raw = await pfs().readFile(reflogPath(dir, ref), "utf8");
      text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    } catch {
      return [];
    }
    return parseReflog(text).reverse();
  }

  /* ---------- refs ---------- */

  async function resolve(dir, ref) {
    try {
      return await root.git.resolveRef({ ...ctx(dir), ref });
    } catch {
      return null;
    }
  }

  async function headRef(dir) {
    // Full ref name HEAD points at, or null when HEAD is detached.
    try {
      const full = await root.git.currentBranch({ ...ctx(dir), fullname: true });
      return full || null;
    } catch {
      return null;
    }
  }

  async function isDetached(dir) {
    return (await headRef(dir)) === null;
  }

  /** Move a ref and record it in the reflog — the only sanctioned way to move
      a ref in this tutor. `message` becomes the reflog message, so it should
      read like git's own ("reset: moving to HEAD~2", "rebase (squash): …"). */
  async function updateRef(dir, ref, value, message, when) {
    const before = await resolve(dir, ref);
    await root.git.writeRef({ ...ctx(dir), ref, value, force: true });
    await appendReflog(dir, ref, before, value, message, when);
    // HEAD's reflog also records movement of the branch it points at.
    if (ref !== "HEAD" && (await headRef(dir)) === ref) {
      await appendReflog(dir, "HEAD", before, value, message, when);
    }
    await flush();
    return value;
  }

  /** Point HEAD at a branch (symbolic) or straight at a commit (detached). */
  async function setHead(dir, target, message, when) {
    const before = await resolve(dir, "HEAD");
    if (target.startsWith("refs/")) {
      await root.git.writeRef({
        ...ctx(dir), ref: "HEAD", value: target, symbolic: true, force: true,
      });
    } else {
      await root.git.writeRef({ ...ctx(dir), ref: "HEAD", value: target, force: true });
    }
    const after = await resolve(dir, "HEAD");
    await appendReflog(dir, "HEAD", before, after || target, message, when);
    await flush();
    return after;
  }

  /* ---------- commits ----------

     A wrapper over git.commit that keeps the reflog honest. Pass `tree` and
     `parent` to build a commit from arbitrary pieces — that is the plumbing
     `commit-tree` the internals unit teaches, and what rebase/cherry-pick use
     under the hood. */

  async function commit(dir, options = {}) {
    const {
      message,
      tree,
      parent,
      ref,
      author,
      committer,
      reflog,
      noUpdateBranch,
      when,
    } = options;

    const targetRef = ref || (await headRef(dir)) || "HEAD";
    const before = await resolve(dir, targetRef);

    const who = author || state.author;
    const stamp = when
      ? { timestamp: when.timestamp, timezoneOffset: when.timezoneOffset ?? 0 }
      : {};

    const oid = await root.git.commit({
      ...ctx(dir),
      message,
      tree,
      parent,
      ref: noUpdateBranch ? undefined : targetRef,
      noUpdateBranch: Boolean(noUpdateBranch),
      author: { ...who, ...stamp },
      committer: { ...(committer || who), ...stamp },
    });

    if (!noUpdateBranch) {
      const text = reflog || `commit: ${String(message).split("\n")[0]}`;
      await appendReflog(dir, targetRef, before, oid, text, { ...when, author: who });
      if (targetRef !== "HEAD") {
        await appendReflog(dir, "HEAD", before, oid, text, { ...when, author: who });
      }
    }
    await flush();
    return oid;
  }

  /* ---------- lifecycle ---------- */

  /** Create the repo for a lab and run its fixture. Returns the lab's dir. */
  async function init(labId, options = {}) {
    const dir = dirFor(labId);
    await mkdirp(dir);
    await root.git.init({ ...ctx(dir), defaultBranch: options.defaultBranch || "main" });
    // A repo with no reflog would make @{n} and `reflog` look broken.
    await mkdirp(`${dir}/.git/logs`);
    await flush();
    return dir;
  }

  async function destroy(labId) {
    await rmrf(dirFor(labId));
    await rmrf(remoteDirFor(labId));
    await flush();
  }

  /** The entry point every lab page uses: give me this lab's repo, seeded.
      Reuses the existing sandbox unless `fresh` is set, so a learner can leave
      a page and come back to their own history. */
  async function open(labId, fixtureName, options = {}) {
    const dir = dirFor(labId);
    const already = await exists(`${dir}/.git`);
    if (already && !options.fresh) return dir;
    if (already) await destroy(labId);
    await init(labId, options);
    if (fixtureName) {
      if (!root.GTFix) throw new Error("fixtures.js is not loaded");
      await root.GTFix.build(fixtureName, dir);
    }
    return dir;
  }

  const reset = (labId, fixtureName, options) =>
    open(labId, fixtureName, { ...options, fresh: true });

  /** Wipe every sandbox on this origin (the "reset all" escape hatch). */
  async function destroyAll() {
    let entries = [];
    try { entries = await pfs().readdir(state.root); } catch { return; }
    for (const entry of entries) await rmrf(`${state.root}/${entry}`);
    await flush();
  }

  /* ---------- environment ---------- */

  /** Sandboxes need IndexedDB, which Chrome denies to file:// pages. Pages
      call this and show the same "serve it over http" note glossary.js uses. */
  function available() {
    if (isNode) return { ok: true };
    if (!root.git || !root.LightningFS) {
      return {
        ok: false,
        reason: "The git engine didn't load. Run <code>npm install</code>, " +
          "then reload this page.",
      };
    }
    if (location.protocol === "file:") {
      return {
        ok: false,
        reason: "The sandbox stores its repositories in IndexedDB, which " +
          "browsers block for pages opened straight off disk. Serve the site " +
          "instead — <code>npm run dev:git</code> — and this page comes alive.",
      };
    }
    return { ok: true };
  }

  function configure(options = {}) {
    if (options.fs) state.fs = options.fs;
    if (options.root) state.root = options.root;
    if (options.author) state.author = options.author;
  }

  root.GT = {
    // configuration + environment
    configure,
    available,
    get author() { return state.author; },
    FIXTURE_AUTHOR,
    FIXTURE_EPOCH,
    FIXTURE_STEP,
    ZERO,

    // filesystem
    fs: theFs,
    pfs,
    flush,
    ctx,
    dirFor,
    remoteDirFor,
    exists,
    mkdirp,
    rmrf,
    writeFile,
    readFile,
    removeFile,
    listWorktree,

    // lifecycle
    init,
    open,
    reset,
    destroy,
    destroyAll,

    // refs, reflog, commits
    resolve,
    headRef,
    isDetached,
    updateRef,
    setHead,
    commit,
    appendReflog,
    readReflog,
    parseReflog,
    tzOffsetString,
  };
})(typeof window === "undefined" ? globalThis : window);
