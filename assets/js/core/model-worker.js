/* On-device inference worker.
 * Runs the DINOv2-small plant-disease classifier with ONNX Runtime Web (WebAssembly) off the
 * UI thread. The model is loaded from the local /model folder when present (offline use),
 * otherwise from the Hugging Face Hub, and is stored in Cache Storage after the first download.
 */
const ORT_VERSION = '1.30.0';
// WebAssembly-only build of ONNX Runtime. Loaded from assets/vendor/ort when present
// (fully offline — created by tools/setup_offline.py), otherwise from the CDN.
const ORT_LOCAL = new URL('../../vendor/ort/', self.location.href).href;
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
let ORT_BASE = ORT_LOCAL;
try { importScripts(ORT_LOCAL + 'ort.wasm.min.js'); }
catch { ORT_BASE = ORT_CDN; importScripts(ORT_CDN + 'ort.wasm.min.js'); }
ort.env.wasm.wasmPaths = ORT_BASE;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;

const SOURCES = {
  model: ['../../../model/plant_disease_dinov2_int8.onnx',
    'https://huggingface.co/rodynaemad/plant-disease-dinov2-small/resolve/main/onnx/model_with_features_quantized.onnx'],
  centroids: ['../../../model/centroids.f32',
    'https://huggingface.co/spaces/rodynaemad/plant-disease-scanner/resolve/main/centroids.f32'],
};
const CACHE = 'agrisathi-model-v1';
let session = null, centroids = null;

async function fetchWithProgress(urls, label) {
  let lastErr;
  for (const url of urls) {
    try {
      const abs = new URL(url, self.location.href).href;
      const cache = self.caches ? await caches.open(CACHE) : null;
      const hit = cache && await cache.match(abs);
      if (hit) { postMessage({ type: 'progress', label, loaded: 1, total: 1, source: 'cache' }); return await hit.arrayBuffer(); }
      const res = await fetch(abs);
      if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) throw new Error(res.status + ' ' + url);
      const total = +res.headers.get('content-length') || 0;
      const reader = res.body.getReader();
      const chunks = []; let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.length;
        postMessage({ type: 'progress', label, loaded, total, source: url.startsWith('http') ? 'hub' : 'local' });
      }
      const buf = new Uint8Array(loaded); let o = 0;
      for (const c of chunks) { buf.set(c, o); o += c.length; }
      if (cache) await cache.put(abs, new Response(buf.slice().buffer, { headers: { 'content-type': 'application/octet-stream' } }));
      return buf.buffer;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Could not load ' + label);
}

async function init() {
  if (session) return;
  const [modelBuf, cBuf] = await Promise.all([fetchWithProgress(SOURCES.model, 'model'), fetchWithProgress(SOURCES.centroids, 'centroids')]);
  centroids = new Float32Array(cBuf);
  session = await ort.InferenceSession.create(modelBuf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

function maxCosine(f, dim, k) {
  let norm = 0; for (let j = 0; j < dim; j++) norm += f[j] * f[j];
  norm = Math.sqrt(norm) || 1;
  let best = -1, arg = -1;
  for (let c = 0; c < k; c++) {
    let dot = 0; for (let j = 0; j < dim; j++) dot += centroids[c * dim + j] * f[j];
    const s = dot / norm; if (s > best) { best = s; arg = c; }
  }
  return { sim: best, nearest: arg };
}

async function run(tensors) {
  const out = [];
  for (const data of tensors) {
    const t0 = performance.now();
    const r = await session.run({ pixel_values: new ort.Tensor('float32', data, [1, 3, 224, 224]) });
    const logits = Array.from(r.logits.data);
    const feats = r.features.data;
    const k = logits.length, dim = feats.length;
    out.push({ logits, features: Array.from(feats), ...maxCosine(feats, dim, k), ms: performance.now() - t0 });
  }
  return out;
}

self.onmessage = async (e) => {
  const { id, cmd, tensors } = e.data;
  try {
    if (cmd === 'init') { await init(); postMessage({ id, ok: true }); }
    else if (cmd === 'run') { await init(); postMessage({ id, ok: true, result: await run(tensors) }); }
  } catch (err) { postMessage({ id, ok: false, error: String(err && err.message || err) }); }
};
