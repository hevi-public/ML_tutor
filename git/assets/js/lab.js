/* Git Tutor — the lab runner.  window.GTLab

   Same shape as the bass tutor's practice.js: the page declares data, this
   module renders it and keeps a log in localStorage. Here the payload is a
   sandbox exercise rather than a bass riff, so it also seeds a repository,
   mounts the terminal, and re-checks the goals after every command.

   Block shape (see assets/lab-template.html):

     <div class="lab-root"></div>
     <script type="application/json" class="lab">
     { "pageId": "interactive-rebase",
       "labs": [
         { "id": "interactive-rebase-squash",
           "title": "Squash three commits into one",
           "fixture": "wip-3",
           "start": "feature/report",
           "task": "Turn the three WIP commits into one, without changing a file.",
           "show": ["dag", "objects"],
           "goals": [ { "text": "one commit on top of main",
                        "check": { "commitCount": { "since": "main", "eq": 1 } } } ],
           "hints": ["…"],
           "solution": ["git rebase -i HEAD~3", "# change pick to squash on lines 2-3"] } ] }
     </script>

   Labs render into <div data-lab-slot="<id>"> when one exists, falling back to
   the shared .lab-root — the same convention practice.js uses.

   Progress: finishing a lab records it under "git-tutor:labs" through
   GitProgress.recordLab, and marks the page's quiz id complete only when the
   quiz is done, so the two halves stay independent.                          */
