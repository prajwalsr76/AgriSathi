import { t, lang } from '../core/i18n.js';
import { DISEASES } from '../data/diseases.js';
import { CROPS, cropName } from '../data/crops.js';
import { history, field } from '../core/store.js';
import { $, $$, esc, fmtDate, loadScript, loadCss, LIBS, toast } from '../core/util.js';
import { severityClass } from '../core/imaging.js';

let map = null;
export function destroy() { if (map) { map.remove(); map = null; } }

export async function render(root) {
  const L = lang();
  const all = history.all();
  const f = field.get();
  const diseased = all.filter(h => !h.healthy);
  const byDisease = {};
  for (const h of diseased) byDisease[h.name] = (byDisease[h.name] || 0) + 1;
  const top = Object.entries(byDisease).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const avgSev = diseased.length ? diseased.reduce((s, h) => s + (h.severity || 0), 0) / diseased.length : 0;

  root.innerHTML = `
  <div class="wrap">
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap">
      <div><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${t('m_title')}</h1><p style="margin:0">${t('m_sub')}</p></div>
      <div class="actions">${all.length ? `<button class="btn btn-ghost btn-sm" id="csv">${t('export_csv')}</button><button class="btn btn-ghost btn-sm" id="clear"><svg class="icon"><use href="#i-trash"/></svg> ${t('clear')}</button>` : ''}</div>
    </div>
    <div class="grid g4" style="margin-bottom:18px">
      <div class="card"><div class="small muted">Scans</div><div class="money">${all.length}</div></div>
      <div class="card"><div class="small muted">Problems found</div><div class="money">${diseased.length}</div></div>
      <div class="card"><div class="small muted">Avg. leaf damage</div><div class="money">${avgSev.toFixed(1)}%</div></div>
      <div class="card"><div class="small muted">Field</div><div style="font-weight:600;margin-top:6px">${f ? esc(f.name) : '<a href="#/weather">Set location →</a>'}</div></div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);align-items:start" id="fg">
      <div class="card"><h3>Scan map</h3><div id="map"></div><p class="small muted" style="margin:8px 0 0">Each pin is a diagnosis at your saved field location. Clusters of the same disease nearby signal an outbreak.</p></div>
      <div class="card"><h3>Most frequent problems</h3>
        ${top.length ? top.map(([n, c]) => `<div class="prob-row"><span>${esc(n)}</span><b>${c}</b><div class="bar"><i style="width:${c / top[0][1] * 100}%"></i></div></div>`).join('') : `<p class="muted small">${t('no_history')}</p>`}
      </div>
    </div>
    <div class="card" style="margin-top:18px"><h3>History</h3>
      <div id="hist">${all.length ? all.map(h => {
        const sv = severityClass(h.severity || 0);
        const nm = h.key && DISEASES[h.key] ? (DISEASES[h.key].name[L] || DISEASES[h.key].name.en) : h.name;
        return `<div class="hist">${h.thumb ? `<img src="${h.thumb}" alt="">` : ''}<div class="grow"><b>${esc(nm)}</b><div class="small muted">${CROPS[h.crop]?.icon || ''} ${esc(cropName(h.crop, L) || '')} · ${fmtDate(h.date)} ${h.place ? '· ' + esc(h.place) : ''}</div></div>
          <span class="chip" style="background:${sv.color}22;color:${sv.color};border-color:${sv.color}44">${(h.severity ?? 0).toFixed(0)}%</span>
          <span class="chip grey">${Math.round(h.conf * 100)}%</span>
          <button class="icon-btn" data-del="${h.id}" aria-label="Delete"><svg class="icon"><use href="#i-trash"/></svg></button></div>`;
      }).join('') : `<p class="muted">${t('no_history')}</p><a class="btn btn-primary" href="#/doctor">${t('cta_diagnose')}</a>`}</div>
    </div>
  </div>`;
  const mq = matchMedia('(max-width: 860px)');
  $('#fg', root).style.gridTemplateColumns = mq.matches ? 'minmax(0,1fr)' : 'minmax(0,1.4fr) minmax(0,1fr)';

  $$('[data-del]', root).forEach(b => b.onclick = () => { history.remove(b.dataset.del); render(root); });
  $('#clear', root)?.addEventListener('click', () => { if (confirm('Delete all saved diagnoses on this device?')) { history.clear(); render(root); } });
  $('#csv', root)?.addEventListener('click', () => {
    const rows = [['id', 'date', 'crop', 'diagnosis', 'confidence', 'severity_pct', 'verdict', 'place', 'lat', 'lon']]
      .concat(all.map(h => [h.id, h.date, h.crop, h.name, h.conf.toFixed(3), h.severity, h.verdict, h.place || '', h.lat ?? '', h.lon ?? '']));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'agrisathi_history.csv'; a.click();
  });

  // Map
  try {
    loadCss(LIBS.leafletCss); await loadScript(LIBS.leaflet);
    destroy();
    const center = f ? [f.lat, f.lon] : [20.6, 78.9];
    map = window.L.map($('#map', root), { scrollWheelZoom: false }).setView(center, f ? 11 : 4);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
    const pts = all.filter(h => h.lat != null);
    pts.forEach((h, i) => {
      const jitter = () => (Math.sin(i * 12.9898) * 0.004);
      const sv = severityClass(h.severity || 0);
      window.L.circleMarker([h.lat + jitter(), h.lon + jitter() * 0.7], { radius: 9, color: '#fff', weight: 2, fillColor: h.healthy ? '#16a974' : sv.color, fillOpacity: .9 })
        .addTo(map).bindPopup(`<b>${esc(h.name)}</b><br>${esc(cropName(h.crop, 'en'))} · ${fmtDate(h.date)}<br>Damage ${h.severity}%`);
    });
    if (f) window.L.marker(center).addTo(map).bindPopup(esc(f.name));
  } catch { $('#map', root).innerHTML = '<p class="muted small" style="padding:20px">Map needs an internet connection.</p>'; toast('Map unavailable offline'); }
}
