import { t, lang, typeLabel } from '../core/i18n.js';
import { CROPS, CROP_ORDER, cropName } from '../data/crops.js';
import { CHEMICALS } from '../data/chemicals.js';
import { SAMPLES } from '../data/samples.js';
import { settings, field, history, uid } from '../core/store.js';
import { $, $$, esc, toast, loadImage, fitCanvas, canvasBlob, fmtDate, fmtDay, fmtTime } from '../core/util.js';
import { analyseQuality, segmentLeaf, severityClass } from '../core/imaging.js';
import { classify, cropCanvas, occlusionMap, renderHeat, onProgress, LOCAL_CROPS } from '../core/classifier.js';
import { askExpert, fileToBase64 } from '../core/expert.js';
import { decide } from '../core/decision.js';
import { fetchForecast, dailyStats, diseaseRisk, sprayWindows, reverseGeocode } from '../core/climate.js';
import { sprayPlan, economics, safeHarvestDate, toAcres, AREA_UNITS, inr } from '../core/agronomy.js';
import { speak, stopSpeaking, advisoryText, canSpeak } from '../core/voice.js';
import { downloadPdf, rxLink } from '../core/report.js';
import { rankTreatments, recommendNutrition, projectSeverity } from '../core/advisor.js';
import { chatContext } from '../core/assistant.js';
import { openChat } from '../components/chat.js';
import { LABEL_TO_KEY, DISEASES } from '../data/diseases.js';
import { leafGate, LEAF } from '../core/leafgate.js';

/** Friendly name of a model label, e.g. "Chilli · Leaf curl" in the farmer's language. */
function predName(label) {
  const d = DISEASES[LABEL_TO_KEY[label]];
  if (!d) return label.replace('___', ' · ').replace(/_/g, ' ');
  const L = lang();
  return `${cropName(d.crop, L) || d.crop} · ${d.name[L] || d.name.en}`;
}

const ic = (id) => `<svg class="icon"><use href="#${id}"/></svg>`;
let state = { crop: null };
let abort = null;

export function destroy() { stopSpeaking(); abort?.abort(); }

export async function render(root, { query }) {
  if (query.get('crop') && CROPS[query.get('crop')]) state.crop = query.get('crop');
  renderPicker(root);
  const s = query.get('sample');
  if (s && SAMPLES[+s]) { state.crop = SAMPLES[+s].crop; runSample(root, SAMPLES[+s]); }
}

// ───────────────────────── Step 1–2: pick crop & photo ─────────────────────────
function renderPicker(root) {
  const L = lang();
  root.innerHTML = `
  <div class="wrap">
    <div class="page-head"><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${t('doc_title')}</h1><p>${t('doc_sub')}</p></div>
    <div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start" id="pickGrid">
      <div class="card">
        <h3>${t('choose_crop')}</h3>
        <div class="crop-grid" id="crops" style="margin-top:12px">
          ${CROP_ORDER.map(k => `<button class="crop-opt ${state.crop === k ? 'sel' : ''}" data-k="${k}">${CROPS[k].inModel ? '' : '<span class="tag">Expert</span>'}<span class="em">${CROPS[k].icon}</span>${esc(cropName(k, L))}</button>`).join('')}
          <button class="crop-opt ${state.crop === null ? 'sel' : ''}" data-k=""><span class="em">❓</span>${t('not_sure')}</button>
        </div>
        <h3 style="margin-top:26px">${t('add_photo')}</h3>
        <div class="dropzone" id="drop" style="margin-top:12px">
          <div class="big">${ic('i-camera')}</div>
          <p style="font-weight:600;margin-bottom:14px">${t('drop_here')}</p>
          <div class="actions" style="justify-content:center">
            <label class="btn btn-primary">${ic('i-camera')} ${t('take_photo')}<input type="file" accept="image/*" capture="environment" id="cam" class="sr"></label>
            <label class="btn btn-ghost">${ic('i-upload')} ${t('upload')}<input type="file" accept="image/*" id="file" class="sr"></label>
          </div>
        </div>
        <p class="small muted" style="margin:18px 0 8px">${t('or_try')}</p>
        <div class="samples">${SAMPLES.map((s, i) => `<button class="sample" data-i="${i}"><img src="${s.local}" data-hub="${s.hub}" onerror="if(this.src!==this.dataset.hub)this.src=this.dataset.hub" alt=""><span>${esc(s.name)}</span></button>`).join('')}</div>
      </div>
      <div class="grid">
        <div class="card"><h3>${ic('i-info')} ${t('tips_title')}</h3><ul class="tips" style="margin-top:10px"><li>${t('tip1')}</li><li>${t('tip2')}</li><li>${t('tip3')}</li><li>${t('tip4')}</li></ul></div>
        <div class="card" id="locCard"></div>
        <div class="card" id="expertCard"></div>
      </div>
    </div>
  </div>`;
  const pg = $('#pickGrid', root);
  const mq = matchMedia('(max-width: 860px)');
  const lay = () => { pg.style.gridTemplateColumns = mq.matches ? 'minmax(0,1fr)' : 'minmax(0,1.5fr) minmax(0,1fr)'; };
  lay(); mq.addEventListener?.('change', lay);

  const s = settings.get();
  $('#expertCard', root).innerHTML = s.geminiKey
    ? `<h3>${ic('i-shield')} Expert AI: <span style="color:var(--green-700)">ON</span></h3><p class="small muted" style="margin:0">Every photo is checked by two independent AI systems. Works for all 21 crops, including field photos.</p>`
    : `<h3>${ic('i-shield')} Expert AI</h3><p class="small muted">${t('expert_off')}</p><button class="btn btn-ghost btn-sm" onclick="AgriSathi.openSettings()">${ic('i-gear')} ${t('settings')}</button>`;

  const drawLoc = () => {
    const f = field.get();
    $('#locCard', root).innerHTML = f
      ? `<h3>${ic('i-farm')} ${t('loc_title')}</h3><p class="small muted" style="margin:0 0 10px">${esc(f.name)}${f.region ? ', ' + esc(f.region) : ''} — ${t('loc_on')}</p><button class="btn btn-ghost btn-sm" id="locGps">${ic('i-gps')} ${t('loc_update')}</button>`
      : `<h3>${ic('i-farm')} ${t('loc_title')}</h3><p class="small muted">${t('loc_off')}</p><button class="btn btn-primary btn-sm" id="locGps">${ic('i-gps')} ${t('use_gps')}</button> <a class="btn btn-ghost btn-sm" href="#/weather">${ic('i-search')} ${t('search_place')}</a>`;
    $('#locGps', root).onclick = () => {
      if (!navigator.geolocation) return toast('Location not available', 'err');
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        field.set({ ...(await reverseGeocode(lat, lon)), lat, lon }); drawLoc(); toast('📍 ' + field.get().name);
      }, () => toast('Location permission denied — search your village on the Weather page', 'err', 4500), { timeout: 10000 });
    };
  };
  drawLoc();
  $$('.crop-opt', root).forEach(b => b.onclick = () => { state.crop = b.dataset.k || null; $$('.crop-opt', root).forEach(x => x.classList.toggle('sel', x === b)); });
  const onFile = (f) => { if (f && f.type.startsWith('image/')) run(root, URL.createObjectURL(f), f); };
  $('#cam', root).onchange = (e) => onFile(e.target.files[0]);
  $('#file', root).onchange = (e) => onFile(e.target.files[0]);
  const drop = $('#drop', root);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); });
  $$('.sample', root).forEach(b => b.onclick = () => { const smp = SAMPLES[+b.dataset.i]; state.crop = smp.crop; runSample(root, smp); });
}

async function runSample(root, smp) {
  try { await loadImage(smp.local); run(root, smp.local, null); }
  catch { run(root, smp.hub, null); }
}

// ───────────────────────── Analysis pipeline ─────────────────────────
const STEPS = ['s_quality', 's_model', 's_expert', 's_severity', 's_weather', 's_plan'];

