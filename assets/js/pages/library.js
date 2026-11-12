import { t, lang, typeLabel } from '../core/i18n.js';
import { DISEASES } from '../data/diseases.js';
import { CHEMICALS } from '../data/chemicals.js';
import { CROPS, CROP_ORDER, cropName } from '../data/crops.js';
import { $, $$, esc } from '../core/util.js';

let filter = { crop: '', q: '' };

export async function render(root, { name, arg }) {
  if (name === 'disease' && DISEASES[arg]) return detail(root, arg);
  const L = lang();
  const cropsWith = CROP_ORDER.filter(c => Object.values(DISEASES).some(d => d.crop === c && d.type !== 'healthy'));
  root.innerHTML = `
  <div class="wrap">
    <div class="page-head"><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${t('l_title')}</h1><p>${t('l_sub')}</p></div>
    <div class="card" style="margin-bottom:18px">
      <div style="position:relative"><input class="input" id="q" placeholder="${t('search')}" value="${esc(filter.q)}" style="padding-left:42px"><svg class="icon" style="position:absolute;left:14px;top:12px;color:var(--ink-3)"><use href="#i-search"/></svg></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" id="cf">
        <button class="chip ${filter.crop ? 'grey' : ''}" data-c="">${t('all')}</button>
        ${cropsWith.map(c => `<button class="chip ${filter.crop === c ? '' : 'grey'}" data-c="${c}">${CROPS[c].icon} ${esc(cropName(c, L))}</button>`).join('')}
      </div>
    </div>
    <div class="grid g3" id="list"></div>
  </div>`;
  const draw = () => {
    const q = filter.q.toLowerCase();
    const items = Object.entries(DISEASES).filter(([, d]) => d.type !== 'healthy' && (!filter.crop || d.crop === filter.crop) &&
      (!q || [d.name.en, d.name.hi, d.name.mr, d.pathogen, ...d.symptoms, CROPS[d.crop].name.en].join(' ').toLowerCase().includes(q)));
    $('#list', root).innerHTML = items.map(([k, d]) => `
      <a class="card dz-card" href="#/disease/${k}" style="color:inherit">
        <div class="top"><div class="em">${CROPS[d.crop].icon}</div><div><h3 style="margin:0">${esc(d.name[L] || d.name.en)}</h3><div class="small muted">${esc(cropName(d.crop, L))} · <i>${esc(d.pathogen)}</i></div></div></div>
        <p class="small muted" style="margin:0">${esc(d.symptoms[0] || '')}</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip ${d.type === 'viral' || d.type === 'bacterial' ? 'bad' : d.type === 'pest' ? 'blue' : 'warn'}">${typeLabel(d.type)}</span>${d.label ? '<span class="chip grey">On-device AI</span>' : '<span class="chip blue">Expert AI</span>'}<span class="chip grey">up to ${d.loss}% loss</span></div>
      </a>`).join('') || `<p class="muted">No matches.</p>`;
  };
  $('#q', root).oninput = (e) => { filter.q = e.target.value; draw(); };
  $$('#cf button', root).forEach(b => b.onclick = () => { filter.crop = b.dataset.c; $$('#cf button', root).forEach(x => x.classList.toggle('grey', x !== b)); draw(); });
  draw();
}

function detail(root, key) {
  const L = lang();
  const d = DISEASES[key];
  const chems = d.treat.filter(k => CHEMICALS[k]);
  root.innerHTML = `
  <div class="wrap fade-in" style="padding-top:26px">
    <a href="#/library" class="small">← ${t('nav_library')}</a>
    <div class="card" style="margin-top:12px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div class="em" style="font-size:2.6rem;width:72px;height:72px;border-radius:18px;background:var(--green-50);display:grid;place-items:center">${CROPS[d.crop].icon}</div>
        <div style="flex:1;min-width:220px"><h1 class="dx-name">${esc(d.name[L] || d.name.en)}</h1><div class="dx-sub" style="margin:0">${esc(cropName(d.crop, L))} · ${esc(d.pathogen)}</div></div>
        <div class="actions"><a class="btn btn-primary" href="#/doctor?crop=${d.crop}">${t('cta_diagnose')}</a><a class="btn btn-ghost" href="#/weather?crop=${d.crop}">${t('cta_risk')}</a></div>
      </div>
    </div>
    <div class="grid g2" style="margin-top:18px">
      <div class="card"><h3>${t('symptoms')}</h3><ul class="list">${d.symptoms.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
      <div class="card"><h3>${t('cause')}</h3><p>${esc(d.cause)}</p><span class="chip">${typeLabel(d.type)}</span> <span class="chip grey">up to ${d.loss}% yield loss</span></div>
      <div class="card"><h3>🌿 ${t('organic')}</h3><ul class="list">${d.organic.map(s => `<li>${esc(s)}</li>`).join('')}${d.bio.filter(k => CHEMICALS[k]).map(k => `<li>${esc(CHEMICALS[k].name)} — ${CHEMICALS[k].dose} ${CHEMICALS[k].unit}/L</li>`).join('')}</ul></div>
      <div class="card"><h3>${t('prevention')}</h3><ul class="list">${d.prevention.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
    </div>
    ${chems.length ? `<div class="card" style="margin-top:18px"><h3>🧪 ${t('chemical')}</h3><div class="one-rule" style="margin-top:6px"><svg class="icon"><use href="#i-alert"/></svg><div><b>${t('one_rule_t')}</b> ${t('one_rule')}</div></div><div class="tbl-wrap"><table class="t"><thead><tr><th>${t('product')}</th><th>${t('dose_l')}</th><th>${t('dose_tank')}</th><th>${t('phi')}</th><th>Group</th></tr></thead>
      <tbody>${chems.map((k, i) => { const c = CHEMICALS[k]; return `<tr><td>${i === 0 ? `<span class="chip" style="margin-bottom:4px">★ ${t('best_choice')}</span>` : `<span class="chip grey" style="margin-bottom:4px">${t('alternative')} ${i}</span>`}<br><b>${esc(c.name)}</b><div class="small muted">${esc(c.brands)}</div></td><td>${c.dose} ${c.unit}</td><td>${+(c.dose * 16).toFixed(1)} ${c.unit}</td><td>${c.phi} ${t('days')}</td><td class="small">${esc(c.group)}</td></tr>`; }).join('')}</tbody></table></div></div>` : ''}
    <p class="small muted" style="margin-top:14px">${t('disclaimer')}</p>
  </div>`;
}
