'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'weekday-planner.js'), 'utf8');
const end = /  window\.refresh\(\);\s*\}\)\(\);\s*$/;
assert.match(source, end, 'planner bootstrap entry point');
const testSource = source.replace(end,
  '  window.__testPlanner = { buildWeekdayPlan };\n})();\n');
const localISO = date => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

async function fixture({ friday, manualDays = {}, earlyMinchaGedolaDates = {} }) {
  const state = {
    friday: new Date(friday + 'T12:00:00Z'),
    weekday: [
      // Board may already show the conditional 1:15 kollel minyan.
      // It is not the standing 1:45 minyan.
      { label: 'שחרית א׳', time: '6:45' },
      { label: 'שחרית ב׳', time: '7:30' },
      { label: 'מנחה מוקדמת', time: '1:15' },
      { label: 'מעריב', time: '8:15' },
      { label: 'מעריב', time: '9:45' }
    ],
    diagnostics: []
  };
  const cache = new Map([
    ['kzy-weekly:weekday-plan:' + friday, JSON.stringify({ days: manualDays })]
  ]);
  const sandbox = {
    state, Date, Intl, Math, Number, String, Object, RegExp, Set, Map,
    addDays, localISO, LOCATION: { timeZoneId: 'America/New_York' },
    localStorage: {
      getItem: key => cache.get(key) || null,
      setItem: (key, value) => cache.set(key, value)
    },
    getZmanim(date) {
      const day = localISO(date);
      return {
        SeaLevelSunrise: day + 'T11:12:00Z',
        SeaLevelSunset: day + 'T22:10:00Z',
        MinchaGedola: day + (earlyMinchaGedolaDates[day] || 'T17:10:00Z')
      };
    },
    fmtDateTime(value) {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'
      }).format(new Date(value));
    },
    clockFromLocalMinutes(minutes) {
      return (Math.floor(minutes / 60) % 12 || 12) + ':' + String(minutes % 60).padStart(2, '0');
    },
    document: { getElementById: () => null },
    window: {
      refresh: async () => {},
      kzyCalendar: { events: async () => [] }
    }
  };
  vm.runInNewContext(testSource, sandbox, { filename: 'weekday-planner.js' });
  await sandbox.window.__testPlanner.buildWeekdayPlan();
  function mincha(day) {
    // Grouped weekday rows replace their individual source with the
    // "matching times" grouping label. Find the actual Mincha section.
    const start = state.weekday.findIndex(r => r.section && r.label === 'מנחה');
    const end = state.weekday.findIndex((r, i) => i > start && r.section && r.label === 'מעריב');
    const row = state.weekday.slice(start + 1, end).find(r => r.dayNames?.includes(day));
    assert.ok(row, 'Missing ' + day + ' Mincha');
    return row.time.split(' · ');
  }
  return { state, mincha };
}

async function main() {
  // The previous week (Oct 11–16) had the missing 1:45 issue.
  const previous = await fixture({ friday: '2026-10-09' });
  for (const day of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']) {
    assert.ok(previous.mincha(day).includes('1:45'), day + ' must retain regular 1:45');
  }
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday']) {
    const times = previous.mincha(day);
    assert.ok(times.includes('1:15'), day + ' must also include eligible kollel 1:15');
    assert.ok(times.indexOf('1:15') < times.indexOf('1:45'), 'early times chronological');
    assert.equal(new Set(times).size, times.length, 'no duplicated Mincha');
  }

  const upcoming = await fixture({ friday: '2026-10-16' });
  for (const day of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']) {
    const times = upcoming.mincha(day);
    assert.ok(times.includes('1:15'), day + ' kollel active');
    assert.ok(times.includes('1:45'), day + ' regular time kept');
    assert.equal(new Set(times).size, times.length);
  }

  const out = await fixture({
    friday: '2026-10-16',
    manualDays: { '2026-10-19': { kollelInSession: false } }
  });
  assert.ok(!out.mincha('Monday').includes('1:15'), 'kollel out of session');
  assert.ok(out.mincha('Monday').includes('1:45'), 'regular minyan continues');

  const tooEarly = await fixture({
    friday: '2026-10-16',
    earlyMinchaGedolaDates: { '2026-10-20': 'T17:15:00.001Z' }
  });
  assert.ok(!tooEarly.mincha('Tuesday').includes('1:15'), 'kollel start before exact Mincha Gedola must be omitted');
  assert.ok(tooEarly.mincha('Tuesday').includes('1:45'), 'regular minyan remains');
  const boundary = await fixture({
    friday: '2026-10-16',
    earlyMinchaGedolaDates: { '2026-10-20': 'T17:15:00.000Z' }
  });
  assert.ok(boundary.mincha('Tuesday').includes('1:15'), '1:15 precisely at Mincha Gedola qualifies');
  assert.ok(boundary.mincha('Tuesday').includes('1:45'));

  const winter = await fixture({ friday: '2026-10-30', manualDays: { '2026-11-02': { kollelInSession: false, minchaCustom: '4:20' } } });
  for (const day of ['Sunday','Monday','Tuesday','Wednesday','Thursday']) {
    assert.equal(winter.mincha(day)[0], '12:45', 'standard-time Mincha is first');
    assert.ok(winter.mincha(day).includes('1:45'), 'regular Mincha preserved');
  }
  assert.ok(winter.mincha('Monday').includes('4:20'), 'later override preserved');
  assert.ok(!winter.mincha('Monday').includes('1:15'), 'kollel setting preserved');
  for (const friday of ['2026-10-23','2027-03-12']) {
    const daylight = await fixture({ friday });
    assert.ok(!daylight.mincha('Sunday').includes('12:45'), 'no additional Mincha during daylight time');
  }
  console.log('Kollel Mincha additive regression passed for Oct 11, Oct 18, out of session and exact Mincha Gedola boundaries.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
