import { t, lang } from '../core/i18n.js';
import { CROPS, CROP_ORDER, cropName } from '../data/crops.js';
import { DISEASES } from '../data/diseases.js';
import { field } from '../core/store.js';
import { fetchForecast, searchPlace, reverseGeocode, dailyStats, diseaseRisk, sprayWindows, WEATHER_ICON } from '../core/climate.js';
import { $, $$, esc, toast, fmtDay, fmtTime } from '../core/util.js';

const ic = (id) => `<svg class="icon"><use href="#${id}"/></svg>`;
let crop = 'tomato';

export async function render(root, { query }) {
  if (query.get('crop') && CROPS[query.get('crop')]) crop = query.get('crop');
  const L = lang();
  root.innerHTML = `
  <div class="wrap">
    <div class="page-head"><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${t('w_title')}</h1><p>${t('w_sub')}</p></div>
    <div class="card" style="margin-bottom:18px">
      <div class="row" style="flex-wrap:wrap;align-items:flex-end">
        <div style="flex:2;min-width:220px;position:relative">
          <label class="f">${t('search_place')}</label>
          <input class="input" id="q" placeholder="Nashik, Ludhiana, Guntur…" autocomplete="off">
          <div id="sug" class="card hidden" style="position:absolute;z-index:20;left:0;right:0;top:100%;padding:6px;margin-top:4px"></div>
        </div>
        <button class="btn btn-ghost" id="gps" style="flex:0 0 auto">${ic('i-gps')} ${t('use_gps')}</button>
        <div style="flex:1;min-width:160px"><label class="f">${t('crop')}</label>
          <select class="input" id="crop">${CROP_ORDER.map(k => `<option value="${k}" ${k === crop ? 'selected' : ''}>${CROPS[k].icon} ${esc(cropName(k, L))}</option>`).join('')}</select></div>
      </div>
    </div>
    <div id="wx"></div>
  </div>`;

  const q = $('#q', root), sug = $('#sug', root);
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    if (q.value.trim().length < 3) { sug.classList.add('hidden'); return; }
    timer = setTimeout(async () => {
      try {
        const res = await searchPlace(q.value.trim());
        sug.innerHTML = res.length ? res.map((p, i) => `<button data-i="${i}" style="display:block;width:100%;text-align:left;border:0;background:none;padding:10px;border-radius:8px"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.region)}</span></button>`).join('') : '<div class="muted small" style="padding:10px">No places found</div>';
        sug.classList.remove('hidden');
        $$('button', sug).forEach(b => b.onclick = () => { const p = res[+b.dataset.i]; field.set(p); sug.classList.add('hidden'); q.value = ''; load(root); });
      } catch { toast('Search unavailable offline', 'err'); }
    }, 350);
  });
  $('#gps', root).onclick = () => {
    if (!navigator.geolocation) return toast('Location not available', 'err');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      field.set({ ...(await reverseGeocode(lat, lon)), lat, lon }); load(root);
    }, () => toast('Location permission denied — search your village instead', 'err', 4500), { timeout: 10000 });
  };
  $('#crop', root).onchange = (e) => { crop = e.target.value; load(root); };
  load(root);
}

