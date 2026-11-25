/* Private finance cache. Only an AES-GCM ciphertext is persisted; the web
   passphrase-derived key lives in memory. Android uses its Keystore bridge. */
const FinanceVault = (function () {
  'use strict';
  const PREFIX = 'toojibee-finance-v1:';
  const ITERATIONS = 210000;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let activeUid = null, activeKey = null, activeMode = null, activeSalt = null;

  function bytesToB64(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192)
      text += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(text);
  }
  function b64ToBytes(text) {
    const raw = atob(text), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
  function keyName(uid) { return PREFIX + uid; }
  function androidBridge() {
    const bridge = window.ToojibeeAndroid;
    return bridge && typeof bridge.financeSeal === 'function' && typeof bridge.financeOpen === 'function' ? bridge : null;
  }
  function empty() { return { v: 1, currency: 'TOMAN', accounts: [], transactions: [], pending: [] }; }
  function checkData(data) {
    if (!data || data.v !== 1 || data.currency !== 'TOMAN' || !Array.isArray(data.accounts)
      || !Array.isArray(data.transactions) || !Array.isArray(data.pending)) throw new Error('invalid_finance_data');
    return data;
  }
  async function derive(passphrase, salt) {
    if (!crypto || !crypto.subtle) throw new Error('crypto_unavailable');
    if (typeof passphrase !== 'string' || passphrase.length < 8) throw new Error('passphrase_too_short');
    const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: ITERATIONS, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function aad(uid) { return encoder.encode('toojibee-finance-v1:' + uid); }
  function lock() { activeUid = null; activeKey = null; activeMode = null; activeSalt = null; }
  function hasStored(uid) { return !!localStorage.getItem(keyName(uid)); }
  function needsPassphrase(uid) {
    if (!androidBridge()) return true;
    try { return JSON.parse(localStorage.getItem(keyName(uid)) || 'null')?.m === 'web'; }
    catch (e) { return false; }
  }
  async function open(uid, passphrase) {
    if (typeof uid !== 'string' || !uid || uid.length > 100) throw new Error('invalid_owner');
    lock();
    const raw = localStorage.getItem(keyName(uid));
    let sealed = null;
    if (raw) {
      try { sealed = JSON.parse(raw); } catch (e) { throw new Error('invalid_finance_data'); }
      if (!sealed || sealed.v !== 1) throw new Error('invalid_finance_data');
    }
    const bridge = androidBridge();
    const migrateToAndroid = !!bridge && !!sealed && sealed.m === 'web';
    const mode = bridge && !migrateToAndroid ? 'android' : 'web';
    if (sealed && sealed.m !== mode) throw new Error('finance_storage_mode_changed');
    let data;
    if (mode === 'android') {
      if (sealed) {
        const plain = bridge.financeOpen(uid, sealed.c);
        if (!plain) throw new Error('finance_decrypt_failed');
        try { data = checkData(JSON.parse(plain)); } catch (e) { throw new Error('invalid_finance_data'); }
      } else data = empty();
    } else {
      const salt = sealed ? b64ToBytes(sealed.s) : crypto.getRandomValues(new Uint8Array(16));
      const key = await derive(passphrase, salt);
      if (sealed) {
        try {
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(sealed.iv),
            additionalData: aad(uid) }, key, b64ToBytes(sealed.c));
          data = checkData(JSON.parse(decoder.decode(plain)));
        } catch (e) { throw new Error('wrong_passphrase'); }
      } else data = empty();
      activeKey = key; activeSalt = salt;
    }
    activeUid = uid; activeMode = mode;
    if (migrateToAndroid) {
      activeMode = 'android'; activeKey = null; activeSalt = null;
      await save(data); // Replace the old web ciphertext only after successful decryption.
    } else if (!sealed) await save(data);
    return data;
  }
  async function save(data) {
    if (!activeUid || !activeMode) throw new Error('finance_locked');
    checkData(data);
    const plain = JSON.stringify(data);
    let sealed;
    if (activeMode === 'android') {
      const cipher = androidBridge().financeSeal(activeUid, plain);
      if (!cipher) throw new Error('finance_encrypt_failed');
      sealed = { v: 1, m: 'android', c: cipher };
    } else {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv,
        additionalData: aad(activeUid) }, activeKey, encoder.encode(plain));
      sealed = { v: 1, m: 'web', s: bytesToB64(activeSalt), iv: bytesToB64(iv),
        c: bytesToB64(new Uint8Array(cipher)) };
    }
    localStorage.setItem(keyName(activeUid), JSON.stringify(sealed));
  }
  return { open: open, save: save, lock: lock, hasStored: hasStored, needsPassphrase: needsPassphrase,
    isUnlocked: function () { return !!activeUid; }, empty: empty };
})();