async function run(root, src, file) {
  stopSpeaking(); abort?.abort(); abort = new AbortController();
  const signal = abort.signal;
  root.innerHTML = `
  <div class="wrap" style="padding-top:30px">
    <div class="analysis">
      <div class="scan-view"><img src="${esc(src)}" alt="" crossorigin="anonymous"><div class="sweep"></div></div>
      <div class="card">
        <h2 style="font-size:1.5rem">${t('analysing')}</h2>
        <ul class="steps" id="steps">${STEPS.map(k => `<li data-k="${k}"><span class="st"></span>${t(k)}<span class="note"></span></li>`).join('')}</ul>
        <div id="loadBox" class="hidden" style="margin-top:14px"><div class="small muted" style="margin-bottom:6px">${t('model_loading')}</div><div class="progress"><i id="loadBar"></i></div></div>
        <div id="gate" style="margin-top:14px"></div>
      </div>
    </div>
  </div>`;
  const step = (k, st, note = '') => { const li = $(`#steps li[data-k="${k}"]`, root); if (!li) return; li.className = st; li.querySelector('.st').innerHTML = st === 'done' ? '✓' : st === 'skip' ? '–' : ''; li.querySelector('.note').textContent = note; };

  let img;
  try { img = await loadImage(src); } catch (e) { toast(e.message, 'err'); return renderPicker(root); }
  const crop = state.crop;
  const inModel = !crop || LOCAL_CROPS.includes(crop);
  const s = settings.get();

  // 1. Quality gate
  step('s_quality', 'run');
  const work = fitCanvas(img, 512);
  const q = analyseQuality(work.getContext('2d').getImageData(0, 0, work.width, work.height).data, work.width, work.height);
  const blocking = q.issues.filter(i => i.level === 'error');
  step('s_quality', 'done', `${q.score}/100`);
  if (blocking.length) {
    const msg = { blur: 'The photo is blurry — hold the phone steady and tap to focus.', dark: 'The photo is too dark — take it in daylight.', bright: 'The photo is over-exposed — avoid direct sun glare or flash.' };
    const ok = await new Promise(res => {
      $('#gate', root).innerHTML = `<div class="alert">${ic('i-alert')}<div><b>Photo quality problem</b><br>${blocking.map(b => msg[b.code]).join(' ')}<div class="actions" style="margin-top:10px"><button class="btn btn-primary btn-sm" id="retake">Retake photo</button><button class="btn btn-ghost btn-sm" id="anyway">Continue anyway</button></div></div></div>`;
      $('#retake', root).onclick = () => res(false); $('#anyway', root).onclick = () => res(true);
    });
    $('#gate', root).innerHTML = '';
    if (!ok) return renderPicker(root);
  }

  // Parallel jobs: expert AI and weather start immediately
  const fl = field.get();
  const weatherP = fl ? fetchForecast(fl.lat, fl.lon).catch(() => null) : Promise.resolve(null);
  const expertWanted = s.expertAuto && (s.geminiKey || location.protocol === 'https:');
  const big = fitCanvas(img, 768); // 768 px is plenty for diagnosis and uploads ~3× faster than 1024 px
  const imgB64P = canvasBlob(big, 'image/jpeg', 0.82).then(fileToBase64);
  // Expert AI runs in parallel and independently (it is NOT shown the on-device answer, so the
  // two opinions are not anchored to each other).
  const useExpert = expertWanted || !inModel;
  const expertP = useExpert
    ? Promise.all([imgB64P, weatherP]).then(([b64, wx0]) => askExpert({ imageB64: b64, crop: crop ? CROPS[crop].name.en : '', lang: lang(), local: '', weather: wx0 ? summariseWeather(wx0) : '', signal }))
    : null;
  expertP?.catch(() => {});

  // 2. On-device model
  let local = null;
  const c224 = cropCanvas(img);
  if (inModel) {
    step('s_model', 'run');
    const unsub = onProgress((p) => {
      if (p.label !== 'model' || p.source === 'cache') return;
      $('#loadBox', root)?.classList.remove('hidden');
      const pct = p.total ? Math.round(p.loaded / p.total * 100) : 0;
      const bar = $('#loadBar', root); if (bar) bar.style.width = pct + '%';
      step('s_model', 'run', p.total ? `${pct}%` : `${(p.loaded / 1e6).toFixed(1)} MB`);
    });
    try {
      local = await classify(c224, crop);
      step('s_model', 'done', `${Math.round(local.ms)} ms`);
    } catch (e) {
      console.warn(e); step('s_model', 'skip', 'unavailable');
      toast('On-device AI could not load (check internet for the first run).', 'err', 5000);
    }
    unsub(); $('#loadBox', root)?.classList.add('hidden');
  } else step('s_model', 'skip', 'crop not in on-device model');

  // 3. Expert AI — if the on-device answer is ready we do NOT wait: the result is shown at once
  //    and the Expert AI opinion is merged in automatically when it arrives (progressive result).
  let expert = null, expertErr = null, expertPending = false;
  // "Is there a leaf at all?" — decided from the AI embedding AND plant-coloured pixels
  // (core/leafgate.js). Real field photos pass; only clearly non-plant photos are stopped,
  // and even then the Expert AI (if available) gets the final word.
  let gate = local ? leafGate({ sim: local.sim, plantRatio: q.plantRatio }) : null;
  const unsure = local && !gate.leaf;
  if (expertP && local && !unsure) { step('s_expert', 'done', 'running in background'); expertPending = true; }
  else if (expertP) {
    step('s_expert', 'run');
    try { const r = await expertP; expert = r.data; step('s_expert', 'done', r.model || 'ok'); }
    catch (e) { expertErr = e; step('s_expert', 'skip', e.code === 'nokey' ? 'not configured' : e.code === 'timeout' ? 'timed out' : 'unavailable'); if (e.code === 'badkey') toast('Gemini key rejected — check Settings', 'err', 5000); else if (e.code !== 'nokey') console.warn(e); }
  } else step('s_expert', 'skip', 'off');
  if (signal.aborted) return;

  // Reject ONLY photos without a plant — no disease is ever predicted for them
  const expertPlant = expert ? !(expert.is_plant_image === false || /no plant|not a plant|no leaf/i.test(expert.condition || '')) : null;
  if (local) gate = leafGate({ sim: local.sim, plantRatio: q.plantRatio, expertPlant });
  if ((local && !gate.leaf) || (!local && expertPlant === false)) return renderReject(root, src, 'noleaf');
  if (local) {
    local.reliability = gate.reliability; local.leafScore = gate.score;
    if (local.sim < LEAF.reject) local = null;   // expert confirmed a plant the lab model cannot read → expert decides
  }

  if (!local && !expert) {
    root.innerHTML = `<div class="wrap" style="padding:40px 20px"><div class="alert bad">${ic('i-alert')}<div><b>Could not analyse this photo.</b><br>${!inModel ? 'This crop needs the Expert AI. Add a free Gemini key in Settings.' : 'The AI model could not be loaded. Connect to the internet once so it can download (24 MB), then it works offline.'}${expertErr && expertErr.code !== 'nokey' ? '<br><span class="small">' + esc(expertErr.message) + '</span>' : ''}</div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" id="back">${t('new_diag')}</button><button class="btn btn-ghost" onclick="AgriSathi.openSettings()">${t('settings')}</button></div></div>`;
    $('#back', root).onclick = () => renderPicker(root);
    return;
  }

  finish();
  async function finish() {
  // 4. Severity
  step('s_severity', 'run');
  const segC = fitCanvas(img, 384);
  const seg = segmentLeaf(segC.getContext('2d').getImageData(0, 0, segC.width, segC.height).data, segC.width, segC.height);
  const sevReliable = seg.leafFraction > 0.06 && q.plantRatio >= 0.05;
  step('s_severity', 'done', sevReliable ? `${seg.severity.toFixed(1)}%` : 'n/a');

  // 5. Weather
  step('s_weather', 'run');
  const wx = await weatherP;
  step('s_weather', wx ? 'done' : 'skip', wx ? fl.name : 'no location');

  // 6. Decide & plan
  step('s_plan', 'run');
  const dx = decide(local, expert, crop);
  if (!dx) return renderPicker(root);
  let severity = sevReliable ? seg.severity : ({ none: 0, low: 8, moderate: 20, high: 40, severe: 60 }[expert?.severity] ?? 10);
  if (dx.healthy) severity = Math.min(severity, 4.9);
  const ctx = { dx, q, seg, segC, sevReliable, severity, c224, img, src, wx, field: fl, crop: dx.crop || crop, id: uid(), date: new Date().toISOString() };
  ctx.expertPending = expertPending;
  step('s_plan', 'done');
  await new Promise(r => setTimeout(r, 200));
  renderResult(root, ctx);
  saveHistory(ctx);
  if (expertPending) {
    expertP.then((r) => {
      if (signal.aborted || !document.body.contains(root) || !$('.result-card', root)) return;
      if (!leafGate({ sim: local.sim, plantRatio: q.plantRatio, expertPlant: r.data?.is_plant_image !== false }).leaf) { history.remove(ctx.id); return renderReject(root, src, 'noleaf'); }
      const before = ctx.dx.key;
      const dx2 = decide(local, r.data, crop);
      if (!dx2) return;
      Object.assign(ctx, { dx: dx2, crop: dx2.crop || crop, expertPending: false, evShown: false });
      if (!sevReliable) ctx.severity = ({ none: 0, low: 8, moderate: 20, high: 40, severe: 60 }[r.data?.severity] ?? ctx.severity);
      if (dx2.healthy) ctx.severity = Math.min(ctx.severity, 4.9);
      const y = scrollY; renderResult(root, ctx); window.scrollTo({ top: y });
      history.remove(ctx.id); saveHistory(ctx);
      toast(dx2.verdict === 'agree' ? '✓ Expert AI confirmed the diagnosis' : dx2.key !== before ? 'Expert AI updated the diagnosis — please review' : 'Expert AI gave a second opinion', dx2.verdict === 'agree' ? 'info' : 'err', 4500);
    }).catch((e) => {
      if (!$('.result-card', root)) return;
      ctx.expertPending = false; $('#expertWait', root)?.remove();
      if (e.code === 'badkey') toast('Gemini key rejected — check Settings', 'err', 5000);
      else if (e.code !== 'nokey') toast(e.code === 'timeout' ? 'Expert AI took too long — showing the on-device result' : 'Expert AI unavailable — showing the on-device result', 'err', 4000);
    });
  }
  }
}

