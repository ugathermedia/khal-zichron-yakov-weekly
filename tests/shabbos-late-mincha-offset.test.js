'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'schedule-modes.js'), 'utf8');
const footer = /\n  injectUI\(\);\s*const baseRefresh = window\.refresh;[\s\S]*?\n\}\)\(\);\s*$/;
assert.match(source, footer, 'schedule mode startup exists');
const testable = source.replace(footer,
  '\n  window.__testSeason = { getLateMinchaOffset, seasonalMinchaTime, applyScheduleModes, lateShabbosMinchaIndex };\n})();\n');

const friday = new Date('2026-10-16T12:00:00Z');
const sunset = '2026-10-17T18:14:48-04:00';
const localISO = date => date.toISOString().slice(0, 10);
const clock = minutes => {
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  return (h % 12 || 12) + ':' + String(m).padStart(2, '0');
};
const makeRows = (lateLabel = 'מנחה ב׳', earlyShabbosMincha = false) => [
  { label: 'מנחה א׳', time: '6:00' }, // Friday Mincha/Kabbalas Shabbos
  { label: 'שחרית', time: '8:30' },
  ...(earlyShabbosMincha ? [{ label: 'מנחה א׳', time: '2:15' }] : []),
  { label: 'שיעור', time: '5:00' },
  { label: lateLabel, time: earlyShabbosMincha ? '5:35' : '5:30' },
  { label: 'שקיעה', time: '6:14' }
];

function fixture({ setting = null, season = 'winter', store = null, lateLabel = 'מנחה ב׳', earlyShabbosMincha = false, special = 'normal', sunsetInstant = sunset } = {}) {
  const saved = store || new Map();
  saved.set('kzy-weekly:season-mode', season);
  saved.set('kzy-weekly:special-mode:2026-10-16', special);
  if (setting !== null) saved.set('kzy-weekly:shabbos-late-mincha-minutes', String(setting));
  const state = {
    friday: new Date(friday),
    engine: { shabbos: { SeaLevelSunset: sunsetInstant } },
    shabbos: makeRows(lateLabel, earlyShabbosMincha),
    weekday: [],
    diagnostics: []
  };
  const window = { rowsHTML: rows => rows, editorRows: () => {}, buildSVG: () => {} };
  const sandbox = {
    state, window, LOCATION: { timeZoneId: 'America/New_York' },
    localISO, clockFromLocalMinutes: clock,
    localStorage: {
      getItem: k => saved.get(k) ?? null,
      setItem: (k, v) => saved.set(k, v)
    },
    document: { getElementById: () => null },
    Date, Intl, String, Number, Math, Object, Array, Set, Map
  };
  vm.runInNewContext(testable, sandbox, { filename: 'schedule-modes.js' });
  return { state, mode: window.__testSeason, saved };
}

function afterRules(f) {
  f.mode.applyScheduleModes();
  const minchaIndex = f.mode.lateShabbosMinchaIndex();
  const mincha = minchaIndex >= 0 ? f.state.shabbos[minchaIndex] : null;
  const shiur = f.state.shabbos.find(r => r.label === 'שיעור');
  const likras = f.state.shabbos.find(r => r.label === 'לקראת שבת');
  return { mincha, shiur, likras };
}

// Existing :05 rounding uses the exact Shkiah, not the displayed minute.
const now = fixture();
assert.equal(now.mode.getLateMinchaOffset(), 35);
assert.equal(now.mode.seasonalMinchaTime(), '5:35', '6:14:48 - 35 => 5:39:48 => 5:35');
const next = afterRules(now);
assert.equal(next.mincha.time, '5:35');
assert.equal(next.shiur.time, '5:05', 'shiur remains 30 minutes before late Mincha');
assert.equal(next.likras.time, '5:25', 'independent Friday Likras Shabbos 35-min rule unchanged');
assert.match(next.mincha.source, /at least 35 min/);

