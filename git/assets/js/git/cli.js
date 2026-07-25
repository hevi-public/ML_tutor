/* Git Tutor — the command line.  window.GTCli

   Turns a typed line into engine calls and git-shaped output. Two rules govern
   this file:

     1. Output copies git's real wording, including its errors and hints. The
        error message is often the lesson ("Updates were rejected because…"), so
        paraphrasing it would waste the best teaching material there is.
     2. Anything not implemented says so. A command that quietly did nothing —
        or worse, faked success — would teach the learner something false. The
        fallback line is
          git: '<x>' is supported by real git but not by this sandbox.
        and it is the honesty valve for the whole tutor.

   Commands that need an editor (rebase -i, commit without -m, edit <file>)
   return an `action` for terminal.js to open, then call back in. That mirrors
   git shelling out to $EDITOR — and it means the interactive-rebase lesson
   really does edit .git/rebase-merge/git-rebase-todo.                        */
(function (root) {
  "use strict";

  const GT = root.GT;
  const P = () => root.GTPlumb;
  const Porc = () => root.GTPorc;
  const M = () => root.GTMerge;
  const g = () => root.git;

  const short = (oid) => (oid ? oid.slice(0, 7) : "");
  const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
  const err = (stderr, code = 1) => ({ code, stdout: "", stderr });

  /* ---------- tokenizer ---------- */

  function tokenize(line) {
    const out = [];
    let cur = "";
    let quote = null;
    let had = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
        else cur += ch;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        had = true;
        continue;
      }
      if (ch === "\\" && i + 1 < line.length) {
        cur += line[++i];
        continue;
      }
      if (/\s/.test(ch)) {
        if (cur || had) out.push(cur);
        cur = "";
        had = false;
        continue;
      }
      cur += ch;
    }
    if (cur || had) out.push(cur);
    return out;
  }

  /** Split argv into flags and positionals. `withValue` names the options that
      consume the next token, so `-m "msg"` and `--onto main` work. */
  function parseArgs(argv, withValue = []) {
    const flags = new Map();
    const rest = [];
    const paths = [];
    let afterDashDash = false;
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (afterDashDash) {
        paths.push(arg);
        continue;
      }
      if (arg === "--") {
        afterDashDash = true;
        continue;
      }
      if (arg.startsWith("--")) {
        const eq = arg.indexOf("=");
        if (eq !== -1) {
          flags.set(arg.slice(2, eq), arg.slice(eq + 1));
        } else {
          const name = arg.slice(2);
          flags.set(name, withValue.includes(arg) ? argv[++i] : true);
        }
        continue;
      }
      if (arg.startsWith("-") && arg.length > 1 && !/^-\d/.test(arg)) {
        // Bundled short flags: -am is -a -m
        const letters = arg.slice(1).split("");
        for (let j = 0; j < letters.length; j++) {
          const flag = `-${letters[j]}`;
          if (withValue.includes(flag)) {
            const inline = arg.slice(2 + j);
            flags.set(letters[j], inline || argv[++i]);
            break;
          }
          flags.set(letters[j], true);
        }
        continue;
      }
      rest.push(arg);
    }
    return { flags, rest, paths };
  }

  /* ---------- shared formatting ---------- */

  function formatPerson(p) {
    const date = new Date(p.timestamp * 1000);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const pad = (n) => String(n).padStart(2, "0");
    return `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ` +
      `${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:` +
      `${pad(date.getUTCSeconds())} ${date.getUTCFullYear()} ` +
      GT.tzOffsetString(p.timezoneOffset);
  }

  async function refDecorations(dir, oid) {
    const refs = await P().allRefs(dir);
    const head = refs.find((r) => r.full === "HEAD");
    const names = [];
    if (head && head.oid === oid) {
      names.push(head.detached
        ? "HEAD"
        : `HEAD -> ${head.points.replace("refs/heads/", "")}`);
    }
    for (const ref of refs) {
      if (ref.full === "HEAD" || ref.oid !== oid) continue;
      // "HEAD -> main" already names the branch; git doesn't repeat it.
      if (head && !head.detached && ref.full === head.points) continue;
      if (ref.kind === "branch") names.push(ref.name);
      else if (ref.kind === "tag") names.push(`tag: ${ref.name}`);
      else if (ref.kind === "remote") names.push(ref.name);
    }
    return names.length ? ` (${names.join(", ")})` : "";
  }

  /* ---------- status ---------- */

  async function statusRows(dir) {
    const matrix = await g().statusMatrix(GT.ctx(dir));
    const staged = [];
    const unstaged = [];
    const untracked = [];
    for (const [filepath, head, workdir, stage] of matrix) {
      if (head === 0 && workdir === 2 && stage === 0) {
        untracked.push(filepath);
        continue;
      }
      if (stage !== head) {
        staged.push({
          filepath,
          kind: head === 0 ? "new file" : stage === 0 ? "deleted" : "modified",
        });
      }
      if (workdir !== stage) {
        unstaged.push({
          filepath,
          kind: workdir === 0 ? "deleted" : "modified",
        });
      }
    }
    return { staged, unstaged, untracked };
  }

  async function stateBanner(dir) {
    const lines = [];
    if (await Porc().rebaseInProgress(dir)) {
      const onto = ((await Porc().readState(dir, "rebase-merge/onto")) || "").trim();
      lines.push(`interactive rebase in progress; onto ${short(onto)}`);
    }
    if (await Porc().readState(dir, "CHERRY_PICK_HEAD")) {
      lines.push("You are currently cherry-picking.");
    }
    if (await Porc().readState(dir, "BISECT_START")) {
      lines.push("You are currently bisecting.");
    }
    return lines;
  }

  /* ---------- the command table ---------- */

  const COMMANDS = {};
  const define = (name, spec) => { COMMANDS[name] = { name, ...spec }; };

  define("init", {
    summary: "create an empty repository",
    async run(ctx) {
      await g().init({ ...GT.ctx(ctx.dir), defaultBranch: "main" });
      return ok(`Initialized empty Git repository in ${ctx.dir}/.git/\n`);
    },
  });

  define("status", {
    summary: "show the working tree status",
    async run(ctx) {
      const { dir } = ctx;
      const { flags } = parseArgs(ctx.argv);
      const branch = await GT.headRef(dir);
      const { staged, unstaged, untracked } = await statusRows(dir);

      if (flags.get("s") || flags.get("short")) {
        const lines = [];
        for (const f of staged) lines.push(`${f.kind === "new file" ? "A" : f.kind === "deleted" ? "D" : "M"}  ${f.filepath}`);
        for (const f of unstaged) lines.push(` ${f.kind === "deleted" ? "D" : "M"} ${f.filepath}`);
        for (const f of untracked) lines.push(`?? ${f}`);
        return ok(lines.length ? lines.join("\n") + "\n" : "");
      }

      const out = [];
      if (branch) out.push(`On branch ${branch.replace("refs/heads/", "")}`);
      else out.push(`HEAD detached at ${short(await GT.resolve(dir, "HEAD"))}`);
      out.push(...(await stateBanner(dir)));

      const upstream = branch
        ? await P().upstreamOf(dir, branch.replace("refs/heads/", ""))
        : null;
      if (upstream) {
        const local = await GT.resolve(dir, branch);
        const remote = await GT.resolve(dir, upstream);
        const name = upstream.replace("refs/remotes/", "");
        if (local === remote) out.push(`Your branch is up to date with '${name}'.`);
        else {
          const ahead = (await P().revList(dir, { include: [local], exclude: [remote] })).length;
          const behind = (await P().revList(dir, { include: [remote], exclude: [local] })).length;
          if (ahead && behind) {
            out.push(`Your branch and '${name}' have diverged,`);
            out.push(`and have ${ahead} and ${behind} different commits each, respectively.`);
          } else if (ahead) {
            out.push(`Your branch is ahead of '${name}' by ${ahead} commit${ahead > 1 ? "s" : ""}.`);
          } else {
            out.push(`Your branch is behind '${name}' by ${behind} commit${behind > 1 ? "s" : ""}, and can be fast-forwarded.`);
          }
        }
      }
      out.push("");

      if (staged.length) {
        out.push("Changes to be committed:");
        out.push('  (use "git restore --staged <file>..." to unstage)');
        for (const f of staged) out.push(`\t${f.kind}:   ${f.filepath}`);
        out.push("");
      }
      if (unstaged.length) {
        out.push("Changes not staged for commit:");
        out.push('  (use "git add <file>..." to update what will be committed)');
        for (const f of unstaged) out.push(`\t${f.kind}:   ${f.filepath}`);
        out.push("");
      }
      if (untracked.length) {
        out.push("Untracked files:");
        out.push('  (use "git add <file>..." to include in what will be committed)');
        for (const f of untracked) out.push(`\t${f}`);
        out.push("");
      }
      if (!staged.length && !unstaged.length && !untracked.length) {
        out.push("nothing to commit, working tree clean");
      }
      return ok(out.join("\n") + "\n");
    },
  });

  define("add", {
    summary: "stage changes",
    complete: (ctx) => ctx.worktree,
    async run(ctx) {
      const { rest } = parseArgs(ctx.argv, ["--"]);
      const targets = rest.length ? rest : ["."];
      let count = 0;
      for (const target of targets) {
        if (target === "." || target === "-A" || target === "*") {
          const matrix = await g().statusMatrix(GT.ctx(ctx.dir));
          for (const [filepath, , workdir, stage] of matrix) {
            if (workdir === stage) continue;
            if (workdir === 0) await g().remove({ ...GT.ctx(ctx.dir), filepath });
            else await g().add({ ...GT.ctx(ctx.dir), filepath });
            count++;
          }
          continue;
        }
        if (!(await GT.exists(`${ctx.dir}/${target}`))) {
          return err(`fatal: pathspec '${target}' did not match any files\n`);
        }
        await g().add({ ...GT.ctx(ctx.dir), filepath: target });
        count++;
      }
      await GT.flush();
      return ok(count ? "" : "");
    },
  });

  define("rm", {
    summary: "remove a file from the worktree and the index",
    complete: (ctx) => ctx.tracked,
    async run(ctx) {
      const { rest, flags } = parseArgs(ctx.argv);
      const out = [];
      for (const path of rest) {
        if (!flags.get("cached")) await GT.removeFile(ctx.dir, path);
        await g().remove({ ...GT.ctx(ctx.dir), filepath: path });
        out.push(`rm '${path}'`);
      }
      await GT.flush();
      return ok(out.join("\n") + "\n");
    },
  });

  define("mv", {
    summary: "move or rename a file",
    complete: (ctx) => ctx.tracked,
    async run(ctx) {
      const { rest } = parseArgs(ctx.argv);
      const [from, to] = rest;
      if (!from || !to) return err("usage: git mv <source> <destination>\n");
      const body = await GT.readFile(ctx.dir, from);
      await GT.writeFile(ctx.dir, to, body);
      await GT.removeFile(ctx.dir, from);
      await g().remove({ ...GT.ctx(ctx.dir), filepath: from });
      await g().add({ ...GT.ctx(ctx.dir), filepath: to });
      await GT.flush();
      return ok("");
    },
  });

  define("commit", {
    summary: "record staged changes",
    async run(ctx) {
      const { flags } = parseArgs(ctx.argv, ["-m", "--message", "--fixup", "--squash"]);
      const { dir } = ctx;
      const amend = flags.get("amend");
      let message = flags.get("m") || flags.get("message");

      if (flags.get("fixup") || flags.get("squash")) {
        const target = flags.get("fixup") || flags.get("squash");
        const oid = await P().revParse(dir, target);
        const subject = (await g().readCommit({ ...GT.ctx(dir), oid })).commit
          .message.split("\n")[0];
        message = `${flags.get("fixup") ? "fixup" : "squash"}! ${subject}`;
      }

      if (flags.get("a") || flags.get("all")) {
        const matrix = await g().statusMatrix(GT.ctx(dir));
        for (const [filepath, head, workdir, stage] of matrix) {
          if (head === 0 && stage === 0) continue; // untracked: -a skips these
          if (workdir === stage) continue;
          if (workdir === 0) await g().remove({ ...GT.ctx(dir), filepath });
          else await g().add({ ...GT.ctx(dir), filepath });
        }
      }

      if (!message && !amend) {
        // git would open $EDITOR; the terminal opens a box and calls back.
        return { code: 0, stdout: "", stderr: "", action: { kind: "message", command: ctx.argv } };
      }

      if (amend) {
        const oid = await Porc().amend(dir, message === undefined ? {} : { message });
        const subject = (await g().readCommit({ ...GT.ctx(dir), oid })).commit.message.split("\n")[0];
        const branch = (await GT.headRef(dir))?.replace("refs/heads/", "") || "HEAD detached";
        return ok(`[${branch} ${short(oid)}] ${subject}\n`);
      }

      const { staged } = await statusRows(dir);
      if (!staged.length && !flags.get("allow-empty")) {
        const status = await COMMANDS.status.run({ ...ctx, argv: [] });
        return err(status.stdout.replace(/^/m, "") +
          '\nnothing added to commit but untracked files present (use "git add" to track)\n');
      }

      const oid = await GT.commit(dir, { message });
      const branch = (await GT.headRef(dir))?.replace("refs/heads/", "") || "HEAD detached";
      const files = staged.length;
      return ok(`[${branch} ${short(oid)}] ${message.split("\n")[0]}\n` +
        ` ${files} file${files === 1 ? "" : "s"} changed\n`);
    },
  });

  /* ---------- log and friends ---------- */

  async function logEntries(ctx) {
    const { dir } = ctx;
    const { flags, rest, paths } = parseArgs(ctx.argv,
      ["-n", "--max-count", "-S", "-G", "--grep", "--format", "--pretty", "-L"]);

    if (flags.get("S") !== undefined || flags.get("G") !== undefined) {
      const hits = await Porc().pickaxe(dir, {
        string: flags.get("S") === undefined ? undefined : flags.get("S"),
        regex: flags.get("G") === undefined ? undefined : flags.get("G"),
        path: paths[0] || rest.find((r) => r.includes(".")),
        rev: rest.find((r) => !r.includes(".")) || "HEAD",
      });
      return { entries: hits, flags, pickaxe: true };
    }

    const revs = rest.length ? rest : ["HEAD"];
    const range = await P().parseRange(dir, flags.get("all")
      ? (await P().allRefs(dir)).filter((r) => r.oid && r.kind !== "head").map((r) => r.full)
      : revs);
    let entries = await P().revList(dir, {
      ...range,
      firstParent: Boolean(flags.get("first-parent")),
    });
    const grep = flags.get("grep");
    if (grep) entries = entries.filter((e) => e.commit.message.includes(grep));
    const limit = Number(flags.get("n") || flags.get("max-count") || 0);
    if (limit) entries = entries.slice(0, limit);
    return { entries, flags };
  }

  define("log", {
    summary: "show commit history",
    async run(ctx) {
      const { dir } = ctx;
      const { entries, flags, pickaxe } = await logEntries(ctx);
      if (!entries.length) return ok("");

      const oneline = flags.get("oneline");
      const graph = flags.get("graph");
      const out = [];

      for (const entry of entries) {
        const { oid, commit } = entry;
        const decoration = await refDecorations(dir, oid);
        const subject = commit.message.split("\n")[0];
        if (oneline) {
          out.push(`${graph ? "* " : ""}${short(oid)}${decoration} ${subject}`);
          continue;
        }
        out.push(`${graph ? "* " : ""}commit ${oid}${decoration}`);
        if (commit.parent.length > 1) {
          out.push(`Merge: ${commit.parent.map(short).join(" ")}`);
        }
        out.push(`Author: ${commit.author.name} <${commit.author.email}>`);
        out.push(`Date:   ${formatPerson(commit.author)}`);
        out.push("");
        for (const line of commit.message.replace(/\n+$/, "").split("\n")) {
          out.push(`    ${line}`);
        }
        out.push("");
        if (pickaxe && entry.oldCount !== undefined) {
          out.push(`    [${entry.path}: ${entry.oldCount} → ${entry.newCount} occurrence(s)]`);
          out.push("");
        }
        if (flags.get("p") || flags.get("patch")) {
          out.push(await diffCommit(dir, oid));
        }
        if (flags.get("stat")) {
          out.push(await statCommit(dir, oid));
        }
      }
      return ok(out.join("\n") + "\n");
    },
  });

  async function diffFiles(dir, beforeFiles, afterFiles, only) {
    const paths = [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])].sort();
    const out = [];
    for (const path of paths) {
      if (only && only.length && !only.includes(path)) continue;
      const a = beforeFiles.get(path);
      const b = afterFiles.get(path);
      if (a && b && a.oid === b.oid) continue;
      const oldText = a ? await P().readBlobText(dir, a.oid) : "";
      const newText = b ? await P().readBlobText(dir, b.oid) : "";
      out.push(M().unifiedDiff(oldText, newText, {
        path, oldMissing: !a, newMissing: !b,
      }));
    }
    return out.join("");
  }

  async function diffCommit(dir, oid) {
    const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
    const before = commit.parent[0]
      ? await P().filesOfCommit(dir, commit.parent[0])
      : new Map();
    return diffFiles(dir, before, await P().filesOfCommit(dir, oid));
  }

  async function statCommit(dir, oid) {
    const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
    const before = commit.parent[0] ? await P().filesOfCommit(dir, commit.parent[0]) : new Map();
    const after = await P().filesOfCommit(dir, oid);
    const rows = [];
    let changed = 0;
    for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const a = before.get(path);
      const b = after.get(path);
      if (a && b && a.oid === b.oid) continue;
      changed++;
      rows.push(` ${path}`);
    }
    return rows.join("\n") + `\n ${changed} file${changed === 1 ? "" : "s"} changed\n`;
  }

  define("show", {
    summary: "show a commit or object",
    async run(ctx) {
      const { dir } = ctx;
      const { rest } = parseArgs(ctx.argv);
      const spec = rest[0] || "HEAD";
      // `git show HEAD:path` prints the file as of that commit.
      if (spec.includes(":") && !spec.startsWith(":/")) {
        const [rev, path] = spec.split(":");
        const files = await P().filesOfCommit(dir, await P().revParse(dir, rev || "HEAD"));
        const meta = files.get(path);
        if (!meta) return err(`fatal: path '${path}' does not exist in '${rev}'\n`);
        return ok(await P().readBlobText(dir, meta.oid));
      }
      const oid = await P().revParse(dir, spec);
      const type = await P().objectType(dir, oid);
      if (type !== "commit") return ok(await P().catFilePretty(dir, oid));
      const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
      const out = [
        `commit ${oid}${await refDecorations(dir, oid)}`,
        `Author: ${commit.author.name} <${commit.author.email}>`,
        `Date:   ${formatPerson(commit.author)}`,
        "",
        ...commit.message.replace(/\n+$/, "").split("\n").map((l) => `    ${l}`),
        "",
      ];
      return ok(out.join("\n") + (await diffCommit(dir, oid)));
    },
  });

  define("diff", {
    summary: "show changes",
    async run(ctx) {
      const { dir } = ctx;
      const { flags, rest, paths } = parseArgs(ctx.argv);
      const only = paths.length ? paths : [];

      if (rest.length >= 2) {
        const a = await P().revParse(dir, rest[0]);
        const b = await P().revParse(dir, rest[1]);
        return ok(await diffFiles(dir, await P().filesOfCommit(dir, a),
          await P().filesOfCommit(dir, b), only));
      }
      if (rest.length === 1 && rest[0].includes("..")) {
        const range = rest[0].split("..");
        const a = await P().revParse(dir, range[0]);
        const b = await P().revParse(dir, range[1] || "HEAD");
        return ok(await diffFiles(dir, await P().filesOfCommit(dir, a),
          await P().filesOfCommit(dir, b), only));
      }

      const headOid = await GT.resolve(dir, "HEAD");
      const headFiles = headOid ? await P().filesOfCommit(dir, headOid) : new Map();

      if (flags.get("staged") || flags.get("cached")) {
        // index vs HEAD
        const staged = new Map();
        for (const filepath of await g().listFiles(GT.ctx(dir))) {
          const oid = await indexOid(dir, filepath);
          if (oid) staged.set(filepath, { oid, mode: "100644" });
        }
        return ok(await diffFiles(dir, headFiles, staged, only));
      }

      // worktree vs index
      const out = [];
      const matrix = await g().statusMatrix(GT.ctx(dir));
      for (const [filepath, , workdir, stage] of matrix) {
        if (workdir === stage) continue;
        if (only.length && !only.includes(filepath)) continue;
        const stagedOid = stage ? await indexOid(dir, filepath) : null;
        const oldText = stagedOid ? await P().readBlobText(dir, stagedOid) : "";
        let newText = "";
        try { newText = await GT.readFile(dir, filepath); } catch { /* deleted */ }
        out.push(M().unifiedDiff(oldText, newText, {
          path: filepath, oldMissing: !stagedOid, newMissing: workdir === 0,
        }));
      }
      return ok(out.join(""));
    },
  });

  async function indexOid(dir, filepath) {
    // isomorphic-git has no "read one index entry" call; walking STAGE does it.
    const [entry] = await g().walk({
      ...GT.ctx(dir),
      trees: [g().STAGE()],
      map: async (path, [stage]) =>
        path === filepath && stage ? await stage.oid() : undefined,
    });
    return entry || null;
  }

  /* ---------- branches, tags, checkout ---------- */

  define("branch", {
    summary: "list, create or delete branches",
    complete: (ctx) => ctx.branches,
    async run(ctx) {
      const { dir } = ctx;
      const { flags, rest } = parseArgs(ctx.argv, ["-m", "--move"]);

      const del = flags.get("d") || flags.get("D") || flags.get("delete");
      if (del) {
        const name = rest[0];
        const result = await Porc().deleteBranch(dir, name);
        return ok(`Deleted branch ${name} (was ${short(result.oid)}).\n`);
      }

      if (rest.length) {
        const [name, start] = rest;
        const oid = await P().revParse(dir, start || "HEAD");
        if (await GT.resolve(dir, `refs/heads/${name}`)) {
          return err(`fatal: a branch named '${name}' already exists\n`);
        }
        await GT.updateRef(dir, `refs/heads/${name}`, oid, `branch: Created from ${start || "HEAD"}`);
        return ok("");
      }

      const head = await GT.headRef(dir);
      const names = await g().listRefs({ ...GT.ctx(dir), filepath: "refs/heads" });
      const lines = [];
      if (head === null) {
        lines.push(`* (HEAD detached at ${short(await GT.resolve(dir, "HEAD"))})`);
      }
      for (const name of names.sort()) {
        const current = head === `refs/heads/${name}`;
        let line = `${current ? "* " : "  "}${name}`;
        if (flags.get("v") || flags.get("verbose")) {
          const oid = await GT.resolve(dir, `refs/heads/${name}`);
          const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
          line += ` ${short(oid)} ${commit.message.split("\n")[0]}`;
        }
        lines.push(line);
      }
      if (flags.get("a") || flags.get("all")) {
        let remotes = [];
        try { remotes = await g().listRefs({ ...GT.ctx(dir), filepath: "refs/remotes" }); } catch { /* none */ }
        for (const name of remotes.sort()) lines.push(`  remotes/${name}`);
      }
      return ok(lines.join("\n") + "\n");
    },
  });

  async function doCheckout(ctx, spec, options = {}) {
    const { dir } = ctx;
    const out = [];
    if (options.create) {
      const oid = await P().revParse(dir, options.startPoint || "HEAD");
      await GT.updateRef(dir, `refs/heads/${spec}`, oid, `branch: Created from ${options.startPoint || "HEAD"}`);
      await GT.setHead(dir, `refs/heads/${spec}`, `checkout: moving to ${spec}`);
      await P().checkoutFiles(dir, await P().filesOfCommit(dir, oid));
      return ok(`Switched to a new branch '${spec}'\n`);
    }

    const isBranch = Boolean(await GT.resolve(dir, `refs/heads/${spec}`));
    const oid = await P().revParse(dir, spec);

    if (isBranch && !options.detach) {
      await GT.setHead(dir, `refs/heads/${spec}`, `checkout: moving to ${spec}`);
      await P().checkoutFiles(dir, await P().filesOfCommit(dir, oid));
      out.push(`Switched to branch '${spec}'`);
      const upstream = await P().upstreamOf(dir, spec);
      if (upstream) {
        const local = await GT.resolve(dir, `refs/heads/${spec}`);
        const remote = await GT.resolve(dir, upstream);
        if (local === remote) {
          out.push(`Your branch is up to date with '${upstream.replace("refs/remotes/", "")}'.`);
        }
      }
      return ok(out.join("\n") + "\n");
    }

    await GT.setHead(dir, oid, `checkout: moving to ${spec}`);
    await P().checkoutFiles(dir, await P().filesOfCommit(dir, oid));
    const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
    return ok([
      "Note: switching to '" + spec + "'.",
      "",
      "You are in 'detached HEAD' state. You can look around, make experimental",
      "changes and commit them, and you can discard any commits you make in this",
      "state without impacting any branches by switching back to a branch.",
      "",
      `HEAD is now at ${short(oid)} ${commit.message.split("\n")[0]}`,
      "",
    ].join("\n"));
  }

  define("checkout", {
    summary: "switch branches or restore files",
    complete: (ctx) => [...ctx.branches, ...ctx.worktree],
    async run(ctx) {
      const { dir } = ctx;
      const { flags, rest, paths } = parseArgs(ctx.argv, ["-b", "-B"]);

      // Restoring paths, not switching branches.
      if (paths.length || (rest.length > 1 && !flags.get("b"))) {
        const targets = paths.length ? paths : rest.slice(1);
        const rev = paths.length ? (rest[0] || "HEAD") : rest[0];
        const files = await P().filesOfCommit(dir, await P().revParse(dir, rev));
        for (const path of targets) {
          const meta = files.get(path);
          if (!meta) return err(`error: pathspec '${path}' did not match any file(s) known to git\n`);
          await GT.writeFile(dir, path, await P().readBlobText(dir, meta.oid));
          await g().add({ ...GT.ctx(dir), filepath: path });
        }
        return ok("");
      }

      const create = flags.get("b") || flags.get("B");
      if (create) {
        return doCheckout(ctx, typeof create === "string" ? create : rest[0],
          { create: true, startPoint: rest[0] });
      }
      const spec = rest[0];
      if (!spec) return err("fatal: you must specify a branch name\n");
      if (spec === "-") {
        const entries = await GT.readReflog(dir, "HEAD");
        const previous = entries.find((e) => e.message.startsWith("checkout: moving to"));
        if (!previous) return err("fatal: no previous branch\n");
        return doCheckout(ctx, previous.message.split(" ").pop());
      }
      return doCheckout(ctx, spec, { detach: Boolean(flags.get("detach")) });
    },
  });

  define("switch", {
    summary: "switch branches",
    complete: (ctx) => ctx.branches,
    async run(ctx) {
      const { flags, rest } = parseArgs(ctx.argv, ["-c", "-C"]);
      const create = flags.get("c") || flags.get("C");
      if (create) {
        return doCheckout(ctx, typeof create === "string" ? create : rest[0],
          { create: true, startPoint: rest[0] });
      }
      if (flags.get("detach")) return doCheckout(ctx, rest[0], { detach: true });
      return doCheckout(ctx, rest[0]);
    },
  });

  define("tag", {
    summary: "create or list tags",
    async run(ctx) {
      const { dir } = ctx;
      const { flags, rest } = parseArgs(ctx.argv, ["-m", "-d"]);
      if (flags.get("d")) {
        const name = typeof flags.get("d") === "string" ? flags.get("d") : rest[0];
        await g().deleteRef({ ...GT.ctx(dir), ref: `refs/tags/${name}` });
        return ok(`Deleted tag '${name}'\n`);
      }
      if (!rest.length) {
        let names = [];
        try { names = await g().listRefs({ ...GT.ctx(dir), filepath: "refs/tags" }); } catch { /* none */ }
        return ok(names.sort().join("\n") + (names.length ? "\n" : ""));
      }
      const [name, start] = rest;
      const oid = await P().revParse(dir, start || "HEAD");
      if (flags.get("a") || flags.get("m")) {
        // An annotated tag is its own object — the point of the lesson.
        await g().annotatedTag({
          ...GT.ctx(dir),
          ref: name,
          message: flags.get("m") || name,
          object: oid,
          tagger: GT.author,
        });
      } else {
        await GT.updateRef(dir, `refs/tags/${name}`, oid, `tag: ${name}`);
      }
      return ok("");
    },
  });

  /* ---------- rewriting ---------- */

  define("reset", {
    summary: "move HEAD, and optionally the index and worktree",
    async run(ctx) {
      const { flags, rest, paths } = parseArgs(ctx.argv);
      const { dir } = ctx;

      if (paths.length) {
        for (const path of paths) {
          await g().resetIndex({ ...GT.ctx(dir), filepath: path, ref: rest[0] || "HEAD" });
        }
        return ok("");
      }

      const mode = flags.get("soft") ? "soft"
        : flags.get("hard") ? "hard"
          : flags.get("mixed") ? "mixed" : "mixed";
      const rev = rest[0] || "HEAD";
      const result = await Porc().reset(dir, rev, { mode });
      if (mode === "hard") {
        const { commit } = await g().readCommit({ ...GT.ctx(dir), oid: result.target });
        return ok(`HEAD is now at ${short(result.target)} ${commit.message.split("\n")[0]}\n`);
      }
      const { unstaged } = await statusRows(dir);
      if (mode === "mixed" && unstaged.length) {
        return ok("Unstaged changes after reset:\n" +
          unstaged.map((f) => `M\t${f.filepath}`).join("\n") + "\n");
      }
      return ok("");
    },
  });

  define("revert", {
    summary: "make a new commit that undoes an old one",
    async run(ctx) {
      const { rest, flags } = parseArgs(ctx.argv);
      const { dir } = ctx;
      if (flags.get("abort")) {
        await Porc().clearState(dir, "REVERT_HEAD");
        return ok("");
      }
      const result = await Porc().revert(dir, rest.length ? rest : ["HEAD"]);
      if (result.conflicts) {
        return err(conflictReport(result.conflicts, "revert"), 1);
      }
      const oid = result.commits[result.commits.length - 1];
      const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
      const branch = (await GT.headRef(dir))?.replace("refs/heads/", "") || "HEAD";
      return ok(`[${branch} ${short(oid)}] ${commit.message.split("\n")[0]}\n`);
    },
  });

  function conflictReport(paths, what) {
    return paths.map((p) => `CONFLICT (content): Merge conflict in ${p}`).join("\n") +
      `\nerror: could not apply — fix conflicts and then run "git ${what} --continue"\n` +
      `hint: after resolving the conflicts, mark them with "git add <paths>"\n`;
  }

  define("cherry-pick", {
    summary: "replay a commit here",
    async run(ctx) {
      const { rest, flags } = parseArgs(ctx.argv);
      const { dir } = ctx;
      if (flags.get("abort")) {
        await Porc().clearState(dir, "CHERRY_PICK_HEAD");
        return ok("");
      }
      const result = await Porc().cherryPick(dir, rest, {
        x: Boolean(flags.get("x")),
        noCommit: Boolean(flags.get("n") || flags.get("no-commit")),
      });
      if (result.conflicts) return err(conflictReport(result.conflicts, "cherry-pick"), 1);
      const lines = [];
      for (const oid of result.commits) {
        const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
        const branch = (await GT.headRef(dir))?.replace("refs/heads/", "") || "HEAD";
        lines.push(`[${branch} ${short(oid)}] ${commit.message.split("\n")[0]}`);
      }
      return ok(lines.join("\n") + (lines.length ? "\n" : ""));
    },
  });

  define("rebase", {
    summary: "replay commits onto a new base",
    complete: (ctx) => ctx.branches,
    async run(ctx) {
      const { dir } = ctx;
      const { flags, rest } = parseArgs(ctx.argv, ["--onto"]);

      if (flags.get("abort")) {
        const result = await Porc().rebaseAbort(dir);
        return ok(`HEAD is now at ${short(result.oid)}\n`);
      }
      if (flags.get("continue")) {
        return err("fatal: no rebase in progress?\n");
      }

      const upstream = rest[0];
      if (!upstream && !flags.get("onto")) {
        return err("fatal: no upstream branch given\n");
      }
      const todo = await Porc().todoFor(dir, upstream || flags.get("onto"), {
        autosquash: Boolean(flags.get("autosquash")),
      });
      if (!todo.length) return ok("Current branch is up to date.\n");

      if (flags.get("i") || flags.get("interactive")) {
        // git opens $EDITOR on the todo list; the terminal opens an editor box
        // over the real .git/rebase-merge/git-rebase-todo file.
        return {
          code: 0,
          stdout: "",
          stderr: "",
          action: {
            kind: "todo",
            todo,
            onto: flags.get("onto") || upstream,
            upstream,
          },
        };
      }

      const result = await Porc().rebase(dir, {
        onto: flags.get("onto") || upstream,
        upstream,
        todo,
      });
      if (result.conflicts) return err(conflictReport(result.conflicts, "rebase"), 1);
      const branch = (await GT.headRef(dir))?.replace("refs/heads/", "") || "HEAD";
      return ok(`Successfully rebased and updated refs/heads/${branch}.\n`);
    },
  });

  define("reflog", {
    summary: "show where refs have been",
    async run(ctx) {
      const { dir } = ctx;
      const { rest } = parseArgs(ctx.argv);
      const args = rest.filter((r) => r !== "show");
      const ref = args[0] ? await P().fullRefName(dir, args[0]) : "HEAD";
      const entries = await GT.readReflog(dir, ref);
      if (!entries.length) return ok("");
      const label = ref === "HEAD" ? "HEAD" : ref.replace("refs/heads/", "");
      return ok(entries.map((e, i) =>
        `${short(e.newOid)} ${label}@{${i}}: ${e.message}`).join("\n") + "\n");
    },
  });

  /* ---------- merge ---------- */

  define("merge", {
    summary: "join two histories",
    complete: (ctx) => ctx.branches,
    async run(ctx) {
      const { dir } = ctx;
      const { flags, rest } = parseArgs(ctx.argv, ["-X", "-m"]);
      const theirsName = rest[0];
      if (!theirsName) return err("fatal: no branch given to merge\n");

      const ours = await GT.resolve(dir, "HEAD");
      const theirs = await P().revParse(dir, theirsName);
      const branch = await GT.headRef(dir);

      if (await P().isAncestor(dir, theirs, ours)) {
        return ok(`Already up to date.\n`);
      }

      // Fast-forward when our tip is an ancestor of theirs.
      if (await P().isAncestor(dir, ours, theirs)) {
        if (flags.get("no-ff")) {
          // fall through to a real merge commit
        } else {
          await GT.updateRef(dir, branch, theirs, `merge ${theirsName}: Fast-forward`);
          await P().checkoutFiles(dir, await P().filesOfCommit(dir, theirs));
          return ok(`Updating ${short(ours)}..${short(theirs)}\nFast-forward\n`);
        }
      } else if (flags.get("ff-only")) {
        return err("fatal: Not possible to fast-forward, aborting.\n");
      }

      const [base] = await g().findMergeBase({ ...GT.ctx(dir), oids: [ours, theirs] });
      const strategy = flags.get("X") || flags.get("strategy-option");

      const baseFiles = base ? await P().filesOfCommit(dir, base) : new Map();
      const ourFiles = await P().filesOfCommit(dir, ours);
      const theirFiles = await P().filesOfCommit(dir, theirs);
      const merged = new Map();
      const conflicts = [];
      const paths = [...new Set([...baseFiles.keys(), ...ourFiles.keys(), ...theirFiles.keys()])].sort();

      for (const path of paths) {
        const b = baseFiles.get(path);
        const o = ourFiles.get(path);
        const t = theirFiles.get(path);
        if (o && t && o.oid === t.oid) { merged.set(path, o); continue; }
        if (b && t && b.oid === t.oid) { if (o) merged.set(path, o); continue; }
        if (b && o && b.oid === o.oid) { if (t) merged.set(path, t); continue; }
        if (!o) { if (t) merged.set(path, t); continue; }
        if (!t) { merged.set(path, o); continue; }

        if (strategy === "ours") { merged.set(path, o); continue; }
        if (strategy === "theirs") { merged.set(path, t); continue; }

        const result = M().mergeText(
          b ? await P().readBlobText(dir, b.oid) : "",
          await P().readBlobText(dir, o.oid),
          await P().readBlobText(dir, t.oid),
          { ours: "HEAD", theirs: theirsName });
        const blob = await P().writeBlob(dir, result.text);
        merged.set(path, { oid: blob, mode: o.mode, type: "blob" });
        if (result.conflicts) conflicts.push(path);
      }

      if (conflicts.length) {
        await Porc().writeState(dir, "MERGE_HEAD", theirs + "\n");
        await Porc().writeState(dir, "MERGE_MSG",
          `Merge branch '${theirsName}'\n\n# Conflicts:\n` +
          conflicts.map((c) => `#\t${c}`).join("\n") + "\n");
        for (const [path, meta] of merged) {
          await GT.writeFile(dir, path, await P().readBlobText(dir, meta.oid));
          if (!conflicts.includes(path)) await g().add({ ...GT.ctx(dir), filepath: path });
        }
        await GT.flush();
        return err(
          conflicts.map((p) => `Auto-merging ${p}\nCONFLICT (content): Merge conflict in ${p}`).join("\n") +
          "\nAutomatic merge failed; fix conflicts and then commit the result.\n");
      }

      const tree = await P().buildTree(dir, merged);
      const message = flags.get("m") || `Merge branch '${theirsName}'\n`;
      const oid = await GT.commit(dir, {
        message,
        tree,
        parent: [ours, theirs],
        reflog: `merge ${theirsName}: Merge made by the 'ort' strategy.`,
      });
      await P().checkoutFiles(dir, merged);
      return ok(`Merge made by the 'ort' strategy.\n [${short(oid)}]\n`);
    },
  });

  /* ---------- forensics ---------- */

  define("bisect", {
    summary: "binary-search history for the commit that broke something",
    async run(ctx) {
      const { dir } = ctx;
      const { rest } = parseArgs(ctx.argv);
      const sub = rest[0];
      const format = (state) => {
        if (state.needs) {
          return ok(`You need to give me at least one ${state.needs} revision.\n`);
        }
        if (state.done) {
          return null; // caller prints the verdict
        }
        return ok(`Bisecting: ${state.remaining} revision${state.remaining === 1 ? "" : "s"} ` +
          `left to test after this (roughly ${state.steps} step${state.steps === 1 ? "" : "s"})\n` +
          `[${state.testing}] checked out\n`);
      };

      if (sub === "start") {
        const state = await Porc().bisectStart(dir, { bad: rest[1], good: rest[2] });
        return format(state) || (await bisectVerdict(dir, state));
      }
      if (sub === "bad" || sub === "good" || sub === "skip") {
        const state = await Porc().bisectMark(dir, sub, rest[1]);
        return format(state) || (await bisectVerdict(dir, state));
      }
      if (sub === "reset") {
        const result = await Porc().bisectReset(dir);
        return ok(result.returnedTo ? `Previous HEAD position restored (${result.returnedTo})\n` : "");
      }
      if (sub === "log") {
        return ok((await Porc().readState(dir, "BISECT_LOG")) || "");
      }
      if (sub === "run") {
        return err("git bisect run needs a script to run. In this sandbox, the " +
          "lesson page provides one — use the \"Run the test\" button.\n");
      }
      return err("usage: git bisect [start|bad|good|skip|reset|log]\n");
    },
  });

  async function bisectVerdict(dir, state) {
    const oid = state.first;
    const { commit } = await g().readCommit({ ...GT.ctx(dir), oid });
    return ok(`${oid} is the first bad commit\n` +
      `Author: ${commit.author.name} <${commit.author.email}>\n` +
      `Date:   ${formatPerson(commit.author)}\n\n` +
      `    ${commit.message.split("\n")[0]}\n`);
  }

  define("blame", {
    summary: "who last touched each line",
    complete: (ctx) => ctx.tracked,
    async run(ctx) {
      const { dir } = ctx;
      const { flags, rest } = parseArgs(ctx.argv, ["-L"]);
      const path = rest[rest.length - 1];
      if (!path) return err("usage: git blame [-C] [-M] <file>\n");
      const lines = await Porc().blame(dir, path, {
        followMoves: Boolean(flags.get("M")),
        followCopies: Boolean(flags.get("C")),
      });
      const range = flags.get("L");
      let selected = lines.map((l, i) => ({ ...l, n: i + 1 }));
      if (range) {
        const [from, to] = String(range).split(",").map(Number);
        selected = selected.filter((l) => l.n >= from && l.n <= (to || from));
      }
      return ok(selected.map((l) => {
        const who = l.commit ? l.commit.author.name : "Not Committed Yet";
        const when = l.commit
          ? new Date(l.commit.author.timestamp * 1000).toISOString().slice(0, 10)
          : "          ";
        const from = l.path && l.path !== path ? ` ${l.path}` : "";
        return `${short(l.oid) || "0000000"}${from} (${who.padEnd(12)} ${when} ${String(l.n).padStart(3)}) ${l.text}`;
      }).join("\n") + "\n");
    },
  });

  define("fsck", {
    summary: "check the object database and find stranded objects",
    async run(ctx) {
      const { flags } = parseArgs(ctx.argv);
      const report = await Porc().fsck(ctx.dir, {
        includeReflogs: !flags.get("no-reflogs"),
      });
      const list = flags.get("unreachable") ? report.unreachable : report.dangling;
      const label = flags.get("unreachable") ? "unreachable" : "dangling";
      const lines = ["Checking object directories: 100% done"];
      for (const o of list) lines.push(`${label} ${o.type} ${o.oid}`);
      return ok(lines.join("\n") + "\n");
    },
  });

  /* ---------- plumbing, exposed on purpose ---------- */

  define("hash-object", {
    summary: "compute an object id (and optionally store it)",
    async run(ctx) {
      const { flags, rest } = parseArgs(ctx.argv, ["-t"]);
      const { dir } = ctx;
      let contents;
      if (flags.get("stdin")) {
        if (ctx.stdin === undefined) {
          return err("fatal: this sandbox has no pipe — use `git hash-object <file>`\n" +
            "        or the \"hash some text\" box on this page.\n");
        }
        contents = ctx.stdin;
      } else {
        const path = rest[0];
        if (!path) return err("usage: git hash-object [-w] [--stdin] <file>\n");
        try { contents = await GT.readFile(dir, path); } catch {
          return err(`fatal: could not open '${path}' for reading\n`);
        }
      }
      const oid = flags.get("w")
        ? await P().writeBlob(dir, contents)
        : await P().hashObject(contents, flags.get("t") || "blob");
      return ok(oid + "\n");
    },
  });

  define("cat-file", {
    summary: "inspect any object",
    async run(ctx) {
      const { flags, rest } = parseArgs(ctx.argv);
      const { dir } = ctx;
      const spec = rest[rest.length - 1];
      if (!spec) return err("usage: git cat-file (-t | -s | -p) <object>\n");
      let oid;
      try {
        oid = await P().revParse(dir, spec);
      } catch (e) {
        return err(`fatal: Not a valid object name ${spec}\n`);
      }
      if (flags.get("t")) return ok((await P().objectType(dir, oid)) + "\n");
      if (flags.get("s")) {
        const pretty = await P().catFilePretty(dir, oid);
        return ok(new TextEncoder().encode(pretty).length + "\n");
      }
      if (flags.get("p") || flags.get("batch-check")) {
        return ok(await P().catFilePretty(dir, oid));
      }
      return err("fatal: one of -t, -s or -p is required\n");
    },
  });

  define("ls-tree", {
    summary: "list the contents of a tree object",
    async run(ctx) {
      const { flags, rest } = parseArgs(ctx.argv);
      const { dir } = ctx;
      const oid = await P().revParse(dir, rest[0] || "HEAD");
      const type = await P().objectType(dir, oid);
      const treeOid = type === "commit" ? await P().treeOfCommit(dir, oid) : oid;
      if (flags.get("r")) {
        const files = await P().flattenTree(dir, treeOid);
        return ok([...files].map(([path, meta]) =>
          `${meta.mode.padStart(6, "0")} blob ${meta.oid}\t${path}`).join("\n") + "\n");
      }
      return ok(await P().catFilePretty(dir, treeOid));
    },
  });

  define("write-tree", {
    summary: "turn the index into a tree object",
    async run(ctx) {
      const { dir } = ctx;
      const files = new Map();
      for (const filepath of await g().listFiles(GT.ctx(dir))) {
        const oid = await indexOid(dir, filepath);
        if (oid) files.set(filepath, { oid, mode: "100644", type: "blob" });
      }
      return ok((await P().buildTree(dir, files)) + "\n");
    },
  });

  define("commit-tree", {
    summary: "make a commit object out of a tree",
    async run(ctx) {
      const { flags, rest } = parseArgs(ctx.argv, ["-m", "-p"]);
      const { dir } = ctx;
      const tree = await P().revParse(dir, rest[0]);
      const parents = [];
      const p = flags.get("p");
      if (p) parents.push(await P().revParse(dir, p));
      const oid = await GT.commit(dir, {
        message: flags.get("m") || "",
        tree,
        parent: parents,
        noUpdateBranch: true,
      });
      return ok(oid + "\n");
    },
  });

  define("update-ref", {
    summary: "point a ref at an object",
    async run(ctx) {
      const { rest } = parseArgs(ctx.argv);
      const [ref, rev] = rest;
      if (!ref || !rev) return err("usage: git update-ref <ref> <newvalue>\n");
      const oid = await P().revParse(ctx.dir, rev);
      await GT.updateRef(ctx.dir, ref, oid, `update-ref: ${rev}`);
      return ok("");
    },
  });

  define("symbolic-ref", {
    summary: "read or write a symbolic ref such as HEAD",
    async run(ctx) {
      const { rest } = parseArgs(ctx.argv);
      const { dir } = ctx;
      if (rest.length === 1) {
        const head = await GT.headRef(dir);
        if (!head) return err("fatal: ref HEAD is not a symbolic ref\n");
        return ok(head + "\n");
      }
      await g().writeRef({
        ...GT.ctx(dir), ref: rest[0], value: rest[1], symbolic: true, force: true,
      });
      return ok("");
    },
  });

  define("ls-files", {
    summary: "list what's in the index",
    async run(ctx) {
      const { flags } = parseArgs(ctx.argv);
      const { dir } = ctx;
      const files = await g().listFiles(GT.ctx(dir));
      if (!flags.get("s") && !flags.get("stage")) return ok(files.join("\n") + "\n");
      const rows = [];
      for (const filepath of files) {
        const oid = await indexOid(dir, filepath);
        rows.push(`100644 ${oid} 0\t${filepath}`);
      }
      return ok(rows.join("\n") + "\n");
    },
  });

  define("update-index", {
    summary: "stage an object id directly",
    async run(ctx) {
      const { flags, rest } = parseArgs(ctx.argv, ["--cacheinfo"]);
      const { dir } = ctx;
      if (flags.get("add") && rest.length >= 2) {
        // git update-index --add --cacheinfo 100644 <oid> <path>
        const [, oid, path] = rest.length === 3 ? rest : [null, rest[0], rest[1]];
        await g().updateIndex({ ...GT.ctx(dir), filepath: path, oid, add: true });
        await GT.flush();
        return ok("");
      }
      for (const path of rest) {
        await g().add({ ...GT.ctx(dir), filepath: path });
      }
      return ok("");
    },
  });

  define("rev-parse", {
    summary: "resolve a revision to an object id",
    async run(ctx) {
      const { flags, rest } = parseArgs(ctx.argv);
      const { dir } = ctx;
      const out = [];
      for (const spec of rest.length ? rest : ["HEAD"]) {
        if (flags.get("abbrev-ref")) {
          const head = await GT.headRef(dir);
          out.push(spec === "HEAD" && head ? head.replace("refs/heads/", "") : spec);
          continue;
        }
        try {
          const oid = await P().revParse(dir, spec);
          out.push(flags.get("short") ? short(oid) : oid);
        } catch (e) {
          return err(`fatal: ambiguous argument '${spec}': unknown revision or path not in the working tree.\n`);
        }
      }
      return ok(out.join("\n") + "\n");
    },
  });

  define("rev-list", {
    summary: "list commit ids in a range",
    async run(ctx) {
      const { flags, rest } = parseArgs(ctx.argv);
      const { dir } = ctx;
      const range = await P().parseRange(dir, rest.length ? rest : ["HEAD"]);
      const entries = await P().revList(dir, range);
      if (flags.get("count")) return ok(entries.length + "\n");
      if (flags.get("left-right") && range.symmetric) {
        const { left, right } = range.symmetric;
        const leftSide = new Set((await P().ancestors(dir, left)).map((e) => e.oid));
        return ok(entries.map((e) =>
          `${leftSide.has(e.oid) ? "<" : ">"}${e.oid}`).join("\n") + "\n");
      }
      return ok(entries.map((e) => e.oid).join("\n") + "\n");
    },
  });

  define("for-each-ref", {
    summary: "list every ref",
    async run(ctx) {
      const refs = await P().allRefs(ctx.dir);
      return ok(refs.filter((r) => r.full !== "HEAD" && r.oid)
        .map((r) => `${r.oid} commit\t${r.full}`).join("\n") + "\n");
    },
  });

  define("count-objects", {
    summary: "count loose objects",
    async run(ctx) {
      const loose = await P().looseObjects(ctx.dir);
      const { flags } = parseArgs(ctx.argv);
      if (flags.get("v")) {
        return ok(`count: ${loose.length}\nsize: unknown\nin-pack: 0\npacks: 0\n`);
      }
      return ok(`${loose.length} objects\n`);
    },
  });

  define("gc", {
    summary: "pack loose objects (narrated in this sandbox)",
    async run() {
      return err("git gc is not implemented in this sandbox — packing objects is " +
        "the one part of git this engine doesn't do.\nThe page " +
        "06-expert/packfiles-and-gc.html walks through what it would do, and why " +
        "your \"lost\" commits survive right up until it runs.\n");
    },
  });

  /* ---------- remotes ---------- */

  define("remote", {
    summary: "manage remotes",
    async run(ctx) {
      const { flags, rest } = parseArgs(ctx.argv);
      const { dir } = ctx;
      if (rest[0] === "add") {
        await g().setConfig({ ...GT.ctx(dir), path: `remote.${rest[1]}.url`, value: rest[2] });
        return ok("");
      }
      const url = await g().getConfig({ ...GT.ctx(dir), path: "remote.origin.url" });
      if (!url) return ok("");
      if (flags.get("v")) {
        return ok(`origin\t${url} (fetch)\norigin\t${url} (push)\n`);
      }
      return ok("origin\n");
    },
  });

  define("fetch", {
    summary: "get objects and refs from a remote",
    async run(ctx) {
      const result = await Porc().fetch(ctx.dir, { remote: "origin" });
      if (!result.updated.length) return ok("");
      const url = await Porc().remoteUrl(ctx.dir, "origin");
      const lines = [`From ${url}`];
      for (const u of result.updated) {
        lines.push(u.before
          ? `   ${short(u.before)}..${short(u.after)}  ${u.name}     -> origin/${u.name}`
          : ` * [new branch]      ${u.name}     -> origin/${u.name}`);
      }
      return ok(lines.join("\n") + "\n");
    },
  });

  define("push", {
    summary: "send objects and move a remote ref",
    async run(ctx) {
      const { flags, rest } = parseArgs(ctx.argv, ["--force-with-lease"]);
      const { dir } = ctx;
      const remote = rest[0] || "origin";
      const refspec = rest[1];
      const lease = flags.get("force-with-lease");
      try {
        const result = await Porc().push(dir, {
          remote,
          refspec,
          force: Boolean(flags.get("f") || flags.get("force")),
          forceWithLease: lease === undefined ? undefined : lease,
        });
        if (result.deleted) return ok(` - [deleted]         ${result.deleted}\n`);
        const url = await Porc().remoteUrl(dir, remote);
        return ok(`Enumerating objects: ${result.objects}, done.\n` +
          `To ${url}\n` +
          `   ${result.forced ? "+" : " "}  ${short(result.oid)}  ${result.ref.replace("refs/heads/", "")}\n`);
      } catch (e) {
        return err(e.message.endsWith("\n") ? e.message : e.message + "\n");
      }
    },
  });

  define("pull", {
    summary: "fetch, then merge",
    async run(ctx) {
      const fetched = await COMMANDS.fetch.run(ctx);
      const branch = (await GT.headRef(ctx.dir))?.replace("refs/heads/", "");
      const merged = await COMMANDS.merge.run({ ...ctx, argv: [`origin/${branch}`] });
      return {
        code: merged.code,
        stdout: fetched.stdout + merged.stdout,
        stderr: merged.stderr,
      };
    },
  });

  /* ---------- stash ---------- */

  define("stash", {
    summary: "shelve changes for later",
    async run(ctx) {
      const { rest, flags } = parseArgs(ctx.argv);
      const { dir } = ctx;
      const sub = rest[0] || "push";
      try {
        if (sub === "list") {
          const list = await g().stash({ ...GT.ctx(dir), op: "list" });
          return ok((list || []).join("\n") + (list && list.length ? "\n" : ""));
        }
        if (sub === "push" || sub === "save") {
          // -u also shelves untracked files, which is the trick worth knowing.
          if (flags.get("u") || flags.get("include-untracked")) {
            const { untracked } = await statusRows(dir);
            for (const path of untracked) await g().add({ ...GT.ctx(dir), filepath: path });
          }
          await g().stash({ ...GT.ctx(dir), op: "push" });
          const head = await GT.resolve(dir, "HEAD");
          const { commit } = await g().readCommit({ ...GT.ctx(dir), oid: head });
          return ok(`Saved working directory and index state WIP on ` +
            `${(await GT.headRef(dir))?.replace("refs/heads/", "")}: ` +
            `${short(head)} ${commit.message.split("\n")[0]}\n`);
        }
        if (sub === "pop" || sub === "apply" || sub === "drop" || sub === "clear") {
          await g().stash({ ...GT.ctx(dir), op: sub });
          await GT.flush();
          return COMMANDS.status.run({ ...ctx, argv: [] });
        }
      } catch (e) {
        return err(`${e.message}\n`);
      }
      return err(`usage: git stash [push|pop|apply|list|drop|clear] [-u]\n`);
    },
  });

  define("config", {
    summary: "read or write a config value",
    async run(ctx) {
      const { rest } = parseArgs(ctx.argv);
      const { dir } = ctx;
      if (rest.length === 1) {
        const value = await g().getConfig({ ...GT.ctx(dir), path: rest[0] });
        return value === undefined ? err("", 1) : ok(value + "\n");
      }
      await g().setConfig({ ...GT.ctx(dir), path: rest[0], value: rest[1] });
      return ok("");
    },
  });

  define("help", {
    summary: "list the commands this sandbox knows",
    async run() {
      const names = Object.keys(COMMANDS).sort();
      const width = Math.max(...names.map((n) => n.length)) + 2;
      return ok("These git commands work in this sandbox:\n\n" +
        names.map((n) => `   ${n.padEnd(width)}${COMMANDS[n].summary}`).join("\n") +
        "\n\nShell commands: ls, cat, tree, find, echo, edit, rm, mkdir, clear.\n" +
        "Anything else real git has will tell you it isn't implemented here,\n" +
        "rather than pretend to work.\n");
    },
  });

  define("version", {
    summary: "print the engine version",
    async run() {
      return ok(`git version 2.x (Git Tutor sandbox — isomorphic-git ` +
        `${root.git && root.git.version ? root.git.version() : ""} + this tutor's own porcelain)\n`);
    },
  });

  /* ---------- shell commands ----------

     Not git, but you can't practise git without them: staging needs a file to
     change, and `cat .git/HEAD` is half the internals unit.                 */

  const SHELL = {};

  SHELL.ls = async (ctx, argv) => {
    const { flags, rest } = parseArgs(argv);
    const target = rest[0] || ".";
    const base = target === "." ? ctx.dir : `${ctx.dir}/${target}`;
    let entries;
    try {
      entries = await GT.pfs().readdir(base);
    } catch {
      return err(`ls: cannot access '${target}': No such file or directory\n`);
    }
    const visible = flags.get("a") ? entries : entries.filter((e) => !e.startsWith("."));
    const rows = [];
    for (const entry of visible.sort()) {
      const stat = await GT.pfs().stat(`${base}/${entry}`);
      rows.push(stat.isDirectory() ? `${entry}/` : entry);
    }
    return ok(rows.join(flags.get("l") ? "\n" : "  ") + "\n");
  };

  SHELL.cat = async (ctx, argv) => {
    const { rest } = parseArgs(argv);
    const out = [];
    for (const path of rest) {
      try {
        out.push(await GT.readFile(ctx.dir, path));
      } catch {
        return err(`cat: ${path}: No such file or directory\n`);
      }
    }
    return ok(out.join(""));
  };

  SHELL.tree = async (ctx, argv) => {
    const { rest } = parseArgs(argv);
    const start = rest[0] || ".";
    const lines = [start];
    const walk = async (rel, prefix) => {
      const base = rel === "." ? ctx.dir : `${ctx.dir}/${rel}`;
      let entries = [];
      try { entries = (await GT.pfs().readdir(base)).sort(); } catch { return; }
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const last = i === entries.length - 1;
        const stat = await GT.pfs().stat(`${base}/${entry}`);
        lines.push(`${prefix}${last ? "└── " : "├── "}${entry}${stat.isDirectory() ? "/" : ""}`);
        if (stat.isDirectory()) {
          await walk(rel === "." ? entry : `${rel}/${entry}`, prefix + (last ? "    " : "│   "));
        }
      }
    };
    await walk(start, "");
    return ok(lines.join("\n") + "\n");
  };

  SHELL.find = async (ctx, argv) => {
    const { rest } = parseArgs(argv);
    const start = rest[0] || ".";
    const out = [];
    const walk = async (rel) => {
      const base = rel === "." ? ctx.dir : `${ctx.dir}/${rel}`;
      let entries = [];
      try { entries = (await GT.pfs().readdir(base)).sort(); } catch { return; }
      for (const entry of entries) {
        const path = rel === "." ? entry : `${rel}/${entry}`;
        const stat = await GT.pfs().stat(`${base}/${entry}`);
        out.push(stat.isDirectory() ? `${path}/` : path);
        if (stat.isDirectory()) await walk(path);
      }
    };
    out.push(start);
    await walk(start);
    return ok(out.join("\n") + "\n");
  };

  SHELL.echo = async (ctx, argv, line) => {
    // Supports `echo text > file` and `>>`, because staging needs edits.
    const match = line.match(/^echo\s+(.*?)\s*(>>?)\s*(\S+)\s*$/);
    if (!match) return ok(argv.join(" ") + "\n");
    const text = tokenize(match[1]).join(" ");
    const path = match[3];
    let body = "";
    if (match[2] === ">>") {
      try { body = await GT.readFile(ctx.dir, path); } catch { /* new file */ }
    }
    await GT.writeFile(ctx.dir, path, body + text + "\n");
    return ok("");
  };

  SHELL.rm = async (ctx, argv) => {
    const { rest } = parseArgs(argv);
    for (const path of rest) await GT.removeFile(ctx.dir, path);
    return ok("");
  };

  SHELL.mkdir = async (ctx, argv) => {
    const { rest } = parseArgs(argv);
    for (const path of rest) await GT.mkdirp(`${ctx.dir}/${path}`);
    return ok("");
  };

  SHELL.pwd = async (ctx) => ok(`${ctx.dir}\n`);

  SHELL.edit = async (ctx, argv) => {
    const path = parseArgs(argv).rest[0];
    if (!path) return err("usage: edit <file>\n");
    let contents = "";
    try { contents = await GT.readFile(ctx.dir, path); } catch { /* new file */ }
    return { code: 0, stdout: "", stderr: "", action: { kind: "edit", path, contents } };
  };

  SHELL.clear = async () => ({ code: 0, stdout: "", stderr: "", action: { kind: "clear" } });

  /* ---------- dispatch ---------- */

  /** Commands real git has that this sandbox doesn't. Naming them explicitly
      means the learner gets "not here" instead of "not a git command". */
  const KNOWN_UNIMPLEMENTED = {
    worktree: "linked worktrees need a second checkout sharing one object store; " +
      "04-workflow/worktrees.html shows the real .git/worktrees layout instead",
    submodule: "submodule porcelain needs a network clone; " +
      "04-workflow/submodules-and-subtrees.html builds the gitlink by hand instead",
    subtree: "see 04-workflow/submodules-and-subtrees.html",
    rerere: "reused conflict resolutions are narrated on " +
      "04-workflow/merge-strategies-and-rerere.html",
    "filter-branch": "history-wide rewriting is narrated on " +
      "02-rewriting/rewriting-published-history.html — it is too destructive to hand you",
    "filter-repo": "same as filter-branch: narrated, not run",
    prune: "nothing is packed here, so there is nothing to prune",
    repack: "this engine writes loose objects only",
    clone: "there is no network in a static site; every lab arrives pre-seeded",
    apply: "patch application isn't wired up; use cherry-pick",
    am: "mailbox patches aren't wired up; use cherry-pick",
    notes: "notes are covered on 06-expert/notes-and-replace.html",
    replace: "replace refs are covered on 06-expert/notes-and-replace.html",
    bundle: "bundles are covered on 06-expert/bundles-and-transfer.html",
    describe: "not implemented; `git tag` and `git log --oneline` cover the same ground",
    restore: "use `git checkout -- <file>` or `git reset` in this sandbox",
    grep: "use the browser's find, or `git log -S` for history search",
  };

  /**
   * Run one line. Always resolves; never throws.
   * ctx: { dir, stdin?, onExec? }  →  { code, stdout, stderr, action? }
   */
  async function run(ctx, line) {
    const text = String(line || "").trim();
    if (!text) return ok("");
    const argv = tokenize(text);

    // Shell commands first: `ls`, `cat`, `echo … > file`, `edit`.
    if (SHELL[argv[0]]) {
      try {
        return await SHELL[argv[0]](ctx, argv.slice(1), text);
      } catch (e) {
        return err(`${argv[0]}: ${e.message}\n`);
      }
    }

    if (argv[0] !== "git") {
      return err(`${argv[0]}: command not found\n` +
        "This is a git sandbox, not a full shell. `help` lists what works.\n", 127);
    }

    const name = argv[1];
    if (!name) return COMMANDS.help.run({ ...ctx, argv: [] });

    const command = COMMANDS[name];
    if (!command) {
      const note = KNOWN_UNIMPLEMENTED[name];
      if (note) {
        return err(`git: '${name}' is real git, but this sandbox doesn't run it.\n` +
          `       ${note}.\n`, 1);
      }
      return err(`git: '${name}' is not a git command. See 'git help'.\n`, 1);
    }

    try {
      const result = await command.run({ ...ctx, argv: argv.slice(2) });
      await GT.flush();
      return result;
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      return err(message.endsWith("\n") ? message : `fatal: ${message}\n`);
    }
  }

  /* ---------- tab completion ---------- */

  async function complete(ctx, line) {
    const argv = tokenize(line);
    const trailingSpace = /\s$/.test(line);
    const words = trailingSpace ? [...argv, ""] : argv;
    const partial = words[words.length - 1];

    // `gi<tab>` / `ls<tab>`
    if (words.length === 1) {
      return ["git", ...Object.keys(SHELL)].filter((c) => c.startsWith(partial));
    }
    if (words[0] !== "git") {
      if (words[0] === "cat" || words[0] === "edit" || words[0] === "rm") {
        const files = await GT.listWorktree(ctx.dir);
        return files.filter((f) => f.startsWith(partial));
      }
      return [];
    }
    if (words.length === 2) {
      return Object.keys(COMMANDS).sort().filter((c) => c.startsWith(partial));
    }

    const command = COMMANDS[words[1]];
    const refs = (await P().allRefs(ctx.dir))
      .filter((r) => r.full !== "HEAD")
      .map((r) => (r.kind === "remote" ? r.name : r.name));
    const candidates = new Set(["HEAD", ...refs]);
    if (command && command.complete) {
      const extra = await command.complete({
        dir: ctx.dir,
        branches: refs,
        worktree: await GT.listWorktree(ctx.dir),
        tracked: await g().listFiles(GT.ctx(ctx.dir)),
      });
      for (const item of extra || []) candidates.add(item);
    } else {
      for (const item of await GT.listWorktree(ctx.dir)) candidates.add(item);
    }
    return [...candidates].filter((c) => c.startsWith(partial)).sort();
  }

  root.GTCli = {
    run,
    complete,
    tokenize,
    parseArgs,
    commands: COMMANDS,
    shell: SHELL,
    unimplemented: KNOWN_UNIMPLEMENTED,
    short,
    formatPerson,
    statusRows,
    diffCommit,
  };
})(typeof window === "undefined" ? globalThis : window);
