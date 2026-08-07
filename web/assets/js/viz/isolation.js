/* Transaction isolation — two sessions against a working miniature of
   PostgreSQL's MVCC, not an animation of one.

   What is implemented, honestly:
     · committed version history per row; a read sees the latest version no
       newer than its snapshot (never anything uncommitted — dirty reads are
       impossible at every level, as in PostgreSQL);
     · READ COMMITTED takes a fresh snapshot per statement, REPEATABLE READ
       and SERIALIZABLE take one at the transaction's first statement;
     · first-updater-wins: updating a row a concurrent transaction changed
       blocks until that transaction finishes, then either re-evaluates
       (READ COMMITTED) or fails with a serialization error (REPEATABLE READ
       and up), exactly PostgreSQL's row-lock behaviour;
     · SERIALIZABLE adds the SSI check: a committing transaction that both
       read something a concurrent transaction overwrote (in-conflict) and
       wrote something a concurrent transaction read (out-conflict) is a
       pivot and is aborted with SQLSTATE 40001.
   Not implemented: predicate locks over ranges — the scenarios only read
   named rows, so key-level tracking is faithful for them.

   The same button presses produce different outcomes purely from the
   isolation level, which is the whole lesson.

   Mount: <div class="demo" id="isolation-demo"></div> */
