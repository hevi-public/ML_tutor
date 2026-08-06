/* Web Dev Reference — renders now/was change cards from the ledger.

   A page writes only the id:
     <div class="change" data-change="ng.templates.control-flow">
       <p class="change-note">optional page-specific prose, preserved</p>
     </div>

   Everything else — title, tool tag, version badges, the two sides, the "why",
   the migration command, the doc chips, the diff view — comes from
   web/data/changes.json. That is what keeps the deprecation ledger, the
   timeline and the pages from ever disagreeing. */
(function () {
  "use strict";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function codeBlock(source, language) {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    if (language) code.className = "language-" + language;
    code.textContent = source;
    pre.appendChild(code);
    return pre;
  }

  function languageFor(tool) {
    return tool === "pnpm" ? "yaml" : "typescript";
  }

  function renderSide(kind, label, summary, code, tool) {
    const side = el("div", `side ${kind}`);
    side.appendChild(el("span", "side-label", label));
    side.appendChild(el("div", "summary-line", summary));
    if (code) side.appendChild(codeBlock(code, languageFor(tool)));
    return side;
  }

  function renderDiff(change) {
    const wrap = el("div", "diff");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    // highlight.js re-tokenises a block and replaces its children, which would
    // wipe out the .del/.add spans — taking the diff colours and the copy
    // button's "strip removed lines" behaviour with them. Opt this block out:
    // here the line semantics matter more than token colours.
    code.className = "nohighlight";

    for (const line of WebRef.diffLines(change.code.was, change.code.now)) {
      if (line.type === "same") {
        code.appendChild(document.createTextNode(line.text + "\n"));
      } else {
        // The +/- markers are CSS ::before, so copying yields clean code.
        const span = el("span", line.type, line.text + "\n");
        code.appendChild(span);
      }
    }
    pre.appendChild(code);
    wrap.appendChild(pre);
    return wrap;
  }

  function renderCard(host, change, links) {
    host.id = host.id || `change-${change.id}`;
    host.dataset.tool = change.tool;

    /* --- head --- */
    const head = el("div", "change-head");
    head.appendChild(el("span", "change-title", change.title));
    head.appendChild(WebRef.toolTag(change.tool));
    for (const badge of WebRef.badgesFor(change)) head.appendChild(badge);

    /* --- body --- */
    const body = el("div", "change-body");

    // Keep whatever the page author wrote inside the element.
    const note = host.querySelector(".change-note");
    if (note) body.appendChild(note);

    const sides = el("div", "sides" + (change.code ? " split" : ""));
    sides.appendChild(renderSide("now", "Now", change.now, change.code?.now, change.tool));
    if (change.was) {
      sides.appendChild(renderSide("was", "Previously", change.was, change.code?.was, change.tool));
    }
    body.appendChild(sides);

    if (change.code && change.code.now && change.code.was) {
      const toggle = el("div", "view-toggle");
      const sideBySide = el("button", null, "side by side");
      const diffView = el("button", null, "diff");
      sideBySide.type = diffView.type = "button";
      sideBySide.setAttribute("aria-pressed", "true");
      diffView.setAttribute("aria-pressed", "false");

      const setView = (asDiff) => {
        host.classList.toggle("as-diff", asDiff);
        sideBySide.setAttribute("aria-pressed", String(!asDiff));
        diffView.setAttribute("aria-pressed", String(asDiff));
      };
      sideBySide.addEventListener("click", () => setView(false));
      diffView.addEventListener("click", () => setView(true));

      toggle.append(sideBySide, diffView);
      head.appendChild(toggle);
      body.appendChild(renderDiff(change));
    }

    if (change.why) {
      const why = el("div", "why");
      why.appendChild(el("span", "label", "Why it changed"));
      why.appendChild(document.createTextNode(change.why));
      body.appendChild(why);
    }

    if (change.migration) {
      const mig = el("p", "migration");
      mig.appendChild(document.createTextNode("Automated migration: "));
      const code = document.createElement("code");
      code.textContent = change.migration;
      mig.appendChild(code);
      body.appendChild(mig);
    }

    const docIds = (change.docs || []).filter((id) => links[id]);
    if (docIds.length) {
      const list = el("ul", "doc-links");
      for (const id of docIds) {
        const li = document.createElement("li");
        li.appendChild(WebRef.docChip(id, links[id]));
        list.appendChild(li);
      }
      body.appendChild(list);
    }

    host.replaceChildren(head, body);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const hosts = [...document.querySelectorAll(".change[data-change]")];
    if (!hosts.length) return;

    let data;
    try {
      data = await WebRef.data();
    } catch {
      for (const host of hosts) {
        host.replaceChildren(el("div", "box",
          "Change data needs the local server — run npm run dev:web."));
      }
      return;
    }

    for (const host of hosts) {
      const change = data.changeById.get(host.dataset.change);
      if (!change) {
        // Loud on purpose: a typo here should not fail silently.
        host.replaceChildren(el("div", "gotcha",
          `No change record with id "${host.dataset.change}" in changes.json.`));
        console.error(`changes.js: unknown change id "${host.dataset.change}"`);
        continue;
      }
      renderCard(host, change, data.links);
    }

    // Highlight only the blocks this file just created. highlightAll() would
    // re-run over the page's static blocks, which highlight.js has already
    // processed, and warn about it.
    if (window.hljs) {
      for (const host of hosts) {
        host.querySelectorAll("pre code:not(.nohighlight)").forEach((block) => {
          if (!block.dataset.highlighted) window.hljs.highlightElement(block);
        });
      }
    }
    document.dispatchEvent(new CustomEvent("webref:changes-rendered"));
  });
})();
