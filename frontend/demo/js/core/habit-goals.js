/* Habit goals are derived from the existing daily log. A legacy habit is
   a one-check-per-scheduled-day goal; no log is migrated or rewritten. */
function habitGoalFor(h){
  const g = h && h.goal;
  const limits = {daily:1,weekly:7,monthly:31};
  if(g && Object.prototype.hasOwnProperty.call(limits,g.period) && Number.isInteger(g.target) && g.target >= 1 && g.target <= limits[g.period])
    return g;
  return {period:'daily', target:1};
}

function habitTotalValue(h,todayDate){
  const map = h.groupId ? habitProgressMap(h) : (h.progress || {});
  const todayKey = dateKey(todayDate);
  return Object.keys(map).reduce((sum,key) => {
    if(key < h.startDate || key > todayKey || (h.endDate && key > h.endDate)) return sum;
    const value = Number(map[key]);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  },0);
}

function habitMonthIdentity(d){
  const y = d.getFullYear(), m = d.getMonth()+1, day = d.getDate();
  const system = state.settings.calendarSystem;
  if(system === 'hijri') { const h = toHijri(y,m,day); return `${h.hy}-${h.hm}`; }
  if(system === 'gregorian') return `${y}-${m}`;
  const j = toJalali(y,m,day); return `${j.jy}-${j.jm}`;
}

function habitPeriodBounds(d, period){
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if(period === 'weekly'){
    const first = startOfWeek(start);
    return {start:first, end:addDays(first,6)};
  }
  if(period === 'monthly'){
    const identity = habitMonthIdentity(start);
    let first = start, last = start;
    while(habitMonthIdentity(addDays(first,-1)) === identity) first = addDays(first,-1);
    while(habitMonthIdentity(addDays(last,1)) === identity) last = addDays(last,1);
    return {start:first,end:last};
  }
  return {start,end:start};
}

function habitCalendarProgress(h,period,d,todayDate){
  const bounds = habitPeriodBounds(d,period);
  const todayKey = dateKey(todayDate);
  const doneDates = new Set(h.completedDates || []);
  let required = 0, done = 0;
  for(let day=bounds.start; dateKey(day) <= dateKey(bounds.end) && dateKey(day) <= todayKey; day=addDays(day,1)){
    const key = dateKey(day);
    if(key < h.startDate || (h.endDate && key > h.endDate) || !habitOccursOnDate(h,day)) continue;
    required++;
    if(doneDates.has(key)) done++;
  }
  const goal = habitGoalFor(h);
  const target = goal.period === period ? goal.target : required;
  const closed = dateKey(bounds.end) < todayKey || !!(h.endDate && h.endDate < todayKey && h.endDate <= dateKey(bounds.end));
  return {done,target,required,closed,complete:target > 0 && done >= target && (goal.period === period || closed)};
}

function habitGoalStats(h, todayDate){
  const goal = habitGoalFor(h);
  const todayKey = dateKey(todayDate);
  const firstKey = h.startDate;
  if(!firstKey || firstKey > todayKey) return {current:{done:0,target:goal.target,complete:false},currentStreak:0,bestStreak:0,evaluated:0,successRate:null,totalDone:0,periods:[]};
  const done = new Set((h.completedDates || []).filter(k => k >= firstKey && k <= todayKey && (!h.endDate || k <= h.endDate)));
  const lastKey = h.endDate && h.endDate < todayKey ? h.endDate : todayKey;
  const periods = [];
  let cursor = parseDateKey(firstKey);
  while(dateKey(cursor) <= lastKey && periods.length < 20000){
    const {start,end} = habitPeriodBounds(cursor, goal.period);
    let achieved = 0, required = 0;
    for(let day = start; dateKey(day) <= dateKey(end) && dateKey(day) <= lastKey; day = addDays(day,1)){
      const key = dateKey(day);
      if(key < firstKey || (h.endDate && key > h.endDate) || !habitOccursOnDate(h,day)) continue;
      required++;
      if(done.has(key)) achieved++;
    }
    if(required) periods.push({start:dateKey(start),end:dateKey(end),done:achieved,target:goal.target,complete:achieved >= goal.target,closed:dateKey(end) < todayKey || !!(h.endDate && dateKey(end) >= h.endDate && h.endDate < todayKey)});
    cursor = addDays(end,1);
  }
  let bestStreak = 0, run = 0, evaluated = 0, successful = 0;
  for(const p of periods){
    if(p.complete){run++; bestStreak = Math.max(bestStreak,run); successful++; evaluated++;}
    else if(p.closed){run=0; evaluated++;}
  }
  const currentStreak = run;
  const current = periods[periods.length - 1] || {done:0,target:goal.target,complete:false};
  return {current,currentStreak,bestStreak,evaluated,successRate:evaluated ? successful/evaluated : null,totalDone:done.size,periods};
}
