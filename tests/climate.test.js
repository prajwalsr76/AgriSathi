import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tomcastDSV, isHuttonDay, dailyStats, diseaseRisk, sprayWindows } from '../assets/js/core/climate.js';

function mkHours(date, f) { return Array.from({ length: 24 }, (_, hr) => ({ time: `${date}T${String(hr).padStart(2, '0')}:00`, date, hour: hr, ...f(hr) })); }

test('TOMCAST DSV table', () => {
  assert.equal(tomcastDSV(0, 20), 0);
  assert.equal(tomcastDSV(5, 22), 1);
  assert.equal(tomcastDSV(13, 22), 3);
  assert.equal(tomcastDSV(23, 19), 4);
  assert.equal(tomcastDSV(20, 10), 0); // too cold
});

test('Hutton day', () => {
  assert.ok(isHuttonDay({ tmin: 12, rh90Hours: 8 }));
  assert.ok(!isHuttonDay({ tmin: 9, rh90Hours: 12 }));
  assert.ok(!isHuttonDay({ tmin: 14, rh90Hours: 4 }));
});

test('late blight high risk in cool humid spell, low in dry heat', () => {
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];
  const wet = dates.flatMap(d => mkHours(d, h => ({ temp: 12 + (h > 10 && h < 17 ? 6 : 0), rh: h < 9 || h > 19 ? 96 : 80, rain: 0, wind: 5, pop: 10 })));
  const dry = dates.flatMap(d => mkHours(d, h => ({ temp: 25 + (h > 10 && h < 17 ? 10 : 0), rh: 35, rain: 0, wind: 5, pop: 0 })));
  assert.equal(diseaseRisk('late_blight', dailyStats(wet), '2026-11-01').level, 'high');
  assert.equal(diseaseRisk('late_blight', dailyStats(dry), '2026-11-01').level, 'low');
  assert.ok(diseaseRisk('mites', dailyStats(dry), '2026-11-01').score > 50);
});

test('spray window avoids rain and night', () => {
  const hours = mkHours('2026-11-01', h => ({ temp: 24, rh: 60, rain: h >= 14 && h <= 15 ? 3 : 0, pop: 0, wind: 6 }));
  const r = sprayWindows(hours, '2026-11-01T00:00', 24);
  assert.ok(r.windows.length >= 1);
  assert.equal(r.windows[0].start, '2026-11-01T06:00');
  for (const w of r.windows) { const s = +w.start.slice(11, 13), e = +w.end.slice(11, 13); assert.ok(!(s <= 15 && e >= 9 && s >= 9)); }
});