/** Shown instead of a diagnosis when the photo has no recognisable leaf. Never predicts a disease. */
function renderReject(root, src, kind, onAnyway) {
  stopSpeaking();
  const noleaf = kind === 'noleaf';
  root.innerHTML = `
  <div class="wrap fade-in">
    <div class="card reject">
      <div class="rj-img"><img src="${esc(src)}" alt=""><div class="rj-x">${noleaf ? '🚫' : '🔍'}</div></div>
      <h1>${t(noleaf ? 'rej_noleaf_t' : 'rej_unfam_t')}</h1>
      <p class="muted">${t(noleaf ? 'rej_noleaf' : 'rej_unfam')}</p>
      <ul class="tips"><li>${t('tip1')}</li><li>${t('tip2')}</li><li>${t('tip3')}</li><li>${t('tip4')}</li></ul>
      <div class="actions">
        <label class="btn btn-primary">${ic('i-camera')} ${t('take_photo')}<input type="file" accept="image/*" capture="environment" id="rjCam" class="sr"></label>
        <label class="btn btn-ghost">${ic('i-upload')} ${t('upload')}<input type="file" accept="image/*" id="rjFile" class="sr"></label>
        <button class="btn btn-ghost" id="rjBack">${t('new_diag')}</button>
      </div>
      ${!noleaf && onAnyway ? `<p class="why-small"><a href="javascript:void 0" id="rjAnyway">${t('rej_anyway')}</a></p>` : ''}
      <p class="why-small">${t('rej_why')}</p>
    </div>
  </div>`;
  const onFile = (f) => { if (f && f.type.startsWith('image/')) run(root, URL.createObjectURL(f), f); };
  $('#rjCam', root).onchange = (e) => onFile(e.target.files[0]);
  $('#rjFile', root).onchange = (e) => onFile(e.target.files[0]);
  $('#rjBack', root).onclick = () => renderPicker(root);
  $('#rjAnyway', root)?.addEventListener('click', onAnyway);
  window.scrollTo({ top: 0 });
}

function summariseWeather(wx) {
  const st = dailyStats(wx.hours).filter(d => d.date >= wx.today).slice(0, 5);
  return st.map(d => `${d.date}: ${Math.round(d.tmin)}–${Math.round(d.tmax)}°C, RH≥90% for ${d.rh90Hours} h, rain ${d.rain.toFixed(1)} mm`).join('; ');
}

async function saveHistory(ctx) {
  const th = document.createElement('canvas'); th.width = 96; th.height = 96;
  th.getContext('2d').drawImage(ctx.c224, 0, 0, 96, 96);
  history.add({
    id: ctx.id, date: ctx.date, crop: ctx.crop, key: ctx.dx.key, name: ctx.dx.name.en, conf: ctx.dx.conf,
    severity: Math.round(ctx.severity * 10) / 10, verdict: ctx.dx.verdict, healthy: ctx.dx.healthy,
    lat: ctx.field?.lat ?? null, lon: ctx.field?.lon ?? null, place: ctx.field?.name ?? null,
    thumb: th.toDataURL('image/jpeg', 0.7),
  });
}

// ───────────────────────── Result ─────────────────────────
const STEP_IDS = [['st-disease', 'step_disease'], ['st-treat', 'step_treat'], ['st-fert', 'step_fert'], ['st-weather', 'step_weather'], ['st-evidence', 'step_evidence']];

