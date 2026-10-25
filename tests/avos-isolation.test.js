'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { carryOver } = require('../announcement-recurrence.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'weekly-sheet.js'), 'utf8');
function extract(begin, end) {
  const startIndex = source.indexOf(begin);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex !== -1 && endIndex > startIndex, 'Production function not found: ' + begin);
  return source.slice(startIndex, endIndex);
}
const syncSource = extract('  async function refreshAvosSponsorship() {', '  function scheduleHTML(rows) {');
const restoreSource = extract('  const emptyDraft = () =>', '  function loadDraft(key) {');
const localISO = date => date.toISOString().slice(0, 10);
function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
const recurring = {
  title: 'Avos Ubanim',
  body: 'Regular Avos Ubanim information',
  names: '', subtitle: 'Following Mincha',
  visible: true, repeatWeekly: true, recurrenceId: 'weekly-shalosh-info'
};
function createDraft() {
  const previous = { announcements: [{ ...recurring }], dismissedRecurrenceIds: [] };
  const draft = { announcements: [], dismissedRecurrenceIds: [] };
  assert.equal(carryOver(draft, previous), 1);
  return draft;
}
function createContext(draft, booking) {
  let bookingResponse = booking;
  let calls = 0;
  let saved = 0;
  const sponsorStatus = { textContent: '', classList: { add() {}, remove() {} } };
  const sandbox = {
    draft, currentWeek: '2026-10-16', avosRequest: 0,
    state: { friday: new Date('2026-10-16T12:00:00Z') },
    SPONSORSHIP_ORIGIN: 'https://fixture.invalid',
    localISO, addDays,
    document: { getElementById: id => {
      assert.equal(id, 'avosBookingStatus');
      return sponsorStatus;
    }},
    fetch: async (url, options) => {
      calls++;
      assert.ok(url.includes('week=2026-10-17'), 'uses correct Shabbos booking');
      assert.equal(options.credentials, 'omit');
      return { ok: true, json: async () => ({ sponsorship: bookingResponse }) };
    },
    drawEditor: () => {}, save: () => { saved++; }
  };
  vm.runInNewContext(syncSource + '\nthis.syncSponsor = refreshAvosSponsorship;', sandbox);
  return {
    sandbox, sponsorStatus, sync: () => sandbox.syncSponsor(),
    setBooking: value => { bookingResponse = value; },
    get calls() { return calls; },
    get saves() { return saved; }
  };
}

