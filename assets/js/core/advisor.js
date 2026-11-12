// Advisor: turns a diagnosis into (1) a ranked treatment choice with alternatives and a spray
// rotation, (2) top-3 nutrition products with a match score and an uncertainty range, and
// (3) a 7-day weather-driven severity projection. Pure functions — unit tested.
import { CHEMICALS } from '../data/chemicals.js';
import { FERTS } from '../data/fertilizers.js';
import { DISEASES } from '../data/diseases.js';
import { sprayPlan, optimisePacks } from './agronomy.js';

// ───────────────────────── Treatment ranking ─────────────────────────
export function modeOf(chemKey) {
  const c = CHEMICALS[chemKey]; if (!c) return 'unknown';
  if (c.kind !== 'chemical') return 'biological';
  const g = c.group;
  if (/^IRAC/.test(g)) return /systemic/.test(g) ? 'systemic insecticide' : 'contact / translaminar insecticide';
  if (/\+/.test(g)) return 'systemic + contact';
  if (/contact|M0\d/.test(g)) return 'contact';
  return 'systemic';
}
export const groupCode = (chemKey) => (CHEMICALS[chemKey]?.group || '').replace(/\s*\(.*\)/, '').trim();

const INTERVAL = { oomycete: 7, fungal: 10, bacterial: 7, viral: 10, pest: 10 };

/**
 * Ranks the products for a disease.
 * score = expert first-line order (100 − 12·rank)
 *       + 15 if severity ≥ 10 % and the product works inside the leaf (systemic / combination)
 *       + 10 if severity < 10 % and the product is a protective contact fungicide
 *       − 4 · (cost rank)  − PHI / 2
 */
export function rankTreatments({ dx, severity = 10, acres = 1, waterPerAcre = 200 }) {
  const list = (dx.treat || []).filter(k => CHEMICALS[k]);
  if (!list.length) return { best: null, alternatives: [], rotation: [], bio: (dx.bio || []).filter(k => CHEMICALS[k]) };
  const rows = list.map((k, i) => {
    const plan = sprayPlan({ acres, chemKey: k, waterPerAcre });
    const mode = modeOf(k);
    const inside = /systemic/.test(mode);
    let score = 100 - 12 * i;
    const why = [];
    if (i === 0) why.push('First-line recommendation for this disease');
    if (severity >= 10 && inside) { score += 15; why.push('Works inside the leaf — stops infection that has already started'); }
    if (severity < 10 && mode === 'contact') { score += 10; why.push('Protective cover — ideal at early stage, very low resistance risk'); }
    if (mode === 'systemic + contact') why.push('Two actions in one pack: cures and protects');
    score -= CHEMICALS[k].phi / 2;
    return { key: k, chem: CHEMICALS[k], plan, mode, group: groupCode(k), score, why, costPerAcre: plan.packs.cost / Math.max(acres, 0.01) };
  });
  const byCost = [...rows].sort((a, b) => a.costPerAcre - b.costPerAcre);
  byCost.forEach((r, i) => { r.score -= 4 * i; if (i === 0 && rows.length > 1) r.why.push('Lowest cost per acre'); });
  const minPhi = Math.min(...rows.map(r => r.chem.phi));
  rows.forEach(r => { if (r.chem.phi === minPhi && rows.length > 1) r.why.push(`Shortest waiting period before harvest (${r.chem.phi} days)`); });
  rows.sort((a, b) => b.score - a.score);

  // Rotation: never repeat the same resistance group in consecutive sprays
  const interval = INTERVAL[dx.type] || 10;
  const rotation = [];
  let lastGroup = null;
  const pool = [...rows];
  for (let n = 0; n < Math.min(3, rows.length + 1) && pool.length; n++) {
    let idx = pool.findIndex(r => r.group !== lastGroup);
    if (idx < 0) idx = 0;
    const r = pool.splice(idx, 1)[0];
    rotation.push({ spray: n + 1, day: n * interval, key: r.key, name: r.chem.name, group: r.group });
    lastGroup = r.group;
  }
  return { best: rows[0], alternatives: rows.slice(1), rotation, interval, bio: (dx.bio || []).filter(k => CHEMICALS[k]) };
}

