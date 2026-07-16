/* Bass Tutor — declarative quizzes with instant feedback. Same engine as the
   ML Tutor's quiz.js, pointed at BassProgress.

   A page embeds one quiz as JSON:

     <div class="quiz-root"></div>
     <script type="application/json" class="quiz">
       { "id": "major-scale",
         "questions": [
           { "q": "…?", "choices": ["a", "b", "c"], "answer": 1,
             "explain": "why the right answer is right" } ] }
     </script>

   Questions are asked in plain words (understanding, not vocabulary — see
   bass/PLAN.md). Scores are stored via progress.js; finishing marks the page
   complete. */
(function () {
  "use strict";

  function render(root, quiz) {
    let answered = 0;
    let correct = 0;

    quiz.questions.forEach((question, qi) => {
      const card = document.createElement("section");
      card.className = "quiz-q";

      const qText = document.createElement("p");
      qText.className = "q-text";
      qText.textContent = `${qi + 1}. ${question.q}`;
      card.appendChild(qText);

      const choices = document.createElement("div");
      choices.className = "choices";
      question.choices.forEach((choiceText, ci) => {
        const btn = document.createElement("button");
        btn.className = "choice";
        btn.type = "button";
        btn.textContent = choiceText;
        btn.addEventListener("click", () => {
          if (card.dataset.done) return;
          card.dataset.done = "1";
          answered++;
          const isRight = ci === question.answer;
          if (isRight) correct++;
          else if (window.BassProgress && quiz.id) {
            window.BassProgress.recordMiss(
              quiz.id, question.q,
              question.choices[question.answer], question.explain || "");
          }

          choices.querySelectorAll(".choice").forEach((b, bi) => {
            b.disabled = true;
            if (bi === question.answer) b.dataset.state = "correct";
            else if (bi === ci) b.dataset.state = "wrong";
          });

          if (question.explain) {
            const explain = document.createElement("p");
            explain.className = "explain";
            explain.textContent = (isRight ? "✓ " : "✗ ") + question.explain;
            card.appendChild(explain);
          }
          if (answered === quiz.questions.length) finish();
        });
        choices.appendChild(btn);
      });
      card.appendChild(choices);
      root.appendChild(card);
    });

    const scoreLine = document.createElement("p");
    scoreLine.setAttribute("role", "status"); // announced by screen readers
    root.appendChild(scoreLine);

    function finish() {
      scoreLine.className = "quiz-score";
      scoreLine.textContent = `You got ${correct} of ${quiz.questions.length} right.` +
        (correct === quiz.questions.length
          ? " Nice — you've got this. 🎉"
          : " Worth a second look at the explanations above — then move on; you can always come back.");
      if (window.BassProgress && quiz.id) {
        window.BassProgress.recordQuiz(quiz.id, correct, quiz.questions.length);
        window.BassProgress.markComplete(quiz.id);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const dataEl = document.querySelector('script.quiz[type="application/json"]');
    const root = document.querySelector(".quiz-root");
    if (!dataEl || !root) return;
    try {
      render(root, JSON.parse(dataEl.textContent));
    } catch (err) {
      console.warn("quiz.js: bad quiz JSON", err);
    }
  });
})();
