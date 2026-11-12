// Fast Gemini client shared by Expert diagnosis and the Sathi chat.
// Speed-ups:
//  1. remembers the last model that worked, so later calls skip the fallback chain
//  2. asks for a low "thinking" level (much faster for simple vision/Q&A tasks); if a model
//     rejects that field the call is retried once without it and the choice is remembered
//  3. hard timeout, so the app never hangs waiting
//  4. optional streaming (chat text appears word by word)
import { settings } from './store.js';

export const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
export const FAST_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.6-flash'];
const MEM = 'agrisathi.gemini';
const mem = { get: () => { try { return JSON.parse(localStorage.getItem(MEM)) || {}; } catch { return {}; } }, set: (v) => { try { localStorage.setItem(MEM, JSON.stringify({ ...mem.get(), ...v })); } catch { /* ignore */ } } };

const textOf = (j) => (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');

function modelOrder() {
  const fast = settings.get().fastAI;
  const list = fast ? [...FAST_MODELS, ...MODELS] : MODELS;
  const last = mem.get()[fast ? 'fastModel' : 'model'];
  return [...new Set([last, ...list].filter(Boolean))];
}

/**
 * @param body    generateContent request body
 * @param onText  if given, the response is streamed and onText(fullTextSoFar) is called per chunk
 * @returns { text, json, model }
 */
export async function gemini(body, { signal, onText, timeoutMs = 30000 } = {}) {
  const key = settings.get().geminiKey?.trim();
  if (!key) throw Object.assign(new Error('No Gemini key'), { code: 'nokey' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
  signal?.addEventListener('abort', () => ctrl.abort(signal.reason));
  const fast = settings.get().fastAI;
  let last;
  try {
    for (const model of modelOrder()) {
      for (const thinking of mem.get().noThinking?.[model] ? [false] : [true, false]) {
        const b = structuredClone(body);
        b.generationConfig ||= {};
        if (thinking) b.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${onText ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
        let r;
        try { r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(b), signal: ctrl.signal }); }
        catch (e) { throw ctrl.signal.aborted ? Object.assign(new Error('Expert AI took too long'), { code: 'timeout' }) : e; }
        if (r.ok) {
          mem.set({ [fast ? 'fastModel' : 'model']: model });
          if (!onText) { const j = await r.json(); return { text: textOf(j), json: j, model: j.modelVersion || model }; }
          return { text: await readSSE(r, onText), model };
        }
        const j = await r.json().catch(() => ({}));
        last = Object.assign(new Error(j.error?.message || 'HTTP ' + r.status), { status: r.status });
        if (r.status === 400 && /API key/i.test(last.message)) { last.code = 'badkey'; throw last; }
        if (r.status === 400 && thinking && /thinking|Unknown name|Invalid JSON payload|not supported/i.test(last.message)) {
          mem.set({ noThinking: { ...(mem.get().noThinking || {}), [model]: true } });
          continue; // retry same model without the thinking field
        }
        break; // next model
      }
      if (last && ![404, 403, 429, 500, 503, 400].includes(last.status)) break;
    }
  } finally { clearTimeout(timer); }
  throw last || new Error('Gemini unavailable');
}

async function readSSE(r, onText) {
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try { full += textOf(JSON.parse(data)); onText(full); } catch { /* partial line */ }
    }
  }
  return full;
}
