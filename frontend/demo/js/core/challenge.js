/* ============ FRIENDLY CHALLENGES ============
   A group habit with challenge = { days: 7 | 21 | 30, start } is a
   "N days with friends" challenge: it runs from its start for N days
   (habitOccursOnDate stops after), its details show every member's
   progress, a nudge for whoever hasn't done today's yet (a message through
   the share sheet, nothing sent by us), and a card to share at the end.
   Stored in the group item's own data, so neither backend needs a change. */
const CHALLENGE_DAYS = [7, 21, 30];

function challengeEnd(h){ return dateKey(addDays(parseDateKey(h.challenge.start || h.startDate), (Number(h.challenge.days) || 21) - 1)); }

function challengeFieldHtml(){
  return `<label class="field-label" for="f-challenge" style="margin-top:10px;">${t('challengeField')}</label>
    <select class="settings-select" id="f-challenge" style="width:100%;">
      <option value="0">${t('challengeNone')}</option>
      ${CHALLENGE_DAYS.map(n => `<option value="${n}" ${formDraft.challenge === n ? 'selected' : ''}>${t('challengeNDays').replace('{n}', dig(n))}</option>`).join('')}
    </select>`;
}

/* Each member's done days inside the challenge, best first. */
function challengeProgress(h){
  const g = groupById(h.groupId); if(!g) return [];
  const start = h.challenge.start || h.startDate, end = challengeEnd(h);
  return g.members.map(m => {
    const done = new Set((h.groupMarks || []).filter(x => x.status === 'done' && x.key >= start && x.key <= end
      && (h.doneMode === 'shared' || (m.me ? x.me : String(x.user) === String(m.id)))).map(x => x.key)).size;
    return { m, done };
  }).sort((a, b) => b.done - a.done);
}

function challengeHtml(h){
  if(!h.challenge || !h.groupId) return '';
  const days = Number(h.challenge.days) || 21, end = challengeEnd(h), key = dateKey(today);
  const dayNo = Math.min(days, Math.max(0, Math.round((parseDateKey(key) - parseDateKey(h.challenge.start || h.startDate)) / 86400000) + 1));
  const over = key > end;
  const rows = challengeProgress(h).map(({ m, done }) => {
    const todayDone = (h.groupMarks || []).some(x => x.key === key && x.status === 'done' && (m.me ? x.me : String(x.user) === String(m.id)));
    return `<div class="challenge-row"><span class="name">${escapeHtml(m.name)}</span>
      <span class="challenge-bar"><i style="width:${Math.round(done / days * 100)}%"></i></span><span class="num">${dig(done)}/${dig(days)}</span>
      ${!over && !m.me && !todayDone ? `<button type="button" class="link-btn" data-action="challenge-nudge" data-name="${escapeAttr(m.name)}" data-title="${escapeAttr(h.title)}">${t('challengeNudge')}</button>` : ''}</div>`;
  }).join('');
  return `<div class="section-title">${t('challengeTitle').replace('{n}', dig(days))} <span class="count">${over ? t('challengeOver') : t('challengeDayOf').replace('{d}', dig(dayNo)).replace('{n}', dig(days))}</span></div>
    <div class="challenge-list">${rows}</div>
    ${over ? `<div class="occ-share-row">${shareCardBtn('challenge', h.id, 'challengeCard')}</div>` : ''}`;
}

function challengeNudge(name, title){
  const text = t('challengeNudgeText').replace('{name}', name).replace('{title}', title) + '\nhttps://toojibee.ir/demo/';
  if(androidApp) androidApp.share(t('appName'), text);
  else if(navigator.share) navigator.share({ text }).catch(() => {});
  else { copyText(text); showToast(t('linkCopied')); }
}

/* The share card at the end (js/core/share-card.js). */
function challengeCardContent(h){
  const me = challengeProgress(h).find(x => x.m.me), days = Number(h.challenge.days) || 21;
  return { big: `${dig(me ? me.done : 0)}/${dig(days)}`, title: h.title, lines: [t('challengeDone').replace('{n}', dig(days))] };
}
