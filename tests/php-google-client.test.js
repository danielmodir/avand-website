const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('PHP client uses the shared Google verifier flow and reports server availability', async () => {
  const calls = [];
  const base = {
    sessionStore: () => storage,
    signInWithGoogle: () => { calls.push('start'); },
    consumeOAuthRedirect: () => { calls.push('exchange'); return Promise.resolve(true); },
  };
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const fetch = async url => { calls.push(url); return { ok: true, status: 200, text: async () => '{"password":true,"google":true}' }; };
  const context = vm.createContext({
    window: { TOOJIBEE_CONFIG: { backend: 'php', apiBase: '/api/v1' }, Cloud: base,
      document: { addEventListener() {}, hidden: false }, addEventListener() {},
      fetch,
    },
    fetch,
    document: { hidden: false }, localStorage: storage, sessionStorage: storage,
    clearTimeout() {}, setTimeout() {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/demo/js/services/api-php.js'), 'utf8'), context);
  context.window.Cloud.signInWithGoogle();
  assert.equal(await context.window.Cloud.consumeOAuthRedirect(), true);
  assert.equal((await context.window.Cloud.authProviders()).google, true);
  assert.deepEqual(calls, ['start', 'exchange', '/api/v1/auth/providers']);
});
