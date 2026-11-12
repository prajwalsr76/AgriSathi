// Expert mode: a second, independent diagnosis from a vision-language model (Google Gemini).
// Works on real field photos and on crops outside the on-device model (rice, wheat, cotton …).
// Order of use: 1) the farmer's own key saved in Settings, 2) the /api/expert serverless proxy
// (key kept secret on the server, see api/expert.js), otherwise Expert mode is unavailable.
import { settings } from './store.js';
import { gemini } from './gemini.js';

const LANG_NAME = { en: 'English', hi: 'Hindi (Devanagari script)', mr: 'Marathi (Devanagari script)' };

export const SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_plant_image: { type: 'BOOLEAN' },
    image_quality: { type: 'STRING', enum: ['good', 'fair', 'poor'] },
    crop: { type: 'STRING', description: 'Common English crop name' },
    condition: { type: 'STRING', description: 'Disease / pest / deficiency common name in English, or "Healthy"' },
    scientific_name: { type: 'STRING' },
    category: { type: 'STRING', enum: ['fungal', 'oomycete', 'bacterial', 'viral', 'pest', 'nutrient', 'abiotic', 'healthy', 'unknown'] },
    confidence: { type: 'NUMBER', description: '0 to 1' },
    severity: { type: 'STRING', enum: ['none', 'low', 'moderate', 'high', 'severe'] },
    visible_symptoms: { type: 'ARRAY', items: { type: 'STRING' } },
    differential: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, likelihood: { type: 'NUMBER' } } } },
    immediate_actions: { type: 'ARRAY', items: { type: 'STRING' } },
    organic_control: { type: 'ARRAY', items: { type: 'STRING' } },
    chemical_control: { type: 'ARRAY', items: { type: 'OBJECT', properties: { active_ingredient: { type: 'STRING' }, dose_per_litre: { type: 'STRING' }, phi_days: { type: 'NUMBER' } } } },
    prevention: { type: 'ARRAY', items: { type: 'STRING' } },
    farmer_summary: { type: 'STRING', description: 'Two or three simple sentences for the farmer, in the requested language' },
  },
  required: ['is_plant_image', 'crop', 'condition', 'category', 'confidence', 'severity', 'visible_symptoms', 'farmer_summary'],
};

export function buildPrompt({ crop, lang, local, weather }) {
  return `You are a senior plant pathologist with the Indian Council of Agricultural Research (ICAR) helping a smallholder farmer in India.
Examine the photo carefully and diagnose the problem.

Context from the farmer's app:
- Crop selected by farmer: ${crop || 'not specified'}
- On-device CNN suggestion (may be wrong, trained on lab images): ${local || 'none'}
- Local weather next days: ${weather || 'unknown'}

Rules:
- Base the diagnosis on visible evidence. If the image is not a plant or is too poor to judge, say so (is_plant_image=false or image_quality=poor) and give low confidence.
- Consider nutrient deficiencies, pests, mites, herbicide/sun injury, not only diseases.
- Recommend only products registered with India's CIB&RC, with dose per litre of water and pre-harvest interval in days.
- Never recommend Streptomycin/Tetracycline (Streptocycline) – banned on crops in India since 2024.
- Prefer IPM: cultural and biological options first, chemical when severity justifies it.
- Write farmer_summary in ${LANG_NAME[lang] || 'English'} using very simple words. All other fields in English.
Keep it short: at most 3 items in every list, each item under 15 words. Return JSON only.`;
}

export async function fileToBase64(blob) {
  const buf = await blob.arrayBuffer();
  let s = ''; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Calls the expert model. Returns the parsed JSON plus the model id used. */
export async function askExpert({ imageB64, mime = 'image/jpeg', crop, lang, local, weather, signal }) {
  const prompt = buildPrompt({ crop, lang, local, weather });
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: imageB64 } }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
  };
  const key = settings.get().geminiKey?.trim();
  if (!key) {
    // Server-side proxy (deployments that keep the key secret)
    const r = await fetch('api/expert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
    if (r.status === 404 || r.status === 405 || r.status === 501 || (r.headers.get('content-type') || '').includes('text/html')) throw Object.assign(new Error('Expert mode is not configured'), { code: 'nokey' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Expert service error');
    return parse(j);
  }
  const res = await gemini(body, { signal, timeoutMs: 30000 });
  return { ...parse(res.json), model: res.model };
}

function parse(j) {
  const text = (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  const clean = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const data = JSON.parse(clean);
  data.confidence = Math.max(0, Math.min(1, Number(data.confidence) || 0));
  return { data, model: j.modelVersion };
}
