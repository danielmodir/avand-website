const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync('frontend/demo/js/core/finance-vault.js', 'utf8');

function vault(storage = new Map(), bridge = null) {
  const context = {
    crypto: webcrypto, TextEncoder, TextDecoder,
    btoa: text => Buffer.from(text, 'binary').toString('base64'),
    atob: text => Buffer.from(text, 'base64').toString('binary'),
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    window: bridge ? { ToojibeeAndroid: bridge } : {},
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

test('an older Android web vault migrates to Keystore only after unlocking with its passphrase', async () => {
  const store = new Map();
  const web = vault(store).api;
  const data = await web.open('TJ-OWNER2', 'old web secret');
  data.accounts.push({ id: 2, name: 'Savings' });
  await web.save(data);
  web.lock();
  const bridge = {
    financeSeal: (_uid, plain) => Buffer.from(plain).toString('base64'),
    financeOpen: (_uid, cipher) => Buffer.from(cipher, 'base64').toString(),
  };
  const android = vault(store, bridge).api;
  assert.equal(android.needsPassphrase('TJ-OWNER2'), true);
  assert.equal((await android.open('TJ-OWNER2', 'old web secret')).accounts[0].name, 'Savings');
  assert.equal(JSON.parse([...store.values()][0]).m, 'android');
  android.lock();
  assert.equal(android.needsPassphrase('TJ-OWNER2'), false);
  assert.equal((await android.open('TJ-OWNER2', '')).accounts[0].name, 'Savings');
});
