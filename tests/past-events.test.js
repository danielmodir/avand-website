const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function form(type='event', edit=false){
  const saved=[], messages=[];
  const c=vm.createContext({Cloud:{}, today:new Date(2026,10,16),
    dateKey:()=> '2026-11-16', dateYearsAgo:n=>n===100?'1926-11-16':'2025-11-16',
    state:{popupType:type,editingId:edit?'existing':null,popupSubView:null},
    showToast:key=>messages.push(key),t:x=>x,haptic(){},isHijriPrimary:()=>false,primarySystem:()=> 'jalali'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/demo/components/popup/popup.js'),'utf8'),c);
  Object.assign(c,{upsert:(kind,item)=>saved.push({kind,item}),uid:()=> 'new', closePopup(){},render(){}});
  vm.runInContext(`formDraft={title:'Historical event',kind:'',date:'2020-02-20',timeMode:'single',startTime:'10:00',endTime:'11:00',recurrence:{mode:null,interval:1},notification:{type:null},reminderQuiet:{mode:'on'}}`,c);
  return {c,saved,messages};
}

test('ordinary events can be created and edited in the past with their original dates',async()=>{
  for(const edit of [false,true]){
    const {c,saved,messages}=form('event',edit);
    await c.submitPopup();
    assert.equal(saved.length,1,JSON.stringify(messages));
    assert.equal(saved[0].item.date,'2020-02-20');
    assert.equal(saved[0].item.startTime,'10:00');
    assert.equal(saved[0].item.id,edit?'existing':'new');
  }
});

test('existing task restriction is preserved',async()=>{
  const {c,saved,messages}=form('task');
  await c.submitPopup();
  assert.equal(saved.length,0);
  assert.deepEqual(messages,['pastDateNotAllowed']);
});

test('past birthdays keep annual recurrence; ordinary recurring events retain their rule',async()=>{
  for(const kind of ['birthday','']){
    const {c,saved}=form();
    vm.runInContext(`formDraft.kind=${JSON.stringify(kind)}; formDraft.recurrence={mode:'interval',interval:3,anchor:'2020-02-20',cal:'gregorian'}`,c);
    await c.submitPopup();
    assert.equal(saved.length,1);
    assert.equal(saved[0].item.recurrence.mode,kind?'yearly':'interval');
    assert.equal(saved[0].item.recurrence.interval,kind?1:3);
  }
});

test('event picker permits historical dates and never excludes an existing older value',()=>{
  const {c}=form();
  assert.equal(c.popupDateMinimum('event',false,'2020-02-20'),'1926-11-16');
  assert.equal(c.popupDateMinimum('event',true,'1900-01-01'),'1900-01-01');
  assert.equal(c.popupDateMinimum('task',false,'2020-02-20'),'2026-11-16');
});

test('historical event appears on its day but creates no present or future reminder',()=>{
  const key = d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const c=vm.createContext({document:{addEventListener(){}},navigator:{},pref:()=>false,featureOn:()=>false,
    dateKey:key, parseDateKey:k=>new Date(k+'T00:00:00'),
    addDays:(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;},
    state:{tasks:[],habits:[],events:[{id:'past',title:'Past',date:'2001-02-20',timeMode:'single',notification:{type:'time',time:'09:00'}}],period:{},profile:{}}});
  const state=fs.readFileSync(path.join(__dirname,'../frontend/demo/js/core/state.js'),'utf8');
  vm.runInContext(state.slice(state.indexOf('function occursOnDate(')),c);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/demo/js/core/notify.js'),'utf8'),c);
  assert.equal(c.itemsForDate(new Date(2001,1,20)).events.length,1);
  assert.equal(c.itemsForDate(new Date()).events.length,0);
  assert.equal(c.reminderSlots(new Date()).length,0);
  assert.equal(c.pushScheduleItems().length,0);
});
