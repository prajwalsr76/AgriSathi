// Agronomy engine: spray dilution, pack optimisation, fertilizer planning, PHI and ROI.
// Pure functions – no DOM – so they can be unit-tested with `node --test`.

import { CHEMICALS } from '../data/chemicals.js';
import { CROPS } from '../data/crops.js';

export const AREA_UNITS = {
  acre: { label: 'Acre', toAcre: 1 },
  hectare: { label: 'Hectare', toAcre: 2.47105 },
  guntha: { label: 'Guntha', toAcre: 1 / 40 },
};

export const toAcres = (value, unit = 'acre') => Math.max(0, Number(value) || 0) * (AREA_UNITS[unit]?.toAcre ?? 1);

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Cheapest combination of retail packs that covers `need` (g or ml).
 * Unbounded knapsack over pack sizes, solved by DP on a 10-unit grid.
 */
export function optimisePacks(need, packs) {
  if (!packs?.length || need <= 0) return { items: [], qty: 0, cost: 0, waste: 0 };
  const step = 10;
  const target = Math.ceil(need / step);
  const maxPack = Math.max(...packs.map(p => p[0]));
  const limit = target + Math.ceil(maxPack / step);
  const cost = new Array(limit + 1).fill(Infinity);
  const pick = new Array(limit + 1).fill(-1);
  cost[0] = 0;
  for (let q = 1; q <= limit; q++) {
    packs.forEach(([size, price], i) => {
      const s = Math.ceil(size / step);
      if (q - s >= 0 && cost[q - s] + price < cost[q]) { cost[q] = cost[q - s] + price; pick[q] = i; }
    });
  }
  // cheapest total among all quantities >= target
  let best = -1;
  for (let q = target; q <= limit; q++) if (cost[q] < Infinity && (best < 0 || cost[q] < cost[best] - 1e-9)) best = q;
  const counts = new Array(packs.length).fill(0);
  for (let q = best; q > 0; q -= Math.ceil(packs[pick[q]][0] / step)) counts[pick[q]]++;
  const items = counts.map((n, i) => ({ size: packs[i][0], price: packs[i][1], n })).filter(x => x.n > 0).sort((a, b) => b.size - a.size);
  const qty = items.reduce((s, x) => s + x.size * x.n, 0);
  return { items, qty, cost: cost[best], waste: round(qty - need, 1) };
}

/**
 * Knapsack sprayer plan for one product.
 * Water volume = acres × water/acre; tanks = ceil(water / tank size); dose per tank = rate/L × tank size.
 */
export function sprayPlan({ acres, chemKey, waterPerAcre = 200, tankLitres = 16, dosePerLitre, packs }) {
  const chem = CHEMICALS[chemKey];
  if (!chem) throw new Error('Unknown product ' + chemKey);
  const rate = dosePerLitre ?? chem.dose;
  const water = acres * waterPerAcre;
  const tanks = Math.max(1, Math.ceil(water / tankLitres - 1e-9));
  const dosePerTank = rate * tankLitres;
  const totalNeed = dosePerTank * tanks;
  const pk = packs || chem.packs;
  const best = optimisePacks(totalNeed, pk);
  // What a farmer typically gets pushed: the single largest pack(s)
  const largest = pk.reduce((a, b) => (b[0] > a[0] ? b : a));
  const bulkN = Math.max(1, Math.ceil(totalNeed / largest[0]));
  const bulkCost = bulkN * largest[1];
  return {
    product: chem.name, brands: chem.brands, unit: chem.unit, group: chem.group, phi: chem.phi, kind: chem.kind,
    rate, water: round(water, 0), tanks, tankLitres, dosePerTank: round(dosePerTank, 1),
    totalNeed: round(totalNeed, 1), packs: best, bulk: { size: largest[0], n: bulkN, cost: bulkCost },
    savings: Math.max(0, bulkCost - best.cost),
  };
}

/** Safe-to-harvest date after a spray. */
export function safeHarvestDate(sprayDate, phiDays) {
  const d = new Date(sprayDate);
  d.setDate(d.getDate() + (phiDays || 0));
  return d;
}

// ───────────── Fertilizer ─────────────
export const FERTILIZERS = {
  urea: { name: 'Urea (46-0-0)', n: 0.46, p: 0, k: 0, bag: 45, price: 266.5 },
  dap: { name: 'DAP (18-46-0)', n: 0.18, p: 0.46, k: 0, bag: 50, price: 1350 },
  mop: { name: 'MOP (0-0-60)', n: 0, p: 0, k: 0.60, bag: 50, price: 1700 },
  ssp: { name: 'SSP (0-16-0 + 11% S)', n: 0, p: 0.16, k: 0, bag: 50, price: 560 },
  npk102626: { name: 'NPK 10-26-26', n: 0.10, p: 0.26, k: 0.26, bag: 50, price: 1470 },
};

const SOIL_FACTOR = { low: 1.25, medium: 1.0, high: 0.75 };

