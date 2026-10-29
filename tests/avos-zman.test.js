'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').split("$('#prev').onclick")[0];
const context = vm.createContext({ Intl, Date, window: { ZmanimRounding: require('../zmanim-rounding.js') } });
vm.runInContext(source + '\nglobalThis.testApi = { state, supplementShabbos, applyOverrides };', context);
const api = context.testApi;
function run(friday, instant, rows = []) {
  api.state.friday = new Date(friday + 'T12:00:00');
  api.state.engine = { shabbos: { Tzais72: instant } };
  return api.supplementShabbos(rows);
}
for (let m = 0; m < 60; m++) for (const s of [0, 1, 29, 30, 59]) {
  const rows = run('2026-11-06', `2026-11-07T18:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}-05:00`);
  const row = rows.find(r => r.label === 'אבות ובנים');
  const [hour, minute] = row.time.split(':').map(Number);
  const gap = (hour + 12) * 60 + minute - (18 * 60 + m + s / 60);
  assert.ok(gap >= 35 && gap < 40, `gap ${gap}`);
  assert.equal(minute % 5, 0);
}
for (const friday of ['2026-10-30', '2027-02-26']) {
  assert.equal(run(friday, '2026-10-31T19:01:12-04:00').at(-1).time, '7:40');
}
for (const friday of ['2026-10-23', '2027-03-05']) {
  assert.ok(!run(friday, '2026-10-31T19:01:12-04:00').some(r => r.label === 'אבות ובנים'));
}
assert.ok(!run('2026-10-30', 'N/A').some(r => r.label === 'אבות ובנים'));
const existing = [{label: 'מנחה', time: '5:00'}, {label: 'אבות ובנים', time: '7:40'}];
const result = run('2026-10-30', '2026-10-31T19:01:12-04:00', existing);
assert.equal(result.filter(r => r.label === 'אבות ובנים').length, 1);
assert.equal(result[0], existing[0], 'existing rows remain unchanged');
// Appending keeps all existing index-based overrides aligned.
api.state.shabbos = run('2026-10-30', '2026-10-31T19:01:12-04:00', [existing[0]]);
context.localStorage = {getItem: () => JSON.stringify({shabbos: ['5:10']})};
api.applyOverrides();
assert.equal(api.state.shabbos[0].time, '5:10');
assert.equal(api.state.shabbos.at(-1).time, '7:40');
console.log('Avos Ubanim: exact 35-minute minimum, five-minute ceiling, season boundaries and existing overrides passed.');
