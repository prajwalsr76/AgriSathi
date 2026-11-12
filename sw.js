// Offline support: app shell is network-first (always fresh when online, cached when offline);
// third-party libraries, fonts, sample images and the AI model are cache-first.
const SHELL = 'agrisathi-shell-v11';
const ASSETS = 'agrisathi-assets-v1';
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest', 'assets/css/styles.css', 'assets/img/logo.svg',
  'assets/js/app.js', 'assets/js/core/i18n.js', 'assets/js/core/store.js', 'assets/js/core/util.js',
  'assets/js/core/agronomy.js', 'assets/js/core/climate.js', 'assets/js/core/imaging.js', 'assets/js/core/classifier.js',
  'assets/js/core/model-worker.js', 'assets/js/core/expert.js', 'assets/js/core/voice.js', 'assets/js/core/report.js',
  'assets/js/data/crops.js', 'assets/js/data/diseases.js', 'assets/js/data/chemicals.js',
  'assets/js/pages/home.js', 'assets/js/pages/doctor.js', 'assets/js/pages/weather.js', 'assets/js/pages/tools.js',
  'assets/js/pages/library.js', 'assets/js/pages/farm.js', 'assets/js/pages/verify.js',
  'assets/js/components/chat.js', 'assets/js/core/advisor.js', 'assets/js/core/assistant.js', 'assets/js/core/decision.js', 'assets/js/core/gemini.js', 'assets/js/core/fieldhead.js', 'assets/js/core/leafgate.js', 'assets/js/data/fertilizers.js', 'assets/js/data/samples.js',
  'model/field_head.json', 'model/crops_head.json',
];

self.addEventListener('install', (e) => {
  // each file is cached on its own, so one missing file never stops the rest from being cached
  e.waitUntil(caches.open(SHELL).then(c => Promise.allSettled(PRECACHE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('agrisathi-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Live data must never be served stale from cache
  if (/open-meteo\.com|bigdatacloud|generativelanguage|tile\.openstreetmap/.test(url.host)) return;
  // The model worker manages its own cache for model files
  if (/huggingface\.co|hf\.co/.test(url.host)) return;
  // the model worker keeps its own copy of the 24 MB model — don't store it twice
  if (url.origin === location.origin && /\.(onnx|f32)$/.test(url.pathname)) return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }
  if (/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(ASSETS).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
