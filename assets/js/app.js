import { t, LANGS, lang } from './core/i18n.js';
import { settings } from './core/store.js';
import { $, esc, toast } from './core/util.js';
import { mountChat, closeChat } from './components/chat.js';

const ROUTES = {
  '': () => import('./pages/home.js'),
  doctor: () => import('./pages/doctor.js'),
  weather: () => import('./pages/weather.js'),
  tools: () => import('./pages/tools.js'),
  library: () => import('./pages/library.js'),
  disease: () => import('./pages/library.js'),
  farm: () => import('./pages/farm.js'),
  verify: () => import('./pages/verify.js'),
};
const NAV = [['doctor', 'nav_doctor', 'i-scan'], ['weather', 'nav_weather', 'i-cloud'], ['tools', 'nav_tools', 'i-calc'], ['library', 'nav_library', 'i-book'], ['farm', 'nav_farm', 'i-farm']];
const icon = (id) => `<svg class="icon"><use href="#${id}"/></svg>`;

let current = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [name, ...rest] = path.split('/');
  return { name: name || '', arg: rest.join('/'), query: new URLSearchParams(qs || '') };
}

function renderShell(active) {
  $('#nav').innerHTML = NAV.map(([r, k]) => `<a href="#/${r}" class="${active === r || (active === 'disease' && r === 'library') ? 'active' : ''}">${t(k)}</a>`).join('');
  $('#tabbar').innerHTML = [['', 'nav_home', 'i-home'], ['weather', 'nav_weather', 'i-cloud'], ['doctor', 'nav_doctor', 'i-camera'], ['tools', 'nav_tools', 'i-calc'], ['farm', 'nav_farm', 'i-farm']]
    .map(([r, k, ic]) => r === 'doctor'
      ? `<a href="#/doctor" class="scan ${active === r ? 'active' : ''}"><span class="fab">${icon(ic)}</span>${t(k)}</a>`
      : `<a href="#/${r}" class="${active === r ? 'active' : ''}">${icon(ic)}${t(k)}</a>`).join('');
  $('#ctaTop').textContent = t('cta_diagnose');
  const sel = $('#langSel');
  sel.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === lang() ? 'selected' : ''}>${v}</option>`).join('');
  document.documentElement.lang = lang();
  $('#footer').innerHTML = `
    <div class="wrap">
      <div class="cols">
        <div><a class="brand" href="#/" style="color:#fff"><img class="logo" src="assets/img/logo.svg" alt="">AgriSathi</a>
          <p class="small" style="margin-top:12px;max-width:320px">${t('disclaimer')}</p></div>
        <div><h4>${t('nav_doctor')}</h4><a href="#/doctor">${t('cta_diagnose')}</a><a href="#/library">${t('nav_library')}</a><a href="#/farm">${t('nav_farm')}</a></div>
        <div><h4>${t('nav_tools')}</h4><a href="#/tools?tab=spray">${t('t_spray')}</a><a href="#/tools?tab=fert">${t('t_fert')}</a><a href="#/tools?tab=profit">${t('t_profit')}</a><a href="#/weather">${t('nav_weather')}</a></div>
        <div><h4>Helplines</h4><a href="tel:18001801551">Kisan Call Centre · 1800-180-1551</a><a href="https://soilhealth.dac.gov.in" target="_blank" rel="noopener">Soil Health Card portal</a><a href="https://ppqs.gov.in/divisions/cib-rc/registered-products" target="_blank" rel="noopener">CIB&amp;RC registered products</a></div>
      </div>
      <div class="legal">© ${new Date().getFullYear()} AgriSathi · Weather data: Open-Meteo.com (CC BY 4.0) · Disease model: DINOv2-small fine-tuned on PlantVillage (CC BY-SA 4.0) · Maps © OpenStreetMap contributors</div>
    </div>`;
}

async function route() {
  const { name, arg, query } = parseHash();
  const loader = ROUTES[name] || ROUTES[''];
  renderShell(name);
  closeChat();
  try { current?.destroy?.(); } catch { /* ignore */ }
  const root = $('#app');
  root.innerHTML = '<div class="wrap" style="padding:60px 20px"><div class="skeleton" style="height:200px"></div></div>';
  try {
    const mod = await loader();
    root.innerHTML = '';
    current = mod;
    await mod.render(root, { name, arg, query });
    if (!location.hash.includes('tab=')) window.scrollTo({ top: 0 });
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="wrap" style="padding:60px 20px"><div class="alert bad">${esc(e.message)}</div></div>`;
  }
}

