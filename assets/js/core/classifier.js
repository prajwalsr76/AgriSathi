// Main-thread side of the on-device classifier: preprocessing, test-time augmentation,
// crop-aware decoding, out-of-distribution check and occlusion-sensitivity explanations.
import { MODEL_LABELS, ALL_LABELS } from '../data/diseases.js';
import { fuse, alphaFor, headProbs } from './fieldhead.js';

// Field-adapted head (trained with the Field Lab or tools/train_field_head.py).
const HEAD_KEY = 'agrisathi.fieldhead';
let headCache;
export async function getFieldHead() {
  if (headCache !== undefined) return headCache;
  try { const h = JSON.parse(localStorage.getItem(HEAD_KEY)); if (h?.W) return (headCache = h); } catch { /* ignore */ }
  try {
    const r = await fetch('model/field_head.json');
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) { const h = await r.json(); if (h?.W) return (headCache = { ...h, source: 'file' }); }
  } catch { /* ignore */ }
  return (headCache = null);
}
// Field-crop model for Indian crops that the lab model does not know (chilli, rice, cotton,
// groundnut, onion, banana) — a head trained on DINOv2 features of real Indian field photos.
let cropsCache;
export async function getCropsHead() {
  if (cropsCache !== undefined) return cropsCache;
  try {
    const r = await fetch('model/crops_head.json');
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      const h = await r.json();
      const D = h.mean.length;
      h.classes = h.labels.map(l => ALL_LABELS.indexOf(l));
      h.C = h.centroids.map(c => Float32Array.from(c));
      h.dim = D;
      return (cropsCache = h);
    }
  } catch { /* ignore */ }
  return (cropsCache = null);
}

export function setFieldHead(h) {
  headCache = h || undefined; // undefined → the shipped model/field_head.json is loaded again
  try { if (h) localStorage.setItem(HEAD_KEY, JSON.stringify(h)); else localStorage.removeItem(HEAD_KEY); } catch { /* storage full */ }
}

export const OOD_THRESHOLD = 0.6994; // cosine similarity to nearest class centroid (99 % of real test leaves pass)
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
const SIZE = 224;

export const CROP_PREFIX = {
  tomato: 'Tomato', potato: 'Potato', pepper: 'Pepper,_bell', corn: 'Corn_(maize)', grape: 'Grape', apple: 'Apple',
  cherry: 'Cherry_(including_sour)', peach: 'Peach', orange: 'Orange', strawberry: 'Strawberry', squash: 'Squash',
  soybean: 'Soybean', blueberry: 'Blueberry', raspberry: 'Raspberry',
};
// Crops answered by the field-crop model. Capsicum and chilli are the same species, so both see
// the bell-pepper classes of the lab model AND the chilli classes of the field-crop model.
export const EXT_GROUPS = {
  pepper: ['Pepper,_bell', 'Chilli'], chilli: ['Pepper,_bell', 'Chilli'], rice: ['Rice'], cotton: ['Cotton'],
  groundnut: ['Groundnut'], onion: ['Onion'], banana: ['Banana'],
};
export const LOCAL_CROPS = [...new Set([...Object.keys(CROP_PREFIX), ...Object.keys(EXT_GROUPS)])];
const EXT_PREFIX = { Chilli: 'chilli', Rice: 'rice', Cotton: 'cotton', Groundnut: 'groundnut', Onion: 'onion', Banana: 'banana' };
export const labelCrop = (label) => Object.keys(CROP_PREFIX).find(k => label.startsWith(CROP_PREFIX[k] + '___')) || EXT_PREFIX[label.split('___')[0]];

const temper = (p, T) => {
  if (!T || T === 1) return Array.from(p);
  const l = Array.from(p, v => Math.log(Math.max(v, 1e-12)) / T); const m = Math.max(...l);
  const e = l.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s);
};
const cosMax = (f, C) => {
  let n = 0; for (let j = 0; j < f.length; j++) n += f[j] * f[j]; n = Math.sqrt(n) || 1;
  let best = -1; for (const c of C) { let d = 0; for (let j = 0; j < f.length; j++) d += c[j] * f[j]; if (d / n > best) best = d / n; }
  return best;
};
/** Field-crop head probabilities over its own labels, with temperature calibration. */
function cropsProbs(h, x) { return temper(headProbs(h, x), h.T); }
/** Similarity to the field-crop centroids, rescaled so that its "familiar" level equals OOD_THRESHOLD. */
const extSim = (h, f) => Math.min(1, cosMax(f, h.C) * (OOD_THRESHOLD / h.familiar));

let worker = null, seq = 0;
const pending = new Map();
const listeners = new Set();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./model-worker.js', import.meta.url));
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') { listeners.forEach(fn => fn(m)); return; }
    const p = pending.get(m.id); if (!p) return;
    pending.delete(m.id);
    m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
  };
  worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'Model worker failed')); pending.clear(); };
  return worker;
}
function call(cmd, payload = {}, transfer = []) {
  const id = ++seq;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); getWorker().postMessage({ id, cmd, ...payload }, transfer); });
}

