/* Git Tutor — the object explorer.  window.GTObjects

   Two views over the sandbox, both showing real file content read from the
   filesystem, never a mock-up:

     Objects — click from a commit to its tree to a blob, with the exact bytes
               that get hashed ("blob 42\0…"), the id they hash to, and the path
               the object lives at under .git/objects/.
     .git    — HEAD, refs/, the index, logs/HEAD, and whichever state files
               happen to exist right now (MERGE_HEAD, rebase-merge/…, BISECT_*).
               Watching these appear and vanish while you work is the fastest
               way to stop finding git's states mysterious.                   */
(function (root) {
  "use strict";

  const GT = root.GT;
  const P = () => root.GTPlumb;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* ---------- object view ---------- */

  async function renderObject(host, dir, spec, navigate) {
    host.innerHTML = "";
    let oid;
    try {
      oid = await P().revParse(dir, spec);
    } catch {
      host.appendChild(el("p", "hint", `Nothing here resolves to "${spec}".`));
      return;
    }
    let type;
    let pretty;
    try {
      type = await P().objectType(dir, oid);
      pretty = await P().catFilePretty(dir, oid);
    } catch (error) {
      // A ref can point at a missing object mid-experiment. Say so rather than
      // taking the page down with us.
      host.appendChild(el("p", "hint",
        `${oid.slice(0, 7)} resolves, but the object isn't in the database: ` +
        `${error.message || error}`));
      return;
    }
    const bytes = new TextEncoder().encode(pretty).length;

    const head = el("div", "obj-head");
    head.appendChild(el("span", "obj-type", type));
    head.appendChild(el("code", "obj-oid", oid));
    host.appendChild(head);

    const path = el("p", "obj-path");
    path.innerHTML = `stored at <code>.git/objects/${oid.slice(0, 2)}/${oid.slice(2)}</code>` +
      ` — <code>git cat-file -p ${oid.slice(0, 7)}</code>`;
    host.appendChild(path);

    if (type === "commit") {
      const { commit } = await root.git.readCommit({ ...GT.ctx(dir), oid });
      const table = el("table", "ref");
      const rows = [
        ["tree", commit.tree, true],
        ...commit.parent.map((p) => ["parent", p, true]),
        ["author", `${commit.author.name} <${commit.author.email}>`, false],
        ["committer", `${commit.committer.name} <${commit.committer.email}>`, false],
        ["message", commit.message.trim(), false],
      ];
      for (const [key, value, clickable] of rows) {
        const tr = el("tr");
        tr.appendChild(el("th", null, key));
        const td = el("td");
        if (clickable) {
          const link = el("button", "obj-link", value.slice(0, 12) + "…");
          link.type = "button";
          link.addEventListener("click", () => navigate(value));
          td.appendChild(link);
        } else {
          td.appendChild(el("code", null, value));
        }
        tr.appendChild(td);
        table.appendChild(tr);
      }
      host.appendChild(table);
    } else if (type === "tree") {
      const { tree } = await root.git.readTree({ ...GT.ctx(dir), oid });
      const table = el("table", "ref");
      const header = el("tr");
      for (const label of ["mode", "type", "object", "name"]) {
        header.appendChild(el("th", null, label));
      }
      table.appendChild(header);
      for (const entry of tree) {
        const tr = el("tr");
        tr.appendChild(el("td", null, entry.mode.padStart(6, "0")));
        tr.appendChild(el("td", null, entry.type));
        const td = el("td");
        const link = el("button", "obj-link", entry.oid.slice(0, 7));
        link.type = "button";
        link.addEventListener("click", () => navigate(entry.oid));
        td.appendChild(link);
        tr.appendChild(td);
        tr.appendChild(el("td", null, entry.path));
        table.appendChild(tr);
      }
      host.appendChild(table);
    } else {
      // A blob: show the content and the bytes that produce its id.
      host.appendChild(el("pre", "obj-blob", pretty));
      const box = el("div", "box plain-english");
      box.appendChild(el("span", "label", "How that id was computed"));
      const formula = el("pre", "obj-hash");
      formula.textContent = `sha1("blob ${bytes}\\0" + contents) = ${oid}`;
      box.appendChild(formula);
      host.appendChild(box);
    }
  }

  /* ---------- .git view ---------- */

  const INTERESTING = [
    "HEAD", "ORIG_HEAD", "FETCH_HEAD", "MERGE_HEAD", "MERGE_MSG",
    "CHERRY_PICK_HEAD", "REVERT_HEAD",
    "BISECT_START", "BISECT_LOG",
    "logs/HEAD",
    "rebase-merge/git-rebase-todo", "rebase-merge/head-name", "rebase-merge/onto",
    "packed-refs", "config",
  ];

  async function renderGitDir(host, dir) {
    host.innerHTML = "";

    const files = [];
    for (const name of INTERESTING) {
      try {
        const raw = await GT.pfs().readFile(`${dir}/.git/${name}`, "utf8");
        files.push([name, typeof raw === "string" ? raw : new TextDecoder().decode(raw)]);
      } catch { /* not present right now — that's information too */ }
    }

    const refs = await P().allRefs(dir);
    const refRows = refs.filter((r) => r.full !== "HEAD" && r.oid);
    if (refRows.length) {
      const table = el("table", "ref");
      const header = el("tr");
      header.appendChild(el("th", null, "ref"));
      header.appendChild(el("th", null, "points at"));
      table.appendChild(header);
      for (const ref of refRows) {
        const tr = el("tr");
        tr.appendChild(el("td", null, ref.full));
        tr.appendChild(el("td", null, ref.oid.slice(0, 7)));
        table.appendChild(tr);
      }
      const section = el("section", "obj-section");
      section.appendChild(el("h4", null, "refs"));
      section.appendChild(table);
      host.appendChild(section);
    }

    const index = await root.git.listFiles(GT.ctx(dir));
    if (index.length) {
      const section = el("section", "obj-section");
      section.appendChild(el("h4", null, `the index (${index.length} entries)`));
      section.appendChild(el("pre", null, index.join("\n")));
      host.appendChild(section);
    }

    for (const [name, contents] of files) {
      const section = el("section", "obj-section");
      section.appendChild(el("h4", null, `.git/${name}`));
      section.appendChild(el("pre", null, contents.length > 2000
        ? contents.slice(0, 2000) + "\n…"
        : contents));
      host.appendChild(section);
    }

    const loose = await P().looseObjects(dir);
    const section = el("section", "obj-section");
    section.appendChild(el("h4", null, `.git/objects — ${loose.length} loose objects`));
    section.appendChild(el("p", "hint",
      "Every one of these is a file whose name is the hash of its contents. " +
      "Nothing here is packed: this engine never runs gc."));
    host.appendChild(section);
  }

  /* ---------- mount ---------- */

  function mount(host, options = {}) {
    const { dir } = options;
    host.classList.add("obj");
    host.innerHTML = "";

    const tabs = el("div", "obj-tabs");
    const objectTab = el("button", "obj-tab", "Objects");
    objectTab.type = "button";
    const gitTab = el("button", "obj-tab", ".git");
    gitTab.type = "button";
    tabs.append(objectTab, gitTab);

    const bar = el("form", "obj-bar");
    const label = el("label", "sr-only", "Object or revision to inspect");
    label.htmlFor = "obj-spec";
    const input = el("input", "obj-spec");
    input.id = "obj-spec";
    input.value = options.start || "HEAD";
    input.spellcheck = false;
    const go = el("button", "action secondary", "Inspect");
    go.type = "submit";
    bar.append(label, input, go);

    const body = el("div", "obj-body");
    host.append(tabs, bar, body);

    let view = "objects";
    let current = options.start || "HEAD";
    const trail = [];

    async function render() {
      if (view === "objects") {
        bar.hidden = false;
        await renderObject(body, dir, current, async (oid) => {
          trail.push(current);
          current = oid;
          input.value = oid;
          await render();
        });
        if (trail.length) {
          const back = el("button", "action secondary", "← back");
          back.type = "button";
          back.addEventListener("click", async () => {
            current = trail.pop();
            input.value = current;
            await render();
          });
          body.appendChild(back);
        }
      } else {
        bar.hidden = true;
        await renderGitDir(body, dir);
      }
      objectTab.setAttribute("aria-pressed", String(view === "objects"));
      gitTab.setAttribute("aria-pressed", String(view === "git"));
    }

    bar.addEventListener("submit", async (event) => {
      event.preventDefault();
      current = input.value.trim() || "HEAD";
      trail.length = 0;
      await render();
    });
    objectTab.addEventListener("click", async () => {
      view = "objects";
      await render();
    });
    gitTab.addEventListener("click", async () => {
      view = "git";
      await render();
    });

    render();
    return {
      refresh: render,
      show: async (spec) => {
        view = "objects";
        current = spec;
        input.value = spec;
        await render();
      },
    };
  }

  root.GTObjects = { mount, renderObject, renderGitDir };
})(window);