function openSettings() {
  const s = settings.get();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${t('settings')}</h3>
      <label class="f">${t('lang')}</label>
      <div class="seg" id="sLang">${Object.entries(LANGS).map(([k, v]) => `<button data-l="${k}" class="${k === s.lang ? 'on' : ''}">${v}</button>`).join('')}</div>
      <hr style="border:0;border-top:1px solid var(--line);margin:20px 0">
      <label class="f">${t('gemini_key')}</label>
      <div class="row"><input class="input" id="sKey" type="password" autocomplete="off" placeholder="AIza…" value="${esc(s.geminiKey || '')}"><button class="btn btn-ghost btn-sm" id="sTest" style="flex:0 0 auto">${t('test')}</button></div>
      <p class="small muted" style="margin-top:8px">Enables the Expert AI cross-check (better on real field photos and for rice, wheat, cotton, chilli…). Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. The key is stored only in this browser.</p>
      <label style="display:flex;gap:10px;align-items:center;margin-top:10px;font-size:.93rem"><input type="checkbox" id="sAuto" ${s.expertAuto ? 'checked' : ''}> Run Expert AI automatically on every diagnosis</label>
      <label style="display:flex;gap:10px;align-items:center;margin-top:8px;font-size:.93rem"><input type="checkbox" id="sFast" ${s.fastAI ? 'checked' : ''}> ⚡ Fast mode — use the lighter Flash-Lite model (about 2× faster, slightly less accurate)</label>
      <div class="actions" style="margin-top:22px;justify-content:flex-end">
        <button class="btn btn-ghost" id="sClose">${t('close')}</button><button class="btn btn-primary" id="sSave">${t('save')}</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  let chosen = s.lang;
  bg.querySelectorAll('#sLang button').forEach(b => b.onclick = () => { chosen = b.dataset.l; bg.querySelectorAll('#sLang button').forEach(x => x.classList.toggle('on', x === b)); });
  const close = () => bg.remove();
  bg.onclick = (e) => { if (e.target === bg) close(); };
  $('#sClose', bg).onclick = close;
  $('#sTest', bg).onclick = async () => {
    const key = $('#sKey', bg).value.trim();
    if (!key) return toast('Enter a key first', 'err');
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=50', { headers: { 'x-goog-api-key': key } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || r.status);
      const flash = (j.models || []).map(m => m.name.replace('models/', '')).filter(n => /flash/.test(n)).slice(0, 3);
      toast('✓ Key works · ' + (flash.join(', ') || 'models available'));
    } catch (e) { toast('Key not valid: ' + e.message, 'err', 5000); }
  };
  $('#sSave', bg).onclick = () => {
    settings.set({ lang: chosen, geminiKey: $('#sKey', bg).value.trim(), expertAuto: $('#sAuto', bg).checked, fastAI: $('#sFast', bg).checked });
    close(); route();
  };
}

// Theme: light / dark (remembers choice, follows the system by default)
const applyTheme = (th) => { if (th) document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme; };
applyTheme(settings.get().theme);
$('#themeBtn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const th = dark ? 'light' : 'dark'; settings.set({ theme: th }); applyTheme(th);
});
// "Install app" (PWA) button
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').classList.remove('hidden'); });
$('#installBtn').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#installBtn').classList.add('hidden'); });
mountChat();

$('#langSel').addEventListener('change', (e) => { settings.set({ lang: e.target.value }); route(); });
$('#settingsBtn').addEventListener('click', openSettings);
window.addEventListener('hashchange', route);
window.AgriSathi = { openSettings, chat: () => import('./components/chat.js').then(m => m.openChat()) };
route();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
