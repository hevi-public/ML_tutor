/* Bass Tutor — learner progress in localStorage.

   Shape (key "bass-tutor:progress"):
     { "pages": { "<pageId>": { "completedAt": "<ISO date>",
                                "quiz": { "correct": 2, "total": 3 } } } }

   Page ids are stable slugs (e.g. "major-scale") declared by each page's quiz
   JSON. The landing page uses this to offer "continue where you left off". */
(function () {
  "use strict";

  const KEY = "bass-tutor:progress";
  const KEY_MISSED = "bass-tutor:missed";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { pages: {} };
    } catch {
      return { pages: {} };
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  window.BassProgress = {
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

    // Missed quiz questions become flashcards (see flashcards.html)
    recordMiss(pageId, question, answer, explain) {
      let missed;
      try { missed = JSON.parse(localStorage.getItem(KEY_MISSED)) || []; }
      catch { missed = []; }
      if (!missed.some((m) => m.q === question)) {
        missed.push({ pageId, q: question, a: answer, explain });
        localStorage.setItem(KEY_MISSED, JSON.stringify(missed.slice(-100)));
      }
    },

    misses() {
      try { return JSON.parse(localStorage.getItem(KEY_MISSED)) || []; }
      catch { return []; }
    },
  };
})();
