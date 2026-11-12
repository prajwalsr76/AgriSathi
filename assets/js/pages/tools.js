import { t, lang } from '../core/i18n.js';
import { CROPS, CROP_ORDER, cropName } from '../data/crops.js';
import { CHEMICALS } from '../data/chemicals.js';
import { sprayPlan, fertilizerPlan, economics, toAcres, AREA_UNITS, FERTILIZERS, safeHarvestDate, inr } from '../core/agronomy.js';
import { $, $$, esc, fmtDate } from '../core/util.js';

const S = { tab: 'spray', area: 1, unit: 'acre', crop: 'tomato', chem: 'mancozeb', water: 200, tank: 16, dose: null, soil: { n: 'medium', p: 'medium', k: 'medium' }, prices: {}, sev: 15, risk: 'moderate', price: null, yld: null, cost: 600, maxLoss: 40 };

export async function render(root, { query }) {
  if (['spray', 'fert', 'profit'].includes(query.get('tab'))) S.tab = query.get('tab');
  const L = lang();
  root.innerHTML = `
  <div class="wrap">
    <div class="page-head"><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${t('t_title')}</h1><p>${t('t_sub')}</p></div>
    <div class="seg" id="tabs" style="margin-bottom:18px">
      <button data-t="spray">🧪 ${t('t_spray')}</button><button data-t="fert">🌾 ${t('t_fert')}</button><button data-t="profit">₹ ${t('t_profit')}</button>
    </div>
    <div class="card" style="margin-bottom:18px">
      <div class="row" style="flex-wrap:wrap">
        <div style="min-width:160px"><label class="f">${t('crop')}</label><select class="input" id="crop">${CROP_ORDER.map(k => `<option value="${k}" ${k === S.crop ? 'selected' : ''}>${CROPS[k].icon} ${esc(cropName(k, L))}</option>`).join('')}</select></div>
        <div style="min-width:120px"><label class="f">${t('area')}</label><input class="input" id="area" type="number" min="0.05" step="0.05" value="${S.area}"></div>
        <div style="min-width:120px"><label class="f">Unit</label><select class="input" id="unit">${Object.entries(AREA_UNITS).map(([k, u]) => `<option value="${k}" ${k === S.unit ? 'selected' : ''}>${u.label}</option>`).join('')}</select></div>
      </div>
    </div>
    <div id="pane"></div>
  </div>`;
  const draw = () => {
    $$('#tabs button', root).forEach(b => b.classList.toggle('on', b.dataset.t === S.tab));
    $('#pane', root).innerHTML = S.tab === 'spray' ? sprayPane() : S.tab === 'fert' ? fertPane() : profitPane();
    wire(root, draw);
  };
  $$('#tabs button', root).forEach(b => b.onclick = () => { S.tab = b.dataset.t; history.replaceState(null, '', '#/tools?tab=' + S.tab); draw(); });
  $('#crop', root).onchange = (e) => { S.crop = e.target.value; S.water = CROPS[S.crop].waterPerAcre; S.price = null; S.yld = null; draw(); };
  $('#area', root).onchange = (e) => { S.area = Math.max(0.05, +e.target.value || 1); draw(); };
  $('#unit', root).onchange = (e) => { S.unit = e.target.value; draw(); };
  draw();
}

const num = (id, v, step = 'any', extra = '') => `<input class="input" data-k="${id}" type="number" step="${step}" value="${v}" ${extra}>`;

