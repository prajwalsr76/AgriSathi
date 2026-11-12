// Consensus engine: combines the on-device classifier and the Expert AI into one decision.
import { DISEASES, LABEL_TO_KEY, matchDisease } from '../data/diseases.js';
import { CROPS } from '../data/crops.js';
import { CHEMICALS } from '../data/chemicals.js';

const CROP_ALIASES = { corn: ['maize', 'corn'], pepper: ['bell pepper', 'capsicum', 'sweet pepper'], rice: ['rice', 'paddy'], orange: ['orange', 'citrus', 'lemon', 'lime', 'mandarin'], squash: ['squash', 'pumpkin', 'gourd', 'cucurbit'], chilli: ['chilli', 'chili', 'hot pepper'] };

export function cropFromText(text) {
  if (!text) return null;
  const s = text.toLowerCase();
  for (const [k, al] of Object.entries(CROP_ALIASES)) if (al.some(a => s.includes(a))) return k;
  for (const [k, c] of Object.entries(CROPS)) if (s.includes(c.name.en.toLowerCase().split(/[ /(]/)[0])) return k;
  return null;
}

export function chemFromText(text) {
  if (!text) return null;
  const s = text.toLowerCase();
  // prefer combination products when two actives are mentioned
  const scored = Object.entries(CHEMICALS).map(([k, c]) => {
    const actives = c.name.toLowerCase().replace(/[\d.%]+/g, ' ').split(/\+|\(|\)/).map(x => x.trim().split(/[\s-]+/)[0]).filter(w => w && w.length > 3);
    const hits = actives.filter(a => s.includes(a)).length;
    return [k, hits === actives.length ? hits * 2 : hits];
  }).filter(([, h]) => h > 0).sort((a, b) => b[1] - a[1]);
  return scored[0]?.[0] || null;
}

function expertKey(ex, cropKey) {
  if (!ex) return null;
  const crop = cropKey || cropFromText(ex.crop);
  if (ex.category === 'healthy' || /healthy/i.test(ex.condition)) return DISEASES[crop + '_healthy'] ? crop + '_healthy' : null;
  return matchDisease(crop, ex.condition + ' ' + (ex.scientific_name || ''));
}

/**
 * @param local  result of classify() or null
 * @param expert parsed Expert AI JSON or null
 * @param cropKey crop chosen by the farmer (may be null)
 */
export function decide(local, expert, cropKey) {
  const lKey = local ? LABEL_TO_KEY[local.top[0].label] : null;
  const lConf = local ? local.top[0].p : 0;
  const lUsable = local && !local.ood;
  const eKey = expertKey(expert, cropKey);
  const eConf = expert ? expert.confidence : 0;
  const eUsable = expert && expert.is_plant_image !== false && expert.image_quality !== 'poor';

  let source, key, conf, verdict;
  if (lUsable && eUsable) {
    if (lKey && lKey === eKey) { source = 'local'; key = lKey; conf = Math.max(lConf, eConf); verdict = 'agree'; }
    else if (lConf < 0.6 || (eConf >= 0.75 && lConf < 0.9)) { source = 'expert'; key = eKey; conf = eConf; verdict = 'disagree'; }
    else { source = 'local'; key = lKey; conf = lConf * 0.85; verdict = 'disagree'; }
  } else if (eUsable) { source = 'expert'; key = eKey; conf = eConf; verdict = 'expert_only'; }
  else if (local) { source = 'local'; key = lKey; conf = local.ood && !local.calibrated ? lConf * (local.reliability ?? 0.6) : lConf; verdict = 'local_only'; }
  else return null;

  const kb = key ? DISEASES[key] : null;
  const crop = kb?.crop || cropKey || cropFromText(expert?.crop) || null;
  const healthy = kb ? kb.type === 'healthy' : (expert?.category === 'healthy');
  let treat = kb?.treat?.slice() || [];
  let bio = kb?.bio?.slice() || [];
  if (!kb && expert?.chemical_control) treat = [...new Set(expert.chemical_control.map(c => chemFromText(c.active_ingredient)).filter(Boolean))];
  return {
    source, key, conf, verdict, crop, healthy, kb, expert, local,
    name: kb ? kb.name : { en: expert?.condition || 'Unknown' },
    pathogen: kb?.pathogen || expert?.scientific_name || '',
    type: kb?.type || expert?.category || 'unknown',
    symptoms: kb?.symptoms || expert?.visible_symptoms || [],
    cause: kb?.cause || '',
    organic: kb?.organic?.length ? kb.organic : (expert?.organic_control || []),
    prevention: kb?.prevention?.length ? kb.prevention : (expert?.prevention || []),
    treat, bio, maxLoss: kb?.loss ?? 40, risk: kb?.risk || 'generic_fungal',
    alt: verdict === 'disagree' ? (source === 'local' ? { by: 'expert', key: eKey, name: expert?.condition, conf: eConf } : { by: 'local', key: lKey, name: lKey ? DISEASES[lKey].name.en : '', conf: lConf }) : null,
  };
}
