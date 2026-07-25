/* Git Tutor — lab goal predicates.  window.GTChecks

   A lab's goals are declared as JSON on the page (see lab.js), and each goal
   names one of the checks below. Keeping the vocabulary here rather than writing
   inline JavaScript per page has three payoffs: content pages stay pure data
   like every other page on this site, scripts/build-git-index.js can validate at
   build time that every goal names a check that exists, and the ~20 checks get
   shared across every lab instead of being re-written each time.

   Goals are always asserted over STRUCTURE — commit counts, messages, trees,
   ancestry, reflog contents — never over a literal object id, because the
   learner's own commits get real timestamps and so have unpredictable ids.

   A page needing something bespoke registers it in its own trailing script:
     GTChecks.register("my-check", async (repo, params) => ({ pass, detail }));

   The build script reads the names between the sentinel comments below, so keep
   the vocabulary inside them.                                                */
(function (root) {
  "use strict";

  const GT = root.GT;
  const P = () => root.GTPlumb;
  const Porc = () => root.GTPorc;
  const g = () => root.git;

  const registry = new Map();

  /** repo is { dir, labId, fixture }; params comes from the goal's JSON. */
  const define = (name, fn) => registry.set(name, fn);

  const pass = (detail) => ({ pass: true, detail });
  const fail = (detail) => ({ pass: false, detail });

  async function commitsOf(dir, ref, exclude) {
    const oid = await P().revParse(dir, ref || "HEAD");
    const excludeOids = [];
    for (const spec of [].concat(exclude || [])) {
      try { excludeOids.push(await P().revParse(dir, spec)); } catch { /* absent */ }
    }
    return P().revList(dir, { include: [oid], exclude: excludeOids, firstParent: true });
  }

  /* CHECK-VOCABULARY-START */

  define("commitCount", async (repo, params) => {
    const entries = await commitsOf(repo.dir, params.ref, params.since);
    const n = entries.length;
    if (params.eq !== undefined) {
      return n === params.eq
        ? pass(`${n} commit${n === 1 ? "" : "s"}`)
        : fail(`found ${n}, expected ${params.eq}`);
    }
    if (params.min !== undefined && n < params.min) return fail(`only ${n} so far`);
    if (params.max !== undefined && n > params.max) return fail(`${n} is too many`);
    return pass(`${n} commits`);
  });

  define("headIs", async (repo, params) => {
    const head = await GT.headRef(repo.dir);
    const want = params.branch ? `refs/heads/${params.branch}` : null;
    if (params.branch) {
      return head === want
        ? pass(`on ${params.branch}`)
        : fail(head ? `on ${head.replace("refs/heads/", "")}` : "detached");
    }
    const oid = await GT.resolve(repo.dir, "HEAD");
    const target = await P().revParse(repo.dir, params.rev);
    return oid === target ? pass("HEAD is where it should be") : fail("HEAD is elsewhere");
  });

  define("headDetached", async (repo, params) => {
    const detached = await GT.isDetached(repo.dir);
    const want = params.detached !== false;
    return detached === want
      ? pass(detached ? "HEAD is detached" : "HEAD is on a branch")
      : fail(detached ? "HEAD is detached" : "HEAD is on a branch");
  });

  define("refExists", async (repo, params) => {
    const oid = await GT.resolve(repo.dir, await P().fullRefName(repo.dir, params.ref));
    return oid ? pass(`${params.ref} → ${oid.slice(0, 7)}`) : fail(`${params.ref} doesn't exist`);
  });

  define("noRef", async (repo, params) => {
    const oid = await GT.resolve(repo.dir, await P().fullRefName(repo.dir, params.ref));
    return oid ? fail(`${params.ref} still exists`) : pass(`${params.ref} is gone`);
  });

  define("messages", async (repo, params) => {
    const entries = await commitsOf(repo.dir, params.ref, params.since);
    const subjects = entries.map((e) => e.commit.message.split("\n")[0]);
    const want = [].concat(params.equals || []);
    const same = subjects.length === want.length &&
      want.every((w, i) => subjects[i] === w);
    return same ? pass("subjects match") : fail(`saw: ${subjects.join(" / ") || "(none)"}`);
  });

  define("messageMatch", async (repo, params) => {
    const entries = await commitsOf(repo.dir, params.ref, params.since);
    const re = new RegExp(params.pattern, params.flags || "");
    const hits = entries.filter((e) => re.test(e.commit.message));
    if (params.count !== undefined) {
      return hits.length === params.count
        ? pass(`${hits.length} matching commit(s)`)
        : fail(`${hits.length} match, expected ${params.count}`);
    }
    return hits.length
      ? pass(`"${hits[0].commit.message.split("\n")[0]}"`)
      : fail(`nothing matches /${params.pattern}/`);
  });

  define("noMessageMatch", async (repo, params) => {
    const entries = await commitsOf(repo.dir, params.ref, params.since);
    const re = new RegExp(params.pattern, params.flags || "");
    const hits = entries.filter((e) => re.test(e.commit.message));
    return hits.length
      ? fail(`still there: "${hits[0].commit.message.split("\n")[0]}"`)
      : pass(`no commit matches /${params.pattern}/`);
  });

  define("treeEquals", async (repo, params) => {
    // The workhorse: "you rewrote history without changing the files."
    const a = await P().treeOfCommit(repo.dir, await P().revParse(repo.dir, params.ref || "HEAD"));
    const b = params.to === "@fixture.tip"
      ? repo.fixtureTip && await P().treeOfCommit(repo.dir, repo.fixtureTip)
      : await P().treeOfCommit(repo.dir, await P().revParse(repo.dir, params.to));
    if (!b) return fail("nothing to compare against");
    return a === b ? pass("the files are identical") : fail("the content changed");
  });

  define("fileContains", async (repo, params) => {
    let text;
    try {
      text = await GT.readFile(repo.dir, params.path);
    } catch {
      return fail(`${params.path} doesn't exist in the worktree`);
    }
    const found = params.pattern
      ? new RegExp(params.pattern).test(text)
      : text.includes(params.text);
    if (params.absent) {
      return found ? fail(`${params.path} still contains it`) : pass(`${params.path} is clean`);
    }
    return found ? pass(`${params.path} contains it`) : fail(`${params.path} doesn't contain it`);
  });

  define("blobContains", async (repo, params) => {
    const oid = await P().revParse(repo.dir, params.ref || "HEAD");
    const files = await P().filesOfCommit(repo.dir, oid);
    const meta = files.get(params.path);
    if (!meta) {
      return params.absent
        ? pass(`${params.path} isn't in that commit`)
        : fail(`${params.path} isn't in that commit`);
    }
    const text = await P().readBlobText(repo.dir, meta.oid);
    const found = params.pattern
      ? new RegExp(params.pattern).test(text)
      : text.includes(params.text);
    if (params.absent) return found ? fail("it's still committed") : pass("it's gone from that commit");
    return found ? pass("committed content matches") : fail("committed content doesn't match");
  });

  define("worktreeClean", async (repo, params) => {
    const { staged, unstaged, untracked } = await root.GTCli.statusRows(repo.dir);
    const dirty = staged.length + unstaged.length +
      (params.ignoreUntracked === false ? untracked.length : 0);
    return dirty === 0
      ? pass("working tree clean")
      : fail(`${dirty} change(s) not committed`);
  });

  define("indexHas", async (repo, params) => {
    const files = await g().listFiles(GT.ctx(repo.dir));
    const missing = [].concat(params.paths || params.path).filter((p) => !files.includes(p));
    return missing.length ? fail(`not staged: ${missing.join(", ")}`) : pass("staged");
  });

  define("isAncestor", async (repo, params) => {
    const a = await P().revParse(repo.dir, params.ancestor);
    const b = await P().revParse(repo.dir, params.of);
    const yes = await P().isAncestor(repo.dir, a, b);
    return yes
      ? pass(`${params.ancestor} is behind ${params.of}`)
      : fail(`${params.ancestor} is not an ancestor of ${params.of}`);
  });

  define("notAncestor", async (repo, params) => {
    const a = await P().revParse(repo.dir, params.ancestor);
    const b = await P().revParse(repo.dir, params.of);
    const yes = await P().isAncestor(repo.dir, a, b);
    return yes
      ? fail(`${params.ancestor} is still an ancestor of ${params.of}`)
      : pass("the histories are separate");
  });

  define("reflogContains", async (repo, params) => {
    const ref = params.ref ? await P().fullRefName(repo.dir, params.ref) : "HEAD";
    const entries = await GT.readReflog(repo.dir, ref);
    const re = new RegExp(params.pattern, params.flags || "");
    const hit = entries.find((e) => re.test(e.message));
    return hit
      ? pass(`reflog: "${hit.message}"`)
      : fail(`nothing in the ${ref} reflog matches /${params.pattern}/`);
  });

  define("objectExists", async (repo, params) => {
    try {
      const oid = params.oid || await P().revParse(repo.dir, params.rev);
      const type = await P().objectType(repo.dir, oid);
      return params.type && type !== params.type
        ? fail(`that object is a ${type}, not a ${params.type}`)
        : pass(`${type} ${oid.slice(0, 7)} exists`);
    } catch {
      return fail("no such object");
    }
  });

  define("objectCount", async (repo, params) => {
    const loose = await P().looseObjects(repo.dir);
    if (params.min !== undefined && loose.length < params.min) {
      return fail(`${loose.length} objects so far`);
    }
    return pass(`${loose.length} objects`);
  });

  define("danglingCount", async (repo, params) => {
    const report = await Porc().fsck(repo.dir, { includeReflogs: false });
    const commits = report.unreachable.filter((o) => o.type === "commit");
    if (params.min !== undefined) {
      return commits.length >= params.min
        ? pass(`${commits.length} stranded commit(s)`)
        : fail(`${commits.length} stranded, expected at least ${params.min}`);
    }
    return commits.length === (params.eq || 0)
      ? pass(`${commits.length} stranded commit(s)`)
      : fail(`${commits.length} stranded, expected ${params.eq}`);
  });

  define("configIs", async (repo, params) => {
    const value = await g().getConfig({ ...GT.ctx(repo.dir), path: params.path });
    return value === params.value
      ? pass(`${params.path} = ${value}`)
      : fail(`${params.path} is ${value === undefined ? "unset" : value}`);
  });

  define("remoteRefIs", async (repo, params) => {
    const remote = GT.remoteDirFor(repo.labId);
    const there = await GT.resolve(remote, await P().fullRefName(remote, params.ref || "main"));
    const here = await P().revParse(repo.dir, params.equals || "HEAD");
    return there === here
      ? pass("the remote matches your branch")
      : fail(there ? `the remote is at ${there.slice(0, 7)}` : "the remote doesn't have that branch");
  });

  define("bisectFound", async (repo, params) => {
    // The lab records what bisect landed on; compare against the planted commit.
    const state = await Porc().bisectState(repo.dir);
    if (!state.bad) return fail("no bisect in progress");
    const candidates = await Porc().bisectCandidates(repo.dir);
    const found = candidates.length <= 1 ? (candidates[0] || state.bad) : null;
    if (!found) return fail(`${candidates.length} commits still suspect`);
    const files = await P().filesOfCommit(repo.dir, found);
    const meta = files.get(params.path);
    if (!meta) return fail("the file isn't in that commit");
    const text = await P().readBlobText(repo.dir, meta.oid);
    return new RegExp(params.pattern).test(text)
      ? pass(`${found.slice(0, 7)} is the commit that introduced it`)
      : fail(`${found.slice(0, 7)} isn't the commit that introduced it`);
  });

  define("custom", async (repo, params) => {
    const fn = registry.get(params.name);
    if (!fn) return fail(`no check registered as "${params.name}"`);
    return fn(repo, params);
  });

  /* CHECK-VOCABULARY-END */

  /** Evaluate one goal's `check` object: { checkName: params }. */
  async function evaluate(repo, check) {
    const [name] = Object.keys(check || {});
    if (!name) return fail("this goal has no check");
    const fn = registry.get(name);
    if (!fn) return fail(`unknown check "${name}"`);
    try {
      return await fn(repo, check[name] || {});
    } catch (error) {
      // A goal that throws is a not-yet-satisfied goal, not a broken page:
      // half-finished states (no HEAD, missing ref) throw all the time.
      return fail(String(error.message || error));
    }
  }

  root.GTChecks = {
    evaluate,
    register: (name, fn) => registry.set(name, fn),
    names: () => [...registry.keys()],
  };
})(window);
