/* ML Tutor — mini ML library: a multi-layer perceptron with hand-written
   backprop over plain arrays (fast enough to train live in a Web Worker).
   Binary classifier: hidden layers with tanh/relu, sigmoid output, log loss.
   Requires matrix.js for ML.rand (works in workers via importScripts). */
(function (root) {
  "use strict";

  const ML = (root.ML = root.ML || {});

  const ACT = {
    tanh: { f: Math.tanh, df: (a) => 1 - a * a },              // df from activation
    relu: { f: (z) => Math.max(0, z), df: (a) => (a > 0 ? 1 : 0) },
  };

  ML.MLP = class {
    // sizes: e.g. [2, 8, 8, 1] — inputs, hidden layers, one output
    constructor(sizes, activation = "tanh", seed = 1) {
      this.sizes = sizes;
      this.act = ACT[activation] ? activation : "tanh";
      // W[l][j][i]: weight into neuron j of layer l+1 from neuron i of layer l
      const rnd = ML.rand.lcg(seed);
      this.W = [];
      this.B = [];
      for (let l = 0; l < sizes.length - 1; l++) {
        const scale = 1 / Math.sqrt(sizes[l]); // keep early signals sane
        this.W.push(Array.from({ length: sizes[l + 1] }, () =>
          Array.from({ length: sizes[l] }, () => (rnd() * 2 - 1) * scale)));
        this.B.push(new Array(sizes[l + 1]).fill(0));
      }
    }

    // Returns every layer's activations (needed for backprop)
    forward(x) {
      const acts = [x];
      const L = this.W.length;
      for (let l = 0; l < L; l++) {
        const prev = acts[l];
        const out = new Array(this.sizes[l + 1]);
        for (let j = 0; j < out.length; j++) {
          let z = this.B[l][j];
          const wj = this.W[l][j];
          for (let i = 0; i < prev.length; i++) z += wj[i] * prev[i];
          out[j] = l === L - 1
            ? 1 / (1 + Math.exp(-z))          // output neuron: sigmoid
            : ACT[this.act].f(z);
        }
        acts.push(out);
      }
      return acts;
    }

    predictProba(x) {
      const acts = this.forward(x);
      return acts[acts.length - 1][0];
    }

    // One gradient step on a batch; returns mean log loss over the batch
    trainBatch(points, lr = 0.1) {
      const L = this.W.length;
      const gW = this.W.map((layer) => layer.map((row) => row.map(() => 0)));
      const gB = this.B.map((row) => row.map(() => 0));
      let loss = 0;

      for (const p of points) {
        const acts = this.forward(p.x);
        const prob = acts[L][0];
        const clamped = Math.min(Math.max(prob, 1e-9), 1 - 1e-9);
        loss += p.y ? -Math.log(clamped) : -Math.log(1 - clamped);

        // delta = dLoss/dz per neuron, walking backwards layer by layer.
        // Output layer: the famously tidy (probability − truth).
        let delta = [prob - p.y];
        for (let l = L - 1; l >= 0; l--) {
          const prev = acts[l];
          for (let j = 0; j < delta.length; j++) {
            gB[l][j] += delta[j];
            const gwj = gW[l][j];
            for (let i = 0; i < prev.length; i++) gwj[i] += delta[j] * prev[i];
          }
          if (l > 0) {
            // push blame one layer down the chain
            const next = new Array(this.sizes[l]).fill(0);
            for (let i = 0; i < next.length; i++) {
              let s = 0;
              for (let j = 0; j < delta.length; j++) s += this.W[l][j][i] * delta[j];
              next[i] = s * ACT[this.act].df(acts[l][i]);
            }
            delta = next;
          }
        }
      }

      const n = points.length;
      for (let l = 0; l < L; l++) {
        for (let j = 0; j < this.W[l].length; j++) {
          this.B[l][j] -= (lr * gB[l][j]) / n;
          for (let i = 0; i < this.W[l][j].length; i++) {
            this.W[l][j][i] -= (lr * gW[l][j][i]) / n;
          }
        }
      }
      return loss / n;
    }

    accuracy(points) {
      let ok = 0;
      for (const p of points) if ((this.predictProba(p.x) >= 0.5 ? 1 : 0) === p.y) ok++;
      return ok / points.length;
    }
  };

  /* Multi-class variant: softmax output + cross-entropy, for the MNIST lab.
     Same hand-written backprop; the output delta is again (probability −
     truth), just per class. Inputs are Float32Arrays scaled to 0..1. */
  ML.MLPSoftmax = class {
    // sizes: e.g. [784, 32, 10]
    constructor(sizes, seed = 1) {
      this.sizes = sizes;
      const rnd = ML.rand.lcg(seed);
      this.W = [];
      this.B = [];
      for (let l = 0; l < sizes.length - 1; l++) {
        const scale = Math.sqrt(2 / sizes[l]); // He init for the ReLU hiddens
        this.W.push(Array.from({ length: sizes[l + 1] }, () =>
          Float32Array.from({ length: sizes[l] }, () => (rnd() * 2 - 1) * scale)));
        this.B.push(new Float32Array(sizes[l + 1]));
      }
    }

    forward(x) {
      const acts = [x];
      const L = this.W.length;
      for (let l = 0; l < L; l++) {
        const prev = acts[l];
        const out = new Float32Array(this.sizes[l + 1]);
        for (let j = 0; j < out.length; j++) {
          let z = this.B[l][j];
          const wj = this.W[l][j];
          for (let i = 0; i < prev.length; i++) z += wj[i] * prev[i];
          out[j] = l === L - 1 ? z : Math.max(0, z); // relu hiddens, raw output
        }
        acts.push(out);
      }
      // softmax on the last layer (stable: subtract the max first)
      const logits = acts[L];
      let max = -Infinity;
      for (const z of logits) if (z > max) max = z;
      let sum = 0;
      const probs = new Float32Array(logits.length);
      for (let j = 0; j < logits.length; j++) { probs[j] = Math.exp(logits[j] - max); sum += probs[j]; }
      for (let j = 0; j < probs.length; j++) probs[j] /= sum;
      acts[L] = probs;
      return acts;
    }

    predict(x) {
      const probs = this.forward(x)[this.W.length];
      let best = 0;
      for (let j = 1; j < probs.length; j++) if (probs[j] > probs[best]) best = j;
      return best;
    }

    predictProbs(x) { return this.forward(x)[this.W.length]; }

    // One step on a batch of {x, y} (y = class index); returns mean loss
    trainBatch(batch, lr = 0.1) {
      const L = this.W.length;
      const gW = this.W.map((layer) => layer.map((row) => new Float32Array(row.length)));
      const gB = this.B.map((row) => new Float32Array(row.length));
      let loss = 0;

      for (const p of batch) {
        const acts = this.forward(p.x);
        const probs = acts[L];
        loss += -Math.log(Math.max(probs[p.y], 1e-9));

        let delta = Float32Array.from(probs);
        delta[p.y] -= 1; // softmax + cross-entropy: delta = prob − onehot
        for (let l = L - 1; l >= 0; l--) {
          const prev = acts[l];
          for (let j = 0; j < delta.length; j++) {
            gB[l][j] += delta[j];
            const gwj = gW[l][j];
            const dj = delta[j];
            for (let i = 0; i < prev.length; i++) gwj[i] += dj * prev[i];
          }
          if (l > 0) {
            const next = new Float32Array(this.sizes[l]);
            for (let i = 0; i < next.length; i++) {
              if (acts[l][i] <= 0) continue; // relu gate
              let s = 0;
              for (let j = 0; j < delta.length; j++) s += this.W[l][j][i] * delta[j];
              next[i] = s;
            }
            delta = next;
          }
        }
      }

      const n = batch.length;
      for (let l = 0; l < L; l++) {
        for (let j = 0; j < this.W[l].length; j++) {
          this.B[l][j] -= (lr * gB[l][j]) / n;
          const wj = this.W[l][j], gwj = gW[l][j];
          for (let i = 0; i < wj.length; i++) wj[i] -= (lr * gwj[i]) / n;
        }
      }
      return loss / n;
    }

    accuracy(points) {
      let ok = 0;
      for (const p of points) if (this.predict(p.x) === p.y) ok++;
      return ok / points.length;
    }
  };
})(typeof window !== "undefined" ? window : self);