// ───────────────────────── Nutrition ─────────────────────────
const GROUP = {
  fruitveg: ['tomato', 'pepper', 'chilli', 'potato', 'squash', 'strawberry', 'onion'],
  cereal: ['rice', 'wheat', 'corn'],
  fruit: ['grape', 'apple', 'cherry', 'peach', 'orange', 'banana', 'blueberry', 'raspberry'],
  field: ['soybean', 'groundnut', 'cotton'],
};
const groupOf = (crop) => Object.keys(GROUP).find(g => GROUP[g].includes(crop)) || 'field';

/** Rule-based agronomic scoring of every product for one hypothesis (crop + problem type). */
export function scoreFertilizers({ crop, type = 'fungal', key = null, severity = 10 }) {
  const g = groupOf(crop);
  const healthy = type === 'healthy';
  const fungal = type === 'fungal' || type === 'oomycete';
  const S = {}, R = {}, E = {};
  const add = (id, pts, reason, ev) => { S[id] = (S[id] || 40) + pts; if (reason && pts > 0) (R[id] ||= []).push(reason); if (ev) E[id] = E[id] === 'High' ? 'High' : ev; };
  Object.keys(FERTS).forEach(id => { S[id] = 40; R[id] = []; E[id] = 'Moderate'; });

  if (type === 'nutrient') {
    add('micro', 40, 'Supplies the zinc, iron, manganese and boron that are most often missing', 'High');
    add('npk191919', 34, 'Quick balanced N-P-K feed through the leaves', 'High');
    add('calnit', 12, 'Calcium and nitrate nitrogen for pale, weak growth');
    add('seaweed', 10, 'Helps the plant recover colour and vigour');
    add('neemcake', 6, 'Organic matter improves nutrient uptake');
    add('nanourea', -10); add('silicon', -15); add('boron', 4);
  } else if (!healthy) {
    if (fungal || type === 'pest') add('k13045', 30, 'Potassium makes leaves tougher against fungal attack', 'High');
    if (type === 'bacterial') add('k13045', 20, 'Potassium reduces bacterial spread', 'High');
    if (type === 'viral') add('k13045', 8);
    if (fungal || type === 'bacterial') add('sop', 26, 'Potassium without extra nitrogen — no soft, disease-prone growth', 'High');
    if (severity >= 20) add('sop', 8, 'High damage: avoid nitrogen that feeds the disease');
    if (type === 'bacterial') add('calnit', 30, 'Calcium hardens cell walls and slows bacterial spread', 'High');
    if (fungal) add('calnit', 10, 'Calcium strengthens tissue');
    if (type === 'viral') add('micro', 30, 'Zinc & manganese support recovery of virus-stressed plants', 'Moderate');
    add('micro', 12, 'Micronutrients power the plant\'s own defence enzymes');
    if (type === 'viral') add('npk191919', 25, 'Balanced feed helps new healthy leaves after removing infected plants', 'Moderate');
    if (fungal) add('npk191919', -12);
    if (severity >= 15) add('seaweed', 18, 'Bio-stimulant reduces stress after heavy damage', 'Moderate');
    if (type === 'viral' || type === 'pest') add('seaweed', 15, 'Helps the plant out-grow damage');
    add('mkp', 10, 'Supports recovery and flowering after disease stress');
    add('nanourea', -35); add('npk102626', -10); add('neemcake', type === 'pest' ? 12 : 0, type === 'pest' ? 'Neem cake also suppresses soil pests' : null);
    if (crop === 'rice' && (key === 'rice_blast' || key === 'rice_brown_spot' || fungal)) add('silicon', 40, 'Silicon is proven to reduce rice blast and brown spot', 'High');
  } else {
    add('npk191919', 32, 'Balanced N-P-K keeps a healthy crop growing evenly', 'High');
    add('micro', 18, 'Prevents hidden hunger of zinc, iron and boron');
    add('seaweed', 8, 'Improves vigour and stress tolerance');
    if (g === 'cereal') add('nanourea', 22, 'Foliar nitrogen at tillering / knee-high stage', 'Moderate');
    add('npk102626', 10, 'Basal P & K for strong roots');
    add('neemcake', 8, 'Organic matter + soil health');
  }
  if (g === 'fruitveg') add('calnit', 14, 'Prevents blossom-end rot and fruit cracking', 'High');
  if (crop === 'potato' || crop === 'onion') add('sop', 18, 'Potato & onion respond strongly to sulphate of potash (quality & storage)', 'High');
  if (g === 'fruit') { add('sop', 12, 'Potash improves fruit size, colour and sweetness', 'High'); add('mkp', 8); add('boron', 10, 'Boron improves fruit set'); }
  if (['grape', 'groundnut', 'cotton'].includes(crop)) add('boron', 22, 'This crop is highly sensitive to boron deficiency', 'High');
  if (['rice', 'wheat', 'corn'].includes(crop)) add('zinc', 24, 'Cereals in Indian soils are commonly zinc-deficient (khaira)', 'High');
  if (g === 'cereal' && crop !== 'rice') add('silicon', 5);
  if (crop !== 'rice' && g !== 'cereal') add('silicon', -20);
  if (g !== 'cereal') add('zinc', -10);

  return Object.keys(FERTS).map(id => ({ id, score: Math.max(0, Math.min(98, S[id])), reasons: R[id], evidence: E[id] }));
}

