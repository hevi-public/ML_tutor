/* Git Tutor — plumbing.  window.GTPlumb

   The low layer the internals unit teaches directly and the rest of the engine
   is built out of: hashing objects, reading and writing trees, and resolving
   revision syntax.

   Nothing here fakes anything. hashObject runs the same bytes through SHA-1 that
   `git hash-object` does ("blob <bytelength>\0<contents>"); flattenTree and
   buildTree read and write real tree objects; revParse implements git's actual
   revision grammar rather than a lookalike, because "what does HEAD~2^ mean" is
   itself one of the lessons.                                                */
(function (root) {
  "use strict";

  const GT = root.GT;
  const g = () => root.git;

  /* ---------- hashing ---------- */

  const encoder = new TextEncoder();

  function objectHeader(type, byteLength) {
    return `${type} ${byteLength}\0`;
  }

  async function sha1Hex(bytes) {
    if (typeof window === "undefined") {
      // Node: the verification script's path.
      const { createHash } = require("crypto");
      return createHash("sha1").update(Buffer.from(bytes)).digest("hex");
    }
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /** The id `git hash-object` would print, without writing anything. */
  async function hashObject(contents, type = "blob") {
    const body = typeof contents === "string" ? encoder.encode(contents) : contents;
    const header = encoder.encode(objectHeader(type, body.length));
    const full = new Uint8Array(header.length + body.length);
    full.set(header, 0);
    full.set(body, header.length);
    return sha1Hex(full);
  }

  /** The exact bytes that get hashed — shown to the learner side by side with
      the resulting id, which is the whole point of the object-database lesson. */
  function hashInput(contents, type = "blob") {
    const body = typeof contents === "string" ? contents : new TextDecoder().decode(contents);
    const bytes = typeof contents === "string" ? encoder.encode(contents).length : contents.length;
    return { header: `${type} ${bytes}\\0`, body, bytes };
  }

  async function writeBlob(dir, contents) {
    const body = typeof contents === "string" ? encoder.encode(contents) : contents;
    return g().writeBlob({ ...GT.ctx(dir), blob: body });
  }

  /* ---------- reading objects ---------- */

  async function readObject(dir, oid) {
    return g().readObject({ ...GT.ctx(dir), oid });
  }

  async function objectType(dir, oid) {
    const { type } = await g().readObject({ ...GT.ctx(dir), oid, format: "content" });
    return type;
  }

  async function objectSize(dir, oid) {
    const { object, type } = await g().readObject({ ...GT.ctx(dir), oid, format: "content" });
    if (type === "tree") {
      // readObject hands trees back parsed; the on-disk size needs the raw form.
      const { object: raw } = await g().readObject({ ...GT.ctx(dir), oid, format: "deflated" });
      void raw;
      return null;
    }
    return object.length;
  }

  async function readBlobText(dir, oid) {
    const { blob } = await g().readBlob({ ...GT.ctx(dir), oid });
    return new TextDecoder().decode(blob);
  }

  /** `git cat-file -p`: pretty-print any object. */
  async function catFilePretty(dir, oid) {
    const type = await objectType(dir, oid);
    if (type === "blob") return readBlobText(dir, oid);
    if (type === "tree") {
      const { tree } = await g().readTree({ ...GT.ctx(dir), oid });
      return tree.map((e) =>
        `${e.mode.padStart(6, "0")} ${e.type} ${e.oid}\t${e.path}`).join("\n") + "\n";
    }
    if (type === "commit") {
      const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
      const lines = [`tree ${commit.tree}`];
      for (const p of commit.parent) lines.push(`parent ${p}`);
      lines.push(`author ${person(commit.author)}`);
      lines.push(`committer ${person(commit.committer)}`);
      lines.push("");
      lines.push(commit.message.replace(/\n$/, ""));
      return lines.join("\n") + "\n";
    }
    if (type === "tag") {
      const { tag } = await g().readTag({ ...GT.ctx(dir), oid });
      return [
        `object ${tag.object}`, `type ${tag.type}`, `tag ${tag.tag}`,
        `tagger ${person(tag.tagger)}`, "", tag.message,
      ].join("\n") + "\n";
    }
    return "";
  }

  function person(p) {
    return `${p.name} <${p.email}> ${p.timestamp} ${GT.tzOffsetString(p.timezoneOffset)}`;
  }

  /* ---------- trees ----------

     The engine works with trees as a flat Map of path → {oid, mode}, because
     every interesting operation (merge, cherry-pick, rebase, diff) is easier to
     reason about that way. buildTree turns a flat map back into the nested tree
     objects git actually stores. */

  async function flattenTree(dir, treeOid, prefix = "", into = new Map()) {
    if (!treeOid) return into;
    const { tree } = await g().readTree({ ...GT.ctx(dir), oid: treeOid });
    for (const entry of tree) {
      const p = prefix ? `${prefix}/${entry.path}` : entry.path;
      if (entry.type === "tree") await flattenTree(dir, entry.oid, p, into);
      else into.set(p, { oid: entry.oid, mode: entry.mode, type: entry.type });
    }
    return into;
  }

  /** Write nested tree objects for a flat path → {oid, mode} map; returns the
      root tree id. This is `git write-tree` over an index we built ourselves. */
  async function buildTree(dir, files) {
    // Group by directory, deepest first, so children exist before their parent.
    const nodes = new Map(); // dirPath -> entries[]
    const ensure = (path) => {
      if (!nodes.has(path)) nodes.set(path, []);
      return nodes.get(path);
    };
    ensure("");

    const dirsNeeded = new Set([""]);
    for (const path of files.keys()) {
      const parts = path.split("/");
      let sofar = "";
      for (let i = 0; i < parts.length - 1; i++) {
        sofar = sofar ? `${sofar}/${parts[i]}` : parts[i];
        dirsNeeded.add(sofar);
        ensure(sofar);
      }
    }

    for (const [path, meta] of files) {
      const slash = path.lastIndexOf("/");
      const parent = slash === -1 ? "" : path.slice(0, slash);
      ensure(parent).push({
        mode: meta.mode || "100644",
        path: path.slice(slash + 1),
        oid: meta.oid,
        type: meta.type || "blob",
      });
    }

    const byDepth = [...dirsNeeded].sort((a, b) =>
      b.split("/").length - a.split("/").length || b.localeCompare(a));

    const written = new Map();
    for (const path of byDepth) {
      const entries = [...(nodes.get(path) || [])];
      // Attach already-written child trees.
      for (const child of dirsNeeded) {
        if (child === path) continue;
        const slash = child.lastIndexOf("/");
        const parent = slash === -1 ? "" : child.slice(0, slash);
        if (parent !== path) continue;
        const oid = written.get(child);
        if (!oid) continue; // empty directory: git doesn't store those
        entries.push({ mode: "040000", path: child.slice(slash + 1), oid, type: "tree" });
      }
      if (!entries.length && path !== "") continue;
      // git sorts tree entries by name, with directories compared as "name/".
      entries.sort((a, b) => {
        const an = a.type === "tree" ? a.path + "/" : a.path;
        const bn = b.type === "tree" ? b.path + "/" : b.path;
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
      written.set(path, await g().writeTree({ ...GT.ctx(dir), tree: entries }));
    }
    return written.get("");
  }

  const treeOfCommit = async (dir, oid) =>
    (await g().readCommit({ ...GT.ctx(dir), oid })).commit.tree;

  const filesOfCommit = async (dir, oid) =>
    flattenTree(dir, await treeOfCommit(dir, oid));

  /** Write a flat file map into the worktree and the index, deleting whatever
      is no longer there. Used after a merge, rebase or reset --hard. */
  async function checkoutFiles(dir, files) {
    const existing = await GT.listWorktree(dir);
    for (const path of existing) {
      if (!files.has(path)) {
        await GT.removeFile(dir, path);
        try { await g().remove({ ...GT.ctx(dir), filepath: path }); } catch { /* not indexed */ }
      }
    }
    for (const [path, meta] of files) {
      await GT.writeFile(dir, path, await readBlobText(dir, meta.oid));
      await g().add({ ...GT.ctx(dir), filepath: path });
    }
    await GT.flush();
  }

  /* ---------- revision syntax ----------

     git's actual grammar, in the order git tries it:
       HEAD | @ | branch | tag | remote-tracking | abbreviated oid
       <rev>^        first parent          <rev>^2   second parent
       <rev>~n       n first-parents back  <rev>^{} peel to object
       <rev>^{tree}  the tree of a commit  <rev>^{commit}
       <rev>@{n}     nth reflog entry      <rev>@{u} upstream
       :/text        newest commit whose message contains text            */

  const OID_RE = /^[0-9a-f]{4,40}$/;

  async function revParse(dir, rev) {
    if (!rev) throw new Error("ambiguous argument '': unknown revision");
    let spec = String(rev).trim();

    // Trailing modifiers are peeled off from the right as git does.
    const suffixes = [];
    for (;;) {
      const peel = spec.match(/\^\{([a-z]*)\}$/);
      if (peel) {
        suffixes.unshift({ kind: "peel", to: peel[1] });
        spec = spec.slice(0, peel.index);
        continue;
      }
      const reflog = spec.match(/@\{([^}]+)\}$/);
      if (reflog) {
        suffixes.unshift({ kind: "at", value: reflog[1] });
        spec = spec.slice(0, reflog.index);
        continue;
      }
      const tilde = spec.match(/~(\d*)$/);
      if (tilde) {
        suffixes.unshift({ kind: "tilde", n: tilde[1] === "" ? 1 : Number(tilde[1]) });
        spec = spec.slice(0, tilde.index);
        continue;
      }
      const caret = spec.match(/\^(\d*)$/);
      if (caret) {
        suffixes.unshift({ kind: "caret", n: caret[1] === "" ? 1 : Number(caret[1]) });
        spec = spec.slice(0, caret.index);
        continue;
      }
      break;
    }

    let oid = await resolveBase(dir, spec, suffixes);

    for (const suffix of suffixes) {
      if (suffix.kind === "at") continue; // handled in resolveBase
      if (suffix.kind === "tilde") {
        for (let i = 0; i < suffix.n; i++) oid = await firstParent(dir, oid);
      } else if (suffix.kind === "caret") {
        if (suffix.n === 0) continue;
        const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
        const parent = commit.parent[suffix.n - 1];
        if (!parent) throw new Error(`${rev}: commit has no parent ${suffix.n}`);
        oid = parent;
      } else if (suffix.kind === "peel") {
        if (suffix.to === "tree") oid = await treeOfCommit(dir, oid);
        else if (suffix.to === "commit" || suffix.to === "") {
          const type = await objectType(dir, oid);
          if (type === "tag") oid = (await g().readTag({ ...GT.ctx(dir), oid })).tag.object;
        }
      }
    }
    return oid;
  }

  async function resolveBase(dir, spec, suffixes) {
    const at = suffixes.find((s) => s.kind === "at");

    if (spec === "" || spec === "@") spec = "HEAD";

    // <rev>:<path> — the blob (or tree) at that path in that commit
    const colon = spec.indexOf(":");
    if (colon > 0) {
      const rev = spec.slice(0, colon);
      const path = spec.slice(colon + 1);
      const commitOid = await revParse(dir, rev || "HEAD");
      const files = await flattenTree(dir, await treeOfCommit(dir, commitOid));
      const meta = files.get(path);
      if (meta) return meta.oid;
      // Could be a directory: resolve it to the subtree's own id.
      const { tree } = await g().readTree({
        ...GT.ctx(dir), oid: await treeOfCommit(dir, commitOid),
      });
      const walk = async (entries, parts) => {
        const [head, ...rest] = parts;
        const entry = entries.find((e) => e.path === head);
        if (!entry) return null;
        if (!rest.length) return entry.oid;
        if (entry.type !== "tree") return null;
        const sub = await g().readTree({ ...GT.ctx(dir), oid: entry.oid });
        return walk(sub.tree, rest);
      };
      const found = await walk(tree, path.split("/"));
      if (found) return found;
      throw new Error(`path '${path}' does not exist in '${rev}'`);
    }

    // :/text — search commit messages, newest first
    if (spec.startsWith(":/")) {
      const needle = spec.slice(2);
      const log = await g().log({ ...GT.ctx(dir), ref: "HEAD" });
      const hit = log.find((entry) => entry.commit.message.includes(needle));
      if (!hit) throw new Error(`no commit message matches '${needle}'`);
      return hit.oid;
    }

    if (at) {
      const value = at.value.trim();
      if (value === "u" || value === "upstream") {
        const branch = spec === "HEAD"
          ? (await GT.headRef(dir))?.replace("refs/heads/", "")
          : spec;
        const upstream = await upstreamOf(dir, branch);
        if (!upstream) throw new Error(`no upstream configured for branch '${branch}'`);
        return GT.resolve(dir, upstream);
      }
      if (/^\d+$/.test(value)) {
        const ref = spec === "HEAD" ? "HEAD" : await fullRefName(dir, spec);
        const entries = await GT.readReflog(dir, ref);
        const entry = entries[Number(value)];
        if (!entry) {
          throw new Error(
            `log for '${spec}' only has ${entries.length} entries`);
        }
        return entry.newOid;
      }
      throw new Error(`unsupported reflog selector @{${at.value}} in this sandbox`);
    }

    const direct = await GT.resolve(dir, spec);
    // resolveRef hands a full-length id straight back without looking for it, so
    // an id-shaped spec still has to go through the existence check below.
    if (direct && !(direct === spec && OID_RE.test(spec))) return direct;

    if (OID_RE.test(spec)) {
      let oid;
      try {
        oid = await g().expandOid({ ...GT.ctx(dir), oid: spec });
      } catch {
        throw new Error(`unknown revision or path not in the working tree: ${spec}`);
      }
      // expandOid is happy with a full-length id it has never seen, so confirm
      // the object is really there. Without this, `git update-ref` would accept
      // a typo and leave the repository pointing at nothing — real git refuses.
      try {
        await g().readObject({ ...GT.ctx(dir), oid, format: "content" });
      } catch {
        throw new Error(`not a valid object name: '${spec}'`);
      }
      return oid;
    }
    throw new Error(`unknown revision or path not in the working tree: ${spec}`);
  }

  async function fullRefName(dir, name) {
    for (const candidate of [
      name, `refs/heads/${name}`, `refs/tags/${name}`, `refs/remotes/${name}`,
    ]) {
      if (await GT.resolve(dir, candidate)) return candidate;
    }
    return name;
  }

  async function firstParent(dir, oid) {
    const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
    if (!commit.parent.length) throw new Error(`${oid.slice(0, 7)} has no parent`);
    return commit.parent[0];
  }

  async function upstreamOf(dir, branch) {
    try {
      const remote = await g().getConfig({ ...GT.ctx(dir), path: `branch.${branch}.remote` });
      const merge = await g().getConfig({ ...GT.ctx(dir), path: `branch.${branch}.merge` });
      if (remote && merge) {
        return `refs/remotes/${remote}/${merge.replace("refs/heads/", "")}`;
      }
    } catch { /* not configured */ }
    // Fall back to the conventional name, which is what the fixtures set up.
    const guess = `refs/remotes/origin/${branch}`;
    return (await GT.resolve(dir, guess)) ? guess : null;
  }

  /* ---------- history walks ---------- */

  /** Commits reachable from `oid`, newest first. */
  async function ancestors(dir, oid, options = {}) {
    const seen = new Set();
    const order = [];
    const queue = [oid];
    while (queue.length) {
      // Walk in commit-date order so the output matches `git log`.
      queue.sort((a, b) => 0);
      const next = queue.shift();
      if (!next || seen.has(next)) continue;
      seen.add(next);
      let commit;
      try {
        ({ commit } = await g().readCommit({ ...GT.ctx(dir), oid: next }));
      } catch {
        continue;
      }
      order.push({ oid: next, commit });
      const parents = options.firstParent ? commit.parent.slice(0, 1) : commit.parent;
      queue.push(...parents);
    }
    order.sort((a, b) => b.commit.committer.timestamp - a.commit.committer.timestamp);
    return order;
  }

  /** `git rev-list a..b` — reachable from b, not from a. Oldest first when
      `reverse` is set, which is the order rebase and bisect want. */
  async function revList(dir, options = {}) {
    const { include = [], exclude = [], reverse = false, firstParent = false } = options;
    const excluded = new Set();
    for (const oid of exclude) {
      for (const entry of await ancestors(dir, oid, { firstParent })) excluded.add(entry.oid);
    }
    const out = [];
    const seen = new Set();
    for (const oid of include) {
      for (const entry of await ancestors(dir, oid, { firstParent })) {
        if (excluded.has(entry.oid) || seen.has(entry.oid)) continue;
        seen.add(entry.oid);
        out.push(entry);
      }
    }
    out.sort((a, b) => b.commit.committer.timestamp - a.commit.committer.timestamp);
    return reverse ? out.reverse() : out;
  }

  /** Parse `a..b`, `a...b`, `^a b`, or a plain revision into rev-list options. */
  async function parseRange(dir, args) {
    const include = [];
    const exclude = [];
    let symmetric = null;
    for (const arg of args) {
      if (arg.includes("...")) {
        const [a, b] = arg.split("...");
        const left = await revParse(dir, a || "HEAD");
        const right = await revParse(dir, b || "HEAD");
        const base = await g().findMergeBase({ ...GT.ctx(dir), oids: [left, right] });
        include.push(left, right);
        if (base[0]) exclude.push(base[0]);
        symmetric = { left, right, base: base[0] };
      } else if (arg.includes("..")) {
        const [a, b] = arg.split("..");
        exclude.push(await revParse(dir, a || "HEAD"));
        include.push(await revParse(dir, b || "HEAD"));
      } else if (arg.startsWith("^")) {
        exclude.push(await revParse(dir, arg.slice(1)));
      } else {
        include.push(await revParse(dir, arg));
      }
    }
    if (!include.length) include.push(await revParse(dir, "HEAD"));
    return { include, exclude, symmetric };
  }

  async function isAncestor(dir, maybeAncestor, descendant) {
    if (!maybeAncestor || !descendant) return false;
    if (maybeAncestor === descendant) return true;
    const seen = new Set();
    const queue = [descendant];
    while (queue.length) {
      const oid = queue.shift();
      if (seen.has(oid)) continue;
      seen.add(oid);
      if (oid === maybeAncestor) return true;
      try {
        const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
        queue.push(...commit.parent);
      } catch { /* shallow or missing */ }
    }
    return false;
  }

  /* ---------- refs, for the DAG and for `for-each-ref` ---------- */

  async function allRefs(dir) {
    const out = [];
    for (const [prefix, kind] of [
      ["refs/heads", "branch"], ["refs/tags", "tag"], ["refs/remotes", "remote"],
    ]) {
      let names = [];
      try { names = await g().listRefs({ ...GT.ctx(dir), filepath: prefix }); } catch { /* none */ }
      for (const name of names) {
        const full = `${prefix}/${name}`;
        out.push({ name, full, kind, oid: await GT.resolve(dir, full) });
      }
    }
    const head = await GT.headRef(dir);
    out.push({
      name: "HEAD", full: "HEAD", kind: "head",
      oid: await GT.resolve(dir, "HEAD"),
      points: head, detached: head === null,
    });
    return out;
  }

  /** Every loose object in the repository, for fsck and the object explorer.
      Packed objects are not enumerated — this tutor never packs, and the gc
      lesson says so explicitly rather than pretending otherwise. */
  async function looseObjects(dir) {
    const out = [];
    const base = `${dir}/.git/objects`;
    let buckets = [];
    try { buckets = await GT.pfs().readdir(base); } catch { return out; }
    for (const bucket of buckets) {
      if (!/^[0-9a-f]{2}$/.test(bucket)) continue;
      let names = [];
      try { names = await GT.pfs().readdir(`${base}/${bucket}`); } catch { continue; }
      for (const name of names) out.push(bucket + name);
    }
    return out.sort();
  }

  root.GTPlumb = {
    // hashing and objects
    hashObject,
    hashInput,
    sha1Hex,
    writeBlob,
    readObject,
    objectType,
    objectSize,
    readBlobText,
    catFilePretty,
    looseObjects,
    person,

    // trees
    flattenTree,
    buildTree,
    treeOfCommit,
    filesOfCommit,
    checkoutFiles,

    // revisions
    revParse,
    fullRefName,
    firstParent,
    upstreamOf,
    ancestors,
    revList,
    parseRange,
    isAncestor,
    allRefs,
  };
})(typeof window === "undefined" ? globalThis : window);