/** Nutrient need (kg) for the field, adjusted by Soil Health Card status. */
export function nutrientNeed(cropKey, acres, soil = {}) {
  const crop = CROPS[cropKey];
  const ha = acres / 2.47105;
  const [N, P, K] = crop.rdf;
  return {
    n: N * ha * (SOIL_FACTOR[soil.n] ?? 1),
    p: P * ha * (SOIL_FACTOR[soil.p] ?? 1),
    k: K * ha * (SOIL_FACTOR[soil.k] ?? 1),
  };
}

function line(key, kg, prices) {
  const f = FERTILIZERS[key];
  const price = prices?.[key] ?? f.price;
  kg = Math.max(0, kg);
  return { key, name: f.name, kg: round(kg, 1), bags: round(kg / f.bag, 2), cost: Math.round((kg / f.bag) * price) };
}

/**
 * Converts nutrient need into commercial fertilizers for three common product strategies.
 * Returns options sorted by cost, each with a basal / top-dress split.
 */
export function fertilizerPlan({ cropKey, acres, soil = {}, prices = {} }) {
  const need = nutrientNeed(cropKey, acres, soil);
  const opts = [];

  // A) DAP + Urea + MOP
  {
    const dap = need.p / 0.46;
    const urea = (need.n - dap * 0.18) / 0.46;
    const mop = need.k / 0.60;
    opts.push({ id: 'dap', title: 'DAP + Urea + MOP', items: [line('dap', dap, prices), line('urea', urea, prices), line('mop', mop, prices)] });
  }
  // B) SSP + Urea + MOP (adds sulphur – good for oilseeds & onion)
  {
    const ssp = need.p / 0.16;
    const urea = need.n / 0.46;
    const mop = need.k / 0.60;
    opts.push({ id: 'ssp', title: 'SSP + Urea + MOP (adds Sulphur)', items: [line('ssp', ssp, prices), line('urea', urea, prices), line('mop', mop, prices)] });
  }
  // C) NPK 10-26-26 + top-ups
  if (need.k > 0) {
    const npk = Math.min(need.p / 0.26, need.k / 0.26);
    const pLeft = need.p - npk * 0.26;
    const kLeft = need.k - npk * 0.26;
    const dap = pLeft / 0.46;
    const urea = (need.n - npk * 0.10 - dap * 0.18) / 0.46;
    const items = [line('npk102626', npk, prices), line('urea', urea, prices)];
    if (dap > 0.5) items.push(line('dap', dap, prices));
    if (kLeft > 0.5) items.push(line('mop', kLeft / 0.6, prices));
    opts.push({ id: 'npk', title: 'NPK 10-26-26 + Urea', items });
  }
  for (const o of opts) {
    o.items = o.items.filter(i => i.kg > 0.05);
    o.cost = o.items.reduce((s, i) => s + i.cost, 0);
    // Split: all P & K + 1/3 of urea at sowing/transplanting, rest of urea in two top-dressings.
    o.split = o.items.map(i => i.key === 'urea'
      ? { name: i.name, basal: round(i.kg / 3, 1), top1: round(i.kg / 3, 1), top2: round(i.kg / 3, 1) }
      : { name: i.name, basal: i.kg, top1: 0, top2: 0 });
  }
  opts.sort((a, b) => a.cost - b.cost);
  return { need: { n: round(need.n, 1), p: round(need.p, 1), k: round(need.k, 1) }, options: opts };
}

// ───────────── Economics ─────────────
/**
 * Yield loss model:
 *   expected loss % = maxLoss × severityFactor × weatherFactor (capped at maxLoss)
 *   severityFactor  = clamp(severity / 35, 0.15, 1)   (35 % diseased leaf area ≈ epidemic stage)
 *   weatherFactor   = 0.6 (low risk) | 1.0 (moderate) | 1.3 (high)
 * Treatment is assumed to prevent `efficacy` (default 80 %) of the expected loss.
 */
export function economics({ cropKey, acres, severityPct = 10, maxLossPct = 40, weather = 'moderate', treatmentCost = 0, efficacy = 0.8, price, yieldPerAcre }) {
  const crop = CROPS[cropKey] || {};
  const p = price ?? crop.price ?? 2000;
  const y = yieldPerAcre ?? crop.yield ?? 20;
  const grossValue = acres * y * p;
  const sev = Math.min(1, Math.max(0.15, severityPct / 35));
  const wf = { low: 0.6, moderate: 1.0, high: 1.3 }[weather] ?? 1;
  const lossPct = Math.min(maxLossPct, maxLossPct * sev * wf);
  const lossValue = grossValue * lossPct / 100;
  const saved = lossValue * efficacy;
  const net = saved - treatmentCost;
  return {
    grossValue: Math.round(grossValue), lossPct: round(lossPct, 1), lossValue: Math.round(lossValue),
    saved: Math.round(saved), treatmentCost: Math.round(treatmentCost), net: Math.round(net),
    roi: treatmentCost > 0 ? round(net / treatmentCost, 1) : null,
  };
}

export const inr = (x) => '₹' + Math.round(x).toLocaleString('en-IN');
