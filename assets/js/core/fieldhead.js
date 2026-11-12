// Field adaptation: our own trained classifier head on top of the frozen DINOv2 features.
//
// The published model was trained on lab photos. Farmers' field photos look different
// (soil, shadows, several leaves, phone cameras). We keep the backbone frozen and train a new
// multinomial logistic-regression head on the 768-d features of REAL field photos collected
// with the Field Lab. At prediction time the two opinions are fused in log space:
//     log p(c) = α · log p_lab(c) + (1 − α) · log p_field(c)        (for classes the head knows)
// α is chosen by cross-validation from {1, 0.75, 0.5, 0.25} (never 0, so the lab model keeps a voice
// for conditions without field photos), and is moved back to 1 for photos that look like lab photos
// (see alphaFor), so the adaptation is only trusted where it helps.
// Pure functions (no DOM) — unit tested; tools/train_field_head.py implements the same maths.

export const DIM = 768;

const softmaxInPlace = (a) => { let m = -Infinity; for (const v of a) if (v > m) m = v; let s = 0; for (let i = 0; i < a.length; i++) { a[i] = Math.exp(a[i] - m); s += a[i]; } for (let i = 0; i < a.length; i++) a[i] /= s; return a; };

/**
 * Trains a softmax-regression head with Adam and L2 regularisation.
 * @param X  array of Float32Array/number[] feature vectors
 * @param y  array of class indices into the 38 model labels
 * @returns head { classes, mean, std, W (K×D, row-major), b, alpha }
 */
export function trainHead(X, y, { epochs = 300, lr = 0.05, l2 = 1e-2 } = {}) {
  const classes = [...new Set(y)].sort((a, b) => a - b);
  const K = classes.length, D = X[0].length, N = X.length;
  const ci = new Map(classes.map((c, i) => [c, i]));
  const mean = new Float64Array(D), std = new Float64Array(D);
  for (const x of X) for (let d = 0; d < D; d++) mean[d] += x[d] / N;
  for (const x of X) for (let d = 0; d < D; d++) std[d] += (x[d] - mean[d]) ** 2 / N;
  for (let d = 0; d < D; d++) std[d] = Math.sqrt(std[d]) || 1e-6;
  const Z = X.map(x => { const z = new Float64Array(D); for (let d = 0; d < D; d++) z[d] = (x[d] - mean[d]) / std[d]; return z; });
  const W = new Float64Array(K * D), b = new Float64Array(K);
  const mW = new Float64Array(K * D), vW = new Float64Array(K * D), mb = new Float64Array(K), vb = new Float64Array(K);
  const gW = new Float64Array(K * D), gb = new Float64Array(K), p = new Float64Array(K);
  const B1 = 0.9, B2 = 0.999, EPS = 1e-8;
  for (let ep = 1; ep <= epochs; ep++) {
    gW.fill(0); gb.fill(0);
    for (let n = 0; n < N; n++) {
      const z = Z[n];
      for (let k = 0; k < K; k++) { let s = b[k]; const o = k * D; for (let d = 0; d < D; d++) s += W[o + d] * z[d]; p[k] = s; }
      softmaxInPlace(p);
      p[ci.get(y[n])] -= 1;
      for (let k = 0; k < K; k++) { const g = p[k] / N; gb[k] += g; const o = k * D; for (let d = 0; d < D; d++) gW[o + d] += g * z[d]; }
    }
    const c1 = 1 - B1 ** ep, c2 = 1 - B2 ** ep;
    for (let i = 0; i < W.length; i++) {
      const g = gW[i] + l2 * W[i];
      mW[i] = B1 * mW[i] + (1 - B1) * g; vW[i] = B2 * vW[i] + (1 - B2) * g * g;
      W[i] -= lr * (mW[i] / c1) / (Math.sqrt(vW[i] / c2) + EPS);
    }
    for (let k = 0; k < K; k++) {
      mb[k] = B1 * mb[k] + (1 - B1) * gb[k]; vb[k] = B2 * vb[k] + (1 - B2) * gb[k] * gb[k];
      b[k] -= lr * (mb[k] / c1) / (Math.sqrt(vb[k] / c2) + EPS);
    }
  }
  return { classes, mean: Array.from(mean), std: Array.from(std), W: Array.from(W), b: Array.from(b), alpha: 0.5 };
}

