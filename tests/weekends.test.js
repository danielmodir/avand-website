const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ctx=vm.createContext({state:{settings:{weekStartDay:'saturday',prefs:{}}},pref:k=>!!ctx.state.settings.prefs[k],escapeAttr:s=>s,t:k=>k});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/demo/js/core/dates.js'),'utf8'),ctx);
test('weekend selection supports multiple days and is independent of week start',()=>{
  assert.equal(ctx.isWeekendOn(new Date(2026,10,20)),false);
  ctx.state.settings.prefs={weekendFriday:true,weekendThursday:true};
  assert.equal(ctx.isWeekendOn(new Date(2026,10,20)),true);
  assert.equal(ctx.isWeekendOn(new Date(2026,10,19)),true);
  assert.equal(ctx.isWeekendOn(new Date(2026,10,21)),false);
  ctx.state.settings.weekStartDay='monday';
  assert.equal(ctx.isWeekendOn(new Date(2026,10,20)),true);
  assert.equal(ctx.weekStartIndex(),1);
  ctx.state.settings.prefs={};
  assert.equal(ctx.isWeekendOn(new Date(2026,10,20)),false);
});
test('calendar labels identify weekends beyond their color',()=>{
  ctx.dayLabel=()=> 'Friday';
  ctx.state.settings.prefs={weekendFriday:true};
  assert.equal(ctx.calendarDayAriaLabel(new Date(2026,10,20)),'Friday — weekendDay');
  assert.equal(ctx.calendarDayAriaLabel(new Date(2026,10,19)),'Friday');
});
