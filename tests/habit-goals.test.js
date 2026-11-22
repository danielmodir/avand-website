const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '../frontend/demo/js/core');
const context = vm.createContext({Cloud:{},state:{settings:{weekStartDay:'saturday',calendarSystem:'jalali'}}});
for(const file of ['dates.js','calendars.js','habit-goals.js']){
  const code = fs.readFileSync(path.join(root,file),'utf8');
  vm.runInContext(code, context);
}
const on = key => new Date(...key.split('-').map((n,i)=>i===1 ? Number(n)-1 : Number(n)));

test('weekly streak counts successful weeks, not off days or an unfinished week', () => {
  context.habitOccursOnDate = () => true;
  const h = {startDate:'2026-11-07',completedDates:['2026-11-07','2026-11-09','2026-11-12','2026-11-14','2026-11-16','2026-11-19'],goal:{period:'weekly',target:3}};
  const s = context.habitGoalStats(h,on('2026-11-22'));
  assert.equal(s.currentStreak,2);
  assert.equal(s.bestStreak,2);
  assert.equal(s.current.done,0);
  assert.equal(s.current.complete,false);
  assert.deepEqual(Array.from(s.periods, p=>p.complete),[true,true,false]);
});

test('a historical edit recalculates the affected weekly streak', () => {
  context.habitOccursOnDate = () => true;
  const h = {startDate:'2026-11-07',completedDates:['2026-11-07','2026-11-09','2026-11-12','2026-11-14','2026-11-16','2026-11-19'],goal:{period:'weekly',target:3}};
  h.completedDates.splice(h.completedDates.indexOf('2026-11-16'),1);
  assert.equal(context.habitGoalStats(h,on('2026-11-22')).currentStreak,0);
});

test('daily streak ignores days without an obligation and never counts before creation', () => {
  context.habitOccursOnDate = (_h,d)=>[1,3,5].includes(d.getDay());
  const h = {startDate:'2026-11-16',completedDates:['2026-11-16','2026-11-18','2026-11-20']};
  const s = context.habitGoalStats(h,on('2026-11-22'));
  assert.equal(s.currentStreak,3);
  assert.equal(s.evaluated,3);
  assert.equal(s.successRate,1);
});

test('monthly goal follows the selected Jalali month boundary', () => {
  context.habitOccursOnDate = () => true;
  const h = {startDate:'2026-10-23',completedDates:['2026-10-23','2026-11-10','2026-11-20'],goal:{period:'monthly',target:3}};
  const s = context.habitGoalStats(h,on('2026-11-22'));
  assert.equal(s.current.done,0);
  assert.equal(s.current.target,3);
});

test('future and after-end checkmarks never inflate totals', () => {
  context.habitOccursOnDate = () => true;
  const h={startDate:'2026-11-01',endDate:'2026-11-20',completedDates:['2026-11-10','2026-11-21','2026-12-01']};
  assert.equal(context.habitGoalStats(h,on('2026-11-22')).totalDone,1);
});

test('counter and timer totals use recorded values within the habit lifetime', () => {
  const h={startDate:'2026-11-01',endDate:'2026-11-20',progress:{'2026-10-31':7,'2026-11-10':3,'2026-11-19':4,'2026-11-21':8}};
  assert.equal(context.habitTotalValue(h,on('2026-11-22')),7);
});

test('calendar views aggregate actual records even when view differs from goal period', () => {
  context.habitOccursOnDate=()=>true;
  context.state.settings.calendarSystem='gregorian';
  const h={startDate:'2026-11-01',completedDates:['2026-11-07','2026-11-09','2026-11-12'],goal:{period:'weekly',target:3}};
  const week=context.habitCalendarProgress(h,'weekly',on('2026-11-10'),on('2026-11-22'));
  assert.equal(week.done,3);
  assert.equal(week.target,3);
  const month=context.habitCalendarProgress(h,'monthly',on('2026-11-10'),on('2026-11-22'));
  assert.equal(month.done,3);
  assert.equal(month.target,22);
});
