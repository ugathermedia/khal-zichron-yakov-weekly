'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'weekday-planner.js'), 'utf8');
const end = /  window\.refresh\(\);\s*\}\)\(\);\s*$/;
assert.match(source, end, 'weekday planner bootstrap still has a known entry point');
const testSource = source.replace(end,
  '  window.__weekdayTest = { buildWeekdayPlan, sundayNeitzLimit };\n})();\n');

const makeDate = (day, time) => `2026-10-${String(day).padStart(2, '0')}T${time}Z`;
const localISO = date => date.toISOString().slice(0, 10);
const addDays = (date, offset) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
};
const clock = minutes => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, '0')}`;

async function runWeek({ rcDate = null, manualDays = {} } = {}) {
  // This intentionally mimics an old or special board snapshot. The first three
  // board Shacharis entries must NOT determine ordinary weekly shul defaults.
  const state = {
    friday: new Date('2026-10-16T12:00:00Z'),
    weekday: [
      { label: 'שחרית א׳', time: '6:30' },
      { label: 'שחרית ב׳', time: '6:45' },
      { label: 'שחרית ראשון / חג', time: '7:30' },
      { label: 'מנחה מוקדמת', time: '1:45' },
      { label: 'מעריב', time: '8:15' }, { label: 'מעריב', time: '9:45' }
    ],
    diagnostics: []
  };
  const cache = new Map([
    ['kzy-weekly:weekday-plan:2026-10-16', JSON.stringify({ days: manualDays })]
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
      return {
        SeaLevelSunrise: makeDate(day, day <= 20 ? '11:11:40' : '11:16:40'),
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

  console.log('Week of Oct 18: ordinary, Sunday/Neitz, RC, old board, manual Shacharis tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