/**
 * Top-3 nutrition products. Uncertainty: the scores are recomputed under the second most
 * likely diagnosis; the reported match is the probability-weighted average and the range is
 * [min, max] across hypotheses — a narrow range means the advice is robust to diagnosis error.
 */
export function recommendNutrition({ crop, dx, severity = 10, conf = 0.8, alt = null, acres = 1, waterPerAcre = 200 }) {
  const h1 = scoreFertilizers({ crop, type: dx.healthy ? 'healthy' : dx.type, key: dx.key, severity });
  const altType = alt ? (DISEASES[alt]?.type || 'fungal') : 'fungal';
  const h2 = scoreFertilizers({ crop, type: altType, key: alt, severity });
  const p = Math.max(0.5, Math.min(1, conf));
  const rows = h1.map((r, i) => {
    const s2 = h2[i].score;
    const f = FERTS[r.id];
    const perTank = f.foliar ? f.foliar * 16 : null;
    const perAcre = f.foliar ? f.foliar * waterPerAcre : f.soil;          // g|ml for foliar, kg for soil
    const need = perAcre * acres;
    const packSizeInUnit = f.pack[1] === 'kg' && f.unit !== 'kg' ? f.pack[0] * 1000 : f.pack[0];
    const packs = optimisePacks(need, [[packSizeInUnit, f.pack[2]]]);
    return {
      ...r, f, match: Math.round(p * r.score + (1 - p) * s2), low: Math.min(r.score, s2), high: Math.max(r.score, s2),
      perTank, perAcre, need: Math.round(need * 10) / 10, packsN: packs.items[0]?.n || 1, cost: packs.cost,
      how: f.foliar ? `Foliar spray ${f.foliar} ${f.unit}/L (${perTank} ${f.unit} per 16 L tank), 2 sprays 10–12 days apart` : `Soil application ${f.soil} kg/acre near the root zone, then irrigate`,
    };
  });
  rows.sort((a, b) => b.match - a.match || a.cost - b.cost);
  // value-for-money tag among the top 3
  const top = rows.slice(0, 3);
  const cheapest = [...top].sort((a, b) => a.cost - b.cost)[0];
  top.forEach(r => { r.tags = []; if (r === top[0]) r.tags.push('Best match'); if (r === cheapest) r.tags.push('Best value'); });
  return top;
}

// ───────────────────────── Severity projection ─────────────────────────
const RATE = { oomycete: 0.32, fungal: 0.12, bacterial: 0.10, viral: 0.06, pest: 0.15, nutrient: 0, healthy: 0 };

/**
 * Logistic disease-progress model (Van der Plank):  dS/dt = r · w(t) · S · (1 − S/100)
 * r = apparent infection rate for the pathogen type, w(t) = 0.3 + weather favourability (0–1)
 * from the disease-risk model. Treatment reduces r by 80 % from day 1.
 */
export function projectSeverity({ severity, type, riskDays = [], days = 7 }) {
  const r = RATE[type] ?? 0.1;
  let u = Math.max(0.5, severity), t = u;
  const untreated = [Math.round(u * 10) / 10], treated = [Math.round(t * 10) / 10];
  for (let d = 0; d < days; d++) {
    const w = 0.3 + (riskDays[d]?.fav ?? 0.5);
    u += r * w * u * (1 - u / 100);
    t += r * w * (d === 0 ? 0.6 : 0.2) * t * (1 - t / 100);
    untreated.push(Math.round(Math.min(100, u) * 10) / 10);
    treated.push(Math.round(Math.min(100, t) * 10) / 10);
  }
  return { untreated, treated };
}
