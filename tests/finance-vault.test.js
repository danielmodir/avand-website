const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync('frontend/demo/js/core/finance-vault.js', 'utf8');

function vault(storage = new Map()) {
  const context = {
    crypto: webcrypto, TextEncoder, TextDecoder,
    btoa: text => Buffer.from(text, 'binary').toString('base64'),
    atob: text => Buffer.from(text, 'base64').toString('binary'),
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    window: {},
  };
  vm.createContext(context);
  vm.runInContext(source + '\nwindow.vault = FinanceVault;', context);
  return { api: context.window.vault, storage };
}

test('finance records are encrypted and bound to the owner and passphrase', async () => {
  const store = new Map();
  const first = vault(store).api;
  const data = await first.open('TJ-OWNER1', 'long local secret');
  data.accounts.push({ id: 1, name: 'Private Cash', balance_toman: 2300 });
  await first.save(data);
  const stored = [...store.values()].join('');
  assert.doesNotMatch(stored, /Private Cash|2300|long local secret/);
  first.lock();
  const again = vault(store).api;
  await assert.rejects(() => again.open('TJ-OWNER1', 'wrong passphrase'), /wrong_passphrase/);
  assert.deepEqual(JSON.parse(JSON.stringify(await again.open('TJ-OWNER1', 'long local secret'))).accounts,
    [{ id: 1, name: 'Private Cash', balance_toman: 2300 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(await again.open('TJ-OTHER22', 'long local secret'))).accounts, []);
});
