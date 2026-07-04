/* ML Tutor — mini ML library: scalar automatic differentiation.
   A Value remembers how it was computed; calling backward() on the final
   result walks the recipe in reverse, applying the chain rule at every step,
   until every input knows its nudge-effect on the output.
   This is the same idea (not the same code) that powers PyTorch.
   Requires nothing; adds ML.Value. */
(function () {
  "use strict";

  const ML = (window.ML = window.ML || {});

  class Value {
    constructor(data, children = [], op = "", label = "") {
      this.data = data;
      this.grad = 0;              // dOutput/dThis, filled in by backward()
      this.label = label;
      this._children = children;
      this._op = op;
      this._backward = () => {};  // how to push my grad onto my children
    }

    static wrap(v) { return v instanceof Value ? v : new Value(v); }

    add(other) {
      const o = Value.wrap(other);
      const out = new Value(this.data + o.data, [this, o], "+");
      out._backward = () => {
        this.grad += out.grad;     // d(a+b)/da = 1
        o.grad += out.grad;
      };
      return out;
    }

    mul(other) {
      const o = Value.wrap(other);
      const out = new Value(this.data * o.data, [this, o], "×");
      out._backward = () => {
        this.grad += o.data * out.grad;   // d(a·b)/da = b
        o.grad += this.data * out.grad;
      };
      return out;
    }

    neg() { return this.mul(-1); }
    sub(other) { return this.add(Value.wrap(other).neg()); }

    pow(n) { // n is a plain number
      const out = new Value(this.data ** n, [this], `^${n}`);
      out._backward = () => {
        this.grad += n * this.data ** (n - 1) * out.grad;
      };
      return out;
    }

    exp() {
      const out = new Value(Math.exp(this.data), [this], "exp");
      out._backward = () => { this.grad += out.data * out.grad; };
      return out;
    }

    log() {
      const out = new Value(Math.log(this.data), [this], "log");
      out._backward = () => { this.grad += (1 / this.data) * out.grad; };
      return out;
    }

    tanh() {
      const t = Math.tanh(this.data);
      const out = new Value(t, [this], "tanh");
      out._backward = () => { this.grad += (1 - t * t) * out.grad; };
      return out;
    }

    relu() {
      const out = new Value(Math.max(0, this.data), [this], "relu");
      out._backward = () => { this.grad += (this.data > 0 ? 1 : 0) * out.grad; };
      return out;
    }

    sigmoid() {
      const s = 1 / (1 + Math.exp(-this.data));
      const out = new Value(s, [this], "σ");
      out._backward = () => { this.grad += s * (1 - s) * out.grad; };
      return out;
    }

    // Chain rule over the whole recipe: topological order, then reverse.
    backward() {
      const topo = [];
      const seen = new Set();
      (function build(v) {
        if (seen.has(v)) return;
        seen.add(v);
        for (const c of v._children) build(c);
        topo.push(v);
      })(this);
      for (const v of topo) v.grad = 0;
      this.grad = 1;                      // dOut/dOut = 1: the seed
      for (let i = topo.length - 1; i >= 0; i--) topo[i]._backward();
      return topo; // handy for visualizers
    }
  }

  ML.Value = Value;
})();