function renderResult(root, ctx) {
  const L = lang();
  const { dx } = ctx;
  const name = dx.name[L] || dx.name.en;
  const sev = severityClass(ctx.severity);
  const confPct = Math.round(dx.conf * 100);
  // confidence range: spread across the 4 TTA views (on-device), scaled by the leaf-match reliability
  const rel = dx.local?.ood ? (dx.local.reliability ?? 0.6) : 1;
  const ci = dx.source === 'local' && dx.local?.interval ? [Math.round(dx.local.interval[0] * rel * 100), Math.max(confPct, Math.round(dx.local.interval[1] * rel * 100))].map((v, i, a) => i === 0 ? Math.min(v, confPct) : v) : null;
  const verdictChip = {
    agree: `<span class="chip">${ic('i-shield')} ${t('agree')}</span>`,
    disagree: `<span class="chip warn">${ic('i-alert')} ${t('disagree')}</span>`,
    local_only: `<span class="chip grey">${ic('i-cpu')} ${t('local_only')}</span>`,
    expert_only: `<span class="chip blue">${ic('i-shield')} ${t('expert_only')}</span>`,
  }[dx.verdict];
  const alerts = [];
  if (dx.local?.ood && dx.source === 'local') alerts.push(['info', t('ood_msg')]);
  if (!dx.healthy && dx.conf < 0.5) alerts.push(['', t('lowconf_msg')]);
  if (dx.local && dx.local.cropMass != null && dx.local.cropMass < 0.3 && !dx.local.ood) alerts.push(['info', `The photo looks more like ${cropName(dx.local.detectedCrop || '', L) || 'another crop'} than ${cropName(ctx.crop, L)}. Check that the right crop is selected.`]);
  if (dx.alt) alerts.push(['', `Second opinion: <b>${esc(dx.alt.name || '—')}</b> (${Math.round((dx.alt.conf || 0) * 100)}%, ${dx.alt.by === 'expert' ? 'Expert AI' : 'on-device AI'}). Compare the symptoms before spraying.`]);
  if (dx.healthy) alerts.push(['ok', t('healthy_msg')]);
  if (!settings.get().geminiKey && dx.verdict === 'local_only' && !ctx.expertPending) alerts.push(['info', t('expert_off')]);

  root.innerHTML = `
  <div class="wrap fade-in" style="padding-top:28px">
    <div class="card result-card">
      <div class="result-hero">
        <img class="thumb" src="${ctx.c224.toDataURL('image/jpeg', 0.9)}" alt="">
        <div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span class="chip grey">${CROPS[ctx.crop]?.icon || '🌱'} ${esc(cropName(ctx.crop, L) || '—')}</span>
            <span class="chip ${dx.healthy ? '' : dx.type === 'viral' || dx.type === 'bacterial' ? 'bad' : 'warn'}">${typeLabel(dx.type)}</span>
            ${verdictChip}
            ${ctx.field ? `<span class="chip grey">${ic('i-farm')} ${esc(ctx.field.name)}</span>` : ''}
            ${dx.local?.leafScore != null ? `<span class="chip" title="${t('leaf_tip')}">🌿 ${t('leaf_ok')} · ${Math.round(dx.local.leafScore * 100)}%</span>` : dx.expert?.is_plant_image ? `<span class="chip">🌿 ${t('leaf_ok')}</span>` : ''}
          </div>
          <h1 class="dx-name">${esc(name)}</h1>
          <div class="dx-sub">${dx.pathogen && dx.pathogen !== '—' ? esc(dx.pathogen) : ''}${L !== 'en' && dx.name.en !== name ? ' · ' + esc(dx.name.en) : ''}</div>
          <div class="actions">
            <button class="btn btn-primary btn-sm" id="askSathi">${ic('i-chat')} ${t('ask_sathi')}</button>
            ${canSpeak() ? `<button class="btn btn-ghost btn-sm" id="speak">${ic('i-mic')} ${t('listen')}</button>` : ''}
            <button class="btn btn-ghost btn-sm" id="pdf">${ic('i-file')} ${t('download_rx')}</button>
            <button class="btn btn-ghost btn-sm" id="wa">${ic('i-share')} ${t('share')}</button>
            <button class="btn btn-ghost btn-sm" id="again">${ic('i-camera')} ${t('new_diag')}</button>
          </div>
        </div>
        <div class="meters">
          <div class="meter-col"><div class="ring" style="--p:${confPct};--c:${confPct >= 75 ? 'var(--green-600)' : confPct >= 50 ? 'var(--sun)' : 'var(--red)'}"><span>${confPct}%<small>${t('confidence')}</small></span></div>${ci ? `<div class="ci" title="${t('ci_tip')}">${t('range')} ${ci[1] - ci[0] >= 1 ? `${ci[0]}–${ci[1]}` : ci[0]}%</div>` : ''}</div>
          <div class="ring" style="--p:${Math.min(100, ctx.severity * 2)};--c:${sev.color}"><span>${ctx.sevReliable || dx.expert ? ctx.severity.toFixed(0) + '%' : '—'}<small>${t('severity')}</small></span></div>
        </div>
      </div>
      ${alerts.length ? `<div class="grid" style="margin-top:18px;gap:10px">${alerts.map(([k, m]) => `<div class="alert ${k}">${ic(k === 'ok' ? 'i-check' : k === 'info' ? 'i-info' : 'i-alert')}<div>${m}</div></div>`).join('')}</div>` : ''}
      ${ctx.expertPending ? `<div class="alert info expert-wait" id="expertWait" style="margin-top:12px"><span class="spin"></span><div><b>${t('expert_wait')}</b><br><span class="small">${t('expert_wait_sub')}</span></div></div>` : ''}
      ${dx.expert?.farmer_summary ? `<div class="alert info" style="margin-top:12px">${ic('i-mic')}<div>${esc(dx.expert.farmer_summary)}</div></div>` : ''}
    </div>

    <nav class="stepnav" id="stepnav">${STEP_IDS.map(([id, k], i) => `<a href="javascript:void 0" data-go="${id}"><b>${i + 1}</b>${t(k)}</a>`).join('')}</nav>

    <section class="step" id="st-disease"><h2 class="step-h"><b>1</b>${t('step_disease')}</h2><div id="paneDiag"></div></section>
    <section class="step" id="st-treat"><h2 class="step-h"><b>2</b>${t('step_treat')}</h2><div id="paneTreat"></div></section>
    <section class="step" id="st-fert"><h2 class="step-h"><b>3</b>${t('step_fert')}</h2><div id="paneFert"></div></section>
    <section class="step" id="st-weather"><h2 class="step-h"><b>4</b>${t('step_weather')}</h2><div id="paneWx"></div></section>
    <section class="step" id="st-evidence"><h2 class="step-h"><b>5</b>${t('step_evidence')}</h2>
      <details class="card" id="evDetails"><summary style="cursor:pointer;font-weight:600">${t('show_evidence')}</summary><div id="paneEv" style="margin-top:16px"></div></details></section>

    <div class="cta-band" style="margin-top:30px">
      <div><h2>${t('ask_title')}</h2><p>${t('ask_sub')}</p></div>
      <button class="btn btn-primary" id="askSathi2">${ic('i-chat')} ${t('ask_sathi')}</button>
    </div>
    <p class="small muted" style="margin-top:14px">${t('disclaimer')}</p>
  </div>`;

  $('#paneDiag', root).innerHTML = diagPane(ctx);
  drawPlan(root, ctx);
  $('#evDetails', root).addEventListener('toggle', (e) => { if (e.target.open && !ctx.evShown) { ctx.evShown = true; $('#paneEv', root).innerHTML = evidencePane(ctx); wireEvidence(root, ctx); } });
  $$('#stepnav a', root).forEach(a => a.onclick = () => { const el = $('#' + a.dataset.go, root); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 130, behavior: 'smooth' }); if (a.dataset.go === 'st-evidence') $('#evDetails', root).open = true; });

  $('#again', root).onclick = () => { stopSpeaking(); renderPicker(root); window.scrollTo({ top: 0 }); };
  const openSathi = () => openChat({ greet: true });
  $('#askSathi', root).onclick = openSathi; $('#askSathi2', root).onclick = openSathi;
  const sp = $('#speak', root);
  if (sp) sp.onclick = () => {
    if (sp.dataset.on) { stopSpeaking(); sp.dataset.on = ''; sp.innerHTML = `${ic('i-mic')} ${t('listen')}`; return; }
    sp.dataset.on = '1'; sp.innerHTML = `${ic('i-mic')} ${t('stop')}`;
    speak(voiceText(ctx), L, () => { sp.dataset.on = ''; sp.innerHTML = `${ic('i-mic')} ${t('listen')}`; });
  };
  $('#pdf', root).onclick = async () => { try { toast('Preparing PDF…'); await downloadPdf(buildRx(ctx)); } catch (e) { toast('PDF failed: ' + e.message, 'err'); } };
  $('#wa', root).onclick = async () => {
    const rx = buildRx(ctx); const { url } = await rxLink(rx);
    const p = rx.products[0];
    const text = `🌿 AgriSathi diagnosis\nCrop: ${rx.cropName}\nProblem: ${rx.diseaseName} (${Math.round(rx.confidence * 100)}% confidence)\nLeaf damage: ${rx.severity.toFixed(0)}%` +
      (p ? `\nSpray: ${p.name} – ${p.dosePerTank} ${p.unit} per 16 L tank × ${p.tanks} tanks\nSafe to harvest after: ${fmtDate(rx.safeHarvest)}` : '') +
      (rx.nutrition?.length ? `\nNutrition: ${rx.nutrition.map(x => x.split(':')[0]).join(', ')}` : '') + `\nPrescription: ${url}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  };
}

/** Everything that depends on field size / product choice / weather. */
function plan(ctx) {
  const p = ctx.planState ||= { area: 1, unit: 'acre', chem: null, water: CROPS[ctx.crop]?.waterPerAcre || 200 };
  const acres = toAcres(p.area, p.unit);
  const rank = rankTreatments({ dx: ctx.dx, severity: ctx.severity, acres, waterPerAcre: p.water });
  if (!p.chem || !CHEMICALS[p.chem]) p.chem = rank.best?.key || ctx.dx.bio[0] || null;
  const sp = p.chem && CHEMICALS[p.chem] ? sprayPlan({ acres, chemKey: p.chem, waterPerAcre: p.water }) : null;
  const st = ctx.wx ? dailyStats(ctx.wx.hours) : null;
  const risk = st ? diseaseRisk(ctx.dx.risk, st, ctx.wx.today) : null;
  const win = ctx.wx ? sprayWindows(ctx.wx.hours, ctx.wx.current?.time || new Date().toISOString()) : null;
  const econ = !ctx.dx.healthy && ctx.crop && CROPS[ctx.crop] ? economics({ cropKey: ctx.crop, acres, severityPct: ctx.severity, maxLossPct: ctx.dx.maxLoss, weather: risk?.level || 'moderate', treatmentCost: sp ? sp.packs.cost : 0 }) : null;
  const altKey = ctx.dx.alt?.key || (ctx.dx.local?.top?.[1] ? LABEL_TO_KEY[ctx.dx.local.top[1].label] : null);
  const nutrition = ctx.crop && CROPS[ctx.crop] ? recommendNutrition({ crop: ctx.crop, dx: ctx.dx, severity: ctx.severity, conf: ctx.dx.conf, alt: altKey, acres, waterPerAcre: p.water }) : [];
  const proj = !ctx.dx.healthy ? projectSeverity({ severity: ctx.severity, type: ctx.dx.type, riskDays: risk?.days || [] }) : null;
  return { p, acres, rank, sp, risk, win, econ, nutrition, proj, altKey };
}

const packLabel = (sp) => sp.packs.items.map(i => `${i.n} × ${i.size >= 1000 ? i.size / 1000 + (sp.unit === 'g' ? ' kg' : ' L') : i.size + ' ' + sp.unit}`).join(' + ');
const shopLinks = (q, f) => `<div class="actions" style="margin-top:10px">
  <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}">${ic('i-cart')} ${t('buy_online')}</a>
  <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/${encodeURIComponent('agro shop')}${f ? `/@${f.lat},${f.lon},13z` : ''}">${ic('i-farm')} ${t('shop_nearby')}</a></div>`;

