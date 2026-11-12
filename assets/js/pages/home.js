import { t, lang } from '../core/i18n.js';
import { CROPS, CROP_ORDER } from '../data/crops.js';
import { SAMPLES, sampleImg } from '../data/samples.js';
import { field } from '../core/store.js';
import { fetchForecast, dailyStats, diseaseRisk } from '../core/climate.js';
import { esc } from '../core/util.js';

const FAQ = [
  ['Is it really free and private?', 'Yes. The disease AI runs inside your browser — your photo is not uploaded. History is saved only on your phone. The optional Expert AI sends the photo to Google Gemini only if you add a key.'],
  ['How reliable is the diagnosis?', 'It works best on a clear, close photo of one affected leaf in daylight. AgriSathi always shows how sure it is and its next-best answers, refuses photos that have no plant, and can ask a second, independent AI to confirm. For a serious outbreak, also show the result to your local KVK or agriculture officer.'],
  ['Should I use all the products it shows?', 'No. The products are alternatives. Use the BEST CHOICE first — one product per spray — and switch to an alternative in the next spray. Never mix them in one tank.'],
  ['Does it work without internet?', 'Yes, after the first use. The AI model (24 MB) is cached on the device. Weather, maps and the Expert AI need internet.'],
  ['Which languages are supported?', 'English, Hindi and Marathi — on screen, in the chat assistant and by voice.'],
  ['Where do the doses and prices come from?', 'Common Indian label rates (CIB&RC registered products) and indicative MRPs. Always read the product label; prices vary by state.'],
];

const ic = (id) => `<svg class="icon"><use href="#${id}"/></svg>`;