async function load(root) {
  const box = $('#wx', root);
  const f = field.get();
  if (!f) { box.innerHTML = `<div class="alert info">${ic('i-gps')}<div>Choose your field location (GPS or search) to see live disease risk.</div></div>`; return; }
  box.innerHTML = '<div class="skeleton" style="height:180px"></div>';
  let fc;
  try { fc = await fetchForecast(f.lat, f.lon); }
  catch (e) { box.innerHTML = `<div class="alert bad">${ic('i-alert')}<div>${esc(e.message)}. Check your internet connection.</div></div>`; return; }
  const L = lang();
  const st = dailyStats(fc.hours);
  const c = fc.current;
  const days = fc.days.filter(d => d.date >= fc.today).slice(0, 7);
  const models = [...new Set(Object.values(DISEASES).filter(d => d.crop === crop && d.risk !== 'none').map(d => d.risk))];
  const risks = Object.entries(DISEASES).filter(([, d]) => d.crop === crop && d.risk !== 'none' && d.type !== 'healthy')
    .map(([k, d]) => ({ k, d, r: diseaseRisk(d.risk, st, fc.today) })).sort((a, b) => b.r.score - a.r.score);
  if (!risks.length) models.push('generic_fungal');
  const sw = sprayWindows(fc.hours, c.time);
  const et0 = days.reduce((s, d) => s + (d.et0 || 0), 0), rain = days.reduce((s, d) => s + d.rain, 0);

  box.innerHTML = `
  <div class="grid g2" style="margin-bottom:18px">
    <div class="card wx-now">
      <div style="font-size:3.4rem">${WEATHER_ICON(c.weather_code, c.is_day)}</div>
      <div><div class="temp">${Math.round(c.temperature_2m)}°</div><div class="muted">${esc(f.name)}${f.region ? ', ' + esc(f.region) : ''}</div></div>
      <div style="margin-left:auto;text-align:right" class="small">💧 ${c.relative_humidity_2m}% RH<br>🌬️ ${Math.round(c.wind_speed_10m)} km/h<br>🌧️ ${c.precipitation} mm</div>
    </div>
    <div class="card">
      <h3>💧 ${t('irrigation')} (7 days)</h3>
      <dl class="kv"><dt>Crop water demand (ET₀)</dt><dd>${et0.toFixed(0)} mm</dd><dt>Forecast rain</dt><dd>${rain.toFixed(0)} mm</dd>
      <dt>Deficit</dt><dd><b style="color:${et0 - rain > 15 ? 'var(--red)' : 'var(--green-700)'}">${Math.max(0, et0 - rain).toFixed(0)} mm</b> ${et0 - rain > 15 ? '— plan irrigation' : '— rain covers most of the need'}</dd></dl>
      <p class="small muted" style="margin:8px 0 0">FAO-56 reference evapotranspiration; multiply by your crop coefficient (Kc ≈ 0.6–1.15) for the exact need.</p>
    </div>
  </div>
  <div class="days" style="margin-bottom:22px">${days.map(d => `<div class="day"><div class="small muted">${fmtDay(d.date)}</div><div class="e">${WEATHER_ICON(d.code)}</div><b>${Math.round(d.tmax)}°</b> <span class="muted">${Math.round(d.tmin)}°</span><div class="rain">${d.rain ? d.rain.toFixed(1) + ' mm' : '&nbsp;'}</div><div class="small muted">${d.pop ?? 0}%</div></div>`).join('')}</div>

  <h2 style="font-size:1.4rem">${t('risk_for')} ${CROPS[crop].icon} ${esc(cropName(crop, L))}</h2>
  <div class="grid g3" style="margin-bottom:26px">
    ${risks.length ? risks.map(({ k, d, r }) => `
      <a class="card risk-card ${r.level}" href="#/disease/${k}" style="color:inherit">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">${esc(d.name[L] || d.name.en)}</h3>
          <span class="chip ${r.level === 'high' ? 'bad' : r.level === 'moderate' ? 'warn' : ''}"><span class="badge-dot"></span>${t(r.level)}</span></div>
        <p class="small muted" style="margin:8px 0 0">${esc(r.reason)}</p>
        <div class="risk-dots">${r.days.slice(0, 7).map(x => `<i class="${x.fav >= 1 ? 'f1' : x.fav > 0 ? 'f05' : ''}" title="${x.date}"></i>`).join('')}</div>
      </a>`).join('') : '<div class="card muted">No weather-driven diseases in the library for this crop.</div>'}
  </div>

  <div class="card">
    <h3>${ic('i-spray')} ${t('spray_planner')}</h3>
    <div class="timeline" style="margin-top:12px">${sw.hours.map(h => `<i class="${h.ok ? 'ok' : h.reasons.includes('night') ? 'night' : 'bad'}" title="${h.time.replace('T', ' ')} · ${Math.round(h.temp)}°C · ${Math.round(h.wind)} km/h${h.reasons.length ? ' · ' + h.reasons.join(', ') : ''}"></i>`).join('')}</div>
    <div class="tl-labels">${[0, 24, 48].map(i => sw.hours[i] ? `<span>${fmtDay(sw.hours[i].date)}</span>` : '').join('')}<span></span></div>
    <div class="small" style="display:flex;gap:14px;margin:10px 0;flex-wrap:wrap"><span><i class="badge-dot" style="color:var(--green-500)"></i> ${t('good')}</span><span><i class="badge-dot" style="color:#f3b4ae"></i> ${t('avoid')} (rain / wind / heat)</span><span><i class="badge-dot" style="color:#d7dde0"></i> night</span></div>
    ${sw.windows.length ? sw.windows.slice(0, 4).map((w, i) => `<div class="window-pill" style="${i ? 'background:#f4f6f5' : ''}"><b>${fmtDay(w.start.slice(0, 10))}, ${fmtTime(w.start)} – ${fmtTime(w.end)}</b><span>${w.hours} h · ${Math.round(w.avgTemp)}°C · ${Math.round(w.avgWind)} km/h</span></div>`).join('') : `<div class="alert">${ic('i-alert')}<div>${t('no_window')}</div></div>`}
    <p class="small muted" style="margin:12px 0 0">Rules: no rain for 4 h after spraying, wind ≤ 15 km/h (drift), temperature 8–32 °C (evaporation), leaves dry (RH &lt; 92 %), daylight.</p>
  </div>
  <p class="small muted" style="margin-top:14px">Models: Hutton criteria (late blight), TOMCAST disease-severity values (early blight, Septoria, target spot), Gubler–Thomas index (powdery mildew), leaf-wetness rules for rust, blast and bacterial diseases. Forecast: Open-Meteo · updated ${fmtTime(c.time)}.</p>`;
}
