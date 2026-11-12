// Small persistence layer (browser localStorage, guarded for private mode).
const K = { settings: 'agrisathi.settings', history: 'agrisathi.history', field: 'agrisathi.field' };

const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const settings = {
  get: () => ({ lang: 'en', geminiKey: '', expertAuto: true, ...read(K.settings, {}) }),
  set: (patch) => write(K.settings, { ...settings.get(), ...patch }),
};

export const field = {
  get: () => read(K.field, null), // { name, region, lat, lon }
  set: (v) => write(K.field, v),
};

export const history = {
  all: () => read(K.history, []),
  add: (entry) => { const h = history.all(); h.unshift(entry); while (h.length > 60) h.pop(); if (!write(K.history, h)) { h.splice(20); write(K.history, h); } return entry; },
  remove: (id) => write(K.history, history.all().filter(e => e.id !== id)),
  clear: () => write(K.history, []),
};

export const uid = () => Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