export const onProgress = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const warmUp = () => call('init');

/** Shortest edge → 256 (high-quality resample), centre-crop 224. Returns the 224×224 canvas. */
export function cropCanvas(img) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const s = 256 / Math.min(w0, h0);
  const w = Math.round(w0 * s), h = Math.round(h0 * s);
  const c = document.createElement('canvas'); c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -Math.floor((w - SIZE) / 2), -Math.floor((h - SIZE) / 2), w, h);
  return c;
}

function toTensor(px, { flip = false, occlude = null } = {}) {
  const out = new Float32Array(3 * SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = flip ? SIZE - 1 - x : x;
      const i = y * SIZE + x, j = (y * SIZE + sx) * 4;
      const hidden = occlude && x >= occlude.x && x < occlude.x + occlude.s && y >= occlude.y && y < occlude.y + occlude.s;
      for (let c = 0; c < 3; c++) out[c * SIZE * SIZE + i] = hidden ? 0 : (px[j + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return out;
}

const softmax = (a) => { const m = Math.max(...a); const e = a.map(v => Math.exp(v - m)); const s = e.reduce((x, y) => x + y, 0); return e.map(v => v / s); };

/** A zoomed-in (centre 85 %) copy of the 224 crop — a second "camera distance" for TTA. */
function zoomPixels(canvas224, f = 0.85) {
  const c = document.createElement('canvas'); c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const w = SIZE * f, o = (SIZE - w) / 2;
  ctx.drawImage(canvas224, o, o, w, w, 0, 0, SIZE, SIZE);
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}

/**
 * Classifies a leaf image.
 *  - TTA with 4 views (original, mirror, zoom, zoom+mirror); probabilities averaged. The spread
 *    of the top class's probability across the views is reported as a confidence range.
 *  - crop-aware decoding: if the farmer selected a supported crop, probabilities are
 *    renormalised over that crop's classes only (the model is not allowed to answer
 *    "apple scab" for a tomato field) and the unconditioned crop agreement is reported
 */
export async function classify(canvas224, cropKey, { raw = false } = {}) {
  const px = canvas224.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  const zp = zoomPixels(canvas224);
  const ts = [toTensor(px), toTensor(px, { flip: true }), toTensor(zp), toTensor(zp, { flip: true })];
  const res = await call('run', { tensors: ts }, ts.map(t => t.buffer));
  const V = res.length;
  const pv = res.map(r => softmax(r.logits));
  const labProbs = pv[0].map((_, i) => pv.reduce((s, p) => s + p[i], 0) / V);
  const features = res[0].features.map((_, i) => res.reduce((s, r) => s + r.features[i], 0) / V);
  const simLab = res.reduce((s, r) => s + r.sim, 0) / V;
  const ms = res.reduce((s, r) => s + r.ms, 0);
  const head = raw ? null : await getFieldHead();
  const alpha = head ? alphaFor(head, simLab) : null;
  // Temperature calibration (fitted on held-out field photos): softmax confidences of a model
  // trained on lab photos are too high on field photos. The temperature is only applied as far
  // as the photo is field-like, so clean lab-style photos keep their confidence.
  const gLab = Math.min(1, Math.max(0, (simLab - OOD_THRESHOLD) / 0.05));
  const Tlab = head?.T ? 1 + (head.T - 1) * (1 - gLab) : 1;
  const lab38 = (p, x) => temper(head ? fuse(p, head, x, alpha) : p, Tlab);   // lab model (+ PlantDoc field head)
  const probs38 = lab38(labProbs, features);

  // Field-crop model for crops the lab model does not know (or shares with chilli).
  const group = raw ? null : EXT_GROUPS[cropKey];
  const crops = group || (!cropKey && !raw) ? await getCropsHead() : null;
  if (group && !crops) throw new Error('Field-crop model missing (model/crops_head.json)');
  const simExt = crops ? extSim(crops, features) : -1;
  // which labels may be answered
  let allowed = null;
  if (group) allowed = new Set(ALL_LABELS.map((l, i) => group.includes(l.split('___')[0]) ? i : -1).filter(i => i >= 0));
  else if (cropKey && CROP_PREFIX[cropKey]) allowed = new Set(MODEL_LABELS.map((l, i) => l.startsWith(CROP_PREFIX[cropKey] + '___') ? i : -1).filter(i => i >= 0));
  // weight of the lab model: high for lab-like photos, 0 when the lab model has no class for this crop
  const labIdx = allowed ? [...allowed].filter(i => i < 38) : [...MODEL_LABELS.keys()];
  const useCrops = crops && (group || (!cropKey && simExt > simLab));
  let w = 1;
  if (useCrops) w = group && labIdx.length ? Math.min(1, Math.max(0, (simLab - OOD_THRESHOLD) / 0.05)) : 0;

  /** Full probability vector over ALL_LABELS for one set of (lab probs, features). */
  const combine = (p38, x) => {
    const out = new Array(ALL_LABELS.length).fill(0);
    if (!useCrops) { p38.forEach((v, i) => { out[i] = v; }); return out; }
    const q = cropsProbs(crops, x);
    const ci = crops.classes;
    const inA = (i) => !allowed || allowed.has(i);
    const labMass = labIdx.reduce((s, i) => s + p38[i], 0) || 1;
    const extMass = ci.reduce((s, c, k) => s + (inA(c) ? q[k] : 0), 0) || 1;
    if (w > 0) labIdx.forEach(i => { out[i] += w * p38[i] / labMass; });
    ci.forEach((c, k) => { if (inA(c)) out[c] += (1 - w) * q[k] / extMass; });
    return out;
  };
  const probs = combine(probs38, features);
  const sim = useCrops ? Math.max(simExt, w > 0 ? simLab : -1) : simLab;

  const ranked = (pr) => pr.map((p, i) => ({ label: ALL_LABELS[i], p, i })).filter(r => r.p > 0).sort((x, y) => y.p - x.p);
  const unconditioned = ranked(useCrops ? probs : probs38);
  let decoded = unconditioned, cropMass = null;
  if (allowed && !useCrops) {
    cropMass = unconditioned.filter(r => allowed.has(r.i)).reduce((s, r) => s + r.p, 0);
    decoded = unconditioned.filter(r => allowed.has(r.i)).map(r => ({ ...r, p: r.p / (cropMass || 1) }));
  }
  // per-view probability of the chosen class → confidence range
  const ti = decoded[0].i;
  const perView = res.map((r, v) => {
    const pvv = combine(lab38(pv[v], r.features), r.features);
    if (allowed && !useCrops) { const m = [...allowed].reduce((s, i) => s + pvv[i], 0); return pvv[ti] / (m || 1); }
    return pvv[ti];
  });
  const pr = decoded.map(d => d.p);
  const ent = -pr.reduce((s, p) => s + (p > 0 ? p * Math.log(p) : 0), 0) / Math.log(Math.max(2, pr.length));
  return {
    top: decoded.slice(0, 3), unconditioned: unconditioned.slice(0, 3), cropMass, sim, simLab, simExt, ood: sim < OOD_THRESHOLD,
    interval: [Math.min(...perView), Math.max(...perView)], views: V,
    entropy: ent, ms, passes: V, detectedCrop: labelCrop(unconditioned[0].label),
    labProbs, features, adapted: (!!head && alpha < 1 && !useCrops) || (useCrops && w < 1), alpha, model: useCrops ? 'field-crops' : 'lab',
    calibrated: useCrops ? !!crops.T : !!head?.T,
  };
}

/**
 * Occlusion sensitivity (Zeiler & Fergus, 2014): hide one patch at a time and measure how much
 * the probability of the predicted class drops. Model-agnostic and faithful to the real model.
 * Returns a grid of importance values in [0,1].
 */
export async function occlusionMap(canvas224, classIndex, grid = 4, onStep) {
  const px = canvas224.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  const crops = classIndex >= MODEL_LABELS.length ? await getCropsHead() : null;
  const k = crops ? crops.classes.indexOf(classIndex) : -1;
  const score = (r) => crops ? cropsProbs(crops, r.features)[k] : softmax(r.logits)[classIndex];
  const base = score((await call('run', { tensors: [toTensor(px)] }))[0]);
  const s = Math.ceil(SIZE / grid);
  const heat = [];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const t = toTensor(px, { occlude: { x: gx * s, y: gy * s, s } });
      const r = await call('run', { tensors: [t] }, [t.buffer]);
      const p = score(r[0]);
      heat.push(Math.max(0, base - p));
      onStep?.(heat.length / (grid * grid));
    }
  }
  const max = Math.max(...heat, 1e-6);
  return { grid, values: heat.map(v => v / max), base };
}

/** Renders a heat-map (jet colormap) over the 224 crop. */
export function renderHeat(canvas224, heat, out) {
  const g = heat.grid;
  const small = document.createElement('canvas'); small.width = g; small.height = g;
  const sctx = small.getContext('2d');
  const id = sctx.createImageData(g, g);
  heat.values.forEach((v, i) => { const [r, gg, b] = jet(v); id.data.set([r, gg, b, Math.round(40 + 170 * v)], i * 4); });
  sctx.putImageData(id, 0, 0);
  out.width = SIZE; out.height = SIZE;
  const ctx = out.getContext('2d');
  ctx.drawImage(canvas224, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 0.6; ctx.drawImage(small, 0, 0, SIZE, SIZE); ctx.globalAlpha = 1;
}

function jet(v) {
  const r = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 3)));
  const g = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 2)));
  const b = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 1)));
  return [r * 255, g * 255, b * 255];
}
