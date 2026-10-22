/* ============ CONTACT US (Profile → ارتباط با ما) ============
   A topic (themed dropdown), the message, Send. Below: the person's own
   messages with the team's answers (answered from the admin panel, also
   emailed from support@toojibee.ir). The Profile row shows a count of
   answers not seen yet. Without an account (or with no backend) it only
   points to the support email. */
const CONTACT_KINDS = ['suggestion', 'criticism', 'support', 'bug', 'account', 'other'];
const contactDraft = { kind: '', body: '' };
let contactList = null;        // the person's messages, newest first (null = not loaded)
let contactBusy = false;
let contactError = '';
let contactUnread = 0;

function contactAvailable(){
  return !REAL_LOGIN_DISABLED && !state.guest && !!Cloud.sendSupportMessage;
}

function refreshContactUnread(){
  if(!contactAvailable()) return;
  Cloud.supportUnread().then(n => { if(n !== contactUnread){ contactUnread = n; if(state.menuPanelOpen) render(); } }).catch(() => {});
}

let contactLoading = false;
function loadContactMessages(){
  if(!contactAvailable() || contactLoading) return;
  contactLoading = true;
  Cloud.supportMessages().then(list => {
    contactList = list || [];
    contactUnread = 0;
  }).catch(() => { contactList = []; }).finally(() => {
    contactLoading = false;
    if(state.menuSubView === 'contact') render();
  });
}

function contactRowBadge(){
  return contactUnread ? `<span class="count contact-unread">${dig(contactUnread)}</span>` : '';
}

function renderContactPage(){
  if(!contactAvailable()){
    return `${subHeader(t('contactUs'))}<div class="empty-hint">${t('contactOffline')}</div>`;
  }
  if(contactList === null) loadContactMessages();
  const kindOptions = CONTACT_KINDS.map(k => `<option value="${k}" ${contactDraft.kind === k ? 'selected' : ''}>${t('kind_' + k)}</option>`).join('');
  const fmt = s => s ? formatDateLabel(String(s).slice(0, 10)) : '';
  const items = (contactList || []).map(m => `
    <div class="contact-msg">
      <div class="contact-msg-head">
        <span class="contact-kind">${t('kind_' + m.kind)}</span>
        <span class="contact-date">${fmt(m.created_at)}</span>
        <span class="contact-state ${m.reply ? 'answered' : m.status}">${m.reply ? t('contactAnswer') : m.status === 'closed' ? t('contactClosed') : t('contactWaiting')}</span>
      </div>
      <div class="contact-msg-body">${escapeHtml(m.body)}</div>
      ${m.reply ? `<div class="contact-reply"><b>${t('contactAnswer')}</b>${escapeHtml(m.reply)}</div>` : ''}
    </div>`).join('');
  return `
    ${subHeader(t('contactUs'))}
    <div class="empty-hint contact-intro">${t('contactSub')}</div>
    <div class="contact-form">
      <label class="contact-label" for="contact-kind">${t('contactKind')}</label>
      <select class="settings-select contact-select" id="contact-kind">
        <option value="" ${contactDraft.kind ? '' : 'selected'} disabled>${t('contactPickKind')}</option>
        ${kindOptions}
      </select>
      <label class="contact-label" for="contact-body">${t('contactBody')}</label>
      <textarea id="contact-body" class="contact-body" maxlength="3000" rows="6" placeholder="${t('contactBodyPh')}">${escapeHtml(contactDraft.body)}</textarea>
      ${contactError ? `<div class="contact-error" role="alert">${escapeHtml(contactError)}</div>` : ''}
      <button type="button" class="btn btn-primary contact-send" data-action="contact-send" ${contactBusy ? 'disabled' : ''}>${contactBusy ? t('contactSending') : t('contactSend')}</button>
    </div>
    <div class="section-title" style="margin-top:24px;">${t('contactMine')}</div>
    ${contactList === null ? '' : items || `<div class="empty-hint">${t('contactNone')}</div>`}
  `;
}

async function sendContactMessage(){
  if(contactBusy) return;
  const body = contactDraft.body.trim();
  contactError = !contactDraft.kind ? t('contactNeedKind') : [...body].length < 5 ? t('contactNeedBody') : '';
  if(contactError){ render(); return; }
  contactBusy = true; render();
  try{
    const appInfo = `${navigator.userAgent.slice(0, 220)} · ${window.innerWidth}x${window.innerHeight} · ${typeof ASSET_VERSION !== 'undefined' ? ASSET_VERSION : ''}`;
    const m = await Cloud.sendSupportMessage(contactDraft.kind, body, lang(), appInfo);
    contactList = [m].concat(contactList || []);
    contactDraft.kind = ''; contactDraft.body = '';
    showToast(t('contactSent'));
  }catch(err){
    contactError = authErrorMessage(err);
  }finally{
    contactBusy = false;
    render();
  }
}

// The form's fields keep their draft while the page re-renders.
document.addEventListener('input', e => {
  if(e.target.id === 'contact-body'){ contactDraft.body = e.target.value; if(contactError){ contactError = ''; } }
});
document.addEventListener('change', e => {
  if(e.target.id === 'contact-kind'){ contactDraft.kind = e.target.value; if(contactError){ contactError = ''; render(); } }
});
