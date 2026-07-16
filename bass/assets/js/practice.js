/* Bass Tutor — practice cards. Reads the page's practice JSON block, renders
   one card per exercise (notation+tab via BTScore, ▶ playback via BTAudio,
   tempo targets, "log practice" with streaks), and keeps the log in
   localStorage "bass-tutor:practice":

     { "<exerciseId>": { "count": 3, "last": "2026-07-16T…" } }

   Block shape (see assets/page-template.html):
     <div class="practice-root"></div>
     <script type="application/json" class="practice">
     { "pageId": "major-scale",
       "exercises": [ { "id", "title", "goal", "tempo": [60,90],
                        "score": {…}, "steps": ["…"] } ] }
     </script>

   scripts/build-bass-index.js reads the same block at build time to feed
   search and the routine-builder lab (bass/data/exercise-index.json).       */
(function () {
  "use strict";

  const KEY = "bass-tutor:practice";

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { return {}; }
  }
  function saveLog(log) { localStorage.setItem(KEY, JSON.stringify(log)); }

  function log(id) {
    const data = loadLog();
    const rec = data[id] || { count: 0, last: null };
    rec.count += 1;
    rec.last = new Date().toISOString();
    data[id] = rec;
    saveLog(data);
    return rec;
  }

  const stats = (id) => loadLog()[id] || null;
  const isToday = (iso) =>
    iso && new Date(iso).toDateString() === new Date().toDateString();

  function statusLine(rec) {
    if (!rec || !rec.count) return "not practiced yet";
    const when = new Date(rec.last);
    const daysAgo = Math.floor((Date.now() - when.getTime()) / 86400000);
    const ago = isToday(rec.last) ? "today"
      : daysAgo <= 1 ? "yesterday" : `${daysAgo} days ago`;
    return `practiced ${rec.count}× · last ${ago}`;
  }

  function renderCard(ex, root) {
    const card = document.createElement("section");
    card.className = "practice-card";
    card.id = `practice-${ex.id}`;

    const h = document.createElement("h3");
    h.textContent = ex.title;
    card.appendChild(h);

    if (ex.goal) {
      const goal = document.createElement("p");
      goal.className = "desc";
      goal.innerHTML = `<strong>Done sounds like:</strong> ${ex.goal}`;
      card.appendChild(goal);
    }

    if (ex.steps?.length) {
      const ul = document.createElement("ul");
      for (const s of ex.steps) {
        const li = document.createElement("li");
        li.textContent = s;
        ul.appendChild(li);
      }
      card.appendChild(ul);
    }

    let scoreEl = null;
    if (ex.score && window.BTScore) {
      scoreEl = document.createElement("div");
      card.appendChild(scoreEl);
      window.BTScore.render(scoreEl, ex.score);
    }

    const meta = document.createElement("div");
    meta.className = "meta";

    if (ex.score && window.BTAudio) {
      const play = document.createElement("button");
      play.type = "button";
      play.className = "action";
      play.textContent = "▶ Hear it";
      let handle = null;
      play.addEventListener("click", () => {
        if (handle) {
          handle.stop(); handle = null;
          play.textContent = "▶ Hear it";
          return;
        }
        play.textContent = "■ Stop";
        handle = window.BTAudio.playScore(ex.score, {
          bpm: (ex.tempo && ex.tempo[0]) || ex.score.tempo || 80,
          onDone() { play.textContent = "▶ Hear it"; handle = null; },
        });
      });
      meta.appendChild(play);
    }

    if (ex.tempo) {
      const chip = document.createElement("span");
      chip.className = "tempo-chip";
      chip.textContent = ex.tempo.length > 1
        ? `♩ start ${ex.tempo[0]} → target ${ex.tempo[1]} bpm`
        : `♩ ${ex.tempo[0]} bpm`;
      chip.title = "Start slow enough to play it perfectly; raise the tempo only when it's clean.";
      meta.appendChild(chip);
    }

    const logBtn = document.createElement("button");
    logBtn.type = "button";
    logBtn.className = "action secondary";
    const note = document.createElement("span");
    note.className = "log-note";

    function refresh() {
      const rec = stats(ex.id);
      note.textContent = statusLine(rec);
      if (rec && isToday(rec.last)) {
        logBtn.textContent = "✓ Logged today";
        logBtn.disabled = true;
        card.classList.add("done");
      } else {
        logBtn.textContent = "Log practice";
        logBtn.disabled = false;
      }
    }
    logBtn.addEventListener("click", () => { log(ex.id); refresh(); });

    meta.appendChild(logBtn);
    meta.appendChild(note);
    card.appendChild(meta);
    refresh();

    root.appendChild(card);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const dataEl = document.querySelector('script.practice[type="application/json"]');
    const root = document.querySelector(".practice-root");
    if (!dataEl || !root) return;
    let block;
    try {
      block = JSON.parse(dataEl.textContent);
    } catch (err) {
      console.warn("practice.js: bad practice JSON", err);
      return;
    }
    for (const ex of block.exercises || []) renderCard(ex, root);

    // deep links like page.html#practice-<id> land on the card
    if (location.hash.startsWith("#practice-")) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    }
  });

  window.BTPractice = { log, stats, all: loadLog };
})();
