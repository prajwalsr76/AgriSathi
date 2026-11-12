import { b64url, sha256hex, esc, fmtDate } from '../core/util.js';

export async function render(root, { query }) {
  const d = query.get('d');
  let data, code;
  try { const json = b64url.dec(d || ''); data = JSON.parse(json); code = (await sha256hex(json)).slice(0, 10).toUpperCase(); }
  catch { root.innerHTML = `<div class="wrap" style="padding:60px 20px"><div class="alert bad">This prescription link is incomplete or damaged.</div></div>`; return; }
  root.innerHTML = `
  <div class="wrap fade-in" style="padding:34px 20px;max-width:760px">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><div class="small muted">AgriSathi prescription</div><h1 class="dx-name" style="margin:4px 0">${esc(data.n)}</h1><div class="dx-sub" style="margin:0">${esc(data.c)} · ${esc(data.z || '')}</div></div>
        <div style="text-align:right"><span class="chip">✓ Verification code ${code}</span><div class="small muted" style="margin-top:6px">Rx ${esc(data.id)} · ${fmtDate(data.d)}</div></div>
      </div>
      <dl class="kv" style="margin-top:18px"><dt>Confidence</dt><dd>${data.f}%</dd><dt>Leaf area affected</dt><dd>${data.s}%</dd><dt>Field size</dt><dd>${data.a} acre</dd>${data.h ? `<dt>Safe to harvest from</dt><dd><b>${fmtDate(data.h)}</b></dd>` : ''}</dl>
      ${data.p?.length ? `<table class="t" style="margin-top:16px"><thead><tr><th>Product</th><th>Per 16 L tank</th><th>Tanks</th><th>PHI</th></tr></thead><tbody>${data.p.map(p => `<tr><td><b>${esc(p[0])}</b></td><td>${esc(p[1])}</td><td>${esc(p[2])}</td><td>${esc(p[3])} days</td></tr>`).join('')}</tbody></table>` : ''}
      <p class="small muted" style="margin-top:16px">The verification code is a fingerprint (SHA-256) of the prescription data. If it matches the code printed on the PDF, the dose and product were not altered.</p>
    </div>
    <a class="btn btn-primary" href="#/doctor" style="margin-top:18px">Diagnose a crop</a>
  </div>`;
}
