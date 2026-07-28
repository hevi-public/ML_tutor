/* Git Tutor — learner progress in localStorage.

   Same shape as the ML and bass tutors, in its own namespace so the three
   courses never collide on one origin.

   Pages (key "git-tutor:progress"):
     { "pages": { "<pageId>": { "completedAt": "<ISO date>",
                                "quiz": { "correct": 2, "total": 3 } } } }

   Labs (key "git-tutor:labs") — this tutor's addition, because a page here has
   two independent halves, a quiz and a sandbox exercise:
     { "<labId>": { "doneAt": "<ISO>", "assisted": false, "pageId": "…", "runs": 3 } }

   Page ids are stable slugs declared by each page's quiz JSON; lab ids are
   globally unique and prefixed with the page slug (build-git-index.js enforces
   both). The landing page uses this to offer "continue where you left off". */
(function () {
  "use strict";

  const KEY = "git-tutor:progress";
  const KEY_LABS = "git-tutor:labs";
  const KEY_MISSED = "git-tutor:missed";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { pages: {} };
    } catch {
      return { pages: {} };
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked: progress is a nicety, never a blocker.
    }
  }

  function loadLabs() {
    try {
      return JSON.parse(localStorage.getItem(KEY_LABS)) || {};
    } catch {
      return {};
    }
  }

  window.GitProgress = {
    recordQuiz(pageId, correct, total) {
      const data = load();
      data.pages[pageId] = data.pages[pageId] || {};
      data.pages[pageId].quiz = { correct, total };
      save(data);
    },

    markComplete(pageId) {
      const data = load();
      data.pages[pageId] = data.pages[pageId] || {};
      if (!data.pages[pageId].completedAt) {
        data.pages[pageId].completedAt = new Date().toISOString();
      }
      save(data);
    },

    isComplete(pageId) {
      return Boolean(load().pages[pageId]?.completedAt);
    },

    all() {
      return load().pages;
    },

    // Labs: the sandbox half of a page.
    recordLab(labId, options = {}) {
      const labs = loadLabs();
      const record = labs[labId] || { runs: 0 };
      record.runs += 1;
      record.pageId = options.pageId || record.pageId;
      // Solving it unassisted once is worth remembering, so never downgrade.
      record.assisted = record.doneAt ? record.assisted && options.assisted : Boolean(options.assisted);
      record.doneAt = new Date().toISOString();
      labs[labId] = record;
      try { localStorage.setItem(KEY_LABS, JSON.stringify(labs)); } catch { /* full */ }
    },

    isLabDone(labId) {
      return Boolean(loadLabs()[labId]?.doneAt);
    },

    labs() {
      return loadLabs();
    },

    // Missed quiz questions become flashcards (see flashcards.html)
    recordMiss(pageId, question, answer, explain) {
      let missed;
      try { missed = JSON.parse(localStorage.getItem(KEY_MISSED)) || []; }
      catch { missed = []; }
      if (!missed.some((m) => m.q === question)) {
        missed.push({ pageId, q: question, a: answer, explain });
        try {
          localStorage.setItem(KEY_MISSED, JSON.stringify(missed.slice(-100)));
        } catch { /* full */ }
      }
    },

    misses() {
      try { return JSON.parse(localStorage.getItem(KEY_MISSED)) || []; }
      catch { return []; }
    },
  };
})();