/** Field-head probabilities over its own classes. */
export function headProbs(head, x) {
  const K = head.classes.length, D = head.mean.length;
  const p = new Float64Array(K);
  for (let k = 0; k < K; k++) { let s = head.b[k]; const o = k * D; for (let d = 0; d < D; d++) s += head.W[o + d] * ((x[d] - head.mean[d]) / head.std[d]); p[k] = s; }
  return softmaxInPlace(p);
}

/**
 * Fusion weight for one photo. A head trained on field photos is trusted for field-like photos
 * only: when the photo looks like the lab training data (embedding similarity above the
 * out-of-distribution threshold) the weight moves smoothly back to the lab model (α → 1), so
 * clean lab-style photos keep the lab model's 98.7 % behaviour. head.gate = [s0, s1].
 */
export function alphaFor(head, sim) {
  if (!head) return 1;
  const a = head.alpha ?? 0.5;
  if (!head.gate || sim == null) return a;
  const [s0, s1] = head.gate;
  return a + (1 - a) * Math.min(1, Math.max(0, (sim - s0) / (s1 - s0)));
}

/** Fuses the lab model's 38 probabilities with the field head. Returns new 38 probabilities. */
export function fuse(p0, head, x, alpha = head.alpha) {
  if (!head || alpha >= 1) return Array.from(p0);
  const q = headProbs(head, x);
  const logp = Array.from(p0, v => Math.log(Math.max(v, 1e-9)));
  head.classes.forEach((c, k) => { logp[c] = alpha * logp[c] + (1 - alpha) * Math.log(Math.max(q[k], 1e-9)); });
  return Array.from(softmaxInPlace(Float64Array.from(logp)));
}

/** Restrict probabilities to an allowed set of class indices (crop-aware decoding) and return argmax. */
export function argmaxIn(p, allowed) {
  let best = -1, bi = -1;
  for (let i = 0; i < p.length; i++) if ((!allowed || allowed.has(i)) && p[i] > best) { best = p[i]; bi = i; }
  return bi;
}

/**
 * Stratified k-fold cross-validation of the field adaptation.
 * samples: [{ x: features, y: class index, p0: 38 lab probabilities, allowed?: Set of class indices (crop) }]
 * Returns base accuracy, adapted accuracy for each α, best α and the final head trained on all data.
 */
export function crossValidate(samples, { alphas = [1, 0.75, 0.5, 0.25], folds, ...opt } = {}) {
  const byClass = new Map();
  samples.forEach((s, i) => { (byClass.get(s.y) || byClass.set(s.y, []).get(s.y)).push(i); });
  const minCount = Math.min(...[...byClass.values()].map(v => v.length));
  const k = Math.max(2, Math.min(folds || 5, minCount));
  const fold = new Array(samples.length);
  for (const idx of byClass.values()) idx.forEach((i, j) => { fold[i] = j % k; });
  const hits = Object.fromEntries(alphas.map(a => [a, 0]));
  let base = 0;
  const preds = new Array(samples.length);
  for (let f = 0; f < k; f++) {
    const tr = samples.filter((_, i) => fold[i] !== f), te = samples.map((s, i) => [s, i]).filter(([, i]) => fold[i] === f);
    if (!te.length || new Set(tr.map(s => s.y)).size < 2) continue;
    const head = trainHead(tr.map(s => s.x), tr.map(s => s.y), opt);
    for (const [s, i] of te) {
      if (argmaxIn(s.p0, s.allowed) === s.y) base++;
      preds[i] = {};
      for (const a of alphas) { const pr = argmaxIn(fuse(s.p0, head, s.x, a), s.allowed); preds[i][a] = pr; if (pr === s.y) hits[a]++; }
    }
  }
  const n = samples.length;
  // best α: highest accuracy, ties broken towards trusting the lab model more (larger α)
  const best = [...alphas].sort((a, b) => hits[b] - hits[a] || b - a)[0];
  const final = trainHead(samples.map(s => s.x), samples.map(s => s.y), opt);
  final.alpha = best;
  final.trainedOn = n; final.date = new Date().toISOString();
  return { folds: k, n, baseAcc: base / n, acc: Object.fromEntries(alphas.map(a => [a, hits[a] / n])), bestAlpha: best, adaptedAcc: hits[best] / n, preds, head: final };
}