// Screenshot fixture: Shabbos has both an earlier 2:15 Mincha and a later
// 5:35 Mincha labelled just "מנחה". Previously the seasonal 30-minute
// calculation never ran; it must now update Mincha and afternoon shiur.
const screenshot = fixture({ lateLabel: 'מנחה', earlyShabbosMincha: true, sunsetInstant: '2026-10-17T18:12:34-04:00' });
assert.equal(screenshot.mode.lateShabbosMinchaIndex(), 4);
const corrected = afterRules(screenshot);
assert.equal(corrected.mincha.label, 'מנחה');
assert.equal(corrected.mincha.time, '5:35');
assert.equal(corrected.shiur.time, '5:05');
assert.equal(corrected.likras.time, '5:25');
assert.equal(screenshot.state.shabbos.find(r => r.label === 'מנחה א׳' && r.time === '2:15').time, '2:15');
assert.equal(screenshot.state.shabbos.find(r => r.label === 'מנחה / קבלת שבת').time, '6:00', 'Friday Mincha unchanged');

// Same detection controls Shabbos Shuva drashos and shiur suppression.
const shuva = fixture({ lateLabel: 'מנחה', earlyShabbosMincha: true, special: 'shabbos-shuva' });
const shuvaRows = afterRules(shuva);
assert.equal(shuvaRows.mincha.time, '5:35');
assert.equal(shuvaRows.shiur.hiddenByMode, true);
assert.equal(shuva.state.shabbos.find(r => r.label === 'דרשת שבת שובה – אנשים').time, '4:45');
assert.equal(shuva.state.shabbos.find(r => r.label === 'דרשת שבת שובה – נשים').time, '3:35');

// The 35-minute setting persists on another Shabbos.
const oldStyle = fixture({ setting: 35 });
assert.equal(oldStyle.mode.seasonalMinchaTime(), '5:35');
const older = afterRules(oldStyle);
assert.equal(older.mincha.time, '5:35');
assert.equal(older.shiur.time, '5:05');
assert.equal(older.likras.time, '5:25');

const sharedStore = new Map([['kzy-weekly:shabbos-late-mincha-minutes', '30']]);
const week1 = fixture({ store: sharedStore });
assert.equal(afterRules(week1).mincha.time, '5:35');
const week2 = fixture({ store: sharedStore });
week2.state.friday = new Date('2026-10-23T12:00:00Z');
assert.equal(afterRules(week2).mincha.time, '5:35', 'same global setting survives date changes');
assert.equal(week2.mode.getLateMinchaOffset(), 35);

// Winter and Summer with Shalosh Seudos share the same setting;
 // Summer without Shalosh Seudos retains the untouched board schedule.
const summer = fixture({ setting: 30, season: 'summer-ss' });
assert.equal(afterRules(summer).mincha.time, '5:35');
const summerNoSs = fixture({ setting: 30, season: 'summer-no-ss' });
assert.equal(afterRules(summerNoSs).mincha.time, '5:30');

// Reject bad stored input and fall back safely to new default.
for (const invalid of ['oops', '0', '14', '61', '30.5']) {
  const f = fixture({ setting: invalid });
  assert.equal(f.mode.getLateMinchaOffset(), 35, 'invalid value ' + invalid);
}
assert.equal(fixture({ setting: 60 }).mode.getLateMinchaOffset(), 60);
assert.equal(fixture({ setting: 15 }).mode.getLateMinchaOffset(), 35);

// UI setting must be global to this browser, not dependent on selected week.
assert.match(source, /localStorage\.setItem\(SHABBOS_LATE_MINCHA_OFFSET_KEY, String\(requested\)\)/);
assert.match(source, /id="shabbosLateMinchaOffset"/);
assert.match(source, /getLateMinchaOffset\(\)\)\;/);

console.log('Shabbos late Mincha: screenshot label, 35-min minimum, :05 floor, shiur, Shuva, seasons and cross-week persistence passed.');

// Whole five-minute boundaries and exact seconds must always preserve the gap.
for (let minute = 0; minute < 60; minute++) {
  for (const second of [0, 29, 30, 59]) {
    const f = fixture({sunsetInstant: `2026-10-17T18:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}-04:00`});
    const [h,m] = f.mode.seasonalMinchaTime().split(':').map(Number);
    const gap = 18*60 + minute + second/60 - ((h+12)*60+m);
    assert.ok(gap >= 35 && gap < 40, `gap ${gap}`);
    assert.equal(m % 5, 0);
  }
}
