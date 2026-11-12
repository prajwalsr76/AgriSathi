import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentLeaf, analyseQuality, laplacianVariance, toGray } from '../assets/js/core/imaging.js';

function canvas(w, h, f) { const a = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); const i = (y * w + x) * 4; a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = 255; } return a; }

test('lesion severity on a synthetic leaf', () => {
  const w = 128, h = 128;
  // grey background, green disc radius 50, brown lesion disc radius 20 inside, black necrotic core r=6
  const img = canvas(w, h, (x, y) => {
    const d = Math.hypot(x - 64, y - 64), dl = Math.hypot(x - 64, y - 64);
    if (d > 50) return [150, 150, 150];
    if (dl < 6) return [20, 15, 10];
    if (dl < 20) return [140, 90, 30];
    return [50, 140, 40];
  });
  const r = segmentLeaf(img, w, h);
  const expected = (Math.PI * 20 * 20) / (Math.PI * 50 * 50) * 100; // 16 %
  assert.ok(Math.abs(r.severity - expected) < 3, `severity ${r.severity} vs ${expected}`);
});

test('healthy leaf has near-zero severity', () => {
  const img = canvas(96, 96, (x, y) => Math.hypot(x - 48, y - 48) < 40 ? [60, 150, 50] : [200, 200, 205]);
  assert.ok(segmentLeaf(img, 96, 96).severity < 2);
});

test('a separate patch of brown soil is not counted as lesion', () => {
  // green leaf disc (r 30) with a brown lesion (r 10), plus a brown soil square far away
  const img = canvas(160, 120, (x, y) => {
    const d = Math.hypot(x - 45, y - 60);
    if (d < 10) return [140, 90, 30];
    if (d < 30) return [50, 140, 40];
    if (x > 110 && x < 150 && y > 30 && y < 90) return [120, 80, 40];
    return [150, 150, 150];
  });
  const r = segmentLeaf(img, 160, 120);
  const expected = (10 * 10) / (30 * 30) * 100; // 11 %
  assert.ok(Math.abs(r.severity - expected) < 3, `severity ${r.severity} vs ${expected}`);
});

test('blur detection', () => {
  const sharp = canvas(64, 64, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? [255, 255, 255] : [0, 0, 0]);
  const flat = canvas(64, 64, () => [120, 120, 120]);
  assert.ok(laplacianVariance(toGray(sharp, 64, 64), 64, 64) > 1000);
  assert.ok(analyseQuality(flat, 64, 64).issues.some(i => i.code === 'blur'));
});
