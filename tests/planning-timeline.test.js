const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const context = vm.createContext({ document: { addEventListener(){} }, window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/demo/components/items/items.js'), 'utf8'), context);
const timeline = (tasks, events) => context.planningTimeline(tasks, events);
const ids = rows => Array.from(rows, row => row.item.id);

test('tasks and events share chronological order, regardless of pin/completion', () => {
  const tasks = [{id:'late', startTime:'16:00', pinned:true}, {id:'early', startTime:'08:30', done:true}];
  const events = [{id:'middle', startTime:'10:00'}];
  const result = timeline(tasks, events);
  assert.deepEqual(ids(result.timed), ['early', 'middle', 'late']);
  assert.deepEqual(Array.from(result.timed, x => x.hour), [8, 10, 16]);
  assert.equal(result.timed[0].item, tasks[1]);
  assert.deepEqual(tasks.map(x => x.id), ['late', 'early']);
});

test('equal times are stable and duplicate titles keep their identities', () => {
  const tasks = [{id:'a', title:'same', startTime:'09:00'}, {id:'b', title:'same', startTime:'09:00'}];
  assert.deepEqual(ids(timeline(tasks, [{id:'c', startTime:'09:00'}]).timed), ['a','b','c']);
});

test('untimed/invalid legacy values stay visible and reminders are not event starts', () => {
  const tasks = [{id:'a'}, {id:'b', startTime:'24:00'}, {id:'c', startTime:'08:60'}, {id:'d', startTime:930}];
  const events = [{id:'e', notification:{type:'time', time:'08:00'}}, {id:'f', startTime:'00:00'}, {id:'g', startTime:'23:59'}];
  const result = timeline(tasks, events);
  assert.deepEqual(ids(result.timed), ['f','g']);
  assert.deepEqual(Array.from(result.tasks, x=>x.id), ['a','b','c','d']);
  assert.equal(result.events[0], events[0]);
});

test('empty and large days preserve every entry without mutating inputs', () => {
  assert.equal(timeline([], []).timed.length, 0);
  const tasks = Array.from({length:10000}, (_, i) => Object.freeze({id:String(i), startTime:`${String(i%24).padStart(2,'0')}:00`}));
  Object.freeze(tasks);
  const rows = timeline(tasks, []).timed;
  assert.equal(rows.length, tasks.length);
  assert.equal(new Set(ids(rows)).size, tasks.length);
  assert.ok(rows.every((x, i) => !i || rows[i-1].minute <= x.minute));
});

test('shared renderer places timed activities first and preserves untimed pin/done order', () => {
  Object.assign(context, {
    state:{sectionExpanded:{tasks:true},sectionCollapsed:{}},
    dateKey:()=> '2026-11-16', t:key=>key, dig:String,
    taskStatusOn:task=>task.done ? 'done' : null,
    taskRow:task=>`<task id="${task.id}"></task>`,
    eventCard:event=>`<event id="${event.id}"></event>`,
    ICONS:{chevronDown:''}, window:{innerWidth:1280}
  });
  const tasks = [
    {id:'free-done',pinned:false,done:true}, {id:'free-open',pinned:false},
    {id:'free-pin',pinned:true,done:true}, {id:'timed',startTime:'16:00'}
  ];
  const html = context.renderItemSections(tasks, [], [{id:'earlier-event',startTime:'10:00'}], new Date());
  const order = ['earlier-event','timed','free-pin','free-open','free-done'].map(id=>html.indexOf(`id="${id}"`));
  assert.ok(order.every((at,i)=>at>=0 && (!i || at>order[i-1])));
  assert.match(html, /timelineEvent/);
  assert.match(html, /timelineTask/);
});
