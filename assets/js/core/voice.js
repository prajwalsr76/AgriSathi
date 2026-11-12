// Voice read-out using the browser's built-in speech engine (no server, works offline on most phones).
const LOCALE = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

function pickVoice(lang) {
  const voices = speechSynthesis.getVoices();
  const want = LOCALE[lang];
  return voices.find(v => v.lang === want) || voices.find(v => v.lang?.startsWith(lang))
    || (lang === 'mr' ? voices.find(v => v.lang === 'hi-IN') : null) // Marathi text reads acceptably with a Hindi voice
    || voices.find(v => v.lang === 'en-IN') || null;
}

export const canSpeak = () => 'speechSynthesis' in window;

export function speak(text, lang = 'en', onEnd) {
  if (!canSpeak()) return false;
  speechSynthesis.cancel();
  // Chrome stops long utterances after ~15 s, so speak sentence by sentence.
  const parts = text.split(/(?<=[.!?।])\s+/).filter(Boolean);
  const voice = pickVoice(lang);
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = voice?.lang || LOCALE[lang]; if (voice) u.voice = voice;
    u.rate = 0.95;
    if (i === parts.length - 1 && onEnd) u.onend = onEnd;
    speechSynthesis.speak(u);
  });
  return true;
}
export const stopSpeaking = () => canSpeak() && speechSynthesis.cancel();
if (canSpeak()) speechSynthesis.getVoices();

const TPL = {
  en: (r) => r.healthy
    ? `Good news. Your ${r.crop} plant looks healthy. Keep checking it twice a week.`
    : `Your ${r.crop} crop has ${r.disease}. About ${r.sev} percent of the leaf is damaged, which is ${r.sevLabel} severity. ` +
      (r.product ? `Spray ${r.product}, ${r.dose} in each 16 litre tank. For your field you need ${r.tanks} tanks. ` : '') +
      (r.phi ? `Do not harvest for ${r.phi} days after spraying. ` : '') + (r.window ? `The best time to spray is ${r.window}.` : ''),
  hi: (r) => r.healthy
    ? `अच्छी खबर। आपका ${r.crop} का पौधा स्वस्थ दिखता है। हफ़्ते में दो बार देखते रहें।`
    : `आपकी ${r.crop} की फसल में ${r.disease} रोग है। पत्ती का लगभग ${r.sev} प्रतिशत हिस्सा खराब है। ` +
      (r.product ? `${r.product} का छिड़काव करें, हर 16 लीटर की टंकी में ${r.dose}। आपके खेत के लिए ${r.tanks} टंकी चाहिए। ` : '') +
      (r.phi ? `छिड़काव के बाद ${r.phi} दिन तक कटाई न करें। ` : '') + (r.window ? `छिड़काव का सबसे अच्छा समय ${r.window} है।` : ''),
  mr: (r) => r.healthy
    ? `चांगली बातमी. तुमचे ${r.crop} चे झाड निरोगी दिसते. आठवड्यातून दोनदा पाहणी करा.`
    : `तुमच्या ${r.crop} पिकाला ${r.disease} रोग आहे. पानाचा सुमारे ${r.sev} टक्के भाग खराब आहे. ` +
      (r.product ? `${r.product} ची फवारणी करा, प्रत्येक 16 लिटर पंपात ${r.dose}. तुमच्या शेतासाठी ${r.tanks} पंप लागतील. ` : '') +
      (r.phi ? `फवारणीनंतर ${r.phi} दिवस काढणी करू नका. ` : '') + (r.window ? `फवारणीची सर्वोत्तम वेळ ${r.window} आहे.` : ''),
};
export const advisoryText = (lang, r) => (TPL[lang] || TPL.en)(r);
