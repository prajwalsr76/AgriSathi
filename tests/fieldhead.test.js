import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainHead, headProbs, fuse, crossValidate, argmaxIn, alphaFor } from '../assets/js/core/fieldhead.js';

// deterministic pseudo-random
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const D = 768;
const centers = { 29: Array.from({ length: D }, gauss), 30: Array.from({ length: D }, gauss), 37: Array.from({ length: D }, gauss) };
const sample = (c) => centers[c].map(v => v + 0.8 * gauss());

test('head learns separable classes', () => {
  const X = [], y = [];
  for (const c of [29, 30, 37]) for (let i = 0; i < 8; i++) { X.push(sample(c)); y.push(c); }
  const h = trainHead(X, y, { epochs: 150 });
  assert.deepEqual(h.classes, [29, 30, 37]);
  const p = headProbs(h, sample(30));
  assert.equal(h.classes[p.indexOf(Math.max(...p))], 30);
});

test('fusion with alpha=1 keeps the lab model unchanged', () => {
  const X = [sample(29), sample(30)], y = [29, 30];
  const h = trainHead(X, y, { epochs: 50 });
  const p0 = Array(38).fill(1 / 38);
  const f = fuse(p0, h, sample(29), 1);
  assert.ok(f.every((v, i) => Math.abs(v - p0[i]) < 1e-12));
});

test('cross-validation shows the adaptation fixing a lab model that confuses field photos', () => {
  // Simulated lab model: always says "early blight" (29) for field photos of late blight (30)
  const samples = [];
  for (const c of [29, 30, 37]) for (let i = 0; i < 10; i++) {
    const p0 = Array(38).fill(0.005); p0[c === 30 ? 29 : c] = 0.6; p0[30] += c === 30 ? 0.2 : 0;
    samples.push({ x: sample(c), y: c, p0, allowed: new Set([28, 29, 30, 31, 32, 33, 34, 35, 36, 37]) });
  }
  const r = crossValidate(samples, { epochs: 120 });
  assert.ok(Math.abs(r.baseAcc - 20 / 30) < 1e-9);       // lab model wrong on all late-blight photos
  assert.ok(r.adaptedAcc > 0.9, 'adapted ' + r.adaptedAcc);
  assert.ok(r.bestAlpha < 1);
  assert.equal(r.head.alpha, r.bestAlpha);
});

test('fusion weight returns to the lab model for lab-like photos', () => {
  const h = { alpha: 0.25, gate: [0.6994, 0.7494] };
  assert.equal(alphaFor(h, 0.5), 0.25);          // field photo → field head trusted
  assert.equal(alphaFor(h, 0.9), 1);             // lab-like photo → lab model only
  assert.ok(Math.abs(alphaFor(h, 0.7244) - 0.625) < 1e-9);
  assert.equal(alphaFor({ alpha: 0.5 }, 0.9), 0.5);  // heads without a gate keep their α
  assert.equal(alphaFor(null, 0.5), 1);
});

test('shipped field head is valid and gated', async () => {
  const { readFileSync } = await import('node:fs');
  const h = JSON.parse(readFileSync(new URL('../model/field_head.json', import.meta.url)));
  assert.equal(h.W.length, h.classes.length * 768);
  assert.equal(h.mean.length, 768); assert.equal(h.std.length, 768); assert.equal(h.b.length, h.classes.length);
  assert.ok(h.alpha >= 0 && h.alpha < 1 && h.gate[0] < h.gate[1]);
  assert.ok(h.classes.every(c => Number.isInteger(c) && c >= 0 && c < 38));
});

test('shipped Indian field-crop model is valid and every class has advice', async () => {
  const { readFileSync } = await import('node:fs');
  const { ALL_LABELS, LABEL_TO_KEY, DISEASES } = await import('../assets/js/data/diseases.js');
  const { CHEMICALS } = await import('../assets/js/data/chemicals.js');
  const h = JSON.parse(readFileSync(new URL('../model/crops_head.json', import.meta.url)));
  const K = h.labels.length;
  assert.equal(h.W.length, K * 768); assert.equal(h.b.length, K); assert.equal(h.centroids.length, K);
  assert.ok(h.T > 0.5 && h.T < 5 && h.familiar > 0.3 && h.familiar < 1);
  for (const l of h.labels) {
    assert.ok(ALL_LABELS.includes(l), l);
    const d = DISEASES[LABEL_TO_KEY[l]]; assert.ok(d, 'no advice for ' + l);
    for (const c of [...d.treat, ...d.bio]) assert.ok(CHEMICALS[c], `${l}: unknown product ${c}`);
  }
});

test('argmaxIn respects the allowed set', () => {
  assert.equal(argmaxIn([0.5, 0.3, 0.2], new Set([1, 2])), 1);
});
