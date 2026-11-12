// Serverless proxy for the Sathi chat assistant (Vercel Node.js function).
// Keeps the Gemini API key secret on the server so a public deployment can offer the chat
// assistant to every farmer without exposing the key. Set GEMINI_API_KEY in the Vercel project settings.
const MODELS = (process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-3.6-flash,gemini-flash-latest,gemini-3.5-flash-lite,gemini-2.5-flash').split(',');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(404).json({ error: 'Chat AI is not configured on this server' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  // Basic abuse guard: short text conversations only
  if ((body?.contents?.length || 0) > 12 || JSON.stringify(body).length > 2e5) return res.status(413).json({ error: 'Request too large' });
  let last = null;
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return res.status(200).json({ ...j, modelVersion: j.modelVersion || model });
    last = { status: r.status, error: j.error?.message || 'Upstream error' };
    if (![404, 403, 429, 500, 503].includes(r.status)) break;
  }
  return res.status(502).json({ error: last?.error || 'Expert service unavailable' });
}