function drawPlan(root, ctx) {
  const pl = plan(ctx);
  $('#paneTreat', root).innerHTML = treatPane(ctx, pl);
  $('#paneFert', root).innerHTML = fertPane(ctx, pl);
  $('#paneWx', root).innerHTML = weatherPane(ctx, pl);
  wirePlan(root, ctx);
  setChatContext(ctx, pl);
}

function treatPane(ctx, { p, rank, sp, econ }) {
  const dx = ctx.dx;
  const unitSel = Object.entries(AREA_UNITS).map(([k, u]) => `<option value="${k}" ${k === p.unit ? 'selected' : ''}>${u.label}</option>`).join('');
  const fieldBox = `<div class="card field-box"><div class="row" style="align-items:flex-end;flex-wrap:wrap">
      <div style="flex:2;min-width:160px"><label class="f">${t('your_field')}</label><input class="input" id="pArea" type="number" min="0.05" step="0.05" value="${p.area}"></div>
      <div style="flex:1;min-width:110px"><label class="f">Unit</label><select class="input" id="pUnit">${unitSel}</select></div>
      <div style="flex:3;min-width:220px" class="small muted">${t('field_hint')}</div></div></div>`;
  if (!rank.best) {
    const ex = !dx.kb && dx.expert?.chemical_control?.length ? `<div class="card"><h3>🧪 ${t('chemical')} (Expert AI)</h3><ul class="list">${dx.expert.chemical_control.map(c => `<li><b>${esc(c.active_ingredient)}</b> — ${esc(c.dose_per_litre || '')}${c.phi_days != null ? `, PHI ${c.phi_days} ${t('days')}` : ''}</li>`).join('')}</ul></div>` : '';
    return `${fieldBox}<div class="grid g2" style="margin-top:16px">
      <div class="card"><div class="alert ok">${ic('i-check')}<div>${dx.healthy ? t('healthy_msg') : dx.type === 'nutrient' ? t('nutrient_msg') : t('no_chem')}</div></div></div>
      <div class="card"><h3>🌿 ${t('organic')}</h3><ul class="list">${dx.organic.map(o => `<li>${esc(o)}</li>`).join('')}${rank.bio.map(k => `<li><b>${esc(CHEMICALS[k].name)}</b> — ${CHEMICALS[k].dose} ${CHEMICALS[k].unit}/L</li>`).join('')}</ul></div>${ex}</div>`;
  }
  const b = rank.best;
  const chosen = sp && p.chem !== b.key;
  return `${fieldBox}
  <div class="one-rule">${ic('i-alert')}<div><b>${t('one_rule_t')}</b> ${t('one_rule')}</div></div>
  <div class="best-card">
    <div class="best-badge">★ ${t('best_choice')}</div>
    <div class="best-grid">
      <div class="pack-wrap">${packSvg(b.chem.name, b.chem.kind === 'chemical' ? '#0b6e4f' : '#2e7d32', b.group)}</div>
      <div>
        <h3 class="prod-name">${esc(b.chem.name)}</h3>
        <div class="small muted">e.g. ${esc(b.chem.brands)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0"><span class="chip">${esc(b.mode)}</span><span class="chip grey">${esc(b.group)}</span></div>
        <ul class="why">${b.why.map(w => `<li>${ic('i-check')} ${esc(w)}</li>`).join('')}</ul>
        ${shopLinks(b.chem.name, ctx.field)}
      </div>
      <div class="best-nums">
        <div class="stat-tile"><div class="l">${t('dose_tank')}</div><div class="money">${b.plan.dosePerTank} ${b.plan.unit}</div></div>
        <div class="stat-tile"><div class="l">${t('tanks')} · ${t('water')}</div><div class="money">${b.plan.tanks} <small class="muted" style="font-size:.9rem">· ${b.plan.water} L</small></div></div>
        <div class="stat-tile"><div class="l">${t('buy')}</div><div style="font-weight:600">${packLabel(b.plan)}</div><div class="small muted">${inr(b.plan.packs.cost)}${b.plan.savings > 0 ? ` · ${inr(b.plan.savings)} ${t('save_vs')}` : ''}</div></div>
        <div class="stat-tile"><div class="l">${t('safe_harvest')}</div><div style="font-weight:600">${fmtDate(safeHarvestDate(new Date(), b.chem.phi))}</div><div class="small muted">PHI ${b.chem.phi} ${t('days')}</div></div>
      </div>
    </div>
  </div>
  ${rank.alternatives.length ? `<h3 style="margin:22px 0 10px">${t('alternatives')}</h3>
  <div class="grid g3">${rank.alternatives.map((a, i) => `
    <div class="card alt-card ${p.chem === a.key ? 'picked' : ''}">
      <div style="display:flex;gap:12px;align-items:center">${packSvg(a.chem.name, '#5b6b64', a.group, 56)}<div><div class="small muted">${t('alternative')} ${i + 1}</div><b>${esc(a.chem.name)}</b></div></div>
      <div class="small muted" style="margin-top:6px">e.g. ${esc(a.chem.brands)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><span class="chip grey">${esc(a.mode)}</span><span class="chip grey">${esc(a.group)}</span></div>
      <dl class="kv small"><dt>${t('dose_tank')}</dt><dd>${a.plan.dosePerTank} ${a.plan.unit}</dd><dt>${t('cost')}</dt><dd>${inr(a.plan.packs.cost)}</dd><dt>PHI</dt><dd>${a.chem.phi} ${t('days')}</dd></dl>
      ${a.why.length ? `<p class="small" style="margin:8px 0 0;color:var(--green-700)">${esc(a.why[0])}</p>` : ''}
    </div>`).join('')}</div>` : ''}
  <div class="grid g2" style="margin-top:18px">
    <div class="card"><h3>🔁 ${t('rotation')}</h3>
      <div class="rotation">${rank.rotation.map(r => `<div class="rot"><div class="rot-dot">${r.spray}</div><div><b>${t('day')} ${r.day}</b> · ${esc(r.name)}<div class="small muted">${esc(r.group)}</div></div></div>`).join('')}</div>
      <p class="small muted" style="margin:10px 0 0">${t('rotation_note').replace('{d}', rank.interval)}</p></div>
    <div class="card"><h3>🌿 ${t('organic')}</h3><ul class="list">${dx.organic.map(o => `<li>${esc(o)}</li>`).join('')}${rank.bio.map(k => `<li><b>${esc(CHEMICALS[k].name)}</b> — ${CHEMICALS[k].dose} ${CHEMICALS[k].unit}/L</li>`).join('')}</ul></div>
  </div>
  ${econ ? `<div class="card" style="margin-top:18px"><h3>${ic('i-rupee')} ${t('f_profit')}</h3>
    <div class="grid g4" style="gap:10px;margin-top:8px">
      <div class="stat-tile"><div class="l">${t('money_risk')}</div><div class="money neg">${inr(econ.lossValue)}</div><div class="small muted">${econ.lossPct}% of ${inr(econ.grossValue)}</div></div>
      <div class="stat-tile"><div class="l">${t('treat_cost')}</div><div class="money">${inr(econ.treatmentCost)}</div></div>
      <div class="stat-tile"><div class="l">${t('net_saved')}</div><div class="money pos">${inr(econ.net)}</div></div>
      <div class="stat-tile"><div class="l">${t('roi')}</div><div class="money pos">${econ.roi != null ? econ.roi + '×' : '—'}</div></div>
    </div><p class="small muted" style="margin:10px 0 0">${chosen ? '' : ''}${ctx.severity.toFixed(0)}% leaf damage · typical yield ${CROPS[ctx.crop].yield} q/acre at ${inr(CROPS[ctx.crop].price)}/q · 80% treatment efficacy. <a href="#/tools?tab=profit">Adjust →</a></p></div>` : ''}
  ${dx.expert?.immediate_actions?.length ? `<div class="card" style="margin-top:18px"><h3>⚡ Immediate actions (Expert AI)</h3><ul class="list">${dx.expert.immediate_actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
  <div class="alert info" style="margin-top:18px">${ic('i-shield')}<div><b>Safety:</b> gloves, mask and full sleeves; spray with the wind behind you; never before rain. Streptocycline (streptomycin + tetracycline) is banned on crops in India since 2024 and is never recommended.</div></div>`;
}

function fertPane(ctx, { nutrition, acres }) {
  if (!nutrition.length) return `<div class="card muted">${t('no_fert')}</div>`;
  return `<p class="muted" style="margin-top:-6px">${t('fert_intro')}</p>
  <div class="grid g3">${nutrition.map((n, i) => `
    <div class="card fert-card ${i === 0 ? 'top' : ''}">
      <div class="fert-top">
        ${packSvg(n.f.short, n.f.color, n.f.grade, 76, n.f.form)}
        <div style="flex:1;min-width:0">
          <div style="display:flex;gap:6px;flex-wrap:wrap">${n.tags.map(tg => `<span class="chip ${tg === 'Best value' ? 'blue' : ''}">${tg === 'Best match' ? '★ ' + t('best_match') : t('best_value')}</span>`).join('')}<span class="chip grey">#${i + 1}</span></div>
          <h3 style="margin:8px 0 2px">${esc(n.f.name)}</h3>
          <div class="small muted">${esc(n.f.grade)}</div>
        </div>
      </div>
      <div class="match"><div class="match-head"><span>${t('match')}</span><b>${n.match}%</b></div>
        <div class="match-bar"><i class="range" style="left:${n.low}%;width:${Math.max(2, n.high - n.low)}%"></i><i class="point" style="left:${n.match}%"></i></div>
        <div class="small muted">${t('range')} ${n.low}–${n.high}% · ${t('evidence')}: <b>${esc(n.evidence)}</b></div></div>
      <p class="small" style="margin:10px 0 6px">${esc(n.f.role)}</p>
      ${n.reasons.length ? `<ul class="why">${n.reasons.slice(0, 2).map(r => `<li>${ic('i-check')} ${esc(r)}</li>`).join('')}</ul>` : ''}
      <dl class="kv small" style="margin-top:10px"><dt>${t('how_apply')}</dt><dd>${esc(n.how)}</dd>
        <dt>${t('for_field')}</dt><dd>${n.need} ${n.f.foliar ? n.f.unit : 'kg'} · ${n.packsN} × ${n.f.pack[0]} ${n.f.pack[1]}</dd>
        <dt>${t('cost')}</dt><dd><b>${inr(n.cost)}</b> <span class="muted">(${n.f.verified ? `MRP checked on ${esc(n.f.src)}, ${esc(n.f.verified)}` : t('approx')})</span></dd>
        <dt>${t('examples')}</dt><dd>${esc(n.f.brands)}</dd></dl>
      ${shopLinks(n.f.name, ctx.field)}
    </div>`).join('')}</div>
  <p class="small muted" style="margin-top:12px">${t('fert_note')} ${acres !== 1 ? '' : ''}</p>`;
}

function weatherPane(ctx, { risk, win, proj }) {
  if (!ctx.wx) return `<div class="card"><p class="muted">${t('need_location')}</p><button class="btn btn-primary btn-sm" id="gps">${ic('i-gps')} ${t('use_gps')}</button> <a class="btn btn-ghost btn-sm" href="#/weather">${ic('i-search')} ${t('search_place')}</a>
    ${proj ? `<div style="margin-top:16px">${projChart(proj)}</div>` : ''}</div>`;
  const w = win?.windows?.[0];
  const st = dailyStats(ctx.wx.hours).filter(d => d.date >= ctx.wx.today).slice(0, 7);
  return `<div class="grid g2">
    <div class="card">
      <h3>${ic('i-cloud')} ${esc(ctx.field?.name || '')} · ${t('next7')}</h3>
      <div class="mini-days">${st.map(d => `<div><div class="small muted">${fmtDay(d.date).split(' ')[0]}</div><b>${Math.round(d.tmax)}°</b><div class="small">${d.rain >= 0.5 ? '🌧️ ' + d.rain.toFixed(0) : '☀️'}</div><div class="small muted">${Math.round(d.rhMean)}%</div></div>`).join('')}</div>
      ${risk ? `<div class="alert ${risk.level === 'high' ? 'bad' : risk.level === 'moderate' ? '' : 'ok'}" style="margin-top:14px">${ic('i-alert')}<div><b>${t('disease_pressure')}: ${t(risk.level)}</b><br><span class="small">${esc(risk.reason)}</span></div></div>
        <div class="risk-dots">${risk.days.slice(0, 7).map(x => `<i class="${x.fav >= 1 ? 'f1' : x.fav > 0 ? 'f05' : ''}"></i>`).join('')}</div>` : ''}
      <h3 style="margin-top:18px">${t('best_window')}</h3>
      ${w ? `<div class="window-pill"><b>${fmtDay(w.start.slice(0, 10))}, ${fmtTime(w.start)} – ${fmtTime(w.end)}</b><span>${Math.round(w.avgTemp)}°C · ${Math.round(w.avgWind)} km/h</span></div>${win.windows.slice(1, 3).map(x => `<div class="window-pill" style="background:var(--soft)"><span>${fmtDay(x.start.slice(0, 10))}, ${fmtTime(x.start)} – ${fmtTime(x.end)}</span><span class="muted">${x.hours} h</span></div>`).join('')}` : `<div class="alert">${ic('i-alert')}<div>${t('no_window')}</div></div>`}
    </div>
    <div class="card">${proj ? projChart(proj) : `<div class="alert ok">${ic('i-check')}<div>${t('healthy_msg')}</div></div>`}</div>
  </div>`;
}

function projChart(proj) {
  const W = 420, H = 200, P = 34, n = proj.untreated.length;
  const max = Math.max(20, Math.ceil(Math.max(...proj.untreated) / 10) * 10);
  const x = (i) => P + i * (W - P - 10) / (n - 1), y = (v) => H - 26 - v / max * (H - 46);
  const path = (a) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = (a) => path(a) + ` L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  return `<h3>${ic('i-chart')} ${t('spread_title')}</h3>
  <svg viewBox="0 0 ${W} ${H}" class="proj" role="img" aria-label="Severity projection">
    ${[0, 0.5, 1].map(f => `<line x1="${P}" x2="${W - 10}" y1="${y(max * f)}" y2="${y(max * f)}" class="gl"/><text x="${P - 6}" y="${y(max * f) + 4}" text-anchor="end">${Math.round(max * f)}%</text>`).join('')}
    ${proj.untreated.map((_, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${i === 0 ? t('today') : '+' + i}</text>`).join('')}
    <path d="${area(proj.untreated)}" class="a-bad"/><path d="${path(proj.untreated)}" class="l-bad"/>
    <path d="${path(proj.treated)}" class="l-good"/>
    <circle cx="${x(n - 1)}" cy="${y(proj.untreated[n - 1])}" r="4" class="d-bad"/><circle cx="${x(n - 1)}" cy="${y(proj.treated[n - 1])}" r="4" class="d-good"/>
  </svg>
  <div class="small" style="display:flex;gap:16px;flex-wrap:wrap"><span><i class="badge-dot" style="color:var(--red)"></i> ${t('untreated')}: <b>${proj.untreated[n - 1]}%</b></span><span><i class="badge-dot" style="color:var(--green-600)"></i> ${t('treated')}: <b>${proj.treated[n - 1]}%</b></span></div>
  <p class="small muted" style="margin:8px 0 0">${t('spread_note')}</p>`;
}

/** Pack illustration (not a real brand image): pouch for powders, bottle for liquids, bag for granules. */
function packSvg(label, color, sub, size = 92, form) {
  const isLiquid = form ? ['liquid'].includes(form) : /\b(EC|SC|SL|L|OD)\b|oil|Liquid/.test(label);
  const isBag = form ? ['granular', 'organic'].includes(form) : false;
  const txt = esc(String(label).replace(/\s*\(.*\)/, '').split(' ').slice(0, 2).join(' '));
  const sb = esc(String(sub || '').slice(0, 18));
  if (isLiquid) return `<svg class="pack" width="${size}" height="${size}" viewBox="0 0 92 92" aria-hidden="true"><rect x="36" y="4" width="20" height="10" rx="3" fill="${color}"/><path d="M30 18h32l6 12v52a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6V30z" fill="${color}"/><rect x="28" y="38" width="36" height="34" rx="4" fill="#fff" opacity=".95"/><text x="46" y="53" text-anchor="middle" font-size="7.5" font-weight="700" fill="#14231c">${txt}</text><text x="46" y="64" text-anchor="middle" font-size="5.5" fill="#55615b">${sb}</text></svg>`;
  if (isBag) return `<svg class="pack" width="${size}" height="${size}" viewBox="0 0 92 92" aria-hidden="true"><path d="M18 10h56l-4 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-2 14H18l-2-14 6-6-6-6 6-6-6-6 6-6-6-6 6-6-6-6 6-6z" fill="${color}"/><rect x="24" y="30" width="44" height="32" rx="4" fill="#fff" opacity=".95"/><text x="46" y="45" text-anchor="middle" font-size="7.5" font-weight="700" fill="#14231c">${txt}</text><text x="46" y="56" text-anchor="middle" font-size="5.5" fill="#55615b">${sb}</text></svg>`;
  return `<svg class="pack" width="${size}" height="${size}" viewBox="0 0 92 92" aria-hidden="true"><path d="M20 8h52l4 12-4 64H20l-4-64z" fill="${color}"/><rect x="20" y="8" width="52" height="8" fill="#000" opacity=".15"/><rect x="24" y="32" width="44" height="34" rx="4" fill="#fff" opacity=".95"/><text x="46" y="47" text-anchor="middle" font-size="7.5" font-weight="700" fill="#14231c">${txt}</text><text x="46" y="58" text-anchor="middle" font-size="5.5" fill="#55615b">${sb}</text><circle cx="46" cy="24" r="4" fill="#fff" opacity=".7"/></svg>`;
}

function wirePlan(root, ctx) {
  const p = ctx.planState;
  $('#pArea', root)?.addEventListener('change', (e) => { p.area = Math.max(0.05, +e.target.value || 1); drawPlan(root, ctx); });
  $('#pUnit', root)?.addEventListener('change', (e) => { p.unit = e.target.value; drawPlan(root, ctx); });
  $('#gps', root)?.addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Location not available', 'err');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const place = await reverseGeocode(lat, lon);
      field.set({ ...place, lat, lon }); ctx.field = field.get();
      try { ctx.wx = await fetchForecast(lat, lon); } catch { toast('Weather unavailable', 'err'); }
      drawPlan(root, ctx);
    }, () => toast('Location permission denied', 'err'), { timeout: 10000 });
  });
}

function setChatContext(ctx, pl) {
  const L = lang();
  const b = pl.rank.best;
  const w = pl.win?.windows?.[0];
  const st = ctx.wx ? dailyStats(ctx.wx.hours).filter(d => d.date >= ctx.wx.today).slice(0, 5) : null;
  const rainDays = st ? st.filter(d => d.rain >= 1).length : 0;
  const pack = (r) => ({ name: r.chem.name, perTank: `${r.plan.dosePerTank} ${r.plan.unit}`, tanks: r.plan.tanks, water: r.plan.water, cost: r.plan.packs.cost, phi: r.chem.phi, mode: r.mode, buy: packLabel(r.plan), why: r.why.join('; ') });
  chatContext.set({
    crop: ctx.crop, cropName: cropName(ctx.crop, L) || '', acres: +pl.acres.toFixed(2),
    disease: { name: ctx.dx.name[L] || ctx.dx.name.en, pathogen: ctx.dx.pathogen, type: typeLabel(ctx.dx.type), healthy: ctx.dx.healthy },
    confidence: Math.round(ctx.dx.conf * 100), severity: Math.round(ctx.severity),
    symptoms: ctx.dx.symptoms, cause: ctx.dx.cause, organic: ctx.dx.organic, prevention: ctx.dx.prevention,
    treat: { best: b ? pack(b) : null, alternatives: pl.rank.alternatives.map(pack), rotation: pl.rank.rotation, interval: pl.rank.interval, bio: pl.rank.bio.map(k => `${CHEMICALS[k].name} ${CHEMICALS[k].dose} ${CHEMICALS[k].unit}/L`) },
    nutrition: pl.nutrition.map(n => ({ name: n.f.name, how: n.how, cost: n.cost, match: n.match, low: n.low, high: n.high, brands: n.f.brands })),
    safeHarvest: b ? fmtDate(safeHarvestDate(new Date(), b.chem.phi)) : null,
    weather: ctx.wx ? { place: ctx.field?.name, summary: st.map(d => `${fmtDay(d.date)} ${Math.round(d.tmin)}–${Math.round(d.tmax)}°C${d.rain >= 1 ? ' rain ' + d.rain.toFixed(0) + 'mm' : ''}`).join(', ') + (rainDays ? '' : ' (dry week)'), risk: pl.risk ? t(pl.risk.level) : '—', reason: pl.risk?.reason || '', window: w ? `${fmtDay(w.start.slice(0, 10))}, ${fmtTime(w.start)} – ${fmtTime(w.end)}` : null } : null,
    projection: pl.proj ? { untreated: pl.proj.untreated.at(-1), treated: pl.proj.treated.at(-1) } : null,
    economics: pl.econ,
  });
}

function diagPane(ctx) {
  const dx = ctx.dx;
  const ex = dx.expert;
  return `<div class="grid g2">
    <div class="card"><h3>${t('symptoms')}</h3><ul class="list">${dx.symptoms.map(s => `<li>${esc(s)}</li>`).join('') || '<li>—</li>'}</ul>
      ${ex?.visible_symptoms?.length && dx.kb ? `<h3 style="margin-top:18px">Seen in your photo (Expert AI)</h3><ul class="list">${ex.visible_symptoms.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="card"><h3>${t('cause')}</h3><p>${esc(dx.cause || '—')}</p>
      ${ex?.differential?.length ? `<h3 style="margin-top:18px">Also considered</h3>${ex.differential.slice(0, 3).map(d => `<div class="prob-row"><span>${esc(d.name)}</span><b>${Math.round((d.likelihood > 1 ? d.likelihood / 100 : d.likelihood) * 100)}%</b><div class="bar"><i style="width:${Math.round((d.likelihood > 1 ? d.likelihood / 100 : d.likelihood) * 100)}%"></i></div></div>`).join('')}` : ''}
      ${dx.local && !ex ? `<h3 style="margin-top:18px">Top predictions</h3>${dx.local.top.map(r => `<div class="prob-row"><span>${esc(predName(r.label))}</span><b>${(r.p * 100).toFixed(1)}%</b><div class="bar"><i style="width:${(r.p * 100).toFixed(1)}%"></i></div></div>`).join('')}` : ''}
      ${dx.key ? `<a class="btn btn-ghost btn-sm" href="#/disease/${dx.key}" style="margin-top:8px">${ic('i-book')} ${t('nav_library')}</a>` : ''}
    </div>
  </div>`;
}

