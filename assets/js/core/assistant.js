// "Sathi" farm assistant. Answers questions about the current diagnosis using the app's own
// data (works offline), or with the Gemini model when a key is available (open questions,
// any language). The diagnosis context is always injected so answers use the real numbers.
import { settings } from './store.js';
import { gemini } from './gemini.js';

const CTX_KEY = 'agrisathi.chatctx';
export const chatContext = {
  get: () => { try { return JSON.parse(sessionStorage.getItem(CTX_KEY)) || null; } catch { return null; } },
  set: (c) => { try { sessionStorage.setItem(CTX_KEY, JSON.stringify(c)); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent('chatctx')); },
};

const INTENTS = [
  ['mix', /\bmix|together|all (3|three)|combine|same tank|मिला|एक साथ|सब(ी)? दवा|एकत्र|मिसळ/i],
  ['alt', /alternative|other (option|product|medicine)|another|instead|second option|दूसरी|विकल्प|दुसरे|पर्याय/i],
  ['fert', /fertili[sz]er|nutri|urea|\bdap\b|potash|npk|khad|खाद|उर्वरक|खत/i],
  ['organic', /organic|natural|\bbio|neem|जैविक|प्राकृतिक|सेंद्रिय|नैसर्गिक/i],
  ['harvest', /harvest|\bphi\b|pick|sell|market|कटाई|तोड़|काढणी|तोडणी/i],
  ['when', /\bwhen\b|what time|spray window|today|tomorrow|best time|कब|समय|केव्हा|वेळ/i],
  ['weather', /weather|rain|forecast|humid|temperature|मौसम|बारिश|हवामान|पाऊस/i],
  ['dose', /dose|how much|quantity|grams?|\bml\b|litre|liter|tank|कितना|कितनी|मात्रा|किती|प्रमाण|टंकी|पंप/i],
  ['best', /best|first|which (product|medicine|spray|pesticide|fungicide)|recommend|top choice|सबसे अच्छ|कौन सी दवा|पहले|सर्वोत्तम|कोणते औषध|आधी|चांगले/i],
  ['cost', /cost|price|money|profit|\broi\b|rupee|₹|खर्च|पैसा|मुनाफ|किंमत|नफा/i],
  ['spread', /spread|future|worse|next week|increase|grow|फैल|बढ़|पसर|वाढ/i],
  ['prevent', /prevent|next season|avoid|stop it|रोकथाम|बचाव|प्रतिबंध/i],
  ['safety', /safety|safe to spray|mask|gloves|poison|सुरक्षा/i],
  ['helpline', /helpline|call|kvk|officer|agronomist|संपर्क|हेल्पलाइन/i],
  ['what', /what is|disease|symptom|cause|why|identify|क्या है|रोग|लक्षण|कारण|काय आहे|लक्षणे/i],
  ['help', /help|hello|\bhi\b|namaste|नमस्ते|मदद|नमस्कार|मदत/i],
];
export const detectIntent = (q) => INTENTS.find(([, re]) => re.test(q))?.[0] || 'unknown';

export const CHIPS = {
  en: ['Which product first?', 'Can I mix all of them?', 'How much per tank?', 'Best fertilizer?', 'When should I spray?', 'Will it spread?', 'Organic options', 'When can I harvest?'],
  hi: ['पहले कौन सी दवा?', 'क्या सब मिला सकते हैं?', 'टंकी में कितना?', 'सबसे अच्छी खाद?', 'कब छिड़कें?', 'क्या रोग फैलेगा?', 'जैविक उपाय', 'कटाई कब?'],
  mr: ['आधी कोणते औषध?', 'सगळे मिसळू शकतो का?', 'पंपात किती?', 'सर्वोत्तम खत?', 'फवारणी केव्हा?', 'रोग वाढेल का?', 'सेंद्रिय उपाय', 'काढणी केव्हा?'],
};

