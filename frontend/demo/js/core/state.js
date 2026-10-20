const state = {
  calMode: 'month',       // month | week
  calCursor: new Date(today),
  calFull: false, calFullCursor: null, // full-screen month view (calendar.js renderCalFull)
  selectedDate: new Date(today),
  daySheetOpen: false,
  daySheetDate: new Date(today),
  navExpanded: false,   // true while the FAB's Task/Habit/Event mini-menu is open
  menuPanelOpen: false, // true while the Menu overlay/side-panel is open
  menuMaximized: false, // desktop-only: full-height panel vs the inset card
  popupOpen: false,
  popupType: null,
  // Which میزکار desktop pane (occasions/planning/period) is currently
  // shown — persisted so a re-render (which rebuilds the pager's whole
  // DOM) doesn't snap it back to pane 0.
  activeDesktopIndex: 0,
  monthDropdownOpen: false,
  yearDropdownOpen: false,
  /* Tapping a *secondary* (non-primary) calendar system's month/year in
     the cal-subrow opens the same kind of dropdown the primary label
     gets, but scoped to that one system — kind: 'month'|'year'|null,
     sys: 'gregorian'|'jalali'|'hijri'|null, home: which widget (desktop
     calendar vs. the mobile/home one) it belongs to. */
  secDropdown: { kind: null, sys: null, home: false },
  desktopTitleMenuOpen: false,
  expandedTasks: {}, // task id -> true while its subtask list is shown
  selection: null,   // { type: 'task'|'subtask'|'habit', id } while a row is selected (glow + menu)
  editingId: null,
  editingParentId: null, // parent task id while the popup edits a subtask
  sectionExpanded: { tasks:false, habits:false, events:false },
  /* Mobile-only (<960px): a non-empty section is shown by default, this
     only tracks the user manually collapsing it — opposite default from
     sectionExpanded above (desktop's "show more than the preview limit"),
     so it's its own key rather than overloading that one. */
  sectionCollapsed: { tasks:false, habits:false, events:false },
  popupSubView: null,   // null | 'calendar' | 'repeat' | 'notification'
  rangeDragStart: null,
  menuSubView: null,
  homeDate: new Date(today),
  authScreen: false,
  guest: false,      // backend configured but signed out: browse-only, see GUEST_ACTIONS
  authOpen: false,   // the sign-in popup (components/auth/auth.js)
  authReason: null,  // i18n key for the popup's subtitle when an action asked for an account
  authTab: 'login',
  booting: false,  // true only while boot() is verifying a saved session
  bootError: null, // 'offline' | 'server' when that check failed for a non-auth reason
  /* Starts empty: no placeholder person. Without a backend the person
     fills it in themselves and it is kept on this device (local-store.js);
     with one it comes from their account. */
  profile: {
    name: '', firstName: '', lastName: '', username: '',
    email: '', phone: '', gender: '', dob: '', photo: null,
    userId: genUserId()
  },
  settings: { notifications: true, weekStartDay: 'saturday', showAddMenuLabels: true, language: 'fa', calendarSystem: 'jalali', calendarEnabled: { gregorian: true, jalali: true, hijri: true }, planningEnabled: true,
    theme: null, palette: 'toojibee', prefs: {} },
  /* Admin-editable "About us" text, per language. Empty string means
     "use the default aboutDesc translation" — renderAboutPage() falls
     back to t('aboutDesc') until an admin actually fills this in. */
  aboutText: { fa: '', en: '' },
  tasks: [],
  habits: [],
  events: [],
  /* Real connections (demo/cloud.js: a `connections` table + SECURITY
     DEFINER RPCs, not client-trusted writes) — loaded via
     refreshConnections() when the Friends page opens, not at boot, since
     this is the one part of state loadFromCloud() doesn't fetch eagerly.
     status: 'pending-outgoing' | 'pending-incoming' | 'accepted' |
     'blocked' | 'blocked-by-them' (search results, not in this list yet,
     have no status field at all). */
  connections: [],
  inviteToken: null, // my personal invite link's code (Friends page)
  friendSearch: '',
  friendSearchResults: [],
  friendSearchBusy: false,
  /* Feature Marketplace (Store) — client-side only, no real purchase or
     entitlement system exists in this prototype. kind: 'toggle' | 'locked'
     | 'premium'. Empty for now by explicit product decision — the Store
     page still renders (with an empty state) so it's ready for real
     features later. */
  store: [],
  /* Period tracking (Management, shown only when profile.gender ===
     'female'). step 0 = not started; 1-3 = the setup quiz questions;
     'done' = predictions computed from the quiz answers below. All dates
     are 'YYYY-MM-DD' strings (dateKey format), all math is approximate —
     this is a wellness estimate, not medical advice. enabled is the
     feature's own on/off master switch, independent of quiz progress;
     calendarReminder is a separate toggle for showing period days in the
     main Calendar (display-only in this prototype — no real reminders). */
  period: {
    enabled: true,
    calendarReminder: false,
    step: 0,
    lastStart: dateKey(addDays(today, -14)),
    cycleLength: 28,
    periodLength: 6
  }
};

