const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname,'../frontend/demo/components/popup/popup.js'),'utf8');

test('habit form saves a period goal on the existing habit record', async () => {
  const saved=[];
  const c=vm.createContext({
    Cloud:{}, today:new Date(2026,10,22), state:{popupType:'habit',editingId:null,popupSubView:null,homeDate:new Date(2026,10,22)},
    dateKey:()=> '2026-11-22', t:key=>key, dig:String, showToast(){}, haptic(){}, uid:()=> 'habit-goal',
    upsert:(kind,item)=>saved.push({kind,item}),closePopup(){},render(){},trackEvent(){},
    escapeAttr:String,escapeHtml:String,
  });
  vm.runInContext(source,c);
  c.upsert=(kind,item)=>saved.push({kind,item});
  c.closePopup=()=>{};
  vm.runInContext(`formDraft={title:'Exercise',recurrence:{mode:'interval',interval:1},notification:{type:null},reminderQuiet:{mode:'on'},goal:{period:'weekly',target:3},tracker:null,groupId:'',challenge:0}`,c);
  assert.match(c.habitGoalFields(), /weekly/);
  await c.submitPopup();
  assert.equal(saved.length,1);
  assert.equal(saved[0].kind,'habits');
  assert.deepEqual(JSON.parse(JSON.stringify(saved[0].item.goal)),{period:'weekly',target:3});
});