function sprayPane() {
  const acres = toAcres(S.area, S.unit);
  const c = CHEMICALS[S.chem];
  const p = sprayPlan({ acres, chemKey: S.chem, waterPerAcre: S.water, tankLitres: S.tank, dosePerLitre: S.dose ?? c.dose });
  return `<div class="grid g2">
    <div class="card">
      <label class="f">${t('product')}</label>
      <select class="input" data-k="chem">${Object.entries(CHEMICALS).map(([k, x]) => `<option value="${k}" ${k === S.chem ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <div class="row" style="margin-top:12px;flex-wrap:wrap">
        <div><label class="f">${t('dose_l')} (${c.unit})</label>${num('dose', S.dose ?? c.dose, '0.1')}</div>
        <div><label class="f">Water / acre (L)</label>${num('water', S.water, '10')}</div>
        <div><label class="f">Tank (L)</label>${num('tank', S.tank, '1')}</div>
      </div>
      <p class="small muted" style="margin:12px 0 0">${esc(c.brands)} · ${esc(c.group)}</p>
    </div>
    <div class="card">
      <div class="grid g3" style="gap:10px">
        <div class="stat-tile"><div class="l">Per ${S.tank} L tank</div><div class="money">${p.dosePerTank} ${p.unit}</div></div>
        <div class="stat-tile"><div class="l">${t('tanks')}</div><div class="money">${p.tanks}</div></div>
        <div class="stat-tile"><div class="l">${t('water')}</div><div class="money">${p.water} L</div></div>
      </div>
      <dl class="kv" style="margin-top:16px">
        <dt>Total product</dt><dd>${p.totalNeed} ${p.unit}</dd>
        <dt>Cheapest packs</dt><dd>${p.packs.items.map(i => `${i.n} × ${i.size} ${p.unit} (${inr(i.price)})`).join(' + ')}</dd>
        <dt>${t('cost')}</dt><dd><b>${inr(p.packs.cost)}</b> · leftover ${p.packs.waste} ${p.unit}</dd>
        <dt>If you buy bulk</dt><dd>${p.bulk.n} × ${p.bulk.size} ${p.unit} = ${inr(p.bulk.cost)} ${p.savings > 0 ? `<span class="chip">save ${inr(p.savings)}</span>` : ''}</dd>
        <dt>${t('safe_harvest')}</dt><dd>${fmtDate(safeHarvestDate(new Date(), p.phi))} (PHI ${p.phi} ${t('days')})</dd>
      </dl>
    </div>
  </div>
  <div class="card" style="margin-top:18px"><h3>How it is calculated</h3>
    <p class="small muted" style="margin:0">Water = area × ${S.water} L/acre = ${p.water} L → tanks = ⌈${p.water} ÷ ${S.tank}⌉ = ${p.tanks}. Dose per tank = ${S.dose ?? c.dose} ${c.unit}/L × ${S.tank} L = ${p.dosePerTank} ${c.unit}. Packs are chosen by an unbounded-knapsack search for the lowest total price that covers ${p.totalNeed} ${c.unit}. Pack prices are indicative MRPs — edit the dose to match your product label.</p></div>`;
}

function fertPane() {
  const acres = toAcres(S.area, S.unit);
  const plan = fertilizerPlan({ cropKey: S.crop, acres, soil: S.soil, prices: S.prices });
  const rdf = CROPS[S.crop].rdf;
  const soilSel = (n) => `<select class="input" data-soil="${n}">${['low', 'medium', 'high'].map(v => `<option value="${v}" ${S.soil[n] === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select>`;
  return `<div class="grid g2">
    <div class="card">
      <h3>Soil Health Card status</h3>
      <div class="row" style="flex-wrap:wrap"><div><label class="f">Nitrogen</label>${soilSel('n')}</div><div><label class="f">Phosphorus</label>${soilSel('p')}</div><div><label class="f">Potash</label>${soilSel('k')}</div></div>
      <p class="small muted" style="margin:12px 0 0">Recommended dose for ${esc(CROPS[S.crop].name.en)}: ${rdf.join('-')} kg N-P₂O₅-K₂O per hectare. Low soil test → +25 %, high → −25 % (soil-test-based adjustment).</p>
      <h3 style="margin-top:18px">Prices (₹ per bag)</h3>
      <div class="grid g3" style="gap:8px">${Object.entries(FERTILIZERS).map(([k, f]) => `<div><label class="f small">${f.name.split(' (')[0]} · ${f.bag} kg</label><input class="input" data-price="${k}" type="number" value="${S.prices[k] ?? f.price}"></div>`).join('')}</div>
    </div>
    <div class="card">
      <h3>Nutrients needed for ${S.area} ${S.unit}${S.area != 1 ? 's' : ''}</h3>
      <div class="grid g3" style="gap:10px">
        <div class="stat-tile"><div class="l">Nitrogen (N)</div><div class="money">${plan.need.n} kg</div></div>
        <div class="stat-tile"><div class="l">Phosphorus (P₂O₅)</div><div class="money">${plan.need.p} kg</div></div>
        <div class="stat-tile"><div class="l">Potash (K₂O)</div><div class="money">${plan.need.k} kg</div></div>
      </div>
    </div>
  </div>
  <div class="grid g3" style="margin-top:18px">
    ${plan.options.map((o, i) => `<div class="card" style="${i === 0 ? 'outline:2px solid var(--green-500)' : ''}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><h3>${esc(o.title)}</h3>${i === 0 ? '<span class="chip">Cheapest</span>' : ''}</div>
      <table class="t"><tbody>${o.items.map(it => `<tr><td>${esc(it.name)}</td><td><b>${it.kg} kg</b><div class="small muted">${it.bags} bags</div></td><td>${inr(it.cost)}</td></tr>`).join('')}</tbody></table>
      <div class="money" style="margin-top:10px">${inr(o.cost)}</div>
      <details style="margin-top:8px"><summary class="small" style="cursor:pointer;font-weight:600">When to apply</summary>
        <table class="t small" style="margin-top:6px"><thead><tr><th>Product</th><th>Basal</th><th>Top-dress 1</th><th>Top-dress 2</th></tr></thead><tbody>${o.split.map(s => `<tr><td>${esc(s.name.split(' (')[0])}</td><td>${s.basal} kg</td><td>${s.top1 || '–'}${s.top1 ? ' kg' : ''}</td><td>${s.top2 || '–'}${s.top2 ? ' kg' : ''}</td></tr>`).join('')}</tbody></table>
        <p class="small muted">Basal at sowing/transplanting; top-dressings ~30 and ~50 days after, on moist soil.</p></details>
    </div>`).join('')}
  </div>`;
}

function profitPane() {
  const acres = toAcres(S.area, S.unit);
  const c = CROPS[S.crop];
  const e = economics({ cropKey: S.crop, acres, severityPct: S.sev, maxLossPct: S.maxLoss, weather: S.risk, treatmentCost: S.cost, price: S.price ?? c.price, yieldPerAcre: S.yld ?? c.yield });
  return `<div class="grid g2">
    <div class="card">
      <div class="row" style="flex-wrap:wrap">
        <div><label class="f">Yield (quintal / acre)</label>${num('yld', S.yld ?? c.yield, '1')}</div>
        <div><label class="f">Price (₹ / quintal)</label>${num('price', S.price ?? c.price, '50')}</div>
      </div>
      <label class="f" style="margin-top:12px">Leaf area damaged: <b>${S.sev}%</b></label>
      <input type="range" min="1" max="70" value="${S.sev}" data-k="sev" style="width:100%">
      <div class="row" style="flex-wrap:wrap;margin-top:8px">
        <div><label class="f">Weather risk</label><select class="input" data-k="risk">${['low', 'moderate', 'high'].map(v => `<option value="${v}" ${v === S.risk ? 'selected' : ''}>${t(v)}</option>`).join('')}</select></div>
        <div><label class="f">Max loss if untreated (%)</label>${num('maxLoss', S.maxLoss, '5')}</div>
        <div><label class="f">${t('treat_cost')} (₹)</label>${num('cost', S.cost, '50')}</div>
      </div>
    </div>
    <div class="card">
      <div class="grid g2" style="gap:10px">
        <div class="stat-tile"><div class="l">Gross crop value</div><div class="money">${inr(e.grossValue)}</div></div>
        <div class="stat-tile"><div class="l">${t('money_risk')}</div><div class="money neg">${inr(e.lossValue)}</div><div class="small muted">${e.lossPct}% expected loss</div></div>
        <div class="stat-tile"><div class="l">${t('net_saved')}</div><div class="money ${e.net >= 0 ? 'pos' : 'neg'}">${inr(e.net)}</div></div>
        <div class="stat-tile"><div class="l">${t('roi')}</div><div class="money ${e.net >= 0 ? 'pos' : 'neg'}">${e.roi != null ? e.roi + '×' : '—'}</div></div>
      </div>
      <div class="alert ${e.net > 0 ? 'ok' : ''}" style="margin-top:14px">${e.net > 0 ? `Treatment pays: every ₹1 spent protects about ₹${(e.saved / Math.max(1, e.treatmentCost)).toFixed(0)} of crop.` : 'At this damage level the spray costs more than it saves — monitor instead and use cultural control.'}</div>
    </div>
  </div>
  <div class="card" style="margin-top:18px"><h3>Model</h3><p class="small muted" style="margin:0">Expected loss % = max loss × clamp(damage ÷ 35 %, 0.15, 1) × weather factor (0.6 / 1.0 / 1.3), capped at max loss. Money protected = loss × 80 % treatment efficacy − treatment cost. Default yields and prices are typical Indian values (MSP where applicable) — replace them with your own.</p></div>`;
}

function wire(root, draw) {
  $$('[data-k]', root).forEach(el => el.onchange = el.oninput = (ev) => {
    const k = el.dataset.k; const v = el.type === 'number' || el.type === 'range' ? +el.value : el.value;
    if (k === 'chem') { S.chem = v; S.dose = null; } else S[k] = v;
    if (ev.type === 'change') draw();
  });
  $$('[data-soil]', root).forEach(el => el.onchange = () => { S.soil[el.dataset.soil] = el.value; draw(); });
  $$('[data-price]', root).forEach(el => el.onchange = () => { S.prices[el.dataset.price] = +el.value; draw(); });
}
