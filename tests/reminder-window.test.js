const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ctx=vm.createContext({document:{addEventListener(){}},navigator:{}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/demo/js/core/notify.js'),'utf8'),ctx);
const day=new Date(2026,10,16);
const times=n=>Array.from(ctx.reminderWindowTimes(day,n),at=>{const d=new Date(at);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;});
test('custom window includes aligned end and supports hours/minutes',()=>{
 assert.deepEqual(times({time:'08:00',windowEnd:'18:00',everyMinutes:120}),['08:00','10:00','12:00','14:00','16:00','18:00']);
 assert.deepEqual(times({time:'09:00',windowEnd:'12:00',everyMinutes:30}),['09:00','09:30','10:00','10:30','11:00','11:30','12:00']);
 assert.deepEqual(times({time:'09:00',windowEnd:'10:10',everyMinutes:45}),['09:00','09:45']);
});
test('invalid and zero/negative/fractional intervals do not schedule anything',()=>{
 for(const n of [{time:'09:00',windowEnd:'09:00',everyMinutes:30},{time:'24:00',windowEnd:'18:00',everyMinutes:30},...[0,-1,1.5,NaN,1441].map(everyMinutes=>({time:'08:00',windowEnd:'18:00',everyMinutes}))]) assert.deepEqual(times(n),[]);
});
test('new or edited windows do not backfill reminders earlier than activation',()=>{
 const since=new Date(2026,10,16,13).getTime();
 assert.deepEqual(times({time:'08:00',windowEnd:'18:00',everyMinutes:120,windowSince:since}),['14:00','16:00','18:00']);
});
test('overnight windows anchor to their original date and never duplicate slots',()=>{
 const n={time:'22:00',windowEnd:'02:00',everyMinutes:120};
 const rows=Array.from(ctx.reminderWindowTimes(day,n));
 assert.deepEqual(times(n),['22:00','00:00','02:00']);
 assert.equal(new Date(rows[2]).getDate(),17);
 assert.equal(new Set(rows).size,rows.length);
 assert.deepEqual(Array.from(ctx.reminderWindowTimes(day,n)),rows);
});
test('wall-clock recurrence skips nonexistent DST times without duplicating later ones',()=>{
 const previous=process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
 try{
  process.env.TZ='America/New_York';
  const spring=new Date(2026,2,8);
  const rows=Array.from(ctx.reminderWindowTimes(spring,{time:'01:00',windowEnd:'04:00',everyMinutes:30}));
  assert.equal(new Set(rows).size,rows.length);
  assert.deepEqual(rows.map(at=>new Date(at).getHours()),[1,1,3,3,4]);
 }finally{process.env.TZ=previous;}
});

test('overnight tails keep occurrence identity, follow edits and disappear on removal',()=>{
 const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 Object.assign(ctx,{dateKey:key,parseDateKey:k=>new Date(k+'T00:00:00'),addDays:(d,n)=>{const r=new Date(d);r.setDate(r.getDate()+n);return r;},pref:()=>false,featureOn:()=>false,t:x=>x,dig:String});
 ctx.state={tasks:[],habits:[],events:[{id:'night',title:'Night',date:'2026-11-16',timeMode:'single',notification:{type:'repeat',time:'22:00',windowEnd:'02:00',everyMinutes:120}}],period:{},profile:{}};
 const source=fs.readFileSync(path.join(__dirname,'../frontend/demo/js/core/state.js'),'utf8');
 vm.runInContext(source.slice(source.indexOf('function occursOnDate(')),ctx);
 const tomorrow=new Date(2026,10,17);
 const baseDay=new Date(2026,10,16);
 const rows=Array.from(ctx.reminderSlots(baseDay)).concat(Array.from(ctx.reminderSlots(tomorrow)));
 assert.equal(rows.length,3);
 assert.ok(rows.every(row=>row.date==='2026-11-16'));
 assert.equal(new Set(rows.map(row=>row.slot)).size,3);
 ctx.state.events[0].notification.everyMinutes=60;
 assert.equal(ctx.reminderSlots(tomorrow).length,3);
 ctx.state.events[0].notification.type=null;
 assert.equal(ctx.reminderSlots(baseDay).length+ctx.reminderSlots(tomorrow).length,0);
});

test('Django adapter preserves custom windows and legacy hourly reminders',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../frontend/demo/js/services/api.js'),'utf8');
 const adapter=vm.createContext({});
 const maps=source.slice(source.indexOf('  var NOTIF_TO_API'),source.indexOf('  function recurrenceToApi'));
 vm.runInContext(maps+source.slice(source.indexOf('  function reminderToApi('),source.indexOf('  function datesToApi(')),adapter);
 const sent=adapter.reminderToApi({type:'repeat',time:'09:00',windowEnd:'12:00',everyMinutes:30});
 assert.equal(sent.reminder_window_end,'12:00');
 assert.equal(sent.reminder_every_minutes,30);
 assert.equal(sent.reminder_every_hours,null);
 const read=adapter.reminderFromApi({...sent,updated_at:'2026-11-16T00:00:00Z'});
 assert.equal(read.windowEnd,'12:00');assert.equal(read.everyMinutes,30);
 assert.equal(read.windowSince,Date.parse('2026-11-16T00:00:00Z'));
 const legacy=adapter.reminderToApi({type:'repeat',time:'09:00',repeatHours:2});
 assert.equal(legacy.reminder_every_hours,2);assert.equal(legacy.reminder_window_end,null);
});

test('activation begins at activity submission and resets when its occurrence schedule changes',()=>{
 const popup=vm.createContext({Cloud:{}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/demo/components/popup/popup.js'),'utf8'),popup);
 const previous={date:'2026-11-16',notification:{type:'repeat',time:'08:00',windowEnd:'18:00',everyMinutes:30,windowSince:1000},recurrence:{mode:null}};
 const pending={...previous,notification:{...previous.notification,windowSince:1000}};
 assert.equal(popup.reminderWindowActivation(null,pending,'event',2000),2000);
 assert.equal(popup.reminderWindowActivation(previous,{...pending,title:'Renamed'},'event',2000),1000);
 assert.equal(popup.reminderWindowActivation(previous,{...pending,date:'2026-11-17'},'event',2000),2000);
 assert.equal(popup.reminderWindowActivation(previous,{...pending,recurrence:{mode:'interval',interval:1}},'event',2000),2000);
 assert.equal(popup.reminderWindowActivation(previous,{...pending,notification:{...pending.notification,everyMinutes:60}},'event',2000),2000);
});

test('submitPopup uses save time after a delayed confirmation or a date edit',async()=>{
 for(const editing of [false,true]){
  const saved=[];
  const previous={id:'existing',date:'2026-11-16',notification:{type:'repeat',time:'08:00',windowEnd:'18:00',everyMinutes:30,windowSince:1000},recurrence:{mode:null}};
  const popup=vm.createContext({Cloud:{},Date:{now:()=>2000},state:{popupType:'event',editingId:editing?'existing':null,popupSubView:null,events:[previous]},
   reminderWindowSpec:ctx.reminderWindowSpec,uid:()=> 'new'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/demo/components/popup/popup.js'),'utf8'),popup);
  Object.assign(popup,{upsert:(_,row)=>saved.push(row),closePopup(){},render(){}});
  vm.runInContext(`formDraft={title:'Window',date:'2026-11-17',timeMode:'single',recurrence:{mode:null,interval:1},notification:{type:'repeat',time:'08:00',windowEnd:'18:00',everyMinutes:30,windowSince:1000}}`,popup);
  await popup.submitPopup();
  assert.equal(saved.length,1);assert.equal(saved[0].notification.windowSince,2000);
 }
});