const T = {
  en: {
    noctx: 'I can answer best after a diagnosis. Open Crop Doctor, scan a leaf, then ask me anything about the disease, products, fertilizer, weather or cost.',
    help: (c) => `Namaste! I know your diagnosis: ${c.disease.name} on ${c.cropName} (${c.severity}% leaf damage). Ask me which product to use first, the dose, the best fertilizer, the best spray time, or whether it will spread.`,
    best: (c) => c.treat.best ? `Best choice: ${c.treat.best.name} — ${c.treat.best.perTank} per 16 L tank, ${c.treat.best.tanks} tanks for ${c.acres} acre (≈ ₹${c.treat.best.cost}). Why: ${c.treat.best.why}. Use only this one product in the tank.` : `No chemical cure exists for ${c.disease.name}. Focus on: ${c.organic.slice(0, 2).join('; ')}.`,
    alt: (c) => c.treat.alternatives.length ? `Alternatives (use instead of the best choice, or in rotation):\n${c.treat.alternatives.map((a, i) => `${i + 1}. ${a.name} — ${a.perTank}/tank, ${a.mode}, ₹${a.cost}`).join('\n')}` : 'There is no chemical alternative for this problem — use the organic steps.',
    mix: (c) => `No — do not mix them. They are alternatives. Use ONE product per spray and change the product next time so the disease does not become resistant:\n${c.treat.rotation.map(r => `• Spray ${r.spray} (day ${r.day}): ${r.name}`).join('\n')}\nStop when new spots stop appearing.`,
    dose: (c) => c.treat.best ? `${c.treat.best.name}: ${c.treat.best.perTank} in each 16-litre tank. For ${c.acres} acre you need ${c.treat.best.tanks} tanks (${c.treat.best.water} L water). Buy: ${c.treat.best.buy}.` : 'No spray dose needed for this problem.',
    harvest: (c) => c.safeHarvest ? `After spraying ${c.treat.best?.name}, wait ${c.treat.best?.phi} days. Safe to harvest from ${c.safeHarvest}.` : 'No waiting period — no chemical is recommended.',
    when: (c) => c.weather?.window ? `Best spray time: ${c.weather.window}. Avoid spraying if rain is expected within 4 hours or wind is above 15 km/h.` : 'Add your field location (Weather Risk page) so I can find the best spray time. General rule: spray early morning or late afternoon, no rain for 4 hours, low wind.',
    weather: (c) => c.weather ? `${c.weather.place}: ${c.weather.summary}. Disease pressure is ${c.weather.risk} — ${c.weather.reason}.` : 'I do not know your field location yet. Use the Weather Risk page to set it.',
    fert: (c) => `Top nutrition for ${c.cropName} now:\n${c.nutrition.map((n, i) => `${i + 1}. ${n.name} — ${n.how}. ≈ ₹${n.cost}. Match ${n.match}%${n.high > n.low ? ` (${n.low}–${n.high}%)` : ''}`).join('\n')}\nApply 3–4 days after the pesticide, not in the same tank.`,
    organic: (c) => `Organic / biological options:\n${c.organic.map(o => '• ' + o).join('\n')}${c.treat.bio?.length ? '\n• ' + c.treat.bio.join('\n• ') : ''}`,
    cost: (c) => c.economics ? `Crop value at risk ≈ ₹${c.economics.lossValue}. Treatment ≈ ₹${c.economics.treatmentCost}. Net money protected ≈ ₹${c.economics.net}${c.economics.roi ? ` (${c.economics.roi}× return)` : ''}.` : 'Your crop looks healthy — no treatment cost needed.',
    spread: (c) => c.projection ? `If untreated, damage may go from ${c.severity}% to about ${c.projection.untreated}% in 7 days with this week's weather. With treatment it should stay near ${c.projection.treated}%.` : 'Spread estimate needs a disease diagnosis.',
    prevent: (c) => `For next season:\n${c.prevention.map(p => '• ' + p).join('\n')}`,
    safety: () => 'Wear gloves, mask and full sleeves. Spray with the wind behind you, never before rain. Wash hands and clothes after spraying. Keep children and animals away. Do not eat, drink or smoke while spraying.',
    helpline: () => 'Kisan Call Centre: 1800-180-1551 (toll free, all Indian languages, 6 AM–10 PM). You can also visit your nearest Krishi Vigyan Kendra (KVK).',
    what: (c) => `${c.disease.name} (${c.disease.pathogen}) — a ${c.disease.type} problem. Signs: ${c.symptoms.slice(0, 2).join('; ')}. ${c.cause}`,
    unknown: () => 'I did not understand fully. Try one of the suggestions below. For open questions, add a free Gemini key in Settings and I can answer anything.',
  },
  hi: {
    noctx: 'जाँच के बाद मैं सबसे अच्छा जवाब दे सकता हूँ। फसल डॉक्टर खोलें, पत्ती की फोटो लें, फिर रोग, दवा, खाद, मौसम या खर्च के बारे में पूछें।',
    help: (c) => `नमस्ते! आपकी ${c.cropName} फसल में ${c.disease.name} है (${c.severity}% पत्ती खराब)। पूछें — पहले कौन सी दवा, कितनी मात्रा, सबसे अच्छी खाद, छिड़काव का समय, या रोग फैलेगा क्या।`,
    best: (c) => c.treat.best ? `सबसे अच्छा: ${c.treat.best.name} — हर 16 लीटर टंकी में ${c.treat.best.perTank}, ${c.acres} एकड़ के लिए ${c.treat.best.tanks} टंकी (लगभग ₹${c.treat.best.cost})। टंकी में सिर्फ़ यही एक दवा डालें।` : `इस रोग की कोई रासायनिक दवा नहीं है। ये करें: ${c.organic.slice(0, 2).join('; ')}।`,
    alt: (c) => c.treat.alternatives.length ? `विकल्प (सबसे अच्छी दवा की जगह या अगले छिड़काव में):\n${c.treat.alternatives.map((a, i) => `${i + 1}. ${a.name} — ${a.perTank}/टंकी, ₹${a.cost}`).join('\n')}` : 'इसकी कोई रासायनिक विकल्प दवा नहीं है — जैविक उपाय करें।',
    mix: (c) => `नहीं — इन्हें मिलाएँ नहीं। ये विकल्प हैं। हर छिड़काव में सिर्फ़ एक दवा, और अगली बार दूसरी दवा:\n${c.treat.rotation.map(r => `• छिड़काव ${r.spray} (दिन ${r.day}): ${r.name}`).join('\n')}\nनए धब्बे आना बंद हो जाएँ तो रोक दें।`,
    dose: (c) => c.treat.best ? `${c.treat.best.name}: हर 16 लीटर टंकी में ${c.treat.best.perTank}। ${c.acres} एकड़ के लिए ${c.treat.best.tanks} टंकी (${c.treat.best.water} लीटर पानी)। खरीदें: ${c.treat.best.buy}।` : 'इस समस्या में छिड़काव की ज़रूरत नहीं।',
    harvest: (c) => c.safeHarvest ? `${c.treat.best?.name} छिड़कने के बाद ${c.treat.best?.phi} दिन रुकें। ${c.safeHarvest} से कटाई सुरक्षित है।` : 'कोई रुकना नहीं — कोई रासायनिक दवा नहीं दी गई।',
    when: (c) => c.weather?.window ? `छिड़काव का सबसे अच्छा समय: ${c.weather.window}। 4 घंटे में बारिश हो या हवा तेज़ हो तो न छिड़कें।` : 'मौसम पेज पर खेत की लोकेशन डालें। आम नियम: सुबह या शाम छिड़कें, 4 घंटे बारिश न हो, हवा कम हो।',
    weather: (c) => c.weather ? `${c.weather.place}: ${c.weather.summary}। रोग दबाव ${c.weather.risk} — ${c.weather.reason}।` : 'आपके खेत की लोकेशन नहीं पता। मौसम पेज पर सेट करें।',
    fert: (c) => `अभी ${c.cropName} के लिए सबसे अच्छी खाद:\n${c.nutrition.map((n, i) => `${i + 1}. ${n.name} — ${n.how}। लगभग ₹${n.cost}। मिलान ${n.match}%${n.high > n.low ? ` (${n.low}–${n.high}%)` : ''}`).join('\n')}\nदवा के 3–4 दिन बाद डालें, एक ही टंकी में न मिलाएँ।`,
    organic: (c) => `जैविक उपाय:\n${c.organic.map(o => '• ' + o).join('\n')}`,
    cost: (c) => c.economics ? `खतरे में फसल मूल्य ≈ ₹${c.economics.lossValue}। इलाज ≈ ₹${c.economics.treatmentCost}। शुद्ध बचत ≈ ₹${c.economics.net}${c.economics.roi ? ` (${c.economics.roi}× वापसी)` : ''}।` : 'फसल स्वस्थ है — इलाज का खर्च नहीं।',
    spread: (c) => c.projection ? `इलाज न करने पर इस हफ़्ते के मौसम में नुकसान ${c.severity}% से बढ़कर लगभग ${c.projection.untreated}% हो सकता है। इलाज से यह लगभग ${c.projection.treated}% रहेगा।` : 'फैलाव का अनुमान रोग की जाँच के बाद।',
    prevent: (c) => `अगले मौसम के लिए:\n${c.prevention.map(p => '• ' + p).join('\n')}`,
    safety: () => 'दस्ताने, मास्क और पूरी बाँह के कपड़े पहनें। हवा की दिशा में छिड़कें, बारिश से पहले नहीं। बाद में हाथ-कपड़े धोएँ। बच्चों और जानवरों को दूर रखें।',
    helpline: () => 'किसान कॉल सेंटर: 1800-180-1551 (मुफ़्त, सभी भाषाएँ, सुबह 6 – रात 10)। नज़दीकी कृषि विज्ञान केंद्र (KVK) से भी संपर्क करें।',
    what: (c) => `${c.disease.name} (${c.disease.pathogen})। लक्षण: ${c.symptoms.slice(0, 2).join('; ')}।`,
    unknown: () => 'पूरी तरह समझ नहीं पाया। नीचे दिए सुझाव आज़माएँ। खुले सवालों के लिए सेटिंग्स में मुफ़्त Gemini key जोड़ें।',
  },
  mr: {
    noctx: 'तपासणीनंतर मी सर्वोत्तम उत्तर देऊ शकतो. पीक डॉक्टर उघडा, पानाचा फोटो घ्या, मग रोग, औषध, खत, हवामान किंवा खर्चाबद्दल विचारा.',
    help: (c) => `नमस्कार! तुमच्या ${c.cropName} पिकाला ${c.disease.name} आहे (${c.severity}% पान खराब). विचारा — आधी कोणते औषध, किती प्रमाण, सर्वोत्तम खत, फवारणीची वेळ, किंवा रोग वाढेल का.`,
    best: (c) => c.treat.best ? `सर्वोत्तम: ${c.treat.best.name} — प्रत्येक 16 लिटर पंपात ${c.treat.best.perTank}, ${c.acres} एकरसाठी ${c.treat.best.tanks} पंप (सुमारे ₹${c.treat.best.cost}). पंपात फक्त हेच एक औषध टाका.` : `या रोगावर रासायनिक औषध नाही. हे करा: ${c.organic.slice(0, 2).join('; ')}.`,
    alt: (c) => c.treat.alternatives.length ? `पर्याय (सर्वोत्तम औषधाऐवजी किंवा पुढच्या फवारणीत):\n${c.treat.alternatives.map((a, i) => `${i + 1}. ${a.name} — ${a.perTank}/पंप, ₹${a.cost}`).join('\n')}` : 'याला रासायनिक पर्याय नाही — सेंद्रिय उपाय करा.',
    mix: (c) => `नाही — ही औषधे एकत्र मिसळू नका. हे पर्याय आहेत. प्रत्येक फवारणीत एकच औषध, पुढच्या वेळी दुसरे:\n${c.treat.rotation.map(r => `• फवारणी ${r.spray} (दिवस ${r.day}): ${r.name}`).join('\n')}\nनवीन ठिपके येणे थांबले की फवारणी थांबवा.`,
    dose: (c) => c.treat.best ? `${c.treat.best.name}: प्रत्येक 16 लिटर पंपात ${c.treat.best.perTank}. ${c.acres} एकरसाठी ${c.treat.best.tanks} पंप (${c.treat.best.water} लिटर पाणी). खरेदी: ${c.treat.best.buy}.` : 'या समस्येत फवारणीची गरज नाही.',
    harvest: (c) => c.safeHarvest ? `${c.treat.best?.name} फवारल्यानंतर ${c.treat.best?.phi} दिवस थांबा. ${c.safeHarvest} पासून काढणी सुरक्षित.` : 'थांबण्याची गरज नाही — रासायनिक औषध नाही.',
    when: (c) => c.weather?.window ? `फवारणीची सर्वोत्तम वेळ: ${c.weather.window}. 4 तासांत पाऊस किंवा जोरदार वारा असल्यास फवारू नका.` : 'हवामान पानावर शेताचे ठिकाण सेट करा. साधा नियम: सकाळी किंवा संध्याकाळी फवारा, 4 तास पाऊस नको, वारा कमी.',
    weather: (c) => c.weather ? `${c.weather.place}: ${c.weather.summary}. रोग दबाव ${c.weather.risk} — ${c.weather.reason}.` : 'तुमच्या शेताचे ठिकाण माहीत नाही. हवामान पानावर सेट करा.',
    fert: (c) => `आत्ता ${c.cropName} साठी सर्वोत्तम खत:\n${c.nutrition.map((n, i) => `${i + 1}. ${n.name} — ${n.how}. सुमारे ₹${n.cost}. जुळणी ${n.match}%${n.high > n.low ? ` (${n.low}–${n.high}%)` : ''}`).join('\n')}\nऔषधानंतर 3–4 दिवसांनी द्या, एकाच पंपात मिसळू नका.`,
    organic: (c) => `सेंद्रिय उपाय:\n${c.organic.map(o => '• ' + o).join('\n')}`,
    cost: (c) => c.economics ? `धोक्यातील पीक मूल्य ≈ ₹${c.economics.lossValue}. उपचार ≈ ₹${c.economics.treatmentCost}. निव्वळ बचत ≈ ₹${c.economics.net}${c.economics.roi ? ` (${c.economics.roi}× परतावा)` : ''}.` : 'पीक निरोगी आहे — उपचार खर्च नाही.',
    spread: (c) => c.projection ? `उपचार न केल्यास या आठवड्याच्या हवामानात नुकसान ${c.severity}% वरून सुमारे ${c.projection.untreated}% होऊ शकते. उपचाराने ते सुमारे ${c.projection.treated}% राहील.` : 'प्रसाराचा अंदाज रोग तपासणीनंतर.',
    prevent: (c) => `पुढील हंगामासाठी:\n${c.prevention.map(p => '• ' + p).join('\n')}`,
    safety: () => 'हातमोजे, मास्क आणि पूर्ण बाह्यांचे कपडे घाला. वाऱ्याच्या दिशेने फवारा, पावसापूर्वी नाही. नंतर हात व कपडे धुवा. मुले व जनावरे दूर ठेवा.',
    helpline: () => 'किसान कॉल सेंटर: 1800-180-1551 (मोफत, सर्व भाषा, सकाळी 6 – रात्री 10). जवळच्या कृषी विज्ञान केंद्राशी (KVK) संपर्क करा.',
    what: (c) => `${c.disease.name} (${c.disease.pathogen}). लक्षणे: ${c.symptoms.slice(0, 2).join('; ')}.`,
    unknown: () => 'पूर्ण समजले नाही. खालील सूचना वापरून पहा. खुल्या प्रश्नांसाठी सेटिंग्जमध्ये मोफत Gemini key जोडा.',
  },
};

