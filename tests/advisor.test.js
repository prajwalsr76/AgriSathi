import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankTreatments, recommendNutrition, projectSeverity, modeOf } from '../assets/js/core/advisor.js';
import { DISEASES } from '../assets/js/data/diseases.js';
import { decide } from '../assets/js/core/decision.js';

const dxFor = (key) => decide({ top: [{ label: DISEASES[key].label, p: 0.95, i: 0 }], ood: false, sim: 0.9, cropMass: 1 }, null, DISEASES[key].crop);

test('product modes', () => {
  assert.equal(modeOf('mancozeb'), 'contact');
  assert.equal(modeOf('azoxystrobin'), 'systemic');
  assert.equal(modeOf('metalaxyl_mz'), 'systemic + contact');
  assert.equal(modeOf('neem'), 'biological');
});

test('late blight: best is a systemic/combination product, rotation never repeats a group back-to-back', () => {
  const r = rankTreatments({ dx: dxFor('tomato_late_blight'), severity: 25 });
  assert.match(r.best.mode, /systemic/);
  assert.equal(r.alternatives.length, 3);
  for (let i = 1; i < r.rotation.length; i++) assert.notEqual(r.rotation[i].group, r.rotation[i - 1].group);
  assert.equal(r.rotation[1].day, 7);
});

test('early, mild infection prefers protective contact cover', () => {
  const r = rankTreatments({ dx: dxFor('tomato_early_blight'), severity: 3 });
  assert.equal(r.best.mode, 'contact');
});

test('nutrition: fungal disease → potassium first, never nano urea', () => {
  const top = recommendNutrition({ crop: 'tomato', dx: dxFor('tomato_late_blight'), severity: 25, conf: 0.95 });
  assert.equal(top.length, 3);
  assert.ok(['k13045', 'sop'].includes(top[0].id));
  assert.ok(!top.some(t => t.id === 'nanourea'));
  for (const t of top) assert.ok(t.low <= t.match && t.match <= t.high);
});

test('nutrition: bacterial → calcium nitrate in top 3; rice blast → silicon first', () => {
  assert.ok(recommendNutrition({ crop: 'tomato', dx: dxFor('tomato_bacterial_spot'), severity: 10 }).some(t => t.id === 'calnit'));
  const rice = decide(null, { is_plant_image: true, crop: 'Rice', condition: 'Rice blast', category: 'fungal', confidence: 0.85 }, 'rice');
  assert.equal(recommendNutrition({ crop: 'rice', dx: rice, severity: 15 })[0].id, 'silicon');
});

test('severity projection: untreated grows faster than treated and stays ≤ 100', () => {
  const p = projectSeverity({ severity: 10, type: 'oomycete', riskDays: Array(7).fill({ fav: 1 }) });
  assert.equal(p.untreated.length, 8);
  assert.ok(p.untreated[7] > p.treated[7] * 1.5);
  assert.ok(p.untreated.every(v => v <= 100));
});

import { detectIntent, localAnswer } from '../assets/js/core/assistant.js';
test('assistant intent detection (en / hi / mr)', () => {
  const cases = { 'Best fertilizer?': 'fert', 'Which product first?': 'best', 'Can I mix all of them?': 'mix', 'When should I spray?': 'when', 'best time to spray': 'when',
    'How much per tank?': 'dose', 'When can I harvest?': 'harvest', 'Organic options': 'organic', 'Will it spread?': 'spread',
    'सबसे अच्छी खाद?': 'fert', 'क्या सब मिला सकते हैं?': 'mix', 'टंकी में कितना?': 'dose', 'सर्वोत्तम खत?': 'fert', 'फवारणी केव्हा?': 'when', 'पहले कौन सी दवा?': 'best' };
  for (const [q, want] of Object.entries(cases)) assert.equal(detectIntent(q), want, q);
});
test('assistant works without a diagnosis', () => {
  assert.match(localAnswer('helpline number', null, 'en').text, /1800-180-1551/);
});

import { leafGate } from '../assets/js/core/leafgate.js';
test('leaf gate: rejects non-plant photos, accepts field leaves', () => {
  // real measurements (docs/field_test): laptop, shoe, sofa, dog, green chair, tractor, blue sky, green door
  for (const [sim, pr] of [[0.099, 0.01], [0.05, 0], [-0.017, 0.82], [0.077, 0.57], [0.233, 0.97], [0.192, 0.89], [0.134, 0.02], [0.163, 0.33], [0.181, 0.335]]) assert.equal(leafGate({ sim, plantRatio: pr }).leaf, false, `sim ${sim}`);
  // real PlantDoc field leaves near the boundary + typical leaves
  for (const [sim, pr] of [[0.296, 0.71], [0.284, 0.91], [0.262, 0.77], [0.574, 0.61], [0.66, 0.7], [0.748, 0.19], [0.93, 0.5], [0.45, 0.4]]) assert.equal(leafGate({ sim, plantRatio: pr }).leaf, true, `sim ${sim}`);
  assert.equal(leafGate({ sim: 0.28, plantRatio: 0.2 }).leaf, false);   // weak match and little plant colour
  assert.equal(leafGate({ sim: 0.35, plantRatio: 0.02 }).leaf, false);
  assert.equal(leafGate({ sim: 0.2, plantRatio: 0.8, expertPlant: true }).leaf, true);   // expert overrides
  assert.equal(leafGate({ sim: 0.5, plantRatio: 0.8, expertPlant: false }).leaf, false);
  assert.ok(leafGate({ sim: 0.9 }).reliability === 1 && leafGate({ sim: 0.5 }).reliability < 1);
});