(function (root) {
  "use strict";

  const GT = root.GT;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* ---------- the environment note ----------
     Labs need IndexedDB, which browsers deny to pages opened straight off disk.
     Rather than fail, say what to do — the same courtesy glossary.js extends
     when its fetch() is blocked. */

  function renderUnavailable(host, reason) {
    const box = el("div", "box prereq");
    box.appendChild(el("span", "label", "The sandbox needs a server"));
    const p = el("p");
    p.innerHTML = reason;
    box.appendChild(p);
    host.appendChild(box);
  }

  /* ---------- one lab ---------- */

  async function renderLab(spec, host, pageId) {
    const labId = spec.id;
    host.classList.add("lab-card");
    host.id = `lab-${labId}`;

    const heading = el("h3", null, spec.title);
    host.appendChild(heading);

    if (spec.task) {
      const task = el("p", "lab-task");
      task.innerHTML = spec.task;
      host.appendChild(task);
    }

    const fixture = root.GTFix.describe(spec.fixture);
    if (fixture) {
      const about = el("p", "hint",
        `Sandbox: ${fixture.title}. ${fixture.about || ""}`);
      host.appendChild(about);
    }

    // Seed (or reuse) this lab's repository.
    const dir = await GT.open(labId, spec.fixture);
    if (spec.start) {
      // Start the learner on the branch the exercise is about.
      const current = await GT.headRef(dir);
      if (current !== `refs/heads/${spec.start}` && await GT.resolve(dir, `refs/heads/${spec.start}`)) {
        await root.GTCli.run({ dir, labId }, `git checkout ${spec.start}`);
      }
    }
    const repo = {
      dir,
      labId,
      fixture: spec.fixture,
      fixtureTip: await GT.resolve(dir, "HEAD"),
    };

    /* goals */

    const goalList = el("ul", "goal-list");
    goalList.setAttribute("role", "status");
    const goalRows = (spec.goals || []).map((goal) => {
      const li = el("li", "goal");
      li.appendChild(el("span", "goal-mark", "○"));
      li.appendChild(el("span", "goal-text", goal.text));
      li.appendChild(el("span", "goal-detail", ""));
      goalList.appendChild(li);
      return { goal, li };
    });

    // A free-play lab has nothing to prove — it's a sandbox with a reset button.
    if (!spec.free) {
      const goalsBox = el("section", "lab-goals");
      goalsBox.appendChild(el("h4", null, "Done when"));
      goalsBox.appendChild(goalList);
      host.appendChild(goalsBox);
    }

    /* widgets */

    const show = spec.show || ["dag"];
    const terminalHost = el("div", "lab-term");
    host.appendChild(terminalHost);

    let dag = null;
    let objects = null;

    if (show.includes("dag")) {
      const section = el("section", "lab-viz");
      section.appendChild(el("h4", null, "The graph, right now"));
      const dagHost = el("div");
      section.appendChild(dagHost);
      host.appendChild(section);
      dag = root.GTDag.mount(dagHost, {
        dir,
        includeUnreachable: Boolean(spec.showUnreachable),
        onSelect: (node) => {
          if (objects) objects.show(node.oid);
          terminal.insert(`git show ${node.short}`);
        },
      });
    }

    if (show.includes("objects")) {
      const details = el("details", "layer");
      details.appendChild(Object.assign(document.createElement("summary"), {
        textContent: "Look inside .git",
      }));
      const body = el("div", "layer-body");
      const objHost = el("div");
      body.appendChild(objHost);
      details.appendChild(body);
      host.appendChild(details);
      objects = root.GTObjects.mount(objHost, { dir, start: spec.inspect || "HEAD" });
    }

    /* status line + buttons */

    const outcome = el("p", "lab-outcome");
    outcome.setAttribute("role", "status");
    host.appendChild(outcome);

    const buttons = el("div", "buttons");
    const check = el("button", "action", "Check my work");
    check.type = "button";
    if (spec.free) check.hidden = true;
    const hintButton = el("button", "action secondary", "Hint");
    hintButton.type = "button";
    const solutionButton = el("button", "action secondary", "Show one solution");
    solutionButton.type = "button";
    const resetButton = el("button", "action secondary", "Reset sandbox");
    resetButton.type = "button";
    buttons.append(check, hintButton, solutionButton, resetButton);
    host.appendChild(buttons);

    const notes = el("div", "lab-notes");
    host.appendChild(notes);

    let hintsShown = 0;
    let assisted = false;
    let solved = false;

    hintButton.addEventListener("click", () => {
      const hints = spec.hints || [];
      if (hintsShown >= hints.length) {
        hintButton.disabled = true;
        return;
      }
      assisted = true;
      const note = el("p", "lab-hint");
      note.innerHTML = `<strong>Hint ${hintsShown + 1}:</strong> ${hints[hintsShown]}`;
      notes.appendChild(note);
      hintsShown++;
      if (hintsShown >= hints.length) hintButton.disabled = true;
    });

    solutionButton.addEventListener("click", () => {
      assisted = true;
      solutionButton.disabled = true;
      const note = el("div", "lab-solution");
      note.appendChild(el("h5", null, "One way to do it"));
      const pre = el("pre");
      pre.textContent = (spec.solution || []).join("\n");
      note.appendChild(pre);
      notes.appendChild(note);
    });

    resetButton.addEventListener("click", async () => {
      resetButton.disabled = true;
      resetButton.textContent = "Resetting…";
      await GT.reset(labId, spec.fixture);
      if (spec.start) await root.GTCli.run({ dir, labId }, `git checkout ${spec.start}`);
      repo.fixtureTip = await GT.resolve(dir, "HEAD");
      terminal.clear();
      terminal.write("(sandbox reset to its starting state)", "term-note");
      await refresh();
      resetButton.disabled = false;
      resetButton.textContent = "Reset sandbox";
    });

    /* the check loop */

    async function refresh() {
      let allPass = goalRows.length > 0 && !spec.free;
      for (const row of goalRows) {
        const result = await root.GTChecks.evaluate(repo, row.goal.check);
        row.li.dataset.state = result.pass ? "pass" : "todo";
        row.li.querySelector(".goal-mark").textContent = result.pass ? "✓" : "○";
        row.li.querySelector(".goal-detail").textContent = result.detail || "";
        if (!result.pass) allPass = false;
      }
      if (dag) await dag.refresh();
      if (objects) await objects.refresh();

      if (allPass && !solved) {
        solved = true;
        outcome.className = "lab-outcome done";
        outcome.textContent = assisted
          ? "That's it — with a nudge. Try it once more from a reset sandbox and it'll stick."
          : "That's it. Every goal checks out against the real repository.";
        if (root.GitProgress) root.GitProgress.recordLab(labId, { assisted, pageId });
      } else if (!allPass && solved) {
        // The learner kept going and moved away from the finished state.
        solved = false;
        outcome.className = "lab-outcome";
        outcome.textContent = "";
      }
      return allPass;
    }

    const terminal = root.GTTerm.mount(terminalHost, {
      dir,
      labId,
      onAfterCommand: refresh,
    });

    check.addEventListener("click", async () => {
      const done = await refresh();
      if (!done) {
        outcome.className = "lab-outcome";
        outcome.textContent = "Not there yet — the unticked goals above say what's missing.";
      }
    });

    if (root.GitProgress && root.GitProgress.isLabDone(labId)) {
      const done = el("p", "hint", "You've finished this one before. " +
        "The sandbox keeps whatever state you left it in — reset it to start over.");
      host.insertBefore(done, terminalHost);
    }

    for (const line of spec.prelude || []) {
      await terminal.run(line);
    }
    await refresh();
    return { refresh, terminal, repo };
  }

  /* ---------- page wiring ---------- */

  async function init() {
    const dataEl = document.querySelector('script.lab[type="application/json"]');
    if (!dataEl) return;
    const roots = [...document.querySelectorAll(".lab-root")];
    if (!roots.length) return;

    let block;
    try {
      block = JSON.parse(dataEl.textContent);
    } catch (error) {
      console.warn("lab.js: bad lab JSON", error);
      return;
    }

    const status = GT.available();
    if (!status.ok) {
      for (const host of roots) renderUnavailable(host, status.reason);
      return;
    }

    for (const spec of block.labs || []) {
      const slot = spec.id && document.querySelector(`[data-lab-slot="${spec.id}"]`);
      const host = slot || roots[0];
      if (!host) continue;
      try {
        await renderLab(spec, host, block.pageId);
      } catch (error) {
        console.error("lab.js: could not start lab", spec.id, error);
        const box = el("div", "box");
        box.appendChild(el("span", "label", "This lab didn't start"));
        box.appendChild(el("p", null, String(error.message || error)));
        host.appendChild(box);
      }
    }

    // Deep links like page.html#lab-<id> land on the card.
    if (location.hash.startsWith("#lab-")) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  root.GTLab = { renderLab };
})(window);
