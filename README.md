# ML Tutor

An interactive, novice-to-expert machine learning course — static HTML/CSS/JS,
no build step, everything trains live in your browser. Plain language first:
every symbol is named, every equation gets an English translation, every
concept opens with an everyday analogy before the jargon arrives.

## Run it

```bash
npm install
npm run dev        # serves on http://localhost:8010 and opens it
```

Opening `index.html` directly from disk mostly works too, but the pages that
`fetch()` data (glossary, notation, search, flashcards, the MNIST lab) need
the server.

## What's inside

- **Units 0–8**: what is ML → math foundations (incl. "How to read math") →
  core concepts → classical models → neural networks → deep learning →
  LLMs & diffusion → hands-on labs → the expert track.
- **Labs**: a TensorFlow-Playground-style MLP trainer and an MNIST lab with a
  draw-your-own-digit pad — both training in Web Workers on the site's own
  mini ML library (`assets/js/ml/`: vectors, autodiff, models, MLPs — plain
  readable JavaScript, no dependencies).
- **Reference**: glossary (86 terms, plain-English first), notation guide
  (every symbol, searchable by descriptions like "curly d"), concept map
  colored by progress, full-text search (press `/`), spaced-repetition
  flashcards fed by the quiz questions you miss.

## Maintenance scripts

```bash
npm run build:index   # rebuild data/search-index.json after adding/editing pages
npm run fetch:mnist   # regenerate data/datasets/mnist-mini.json (already committed)
```

See `PLAN.md` for the architecture and the page-template contract
(`assets/page-template.html`) for adding new topic pages.
