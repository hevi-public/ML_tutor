/* Web Dev Reference — resolves data-doc ids against web/data/links.json.

   Two forms are supported:

     <a class="doc-chip" data-doc="ng.guide.signals"></a>
        empty — this fills in the href, the kind label and the title.

     <a class="doc-chip" href="https://angular.dev/guide/signals"
        data-doc="ng.guide.signals"><span class="kind">guide</span> Signals</a>
        written out — works with JS disabled and in print. This only adds
        target/rel and the "unverified" marker.

   Either way scripts/check-links.js validates the id, and where an href is
   present it verifies the href and the registry still agree. */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async () => {
    // Cards rendered by changes.js build their own chips; this handles the ones
    // written directly into the page.
    const anchors = [...document.querySelectorAll("a[data-doc]")];
    if (!anchors.length) return;

    let data;
    try {
      data = await WebRef.data();
    } catch {
      return; // hand-written chips still have their href; nothing to do
    }

    for (const a of anchors) {
      const id = a.dataset.doc.trim();
      const link = data.links[id];

      if (!link) {
        a.classList.add("unverified");
        a.title = `Unknown documentation id "${id}"`;
        console.error(`docs.js: unknown data-doc id "${id}"`);
        continue;
      }

      if (!a.getAttribute("href")) a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener";

      if (!a.textContent.trim()) {
        const kind = document.createElement("span");
        kind.className = "kind";
        kind.textContent = link.kind;
        a.appendChild(kind);
        a.appendChild(document.createTextNode(" " + link.title));
      }

      if (link.verified === "unverified") a.classList.add("unverified");
    }
  });
})();