function evidencePane(ctx) {
  const lr = ctx.dx.local, q = ctx.q;
  return `<div class="grid g3">
    <div class="card"><h3>AI input (224 px)</h3><img class="evidence-img" src="${ctx.c224.toDataURL()}" alt=""><p class="small muted" style="margin-top:8px">Centre-cropped and resized exactly as the model sees it.</p></div>
    <div class="card"><h3>Lesion map</h3><canvas class="evidence-img" id="lesion"></canvas><p class="small muted" style="margin-top:8px">Red = symptomatic tissue inside the detected leaf. ${ctx.sevReliable ? `<b>${ctx.severity.toFixed(1)}%</b> of leaf area.` : 'Leaf region too small to measure reliably.'}</p></div>
    <div class="card"><h3>Where the AI looked</h3>${lr ? `<canvas class="evidence-img" id="heat"></canvas><div class="legend"><span>low</span><span class="grad"></span><span>high</span></div><div class="progress" id="heatProg" style="margin-top:8px"><i></i></div><p class="small muted" style="margin-top:8px">Occlusion sensitivity: each region is hidden in turn and the drop in confidence is measured.</p>` : '<p class="muted small">Available when the on-device model is used.</p>'}</div>
  </div>`;
}

async function wireEvidence(root, ctx) {
  const lc = $('#lesion', root);
  if (lc) {
    const { segC, seg } = ctx;
    lc.width = segC.width; lc.height = segC.height;
    const g = lc.getContext('2d'); g.drawImage(segC, 0, 0);
    const id = g.getImageData(0, 0, lc.width, lc.height);
    for (let i = 0; i < seg.leafMask.length; i++) {
      const j = i * 4;
      if (!seg.leafMask[i]) { id.data[j] *= 0.35; id.data[j + 1] *= 0.35; id.data[j + 2] *= 0.35; }
      else if (seg.lesionMask[i]) { id.data[j] = 0.45 * id.data[j] + 0.55 * 235; id.data[j + 1] = 0.45 * id.data[j + 1] + 0.55 * 40; id.data[j + 2] = 0.45 * id.data[j + 2] + 0.55 * 40; }
    }
    g.putImageData(id, 0, 0);
  }
  const hc = $('#heat', root);
  if (hc && ctx.dx.local) {
    if (ctx.heat) { renderHeat(ctx.c224, ctx.heat, hc); $('#heatProg', root)?.remove(); return; }
    const g = hc.getContext('2d'); hc.width = 224; hc.height = 224; g.drawImage(ctx.c224, 0, 0);
    try {
      ctx.heat = await occlusionMap(ctx.c224, ctx.dx.local.top[0].i, 4, (f) => { const b = $('#heatProg i', root); if (b) b.style.width = Math.round(f * 100) + '%'; });
      if (document.body.contains(hc)) { renderHeat(ctx.c224, ctx.heat, hc); $('#heatProg', root)?.remove(); }
    } catch (e) { console.warn(e); }
  }
}

