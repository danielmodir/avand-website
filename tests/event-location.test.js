const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const popup = fs.readFileSync(path.join(__dirname, '../frontend/demo/components/popup/popup.js'), 'utf8');

test('event form keeps manual location and meeting link on one event record', async () => {
  const saved = [];
  const c = vm.createContext({ Cloud: {}, URL, today: new Date(2026, 10, 18),
    dateKey: () => '2026-11-18', state: { popupType: 'event', editingId: null, popupSubView: null },
    t: key => key, showToast(){}, haptic(){}, uid: () => 'event-one',
    upsert: (_kind, event) => saved.push(event), closePopup(){}, render(){},
    escapeAttr: String, escapeHtml: String });
  vm.runInContext(popup, c);
  c.upsert = (_kind, event) => saved.push(event);
  c.closePopup = () => {};
  c.render = () => {};
  vm.runInContext(`formDraft={title:'Visit',description:'',kind:'',color:'',date:'2026-11-18',timeMode:'single',startTime:'',endTime:'',recurrence:{mode:null,interval:1},notification:{type:null},reminderQuiet:{mode:'on'},location:'Street 12',meetingUrl:'https://meet.example.org/a'}`, c);
  assert.match(c.eventLocationRow(), /f-event-location/);
  assert.match(c.eventLocationRow(), /f-event-meeting-url/);
  assert.equal(c.safeEventWebUrl('javascript:alert(1)'), false);
  assert.equal(c.safeEventWebUrl('https://meet.example.org/a'), true);
  await c.submitPopup();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].location, 'Street 12');
  assert.equal(saved[0].meetingUrl, 'https://meet.example.org/a');
});
