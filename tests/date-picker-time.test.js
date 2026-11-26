const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function picker(value, end, time) {
  const picked = [], messages = [];
  const context = vm.createContext({
    document: { getElementById: () => ({ classList: { remove() {} } }) },
    queueBackSync() {}, showToast: key => messages.push(key), t: key => key,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/demo/components/date-picker/date-picker.js'), 'utf8'), context);
  vm.runInContext(`dp = {value:${JSON.stringify(value)}, end:${JSON.stringify(end)}, range:true,
    time:${JSON.stringify(time)}, onPick:(...args)=>picked.push(args)}`, context);
  context.picked = picked;
  return { context, picked, messages };
}

test('end time requires a start time', () => {
  const { context, picked, messages } = picker('2026-11-17', '2026-11-18', { start: '', end: '01:00', hasEnd: true });
  context.dpFinish();
  assert.equal(picked.length, 0);
  assert.deepEqual(messages, ['startTimeRequired']);
});

test('later date accepts an overnight time range', () => {
  const { context, picked, messages } = picker('2026-11-17', '2026-11-18', { start: '23:00', end: '01:00', hasEnd: true });
  context.dpFinish();
  assert.equal(messages.length, 0);
  assert.equal(picked.length, 1);
  assert.equal(picked[0][2].end, '01:00');
});

test('same date rejects an end before its start', () => {
  const { context, picked, messages } = picker('2026-11-17', '2026-11-17', { start: '23:00', end: '01:00', hasEnd: true });
  context.dpFinish();
  assert.equal(picked.length, 0);
  assert.deepEqual(messages, ['endBeforeStart']);
});
