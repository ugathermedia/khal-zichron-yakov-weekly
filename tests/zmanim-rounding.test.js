'use strict';
const assert = require('node:assert/strict');
const { roundZmanInstant } = require('../zmanim-rounding.js');

const raw = '2026-10-09T10:11:35.123-04:00';
const upKinds = ['sunrise', 'earliest-talis', 'earliest-mincha', 'nightfall'];
const toIso = date => date?.toISOString();
for (const kind of upKinds) {
  assert.equal(toIso(roundZmanInstant(raw, kind)), '2026-10-09T14:12:00.000Z', kind);
}
for (const kind of ['other', 'sunset', 'shkiah', 'sof-zman-shma', 'plag']) {
  assert.equal(toIso(roundZmanInstant(raw, kind)), '2026-10-09T14:11:00.000Z', kind);
}
assert.equal(toIso(roundZmanInstant('2026-10-09T10:12:00-04:00', 'nightfall')), '2026-10-09T14:12:00.000Z');
assert.equal(toIso(roundZmanInstant('2026-10-09T10:12:00-04:00', 'other')), '2026-10-09T14:12:00.000Z');
assert.equal(toIso(roundZmanInstant('2026-10-09T10:11:00.001-04:00', 'nightfall')), '2026-10-09T14:12:00.000Z');
assert.equal(toIso(roundZmanInstant('2026-10-09T10:11:59.999-04:00', 'other')), '2026-10-09T14:11:00.000Z');
assert.equal(toIso(roundZmanInstant('2026-11-01T01:19:31-05:00', 'sunrise')), '2026-11-01T06:20:00.000Z');
assert.equal(toIso(roundZmanInstant('2026-11-01T01:19:31-05:00', 'other')), '2026-11-01T06:19:00.000Z');
for (const bad of [null, '', 'N/A', 'not a date']) assert.equal(roundZmanInstant(bad, 'sunrise'), null);
console.log('Directed-rounding checks passed: 4 later types, earlier types, exact minute, subsecond, DST, invalid.');
