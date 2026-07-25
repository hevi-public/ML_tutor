/* Git Tutor — the terminal widget.  window.GTTerm

   A real prompt over a real repository. The prompt itself teaches: it shows the
   current branch, a * when the worktree is dirty, and the in-progress state
   (REBASE-i 2/3, BISECTING, detached HEAD) that beginners never notice in their
   own shell.

   Contract:
     GTTerm.mount(el, { dir, labId, onAfterCommand })
   Everything typed goes through GTCli, so the sandbox and the lesson prose can
   never drift apart. Commands that need an editor come back as an `action` and
   open an in-page editor — including the interactive-rebase todo list, which is
   written to the real .git/rebase-merge/git-rebase-todo.                     */
(function (root) {
  "use strict";

  const GT = root.GT;
  const HISTORY_KEY = "git-tutor:history";

  function loadHistory(labId) {
    try {
      return (JSON.parse(localStorage.getItem(HISTORY_KEY)) || {})[labId] || [];
    } catch {
      return [];
    }
  }

  function saveHistory(labId, lines) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch { /* fresh */ }
    all[labId] = lines.slice(-100);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(all)); } catch { /* full */ }
  }

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* ---------- the editor overlay ----------
     Stands in for $EDITOR: git opens vim, we open a textarea. The file being
     edited is real either way. */

  function openEditor(host, { title, hint, contents, filename, onSave, onCancel }) {
    const overlay = el("div", "term-editor");
    overlay.innerHTML = "";
    const panel = el("div", "term-editor-panel");
    panel.appendChild(el("h3", null, title));
    if (filename) panel.appendChild(el("p", "term-editor-file", filename));
    if (hint) {
      const note = el("p", "hint");
      note.innerHTML = hint;
      panel.appendChild(note);
    }
    const area = el("textarea", "term-editor-area");
    area.value = contents;
    area.spellcheck = false;
    area.setAttribute("aria-label", title);
    panel.appendChild(area);

    const buttons = el("div", "buttons");
    const save = el("button", "action", "Save and close");
    save.type = "button";
    const cancel = el("button", "action secondary", "Cancel");
    cancel.type = "button";
    buttons.append(save, cancel);
    panel.appendChild(buttons);
    overlay.appendChild(panel);
    host.appendChild(overlay);
    area.focus();

    const close = () => overlay.remove();
    save.addEventListener("click", () => {
      close();
      onSave(area.value);
    });
    cancel.addEventListener("click", () => {
      close();
      if (onCancel) onCancel();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        close();
        if (onCancel) onCancel();
      }
      // Ctrl/Cmd+Enter saves, the habit every editor rewards.
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        close();
        onSave(area.value);
      }
    });
  }

  /* ---------- mount ---------- */

  function mount(host, options = {}) {
    const { dir, labId = "sandbox" } = options;
    let history = loadHistory(labId);
    let historyAt = history.length;
    let busy = false;

    host.classList.add("term");
    host.innerHTML = "";

    const out = el("div", "term-out");
    out.setAttribute("role", "log");
    out.setAttribute("aria-live", "polite");
    out.setAttribute("aria-label", "Terminal output");
    out.tabIndex = 0;

    const form = el("form", "term-form");
    const prompt = el("span", "term-prompt", "$");
    const input = el("input", "term-in");
    input.type = "text";
    input.autocapitalize = "off";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("autocorrect", "off");
    input.setAttribute("enterkeyhint", "go");
    input.setAttribute("aria-label", "Type a git command");
    form.append(prompt, input);

    // Touch keyboards hide the characters git needs most.
    const keys = el("div", "term-keys");
    for (const chip of ["git ", "HEAD~", "-i ", "--", "^", "@{1}", "|", "Tab", "↑"]) {
      const button = el("button", "term-key", chip.trim() || chip);
      button.type = "button";
      button.addEventListener("click", () => {
        if (chip === "Tab") return doComplete();
        if (chip === "↑") return recall(-1);
        input.value += chip;
        input.focus();
      });
      keys.appendChild(button);
    }

    host.append(out, form, keys);

    /* ---------- writing to the log ---------- */

    function write(text, className) {
      if (!text) return;
      const line = el("pre", className ? `term-line ${className}` : "term-line", text.replace(/\n$/, ""));
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    }

    function echo(line) {
      const row = el("pre", "term-line term-echo");
      row.textContent = `${promptText()} ${line}`;
      out.appendChild(row);
      out.scrollTop = out.scrollHeight;
    }

    let promptState = "$";
    const promptText = () => promptState;

    async function refreshPrompt() {
      const branch = await GT.headRef(dir);
      const parts = [];
      if (branch) parts.push(branch.replace("refs/heads/", ""));
      else {
        const oid = await GT.resolve(dir, "HEAD");
        parts.push(`HEAD detached at ${(oid || "").slice(0, 7)}`);
      }
      if (await root.GTPorc.rebaseInProgress(dir)) {
        const todo = (await root.GTPorc.readState(dir, "rebase-merge/git-rebase-todo")) || "";
        parts.push(`REBASE-i ${todo.split("\n").filter(Boolean).length} left`);
      }
      if (await root.GTPorc.readState(dir, "BISECT_START")) parts.push("BISECTING");
      if (await root.GTPorc.readState(dir, "MERGE_HEAD")) parts.push("MERGING");

      let dirty = "";
      try {
        const { staged, unstaged, untracked } = await root.GTCli.statusRows(dir);
        if (staged.length || unstaged.length || untracked.length) dirty = "*";
      } catch { /* fresh repo */ }

      promptState = `~/repo (${parts.join("|")}${dirty}) $`;
      prompt.textContent = promptState;
    }

    /* ---------- actions (the $EDITOR stand-ins) ---------- */

    async function handleAction(action) {
      if (action.kind === "clear") {
        out.innerHTML = "";
        return;
      }

      if (action.kind === "edit") {
        openEditor(host, {
          title: `Editing ${action.path}`,
          filename: action.path,
          contents: action.contents,
          hint: "This writes a real file in the sandbox worktree. " +
            "Stage it with <code>git add</code> afterwards.",
          onSave: async (text) => {
            await GT.writeFile(dir, action.path, text.endsWith("\n") ? text : text + "\n");
            write(`(saved ${action.path})`, "term-note");
            await after();
          },
        });
        return;
      }

      if (action.kind === "message") {
        openEditor(host, {
          title: "Commit message",
          contents: "",
          hint: "git would open your editor here. The first line is the subject.",
          onSave: async (text) => {
            if (!text.trim()) {
              write("Aborting commit due to empty commit message.", "term-err");
              return;
            }
            await runLine(`git commit -m ${JSON.stringify(text)}`, { silentEcho: true });
          },
          onCancel: () => write("Aborting commit due to empty commit message.", "term-err"),
        });
        return;
      }

      if (action.kind === "todo") {
        const Porc = root.GTPorc;
        const text = Porc.serializeTodo(action.todo) +
          "\n# Commands:\n" +
          "#  p, pick   = use commit as it is\n" +
          "#  r, reword = use commit, but edit the message\n" +
          "#  s, squash = meld into the previous commit, keeping both messages\n" +
          "#  f, fixup  = meld into the previous commit, discarding this message\n" +
          "#  d, drop   = remove commit\n" +
          "#\n# Lines are executed from top to bottom.\n";
        openEditor(host, {
          title: "git-rebase-todo",
          filename: ".git/rebase-merge/git-rebase-todo",
          contents: text,
          hint: "This is the real file <code>git rebase -i</code> hands to your " +
            "editor. Change the command at the start of a line, or reorder lines.",
          onSave: async (edited) => {
            const todo = Porc.parseTodo(edited, action.todo);
            if (!todo.length) {
              write("Nothing to do", "term-note");
              return;
            }
            try {
              const result = await Porc.rebase(dir, {
                onto: action.onto,
                upstream: action.upstream,
                todo,
                // Squashing with no explicit message keeps both, as git does.
              });
              if (result.conflicts) {
                write(result.conflicts.map((p) =>
                  `CONFLICT (content): Merge conflict in ${p}`).join("\n"), "term-err");
                write("Resolve them, `git add` the files, then `git rebase --continue`.", "term-note");
              } else {
                const branch = (await GT.headRef(dir))?.replace("refs/heads/", "");
                write(`Successfully rebased and updated refs/heads/${branch}.`);
              }
            } catch (error) {
              write(String(error.message || error), "term-err");
            }
            await after();
          },
          onCancel: async () => {
            write("Nothing to do — rebase aborted.", "term-note");
            await after();
          },
        });
      }
    }

    /* ---------- running ---------- */

    async function after() {
      await refreshPrompt();
      if (options.onAfterCommand) await options.onAfterCommand();
    }

    async function runLine(line, opts = {}) {
      if (busy) return;
      busy = true;
      input.disabled = true;
      if (!opts.silentEcho) echo(line);
      try {
        const result = await root.GTCli.run({ dir, labId }, line);
        if (result.stdout) write(result.stdout);
        if (result.stderr) write(result.stderr, "term-err");
        if (result.action) await handleAction(result.action);
      } catch (error) {
        write(`fatal: ${error.message || error}`, "term-err");
      } finally {
        busy = false;
        input.disabled = false;
        input.focus();
      }
      await after();
    }

    /* ---------- input handling ---------- */

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const line = input.value.trim();
      if (!line) return;
      input.value = "";
      history = [...history.filter((h) => h !== line), line];
      historyAt = history.length;
      saveHistory(labId, history);
      await runLine(line);
    });

    function recall(direction) {
      if (!history.length) return;
      historyAt = Math.max(0, Math.min(history.length, historyAt + direction));
      input.value = history[historyAt] || "";
      input.focus();
      // Put the caret at the end, where you want it when recalling a command.
      requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
    }

    async function doComplete() {
      const matches = await root.GTCli.complete({ dir }, input.value);
      if (!matches.length) return;
      const words = input.value.split(/(\s+)/);
      const partial = /\s$/.test(input.value) ? "" : words[words.length - 1];
      if (matches.length === 1) {
        input.value = input.value.slice(0, input.value.length - partial.length) + matches[0] + " ";
      } else {
        // Complete the shared prefix, then show the options like git does.
        let prefix = matches[0];
        for (const match of matches) {
          while (!match.startsWith(prefix)) prefix = prefix.slice(0, -1);
        }
        if (prefix.length > partial.length) {
          input.value = input.value.slice(0, input.value.length - partial.length) + prefix;
        }
        echo(input.value);
        write(matches.join("  "), "term-note");
      }
      input.focus();
    }

    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        recall(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        recall(1);
      } else if (event.key === "Tab") {
        event.preventDefault();
        doComplete();
      } else if (event.key === "l" && event.ctrlKey) {
        event.preventDefault();
        out.innerHTML = "";
      }
    });

    // Clicking anywhere in the widget focuses the prompt, like a real terminal.
    host.addEventListener("click", (event) => {
      if (event.target.closest("button, textarea, a")) return;
      if (window.getSelection()?.toString()) return;
      input.focus();
    });

    refreshPrompt();

    return {
      run: runLine,
      write,
      clear: () => { out.innerHTML = ""; },
      focus: () => input.focus(),
      refreshPrompt,
      transcript: () => [...out.querySelectorAll(".term-line")]
        .map((node) => node.textContent).join("\n"),
      insert: (text) => {
        input.value = text;
        input.focus();
      },
    };
  }

  root.GTTerm = { mount, openEditor };
})(window);