// ───────────────────────── Voice & prescription ─────────────────────────
function voiceText(ctx) {
  const L = lang();
  const { sp, win } = plan(ctx);
  const unit = { g: { en: 'grams', hi: 'ग्राम', mr: 'ग्रॅम' }, ml: { en: 'ml', hi: 'मिली', mr: 'मिली' } };
  const w = win?.windows?.[0];
  const base = advisoryText(L, {
    healthy: ctx.dx.healthy, crop: cropName(ctx.crop, L) || '', disease: ctx.dx.name[L] || ctx.dx.name.en,
    sev: Math.round(ctx.severity), sevLabel: severityClass(ctx.severity).label.toLowerCase(),
    product: sp ? sp.product.replace(/[\d.]+%/g, '').replace(/\s+(WP|SC|EC|SL|WG|WDG|DF|SG|L)\b/g, '').trim() : null,
    dose: sp ? `${sp.dosePerTank} ${unit[sp.unit]?.[L] || sp.unit}` : '', tanks: sp?.tanks, phi: sp?.phi,
    window: w ? `${fmtDay(w.start.slice(0, 10))}, ${fmtTime(w.start)}` : null,
  });
  return ctx.dx.kb ? base : (ctx.dx.expert?.farmer_summary || base);
}

function buildRx(ctx) {
  const { p, sp, win, econ } = plan(ctx);
  const w = win?.windows?.[0];
  const packsText = sp ? sp.packs.items.map(i => `${i.n} x ${i.size}${sp.unit}`).join(' + ') : '';
  return {
    id: ctx.id, date: ctx.date, cropName: cropName(ctx.crop, 'en') || '—', diseaseName: ctx.dx.name.en, pathogen: ctx.dx.pathogen,
    confidence: ctx.dx.conf, verdict: { agree: '2 AIs agree', disagree: 'AIs differ', local_only: 'on-device AI', expert_only: 'Expert AI' }[ctx.dx.verdict],
    severity: ctx.severity, severityLabel: severityClass(ctx.severity).label, acres: +toAcres(p.area, p.unit).toFixed(2), field: ctx.field?.name || '',
    products: sp ? [{ name: sp.product, dosePerTank: sp.dosePerTank, unit: sp.unit, tanks: sp.tanks, phi: sp.phi, packsText }] : [],
    safeHarvest: sp ? safeHarvestDate(new Date(), sp.phi).toISOString() : null,
    window: w ? `${fmtDay(w.start.slice(0, 10))} ${fmtTime(w.start)}–${fmtTime(w.end)}` : null,
    organic: ctx.dx.organic, prevention: ctx.dx.prevention, economics: econ,
    nutrition: plan(ctx).nutrition.map(n => `${n.f.name}: ${n.how}`),
    image: ctx.c224.toDataURL('image/jpeg', 0.85),
  };
}
