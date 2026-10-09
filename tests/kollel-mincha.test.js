'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { roundZmanInstant } = require('../zmanim-rounding');
const storage = new Map();
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const date = s => new Date(s+'T12:00:00');
let earliest = '2026-10-12T13:10:26-04:00';
const context = {
  Date, Intl, Map, Set, console, localISO: iso, LOCATION: {timeZoneId:'America/New_York'},
  state: {friday:date('2026-10-09'),weekday:[]},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  window:{kzyCalendar:{events:async()=>[]}},
  addDays:(d,n)=>{const r=new Date(d);r.setDate(r.getDate()+n);return r;},
  getZmanim:()=>({MinchaGedola:earliest,SeaLevelSunrise:'2026-10-12T07:05:00-04:00',SeaLevelSunset:'2026-10-12T18:15:00-04:00'}),
  clockFromLocalMinutes:m=>`${Math.floor(m/60)%12||12}:${String(m%60).padStart(2,'0')}`,
  fmtDateTime:(v,t)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(roundZmanInstant(v,t)).replace(/ [AP]M/,'')
};
const source=fs.readFileSync(require.resolve('../weekday-planner.js'),'utf8');
vm.runInNewContext(source.slice(0,source.indexOf('  const baseRefresh = window.refresh;'))+'window.test = {kollelCalendar, kollelMincha, buildWeekdayPlan, combinedMinchaTimes};})();',context);
const {kollelMincha,kollelCalendar,buildWeekdayPlan,combinedMinchaTimes}=context.window.test;
const monday=date('2026-10-12');
assert.equal(kollelMincha(date('2026-10-11')).time,'');
assert.equal(kollelMincha(monday).time,'1:15');
for(const [raw,expected] of [['13:14:59','1:15'],['13:15:00','1:15'],['13:15:00.001',''],['13:15:01','']]) {
  earliest='2026-10-12T'+raw+'-04:00';assert.equal(kollelMincha(monday).time,expected,raw);
}
for(const missing of [null,'N/A','bad']) {earliest=missing;assert.equal(kollelMincha(monday).time,'');}
earliest='2026-10-12T13:10:26-04:00';
assert.equal(kollelMincha(monday,{kollelInSession:false}).time,'');
assert.equal(kollelMincha(date('2026-10-11'),{kollelInSession:true}).time,'1:15');
assert.equal(kollelMincha(date('2026-10-16'),{kollelInSession:true}).time,'');
assert.equal(kollelMincha(date('2026-10-17'),{kollelInSession:true}).time,'');
// Hebrew boundaries in leap year 5787 and the following Elul/Tishrei.
for(const [day,active] of [['2027-04-07',true],['2027-04-08',false],['2027-05-07',false],['2027-05-08',true],['2027-08-11',true],['2027-08-12',false],['2027-09-02',false],['2027-09-03',true],['2027-10-09',true],['2027-10-10',false],['2027-10-31',false],['2027-11-01',true]]) {
  assert.equal(kollelCalendar(date(day)).inSession,active,day);
}
assert.equal(kollelMincha(date('2027-06-11'),{kollelInSession:true}).time,''); // Shavuos / Friday
assert.equal(kollelCalendar(date('2026-05-23')).yomTov,true);
assert.equal(combinedMinchaTimes('1:45','1:15','6:00'),'1:15 · 1:45 · 6:00');
assert.equal(combinedMinchaTimes('1:15','1:15','6:00'),'1:15 · 6:00');
(async()=>{
  await buildWeekdayPlan();
  const rows=context.state.weekday;
  const start=rows.findIndex(r=>r.section&&r.label==='מנחה');
  const end=rows.findIndex(r=>r.section&&r.label==='מעריב');
  const mincha=rows.slice(start+1,end);
  assert.equal(mincha.length,2);
  assert.equal(mincha[0].dayNames.join(','),'Sunday');
  assert.equal(mincha[0].time,'1:45 · 6:00');
  assert.equal(mincha[1].dayNames.join(','),'Monday,Tuesday,Wednesday,Thursday');
  assert.equal(mincha[1].time,'1:15 · 1:45 · 6:00');
  storage.set('kzy-weekly:weekday-plan:2026-10-09',JSON.stringify({days:{'2026-10-13':{kollelInSession:false}}}));
  await buildWeekdayPlan();
  assert.equal(context.state.weekdayPlannerMeta.find(d=>d.key==='tue').kollel.time,'');
  console.log('Kollel checks passed: Hebrew boundaries, exact seconds, missing data, overrides, weekdays, chronological times and partial-week grouping.');
})().catch(e=>{console.error(e);process.exitCode=1;});
