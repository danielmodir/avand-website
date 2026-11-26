const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto, createHash } = require('node:crypto');

function storage(){
  const rows = new Map();
  return {
    getItem: key => rows.get(key) || null,
    setItem: (key, value) => rows.set(key, String(value)),
    removeItem: key => rows.delete(key),
  };
}

function client(){
  const sessionStorage = storage(), localStorage = storage();
  const requests = [], navigation = [];
  const location = { origin: 'http://localhost:8080', pathname: '/demo/', search: '', hash: '' };
  Object.defineProperty(location, 'href', { set: value => navigation.push(value) });
  const window = { TOOJIBEE_CONFIG: { apiBase: 'http://localhost:8080/api/v1' }, crypto: webcrypto, location };
  const c = vm.createContext({ window, localStorage, sessionStorage, FormData: class {},
    history: { replaceState(){} }, navigator: {}, fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token:'access', refresh_token:'refresh', user_id:'u' }) };
    } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/demo/js/services/api.js'), 'utf8'), c);
  return { cloud: window.Cloud, location, sessionStorage, requests, navigation };
}

test('Google start binds a random verifier to the redirect challenge', async () => {
  const app = client();
  await app.cloud.signInWithGoogle();
  const verifier = app.sessionStorage.getItem('toojibee-google-verifier');
  assert.match(verifier, /^[a-f0-9]{64}$/);
  const url = new URL(app.navigation[0]);
  assert.equal(url.pathname, '/api/v1/auth/google/start');
  assert.equal(url.searchParams.get('next'), 'http://localhost:8080/demo/');
  assert.equal(url.searchParams.get('challenge'), createHash('sha256').update(verifier).digest('hex'));
});

test('Google callback exchanges the one-time code with its tab verifier and clears it', async () => {
  const app = client();
  await app.cloud.signInWithGoogle();
  const verifier = app.sessionStorage.getItem('toojibee-google-verifier');
  app.location.hash = '#login_code=abc';
  assert.equal(await app.cloud.consumeOAuthRedirect(), true);
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].url, 'http://localhost:8080/api/v1/auth/google/exchange');
  assert.deepEqual(JSON.parse(app.requests[0].options.body), { code: 'abc', verifier });
  assert.equal(app.sessionStorage.getItem('toojibee-google-verifier'), null);
});