export async function render(root) {
  const L = lang();
  root.innerHTML = `
  <section class="hero">
    <div class="wrap">
      <div class="fade-in">
        <div class="kicker">${ic('i-leaf')} ${t('hero_kicker')}</div>
        <h1>${t('hero_title')}</h1>
        <p class="lead">${t('hero_sub')}</p>
        <div class="ctas">
          <a class="btn btn-primary" href="#/doctor">${ic('i-camera')} ${t('cta_diagnose')}</a>
          <a class="btn btn-ghost" href="#/weather">${ic('i-cloud')} ${t('cta_risk')}</a>
        </div>
        <div class="chips">
          <span class="chip">${ic('i-cpu')} ${t('chip_offline')}</span>
          <span class="chip">${ic('i-leaf')} ${t('chip_crops')}</span>
          <span class="chip">${ic('i-mic')} ${t('chip_lang')}</span>
          <span class="chip">${ic('i-shield')} ${t('chip_free')}</span>
        </div>
        <div id="homeAlert" style="margin-top:22px"></div>
      </div>
      <div style="position:relative" class="fade-in">
        <div class="phone">
          <div class="notch"></div>
          <div class="screen">
            ${sampleImg(SAMPLES[0], 'alt="Leaf being scanned"')}
            <div class="frame-box"></div><div class="scanline"></div>
            <div class="result-pop">
              <div class="small muted">Tomato · Phytophthora infestans</div>
              <div class="t">Late Blight detected</div>
              <div class="bar"><i></i></div>
              <div class="small" style="margin-top:8px;display:flex;justify-content:space-between"><span>Ridomil Gold · 40 g/tank</span><b style="color:var(--green-700)">13 tanks</b></div>
            </div>
          </div>
        </div>
        <div class="float-step s1"><b>1</b>${t('step1')} 📷</div>
        <div class="float-step s2"><b>2</b>${t('step2')} 🔬</div>
        <div class="float-step s3"><b>3</b>${t('step3')} 💰</div>
      </div>
    </div>
  </section>

  <section class="stats">
    <div class="wrap">
      <div><div class="num" data-count="20">20</div><div class="lbl">${t('stat_crops')}</div></div>
      <div><div class="num" data-count="69">69</div><div class="lbl">${t('stat_classes')}</div></div>
      <div><div class="num">&lt; 1 s</div><div class="lbl">${t('stat_speed')}</div></div>
      <div><div class="num">₹0</div><div class="lbl">${t('stat_cost')}</div></div>
    </div>
  </section>

  <section class="block">
    <div class="wrap">
      <div class="section-head"><h2>${t('feat_title')}</h2><p>${t('feat_sub')}</p></div>
      <div class="grid g4">
        ${[['i-scan', 'f_doctor', '#/doctor'], ['i-chat', 'f_chat', 'javascript:AgriSathi.chat()'], ['i-sack', 'f_nutri', '#/doctor'], ['i-cloud', 'f_weather', '#/weather'],
          ['i-spray', 'f_spray', '#/tools?tab=spray'], ['i-calc', 'f_fert', '#/tools?tab=fert'], ['i-rupee', 'f_profit', '#/tools?tab=profit'], ['i-file', 'f_rx', '#/doctor']]
          .map(([i, k, href]) => `<a class="card feature reveal" href="${href}" style="color:inherit"><div class="ico">${ic(i)}</div><h3>${t(k)}</h3><p>${t(k + '_d')}</p></a>`).join('')}
      </div>
    </div>
  </section>

  <section class="block" style="background:#fff">
    <div class="wrap">
      <div class="section-head"><h2>${t('how_title')}</h2><p>${t('how_sub')}</p></div>
      <div class="pipeline">
        ${[1, 2, 3, 4, 5, 6].map(i => `<div class="pipe reveal"><h3>${t('how' + i)}</h3><p>${t('how' + i + '_d')}</p></div>`).join('')}
      </div>
    </div>
  </section>

  <section class="block">
    <div class="wrap">
      <div class="section-head"><h2>${t('crops_title')}</h2><p>${t('crops_sub')}</p></div>
      <div class="crop-cloud">
        ${CROP_ORDER.map(k => `<span class="crop-pill ${CROPS[k].inModel ? '' : 'ext'}">${CROPS[k].icon} ${esc(CROPS[k].name[L] || CROPS[k].name.en)}</span>`).join('')}
      </div>
    </div>
  </section>

  <section class="block" style="background:var(--card)">
    <div class="wrap" style="max-width:860px">
      <div class="section-head"><h2>${t('faq_title')}</h2></div>
      <div class="faq">
        ${FAQ.map(([q, a]) => `<details class="reveal"><summary>${q}</summary><p>${a}</p></details>`).join('')}
      </div>
    </div>
  </section>

  <section class="wrap" style="padding-bottom:20px;padding-top:40px">
    <div class="cta-band">
      <div><h2>${t('cta_banner')}</h2><p>${t('cta_banner_sub')}</p></div>
      <a class="btn btn-primary" href="#/doctor">${ic('i-camera')} ${t('cta_diagnose')}</a>
    </div>
  </section>`;

  // Scroll reveal + animated counters
  const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  root.querySelectorAll('.reveal').forEach(el => io.observe(el));
  root.querySelectorAll('[data-count]').forEach(el => {
    const end = +el.dataset.count, suf = el.dataset.suffix || '', dec = String(end).includes('.') ? 1 : 0; let t0;
    const tick = (ts) => { t0 ??= ts; const k = Math.min(1, (ts - t0) / 1200); el.textContent = (end * (1 - (1 - k) ** 3)).toFixed(dec) + suf; if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });

  // Personal alert if the farmer has saved a field location
  const f = field.get();
  if (f) {
    try {
      const fc = await fetchForecast(f.lat, f.lon);
      const st = dailyStats(fc.hours);
      const lb = diseaseRisk('late_blight', st, fc.today), fu = diseaseRisk('generic_fungal', st, fc.today);
      const worst = lb.score >= fu.score ? ['Late blight', lb] : ['Fungal leaf disease', fu];
      const box = root.querySelector('#homeAlert');
      if (box) box.innerHTML = `<a href="#/weather" class="alert ${worst[1].level === 'high' ? 'bad' : worst[1].level === 'moderate' ? '' : 'ok'}" style="text-decoration:none">
        ${ic('i-cloud')}<div><b>${esc(f.name)}: ${worst[0]} risk ${worst[1].level}</b><br><span class="small">${esc(worst[1].reason)}</span></div></a>`;
    } catch { /* offline – no alert */ }
  }
}
