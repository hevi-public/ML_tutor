/* Git Tutor — the commands isomorphic-git doesn't ship.  window.GTPorc

   isomorphic-git gives us a real object database, real refs and real trees, but
   it stops short of reset, revert, rebase, bisect, reflog, fsck and the network
   commands. Those are most of what an experienced git user actually wants to
   learn, so they are implemented here — on top of the real plumbing, never
   faked. Every one of them ends in the same place git does: new objects in
   .git/objects, refs moved, reflog appended.

   One primitive does most of the work: applyCommit() replays the difference a
   commit made onto a different parent, via a three-way merge of
   (parent tree, target tree, commit tree). cherry-pick, revert and every step
   of rebase are that primitive with different arguments — which is exactly the
   claim the lessons make about git itself.

   scripts/verify-fixtures.js checks the results of this file against the real
   git CLI.                                                                   */
(function (root) {
  "use strict";

  const GT = root.GT;
  const P = () => root.GTPlumb;
  const M = () => root.GTMerge;
  const g = () => root.git;

  class GitError extends Error {}
  const fail = (message) => { throw new GitError(message); };

  /* ---------- state files ----------
     Real paths, real contents: a lesson can `cat .git/MERGE_HEAD` and see what
     git would have put there. */

  const statePath = (dir, name) => `${dir}/.git/${name}`;

  async function writeState(dir, name, text) {
    const path = statePath(dir, name);
    const slash = path.lastIndexOf("/");
    await GT.mkdirp(path.slice(0, slash));
    await GT.pfs().writeFile(path, text, "utf8");
    await GT.flush();
  }

  async function readState(dir, name) {
    try {
      const raw = await GT.pfs().readFile(statePath(dir, name), "utf8");
      return typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    } catch {
      return null;
    }
  }

  async function clearState(dir, ...names) {
    for (const name of names) {
      try { await GT.pfs().unlink(statePath(dir, name)); } catch { /* absent */ }
    }
    await GT.flush();
  }

  /* ---------- reset ---------- */

  /** reset --soft moves the branch; --mixed also resets the index; --hard also
      rewrites the working tree. Untracked files are never touched — the single
      most reassuring fact about `git reset --hard`. */
  async function reset(dir, rev = "HEAD", options = {}) {
    const mode = options.mode || "mixed";
    const target = await P().revParse(dir, rev);
    const before = await GT.resolve(dir, "HEAD");
    await writeState(dir, "ORIG_HEAD", before + "\n");

    const branch = await GT.headRef(dir);
    const message = `reset: moving to ${rev}`;
    if (branch) await GT.updateRef(dir, branch, target, message);
    else await GT.setHead(dir, target, message);

    if (mode === "soft") return { target, mode };

    const from = await P().filesOfCommit(dir, target);
    if (mode === "mixed") {
      // The index matches the new HEAD; the working tree keeps your edits.
      const tracked = new Set([...from.keys(), ...(await g().listFiles(GT.ctx(dir)))]);
      for (const filepath of tracked) {
        try {
          await g().resetIndex({ ...GT.ctx(dir), filepath, ref: target });
        } catch {
          try { await g().remove({ ...GT.ctx(dir), filepath }); } catch { /* gone */ }
        }
      }
      await GT.flush();
      return { target, mode };
    }

    if (mode === "hard") {
      await P().checkoutFiles(dir, from);
      return { target, mode };
    }
    return fail(`unknown reset mode: ${mode}`);
  }

  /** HEAD@{2} and friends, resolved straight out of the reflog file. */
  async function revParseReflog(dir, spec) {
    return P().revParse(dir, spec);
  }

  /* ---------- the replay primitive ---------- */

  /** Replay what `oid` changed, on top of `ontoOid`.
      Returns { tree, conflicts: [paths], files } without committing. */
  async function replayTree(dir, ontoOid, oid, options = {}) {
    const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
    const baseOid = options.reverse ? oid : commit.parent[0];
    const theirsOid = options.reverse ? commit.parent[0] : oid;

    const base = baseOid ? await P().filesOfCommit(dir, baseOid) : new Map();
    const ours = await P().filesOfCommit(dir, ontoOid);
    const theirs = await P().filesOfCommit(dir, theirsOid);

    const paths = new Set([...base.keys(), ...ours.keys(), ...theirs.keys()]);
    const merged = new Map();
    const conflicts = [];

    for (const path of [...paths].sort()) {
      const b = base.get(path);
      const o = ours.get(path);
      const t = theirs.get(path);

      // Untouched by the commit being replayed: keep what we have.
      if ((b && t && b.oid === t.oid) || (!b && !t)) {
        if (o) merged.set(path, o);
        continue;
      }
      // We didn't touch it: take the replayed side wholesale.
      if ((b && o && b.oid === o.oid) || (!b && !o)) {
        if (t) merged.set(path, t);
        continue;
      }
      // Both sides changed it. Identical results are not a conflict.
      if (o && t && o.oid === t.oid) {
        merged.set(path, o);
        continue;
      }
      // Deleted on one side, edited on the other, or edited differently.
      if (!o || !t) {
        conflicts.push(path);
        if (o) merged.set(path, o);
        continue;
      }
      const result = M().mergeText(
        b ? await P().readBlobText(dir, b.oid) : "",
        await P().readBlobText(dir, o.oid),
        await P().readBlobText(dir, t.oid),
        { ours: options.oursLabel || "HEAD", theirs: options.theirsLabel || commit.message.split("\n")[0] });
      const blob = await P().writeBlob(dir, result.text);
      merged.set(path, { oid: blob, mode: o.mode || t.mode, type: "blob" });
      if (result.conflicts) conflicts.push(path);
    }

    return { tree: await P().buildTree(dir, merged), conflicts, files: merged, commit };
  }

  /** Replay `oid` onto `ontoOid` and commit the result. */
  async function applyCommit(dir, ontoOid, oid, options = {}) {
    const replayed = await replayTree(dir, ontoOid, oid, options);
    if (replayed.conflicts.length && !options.allowConflicts) {
      return { conflicts: replayed.conflicts, files: replayed.files, commit: replayed.commit };
    }

    const source = replayed.commit;
    const message = options.message === undefined
      ? source.message
      : options.message;

    // An empty replay means the change is already there — git says so and stops.
    const ontoTree = await P().treeOfCommit(dir, ontoOid);
    if (replayed.tree === ontoTree && !options.allowEmpty) {
      return { empty: true, commit: source };
    }

    const oidNew = await GT.commit(dir, {
      message,
      tree: replayed.tree,
      parent: [ontoOid],
      // A replayed commit keeps its author but gets a new committer — the
      // difference the "who wrote this vs. who moved it" lesson turns on.
      author: options.author || {
        name: source.author.name,
        email: source.author.email,
        timestamp: source.author.timestamp,
        timezoneOffset: source.author.timezoneOffset,
      },
      committer: options.committer || GT.author,
      when: options.when,
      ref: options.ref,
      noUpdateBranch: options.noUpdateBranch,
      reflog: options.reflog,
    });
    return { oid: oidNew, files: replayed.files, commit: source };
  }

  /* ---------- cherry-pick and revert ---------- */

  async function cherryPick(dir, revs, options = {}) {
    const commits = [];
    for (const rev of revs) {
      const oid = await P().revParse(dir, rev);
      const head = await GT.resolve(dir, "HEAD");
      const source = (await g().readCommit({ ...GT.ctx(dir), oid })).commit;

      let message = source.message;
      if (options.x) {
        message = message.replace(/\n*$/, "\n") +
          `\n(cherry picked from commit ${oid})\n`;
      }

      const result = await applyCommit(dir, head, oid, {
        message,
        reflog: `cherry-pick: ${source.message.split("\n")[0]}`,
        theirsLabel: `${oid.slice(0, 7)} (${source.message.split("\n")[0]})`,
      });

      if (result.conflicts) {
        await writeState(dir, "CHERRY_PICK_HEAD", oid + "\n");
        await writeConflicts(dir, result.files, result.conflicts);
        return { conflicts: result.conflicts, oid, commits };
      }
      if (result.empty) {
        return fail("The previous cherry-pick is now empty, possibly due to " +
          "conflict resolution.\nnothing to commit, working tree clean");
      }
      if (options.noCommit) return { staged: true, commits };
      commits.push(result.oid);
      await P().checkoutFiles(dir, result.files);
    }
    await clearState(dir, "CHERRY_PICK_HEAD");
    return { commits };
  }

  async function revert(dir, revs, options = {}) {
    const commits = [];
    for (const rev of revs) {
      const oid = await P().revParse(dir, rev);
      const head = await GT.resolve(dir, "HEAD");
      const source = (await g().readCommit({ ...GT.ctx(dir), oid })).commit;
      const subject = source.message.split("\n")[0];

      const result = await applyCommit(dir, head, oid, {
        reverse: true,
        message: `Revert "${subject}"\n\nThis reverts commit ${oid}.\n`,
        author: GT.author,
        reflog: `revert: Revert "${subject}"`,
        theirsLabel: `parent of ${oid.slice(0, 7)}`,
      });

      if (result.conflicts) {
        await writeState(dir, "REVERT_HEAD", oid + "\n");
        await writeConflicts(dir, result.files, result.conflicts);
        return { conflicts: result.conflicts, oid, commits };
      }
      if (result.empty && !options.allowEmpty) {
        return fail("nothing to commit, working tree clean");
      }
      commits.push(result.oid);
      await P().checkoutFiles(dir, result.files);
    }
    return { commits };
  }

  /** Put the half-merged content (markers and all) in the worktree, and leave
      the conflicted paths unstaged — the state git leaves you in. */
  async function writeConflicts(dir, files, conflicts) {
    for (const [path, meta] of files) {
      await GT.writeFile(dir, path, await P().readBlobText(dir, meta.oid));
      if (!conflicts.includes(path)) {
        await g().add({ ...GT.ctx(dir), filepath: path });
      }
    }
    await GT.flush();
  }

  /* ---------- amend ---------- */

  async function amend(dir, options = {}) {
    const head = await GT.resolve(dir, "HEAD");
    const old = (await g().readCommit({ ...GT.ctx(dir), oid: head })).commit;
    const branch = await GT.headRef(dir);
    const before = head;

    const oid = await g().commit({
      ...GT.ctx(dir),
      amend: true,
      message: options.message === undefined ? old.message : options.message,
      author: { name: old.author.name, email: old.author.email },
      committer: GT.author,
      ref: branch || "HEAD",
    });
    const subject = (options.message || old.message).split("\n")[0];
    await GT.appendReflog(dir, branch || "HEAD", before, oid, `commit (amend): ${subject}`);
    if (branch) await GT.appendReflog(dir, "HEAD", before, oid, `commit (amend): ${subject}`);
    await GT.flush();
    return oid;
  }

  /* ---------- rebase ----------

     The todo list is a real file (.git/rebase-merge/git-rebase-todo), the same
     one `git rebase -i` hands to your editor. The interactive lesson edits that
     file and then continues, which is exactly the real workflow.            */

  const TODO_DIR = "rebase-merge";

  /** Build the todo list `git rebase -i <upstream>` would show. */
  async function todoFor(dir, upstream, options = {}) {
    const upstreamOid = await P().revParse(dir, upstream);
    const head = await GT.resolve(dir, "HEAD");
    const entries = await P().revList(dir, {
      include: [head], exclude: [upstreamOid], reverse: true, firstParent: true,
    });
    let todo = entries.map((e) => ({
      command: "pick",
      oid: e.oid,
      subject: e.commit.message.split("\n")[0],
    }));
    if (options.autosquash) todo = autosquash(todo);
    return todo;
  }

  /** Move every `fixup!`/`squash!` commit directly below the commit it names,
      and change its command — what --autosquash does before your editor opens. */
  function autosquash(todo) {
    const out = [];
    const pending = [];
    for (const item of todo) {
      const match = item.subject.match(/^(fixup|squash)!\s+(.*)$/);
      if (match) pending.push({ ...item, command: match[1], target: match[2] });
      else out.push(item);
    }
    for (const item of pending) {
      const at = out.findIndex((o) =>
        o.subject === item.target || o.subject.startsWith(item.target));
      if (at === -1) {
        out.push({ ...item, command: "pick" }); // no target: leave it alone
        continue;
      }
      // Insert after the target and any fixups already attached to it.
      let insertAt = at + 1;
      while (insertAt < out.length && (out[insertAt].command === "fixup" || out[insertAt].command === "squash")) {
        insertAt++;
      }
      out.splice(insertAt, 0, item);
    }
    return out;
  }

  const serializeTodo = (todo) => todo.map((t) =>
    `${t.command} ${t.oid.slice(0, 7)} ${t.subject}`).join("\n") + "\n";

  function parseTodo(text, known) {
    const byShort = new Map((known || []).map((k) => [k.oid.slice(0, 7), k]));
    return text.split("\n")
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter(Boolean)
      .map((line) => {
        const [cmd, short, ...rest] = line.split(/\s+/);
        const command = { p: "pick", r: "reword", e: "edit", s: "squash", f: "fixup", d: "drop", x: "exec", b: "break" }[cmd] || cmd;
        if (command === "exec" || command === "break") {
          return { command, argument: [short, ...rest].join(" ") };
        }
        const match = byShort.get(short);
        return { command, oid: match ? match.oid : short, subject: rest.join(" ") };
      });
  }

  /**
   * rebase(dir, {onto, upstream, todo, message, autosquash})
   *
   * Replays the todo list onto `onto` (defaulting to `upstream`), then moves the
   * original branch to the result — the two halves of what rebase does, and the
   * reason the pre-rebase commits are still in the reflog afterwards.
   */
  async function rebase(dir, options = {}) {
    const branch = await GT.headRef(dir);
    const origHead = await GT.resolve(dir, "HEAD");
    const ontoOid = await P().revParse(dir, options.onto || options.upstream);
    const todo = options.todo ||
      await todoFor(dir, options.upstream, { autosquash: options.autosquash });

    await writeState(dir, "ORIG_HEAD", origHead + "\n");
    await writeState(dir, `${TODO_DIR}/git-rebase-todo`, serializeTodo(todo));
    await writeState(dir, `${TODO_DIR}/head-name`, (branch || "detached HEAD") + "\n");
    await writeState(dir, `${TODO_DIR}/onto`, ontoOid + "\n");
    await writeState(dir, `${TODO_DIR}/orig-head`, origHead + "\n");

    // Detach onto the new base, exactly as rebase does.
    await GT.setHead(dir, ontoOid, `rebase (start): checkout ${options.onto || options.upstream}`);

    let cur = ontoOid;
    const done = [];
    let squashMessages = [];

    for (const item of todo) {
      if (item.command === "drop") {
        done.push(item);
        continue;
      }
      if (item.command === "break") break;
      if (item.command === "exec") {
        if (options.onExec) {
          const result = await options.onExec(item.argument, cur);
          if (result === false) {
            return { stopped: "exec", argument: item.argument, oid: cur, done };
          }
        }
        done.push(item);
        continue;
      }

      if (item.command === "pick" || item.command === "reword" || item.command === "edit") {
        const result = await applyCommit(dir, cur, item.oid, {
          message: item.command === "reword" && item.message !== undefined
            ? item.message
            : undefined,
          reflog: `rebase (${item.command}): ${item.subject || ""}`.trim(),
          noUpdateBranch: true,
          theirsLabel: `${item.oid.slice(0, 7)} (${item.subject || ""})`,
        });
        if (result.conflicts) {
          await writeState(dir, `${TODO_DIR}/stopped-sha`, item.oid + "\n");
          await writeConflicts(dir, result.files, result.conflicts);
          return { conflicts: result.conflicts, oid: item.oid, done, onto: cur };
        }
        if (result.empty) {
          done.push(item);
          continue;
        }
        cur = result.oid;
        await GT.setHead(dir, cur, `rebase (${item.command}): ${item.subject || ""}`.trim());
        squashMessages = [(await g().readCommit({ ...GT.ctx(dir), oid: cur })).commit.message];
        done.push(item);
        continue;
      }

      if (item.command === "squash" || item.command === "fixup") {
        // Fold this commit into the one just built: same parent, combined tree.
        const parent = (await g().readCommit({ ...GT.ctx(dir), oid: cur })).commit.parent[0];
        const result = await applyCommit(dir, cur, item.oid, {
          allowConflicts: false,
          noUpdateBranch: true,
          message: "squashing",
          allowEmpty: true,
          theirsLabel: `${item.oid.slice(0, 7)} (${item.subject || ""})`,
        });
        if (result.conflicts) {
          await writeState(dir, `${TODO_DIR}/stopped-sha`, item.oid + "\n");
          await writeConflicts(dir, result.files, result.conflicts);
          return { conflicts: result.conflicts, oid: item.oid, done, onto: cur };
        }

        const folded = (await g().readCommit({ ...GT.ctx(dir), oid: item.oid })).commit;
        if (item.command === "squash") squashMessages.push(folded.message);

        const tree = await P().treeOfCommit(dir, result.oid);
        const message = options.message !== undefined
          ? options.message
          : squashMessages.join("\n").replace(/\n+$/, "") + "\n";

        const original = (await g().readCommit({ ...GT.ctx(dir), oid: cur })).commit;
        cur = await GT.commit(dir, {
          message,
          tree,
          parent: parent ? [parent] : [],
          author: {
            name: original.author.name,
            email: original.author.email,
            timestamp: original.author.timestamp,
            timezoneOffset: original.author.timezoneOffset,
          },
          committer: GT.author,
          noUpdateBranch: true,
        });
        await GT.setHead(dir, cur, `rebase (${item.command}): ${message.split("\n")[0]}`);
        done.push(item);
        continue;
      }

      return fail(`unknown rebase command: ${item.command}`);
    }

    // Put the branch back on the replayed history.
    if (branch) {
      await GT.updateRef(dir, branch, cur, `rebase (finish): returning to ${branch}`);
      await GT.setHead(dir, branch, `rebase (finish): returning to ${branch}`);
    }
    await P().checkoutFiles(dir, await P().filesOfCommit(dir, cur));
    await GT.rmrf(`${dir}/.git/${TODO_DIR}`);
    await GT.flush();
    return { oid: cur, done, rewrote: origHead };
  }

  async function rebaseAbort(dir) {
    const orig = (await readState(dir, `${TODO_DIR}/orig-head`) || "").trim();
    const name = (await readState(dir, `${TODO_DIR}/head-name`) || "").trim();
    if (!orig) return fail("No rebase in progress?");
    if (name.startsWith("refs/")) {
      await GT.updateRef(dir, name, orig, "rebase (abort): returning to " + name);
      await GT.setHead(dir, name, "rebase (abort): returning to " + name);
    } else {
      await GT.setHead(dir, orig, "rebase (abort)");
    }
    await P().checkoutFiles(dir, await P().filesOfCommit(dir, orig));
    await GT.rmrf(`${dir}/.git/${TODO_DIR}`);
    await GT.flush();
    return { oid: orig };
  }

  const rebaseInProgress = (dir) =>
    GT.exists(`${dir}/.git/${TODO_DIR}/git-rebase-todo`);

  /* ---------- bisect ----------

     git's own layout: BISECT_START, BISECT_LOG, refs/bisect/bad and
     refs/bisect/good-<oid>. The candidate set is "reachable from bad, not from
     any good", and each step halves it.                                     */

  async function bisectStart(dir, options = {}) {
    const head = await GT.headRef(dir);
    await writeState(dir, "BISECT_START",
      (head ? head.replace("refs/heads/", "") : await GT.resolve(dir, "HEAD")) + "\n");
    await writeState(dir, "BISECT_LOG", "git bisect start\n");
    if (options.bad) await bisectMark(dir, "bad", options.bad);
    if (options.good) await bisectMark(dir, "good", options.good);
    return bisectNext(dir);
  }

  async function bisectMark(dir, kind, rev) {
    const oid = await P().revParse(dir, rev || "HEAD");
    if (kind === "bad") await GT.updateRef(dir, "refs/bisect/bad", oid, "bisect bad");
    else if (kind === "good") await GT.updateRef(dir, `refs/bisect/good-${oid}`, oid, "bisect good");
    else if (kind === "skip") await GT.updateRef(dir, `refs/bisect/skip-${oid}`, oid, "bisect skip");
    const log = (await readState(dir, "BISECT_LOG")) || "";
    await writeState(dir, "BISECT_LOG",
      `${log}# ${kind}: [${oid}]\ngit bisect ${kind} ${oid}\n`);
    return bisectNext(dir);
  }

  async function bisectState(dir) {
    const bad = await GT.resolve(dir, "refs/bisect/bad");
    let names = [];
    try { names = await g().listRefs({ ...GT.ctx(dir), filepath: "refs/bisect" }); } catch { /* none */ }
    const good = [];
    const skip = [];
    for (const name of names) {
      const oid = await GT.resolve(dir, `refs/bisect/${name}`);
      if (name.startsWith("good-")) good.push(oid);
      if (name.startsWith("skip-")) skip.push(oid);
    }
    return { bad, good, skip, started: Boolean(await readState(dir, "BISECT_START")) };
  }

  /** The commits still worth testing, oldest first.
      The known-bad commit is excluded: its verdict is already in, so offering it
      again would leave the search stuck on one commit forever. */
  async function bisectCandidates(dir) {
    const { bad, good, skip } = await bisectState(dir);
    if (!bad || !good.length) return [];
    const entries = await P().revList(dir, {
      include: [bad], exclude: good, reverse: true, firstParent: false,
    });
    return entries
      .map((e) => e.oid)
      .filter((oid) => oid !== bad && !skip.includes(oid));
  }

  async function bisectNext(dir) {
    const candidates = await bisectCandidates(dir);
    const { bad, good } = await bisectState(dir);
    if (!bad || !good.length) return { needs: !bad ? "bad" : "good" };
    // Nothing left to test means the known-bad commit is the first bad one.
    if (!candidates.length) return { done: true, first: bad };
    const mid = candidates[Math.floor(candidates.length / 2)];
    await GT.setHead(dir, mid, `checkout: moving to ${mid.slice(0, 7)} (bisect)`);
    await P().checkoutFiles(dir, await P().filesOfCommit(dir, mid));
    // git reports how many candidates would be left after this test — roughly
    // half — not how many there are now.
    const remaining = Math.floor((candidates.length - 1) / 2);
    const steps = Math.max(0, Math.ceil(Math.log2(candidates.length)) - 1);
    return { testing: mid, remaining, steps };
  }

  async function bisectReset(dir) {
    const start = ((await readState(dir, "BISECT_START")) || "").trim();
    let names = [];
    try { names = await g().listRefs({ ...GT.ctx(dir), filepath: "refs/bisect" }); } catch { /* none */ }
    for (const name of names) {
      try { await g().deleteRef({ ...GT.ctx(dir), ref: `refs/bisect/${name}` }); } catch { /* gone */ }
    }
    await clearState(dir, "BISECT_START", "BISECT_LOG");
    if (start) {
      const ref = start.startsWith("refs/") ? start : `refs/heads/${start}`;
      if (await GT.resolve(dir, ref)) {
        await GT.setHead(dir, ref, `checkout: moving to ${start}`);
        await P().checkoutFiles(dir, await P().filesOfCommit(dir, await GT.resolve(dir, ref)));
      }
    }
    return { returnedTo: start };
  }

  /** `git bisect run`: drive the whole search with a predicate.
      test(oid) resolves true for "good". Returns the first bad commit. */
  async function bisectAuto(dir, good, bad, test) {
    const goodOid = await P().revParse(dir, good);
    const badOid = await P().revParse(dir, bad);
    const entries = await P().revList(dir, {
      include: [badOid], exclude: [goodOid], reverse: true,
    });
    const candidates = entries.map((e) => e.oid);
    if (!candidates.length) return null;

    // Binary search for the first commit that fails.
    let lo = 0;
    let hi = candidates.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (await test(candidates[mid])) lo = mid + 1;
      else hi = mid;
    }
    return candidates[lo];
  }

  /* ---------- fsck ----------

     Reachability from refs, and optionally from reflogs — the distinction that
     decides whether a "lost" commit is actually recoverable.                */

  async function reachableSet(dir, options = {}) {
    const roots = [];
    for (const ref of await P().allRefs(dir)) {
      if (ref.oid) roots.push(ref.oid);
    }
    if (options.includeReflogs) {
      for (const ref of ["HEAD", ...(await g().listRefs({ ...GT.ctx(dir), filepath: "refs/heads" }))
        .map((n) => `refs/heads/${n}`)]) {
        for (const entry of await GT.readReflog(dir, ref)) {
          if (entry.newOid && entry.newOid !== GT.ZERO) roots.push(entry.newOid);
          if (entry.oldOid && entry.oldOid !== GT.ZERO) roots.push(entry.oldOid);
        }
      }
    }

    const seen = new Set();
    const addTree = async (treeOid) => {
      if (!treeOid || seen.has(treeOid)) return;
      seen.add(treeOid);
      let tree;
      try {
        ({ tree } = await g().readTree({ ...GT.ctx(dir), oid: treeOid }));
      } catch { return; }
      for (const entry of tree) {
        if (entry.type === "tree") await addTree(entry.oid);
        else seen.add(entry.oid);
      }
    };

    for (const rootOid of roots) {
      for (const entry of await P().ancestors(dir, rootOid)) {
        if (seen.has(entry.oid)) continue;
        seen.add(entry.oid);
        await addTree(entry.commit.tree);
      }
    }
    return seen;
  }

  async function fsck(dir, options = {}) {
    const reachable = await reachableSet(dir, { includeReflogs: options.includeReflogs });
    const all = await P().looseObjects(dir);
    const stranded = [];
    for (const oid of all) {
      if (reachable.has(oid)) continue;
      let type = "unknown";
      try { type = await P().objectType(dir, oid); } catch { /* unreadable */ }
      stranded.push({ oid, type });
    }
    // git calls an object "dangling" when nothing points at it at all, and
    // "unreachable" when it's only reachable from other unreachable objects.
    const pointedAt = new Set();
    for (const { oid, type } of stranded) {
      if (type !== "commit") continue;
      try {
        const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
        for (const p of commit.parent) pointedAt.add(p);
      } catch { /* skip */ }
    }
    return {
      unreachable: stranded,
      dangling: stranded.filter((o) => !pointedAt.has(o.oid)),
      total: all.length,
      reachable: reachable.size,
    };
  }

  /* ---------- branches ---------- */

  /** Deleting a branch takes its reflog with it — which is precisely why
      `git branch -D` can lose work that `git reset` cannot. */
  async function deleteBranch(dir, name) {
    const ref = `refs/heads/${name}`;
    const oid = await GT.resolve(dir, ref);
    if (!oid) return fail(`branch '${name}' not found.`);
    await g().deleteBranch({ ...GT.ctx(dir), ref: name });
    try { await GT.pfs().unlink(`${dir}/.git/logs/${ref}`); } catch { /* none */ }
    await GT.flush();
    return { name, oid };
  }

  /* ---------- remotes ----------

     isomorphic-git only speaks HTTP and there is no server behind a static
     site, so a remote here is a second repository directory on the same
     filesystem. Transfer is a copy of the loose object files for the commit
     closure, then a ref update under the real rules: fast-forward unless
     forced, and --force-with-lease compared against the remote-tracking ref.
     Once the wire protocol's negotiation is over, this is what it does.     */

  async function remoteUrl(dir, remote = "origin") {
    const url = await g().getConfig({ ...GT.ctx(dir), path: `remote.${remote}.url` });
    if (!url) return fail(`'${remote}' does not appear to be a git repository`);
    return url;
  }

  async function copyObject(fromDir, toDir, oid) {
    const rel = `.git/objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
    if (await GT.exists(`${toDir}/${rel}`)) return false;
    let data;
    try {
      data = await GT.pfs().readFile(`${fromDir}/${rel}`);
    } catch {
      return false; // packed: this tutor never packs, so this shouldn't happen
    }
    await GT.mkdirp(`${toDir}/.git/objects/${oid.slice(0, 2)}`);
    await GT.pfs().writeFile(`${toDir}/${rel}`, data);
    return true;
  }

  /** Copy the commit closure of `oid` from one repo to the other. */
  async function transferObjects(fromDir, toDir, oid, haveOid) {
    const have = new Set();
    if (haveOid) {
      for (const entry of await P().ancestors(fromDir, haveOid)) have.add(entry.oid);
    }
    let copied = 0;
    const copyTree = async (treeOid) => {
      if (!(await copyObject(fromDir, toDir, treeOid))) return;
      copied++;
      const { tree } = await g().readTree({ ...GT.ctx(fromDir), oid: treeOid });
      for (const entry of tree) {
        if (entry.type === "tree") await copyTree(entry.oid);
        else if (await copyObject(fromDir, toDir, entry.oid)) copied++;
      }
    };
    for (const entry of await P().ancestors(fromDir, oid)) {
      if (have.has(entry.oid)) continue;
      if (await copyObject(fromDir, toDir, entry.oid)) copied++;
      await copyTree(entry.commit.tree);
    }
    await GT.flush();
    return copied;
  }

  function parseRefspec(spec, defaultBranch) {
    let s = spec || defaultBranch;
    let force = false;
    if (s.startsWith("+")) {
      force = true;
      s = s.slice(1);
    }
    const [src, dst] = s.includes(":") ? s.split(":") : [s, s];
    const full = (r) => (r.startsWith("refs/") ? r : `refs/heads/${r}`);
    return { force, src, dst: dst ? full(dst) : full(src) };
  }

  async function push(dir, options = {}) {
    const remote = options.remote || "origin";
    const url = await remoteUrl(dir, remote);
    const branch = (await GT.headRef(dir))?.replace("refs/heads/", "") || "HEAD";
    const spec = parseRefspec(options.refspec, branch);
    const force = options.force || spec.force;

    // Deleting a remote branch: `git push origin :old-branch`
    if (spec.src === "") {
      const existing = await GT.resolve(url, spec.dst);
      if (!existing) return fail(`unable to delete '${spec.dst}': remote ref does not exist`);
      await g().deleteRef({ ...GT.ctx(url), ref: spec.dst });
      try { await g().deleteRef({ ...GT.ctx(dir), ref: `refs/remotes/${remote}/${spec.dst.replace("refs/heads/", "")}` }); } catch { /* none */ }
      await GT.flush();
      return { deleted: spec.dst };
    }

    const localOid = await P().revParse(dir, spec.src);
    const remoteOid = await GT.resolve(url, spec.dst);
    const trackingRef = `refs/remotes/${remote}/${spec.dst.replace("refs/heads/", "")}`;

    if (options.forceWithLease !== undefined) {
      const expected = options.forceWithLease === true
        ? await GT.resolve(dir, trackingRef)
        : await P().revParse(dir, options.forceWithLease);
      if ((remoteOid || null) !== (expected || null)) {
        return fail(
          `! [rejected]        ${spec.src} -> ${spec.dst.replace("refs/heads/", "")} (stale info)\n` +
          `error: failed to push some refs to '${remote}'\n` +
          "hint: The remote has changed since you last fetched. Someone else may\n" +
          "hint: have pushed. Fetch and review their work before pushing again.");
      }
    } else if (remoteOid && !force && !(await P().isAncestor(dir, remoteOid, localOid))) {
      return fail(
        `! [rejected]        ${spec.src} -> ${spec.dst.replace("refs/heads/", "")} (non-fast-forward)\n` +
        `error: failed to push some refs to '${remote}'\n` +
        "hint: Updates were rejected because the tip of your current branch is behind\n" +
        "hint: its remote counterpart. Integrate the remote changes (e.g.\n" +
        "hint: 'git pull ...') before pushing again.");
    }

    const copied = await transferObjects(dir, url, localOid, remoteOid);
    await GT.updateRef(url, spec.dst, localOid, `push: ${localOid.slice(0, 7)}`);
    await GT.updateRef(dir, trackingRef, localOid, `push: fast-forward`);
    // Record the upstream, so @{u} works afterwards as it would in real git.
    const shortDst = spec.dst.replace("refs/heads/", "");
    await g().setConfig({ ...GT.ctx(dir), path: `branch.${shortDst}.remote`, value: remote });
    await g().setConfig({ ...GT.ctx(dir), path: `branch.${shortDst}.merge`, value: spec.dst });
    await GT.flush();
    return { objects: copied, oid: localOid, forced: Boolean(force), ref: spec.dst };
  }

  async function fetch(dir, options = {}) {
    const remote = options.remote || "origin";
    const url = await remoteUrl(dir, remote);
    const names = await g().listRefs({ ...GT.ctx(url), filepath: "refs/heads" });
    const updated = [];
    let copied = 0;
    for (const name of names) {
      const oid = await GT.resolve(url, `refs/heads/${name}`);
      const trackingRef = `refs/remotes/${remote}/${name}`;
      const before = await GT.resolve(dir, trackingRef);
      if (before === oid) continue;
      copied += await transferObjects(url, dir, oid, before);
      await GT.updateRef(dir, trackingRef, oid, `fetch ${remote}: storing head`);
      updated.push({ name, before, after: oid });
    }
    await writeState(dir, "FETCH_HEAD", updated
      .map((u) => `${u.after}\t\tbranch '${u.name}' of ${url}`).join("\n") + "\n");
    return { updated, objects: copied };
  }

  /* ---------- blame ----------

     Line provenance by walking history and diffing blobs. -M/-C follow lines
     that moved: if a line left one file and arrived in another in the same
     commit, the earlier file's history is the one that explains it.         */

  async function blame(dir, filepath, options = {}) {
    const head = await P().revParse(dir, options.rev || "HEAD");
    const entries = await P().revList(dir, { include: [head] });

    // Newest first: for each line of the current file, find the newest commit
    // whose version of the file first contained it in that position.
    const current = await fileAt(dir, head, filepath);
    if (current === null) return fail(`no such path ${filepath} in HEAD`);
    const lines = M().splitLines(current);
    const blamed = lines.map((text) => ({ text, oid: null, path: filepath }));

    let path = filepath;
    for (let i = 0; i < entries.length; i++) {
      const { oid, commit } = entries[i];
      const parentOid = commit.parent[0];
      const after = await fileAt(dir, oid, path);
      if (after === null) continue;
      let before = parentOid ? await fileAt(dir, parentOid, path) : null;

      // -M/-C: the file may have arrived here under a different name.
      let renamedFrom = null;
      if (before === null && parentOid && (options.followMoves || options.followCopies)) {
        renamedFrom = await findSource(dir, parentOid, oid, path, after);
        if (renamedFrom) before = await fileAt(dir, parentOid, renamedFrom);
      }

      const addedLines = new Set();
      const beforeLines = M().splitLines(before || "");
      const afterLines = M().splitLines(after);
      const pairs = M().lcsPairs(beforeLines, afterLines);
      const kept = new Set(pairs.map(([, j]) => j));
      afterLines.forEach((_, j) => { if (!kept.has(j)) addedLines.add(j); });

      // Attribute any still-unblamed line that this commit introduced.
      for (const j of addedLines) {
        const line = afterLines[j];
        const slot = blamed.find((b) => b.oid === null && b.text === line);
        if (slot) {
          slot.oid = oid;
          slot.commit = commit;
          slot.path = path;
        }
      }
      if (renamedFrom) path = renamedFrom;
      if (blamed.every((b) => b.oid)) break;
    }
    return blamed;
  }

  async function fileAt(dir, commitOid, filepath) {
    try {
      const files = await P().filesOfCommit(dir, commitOid);
      const meta = files.get(filepath);
      if (!meta) return null;
      return P().readBlobText(dir, meta.oid);
    } catch {
      return null;
    }
  }

  /** Which path did this content come from in the parent commit? */
  async function findSource(dir, parentOid, oid, path, contents) {
    const before = await P().filesOfCommit(dir, parentOid);
    const after = await P().filesOfCommit(dir, oid);
    let best = null;
    let bestScore = 0;
    const lines = new Set(M().splitLines(contents));
    for (const [candidate, meta] of before) {
      if (after.has(candidate) && candidate !== path) continue; // still there: not a rename
      if (candidate === path) continue;
      const text = await P().readBlobText(dir, meta.oid);
      const candidateLines = M().splitLines(text);
      if (!candidateLines.length) continue;
      const shared = candidateLines.filter((l) => lines.has(l)).length;
      const score = shared / candidateLines.length;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return bestScore >= 0.5 ? best : null;
  }

  /* ---------- pickaxe ----------

     -S counts occurrences of a fixed string and reports commits where the count
     changed. -G matches a regex against the diff itself. The difference is the
     whole lesson: -S finds where a string was introduced or removed, -G finds
     every commit that touched a line mentioning it.                         */

  async function pickaxe(dir, options = {}) {
    const { string: needle, regex, path } = options;
    const head = await P().revParse(dir, options.rev || "HEAD");
    const entries = await P().revList(dir, { include: [head] });
    const hits = [];

    for (const { oid, commit } of entries) {
      const parentOid = commit.parent[0];
      const after = await P().filesOfCommit(dir, oid);
      const before = parentOid ? await P().filesOfCommit(dir, parentOid) : new Map();
      const paths = path ? [path] : [...new Set([...before.keys(), ...after.keys()])];

      for (const p of paths) {
        const a = before.get(p);
        const b = after.get(p);
        if (a && b && a.oid === b.oid) continue;
        const oldText = a ? await P().readBlobText(dir, a.oid) : "";
        const newText = b ? await P().readBlobText(dir, b.oid) : "";

        if (needle !== undefined) {
          const oldCount = M().countOccurrences(oldText, needle);
          const newCount = M().countOccurrences(newText, needle);
          if (oldCount !== newCount) {
            hits.push({ oid, commit, path: p, oldCount, newCount });
          }
        } else if (regex !== undefined) {
          const diff = M().unifiedDiff(oldText, newText, { path: p });
          const re = new RegExp(regex);
          const touched = diff.split("\n")
            .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
            .some((l) => re.test(l.slice(1)));
          if (touched) hits.push({ oid, commit, path: p });
        }
      }
    }
    return hits;
  }

  root.GTPorc = {
    GitError,
    // state files
    writeState,
    readState,
    clearState,
    // history rewriting
    reset,
    revParseReflog,
    replayTree,
    applyCommit,
    cherryPick,
    revert,
    amend,
    rebase,
    rebaseAbort,
    rebaseInProgress,
    todoFor,
    autosquash,
    serializeTodo,
    parseTodo,
    // forensics
    bisectStart,
    bisectMark,
    bisectNext,
    bisectReset,
    bisectState,
    bisectCandidates,
    bisectAuto,
    fsck,
    reachableSet,
    blame,
    pickaxe,
    fileAt,
    // branches and remotes
    deleteBranch,
    remoteUrl,
    push,
    fetch,
    transferObjects,
    parseRefspec,
  };
})(typeof window === "undefined" ? globalThis : window);
