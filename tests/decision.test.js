import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, chemFromText, cropFromText } from '../assets/js/core/decision.js';
import { matchDisease, DISEASES, LABEL_TO_KEY, MODEL_LABELS } from '../assets/js/data/diseases.js';
import { CHEMICALS } from '../assets/js/data/chemicals.js';

const local = (label, p, ood = false) => ({ top: [{ label, p, i: 0 }], ood, sim: ood ? 0.4 : 0.9, cropMass: 1 });

test('every model label maps to a knowledge-base entry', () => {
  for (const l of MODEL_LABELS) assert.ok(LABEL_TO_KEY[l], 'missing ' + l);
});
test('every treatment references a real product', () => {
  for (const [k, d] of Object.entries(DISEASES)) for (const c of [...d.treat, ...d.bio]) assert.ok(CHEMICALS[c], `${k} -> ${c}`);
});
test('agreement between both AIs', () => {
  const r = decide(local('Tomato___Late_blight', 0.9), { is_plant_image: true, crop: 'Tomato', condition: 'Late blight', category: 'oomycete', confidence: 0.85 }, 'tomato');
  assert.equal(r.verdict, 'agree'); assert.equal(r.key, 'tomato_late_blight');
});
test('expert overrides an out-of-distribution local guess', () => {
  const r = decide(local('Tomato___Septoria_leaf_spot', 0.7, true), { is_plant_image: true, crop: 'Tomato', condition: 'Early blight', category: 'fungal', confidence: 0.8 }, 'tomato');
  assert.equal(r.source, 'expert'); assert.equal(r.key, 'tomato_early_blight');
});
test('expert-only crops (rice blast)', () => {
  const r = decide(null, { is_plant_image: true, crop: 'Rice', condition: 'Rice blast', scientific_name: 'Magnaporthe oryzae', category: 'fungal', confidence: 0.8 }, 'rice');
  assert.equal(r.key, 'rice_blast'); assert.equal(r.verdict, 'expert_only');
});
test('free-text helpers', () => {
  assert.equal(cropFromText('Bell pepper (capsicum)'), 'pepper');
  assert.equal(chemFromText('Metalaxyl + Mancozeb'), 'metalaxyl_mz');
  assert.equal(chemFromText('Mancozeb 75 WP'), 'mancozeb');
  assert.equal(matchDisease('potato', 'Late blight'), 'potato_late_blight');
});
