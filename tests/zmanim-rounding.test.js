'use strict';
const assert = require('node:assert/strict');
const { roundZmanInstant, correctLegacyZmanClock } = require('../zmanim-rounding.js');
const iso = date => date?.toISOString();

// All astronomical categories except Shkiah and Plag use nearest-minute display.
for (const kind of ['sunrise', 'earliest-talis', 'earliest-mincha', 'nightfall', 'sof-zman-shma', 'other']) {
  assert.equal(iso(roundZmanInstant('2026-10-10T19:35:14-04:00', kind)), '2026-10-10T23:35:00.000Z', kind);
  assert.equal(iso(roundZmanInstant('2026-10-10T19:35:29.999-04:00', kind)), '2026-10-10T23:35:00.000Z', kind);
  assert.equal(iso(roundZmanInstant('2026-10-10T19:35:30-04:00', kind)), '2026-10-10T23:36:00.000Z', kind);
  assert.equal(iso(roundZmanInstant('2026-10-10T19:35:59.999-04:00', kind)), '2026-10-10T23:36:00.000Z', kind);
}
// Shkiah and Plag must always floor even with 59.999 seconds remaining.
for (const kind of ['shkiah', 'shkia', 'sunset', 'SeaLevelSunset', 'plag', 'PlagHamincha']) {
  assert.equal(iso(roundZmanInstant('2026-10-09T18:24:48-04:00', kind)), '2026-10-09T22:24:00.000Z', kind);
  assert.equal(iso(roundZmanInstant('2026-10-09T18:24:59.999-04:00', kind)), '2026-10-09T22:24:00.000Z', kind);
  assert.equal(iso(roundZmanInstant('2026-10-09T18:25:00-04:00', kind)), '2026-10-09T22:25:00.000Z', kind);
}
assert.equal(iso(roundZmanInstant('2026-10-10T19:35:00-04:00')), '2026-10-10T23:35:00.000Z');
assert.equal(iso(roundZmanInstant('2026-11-01T01:19:29-05:00')), '2026-11-01T06:19:00.000Z');
assert.equal(iso(roundZmanInstant('2026-11-01T01:19:31-05:00')), '2026-11-01T06:20:00.000Z');
for (const bad of [null, '', 'N/A', 'not a date']) assert.equal(roundZmanInstant(bad), null);

// Legacy saved automatic Tzeis "7:36" now correctly becomes "7:35", and
// other manual entries and exact-minute results remain unchanged.
const tzeis = '2026-10-10T19:35:14-04:00';
assert.equal(correctLegacyZmanClock('7:36', tzeis, 'America/New_York', 'up'), '7:35');
assert.equal(correctLegacyZmanClock('7:35', tzeis, 'America/New_York', 'up'), '7:35');
assert.equal(correctLegacyZmanClock('7:40', tzeis, 'America/New_York', 'up'), '7:40');
assert.equal(correctLegacyZmanClock('7:34', tzeis, 'America/New_York', 'up'), '7:34');
assert.equal(correctLegacyZmanClock('7:35', tzeis, 'America/New_York', 'down'), '7:35');
assert.equal(correctLegacyZmanClock('6:35', '2026-10-10T18:35:50-04:00', 'America/New_York', 'down'), '6:36');
assert.equal(correctLegacyZmanClock('7:35', '2026-10-10T19:35:00-04:00', 'America/New_York', 'up'), '7:35');
assert.equal(correctLegacyZmanClock('7:36', 'not a date', 'America/New_York', 'up'), '7:36');
assert.equal(correctLegacyZmanClock('7:36', tzeis, 'America/Chicago', 'up'), '7:36');
// A persisted nearest-rounded astronomical Shkiah/Plag should be corrected
// without changing unrelated manual overrides or a full-minute sunset.
const sunset = '2026-10-09T18:24:48-04:00';
assert.equal(correctLegacyZmanClock('6:25', sunset, 'America/New_York', 'nearest', 'shkiah'), '6:24');
assert.equal(correctLegacyZmanClock('6:25', sunset, 'America/New_York', 'nearest', 'plag'), '6:24');
assert.equal(correctLegacyZmanClock('6:26', sunset, 'America/New_York', 'nearest', 'shkiah'), '6:26');
assert.equal(correctLegacyZmanClock('6:24', sunset, 'America/New_York', 'nearest', 'shkiah'), '6:24');
assert.equal(correctLegacyZmanClock('6:25', '2026-10-09T18:25:00-04:00', 'America/New_York', 'nearest', 'shkiah'), '6:25');
console.log('Shkiah/Plag floor, nearest-other-zmanim, and saved-auto migration checks passed.');
