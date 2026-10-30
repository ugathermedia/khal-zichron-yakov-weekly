const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../weekly-sheet.js'), 'utf8');
const code = source.slice(source.indexOf('  function weeklyAnnouncements('), source.indexOf('  function announcementDetailsHTML('));
const ctx = {}; vm.runInNewContext(code, ctx);
const pizza = 'Pizza is dedicated לז״נ צירל בת ר׳ מרדכי.';
const original = [{title:'AVOS UBANIM', body:'Family dedication', names:'Anonymous', subtitle:'', visible:true, bookingProgram:'avos'}, {title:'SHALOSH SEUDOS', body:'Unchanged', names:'Family', visible:true}];
const before = JSON.stringify(original);
for (const date of ['2026-10-31','2026-11-07','2027-02-27']) {
 const rows = ctx.weeklyAnnouncements(original,date);
 assert.equal(rows[0].body,'Family dedication\n\n'+pizza);
 assert.equal(rows[0].names,'Anonymous');
 assert.equal(rows[1].body,'Unchanged');
 assert.equal(JSON.stringify(original),before,'rendering must not change stored dedications');
 assert.equal(ctx.weeklyAnnouncements(rows,date)[0].body,rows[0].body,'no duplicate line');
 assert.equal(ctx.weeklyAnnouncements([],date)[0].body,pizza,'pizza dedication appears even without a booking');
}
for (const date of ['2026-10-24','2027-03-06']) assert.equal(ctx.weeklyAnnouncements([],date).length,0);
console.log('Weekly-only pizza dedication, blank weeks, season boundaries, nonmutation and deduplication passed.');
const renderCode = source.slice(source.indexOf('  function announcementDetailsHTML('), source.indexOf('  function fitZone('));
ctx.esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
vm.runInNewContext(renderCode, ctx);
const html = ctx.announcementDetailsHTML({title:'AVOS UBANIM',names:'Sponsor',bookingWeek:'2026-10-31',body:'לעילוי נשמת\n\n'+pizza});
assert.ok(html.includes('<bdi dir="ltr">Pizza is dedicated <bdi dir="rtl">לז״נ צירל בת ר׳ מרדכי</bdi>.</bdi>'));
assert.ok(html.includes('לעילוי נשמת'));
