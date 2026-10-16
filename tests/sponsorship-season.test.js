const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const calendar = require('./fixtures/sponsorship-calendar.json').weeks;
const source = fs.readFileSync(path.join(__dirname,'../sponsorship-season.js'),'utf8');
const logic = source.slice(source.indexOf('  const START'),source.indexOf('  function shrinkText'))
  .replace(/  const \$[\s\S]*?  const dateUTC/,'  const dateUTC');
const context={window:{kzyCalendar:{events:async()=>require('../calendar-data.json').items}},Intl,Date};
vm.runInNewContext(logic+';this.api={calendarRows,publicSponsor,escapeHTML};',context);
const normalize=s=>s.replace(/Parshas |Shabbos |Chodesh /g,'').trim();
(async()=>{
  const rows=await context.api.calendarRows();
  assert.equal(rows.length,28);
  rows.forEach((r,i)=>{
    assert.equal(r.day,calendar[i].week);
    assert.equal(r.parsha,normalize(calendar[i].parsha));
    assert.equal(new Date(r.day+'T12:00:00Z').getUTCDay(),6);
    for(const label of calendar[i].special) assert.ok(normalize(r.special.join(' · ')).includes(normalize(label)));
  });
  const day=rows[0].day, parse=x=>context.api.publicSponsor(x,day);
  assert.equal(parse({sponsorship:null}),null);
  const sponsor=parse({sponsorship:{week:day,sponsorName:'Anonymous',dedication:'For our parents',email:'private@example.invalid',contactName:'Private contact'}});
  assert.deepEqual(JSON.parse(JSON.stringify(sponsor)),{name:'Anonymous',dedication:'For our parents'});
  assert.equal(parse({sponsorship:{week:day,sponsorName:'Private name',anonymous:true,dedication:''}}).name,'Anonymous');
  for(const x of [{},{sponsorship:{}},{sponsorship:{week:'wrong',sponsorName:'Name',dedication:''}},{sponsorship:false}]) assert.throws(()=>parse(x));
  assert.equal(context.api.escapeHTML('<img onerror="bad">'), '&lt;img onerror=&quot;bad&quot;&gt;');
  console.log('All 28 calendar labels, anonymity, public-field allowlist and invalid records passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
