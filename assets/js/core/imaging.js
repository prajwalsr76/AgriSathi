// Image analysis on raw RGBA pixel arrays (no DOM) – quality gate and lesion segmentation.

export function toGray(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  return g;
}

/** Variance of the discrete 4-neighbour Laplacian – a standard focus/sharpness measure. */
export function laplacianVariance(gray, w, h) {
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const L = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += L; sum2 += L * L; n++;
    }
  }
  const m = sum / n;
  return sum2 / n - m * m;
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
}

// Pixel classes
const BG = 0, GREEN = 1, SYMPTOM = 2;

export function classifyPixel(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (h >= 65 && h <= 170 && s > 0.16 && v > 0.12) return GREEN;
  if (h >= 8 && h < 65 && s > 0.22 && v > 0.12) return SYMPTOM; // yellow / brown / orange
  return BG;
}

function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    let count = 0;
    const row = y * w;
    for (let x = -r; x < w; x++) {
      if (x + r < w && mask[row + x + r]) count++;
      if (x - r - 1 >= 0 && mask[row + x - r - 1]) count--;
      if (x >= 0) tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = -r; y < h; y++) {
      if (y + r < h && tmp[(y + r) * w + x]) count++;
      if (y - r - 1 >= 0 && tmp[(y - r - 1) * w + x]) count--;
      if (y >= 0) out[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}
const erode = (mask, w, h, r) => { const inv = mask.map(v => 1 - v); return dilate(inv, w, h, r).map(v => 1 - v); };

function fillHoles(mask, w, h) {
  // flood-fill background from the border; everything not reached is inside the leaf
  const reached = new Uint8Array(mask.length);
  const stack = [];
  const push = (i) => { if (!mask[i] && !reached[i]) { reached[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  return reached.map(v => 1 - v);
}

/**
 * Removes connected regions that are not leaf tissue — e.g. a patch of brown soil, dry mulch or a
 * wooden table next to the leaf. A region is kept when at least 10 % of it is green tissue; the
 * region holding the most green tissue is always kept (so a badly diseased, mostly brown leaf
 * is never thrown away). 4-connected labelling with an explicit stack (no recursion).
 */
function dropNonLeafBlobs(mask, cls, w, h) {
  const n = w * h, label = new Int32Array(n), stack = [];
  const comps = []; // [area, green]
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s]) continue;
    const id = comps.length + 1; let area = 0, green = 0;
    label[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(); area++; if (cls[i] === GREEN) green++;
      const x = i % w;
      if (x > 0 && mask[i - 1] && !label[i - 1]) { label[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !label[i + 1]) { label[i + 1] = id; stack.push(i + 1); }
      if (i >= w && mask[i - w] && !label[i - w]) { label[i - w] = id; stack.push(i - w); }
      if (i < n - w && mask[i + w] && !label[i + w]) { label[i + w] = id; stack.push(i + w); }
    }
    comps.push([area, green]);
  }
  if (comps.length <= 1) return mask;
  let main = 0; comps.forEach((c, k) => { if (c[1] > comps[main][1]) main = k; });
  const keep = comps.map((c, k) => k === main || c[1] / c[0] >= 0.10);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] && keep[label[i] - 1]) out[i] = 1;
  return out;
}

/**
 * Segments the leaf and its symptomatic tissue.
 *  1. classify every pixel as green tissue, symptomatic (yellow/brown) or background (HSV rules)
 *  2. leaf region = morphological closing of (green ∪ symptomatic), then hole filling –
 *     dark necrotic or white powdery patches enclosed by leaf tissue are counted as leaf
 *  3. regions that are not leaf (soil, mulch, wood: < 10 % green) are dropped
 *  4. severity = non-green pixels inside the leaf region / leaf region
 */
export function segmentLeaf(rgba, w, h) {
  const n = w * h;
  const cls = new Uint8Array(n);
  let green = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) { cls[i] = classifyPixel(rgba[j], rgba[j + 1], rgba[j + 2]); if (cls[i] === GREEN) green++; }
  const plant = cls.map(c => (c !== BG ? 1 : 0));
  const r = Math.max(2, Math.round(Math.min(w, h) / 64));
  const closed = erode(dilate(plant, w, h, r), w, h, r);
  const leaf = dropNonLeafBlobs(fillHoles(closed, w, h), cls, w, h);
  let leafArea = 0, lesion = 0;
  const lesionMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!leaf[i]) continue;
    leafArea++;
    if (cls[i] !== GREEN) { lesion++; lesionMask[i] = 1; }
  }
  const severity = leafArea ? (lesion / leafArea) * 100 : 0;
  return { severity, leafFraction: leafArea / n, greenFraction: green / n, leafMask: leaf, lesionMask };
}

export function severityClass(pct) {
  if (pct < 5) return { key: 'trace', label: 'Very low', color: '#2e9e5b' };
  if (pct < 15) return { key: 'low', label: 'Low', color: '#7cb342' };
  if (pct < 30) return { key: 'moderate', label: 'Moderate', color: '#f5a524' };
  if (pct < 50) return { key: 'high', label: 'High', color: '#ef6c00' };
  return { key: 'severe', label: 'Severe', color: '#d32f2f' };
}

/**
 * Photo quality gate. Returns metrics plus a list of issues (blocking or warnings).
 * Thresholds tuned for images downscaled so the long side is ~512 px.
 */
export function analyseQuality(rgba, w, h) {
  const gray = toGray(rgba, w, h);
  const blur = laplacianVariance(gray, w, h);
  let mean = 0; for (const v of gray) mean += v; mean /= gray.length;
  let sd = 0; for (const v of gray) sd += (v - mean) ** 2; sd = Math.sqrt(sd / gray.length);
  let plantPx = 0;
  for (let i = 0; i < rgba.length; i += 16) if (classifyPixel(rgba[i], rgba[i + 1], rgba[i + 2]) !== 0) plantPx++;
  const plantRatio = plantPx / (rgba.length / 16);
  const issues = [];
  if (blur < 25) issues.push({ code: 'blur', level: 'error' });
  else if (blur < 60) issues.push({ code: 'soft', level: 'warn' });
  if (mean < 45) issues.push({ code: 'dark', level: 'error' });
  if (mean > 225) issues.push({ code: 'bright', level: 'error' });
  if (sd < 18) issues.push({ code: 'flat', level: 'warn' });
  if (plantRatio < 0.08) issues.push({ code: 'noleaf', level: 'warn' });
  const score = Math.round(Math.max(0, Math.min(100,
    35 * Math.min(1, blur / 150) + 25 * (1 - Math.min(1, Math.abs(mean - 130) / 110)) + 15 * Math.min(1, sd / 50) + 25 * Math.min(1, plantRatio / 0.35))));
  return { blur: Math.round(blur), brightness: Math.round(mean), contrast: Math.round(sd), plantRatio, score, issues };
}
