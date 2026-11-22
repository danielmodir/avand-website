const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../frontend/demo/components/workspace/workspace.js'), 'utf8');

test('planning desk omits habits while the habit desk shows the same records', () => {
  const habit = {id:'habit-1', title:'Read'};
  const context = vm.createContext({
    window:{innerWidth:1280},
    state:{guest:false, habits:[habit], settings:{prefs:{}}, activeDesktopIndex:0, desktopTitleMenuOpen:false},
    pref:key => key === 'occasionsEnabled' ? false : true,
    periodViews:()=>[], groupsAvailable:()=>false,
    t:key=>key, dig:String,
    renderHomeCalWidget:()=>'',
    dateKey:()=> '2026-11-22',
    itemsForDate:()=>({tasks:[],habits:[habit],events:[]}),
    taskStatusOn:()=>null,
    renderItemSections:(_tasks, habits)=>`<planning-habits>${habits.map(h=>h.id).join(',')}</planning-habits>`,
    renderHabitsSection:habits=>`<habit-list>${habits.map(h=>h.id).join(',')}</habit-list>`,
    habitRow:(h,d)=>{assert.ok(d instanceof Date); return `<habit-row>${h.id}</habit-row>`;},
    habitGoalStats:()=>({currentStreak:2,bestStreak:4,successRate:0.75,totalDone:8,current:{done:2,target:3}}),habitTracker:()=>null,
    escapeAttr:String, escapeHtml:String,
    ICONS:{chevronLeft:'',chevronRight:''},
    syncPeriodDeskOnCalendar:()=>{}
  });
  vm.runInContext(source, context);
  const html = context.renderDesktops(new Date(2026,10,22), {tasks:[],habits:[habit],events:[]});
  assert.match(html, /<planning-habits><\/planning-habits>/);
  assert.doesNotMatch(html, /stat-ring-habits|habit-color/);
  assert.match(html, /<habit-row>habit-1<\/habit-row>/);
  assert.deepEqual(Array.from(context.deskKeys()), ['planning', 'habitsDesktop']);
});

test('habit desk lists every habit and keeps today separate from other days', () => {
  const todayHabit = {id:'today',title:'Today'};
  const otherHabit = {id:'other',title:'Other'};
  const context = vm.createContext({
    state:{habits:[todayHabit, otherHabit],settings:{prefs:{}}},
    itemsForDate:()=>({habits:[todayHabit]}),
    dateKey:()=> '2026-11-22', t:key=>key, dig:String,
    habitRow:(h,d)=>{assert.ok(d instanceof Date); return `<habit-row>${h.id}</habit-row>`;},
    habitGoalStats:()=>({currentStreak:2,bestStreak:4,successRate:0.75,totalDone:8,current:{done:2,target:3}}),habitTracker:()=>null,
    escapeAttr:String, escapeHtml:String,
  });
  vm.runInContext(source, context);
  const html = context.renderHabitDesk(new Date(2026,10,22), [todayHabit]);
  assert.match(html, /<habit-row>today<\/habit-row>/);
  assert.match(html, /data-id="other"/);
  assert.match(html, /habitCurrentStreak.*2/);
  assert.equal((html.match(/<habit-row>today<\/habit-row>/g) || []).length, 1);
});

test('habit progress calendar exposes daily, weekly and monthly views', () => {
  const d = new Date(2026,10,22);
  const h = {id:'habit',title:'Exercise',completedDates:['2026-11-22'],startDate:'2026-11-01',progress:{}};
  const dayKey = day => `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
  const addDays = (day,n) => new Date(day.getFullYear(),day.getMonth(),day.getDate()+n);
  const c=vm.createContext({state:{settings:{calendarSystem:'gregorian'}},dateKey:dayKey,addDays,
    startOfWeek:day=>addDays(day,-day.getDay()),dayLabel:day=>dayKey(day),displayMonthYear:day=>dayKey(day),
    habitOccursOnDate:()=>true,habitProgressMap:()=>({}),habitPeriodBounds:(day,period)=>({start:day,end:addDays(day,period==='weekly'?6:29)}),
    habitCalendarProgress:()=>({done:1,target:3,required:3,complete:false,closed:false}),t:key=>key,dig:String,escapeAttr:String,escapeHtml:String});
  vm.runInContext(source,c);
  for(const mode of ['daily','weekly','monthly']){
    const html=c.habitCalendarHtml(h,d,mode);
    assert.match(html,/habit-cal-cell/);
    assert.match(html,new RegExp(`data-mode="${mode}"`));
  }
});
