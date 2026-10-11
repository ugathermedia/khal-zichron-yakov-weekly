'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'schedule-modes.js'), 'utf8');
const footer = /\n  injectUI\(\);\s*const baseRefresh = window\.refresh;[\s\S]*?\n\}\)\(\);\s*$/;
assert.match(source, footer, 'schedule mode startup exists');
const testable = source.replace(footer,
  '\n  window.__testSeason = { getLateMinchaOffset, seasonalMinchaTime, applyScheduleModes };\n})();\n');

const friday = new Date('2026-10-16T12:00:00Z');
const sunset = '2026-10-17T18:14:48-04:00';
const localISO = date => date.toISOString().slice(0, 10);
const clock = minutes => {
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  return (h % 12 || 12) + ':' + String(m).padStart(2, '0');
};
const makeRows = () => [
  { label: 'מנחה א׳', time: '6:00' }, // Friday Mincha/Kabbalas Shabbos
  { label: 'שחרית', time: '8:30' },
  { label: 'שיעור', time: '4:30' },
  { label: 'מנחה ב׳', time: '5:30' },
  { label: 'שקיעה', time: '6:14' }
];

function fixture({ setting = null, season = 'winter', store = null } = {}) {
  const saved = store || new Map();
  saved.set('kzy-weekly:season-mode', season);
  if (setting !== null) saved.set('kzy-weekly:shabbos-late-mincha-minutes', String(setting));
  const state = {
    friday: new Date(friday),
    engine: { shabbos: { SeaLevelSunset: sunset } },
    shabbos: makeRows(),
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
  const mincha = f.state.shabbos.find(r => r.label === 'מנחה ב׳');
  const shiur = f.state.shabbos.find(r => r.label === 'שיעור');
  const likras = f.state.shabbos.find(r => r.label === 'לקראת שבת');
  return { mincha, shiur, likras };
}

// Existing :05 rounding uses the exact Shkiah, not the displayed minute.
const now = fixture();
assert.equal(now.mode.getLateMinchaOffset(), 30);
assert.equal(now.mode.seasonalMinchaTime(), '5:40', '6:14:48 - 30 => 5:44:48 => 5:40');
const next = afterRules(now);
assert.equal(next.mincha.time, '5:40');
assert.equal(next.shiur.time, '5:10', 'shiur remains 30 minutes before late Mincha');
assert.equal(next.likras.time, '5:25', 'independent Friday Likras Shabbos 35-min rule unchanged');
assert.match(next.mincha.source, /at least 30 min/);

// User can select 35 again; stored setting persists on another Shabbos.
const oldStyle = fixture({ setting: 35 });
assert.equal(oldStyle.mode.seasonalMinchaTime(), '5:35');
const older = afterRules(oldStyle);
assert.equal(older.mincha.time, '5:35');
assert.equal(older.shiur.time, '5:05');
assert.equal(older.likras.time, '5:25');

const sharedStore = new Map([['kzy-weekly:shabbos-late-mincha-minutes', '30']]);
const week1 = fixture({ store: sharedStore });
assert.equal(afterRules(week1).mincha.time, '5:40');
const week2 = fixture({ store: sharedStore });
week2.state.friday = new Date('2026-10-23T12:00:00Z');
assert.equal(afterRules(week2).mincha.time, '5:40', 'same global setting survives date changes');
assert.equal(week2.mode.getLateMinchaOffset(), 30);

// Winter and Summer with Shalosh Seudos share the same setting;
 // Summer without Shalosh Seudos retains the untouched board schedule.
const summer = fixture({ setting: 30, season: 'summer-ss' });
assert.equal(afterRules(summer).mincha.time, '5:40');
const summerNoSs = fixture({ setting: 30, season: 'summer-no-ss' });
assert.equal(afterRules(summerNoSs).mincha.time, '5:30');

// Reject bad stored input and fall back safely to new default.
for (const invalid of ['oops', '0', '14', '61', '30.5']) {
  const f = fixture({ setting: invalid });
  assert.equal(f.mode.getLateMinchaOffset(), 30, 'invalid value ' + invalid);
}
assert.equal(fixture({ setting: 60 }).mode.getLateMinchaOffset(), 60);
assert.equal(fixture({ setting: 15 }).mode.getLateMinchaOffset(), 15);

// UI setting must be global to this browser, not dependent on selected week.
assert.match(source, /localStorage\.setItem\(SHABBOS_LATE_MINCHA_OFFSET_KEY, String\(requested\)\)/);
assert.match(source, /id="shabbosLateMinchaOffset"/);
assert.match(source, /getLateMinchaOffset\(\)\)\;/);

console.log('Shabbos late Mincha: 30-min default, configurable offset, :05 floor, shiur, Likras, seasons and cross-week persistence passed.');
