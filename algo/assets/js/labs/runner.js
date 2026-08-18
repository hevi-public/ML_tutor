/* Algorithms Tutor — the lab engine (PLAN.md §4). A lab is: starter code in
   a <textarea>, executed inside a Web Worker with a timeout (an infinite
   loop becomes a teachable moment, not a frozen tab), graded by a test
   function that runs IN the worker and reports structured results.

   AlgoLabs.create(host, {
     id, pageId,            // progress bookkeeping (AlgoProgress.recordLab)
     title, task,           // shown above the editor (task may contain HTML)
     starter,               // initial editor contents
     fnName,                // the function the user must define
     testSource,            // JS source defining runTests(fn) → [{name, pass, detail}]
     timeoutMs,             // default 3000
     hint, solution,        // optional <details> content; opening marks assisted
   }) → { getCode() }

   The worker is built from a Blob so labs work from file:// and need no
   extra requests. User code runs with no DOM, no network (worker scope has
   fetch, but grading finishes in milliseconds and the sandbox is about
   honesty, not security — the code is the learner's own). */
(function () {
  "use strict";

  const WORKER_SRC = `
    self.onmessage = (e) => {
      const { code, fnName, testSource, imports } = e.data;
      const t0 = Date.now();
      try {
        if (imports && imports.length) importScripts.apply(self, imports);
        const fn = new Function(code + "\\n;return (typeof " + fnName +
          " !== 'undefined') ? " + fnName + " : undefined;")();
        if (typeof fn !== "function") {
          postMessage({ ok: false, error: "define a function named " + fnName });
          return;
        }
        const runTests = new Function(testSource + "\\n;return runTests;")();
        const results = runTests(fn);
        postMessage({ ok: true, results, ms: Date.now() - t0 });
      } catch (err) {
        postMessage({ ok: false, error: String((err && err.stack) || err).split("\\n")
          .slice(0, 3).join("\\n") });
      }
    };`;

  function create(host, config) {
    const timeoutMs = config.timeoutMs || 3000;
    const wrap = document.createElement("section");
    wrap.className = "lab";
    wrap.id = "lab-" + config.id;
    wrap.innerHTML = `
      <h3 style="margin-bottom:0.2rem">${config.title}</h3>
      <div class="lab-task">${config.task}</div>
      <textarea class="lab-code" spellcheck="false"
        style="width:100%;min-height:14rem;font-family:var(--mono);font-size:0.9rem;
        line-height:1.5;padding:0.7rem;border:1px solid var(--border);border-radius:8px;
        background:var(--bg-inset);color:var(--text);tab-size:2"></textarea>
      <div class="buttons" style="margin:0.5rem 0">
        <button type="button" class="action lab-run">▶ run the tests</button>
        <button type="button" class="action secondary lab-reset">reset code</button>
        <span class="hint lab-status" style="margin:0"></span>
      </div>
      <div class="lab-results" style="font-family:var(--mono);font-size:0.86rem;line-height:1.8"></div>
      ${config.hint ? `<details class="layer lab-hint"><summary>Hint (marks the lab assisted)</summary>
        <div class="layer-body">${config.hint}</div></details>` : ""}
      ${config.solution ? `<details class="layer lab-solution"><summary>Show a solution (marks the lab assisted)</summary>
        <div class="layer-body"><pre><code class="language-javascript">${escapeHtml(config.solution)}</code></pre></div></details>` : ""}
    `;
    host.appendChild(wrap);

    const editor = wrap.querySelector(".lab-code");
    const results = wrap.querySelector(".lab-results");
    const status = wrap.querySelector(".lab-status");
    editor.value = config.starter;

    // Tab inserts spaces instead of leaving the editor.
    editor.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const { selectionStart: s, selectionEnd: t } = editor;
        editor.value = editor.value.slice(0, s) + "  " + editor.value.slice(t);
        editor.selectionStart = editor.selectionEnd = s + 2;
      }
    });

    let assisted = false;
    for (const sel of [".lab-hint", ".lab-solution"]) {
      const d = wrap.querySelector(sel);
      if (d) d.addEventListener("toggle", () => { if (d.open) assisted = true; });
    }

    const workerUrl = URL.createObjectURL(
      new Blob([WORKER_SRC], { type: "application/javascript" }));

    function run() {
      status.textContent = "running…";
      results.innerHTML = "";
      const worker = new Worker(workerUrl);
      const timer = setTimeout(() => {
        worker.terminate();
        status.textContent = "";
        results.innerHTML = `<div style="color:var(--bad);font-weight:700">⏱ timed out after ${timeoutMs}ms —
          almost always an infinite loop. Check your loop bounds / recursion base case.</div>`;
      }, timeoutMs);

      worker.onmessage = (e) => {
        clearTimeout(timer);
        worker.terminate();
        status.textContent = "";
        const data = e.data;
        if (!data.ok) {
          results.innerHTML = `<div style="color:var(--bad);white-space:pre-wrap">✗ ${escapeHtml(data.error)}</div>`;
          return;
        }
        const all = data.results;
        const passed = all.filter((r) => r.pass).length;
        results.innerHTML = all.map((r) =>
          `<div style="color:${r.pass ? "var(--accent)" : "var(--bad)"}">` +
          `${r.pass ? "✓" : "✗"} ${escapeHtml(r.name)}` +
          (r.detail ? ` <span style="color:var(--text-soft)">— ${escapeHtml(String(r.detail))}</span>` : "") +
          `</div>`).join("") +
          `<div style="margin-top:0.4rem;font-weight:700">${passed}/${all.length} passed` +
          (passed === all.length ? " — lab complete! 🎉" + (assisted ? " (assisted)" : "") : "") +
          ` <span style="color:var(--text-soft);font-weight:400">(${data.ms}ms in the sandbox)</span></div>`;
        if (passed === all.length && window.AlgoProgress) {
          window.AlgoProgress.recordLab(config.id, { pageId: config.pageId, assisted });
        }
      };

      worker.postMessage({
        code: editor.value,
        fnName: config.fnName,
        testSource: config.testSource,
        // CHECKS (and anything else the tests need) loads inside the worker
        // from absolute URLs — Blob workers can't resolve relative paths.
        imports: (config.imports || ["assets/js/labs/checks.js"]).map((p) =>
          new URL(p.startsWith("assets/") ? "../" + p : p, location.href).href),
      });
    }

    wrap.querySelector(".lab-run").addEventListener("click", run);
    wrap.querySelector(".lab-reset").addEventListener("click", () => {
      editor.value = config.starter;
      results.innerHTML = "";
    });

    if (window.AlgoProgress && window.AlgoProgress.isLabDone(config.id)) {
      status.textContent = "✓ previously completed";
    }

    return { getCode: () => editor.value, run };
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  window.AlgoLabs = { create };
})();
