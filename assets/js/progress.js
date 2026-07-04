/* ML Tutor — learner progress in localStorage.

   Shape (key "ml-tutor:progress"):
     { "pages": { "<pageId>": { "completedAt": "<ISO date>",
                                "quiz": { "correct": 2, "total": 3 } } } }

   Page ids are stable slugs (e.g. "linear-regression") declared by each page's
   quiz JSON. The landing page uses this to offer "continue where you left off". */
(function () {
  "use strict";

  const KEY = "ml-tutor:progress";

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

  window.MLProgress = {
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
  };
})();
