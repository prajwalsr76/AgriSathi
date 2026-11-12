// Climate engine: live forecast (Open-Meteo, no key needed), epidemiological disease-risk
// models and a spray-window planner. Model functions are pure and unit-tested.

const WET_RH = 90; // RH (%) above which leaves are treated as wet (leaf-wetness proxy)

export async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'auto', past_days: 3, forecast_days: 7,
    hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,wind_speed_10m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration',
    current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code,is_day',
  });
  const r = await fetch('https://api.open-meteo.com/v1/forecast?' + params);
  if (!r.ok) throw new Error('Weather service unavailable (' + r.status + ')');
  return normalise(await r.json());
}

export async function searchPlace(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=${encodeURIComponent(q)}`);
  const j = await r.json();
  return (j.results || []).map(p => ({ name: p.name, region: [p.admin2, p.admin1, p.country].filter(Boolean).join(', '), lat: p.latitude, lon: p.longitude }));
}

export async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    const j = await r.json();
    return { name: j.city || j.locality || 'My field', region: [j.principalSubdivision, j.countryName].filter(Boolean).join(', ') };
  } catch { return { name: 'My field', region: `${lat.toFixed(2)}, ${lon.toFixed(2)}` }; }
}

/** Converts the Open-Meteo response into arrays of hourly records grouped by local date. */
export function normalise(j) {
  const h = j.hourly;
  const hours = h.time.map((t, i) => ({
    time: t, date: t.slice(0, 10), hour: +t.slice(11, 13),
    temp: h.temperature_2m[i], rh: h.relative_humidity_2m[i], dew: h.dew_point_2m?.[i],
    rain: h.precipitation[i] ?? 0, pop: h.precipitation_probability?.[i] ?? 0,
    wind: h.wind_speed_10m[i], code: h.weather_code?.[i], day: h.is_day?.[i],
  }));
  const d = j.daily;
  const days = d.time.map((t, i) => ({
    date: t, code: d.weather_code[i], tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i],
    rain: d.precipitation_sum[i] ?? 0, pop: d.precipitation_probability_max?.[i] ?? 0, windMax: d.wind_speed_10m_max[i], et0: d.et0_fao_evapotranspiration?.[i],
  }));
  const today = (j.current?.time || hours[hours.length - 1].time).slice(0, 10);
  return { current: j.current, hours, days, today, timezone: j.timezone };
}

export function dailyStats(hours) {
  const by = {};
  for (const h of hours) (by[h.date] ||= []).push(h);
  return Object.entries(by).map(([date, hs]) => {
    const wet = hs.filter(h => h.rh >= WET_RH || h.rain > 0.1);
    const temps = hs.map(h => h.temp);
    let run = 0, maxRun2130 = 0, hot35 = false;
    for (const h of hs) {
      run = (h.temp >= 21 && h.temp <= 30) ? run + 1 : 0;
      maxRun2130 = Math.max(maxRun2130, run);
      if (h.temp > 35) hot35 = true;
    }
    return {
      date, n: hs.length,
      tmin: Math.min(...temps), tmax: Math.max(...temps), tmean: temps.reduce((a, b) => a + b, 0) / temps.length,
      rhMean: hs.reduce((a, h) => a + h.rh, 0) / hs.length,
      wetHours: wet.length, wetTemp: wet.length ? wet.reduce((a, h) => a + h.temp, 0) / wet.length : null,
      rh90Hours: hs.filter(h => h.rh >= 90).length,
      rain: hs.reduce((a, h) => a + h.rain, 0), windMax: Math.max(...hs.map(h => h.wind)),
      maxRun2130, hot35,
    };
  });
}

/** TOMCAST disease-severity value (0–4) from leaf-wetness hours and mean temp during wetness. */
export function tomcastDSV(wetHours, wetTemp) {
  if (!wetHours || wetTemp == null) return 0;
  const T = wetTemp;
  const table = T < 13 ? null
    : T < 18 ? [[7, 1], [16, 2], [21, 3]]
    : T < 21 ? [[4, 1], [9, 2], [16, 3], [23, 4]]
    : T < 26 ? [[3, 1], [6, 2], [13, 3], [21, 4]]
    : T < 30 ? [[4, 1], [9, 2], [16, 3], [23, 4]]
    : null;
  if (!table) return 0;
  let v = 0;
  for (const [h, dsv] of table) if (wetHours >= h) v = dsv;
  return v;
}

/** Hutton criteria (UK, 2017) for potato/tomato late blight: Tmin ≥ 10 °C and ≥ 6 h RH ≥ 90 %. */
export const isHuttonDay = (d) => d.tmin >= 10 && d.rh90Hours >= 6;

const LEVEL = (score) => score >= 65 ? 'high' : score >= 35 ? 'moderate' : 'low';

/**
 * Runs the risk model for one disease over the forecast.
 * Returns { level, score (0-100), days: [{date, fav}], reason }.
 */
export function diseaseRisk(model, stats, today) {
  const fut = stats.filter(d => d.date >= today && d.n >= 20).slice(0, 7);
  const recent = stats.filter(d => d.date >= shiftDate(today, -3) && d.n >= 20).slice(0, 10);
  const days = [];
  let score = 0, reason = '';
  switch (model) {
    case 'late_blight': {
      let consecutive = 0, best = 0, count = 0;
      for (const d of fut) {
        const fav = isHuttonDay(d);
        days.push({ date: d.date, fav: fav ? 1 : (d.tmin >= 8 && d.rh90Hours >= 4 ? 0.5 : 0) });
        consecutive = fav ? consecutive + 1 : 0; best = Math.max(best, consecutive); if (fav) count++;
      }
      score = best >= 2 ? 85 + Math.min(15, (count - 2) * 5) : count === 1 ? 50 : days.some(x => x.fav) ? 25 : 8;
      reason = best >= 2 ? `Hutton period: ${best} consecutive days with Tmin ≥ 10 °C and ≥ 6 h humidity ≥ 90 %` : count ? `${count} blight-favourable day(s) ahead` : 'Not enough humid hours for late blight';
      break;
    }
    case 'tomcast': {
      let cum = 0;
      for (const d of recent) {
        const v = tomcastDSV(d.wetHours, d.wetTemp);
        cum += v;
        if (d.date >= today) days.push({ date: d.date, fav: v / 4 });
      }
      score = Math.min(100, Math.round(cum / 15 * 70));
      reason = `TOMCAST cumulative disease-severity value = ${cum} over 10 days (spray threshold 15)`;
      break;
    }
    case 'powdery': {
      let idx = 0;
      for (const d of recent) {
        idx += d.maxRun2130 >= 6 ? 20 : -10;
        if (d.hot35) idx -= 10;
        idx = Math.max(0, Math.min(100, idx));
        if (d.date >= today) days.push({ date: d.date, fav: d.maxRun2130 >= 6 ? 1 : 0 });
      }
      score = idx;
      reason = `Gubler–Thomas powdery mildew index = ${idx}/100`;
      break;
    }
    case 'rust': {
      for (const d of fut) days.push({ date: d.date, fav: d.wetHours >= 6 && d.wetTemp >= 12 && d.wetTemp <= 25 ? 1 : 0 });
      const n = days.filter(x => x.fav).length;
      score = Math.min(100, n * 22); reason = `${n} day(s) with ≥ 6 h leaf wetness at 12–25 °C (rust infection)`;
      break;
    }
    case 'bacterial': {
      for (const d of fut) days.push({ date: d.date, fav: d.rain >= 5 && d.tmax >= 24 ? 1 : d.rain >= 1 && d.tmax >= 24 ? 0.5 : 0 });
      const s = days.reduce((a, x) => a + x.fav, 0);
      score = Math.min(100, Math.round(s * 20)); reason = `${days.filter(x => x.fav === 1).length} warm day(s) with splashing rain ≥ 5 mm`;
      break;
    }
    case 'mites': {
      for (const d of fut) days.push({ date: d.date, fav: d.tmax >= 32 && d.rhMean < 55 && d.rain < 1 ? 1 : d.tmax >= 30 && d.rhMean < 65 ? 0.5 : 0 });
      const s = days.reduce((a, x) => a + x.fav, 0);
      score = Math.min(100, Math.round(s * 18)); reason = 'Hot, dry, dusty weather favours mite build-up';
      break;
    }
    case 'whitefly': {
      for (const d of fut) days.push({ date: d.date, fav: d.tmax >= 28 && d.tmax <= 38 && d.rain < 2 ? 1 : 0 });
      const n = days.filter(x => x.fav).length;
      score = Math.min(100, n * 15); reason = `${n} warm dry day(s) – whitefly (virus vector) activity`;
      break;
    }
    case 'blast': {
      for (const d of fut) days.push({ date: d.date, fav: d.tmin >= 20 && d.tmin <= 26 && d.rh90Hours >= 8 ? 1 : 0 });
      const n = days.filter(x => x.fav).length;
      score = Math.min(100, n * 25); reason = `${n} night(s) at 20–26 °C with long high-humidity spells`;
      break;
    }
    case 'generic_fungal': {
      for (const d of fut) days.push({ date: d.date, fav: d.wetHours >= 10 && d.tmean >= 18 && d.tmean <= 30 ? 1 : d.wetHours >= 6 ? 0.5 : 0 });
      const s = days.reduce((a, x) => a + x.fav, 0);
      score = Math.min(100, Math.round(s * 18)); reason = 'Leaf-wetness hours and temperature suitable for fungal infection';
      break;
    }
    default:
      return { level: 'low', score: 0, days: [], reason: 'Weather does not drive this problem' };
  }
  return { level: LEVEL(score), score, days, reason };
}

/** Hour-by-hour spray suitability for the next `horizon` hours, grouped into windows. */
export function sprayWindows(hours, nowIso, horizon = 72) {
  const start = hours.findIndex(h => h.time >= nowIso.slice(0, 13));
  const slice = hours.slice(Math.max(0, start), Math.max(0, start) + horizon);
  const scored = slice.map((h, i) => {
    const next4 = slice.slice(i, i + 5);
    const rainSoon = next4.some(x => x.rain > 0.2 || x.pop >= 50);
    const reasons = [];
    if (rainSoon) reasons.push('rain within 4 h');
    if (h.wind > 15) reasons.push('wind > 15 km/h (drift)');
    if (h.temp > 32) reasons.push('too hot (evaporation)');
    if (h.temp < 8) reasons.push('too cold');
    if (h.rh >= 92) reasons.push('leaves wet');
    if (h.hour < 6 || h.hour > 18) reasons.push('night');
    return { ...h, ok: reasons.length === 0, reasons };
  });
  const windows = [];
  let cur = null;
  for (const h of scored) {
    if (h.ok) { if (!cur) cur = { start: h.time, end: h.time, hours: 0, avgWind: 0, avgTemp: 0 }; cur.end = h.time; cur.hours++; cur.avgWind += h.wind; cur.avgTemp += h.temp; }
    else if (cur) { windows.push(cur); cur = null; }
  }
  if (cur) windows.push(cur);
  for (const w of windows) { w.avgWind /= w.hours; w.avgTemp /= w.hours; }
  return { hours: scored, windows: windows.filter(w => w.hours >= 2) };
}

export function shiftDate(iso, days) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const WEATHER_ICON = (code, day = 1) => {
  if (code == null) return '·';
  if (code === 0) return day ? '☀️' : '🌙';
  if (code <= 2) return day ? '🌤️' : '☁️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  return '⛈️';
};
