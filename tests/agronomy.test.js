import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sprayPlan, optimisePacks, fertilizerPlan, nutrientNeed, economics, toAcres, safeHarvestDate } from '../assets/js/core/agronomy.js';

test('area conversion', () => {
  assert.equal(toAcres(1, 'acre'), 1);
  assert.ok(Math.abs(toAcres(1, 'hectare') - 2.47105) < 1e-6);
  assert.equal(toAcres(40, 'guntha'), 1);
});

test('knapsack spray plan: 1 acre mancozeb', () => {
  const p = sprayPlan({ acres: 1, chemKey: 'mancozeb' });
  assert.equal(p.water, 200);
  assert.equal(p.tanks, 13);              // ceil(200/16) = 12.5 -> 13
  assert.equal(p.dosePerTank, 40);        // 2.5 g/L x 16 L
  assert.equal(p.totalNeed, 520);
  assert.ok(p.packs.qty >= 520);
});

test('quarter acre needs a small pack, not 1 kg', () => {
  const p = sprayPlan({ acres: 0.25, chemKey: 'mancozeb' });
  assert.equal(p.tanks, 4);
  assert.equal(p.totalNeed, 160);
  assert.deepEqual(p.packs.items.map(i => i.size), [250]);
  assert.ok(p.savings > 0);
});

test('pack optimiser picks cheapest covering combination', () => {
  const r = optimisePacks(600, [[250, 140], [500, 260], [1000, 480]]);
  assert.ok(r.qty >= 600);
  assert.equal(r.cost, 400); // 500 + 250 = 400 beats 1000 (480)
});

test('fertilizer: DAP+Urea+MOP balances NPK exactly', () => {
  const plan = fertilizerPlan({ cropKey: 'tomato', acres: 2.47105 }); // = 1 ha
  const need = nutrientNeed('tomato', 2.47105);
  assert.ok(Math.abs(need.n - 120) < 1e-6);
  const dapOpt = plan.options.find(o => o.id === 'dap');
  const kg = Object.fromEntries(dapOpt.items.map(i => [i.key, i.kg]));
  const N = kg.dap * 0.18 + kg.urea * 0.46, P = kg.dap * 0.46, K = kg.mop * 0.6;
  assert.ok(Math.abs(N - 120) < 0.5 && Math.abs(P - 60) < 0.5 && Math.abs(K - 60) < 0.5);
});

test('soil test adjusts dose', () => {
  const low = nutrientNeed('rice', 1, { n: 'low' }).n, med = nutrientNeed('rice', 1).n, high = nutrientNeed('rice', 1, { n: 'high' }).n;
  assert.ok(low > med && med > high);
});

test('economics and ROI', () => {
  const e = economics({ cropKey: 'tomato', acres: 1, severityPct: 35, maxLossPct: 50, weather: 'moderate', treatmentCost: 500, price: 1500, yieldPerAcre: 100 });
  assert.equal(e.grossValue, 150000);
  assert.equal(e.lossPct, 50);
  assert.equal(e.saved, 60000);
  assert.equal(e.net, 59500);
  assert.equal(e.roi, 119);
});

test('PHI safe harvest date', () => {
  const d = safeHarvestDate('2026-11-01T10:00:00', 7);
  assert.equal(d.getDate(), 8);
});