async function main() {
  const original = createDraft();
  const sponsor = { week: '2026-10-17', sponsorName: 'The New Sponsor',
    dedication: 'In honor of the family', contactName: 'Private contact', email: 'secret@example.com' };
  const ctx = createContext(original, sponsor);
  await ctx.sync();
  assert.equal(original.announcements.length, 2, 'ordinary recurring entry survives, sponsor separate');
  assert.equal(original.announcements[0].bookingWeek, '2026-10-17', 'new sponsor at top');
  assert.equal(original.announcements[0].names, 'The New Sponsor');
  assert.equal(original.announcements[0].body, 'In honor of the family');
  assert.equal(original.announcements[0].repeatWeekly, false, 'sponsor must never recur');
  assert.equal(original.announcements[0].recurrenceId, undefined);
  assert.equal(original.announcements[1].recurrenceId, 'weekly-shalosh-info');
  assert.equal(original.announcements[1].body, recurring.body);
  assert.equal(original.announcements[1].subtitle, recurring.subtitle);
  assert.ok(!JSON.stringify(original).includes('secret@example.com'), 'private email never copied to sheet');
  assert.ok(!JSON.stringify(original).includes('Private contact'), 'private contact never copied');

  // Refresh same booking - no duplicate, recurring stays unchanged.
  await ctx.sync();
  assert.equal(original.announcements.length, 2);
  assert.equal(original.announcements.filter(a => a.bookingWeek).length, 1);
  assert.equal(original.announcements.filter(a => a.recurrenceId === 'weekly-shalosh-info').length, 1);

  // Week-specific edits to sponsorship remain, while unedited fields resync.
  const booked = original.announcements[0];
  booked.body = 'Custom dedication text';
  booked.subtitle = 'Special this week';
  booked.visible = false;
  original.announcements.push(...original.announcements.splice(0, 1)); // custom order
  ctx.setBooking({ week: '2026-10-17', sponsorName: 'Updated sponsor name',
    dedication: 'Updated dedication' });
  await ctx.sync();
  assert.equal(original.announcements.length, 2);
  const newBooking = original.announcements.find(a => a.bookingWeek);
  assert.equal(newBooking.body, 'Custom dedication text', 'manually customized dedication preserved');
  assert.equal(newBooking.names, 'Updated sponsor name', 'unedited name updates');
  assert.equal(newBooking.subtitle, 'Special this week');
  assert.equal(newBooking.visible, false);
  assert.equal(original.announcements[1].bookingWeek, '2026-10-17', 'saved order preserved');
  assert.equal(original.announcements[0].body, recurring.body);

  // Cancelled booking removes ONLY matched sponsorship.
  ctx.setBooking(null);
  await ctx.sync();
  assert.equal(original.announcements.length, 1);
  assert.equal(original.announcements[0].title, 'Avos Ubanim');
  assert.equal(original.announcements[0].recurrenceId, 'weekly-shalosh-info');
  assert.equal(original.announcements[0].body, recurring.body);

  // No booked sponsor: ordinary Avos Ubanim recurring content unaffected.
  const noSponsor = createDraft();
  const noCtx = createContext(noSponsor, null);
  await noCtx.sync();
  assert.equal(noSponsor.announcements.length, 1);
  assert.equal(noCtx.saves, 0, 'no unrelated records modified');

  // A preexisting standalone Avos Ubanim entry without a recurrence checkbox
  // must likewise not be converted into a sponsorship.
  const legacy = { announcements: [{ title: 'AVOS UBANIM', body: 'Community notice', visible: true }] };
  const legacyCtx = createContext(legacy, sponsor);
  await legacyCtx.sync();
  assert.equal(legacy.announcements.length, 2);
  assert.equal(legacy.announcements[1].body, 'Community notice');
  assert.equal(legacy.announcements[1].bookingWeek, undefined);

  // If a previously synced sponsor somehow has legacy repeat flags, clear them.
  const erroneous = { announcements: [{
    ...recurring, title: 'AVOS UBANIM', bookingWeek: '2026-10-17', bookingProgram: 'avos',
    bookingValues: { title: 'AVOS UBANIM', body: 'old', names: 'old' },
    bookingTopDefault: true
  }] };
  await createContext(erroneous, sponsor).sync();
  assert.equal(erroneous.announcements.length, 1);
  assert.equal(erroneous.announcements[0].repeatWeekly, false);
  assert.equal(erroneous.announcements[0].recurrenceId, undefined);

  // Normalization of a previously saved booking must never carry a repeat id.
  const restore = {};
  vm.runInNewContext(restoreSource + '\nthis.validDraft = validDraft;', restore);
  const recovered = restore.validDraft({ announcements: [
    { title: 'AVOS UBANIM', bookingWeek: '2026-10-17', bookingProgram: 'avos',
      repeatWeekly: true, recurrenceId: 'bad-sponsor-recurring' },
    { ...recurring }
  ] });
  assert.equal(recovered.announcements[0].repeatWeekly, false);
  assert.equal(recovered.announcements[0].recurrenceId, undefined);
  assert.equal(recovered.announcements[1].repeatWeekly, true);
  assert.equal(recovered.announcements[1].recurrenceId, 'weekly-shalosh-info');

  const both={announcements:[{title:'SHALOSH SEUDOS',names:'SS sponsor',bookingWeek:'2026-10-17',visible:true}]};
  const bothCtx=createContext(both,sponsor);await bothCtx.sync();assert.equal(both.announcements.length,2);
  bothCtx.setBooking(null);await bothCtx.sync();assert.equal(both.announcements.length,1);assert.equal(both.announcements[0].names,'SS sponsor');
  console.log('Sponsor sync is isolated from recurring and custom Avos Ubanim content; edits and cancellations preserved.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
