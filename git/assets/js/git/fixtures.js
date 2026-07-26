/* Git Tutor — deterministic starting histories.  window.GTFix

   A fixture is a named script of steps that builds a real repository. Author,
   committer and every timestamp are fixed (GT.FIXTURE_AUTHOR, GT.FIXTURE_EPOCH
   + n × GT.FIXTURE_STEP), so the object ids come out identical on every browser
   and every run — which is what lets a lesson page print "b7f2a91" in its prose
   and have it match what the learner sees.

   scripts/verify-fixtures.js builds the same fixtures with the real git CLI and
   diffs the ids. If that script passes, these histories are byte-for-byte the
   histories git itself would have written.

   Step vocabulary:
     { write: {path: contents}, remove: [path], rename: [[from, to]],
       message: "…", tag: "v1", branch: "name", checkout: "name",
       merge: "name", amend: true, noCommit: true }                          */
(function (root) {
  "use strict";

  const GT = root.GT;

  /* ---------- the histories ---------- */

  // A tiny Python project used by most fixtures, so the learner sees the same
  // codebase across units and can concentrate on the git. The table is built by
  // a function so it can read SRC, which is defined below it for readability.
  function fixtureTable() {
    return {

    /* Unit 1 — plumbing. An empty repo: the learner makes the first object. */
    "empty": {
      title: "A brand-new empty repository",
      about: "Nothing committed yet — not even a first commit.",
      steps: [],
    },

    /* Unit 1 — objects to poke at with cat-file. */
    "two-files": {
      title: "One commit, two files",
      about: "The smallest history with a tree worth exploring.",
      steps: [
        {
          message: "Add the greeter",
          write: {
            "hello.txt": "hello, object database\n",
            "notes/plan.md": "# Plan\n\n- learn plumbing\n",
          },
        },
      ],
    },

    /* Units 2, 3 — a plain linear history. */
    "linear-5": {
      title: "Five commits, one branch",
      about: "A straight line of history on main.",
      steps: [
        { message: "Add the word counter", write: { "count.py": SRC.count1 } },
        { message: "Read the file from argv", write: { "count.py": SRC.count2 } },
        { message: "Skip blank lines", write: { "count.py": SRC.count3 } },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        { message: "Report the longest line too", write: { "count.py": SRC.count4 } },
      ],
    },

    /* Unit 2 — the classic "clean this up before you push" branch. */
    "wip-3": {
      title: "Three messy commits on a feature branch",
      about: "main is tidy; feature/report has WIP commits crying out for a squash.",
      steps: [
        { message: "Add the word counter", write: { "count.py": SRC.count1 } },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        { branch: "feature/report", checkout: "feature/report" },
        { message: "wip report", write: { "report.py": "def report():\n    pass\n" } },
        {
          message: "more wip",
          write: { "report.py": "def report(counts):\n    print(counts)\n" },
        },
        {
          message: "fix typo, tidy up, works now",
          write: { "report.py": SRC.report },
        },
      ],
    },

    /* Unit 2 — autosquash: fixup!/squash! subjects waiting to be folded in. */
    "fixup-chain": {
      title: "A branch with fixup! commits queued up",
      about: "Two corrections marked for --autosquash to fold into their targets.",
      steps: [
        { message: "Add the word counter", write: { "count.py": SRC.count1 } },
        { message: "Add the report", write: { "report.py": SRC.report } },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        {
          message: "fixup! Add the word counter",
          write: { "count.py": SRC.count2 },
        },
        {
          message: "squash! Add the report",
          write: { "report.py": SRC.report + "\n# printed in column order\n" },
        },
      ],
    },

    /* Unit 2 — diverged branches for rebase, --onto and cherry-pick. */
    "diverged": {
      title: "main and two feature branches, diverged",
      about: "feature sits on an old main; hotfix has the one commit you want.",
      steps: [
        { message: "Add the word counter", write: { "count.py": SRC.count1 } },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        { branch: "feature", checkout: "feature" },
        { message: "Start the report module", write: { "report.py": SRC.report } },
        {
          message: "Sort the report output",
          write: { "report.py": SRC.report.replace("counts.items()", "sorted(counts.items())") },
        },
        { checkout: "main" },
        { message: "Handle a missing file", write: { "count.py": SRC.count3 } },
        { branch: "hotfix", checkout: "hotfix" },
        {
          message: "Strip the BOM before counting",
          write: { "count.py": SRC.count3.replace("text = fh.read()", "text = fh.read().lstrip('\\ufeff')") },
        },
        { checkout: "main" },
      ],
    },

    /* Unit 3 — bisect: twelve commits, exactly one breaks the test. */
    "bug-hunt": {
      title: "Twelve commits, one of them broke the test",
      about: "`python -m test` passes at the start and fails at the tip.",
      steps: (() => {
        const steps = [
          { message: "Add the tokenizer", write: { "tok.py": SRC.tok(1), "test.py": SRC.test } },
        ];
        for (let n = 2; n <= 12; n++) {
          // The regression lands at commit 8: the split() call loses empties.
          steps.push({
            message: SRC.bugMessages[n - 2],
            write: { "tok.py": SRC.tok(n) },
          });
        }
        return steps;
      })(),
    },

    /* Unit 3 — blame -C/-M and log --follow: a file that moved and split. */
    "moved-code": {
      title: "Code that was renamed, then split in two",
      about: "The lines you're blaming were written three files ago.",
      steps: [
        { message: "Add the word counter", write: { "count.py": SRC.count4 } },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        { rename: [["count.py", "wordcount.py"]], message: "Rename count.py to wordcount.py" },
        {
          message: "Move the reporting half into report.py",
          write: {
            "wordcount.py": SRC.count4.split("# --- reporting ---")[0],
            "report.py": "# --- reporting ---\n" + SRC.count4.split("# --- reporting ---")[1],
          },
        },
        {
          message: "Tidy the report header",
          write: { "report.py": ("# --- reporting ---\n" + SRC.count4.split("# --- reporting ---")[1]).replace("def show", "def show_counts") },
        },
      ],
    },

    /* Unit 3 — pickaxe: a string that appeared, then vanished. */
    "lost-string": {
      title: "A password that was committed, then removed",
      about: "It's gone from the tip — but which commit added it, and which took it out?",
      steps: [
        { message: "Add the word counter", write: { "count.py": SRC.count1 } },
        {
          message: "Add the deploy script",
          write: { "deploy.sh": "#!/bin/sh\nrsync -a . prod:/srv/app\n" },
        },
        {
          message: "Automate the upload",
          write: { "deploy.sh": "#!/bin/sh\nSSH_PASSWORD=hunter2\nrsync -a . prod:/srv/app\n" },
        },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        {
          message: "Read credentials from the environment",
          write: { "deploy.sh": "#!/bin/sh\n: \"${DEPLOY_KEY:?set DEPLOY_KEY}\"\nrsync -a . prod:/srv/app\n" },
        },
        { message: "Document the deploy", write: { "README.md": SRC.readme1 + "\nRun ./deploy.sh.\n" } },
      ],
    },

    /* Unit 3 — dangling objects: a branch deleted with work on it. */
    "dangling": {
      title: "Work that isn't on any branch any more",
      about: "A branch was deleted. The commits are still in there.",
      steps: [
        { message: "Add the word counter", write: { "count.py": SRC.count1 } },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        { branch: "experiment", checkout: "experiment" },
        { message: "Try a streaming parser", write: { "stream.py": SRC.stream } },
        { message: "Handle short reads", write: { "stream.py": SRC.stream + "\n# short reads handled\n" } },
        { checkout: "main" },
        { deleteBranch: "experiment" },
      ],
    },

    /* Unit 4 — a remote that has moved on without you. */
    "with-remote": {
      title: "A remote whose main has moved on",
      about: "origin/main has a commit you don't, and you've rewritten yours.",
      remote: true,
      steps: [
        { message: "Add the word counter", write: { "count.py": SRC.count1 } },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        { publish: true },
        { message: "Add the report", write: { "report.py": SRC.report } },
        {
          publishAhead: {
            message: "Spell out what it counts",
            write: { "README.md": SRC.readme1.replace("Counts words", "Counts the words") },
          },
        },
      ],
    },

    /* Unit 4 — two branches editing the same lines. */
    "conflicting": {
      title: "Two branches editing the same lines",
      about: "A merge is going to stop and ask you something.",
      steps: [
        { message: "Add the config", write: { "config.ini": SRC.config } },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        { branch: "tune-cache", checkout: "tune-cache" },
        { message: "Raise the cache size", write: { "config.ini": SRC.config.replace("cache = 64", "cache = 512") } },
        { checkout: "main" },
        { message: "Lower the cache for small boxes", write: { "config.ini": SRC.config.replace("cache = 64", "cache = 16") } },
      ],
    },

    /* Unit 4 — a real gitlink: a tree entry naming a commit in another repo. */
    "with-submodule": {
      title: "A project with a submodule",
      about: "vendor/parser is a gitlink — mode 160000 — naming a commit that " +
        "lives in a different repository.",
      steps: [
        { message: "Add the word counter", write: { "count.py": SRC.count1 } },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        {
          submodule: {
            path: "vendor/parser",
            message: "Add the parser as a submodule",
            file: { "parse.py": SRC.report },
          },
        },
      ],
    },

    /* Unit 4 — a dirty worktree to stash. */
    "dirty": {
      title: "Half-finished work in the worktree",
      about: "One staged change, one unstaged, one untracked file.",
      steps: [
        { message: "Add the word counter", write: { "count.py": SRC.count1 } },
        { message: "Add a README", write: { "README.md": SRC.readme1 } },
        { write: { "count.py": SRC.count2 }, stage: ["count.py"], noCommit: true },
        { write: { "README.md": SRC.readme1 + "\nTODO: document the flags.\n" }, noCommit: true, noStage: true },
        { write: { "scratch.txt": "don't commit me\n" }, noCommit: true, noStage: true },
      ],
    },
    };
  }

  /* ---------- the sample codebase ----------
     Kept small and readable: the learner should be able to tell at a glance
     what changed between two commits. */

  const SRC = {};
  SRC.count1 = [
    "import sys",
    "from collections import Counter",
    "",
    "def count(text):",
    '    """Count words in a blob of text."""',
    "    return Counter(text.split())",
    "",
    'if __name__ == "__main__":',
    "    print(count(sys.stdin.read()))",
    "",
  ].join("\n");

  SRC.count2 = SRC.count1.replace(
    "    print(count(sys.stdin.read()))",
    '    with open(sys.argv[1], encoding="utf-8") as fh:\n' +
    "        text = fh.read()\n" +
    "    print(count(text))");

  SRC.count3 = SRC.count2.replace(
    '    """Count words in a blob of text."""',
    '    """Count words in a blob of text, ignoring blank lines."""') +
    "";

  SRC.count4 = [
    "import sys",
    "from collections import Counter",
    "",
    "def count(text):",
    '    """Count words in a blob of text, ignoring blank lines."""',
    "    lines = [line for line in text.splitlines() if line.strip()]",
    '    return Counter(" ".join(lines).split())',
    "",
    "# --- reporting ---",
    "",
    "def show(counts):",
    "    for word, n in counts.most_common(10):",
    '        print(f"{n:5d}  {word}")',
    "",
    'if __name__ == "__main__":',
    '    with open(sys.argv[1], encoding="utf-8") as fh:',
    "        show(count(fh.read()))",
    "",
  ].join("\n");

  SRC.readme1 = [
    "# wordcount",
    "",
    "Counts words in a text file.",
    "",
    "    python count.py notes.txt",
    "",
  ].join("\n");

  SRC.report = [
    "def report(counts):",
    '    """Print counts, one per line."""',
    "    for word, n in counts.items():",
    '        print(f"{word}: {n}")',
    "",
  ].join("\n");

  SRC.stream = [
    "def stream(fh, size=4096):",
    '    """Yield chunks so huge files fit in memory."""',
    "    while True:",
    "        chunk = fh.read(size)",
    "        if not chunk:",
    "            return",
    "        yield chunk",
    "",
  ].join("\n");

  SRC.config = [
    "[server]",
    "port = 8080",
    "workers = 4",
    "",
    "[limits]",
    "cache = 64",
    "timeout = 30",
    "",
  ].join("\n");

  SRC.test = [
    "from tok import tokens",
    "",
    "def main():",
    '    assert tokens("a  b") == ["a", "b"], tokens("a  b")',
    '    assert tokens("") == []',
    '    print("ok")',
    "",
    'if __name__ == "__main__":',
    "    main()",
    "",
  ].join("\n");

  // Commit 8 introduces the bug: splitting on a literal space keeps the empty
  // string between the two spaces, so tokens("a  b") gains a phantom token.
  SRC.tok = (n) => {
    const splitter = n >= 8 ? 'text.split(" ")' : "text.split()";
    const extras = [];
    for (let i = 2; i <= n; i++) {
      if (i === 8) continue;
      extras.push(`# revision ${i}`);
    }
    return [
      "def tokens(text):",
      '    """Split text into words."""',
      `    return [t for t in ${splitter} if t]`,
      "",
      ...extras,
      "",
    ].join("\n");
  };

  // One entry per commit from the 2nd to the 12th, so index i is commit i + 2.
  SRC.bugMessages = [
    "Document the tokenizer",
    "Strip punctuation",
    "Lowercase the tokens",
    "Add a fast path for short input",
    "Handle tabs",
    "Cache the compiled pattern",
    "Add type hints",                 // commit 8 — the commit that plants the bug
    "Tidy the imports",
    "Handle None",
    "Add a docstring example",
    "Rename the internal helper",
  ];

  /* ---------- the builder ---------- */

  const FIXTURES = fixtureTable();

  async function build(name, dir) {
    const fixture = FIXTURES[name];
    if (!fixture) throw new Error(`unknown fixture: ${name}`);

    let n = 0;
    const when = () => ({
      timestamp: GT.FIXTURE_EPOCH + n * GT.FIXTURE_STEP,
      timezoneOffset: 0,
    });
    const author = GT.FIXTURE_AUTHOR;
    const g = root.git;
    const c = GT.ctx(dir);

    for (const step of fixture.steps) {
      if (step.branch) {
        await g.branch({ ...c, ref: step.branch });
      }

      if (step.checkout) {
        await g.checkout({ ...c, ref: step.checkout, force: true });
        await GT.appendReflog(
          dir, "HEAD", await GT.resolve(dir, "HEAD"), await GT.resolve(dir, step.checkout),
          `checkout: moving to ${step.checkout}`, { ...when(), author });
      }

      if (step.deleteBranch) {
        // Via GTPorc so the branch's reflog goes with it, as `git branch -d` does.
        await root.GTPorc.deleteBranch(dir, step.deleteBranch);
      }

      for (const [from, to] of step.rename || []) {
        const body = await GT.readFile(dir, from);
        await GT.writeFile(dir, to, body);
        await GT.removeFile(dir, from);
        await g.remove({ ...c, filepath: from });
        await g.add({ ...c, filepath: to });
      }

      for (const [path, contents] of Object.entries(step.write || {})) {
        await GT.writeFile(dir, path, contents);
        if (!step.noStage) await g.add({ ...c, filepath: path });
      }

      for (const path of step.stage || []) {
        await g.add({ ...c, filepath: path });
      }

      for (const path of step.remove || []) {
        await GT.removeFile(dir, path);
        await g.remove({ ...c, filepath: path });
      }

      if (step.merge) {
        n++;
        await g.merge({
          ...c,
          ours: (await GT.headRef(dir))?.replace("refs/heads/", ""),
          theirs: step.merge,
          author: { ...author, ...when() },
          committer: { ...author, ...when() },
        });
      }

      if (step.submodule) {
        n++;
        await addSubmodule(dir, step.submodule, { ...when(), author });
      }

      if (step.publish) {
        await publish(dir, name);
      }

      if (step.publishAhead) {
        await publishAhead(dir, name, step.publishAhead, when, ++n);
      }

      if (step.message && !step.noCommit) {
        n++;
        await GT.commit(dir, {
          message: step.message,
          author,
          committer: author,
          when: when(),
          reflog: `commit: ${step.message}`,
        });
      }

      if (step.tag) {
        await g.tag({ ...c, ref: step.tag });
      }
    }

    // Fixtures that involve a remote get one even without an explicit step.
    if (fixture.remote && !(await GT.exists(`${GT.remoteDirFor(basename(dir))}/.git`))) {
      await publish(dir, name);
    }
    await GT.flush();
    return dir;
  }

  const basename = (dir) => dir.slice(dir.lastIndexOf("/") + 1);

  /* ---------- submodules ----------

     A submodule is two things: a line in .gitmodules saying where to clone from,
     and a tree entry with mode 160000 — a "gitlink" — naming one commit in that
     other repository. Both are built here for real: the sub-repository is an
     actual repository next door on the same filesystem, and the gitlink names
     one of its commits, so `git cat-file -p` and real git both read it as
     "160000 commit <id> <path>".                                            */

  async function addSubmodule(dir, spec, when) {
    const subDir = `${dir}.sub`;
    await GT.mkdirp(subDir);
    await root.git.init({ fs: GT.fs(), dir: subDir, defaultBranch: "main" });
    for (const [path, contents] of Object.entries(spec.file || {})) {
      await GT.writeFile(subDir, path, contents);
      await root.git.add({ fs: GT.fs(), dir: subDir, filepath: path });
    }
    const subOid = await GT.commit(subDir, {
      message: "Initial parser",
      author: GT.FIXTURE_AUTHOR,
      committer: GT.FIXTURE_AUTHOR,
      when,
    });

    const gitmodules = [
      `[submodule "${spec.path}"]`,
      `\tpath = ${spec.path}`,
      `\turl = ${subDir}`,
      "",
    ].join("\n");
    await GT.writeFile(dir, ".gitmodules", gitmodules);
    await root.git.add({ fs: GT.fs(), dir, filepath: ".gitmodules" });

    // Build the tree from the index, then add the gitlink entry by hand —
    // there is no porcelain for "stage a commit id at this path".
    const files = new Map();
    for (const filepath of await root.git.listFiles({ fs: GT.fs(), dir })) {
      const [oid] = await root.git.walk({
        fs: GT.fs(),
        dir,
        trees: [root.git.STAGE()],
        map: async (p, [stage]) => (p === filepath && stage ? stage.oid() : undefined),
      });
      if (oid) files.set(filepath, { oid, mode: "100644", type: "blob" });
    }
    files.set(spec.path, { oid: subOid, mode: "160000", type: "commit" });

    const tree = await root.GTPlumb.buildTree(dir, files);
    await GT.commit(dir, {
      message: spec.message,
      tree,
      parent: [await GT.resolve(dir, "HEAD")],
      author: GT.FIXTURE_AUTHOR,
      committer: GT.FIXTURE_AUTHOR,
      when,
      reflog: `commit: ${spec.message}`,
    });
    await GT.flush();
    return subOid;
  }

  /* ---------- the fake remote ----------

     isomorphic-git only speaks HTTP, and there is no server here, so a "remote"
     is a second repository directory on the same filesystem. GTPorc implements
     fetch/push between the two by copying objects and moving refs — which is
     exactly what the real protocols do once the negotiation is over, and it
     makes refspecs and --force-with-lease teachable for real.               */

  async function publish(dir, name) {
    const labId = basename(dir);
    const remote = GT.remoteDirFor(labId);
    await GT.mkdirp(remote);
    await root.git.init({ fs: GT.fs(), dir: remote, bare: false, defaultBranch: "main" });
    await root.git.setConfig({
      fs: GT.fs(), dir, path: "remote.origin.url", value: remote,
    });
    if (root.GTPorc) await root.GTPorc.push(dir, { remote: "origin", refspec: "refs/heads/main:refs/heads/main" });
    void name;
  }

  // Give the remote a commit the learner doesn't have, so pushes are rejected
  // and fetch/rebase/force-with-lease have something to talk about.
  async function publishAhead(dir, name, step, when, n) {
    const labId = basename(dir);
    const remote = GT.remoteDirFor(labId);
    const c = { fs: GT.fs(), dir: remote };
    for (const [path, contents] of Object.entries(step.write || {})) {
      await GT.writeFile(remote, path, contents);
      await root.git.add({ ...c, filepath: path });
    }
    await GT.commit(remote, {
      message: step.message,
      author: GT.FIXTURE_AUTHOR,
      committer: GT.FIXTURE_AUTHOR,
      when: { timestamp: GT.FIXTURE_EPOCH + n * GT.FIXTURE_STEP, timezoneOffset: 0 },
    });
    void name;
  }

  root.GTFix = {
    build,
    list: () => Object.keys(FIXTURES),
    get: (name) => FIXTURES[name],
    describe: (name) => {
      const f = FIXTURES[name];
      return f ? { title: f.title, about: f.about } : null;
    },
    SRC,
  };
})(typeof window === "undefined" ? globalThis : window);
