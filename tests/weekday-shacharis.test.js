'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'weekday-planner.js'), 'utf8');
const end = /  window\.refresh\(\);\s*\}\)\(\);\s*$/;
assert.match(source, end, 'weekday planner bootstrap still has a known entry point');
const testSource = source.replace(end,
  '  window.__weekdayTest = { buildWeekdayPlan, sundayNeitzLimit, isChanukahMorning, isChanukahNight, applyChanukahShabbos };\n})();\n');

const makeDate = (day, time) => `2026-10-${String(day).padStart(2, '0')}T${time}Z`;
const localISO = date => date.toISOString().slice(0, 10);
const addDays = (date, offset) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
};
const clock = minutes => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, '0')}`;

async function runWeek({ rcDate = null, manualDays = {}, fridayKey = '2026-10-16' } = {}) {
  // This intentionally mimics an old or special board snapshot. The first three
  // board Shacharis entries must NOT determine ordinary weekly shul defaults.
  const state = {
    friday: new Date(fridayKey + 'T12:00:00Z'),
    weekday: [
      { label: 'שחרית א׳', time: '6:30' },
      { label: 'שחרית ב׳', time: '6:45' },
      { label: 'שחרית ראשון / חג', time: '7:30' },
      { label: 'מנחה מוקדמת', time: '1:45' },
      { label: 'מעריב', time: '8:15' }, { label: 'מעריב', time: '9:45' }
    ],
    shabbos: [
      { section: true, label: 'ליל שבת' },
      { label: 'לקראת שבת', time: '3:35' },
      { label: 'מנחה / קבלת שבת', time: '4:10' },
      { section: true, label: 'שבת קודש' },
      { label: 'שחרית', time: '8:30' },
      { label: 'מנחה', time: '3:45' },
      { label: 'צאת הכוכבים ר״ת', time: '5:40' },
      { label: 'אבות ובנים', time: '6:15' }
    ],
    diagnostics: []
  };
  const cache = new Map([
    ['kzy-weekly:weekday-plan:' + fridayKey, JSON.stringify({ days: manualDays })]
  ]);
  const sandbox = {
    state, Date, Intl, Math, Number, String, RegExp, Object, Set, Map,
    localISO, addDays, LOCATION: { timeZoneId: 'America/New_York' },
    localStorage: {
      getItem: key => cache.get(key) || null,
      setItem: (key, value) => cache.set(key, value)
    },
    getZmanim(date) {
      const day = date.getUTCDate();
      const makeDate = (_, time) => localISO(date) + 'T' + time + 'Z';
      return {
        SeaLevelSunrise: makeDate(day, fridayKey === '2026-12-04' ? '12:11:40' : day <= 20 ? '11:11:40' : '11:16:40'),
        SeaLevelSunset: makeDate(day, '22:10:20'),
        MinchaGedola: makeDate(day, '17:10:00')
      };
    },
    fmtDateTime: value => new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'
    }).format(new Date(value)),
    clockFromLocalMinutes: clock,
    document: { getElementById: () => null },
    window: {
      refresh: async () => {},
      kzyCalendar: {
        events: async () => rcDate ? [{ date: rcDate, category: 'roshchodesh' }] : []
      }
    }
  };
  vm.runInNewContext(testSource, sandbox, { filename: 'weekday-planner.js' });
  await sandbox.window.__weekdayTest.buildWeekdayPlan();
  const dayRow = day => {
    const row = state.weekday.find(item => item.dayNames?.includes(day));
    assert.ok(row, `Missing ${day} Shacharis row`);
    return row;
  };
  return { state, dayRow, unit: sandbox.window.__weekdayTest };
}

async function main() {
  const week = await runWeek();
  const sunday = week.dayRow('Sunday');
  assert.equal(sunday.time, '6:50 · 7:30 · 8:45');
  assert.equal(Array.from(sunday.neitzTimes).join(','), '6:50');
  assert.ok(!sunday.time.includes('6:50 · 6:50'));
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
    const times = week.dayRow(day).time.split(' · ');
    assert.ok(times.includes('6:45'), `${day} missing 6:45`);
    assert.ok(times.includes('7:30'), `${day} missing 7:30`);
    assert.ok(!times.includes('6:30'), `${day} has unscheduled 6:30`);
    assert.ok(!times.includes('8:45'), `${day} should not automatically have 8:45`);
  }
  const pushed = week.unit.sundayNeitzLimit(['6:30', '6:45', '7:30', '8:45'], {
    minutes: 410, start: '6:50', neitz: '7:12'
  });
  assert.equal(Array.from(pushed.times).join(','), '6:50,7:30,8:45');
  assert.equal(Array.from(pushed.changedTimes).join(','), '6:50');

  const rc = await runWeek({ rcDate: '2026-10-19' });
  const rcMonday = rc.dayRow('Monday').time.split(' · ');
  assert.ok(rcMonday.includes('6:30'), 'Rosh Chodesh changes 6:45 to 6:30');
  assert.ok(!rcMonday.includes('6:45'));
  assert.ok(rcMonday.includes('7:30'));

  const custom = await runWeek({ manualDays: {
    '2026-10-20': { shacharisCustom: '6:40 · 7:45' }
  } });
  assert.ok(custom.dayRow('Tuesday').time.includes('7:45'), 'Explicit custom times preserved');
  assert.ok(!custom.dayRow('Tuesday').time.includes('7:30'), 'Explicit replacement respected');

  const chanukah = await runWeek({ fridayKey: '2026-12-04', rcDate: '2026-12-10' });
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Friday']) {
    const row = chanukah.dayRow(day);
    assert.ok(row.time.startsWith('6:40 · '), day + ' starts at 6:40 on Chanukah');
    assert.ok(row.time.includes('7:30'), 'Second minyan preserved');
    assert.ok(row.neitzTimes.length, 'Additional seasonal Neitz minyan preserved');
  }
  assert.ok(chanukah.dayRow('Thursday').time.startsWith('6:30 · '), 'Rosh Chodesh overrides Chanukah');
  const sundayChanukah = chanukah.dayRow('Sunday');
  assert.ok(sundayChanukah.time.startsWith('6:50 · '), 'Sunday Neitz overrides Chanukah in the full planner');
  const laterSunday = chanukah.unit.sundayNeitzLimit(['6:40', '7:30', '8:45'], {
    minutes: 410, start: '6:50', neitz: '7:12'
  });
  assert.equal(Array.from(laterSunday.times).join(','), '6:50,7:30,8:45', 'Later Sunday Neitz overrides Chanukah');
  for (const [date, expected] of [
    ['2026-12-04', false], ['2026-12-05', true], ['2026-12-12', true], ['2026-12-13', false],
    ['2025-12-14', false], ['2025-12-15', true], ['2025-12-22', true], ['2025-12-23', false]
  ]) assert.equal(chanukah.unit.isChanukahMorning(new Date(date + 'T12:00:00Z')), expected, date);

  for (const [date, expected] of [
    ['2026-12-03', false], ['2026-12-04', true], ['2026-12-11', true], ['2026-12-12', false]
  ]) assert.equal(chanukah.unit.isChanukahNight(new Date(date + 'T12:00:00Z')), expected, date + ' evening');
  const visible = f => f.state.shabbos.filter(r => !r.hiddenByMode);
  assert.equal(visible(chanukah).filter(r => r.label === 'מעריב נוסף' && r.time === '5:15').length, 0, 'Friday and Motzaei Shabbos excluded from additional Maariv');
  assert.equal(visible(chanukah).filter(r => r.label === 'מנחה נוספת' && r.time === '3:00').length, 1);
  assert.ok(!visible(chanukah).some(r => r.label === 'לקראת שבת'));
  assert.equal(visible(chanukah).find(r => r.label === 'מנחה / קבלת שבת').time, '4:10', 'Regular Friday Mincha preserved');
  assert.equal(visible(chanukah).find(r => r.label === 'מנחה').time, '3:45', 'Shabbos Mincha preserved');
  const nightRows = chanukah.state.weekday.filter(r => r.source.includes('Chanukah additional Maariv'));
  assert.equal(nightRows.length, 1, 'Identical weekday evenings combined');
  assert.equal(nightRows[0].dayNames.join(','), 'Sunday,Monday,Tuesday,Wednesday,Thursday');
  assert.equal(nightRows[0].time, '5:15');
  assert.equal(chanukah.state.weekday.find(r => r.source === 'KZY: at shkiah + fixed minyanim').time,
    week.state.weekday.find(r => r.source === 'KZY: at shkiah + fixed minyanim').time, 'Existing Maariv preserved');
  chanukah.unit.applyChanukahShabbos();
  assert.equal(visible(chanukah).filter(r => r.chanukahOwned).length, 1, 'Repeated calculation keeps only the extra Friday Mincha');
  const finalFriday = await runWeek({ fridayKey: '2026-12-11' });
  assert.equal(visible(finalFriday).filter(r => r.label === 'מעריב נוסף').length, 0, 'No extra Maariv on the last Friday or Motzaei Shabbos');
  assert.ok(!finalFriday.state.weekday.some(r => r.source.includes('Chanukah additional Maariv')), 'No additional Maariv after Chanukah');
  const after = await runWeek({ fridayKey: '2026-12-18' });
  for (const ordinary of [week, after]) {
    assert.ok(!ordinary.state.shabbos.some(r => r.chanukahOwned));
    assert.ok(visible(ordinary).some(r => r.label === 'לקראת שבת'), 'Ordinary Likras Shabbos unchanged');
  }

  console.log('Week of Oct 18: ordinary, Sunday/Neitz, RC, old board, manual Shacharis tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
