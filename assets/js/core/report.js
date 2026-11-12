// One-page prescription PDF with a QR code that opens a verification view of the same data.
import { loadScript, LIBS, b64url, sha256hex, fmtDate } from './util.js';

/** Compact payload that travels inside the QR / share link. */
export function rxPayload(rx) {
  return {
    v: 1, id: rx.id, d: rx.date, c: rx.cropName, n: rx.diseaseName, z: rx.pathogen, s: Math.round(rx.severity),
    f: Math.round(rx.confidence * 100), a: rx.acres, h: rx.safeHarvest || null,
    p: rx.products.map(p => [p.name, p.dosePerTank + ' ' + p.unit, p.tanks, p.phi]),
  };
}
export async function rxLink(rx) {
  const json = JSON.stringify(rxPayload(rx));
  const code = (await sha256hex(json)).slice(0, 10).toUpperCase();
  const base = location.href.split('#')[0];
  return { url: `${base}#/verify?d=${b64url.enc(json)}`, code };
}

export async function downloadPdf(rx) {
  await Promise.all([loadScript(LIBS.jspdf), loadScript(LIBS.qrcode)]);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 14;
  const green = [11, 110, 79], dark = [22, 33, 28], grey = [100, 110, 105];
  const { url, code } = await rxLink(rx);

  // Header band
  doc.setFillColor(...green); doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('AgriSathi', M, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Crop Health Prescription', M, 21);
  doc.setFontSize(9); doc.text(`Rx No. ${rx.id}`, W - M, 12, { align: 'right' }); doc.text(fmtDate(rx.date), W - M, 18, { align: 'right' });
  doc.text(`Verification code ${code}`, W - M, 24, { align: 'right' });

  let y = 40;
  // Image
  if (rx.image) { try { doc.addImage(rx.image, 'JPEG', M, y, 46, 46); } catch { /* ignore */ } }
  const x0 = rx.image ? M + 52 : M;
  doc.setTextColor(...grey); doc.setFontSize(9); doc.text('DIAGNOSIS', x0, y + 3);
  doc.setTextColor(...dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(doc.splitTextToSize(`${rx.diseaseName}`, W - x0 - 40), x0, y + 11);
  doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(...grey); doc.text(rx.pathogen || '', x0, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark); doc.setFontSize(10);
  const facts = [['Crop', rx.cropName], ['Confidence', Math.round(rx.confidence * 100) + '%  (' + rx.verdict + ')'], ['Leaf area affected', rx.severity.toFixed(1) + '%  – ' + rx.severityLabel], ['Field', `${rx.acres} acre${rx.field ? '  ·  ' + rx.field : ''}`]];
  facts.forEach(([k, v], i) => { doc.setTextColor(...grey); doc.text(k, x0, y + 27 + i * 5.5); doc.setTextColor(...dark); doc.text(String(v), x0 + 36, y + 27 + i * 5.5); });

  // QR
  const qr = window.qrcode(0, 'L'); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), cell = 34 / n;
  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) doc.rect(W - M - 34 + c * cell, y + r * cell, cell + 0.02, cell + 0.02, 'F');
  doc.setFontSize(7); doc.setTextColor(...grey); doc.text('Scan to verify', W - M - 17, y + 38, { align: 'center' });

  y += 56;
  const section = (title) => { doc.setFillColor(236, 246, 240); doc.rect(M, y - 5, W - 2 * M, 8, 'F'); doc.setTextColor(...green); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(title, M + 2, y); doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark); doc.setFontSize(9.5); y += 8; };

  if (rx.products.length) {
    section('Spray plan (16 L knapsack sprayer)');
    const cols = [M + 2, M + 72, M + 102, M + 120, M + 150];
    doc.setTextColor(...grey); ['Product', 'Per tank', 'Tanks', 'Buy', 'PHI'].forEach((h, i) => doc.text(h, cols[i], y)); y += 5;
    doc.setTextColor(...dark);
    for (const p of rx.products) {
      const name = doc.splitTextToSize(p.name, 68);
      doc.text(name, cols[0], y); doc.text(`${p.dosePerTank} ${p.unit}`, cols[1], y); doc.text(String(p.tanks), cols[2], y);
      doc.text(doc.splitTextToSize(p.packsText, 30), cols[3], y); doc.text(`${p.phi} days`, cols[4], y);
      y += Math.max(name.length, 1) * 4.5 + 2;
    }
    y += 2;
    if (rx.safeHarvest) { doc.setFont('helvetica', 'bold'); doc.text(`Safe to harvest from: ${fmtDate(rx.safeHarvest)}`, M + 2, y); doc.setFont('helvetica', 'normal'); y += 5; }
    if (rx.window) { doc.text(`Best spray window: ${rx.window}`, M + 2, y); y += 5; }
    doc.setTextColor(...grey); doc.setFontSize(8.5);
    doc.text('Use one product per spray and rotate groups between sprays. Wear gloves, mask and full sleeves. Do not spray against the wind.', M + 2, y); y += 8;
  }
  const list = (title, items) => {
    if (!items?.length) return;
    section(title);
    for (const it of items.slice(0, 5)) { const lines = doc.splitTextToSize('•  ' + it, W - 2 * M - 4); doc.text(lines, M + 2, y); y += lines.length * 4.6; }
    y += 4;
  };
  list('Organic & biological options', rx.organic);
  list('Recommended nutrition (apply 3-4 days after the spray)', rx.nutrition);
  list('Prevention', rx.prevention);

  if (rx.economics) {
    section('Economics');
    const e = rx.economics;
    doc.text(`Crop value at risk: Rs ${e.lossValue.toLocaleString('en-IN')}    Treatment cost: Rs ${e.treatmentCost.toLocaleString('en-IN')}    Net protected: Rs ${e.net.toLocaleString('en-IN')}` + (e.roi ? `    Return: ${e.roi}x` : ''), M + 2, y);
    y += 8;
  }
  // footer
  doc.setDrawColor(220); doc.line(M, 280, W - M, 280);
  doc.setFontSize(7.5); doc.setTextColor(...grey);
  doc.text(doc.splitTextToSize('Decision-support advice generated by AgriSathi. Read and follow the product label. For severe outbreaks consult your local Krishi Vigyan Kendra (KVK) or agriculture officer. Kisan Call Centre: 1800-180-1551 (toll free).', W - 2 * M), M, 285);
  doc.save(`AgriSathi_Rx_${rx.id}.pdf`);
}