/* Starter task for today shown in the no-login demo mode, so the
   subtask expand / auto-check behavior is visible right away. */
function sampleSubtaskTask(){
  const fa = lang() === 'fa';
  const task = {
    id: uid(), title: fa ? 'آماده کردن ارائه' : 'Prepare the presentation',
    category:'', description:'', photos:[], pinned:false, done:false, skipped:false,
    subtasks: [],
    timeMode:'single', date: dateKey(today), endDate:null,
    recurrence:{mode:null, interval:1, weekdays:[]}, notification:{type:null}
  };
  task.subtasks = [
    Object.assign(newSubtask(task, fa ? 'جمع کردن منابع' : 'Gather sources'), { done: true }),
    newSubtask(task, fa ? 'ساختن اسلایدها' : 'Build the slides'),
    // A subtask with its own date range: select it to see the calendar capsule.
    Object.assign(newSubtask(task, fa ? 'تمرین ارائه' : 'Rehearse'), { timeMode: 'range', endDate: dateKey(addDays(today, 3)) }),
  ];
  return task;
}

function seed(){
  state.tasks = [
    { id: uid(), title:'Review math notes', category:'Study', description:'Go over the derivatives chapter and do 10 practice problems.',
      photos:[], pinned:true, done:false,
      subtasks:[],
      timeMode:'single', date: dateKey(today), endDate:null,
      recurrence:{mode:null, interval:1, weekdays:[]},
      notification:{type:'time', time:'18:00', repeatHours:2, text:''} },
    { id: uid(), title:'Buy groceries', category:'Personal', description:'', photos:[], pinned:false, done:false, subtasks:[],
      timeMode:'single', date: dateKey(today), endDate:null,
      recurrence:{mode:null, interval:1, weekdays:[]}, notification:{type:null} },
    { id: uid(), title:'Team project sync', category:'Work', description:'Check in on phase 6 progress.', photos:[], pinned:false, done:false, subtasks:[],
      timeMode:'single', date: dateKey(addDays(today,2)), endDate:null,
      recurrence:{mode:null, interval:1, weekdays:[]}, notification:{type:null} }
  ];
  state.habits = [
    { id: uid(), title:'Read for 30 minutes', recurrence:{mode:'interval', interval:1, weekdays:[]},
      notification:{type:'time', time:'21:00', repeatHours:1, text:'Time to read!'},
      startDate: dateKey(addDays(today,-10)), completedDates:[dateKey(addDays(today,-1)), dateKey(addDays(today,-2))] },
    { id: uid(), title:'Morning workout', recurrence:{mode:'weekdays', interval:1, weekdays:[1,3,5]},
      notification:{type:null}, startDate: dateKey(addDays(today,-20)), completedDates:[] }
  ];
  state.events = [
    { id: uid(), title:'Online English class', timeMode:'single', date: dateKey(today), endDate:null,
      recurrence:{mode:'weekdays', interval:1, weekdays:[today.getDay()]},
      notification:{type:'time', time:'19:30', repeatHours:1, text:''} },
    { id: uid(), title:'Weekend trip', timeMode:'range', date: dateKey(addDays(today,4)), endDate: dateKey(addDays(today,6)),
      recurrence:{mode:null, interval:1, weekdays:[]}, notification:{type:null} }
  ];
}
// seed() is only used to give a brand-new (real) account some starter
// content right after signup — see the auth-submit handler. Returning
// visitors load their actual data from the backend instead (see boot()).

function occursOnDate(item, date){
  const dKey = dateKey(date);
  const rec = item.recurrence || {mode:null};
  if(item.timeMode === 'range' && !rec.mode){
    return dKey >= item.date && dKey <= item.endDate;
  }
  if(rec.mode === 'interval'){
    const diff = daysBetween(new Date(item.date), date);
    return diff >= 0 && diff % Math.max(1, rec.interval||1) === 0;
  }
  if(rec.mode === 'weekdays'){
    // Saved before days were required: show it on its own date at least.
    if(!(rec.weekdays||[]).length) return dKey === item.date;
    return dKey >= item.date && rec.weekdays.includes(date.getDay());
  }
  return dKey === item.date;
}

function habitOccursOnDate(habit, date){
  const dKey = dateKey(date);
  if(dKey < habit.startDate) return false;
  const rec = habit.recurrence;
  if(rec.mode === 'weekdays') return (rec.weekdays||[]).length ? rec.weekdays.includes(date.getDay()) : dKey === habit.startDate;
  const diff = daysBetween(new Date(habit.startDate), date);
  return diff % Math.max(1, rec.interval||1) === 0;
}

function daysBetween(a,b){ return Math.round((new Date(dateKey(b)) - new Date(dateKey(a))) / 86400000); }

function itemsForDate(date){
  return {
    tasks: state.tasks.filter(t => occursOnDate(t, date)),
    habits: state.habits.filter(h => habitOccursOnDate(h, date)),
    events: state.events.filter(e => occursOnDate(e, date))
  };
}
