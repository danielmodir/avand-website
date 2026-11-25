/* One private wallet. The rendered cache and queued writes are sealed by
   FinanceVault; the general account sync and local-store never see them. */
const FinanceDesk = (function () {
  'use strict';
  let data = null, owner = null, syncing = null, busy = false, error = '';
  const MAX_AMOUNT = 9000000000000000;
  const PRESETS = [
    ['food','Food','expense',null], ['restaurant','Restaurant','expense','food'],
    ['cafe','Cafe','expense','food'], ['grocery','Groceries','expense','food'],
    ['transport','Transport','expense',null], ['taxi','Taxi','expense','transport'],
    ['fuel','Fuel','expense','transport'], ['transit','Public transport','expense','transport'],
    ['salary','Salary','income',null], ['gift','Gift','income',null],
    ['sales','Sales','income',null], ['other-income','Other income','income',null],
  ];

  function currentOwner() { return state.profile && state.profile.userId || ''; }
  function ensureOwner() {
    if (owner && owner !== currentOwner()) lock(false);
    return currentOwner();
  }
  function lock(shouldRender) { data = null; owner = null; error = ''; FinanceVault.lock(); if (shouldRender !== false) render(); }
  function amount(value) {
    const raw = String(value || '').replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[\s,٬]/g, '');
    const n = Number(raw);
    return /^\d+$/.test(raw) && Number.isSafeInteger(n) && n > 0 && n <= MAX_AMOUNT ? n : null;
  }
  function money(n) { return dig(Number(n || 0).toLocaleString('en-US')) + ' ' + t('financeToman'); }
  function accountByClient(id) { return data.accounts.find(a => a.client_id === id); }
  function accountById(id) { return data.accounts.find(a => String(a.id) === String(id)); }
  function categoryByClient(id) { return data.categories.find(c => c.client_id === id); }
  function categoryById(id) { return data.categories.find(c => String(c.id) === String(id)); }
  function categoryName(category) {
    if (!category) return '';
    const preset = PRESETS.find(p => 'preset-' + p[0] === category.client_id && p[1] === category.name);
    return preset ? t('financePreset' + preset[0].replace(/(^|-)([a-z])/g, (_,a,b) => b.toUpperCase())) : category.name;
  }
  function seedCategories() {
    if (data.categories.length) return false;
    for (const [key,name,kind,parent] of PRESETS) {
      const clientId = 'preset-' + key;
      const body = { client_id: clientId, name: name, kind: kind,
        parent_client_id: parent ? 'preset-' + parent : null };
      data.categories.push({ id: 'local:' + clientId, ...body, archived: false, color: '', icon: '' });
      if (Cloud.isConfigured()) data.pending.push({ type: 'category', body: body });
    }
    return true;
  }
  function accountName(entry) {
    const a = entry.account_client_id ? accountByClient(entry.account_client_id) : accountById(entry.account_id);
    return a ? a.name : '';
  }
  async function unlock(passphrase) {
    if (busy) return;
    busy = true; error = '';
    try {
      const uid = ensureOwner();
      data = await FinanceVault.open(uid, passphrase);
      owner = uid;
      if (seedCategories()) await save();
      render();
      await sync();
    } catch (e) {
      data = null; owner = null;
      error = e.message || 'finance_decrypt_failed';
      render();
    } finally { busy = false; }
  }
  async function save() { await FinanceVault.save(data); }
  function localEntry(accountClientId, value) {
    const a = accountByClient(accountClientId);
    if (!a) throw new Error('account_not_found');
    a.balance_toman = Number(a.balance_toman || 0) + value;
    return { account_client_id: accountClientId, amount_toman: value };
  }
  async function createAccount(name, kind, opening) {
    if (!data || busy) return;
    name = String(name || '').trim();
    if (!name || name.length > 100 || !['bank','cash','savings','other'].includes(kind)) { error = 'validation_error'; render(); return; }
    const rawOpening = String(opening || '').trim();
    if (rawOpening && !/^[0۰٠]$/.test(rawOpening) && !amount(rawOpening)) { error = 'invalid_amount'; render(); return; }
    const openingAmount = amount(rawOpening) || 0;
    const currentWallet = data.accounts.reduce((sum, a) => sum + Number(a.balance_toman || 0), 0);
    if (!Number.isSafeInteger(currentWallet + openingAmount) || currentWallet + openingAmount > MAX_AMOUNT) {
      error = 'balance_limit'; render(); return;
    }
    const clientId = Cloud.uuid(), localId = 'local:' + clientId;
    const body = { client_id: clientId, name: name, kind: kind };
    data.accounts.push({ id: localId, ...body, color: '', icon: '', archived: false, balance_toman: 0 });
    if (Cloud.isConfigured()) data.pending.push({ type: 'account', body: body });
    if (openingAmount) addLocalTransaction('opening', openingAmount, clientId, null, '');
    error = '';
    try { await save(); render(); await sync(); } catch (e) { error = 'financeSaveError'; render(); }
  }
  async function createCategory(name, kind, parentClientId) {
    if (!data || busy) return;
    name = String(name || '').trim();
    const parent = parentClientId ? categoryByClient(parentClientId) : null;
    if (!name || name.length > 100 || !['income','expense'].includes(kind)
      || (parentClientId && (!parent || parent.kind !== kind || parent.parent_id || parent.parent_client_id))) {
      error = 'validation_error'; render(); return;
    }
    const clientId = Cloud.uuid();
    const body = { client_id: clientId, name: name, kind: kind, parent_client_id: parentClientId || null };
    data.categories.push({ id: 'local:' + clientId, ...body, archived: false, color: '', icon: '' });
    if (Cloud.isConfigured()) data.pending.push({ type: 'category', body: body });
    error = '';
    try { await save(); render(); await sync(); } catch (e) { error = 'financeSaveError'; render(); }
  }
  function addLocalTransaction(kind, value, accountClientId, destinationClientId, note, categoryClientId) {
    if (!['opening','income','expense','transfer'].includes(kind) || !value || !accountByClient(accountClientId)
      || (kind === 'transfer' && (!destinationClientId || destinationClientId === accountClientId || !accountByClient(destinationClientId))))
      throw new Error('validation_error');
    const category = categoryClientId ? categoryByClient(categoryClientId) : null;
    if (categoryClientId && (!category || category.kind !== kind || category.archived)) throw new Error('validation_error');
    const requestId = Cloud.uuid(), occurredAt = new Date().toISOString();
    const deltas = [[accountClientId, kind === 'expense' || kind === 'transfer' ? -value : value]];
    if (kind === 'transfer') deltas.push([destinationClientId, value]);
    for (const [id, delta] of deltas) {
      const balance = Number(accountByClient(id).balance_toman || 0) + delta;
      if (!Number.isSafeInteger(balance) || Math.abs(balance) > MAX_AMOUNT) throw new Error('balance_limit');
    }
    const wallet = data.accounts.reduce((sum, a) => sum + Number(a.balance_toman || 0), 0)
      + deltas.reduce((sum, pair) => sum + pair[1], 0);
    if (!Number.isSafeInteger(wallet) || Math.abs(wallet) > MAX_AMOUNT) {
      throw new Error('balance_limit');
    }
    const entries = deltas.map(([id, delta]) => localEntry(id, delta));
    data.transactions.unshift({ id: 'local:' + requestId, request_id: requestId, kind: kind,
      amount_toman: value, occurred_at: occurredAt, note: note, source_id: '',
      category_client_id: categoryClientId || null, category_id: category ? category.id : null,
      entries: entries });
    if (Cloud.isConfigured()) data.pending.push({ type: 'transaction', body: {
      request_id: requestId, kind: kind, amount_toman: value, account_client_id: accountClientId,
      destination_client_id: destinationClientId, category_client_id: categoryClientId || null,
      note: note, occurred_at: occurredAt,
    }});
  }
  async function post(kind, rawAmount, accountClientId, destinationClientId, note, categoryClientId) {
    if (!data || busy) return;
    const value = amount(rawAmount);
    if (!value) { error = 'invalid_amount'; render(); return; }
    try {
      addLocalTransaction(kind, value, accountClientId, destinationClientId || null, String(note || '').slice(0, 2000), categoryClientId || null);
      error = '';
      await save(); render(); await sync();
    } catch (e) { error = ['validation_error','balance_limit'].includes(e.message) ? e.message : 'financeSaveError'; render(); }
  }
  async function sync() {
    if (!data || !Cloud.isConfigured() || !Cloud.hasSession()) return;
    if (syncing) return syncing;
    syncing = (async function () {
      try {
        while (data.pending.length) {
          const op = data.pending[0];
          if (op.type === 'account') {
            const row = await Cloud.financeCreateAccount(op.body);
            const local = accountByClient(op.body.client_id);
            if (local) Object.assign(local, row);
          } else if (op.type === 'category') {
            const parent = op.body.parent_client_id ? categoryByClient(op.body.parent_client_id) : null;
            if (parent && String(parent.id).startsWith('local:')) throw new Error('financeCategoryPending');
            const row = await Cloud.financeCreateCategory({ client_id: op.body.client_id,
              name: op.body.name, kind: op.body.kind, parent_id: parent ? parent.id : null });
            const local = categoryByClient(op.body.client_id);
            if (local) Object.assign(local, row);
          } else if (op.type === 'transaction') {
            const body = op.body;
            const source = accountByClient(body.account_client_id);
            const destination = body.destination_client_id ? accountByClient(body.destination_client_id) : null;
            if (!source || String(source.id).startsWith('local:') || (destination && String(destination.id).startsWith('local:')))
              throw new Error('financeAccountPending');
            const category = body.category_client_id ? categoryByClient(body.category_client_id) : null;
            if (category && String(category.id).startsWith('local:')) throw new Error('financeCategoryPending');
            await Cloud.financePostTransaction({ request_id: body.request_id, kind: body.kind,
              amount_toman: body.amount_toman, account_id: source.id,
              destination_id: destination ? destination.id : null, category_id: category ? category.id : null, note: body.note,
              occurred_at: body.occurred_at });
          } else throw new Error('invalid_finance_data');
          data.pending.shift();
          await save(); // Crash-safe: every successful request has a stable idempotency key.
        }
        const remote = await Cloud.financeState();
        data.accounts = remote.accounts;
        data.categories = remote.categories || [];
        data.transactions = remote.transactions;
        await save();
        error = '';
      } catch (e) { error = 'financeSyncError'; }
      render();
    })().finally(() => { syncing = null; });
    return syncing;
  }
  function renderDesk() {
    const uid = ensureOwner();
    if (!data) {
      const showPassphrase = FinanceVault.needsPassphrase(uid);
      return `<section class="finance-desk">
        <div class="section-title">${t('financeDesktop')}</div>
        <p class="finance-hint">${t('financePrivateHint')}</p>
        ${!showPassphrase ? '' : `<label class="finance-field">${t(FinanceVault.hasStored(uid) ? 'financePassphrase' : 'financeNewPassphrase')}
          <input id="finance-passphrase" type="password" autocomplete="off" minlength="8"></label>
          <p class="finance-hint">${t('financeRecoveryHint')}</p>`}
        ${error ? `<p class="finance-error" role="alert">${t(error) || t('financeSaveError')}</p>` : ''}
        <button type="button" class="btn btn-primary" data-action="finance-unlock">${t(FinanceVault.hasStored(uid) ? 'financeUnlock' : 'financeCreateVault')}</button>
      </section>`;
    }
    const accounts = data.accounts.filter(a => !a.archived);
    const balance = data.accounts.reduce((sum,a) => sum + Number(a.balance_toman || 0), 0);
    const options = accounts.map(a => `<option value="${escapeAttr(a.client_id)}">${escapeHtml(a.name)}</option>`).join('');
    const categories = data.categories.filter(c => !c.archived);
    const categoryOptions = categories.map(c => `<option value="${escapeAttr(c.client_id)}">${c.parent_id || c.parent_client_id ? '↳ ' : ''}${escapeHtml(categoryName(c))}</option>`).join('');
    const parentOptions = categories.filter(c => !c.parent_id && !c.parent_client_id)
      .map(c => `<option value="${escapeAttr(c.client_id)}">${escapeHtml(categoryName(c))}</option>`).join('');
    return `<section class="finance-desk">
      <div class="finance-summary"><span>${t('financeWallet')}</span><strong>${money(balance)}</strong>
        <button type="button" class="btn btn-outline btn-small" data-action="finance-lock">${t('financeLock')}</button></div>
      ${data.pending.length ? `<p class="finance-hint">${t('financePending')}: ${dig(data.pending.length)}</p>` : ''}
      ${error ? `<p class="finance-error" role="alert">${t(error) || t('financeSaveError')}</p>` : ''}
      <div class="section-title">${t('financeAccounts')}</div>
      ${accounts.length ? `<div class="finance-account-list">${accounts.map(a => `<div class="finance-account"><span>${escapeHtml(a.name)}</span><small>${t('financeKind'+a.kind)}</small><b>${money(a.balance_toman)}</b></div>`).join('')}</div>` : `<div class="empty-hint">${t('financeNoAccounts')}</div>`}
      <div class="finance-form"><strong>${t('financeAddAccount')}</strong>
        <label class="finance-field">${t('financeName')}<input id="finance-account-name" maxlength="100"></label>
        <label class="finance-field">${t('financeAccountKind')}<select id="finance-account-kind">${['cash','bank','savings','other'].map(k => `<option value="${k}">${t('financeKind'+k)}</option>`).join('')}</select></label>
        <label class="finance-field">${t('financeOpening')}<input id="finance-opening" type="text" inputmode="numeric" placeholder="0"></label>
        <button type="button" class="btn btn-primary" data-action="finance-add-account">${t('financeAddAccount')}</button>
      </div>
      <div class="section-title">${t('financeCategories')}</div>
      <div class="finance-category-list">${categories.map(c => `<span class="finance-category">${c.parent_id || c.parent_client_id ? '↳ ' : ''}${escapeHtml(categoryName(c))} · ${t('financeType'+c.kind)}</span>`).join('')}</div>
      <div class="finance-form"><strong>${t('financeAddCategory')}</strong>
        <label class="finance-field">${t('financeName')}<input id="finance-category-name" maxlength="100"></label>
        <label class="finance-field">${t('financeCategoryKind')}<select id="finance-category-kind">${['expense','income'].map(k => `<option value="${k}">${t('financeType'+k)}</option>`).join('')}</select></label>
        <label class="finance-field">${t('financeParentCategory')}<select id="finance-parent-category"><option value="">${t('financeNoParent')}</option>${parentOptions}</select></label>
        <button type="button" class="btn btn-primary" data-action="finance-add-category">${t('financeAddCategory')}</button>
      </div>
      ${accounts.length ? `<div class="finance-form"><strong>${t('financeAddTransaction')}</strong>
        <label class="finance-field">${t('financeTransactionKind')}<select id="finance-kind">${['income','expense','transfer'].map(k => `<option value="${k}">${t('financeType'+k)}</option>`).join('')}</select></label>
        <label class="finance-field">${t('financeAmount')}<input id="finance-amount" type="text" inputmode="numeric"></label>
        <label class="finance-field">${t('financeAccount')}<select id="finance-source">${options}</select></label>
        <label class="finance-field">${t('financeDestination')}<select id="finance-destination"><option value="">${t('financeChoose')}</option>${options}</select></label>
        <label class="finance-field">${t('financeCategory')}<select id="finance-transaction-category"><option value="">${t('financeNoCategory')}</option>${categoryOptions}</select></label>
        <label class="finance-field">${t('financeNote')}<input id="finance-note" maxlength="2000"></label>
        <button type="button" class="btn btn-primary" data-action="finance-post">${t('financeSaveTransaction')}</button>
      </div>` : ''}
      <div class="section-title">${t('financeTransactions')}</div>
      ${data.transactions.length ? `<div class="finance-transaction-list">${data.transactions.slice(0,50).map(row => `<div class="finance-transaction"><span>${t('financeType'+row.kind)}${row.category_id || row.category_client_id ? ` · ${escapeHtml(categoryName(row.category_client_id ? categoryByClient(row.category_client_id) : categoryById(row.category_id)))}` : ''}${row.note ? ` · ${escapeHtml(row.note)}` : ''}</span><b>${money(row.amount_toman)}</b><small>${escapeHtml(new Date(row.occurred_at).toLocaleDateString(lang() === 'fa' ? 'fa-IR' : 'en-US'))}</small></div>`).join('')}</div>` : `<div class="empty-hint">${t('financeNoTransactions')}</div>`}
    </section>`;
  }
  window.addEventListener('online', () => { if (data) sync(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && data) sync(); });
  return { renderDesk: renderDesk, unlock: unlock, lock: lock, createAccount: createAccount, createCategory: createCategory,
    post: post, sync: sync, amount: amount };
})();