(function () {
  "use strict";

  /* ---------- the miniature engine ---------- */

  function makeDb(initial) {
    const history = new Map(); // key -> [{ val, seq }]
    let seq = 0;
    for (const [k, v] of Object.entries(initial)) history.set(k, [{ val: v, seq: 0 }]);

    const committed = []; // { reads:Set, writes:Set, startSeq, commitSeq }
    const active = new Set();

    function snapshotRead(key, atSeq) {
      const versions = history.get(key) || [];
      for (let i = versions.length - 1; i >= 0; i--) {
        if (versions[i].seq <= atSeq) return versions[i].val;
      }
      return undefined;
    }

    function latest(key) {
      const versions = history.get(key) || [];
      return versions[versions.length - 1];
    }

    function begin(name, level) {
      const t = {
        name, level, startSeq: null, reads: new Set(), writes: new Map(),
        status: "active", blockedOn: null, waitLog: null,
      };
      active.add(t);
      return t;
    }

    function ensureSnapshot(t) {
      if (t.startSeq === null) t.startSeq = seq;
    }

    function read(t, key) {
      ensureSnapshot(t);
      if (t.writes.has(key)) return t.writes.get(key);
      const at = t.level === "read committed" ? seq : t.startSeq;
      t.reads.add(key);
      return snapshotRead(key, at);
    }

    /* update returns { ok } | { blocked } | { error } */
    function update(t, key, val) {
      ensureSnapshot(t);
      const writer = [...active].find((o) => o !== t && o.writes.has(key) && o.status === "active");
      if (writer) {
        t.blockedOn = { key, val, writer };
        return { blocked: writer.name };
      }
      const cur = latest(key);
      if (t.level !== "read committed" && cur.seq > t.startSeq) {
        t.status = "aborted";
        active.delete(t);
        return { error: "could not serialize access due to concurrent update" };
      }
      t.writes.set(key, val);
      return { ok: true, val };
    }

    /* called after another transaction finishes, to resolve a block */
    function resolveBlock(t) {
      if (!t.blockedOn || t.blockedOn.writer.status === "active") return null;
      const { key, val } = t.blockedOn;
      t.blockedOn = null;
      if (t.level === "read committed") {
        // re-evaluate against the now-current row and proceed
        t.writes.set(key, val);
        return { ok: true, val };
      }
      t.status = "aborted";
      active.delete(t);
      return { error: "could not serialize access due to concurrent update" };
    }

    function commit(t) {
      ensureSnapshot(t);
      if (t.level === "serializable") {
        // in-conflict: a concurrent committed txn overwrote something t read
        const inConflict = committed.some((c) =>
          c.commitSeq > t.startSeq &&
          [...t.reads].some((k) => c.writes.has(k)));
        // out-conflict: a concurrent txn (still active, or committed after our
        // snapshot) read something t writes
        const outActive = [...active].some((o) =>
          o !== t && [...t.writes.keys()].some((k) => o.reads.has(k)));
        const outCommitted = committed.some((c) =>
          c.commitSeq > t.startSeq &&
          [...t.writes.keys()].some((k) => c.reads.has(k)));
        if (inConflict && (outActive || outCommitted)) {
          t.status = "aborted";
          active.delete(t);
          return { error: "could not serialize access due to read/write dependencies among transactions" };
        }
      }
      seq++;
      for (const [k, v] of t.writes) {
        if (!history.has(k)) history.set(k, []);
        history.get(k).push({ val: v, seq });
      }
      committed.push({
        reads: new Set(t.reads),
        writes: new Set(t.writes.keys()),
        startSeq: t.startSeq, commitSeq: seq,
      });
      t.status = "committed";
      active.delete(t);
      return { ok: true };
    }

    return {
      begin, read, update, commit, resolveBlock,
      state: () => {
        const out = {};
        for (const key of history.keys()) out[key] = snapshotRead(key, seq);
        return out;
      },
    };
  }

  /* ---------- scenarios ----------
     Each step: which session, the SQL-ish label, and what it does. The engine
     decides the outcome; the scenario only supplies the interleaving. */

  const SCENARIOS = {
    "nonrepeatable": {
      title: "Non-repeatable read",
      initial: { "balance(alice)": 100 },
      invariant: null,
      steps: [
        { s: "A", sql: "BEGIN; SELECT balance WHERE name='alice'", run: (db, t) => ({ text: `→ ${db.read(t, "balance(alice)")}` }) },
        { s: "B", sql: "BEGIN; UPDATE accounts SET balance = 200 WHERE name='alice'", run: (db, t) => stepUpdate(db, t, "balance(alice)", 200) },
        { s: "B", sql: "COMMIT", run: (db, t) => stepCommit(db, t) },
        { s: "A", sql: "SELECT balance WHERE name='alice'  -- again", run: (db, t) => ({ text: `→ ${db.read(t, "balance(alice)")}`, note: "same transaction, same query" }) },
        { s: "A", sql: "COMMIT", run: (db, t) => stepCommit(db, t) },
      ],
      verdict: (log) => {
        const first = log.find((l) => l.step === 0).text, again = log.find((l) => l.step === 3).text;
        return first === again
          ? { ok: true, text: `Both reads returned ${first.slice(2)} — the snapshot held for the whole transaction. No anomaly.` }
          : { ok: false, text: `The same query returned ${first.slice(2)}, then ${again.slice(2)} — a non-repeatable read. READ COMMITTED takes a new snapshot per statement, so B's commit became visible mid-transaction.` };
      },
    },
    "lost-update": {
      title: "Lost update",
      initial: { "counter": 10 },
      invariant: null,
      steps: [
        { s: "A", sql: "BEGIN; SELECT n FROM counter", run: (db, t) => { t.appRead = db.read(t, "counter"); return { text: `→ ${t.appRead}` }; } },
        { s: "B", sql: "BEGIN; SELECT n FROM counter", run: (db, t) => { t.appRead = db.read(t, "counter"); return { text: `→ ${t.appRead}` }; } },
        { s: "B", sql: "UPDATE counter SET n = 11  -- computed in app code from the 10 it read", run: (db, t) => stepUpdate(db, t, "counter", t.appRead + 1) },
        { s: "B", sql: "COMMIT", run: (db, t) => stepCommit(db, t) },
        { s: "A", sql: "UPDATE counter SET n = 11  -- also computed from its own stale read", run: (db, t) => stepUpdate(db, t, "counter", t.appRead + 1) },
        { s: "A", sql: "COMMIT", run: (db, t) => stepCommit(db, t) },
      ],
      verdict: (log, db, txns) => {
        if (txns.A.status === "aborted")
          return { ok: true, text: "A got a serialization failure instead of silently overwriting B's increment: first-updater-wins saw the row change under A's snapshot. Retry A and the counter reaches 12. (At READ COMMITTED you avoid this only by writing n = n + 1 in SQL, or SELECT … FOR UPDATE.)" };
        const n = db.state()["counter"];
        return n === 12
          ? { ok: true, text: "Counter reached 12 — nothing lost." }
          : { ok: false, text: `Counter is ${n}, but two increments ran — B's update was silently overwritten. That is a lost update: both computed 10+1 from their own reads, and READ COMMITTED let the second write win.` };
      },
    },
    "write-skew": {
      title: "Write skew (the REPEATABLE READ surprise)",
      initial: { "oncall(alice)": true, "oncall(bob)": true },
      invariant: "at least one doctor stays on call",
      steps: [
        { s: "A", sql: "BEGIN; SELECT count(*) WHERE oncall  -- policy: must stay ≥ 1", run: (db, t) => ({ text: `→ ${countOnCall(db, t)}` }) },
        { s: "B", sql: "BEGIN; SELECT count(*) WHERE oncall  -- same check", run: (db, t) => ({ text: `→ ${countOnCall(db, t)}` }) },
        { s: "A", sql: "UPDATE doctors SET oncall = false WHERE name='alice'", run: (db, t) => stepUpdate(db, t, "oncall(alice)", false) },
        { s: "B", sql: "UPDATE doctors SET oncall = false WHERE name='bob'", run: (db, t) => stepUpdate(db, t, "oncall(bob)", false) },
        { s: "A", sql: "COMMIT", run: (db, t) => stepCommit(db, t) },
        { s: "B", sql: "COMMIT", run: (db, t) => stepCommit(db, t) },
      ],
      verdict: (log, db, txns) => {
        if (txns.A.status === "aborted" || txns.B.status === "aborted") {
          const who = txns.A.status === "aborted" ? "A" : "B";
          return { ok: true, text: `${who} was aborted at COMMIT: SSI saw that each transaction wrote what the other had read (a dangerous structure) and cancelled one. Retry ${who} — its re-read finds only one doctor on call, and the check stops the update.` };
        }
        const s = db.state();
        const on = (s["oncall(alice)"] ? 1 : 0) + (s["oncall(bob)"] ? 1 : 0);
        return on >= 1
          ? { ok: true, text: "One doctor is still on call — the invariant held." }
          : { ok: false, text: "Both doctors went off call — the invariant \"at least one on call\" is broken, yet no statement failed. Each transaction's check passed against its own snapshot, and they wrote to different rows, so even REPEATABLE READ has nothing to object to. This is write skew — the anomaly only SERIALIZABLE prevents." };
      },
    },
  };

  function countOnCall(db, t) {
    return (db.read(t, "oncall(alice)") ? 1 : 0) + (db.read(t, "oncall(bob)") ? 1 : 0);
  }
  function stepUpdate(db, t, key, val) {
    const r = db.update(t, key, val);
    if (r.blocked) return { text: `… blocks (row locked by ${r.blocked})`, blocked: true };
    if (r.error) return { text: `ERROR: ${r.error}`, error: true };
    return { text: "UPDATE 1" };
  }
  function stepCommit(db, t) {
    const r = db.commit(t);
    if (r.error) return { text: `ERROR: ${r.error}\nROLLBACK`, error: true };
    return { text: "COMMIT" };
  }

  /* ---------- UI ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function init(mount) {
    let level = "read committed";
    let scenarioKey = "nonrepeatable";
    let db, txns, cursor, log, blockedQueue;

    const bar = el("div", "filter-bar");
    const levelSel = document.createElement("select");
    levelSel.setAttribute("aria-label", "Isolation level");
    for (const l of ["read committed", "repeatable read", "serializable"]) {
      const o = document.createElement("option");
      o.value = l; o.textContent = l.toUpperCase();
      levelSel.appendChild(o);
    }
    const scenSel = document.createElement("select");
    scenSel.setAttribute("aria-label", "Scenario");
    for (const [k, s] of Object.entries(SCENARIOS)) {
      const o = document.createElement("option");
      o.value = k; o.textContent = s.title;
      scenSel.appendChild(o);
    }
    const stepBtn = el("button", "action", "step");
    const runBtn = el("button", "action", "run all");
    const resetBtn = el("button", "action secondary", "reset");
    stepBtn.type = runBtn.type = resetBtn.type = "button";
    bar.append(scenSel, levelSel, stepBtn, runBtn, resetBtn);

    const grid = el("div", "iso-grid");
    const colA = el("div", "iso-session"); const colB = el("div", "iso-session");
    const headA = el("div", "side-label", "Session A"); const headB = el("div", "side-label", "Session B");
    const logA = el("ol", "iso-log"); const logB = el("ol", "iso-log");
    colA.append(headA, logA); colB.append(headB, logB);
    grid.append(colA, colB);

    const stateBox = el("div", "iso-state");
    const verdict = el("div", "iso-verdict");

    mount.replaceChildren(bar, grid, stateBox, verdict);

    function reset() {
      const sc = SCENARIOS[scenarioKey];
      db = makeDb(sc.initial);
      txns = { A: db.begin("A", level), B: db.begin("B", level) };
      cursor = 0; log = []; blockedQueue = [];
      logA.replaceChildren(); logB.replaceChildren();
      verdict.textContent = ""; verdict.className = "iso-verdict";
      renderState();
      stepBtn.disabled = runBtn.disabled = false;
    }

    function renderState() {
      const s = db.state();
      const rows = Object.entries(s).map(([k, v]) => `${k} = ${v}`).join("   ·   ");
      stateBox.textContent = `committed state:   ${rows}`;
    }

    function addLine(session, sql, result) {
      const li = el("li", result?.error ? "err" : "");
      li.appendChild(el("code", null, sql));
      if (result?.text) li.appendChild(el("span", "result", " " + result.text));
      (session === "A" ? logA : logB).appendChild(li);
    }

    function step() {
      const sc = SCENARIOS[scenarioKey];
      if (cursor >= sc.steps.length) return finish();

      const st = sc.steps[cursor];
      const t = txns[st.s];
      if (t.status !== "active") {
        addLine(st.s, st.sql, { text: "-- skipped: transaction already " + t.status });
        log.push({ step: cursor, text: "skipped" });
        cursor++;
        if (cursor >= sc.steps.length) finish();
        return;
      }
      const result = st.run(db, t) || {};
      addLine(st.s, st.sql, result);
      log.push({ step: cursor, text: result.text || "", error: !!result.error });
      if (result.blocked) blockedQueue.push({ session: st.s });
      cursor++;

      // a finished transaction may unblock the other session's pending UPDATE
      for (const b of blockedQueue.splice(0)) {
        const bt = txns[b.session];
        const r = db.resolveBlock(bt);
        if (r) addLine(b.session, "-- lock released", r.error ? { text: "ERROR: " + r.error + "\nROLLBACK", error: true } : { text: "UPDATE 1 (re-evaluated)" });
        else if (bt.blockedOn) blockedQueue.push(b); // still waiting
      }

      renderState();
      if (cursor >= sc.steps.length) finish();
    }

    function finish() {
      stepBtn.disabled = runBtn.disabled = true;
      const sc = SCENARIOS[scenarioKey];
      const v = sc.verdict(log, db, txns);
      verdict.textContent = v.text;
      verdict.className = "iso-verdict " + (v.ok ? "ok" : "broken");
    }

    stepBtn.addEventListener("click", step);
    runBtn.addEventListener("click", () => { while (!stepBtn.disabled) step(); });
    resetBtn.addEventListener("click", reset);
    levelSel.addEventListener("change", () => { level = levelSel.value; reset(); });
    scenSel.addEventListener("change", () => { scenarioKey = scenSel.value; reset(); });

    reset();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const mount = document.getElementById("isolation-demo");
    if (mount) init(mount);
  });
})();
