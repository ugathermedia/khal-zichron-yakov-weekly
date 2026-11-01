const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const rounding = require('../zmanim-rounding.js');
const ctx = vm.createContext({Date,Intl,window:{ZmanimRounding:rounding}});
vm.runInContext(read('app.js').split("$('#prev').onclick")[0]+'\nglobalThis.api={state,automaticTime,displayRow};',ctx);
vm.runInContext('timeMinutes = value => new Date(value).getTime()/60000;',ctx);
const row={id:571,type:'automatic',text:'מוצאי שבת (72)',minutes:72,offset:'After',from:'Shab. Shkia',roundNearest:null};
for (const [seconds,expected] of [['14','5:56'],['29','5:56'],['30','5:57'],['48','5:57'],['59','5:57']]) {
 ctx.api.state.engine={shabbos:{SeaLevelSunset:`2026-11-07T16:44:${seconds}-05:00`}};
 assert.equal(ctx.api.automaticTime(row),expected);
}
const modes=read('schedule-modes.js');
vm.runInContext(modes.slice(modes.indexOf('  function restoreZmanOverride('),modes.indexOf('  // Replace index-based overrides')),ctx);
const displayed=ctx.api.displayRow(row,'shabbos');
assert.equal(ctx.restoreZmanOverride(displayed,'5:56'),'5:57','repair old truncated snapshot');
assert.equal(ctx.restoreZmanOverride(displayed,'6:00'),'6:00','preserve distinct manual override');
console.log('Imported sunset +72 rounds nearest including :48; saved truncation repaired.');
