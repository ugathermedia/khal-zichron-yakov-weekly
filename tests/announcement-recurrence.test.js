'use strict';
const assert = require('node:assert/strict');
const { carryOver, copyPrevious } = require('../announcement-recurrence.js');

function ann(title, extras = {}) {
  return { title, subtitle: '', body: title + ' body', names: '',
    visible: true, repeatWeekly: false, ...extras };
}
function week(announcements = [], dismissedRecurrenceIds = []) {
  return { title: '', announcements, dismissedRecurrenceIds };
}

// Only checked announcements recur; preserve order and independent contents.
const previous = week([
  ann('Torah shiur', { repeatWeekly: true, recurrenceId: 'shiur', visible: false, names: 'Rav A' }),
  ann('One-time event'),
  ann('Weekly seder', { repeatWeekly: true, recurrenceId: 'seder', subtitle: '8 PM' }),
  ann('Sponsored', { repeatWeekly: true, recurrenceId: 'booking', bookingWeek: '2026-10-17' })
]);
const current = week([ann('Current-only', { subtitle: 'Already customized' })]);
assert.equal(carryOver(current, previous), 2);
assert.deepEqual(current.announcements.map(a => a.title),
  ['Current-only', 'Torah shiur', 'Weekly seder']);
assert.equal(current.announcements[1].visible, false);
assert.equal(current.announcements[1].names, 'Rav A');
assert.equal(current.announcements[2].subtitle, '8 PM');
assert.equal(current.announcements[2].repeatWeekly, true);
assert.equal(current.announcements[1].bookingWeek, undefined);

// Simulate revisiting, reloading and editing this week's independent copy.
const reloaded = JSON.parse(JSON.stringify(current));
assert.equal(carryOver(reloaded, previous), 0, 'never duplicate on repeat visits');
reloaded.announcements[1].body = 'Edited for THIS week';
reloaded.announcements[1].visible = true;
reloaded.announcements.reverse(); // reordering remains under user control
assert.equal(previous.announcements[0].body, 'Torah shiur body');
assert.equal(previous.announcements[0].visible, false);
assert.equal(reloaded.announcements[0].title, 'Weekly seder');
assert.equal(carryOver(reloaded, previous), 0);

// Turning Repeat weekly OFF affects future recurrence only, not this week.
reloaded.announcements.find(a => a.recurrenceId === 'shiur').repeatWeekly = false;
const next = week();
assert.equal(carryOver(next, reloaded), 1);
assert.equal(next.announcements[0].title, 'Weekly seder');

// Delete a recurrent copy. It stays deleted after refresh/navigation.
const dismissed = week([], ['shiur']);
assert.equal(carryOver(dismissed, previous), 1);
assert.equal(dismissed.announcements[0].title, 'Weekly seder');
assert.equal(carryOver(dismissed, previous), 0);

// Users with an already-customized current week don't get duplicates or edits.
const custom = week([ann('Weekly seder', { repeatWeekly: true, recurrenceId: 'seder',
  body: 'Current week customization' })]);
assert.equal(carryOver(custom, previous), 1);
assert.equal(custom.announcements[0].body, 'Current week customization');
assert.equal(custom.announcements[1].title, 'Torah shiur');

// Exact-content preexisting manual copies shouldn't be inserted again.
const exactExisting = week([ann('Torah shiur', { repeatWeekly: false, visible: false, names: 'Rav A' })]);
assert.equal(carryOver(exactExisting, previous), 1);
assert.equal(exactExisting.announcements.filter(a => a.title === 'Torah shiur').length, 1);

// Manual copy remains available, but skips already-copied recurring entries.
assert.equal(copyPrevious(current, previous), 1);
assert.deepEqual(current.announcements.map(a => a.title),
  ['Current-only', 'Torah shiur', 'Weekly seder', 'One-time event']);
assert.equal(copyPrevious(current, previous), 1, 'manual copy can still duplicate one-time items intentionally');
assert.equal(current.announcements.filter(a => a.title === 'Torah shiur').length, 1);
assert.equal(current.announcements.filter(a => a.title === 'Sponsored').length, 0);

// Manual copy can re-add a previously dismissed recurrence on explicit request.
const explicitlyCopied = week([], ['shiur']);
assert.equal(copyPrevious(explicitlyCopied, previous), 3);
assert.deepEqual(explicitlyCopied.dismissedRecurrenceIds, []);
assert.equal(carryOver(explicitlyCopied, previous), 0);

// No recurrence without a checked option or stable ID.
const defaults = week([ann('Old one-time text')]);
assert.equal(carryOver(week(), defaults), 0);

console.log('Weekly recurrence: carryover, edit independence, visibility, sorting, deletion, sponsorship and manual copying passed.');
