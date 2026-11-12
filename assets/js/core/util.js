export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(d).toLocaleDateString('en-IN', opts);
export const fmtTime = (iso) => { const h = +iso.slice(11, 13); return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); };
export const fmtDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });

const loaded = {};
const LOCAL_COPY = { 'jspdf.umd.min.js': 'assets/vendor/jspdf.umd.min.js', 'qrcode.min.js': 'assets/vendor/qrcode.min.js' };
/** Loads a library, preferring the offline copy in assets/vendor (if setup_offline.py was run). */
export async function loadScript(src) {
  const local = LOCAL_COPY[src.split('/').pop()];
  if (local) { try { return await loadOne(local); } catch { /* fall back to CDN */ } }
  return loadOne(src);
}
function loadOne(src) {
  return loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Failed to load ' + src)); };
    document.head.appendChild(s);
  });
}
export function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
}

export const LIBS = {
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  qrcode: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  leaflet: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  leafletCss: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
};

export function toast(msg, kind = 'info', ms = 3200) {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

export const b64url = {
  enc: (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)))),
};

export async function sha256hex(str) {
  if (!crypto?.subtle) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(16).padStart(8, '0'); }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function loadImage(src) {
  return new Promise((ok, fail) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => fail(new Error('Could not open image')); i.src = src; });
}

/** Downscale an image so its long side is at most `max` px. Returns a canvas. */
export function fitCanvas(img, max = 512) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export const canvasBlob = (c, type = 'image/jpeg', q = 0.88) => new Promise(r => c.toBlob(r, type, q));
