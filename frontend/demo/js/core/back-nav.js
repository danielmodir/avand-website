/* The browser/phone Back button steps back inside the app instead of
   leaving it: it closes whatever is on top (date picker, sign-in popup,
   add popup or its sub-page, period setup, day sheet, a menu page → its
   parent page → the workspace). Only with nothing open does Back leave
   the app, as it always did.

   How: the open layers are read from the app's own state (openLayers)
   and mirrored as history entries. syncBackSteps() runs after every
   render() and after every click/key, so nothing that opens or closes a
   layer has to know about history. Back pops one entry; popstate then
   closes the top layer (closeLayer). */
let backLayers = [];    // layers that currently have a history entry
let backIgnorePops = 0; // our own history.go() calls, not the user's Back
let backSyncQueued = false;

function openLayers(){
  const layers = [];
  if(state.menuPanelOpen){
    const chain = [];
    for(let sub = state.menuSubView || 'profile'; sub; sub = MENU_PARENT[sub]) chain.unshift('menu:' + sub);
    layers.push(...chain);
  }
  if(state.deskFull) layers.push('deskfull');
  if(state.calFull) layers.push('calfull');
  if(state.searchOpen) layers.push('search');
  if(state.daySheetOpen) layers.push('daysheet');
  if(state.navExpanded) layers.push('fab');
  if(document.getElementById('period-quiz-sheet')?.classList.contains('show')) layers.push('quiz');
  if(state.popupOpen){
    layers.push('popup');
    if(state.popupSubView) layers.push('popup-sub');
  }
  if(state.authOpen) layers.push('auth');
  if(typeof dp !== 'undefined' && dp) layers.push('date-picker');
  return layers;
}

function closeLayer(layer){
  if(layer === 'date-picker') return closeDatePicker();
  if(layer === 'auth') return closeAuth();
  if(layer === 'popup-sub'){ repeatDraft = null; state.popupSubView = null; renderPopupBody(); return; }
  if(layer === 'popup') return closePopup();
  if(layer === 'quiz') return closePeriodQuiz();
  if(layer === 'fab'){ state.navExpanded = false; render(); return; }
  if(layer === 'daysheet'){ state.daySheetOpen = false; render(); return; }
  if(layer === 'deskfull'){ state.deskFull = false; render(); return; }
  if(layer === 'calfull'){ state.calFull = false; render(); return; }
  if(layer === 'search') return closeSearch();
  if(layer.startsWith('menu:')){
    // Unsaved profile edits: stay unless the person confirms (Back is re-armed by syncBackSteps).
    if(layer === 'menu:profile-edit' && !leaveProfileEditOk()) return;
    const parent = MENU_PARENT[layer.slice(5)];
    if(parent) state.menuSubView = parent;
    else { state.menuPanelOpen = false; state.menuSubView = null; }
    render();
  }
}

function syncBackSteps(){
  if(backIgnorePops) return; // finish unwinding first; popstate re-syncs
  const cur = openLayers();
  let same = 0;
  while(same < backLayers.length && same < cur.length && backLayers[same] === cur[same]) same++;
  if(backLayers.length > same){
    // Something was closed in the app: drop its history entries.
    const n = backLayers.length - same;
    backLayers = backLayers.slice(0, same);
    backIgnorePops++;
    history.go(-n);
    return; // the popstate below pushes whatever is newly open
  }
  for(const layer of cur.slice(same)){
    history.pushState({ toojibee: layer }, '');
    backLayers.push(layer);
  }
}

function queueBackSync(){
  if(backSyncQueued) return;
  backSyncQueued = true;
  setTimeout(() => { backSyncQueued = false; syncBackSteps(); }, 0);
}

window.addEventListener('popstate', () => {
  if(backIgnorePops){ backIgnorePops--; syncBackSteps(); return; }
  // The user pressed Back: one entry is gone; close the top layer.
  const layer = backLayers.pop();
  if(layer && openLayers().includes(layer)) closeLayer(layer);
  syncBackSteps();
});

// Anything that opened or closed a layer without a render() still syncs.
document.addEventListener('click', queueBackSync, true);
document.addEventListener('keyup', queueBackSync, true);
document.addEventListener('pointerup', queueBackSync, true);
