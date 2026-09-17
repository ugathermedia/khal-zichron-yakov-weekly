const KZY_API = 'https://kzy.zmanimscreens.com/api/data';
const LOCATION = {
  latitude: 41.09034,
  longitude: -74.04837,
  elevation: 141,
  timeZoneId: 'America/New_York',
  locationName: 'Khal Zichron Yakov'
};

const state = {
  friday: null,
  shabbos: [],
  weekday: [],
  raw: null,
  engine: null,
  linkedHandle: null,
  diagnostics: []
};

const $ = s => document.querySelector(s);
const pad2 = n => String(n).padStart(2, '0');
const localISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function comingFriday(from = new Date()) {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return d;
}

function setFriday(d) {
  state.friday = new Date(d);
  state.friday.setHours(12, 0, 0, 0);
  $('#friday').value = localISO(state.friday);
  renderTitle();
  refresh();
}

function renderTitle() {
  const sat = addDays(state.friday, 1);
  $('#weekTitle').textContent = `Shabbos of ${sat.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  $('#panelDate').textContent = `${state.friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sat.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function boxes(raw) {
  return Array.isArray(raw) ? raw : (raw?.boxes || raw?.data || []);
}

function findBox(raw, name) {
  return boxes(raw).find(b => String(b.position || b.name || '').toLowerCase() === name.toLowerCase());
}

function orderedRows(box) {
  const rows = box?.rows || box?.items || box?.data || [];
  return [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function normalizeTime(v) {
  if (v == null) return '';
  return String(v).replace(/^0/, '').trim();
}

function fmtDateTime(value) {
  if (!value || value === 'N/A') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LOCATION.timeZoneId,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(d).replace(' AM', '').replace(' PM', '');
}

function timeMinutes(value) {
  if (!value || value === 'N/A') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : Math.round(d.getTime() / 60000);
}

function minutesToClock(m) {
  if (m == null) return '';
  const d = new Date(m * 60000);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LOCATION.timeZoneId,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(d).replace(' AM', '').replace(' PM', '');
}

function getZmanim(date) {
  if (!window.KosherZmanim?.getZmanimJson) throw new Error('KosherZmanim library did not load');
  const json = window.KosherZmanim.getZmanimJson({
    ...LOCATION,
    date: `${localISO(date)}T12:00:00`,
    complexZmanim: true
  });
  return json?.Zmanim || json?.zmanim || {};
}

function loadEngine() {
  const friday = getZmanim(state.friday);
  const shabbos = getZmanim(addDays(state.friday, 1));
  state.engine = { friday, shabbos };

  const known = localISO(state.friday) === '2026-09-18';
  const checks = [
    ['Fri Shkia', friday.SeaLevelSunset, known ? '7:00' : null],
    ['Shab Shkia', shabbos.SeaLevelSunset, known ? '6:58' : null],
    ['KS MGA 72', shabbos.SofZmanShmaMGA72Minutes, known ? '9:09' : null],
    ['KS GRA', shabbos.SofZmanShmaGRA, known ? '9:45' : null],
    ['Tzeis 72', shabbos.Tzais72 || shabbos.Tzais72Minutes, known ? '8:10' : null]
  ];

  state.diagnostics = checks.map(([label, raw, expected]) => `${label}: ${fmtDateTime(raw) || 'missing'}${expected ? ` (reference ${expected})` : ''}`);
  $('#diagnosticText').textContent = state.diagnostics.join('\n');
  $('#engineStatus').textContent = 'KosherZmanim ready';

  if (known) {
    const pass = checks.every(([, raw, expected]) => !expected || fmtDateTime(raw) === expected);
    $('#calibration').textContent = pass ? 'Sep 18–19 calibration ✓' : 'Calibration needs review';
  } else {
    $('#calibration').textContent = 'Engine active';
  }
}

function sourceZman(from) {
  const s = String(from || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const fri = state.engine?.friday || {};
  const shab = state.engine?.shabbos || {};
  const pick = (...v) => v.find(Boolean) || null;

  if (s.includes('fri') && s.includes('plag')) return pick(fri.PlagHamincha, fri.PlagHaminchaGRA);
  if (s.includes('fri') && (s.includes('shkia') || s.includes('sunset'))) return fri.SeaLevelSunset;
  if (s.includes('fri') && (s.includes('hadlaka') || s.includes('candle'))) return fri.CandleLighting;
  if ((s.includes('shab') || s.includes('sat')) && (s.includes('shkia') || s.includes('sunset'))) return shab.SeaLevelSunset;
  if ((s.includes('shab') || s.includes('sat')) && s.includes('plag')) return pick(shab.PlagHamincha, shab.PlagHaminchaGRA);
  if ((s.includes('shab') || s.includes('sat')) && s.includes('tzais') && s.includes('72')) return pick(shab.Tzais72, shab.Tzais72Minutes);
  if ((s.includes('shab') || s.includes('sat')) && s.includes('tzais')) return pick(shab.TzaisGeonim8Point5Degrees, shab.Tzais);
  return null;
}

function nearestMinutes(row) {
  const raw = String(row.roundNearest || row.round_nearest || '').trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/(?:(\d+):)?(\d+)/);
  return m ? Number(m[1] || 0) * 60 + Number(m[2]) : 0;
}

function applyRounding(mins, row) {
  const step = nearestMinutes(row);
  if (!step) return mins;
  const mode = String(row.roundType || row.round_type || '').toLowerCase();
  if (mode.includes('down')) return Math.floor(mins / step) * step;
  if (mode.includes('up')) return Math.ceil(mins / step) * step;
  return Math.round(mins / step) * step;
}

function automaticTime(row) {
  const base = sourceZman(row.from);
  if (!base) return '';
  let mins = timeMinutes(base);
  const amount = Math.abs(Number(row.minutes || 0));
  const offset = String(row.offset || '').toLowerCase();
  const direction = offset.includes('after') ? 1 : -1;
  mins += direction * amount;
  mins = applyRounding(mins, row);
  return minutesToClock(mins);
}

function cleanShabbosLabel(label) {
  const s = String(label || '').trim();
  if (/shabbos day/i.test(s)) return 'שבת קודש';
  if (/פלג/.test(s)) return 'פלג המנחה';
  if (/הדלק/.test(s)) return 'הדלקת נרות';
  if (/מנחה/.test(s) && /א/.test(s)) return 'מנחה א׳';
  if (/מנחה/.test(s) && /ב/.test(s)) return 'מנחה ב׳';
  if (/שקיעה/.test(s)) return 'שקיעה';
  if (/שחרית/.test(s)) return 'שחרית';
  if (/שיעור/.test(s)) return 'שיעור';
  if (/אבות/.test(s)) return 'פרקי אבות';
  if (/72/.test(s)) return 'צאת הכוכבים ר״ת';
  if (/מעריב/.test(s)) return 'מעריב';
  return s;
}

function displayRow(row, group) {
  const rawLabel = String(row.text || row.label || '').trim();
  const label = group === 'shabbos' ? cleanShabbosLabel(rawLabel) : rawLabel;

  if (row.type === 'text' && !normalizeTime(row.time)) {
    return { label: label || rawLabel, time: '', source: 'KZY section', raw: row, section: true };
  }

  if (row.type === 'time') return { label, time: normalizeTime(row.time), source: 'KZY fixed', raw: row };
  if (row.type === 'text') return { label, time: normalizeTime(row.time), source: 'KZY text', raw: row };

  const calculated = automaticTime(row);
  const from = row.from || 'automatic';
  const amount = Math.abs(Number(row.minutes || 0));
  const offset = row.offset || (amount ? 'Before' : '');
  return {
    label,
    time: calculated || normalizeTime(row.time) || 'AUTO',
    source: `${amount ? `${amount} min ` : ''}${offset} ${from}`.trim(),
    raw: row
  };
}

function parseClockForFriday(s) {
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 12) h += 12;
  return h * 60 + min;
}

function clockFromLocalMinutes(m) {
  m = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h % 12 || 12}:${pad2(min)}`;
}

function supplementShabbos(rows) {
  const shab = state.engine?.shabbos || {};
  const result = [...rows];

  const firstMinchaA = result.find(r => !r.section && r.label === 'מנחה א׳');
  if (firstMinchaA?.time && !result.some(r => r.label === 'לקראת שבת')) {
    const m = parseClockForFriday(firstMinchaA.time);
    if (m != null) {
      result.unshift({
        label: 'לקראת שבת',
        time: clockFromLocalMinutes(Math.floor((m - 35) / 5) * 5),
        source: '35+ min before Friday Mincha A; rounded down to :05'
      });
    }
  }

  const extras = [];
  if (!result.some(r => /מג.?א|mga/i.test(r.label))) {
    extras.push({ label: 'סו״ז קריאת שמע מג״א', time: fmtDateTime(shab.SofZmanShmaMGA72Minutes), source: 'KosherZmanim MGA fixed 72' });
  }
  if (!result.some(r => /גר.?א|gra/i.test(r.label))) {
    extras.push({ label: 'סו״ז קריאת שמע גר״א', time: fmtDateTime(shab.SofZmanShmaGRA), source: 'KosherZmanim GRA' });
  }

  if (extras.length) {
    const shacharisIndex = result.findIndex(r => r.label === 'שחרית');
    const insertAt = shacharisIndex >= 0 ? shacharisIndex + 1 : result.length;
    result.splice(insertAt, 0, ...extras);
  }

  if (!result.some(r => /72/.test(`${r.raw?.text || ''} ${r.source || ''}`) || r.label === 'צאת הכוכבים ר״ת')) {
    result.push({ label: 'צאת הכוכבים ר״ת', time: fmtDateTime(shab.Tzais72 || shab.Tzais72Minutes), source: 'KosherZmanim sunset +72' });
  }

  return result;
}

function normalizeWeekdayRows(rows) {
  let shacharis = 0;
  let mincha = 0;
  let maariv = 0;

  return rows.map(r => {
    if (r.section) return r;
    const raw = String(r.label || '');

    if (/שחרית/.test(raw)) {
      shacharis += 1;
      r.label = shacharis === 1 ? 'שחרית א׳' : shacharis === 2 ? 'שחרית ב׳' : 'שחרית ראשון / חג';
    } else if (/מנחה/.test(raw)) {
      mincha += 1;
      r.label = mincha === 1 ? 'מנחה מוקדמת' : mincha === 2 ? 'מנחה מאוחרת א׳–ג׳' : 'מנחה מאוחרת ד׳–ה׳';
    } else if (/מעריב/.test(raw)) {
      maariv += 1;
      r.label = maariv === 1 ? 'מעריב בשקיעה' : 'מעריב';
      if (maariv === 1) {
        r.time = 'שקיעה';
        r.source = 'KZY: at shkiah';
      }
    }
    return r;
  });
}

function storageKey() {
  return `kzy-weekly:${localISO(state.friday)}`;
}

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); } catch { return {}; }
}

function saveOverrides() {
  localStorage.setItem(storageKey(), JSON.stringify({
    shabbos: state.shabbos.map(r => r.time),
    weekday: state.weekday.map(r => r.time)
  }));
}

function applyOverrides() {
  const o = loadOverrides();
  if (Array.isArray(o.shabbos)) o.shabbos.forEach((v, i) => { if (state.shabbos[i] && v != null) state.shabbos[i].time = v; });
  if (Array.isArray(o.weekday)) o.weekday.forEach((v, i) => { if (state.weekday[i] && v != null) state.weekday[i].time = v; });
}

async function refresh() {
  $('#status').textContent = 'Loading…';

  try {
    loadEngine();
  } catch (e) {
    state.engine = null;
    $('#engineStatus').textContent = 'KosherZmanim unavailable';
    $('#calibration').textContent = e.message;
  }

  try {
    const res = await fetch(KZY_API, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    state.raw = raw;

    const shabbosRows = orderedRows(findBox(raw, 'shabbos')).map(r => displayRow(r, 'shabbos'));
    const weekdayRows = orderedRows(findBox(raw, 'weekday')).map(r => displayRow(r, 'weekday'));

    state.shabbos = supplementShabbos(shabbosRows);
    state.weekday = normalizeWeekdayRows(weekdayRows);
    applyOverrides();

    $('#sourceNotice').textContent = `Loaded KZY schedule snapshot • ${new Date().toLocaleTimeString()}`;
    $('#status').textContent = 'KZY loaded';
  } catch (e) {
    state.shabbos = supplementShabbos([]);
    state.weekday = [];
    applyOverrides();
    $('#sourceNotice').textContent = `KZY schedule unavailable (${e.message}). KosherZmanim and manual editing still work.`;
    $('#status').textContent = 'Offline schedule mode';
  }

  render();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function editorRows() {
  const all = [
    ...state.shabbos.map((r, i) => ({ group: 'shabbos', i, r })),
    ...state.weekday.map((r, i) => ({ group: 'weekday', i, r }))
  ];

  $('#fields').innerHTML = all.map(x => {
    if (x.r.section) return `<div class="field-section">${esc(x.r.label || '')}</div>`;
    return `<div class="field"><label>${esc(x.r.label || '(unnamed)')} <small title="${esc(x.r.source || '')}">· ${esc(x.r.source || '')}</small></label><input data-group="${x.group}" data-i="${x.i}" value="${esc(x.r.time || '')}"></div>`;
  }).join('');

  $('#fields').querySelectorAll('input').forEach(el => el.addEventListener('input', () => {
    state[el.dataset.group][+el.dataset.i].time = el.value;
    saveOverrides();
    renderPanel();
  }));
}

function rowsHTML(rows) {
  return rows.map(r => {
    if (r.section) return `<div class="schedule-subsection">${esc(r.label || '')}</div>`;
    return `<div class="schedule-row"><div class="label">${esc(r.label || '')}</div><div class="time">${esc(r.time || '—')}</div></div>`;
  }).join('');
}

function renderPanel() {
  $('#panelRows').innerHTML = rowsHTML(state.shabbos);
  $('#weekdayRows').innerHTML = rowsHTML(state.weekday);
}

function render() {
  editorRows();
  renderPanel();
}

function buildSVG() {
  const W = 620;
  const pad = 42;
  const rowH = 31;
  const rows = [...state.shabbos, { section: true, label: 'זמני ימי החול' }, ...state.weekday];
  const H = 120 + rows.length * rowH + 35;
  let y = 82;
  let body = '';

  for (const r of rows) {
    if (r.section) {
      y += 18;
      body += `<text x="${W - pad}" y="${y}" text-anchor="end" class="section">${esc(r.label)}</text><line x1="${pad}" x2="${W - pad}" y1="${y + 10}" y2="${y + 10}" class="heavy"/>`;
      y += 24;
      continue;
    }

    body += `<text x="${W - pad}" y="${y}" text-anchor="end" class="label">${esc(r.label)}</text><text x="${pad}" y="${y}" class="time">${esc(r.time || '—')}</text><line x1="${pad}" x2="${W - pad}" y1="${y + 9}" y2="${y + 9}" class="line"/>`;
    y += rowH;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>.title,.section,.label{font-family:Arial,'Noto Sans Hebrew',sans-serif;direction:rtl;unicode-bidi:plaintext;fill:#18263e}.title{font-size:29px;font-weight:700}.section{font-size:20px;font-weight:700}.label{font-size:15px}.time{font-family:Arial,sans-serif;font-size:15px;font-weight:700;fill:#172238}.line{stroke:#ddd9d0;stroke-width:1}.heavy{stroke:#18263e;stroke-width:2}</style><text x="${W - pad}" y="42" text-anchor="end" class="title">זמני שבת</text><line x1="${pad}" x2="${W - pad}" y1="58" y2="58" class="heavy"/>${body}</svg>`;
}

function downloadSVG() {
  const blob = new Blob([buildSVG()], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'KZY-Weekly-Zmanim.svg';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function updateLinkedSVG() {
  if (!window.showSaveFilePicker) {
    downloadSVG();
    $('#linkedFile').textContent = 'Browser cannot directly overwrite files; downloaded SVG instead';
    return;
  }

  try {
    if (!state.linkedHandle) {
      state.linkedHandle = await window.showSaveFilePicker({
        suggestedName: 'KZY-Weekly-Zmanim.svg',
        types: [{ description: 'SVG image', accept: { 'image/svg+xml': ['.svg'] } }]
      });
    }
    const writable = await state.linkedHandle.createWritable();
    await writable.write(buildSVG());
    await writable.close();
    $('#linkedFile').textContent = `${state.linkedHandle.name} updated ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    if (e.name !== 'AbortError') $('#linkedFile').textContent = `Could not update linked SVG: ${e.message}`;
  }
}

$('#prev').onclick = () => setFriday(addDays(state.friday, -7));
$('#next').onclick = () => setFriday(addDays(state.friday, 7));
$('#thisWeek').onclick = () => setFriday(comingFriday());
$('#friday').onchange = e => setFriday(new Date(`${e.target.value}T12:00:00`));
$('#refresh').onclick = refresh;
$('#exportSvg').onclick = downloadSVG;
$('#updateLinked').onclick = updateLinkedSVG;
$('#clearOverrides').onclick = () => { localStorage.removeItem(storageKey()); refresh(); };

setFriday(comingFriday());