/** Offline answer from the app's own data. */
export function localAnswer(q, ctx, lang = 'en') {
  const L = T[lang] || T.en;
  const intent = detectIntent(q);
  if (!ctx) return { intent, text: intent === 'helpline' ? L.helpline() : intent === 'safety' ? L.safety() : L.noctx };
  const fn = L[intent] || L.unknown;
  return { intent, text: fn(ctx) };
}

const LANG_NAME = { en: 'English', hi: 'Hindi', mr: 'Marathi' };

/** Open-ended answer from the language model, grounded in the diagnosis context. */
export async function aiAnswer(history, ctx, lang = 'en', onText) {
  const system = `You are "Sathi", a friendly agronomy assistant inside the AgriSathi app for Indian smallholder farmers.
Reply in ${LANG_NAME[lang] || 'English'} using simple words, at most 120 words, short bullet points when listing.
Use ONLY the numbers in the context for doses, costs, dates and weather; do not invent prices.
Pesticides in the list are alternatives: one product per spray, rotate groups. Never recommend Streptomycin/Tetracycline (banned on crops in India).
If the question needs a person (severe outbreak, poisoning), give Kisan Call Centre 1800-180-1551.
Context (JSON): ${JSON.stringify(ctx || { note: 'No diagnosis yet' })}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: history.slice(-10).filter((m, i, a) => a.findIndex(x => x.role === 'user') <= i).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    generationConfig: { maxOutputTokens: 1024 },
  };
  if (!settings.get().geminiKey?.trim()) {
    const r = await fetch('api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok || (r.headers.get('content-type') || '').includes('text/html')) throw Object.assign(new Error('no ai'), { code: 'nokey' });
    const j = await r.json();
    return (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
  }
  const res = await gemini(body, { onText, timeoutMs: 25000 });
  return res.text.trim();
}

export const hasAI = () => !!settings.get().geminiKey?.trim();
