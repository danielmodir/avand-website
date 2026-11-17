const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const code = fs.readFileSync(path.join(__dirname, '../frontend/demo/js/core/state.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(code.slice(code.indexOf('function occursOnDate(')), context);

test('old events remain visible in both desks; flags are independent', () => {
  assert.equal(context.eventVisibleIn({}, 'planning'), true);
  assert.equal(context.eventVisibleIn({}, 'occasions'), true);
  const event = { showInPlanning: false, showInOccasions: true, notification: { type: 'time', time: '09:00' } };
  assert.equal(context.eventVisibleIn(event, 'planning'), false);
  assert.equal(context.eventVisibleIn(event, 'occasions'), true);
  assert.deepEqual(event.notification, { type: 'time', time: '09:00' });
  assert.equal(context.eventVisibleIn({ showInOccasions: false }, 'occasions'), false);
});

test('event editor exposes two choices and stores both on the same event', async () => {
  const saved = [];
  const c = vm.createContext({ Cloud: {}, today: new Date(2026, 10, 17),
    dateKey: () => '2026-11-17', state: { popupType: 'event', editingId: null, popupSubView: null },
    t: key => key, showToast(){}, haptic(){}, uid: () => 'event-one',
    upsert: (kind, event) => saved.push({ kind, event }), closePopup(){}, render(){} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/demo/components/popup/popup.js'), 'utf8'), c);
  c.upsert = (kind, event) => saved.push({ kind, event });
  c.closePopup = () => {};
  c.render = () => {};
  vm.runInContext(`formDraft={title:'Visit',description:'',kind:'',color:'',date:'2026-11-17',timeMode:'single',startTime:'',endTime:'',recurrence:{mode:null,interval:1},notification:{type:null},reminderQuiet:{mode:'on'},showInPlanning:false,showInOccasions:true}`, c);
  const html = c.eventVisibilityRow();
  assert.match(html, /f-show-in-planning/);
  assert.match(html, /f-show-in-occasions/);
  await c.submitPopup();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].event.showInPlanning, false);
  assert.equal(saved[0].event.showInOccasions, true);
});

test('each desk renders only its visible events while retaining the same records', () => {
  const c = vm.createContext({ window: { innerWidth: 1280 }, state: {activeDesktopIndex: 0, settings: {prefs: {}}, guest: false, profile: {}},
    eventVisibleIn: context.eventVisibleIn, pref: key => key === 'occasionsEnabled' || key === 'occasionsShowEvents', visibleOccasionsForDate: () => [], periodViews: () => [], featureOn: () => false,
    sortEvents: x => x, eventCard: e => `<event id="${e.id}"></event>`,
    renderItemSections: (_tasks, _habits, events) => events.map(e => `<plan id="${e.id}"></plan>`).join(''),
    renderDayStatsCard: () => '', renderHomeCalWidget: () => '', countdownsHtml: () => '', prayerBlockHtml: () => '', shareCardBtn: () => '',
    syncPeriodDeskOnCalendar(){}, t: key => key, dig: String, ICONS: {chevronLeft:'',chevronRight:''} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/demo/components/workspace/workspace.js'), 'utf8'), c);
  const events = [{id:'both'}, {id:'planning-only',showInOccasions:false}, {id:'occasions-only',showInPlanning:false}];
  const html = c.renderDesktops(new Date(2026,10,17), {tasks:[],habits:[],events});
  const [planning, occasions] = html.split('class="desktop-pane ').slice(1);
  assert.match(planning, /plan id="both"/);
  assert.match(planning, /plan id="planning-only"/);
  assert.doesNotMatch(planning, /plan id="occasions-only"/);
  assert.match(occasions, /event id="both"/);
  assert.match(occasions, /event id="occasions-only"/);
  assert.doesNotMatch(occasions, /event id="planning-only"/);
  assert.equal(events.length, 3);
});
