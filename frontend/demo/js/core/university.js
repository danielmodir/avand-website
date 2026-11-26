/* Academic records stay separate from planning items. Links refer to the
   existing task/event IDs; no second calendar or reminder engine is created. */
const UniversityDesk = (function () {
  'use strict';
  const KINDS = ['dossiers','terms','courses','transfers','activities','resources'];
  let uid = '', data = null, selectedDossier = '', selectedTerm = '', error = '', syncing = null;
  function empty() { return { v: 1, dossiers: [], terms: [], courses: [], transfers: [], activities: [], resources: [], transcripts: [], pending: [] }; }
  function key(id) { return 'toojibee-university-v1:' + id; }
  function owner() {
    const current = state.profile && state.profile.userId || '';
    if (current !== uid) {
      uid = current;
      try { data = JSON.parse(localStorage.getItem(key(uid)) || 'null') || empty(); }
      catch (e) { data = empty(); }
      if (!data || data.v !== 1 || !KINDS.every(k => Array.isArray(data[k])) || !Array.isArray(data.pending)) data = empty();
      selectedDossier = ''; selectedTerm = ''; error = '';
      if (Cloud.isConfigured() && Cloud.hasSession()) setTimeout(() => sync(), 0);
    }
    return data;
  }
  function persist() { localStorage.setItem(key(uid), JSON.stringify(data)); }
  function uuid() { return Cloud.uuid().toLowerCase(); }
  function find(kind, id) { return data[kind].find(row => row.id === id); }
  async function save(kind, row) {
    owner();
    if (!KINDS.includes(kind) || !row || !row.id) return;
    const index = data[kind].findIndex(item => item.id === row.id);
    if (index < 0) data[kind].push(row); else data[kind][index] = row;
    if (Cloud.isConfigured()) data.pending.push({ kind: kind, row: row });
    try { persist(); error = ''; render(); await sync(); }
    catch (e) { error = 'universitySaveError'; render(); }
  }
  async function sync() {
    owner();
    if (!Cloud.isConfigured() || !Cloud.hasSession() || syncing) return syncing;
    syncing = (async () => {
      try {
        while (data.pending.length) {
          const op = data.pending[0];
          await Cloud.universitySave(op.kind, op.row);
          data.pending.shift(); persist();
        }
        const remote = await Cloud.universityState();
        for (const kind of KINDS) data[kind] = remote[kind] || [];
        data.transcripts = remote.transcripts || [];
        persist(); error = '';
      } catch (e) { error = 'universitySyncError'; }
      render();
    })().finally(() => { syncing = null; });
    return syncing;
  }
  function createDossier() {
    owner();
    const university = document.getElementById('university-name')?.value.trim();
    if (!university) { error = 'validation_error'; render(); return; }
    const id = uuid();
    selectedDossier = id;
    save('dossiers', { id: id, university: university, degree: document.getElementById('university-degree')?.value || '',
      field: document.getElementById('university-field')?.value.trim() || '', specialization: '',
      startDate: null, endDate: null, status: 'studying', active: data.dossiers.length === 0,
      gpaRules: { failed: null, withdrawn: null, repeated: null, equivalent: null, passMark: null },
      planningDefaults: { class: false, exam: false, assignment: false } });
  }
  function createTerm() {
    owner();
    const title = document.getElementById('university-term-title')?.value.trim();
    if (!selectedDossier || !title) { error = 'validation_error'; render(); return; }
    const id = uuid();
    selectedTerm = id;
    save('terms', { id: id, dossierId: selectedDossier, title: title,
      academicYear: document.getElementById('university-term-year')?.value.trim() || '',
      semester: document.getElementById('university-term-semester')?.value || '',
      startDate: document.getElementById('university-term-start')?.value || null,
      endDate: null, status: 'active' });
  }
  function createCourse() {
    owner();
    const title = document.getElementById('university-course-title')?.value.trim();
    const credits = Number(document.getElementById('university-course-credits')?.value);
    const rawGrade = document.getElementById('university-course-grade')?.value.trim();
    const grade = rawGrade === '' ? null : Number(rawGrade);
    if (!selectedTerm || !title || !Number.isFinite(credits) || credits <= 0 || credits > 100
      || (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > 20))) {
      error = 'validation_error'; render(); return;
    }
    save('courses', { id: uuid(), termId: selectedTerm, title: title,
      courseKey: document.getElementById('university-course-key')?.value.trim() || '',
      credits: credits, unitType: '', instructor: document.getElementById('university-course-instructor')?.value.trim() || '',
      notes: '', grade: grade, status: document.getElementById('university-course-status')?.value || 'ongoing' });
  }
  function setRules() {
    owner();
    const dossier = find('dossiers', selectedDossier);
    if (!dossier) return;
    const pick = key => document.getElementById('university-rule-' + key)?.value || null;
    const pass = document.getElementById('university-rule-passMark')?.value.trim();
    if (pass && (!Number.isFinite(Number(pass)) || Number(pass) < 0 || Number(pass) > 20)) {
      error = 'validation_error'; render(); return;
    }
    save('dossiers', { ...dossier, gpaRules: { failed: pick('failed'), withdrawn: pick('withdrawn'),
      repeated: pick('repeated'), equivalent: pick('equivalent'), passMark: pass === '' ? null : Number(pass) } });
  }
  function updateCourseGrade(id, gradeRaw, status) {
    owner();
    const course = find('courses', id);
    const grade = String(gradeRaw || '').trim() === '' ? null : Number(gradeRaw);
    if (!course || (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > 20))
      || !['ongoing','passed','failed','withdrawn','equivalent'].includes(status)) {
      error = 'validation_error'; render(); return;
    }
    save('courses', { ...course, grade: grade, status: status });
  }
  function createResource() {
    owner();
    const courseId = document.getElementById('university-resource-course')?.value;
    const title = document.getElementById('university-resource-title')?.value.trim();
    const type = document.getElementById('university-resource-type')?.value;
    const url = document.getElementById('university-resource-url')?.value.trim() || '';
    if (!courseId || !title || !['link','book','note'].includes(type)
      || (url && !/^https?:\/\/[^\s\\]+$/i.test(url)) || (type === 'link' && !url)) {
      error = 'validation_error'; render(); return;
    }
    save('resources', { id: uuid(), courseId: courseId, title: title, type: type, url: url, notes: '' });
  }
  function createTransfer() {
    owner();
    const sourceCourseId = document.getElementById('university-transfer-source')?.value;
    const targetCourseId = document.getElementById('university-transfer-target')?.value;
    const acceptedCredits = Number(document.getElementById('university-transfer-credits')?.value);
    const rawGrade = document.getElementById('university-transfer-grade')?.value.trim();
    const grade = rawGrade === '' ? null : Number(rawGrade);
    const source = find('courses', sourceCourseId), target = find('courses', targetCourseId);
    const sourceTerm = source && find('terms', source.termId), targetTerm = target && find('terms', target.termId);
    if (!source || !target || target.status !== 'equivalent' || sourceTerm?.dossierId === targetTerm?.dossierId
      || !Number.isFinite(acceptedCredits) || acceptedCredits <= 0 || acceptedCredits > target.credits
      || (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > 20))) {
      error = 'validation_error'; render(); return;
    }
    save('transfers', { id: uuid(), sourceCourseId: source.id, targetCourseId: target.id,
      acceptedCredits: acceptedCredits, grade: grade, status: 'approved', notes: '' });
  }
  function createActivity() {
    owner();
    const courseId = document.getElementById('university-activity-course')?.value;
    const type = document.getElementById('university-activity-type')?.value;
    const itemId = document.getElementById('university-activity-item')?.value.trim();
    if (!find('courses', courseId) || !['class','exam','assignment'].includes(type) || !itemId) {
      error = 'validation_error'; render(); return;
    }
    save('activities', { id: uuid(), courseId: courseId, type: type, itemId: itemId,
      showInPlanning: !!document.getElementById('university-activity-planning')?.checked });
  }
  function visibleInPlanning(type, id) {
    owner();
    const link = data.activities.find(row => row.itemId === id
      && (type === 'task' ? row.type === 'assignment' : row.type !== 'assignment'));
    return !link || link.showInPlanning !== false;
  }
  function selectDossier(id) { owner(); selectedDossier = id; selectedTerm = ''; render(); }
  function selectTerm(id) { owner(); selectedTerm = id; render(); }
  function renderDesk() {
    owner();
    const dossier = find('dossiers', selectedDossier) || data.dossiers[0];
    if (dossier) selectedDossier = dossier.id;
    const terms = dossier ? data.terms.filter(x => x.dossierId === dossier.id) : [];
    const term = find('terms', selectedTerm) || terms[0];
    if (term) selectedTerm = term.id;
    const courses = term ? data.courses.filter(x => x.termId === term.id) : [];
    const allCourses = data.courses;
    const sourceCourses = allCourses.filter(x => data.terms.find(term => term.id === x.termId)?.dossierId !== dossier?.id);
    const equivalentCourses = allCourses.filter(x => x.status === 'equivalent'
      && data.terms.find(term => term.id === x.termId)?.dossierId === dossier?.id);
    const transcript = UniversityGpa.transcripts(data).find(x => x.dossierId === dossier?.id);
    const ruleOptions = (values, current) => `<option value="">${t('universityChooseRule')}</option>` + values.map(v => `<option value="${v}" ${current === v ? 'selected' : ''}>${t('universityRule'+v)}</option>`).join('');
    return `<section class="university-desk">
      <div class="section-title">${t('universityDesktop')}</div>
      ${data.pending.length ? `<p class="university-hint">${t('universityPending')}: ${dig(data.pending.length)}</p>` : ''}
      ${error ? `<p class="university-error" role="alert">${t(error)}</p>` : ''}
      <div class="university-list">${data.dossiers.map(row => `<button type="button" class="btn ${row.id === dossier?.id ? 'btn-primary' : 'btn-outline'}" data-action="university-select-dossier" data-id="${escapeAttr(row.id)}">${escapeHtml(row.university)}${row.field ? ' · ' + escapeHtml(row.field) : ''}</button>`).join('')}</div>
      <div class="university-form"><strong>${t('universityNewDossier')}</strong>
        <label>${t('universityName')}<input id="university-name" maxlength="160"></label>
        <label>${t('universityDegree')}<input id="university-degree" maxlength="100"></label>
        <label>${t('universityField')}<input id="university-field" maxlength="120"></label>
        <button type="button" class="btn btn-primary" data-action="university-add-dossier">${t('universityAdd')}</button></div>
      ${dossier ? `<div class="university-form"><strong>${t('universityGpaRules')}</strong>
        ${['failed','withdrawn','equivalent'].map(k => `<label>${t('universityRuleLabel'+k)}<select id="university-rule-${k}">${ruleOptions(['include','exclude'], dossier.gpaRules?.[k])}</select></label>`).join('')}
        <label>${t('universityRuleLabelrepeated')}<select id="university-rule-repeated">${ruleOptions(['all','latest','highest'], dossier.gpaRules?.repeated)}</select></label>
        <label>${t('universityPassMark')}<input id="university-rule-passMark" type="number" min="0" max="20" step="0.01" value="${dossier.gpaRules?.passMark ?? ''}"></label>
        <button type="button" class="btn btn-outline" data-action="university-save-rules">${t('universitySaveRules')}</button>
        <p class="university-hint">${t('universityGpa')}: ${transcript?.gpa == null ? t('universityGpaPending') : dig(transcript.gpa)}</p></div>
        <div class="section-title">${t('universityTerms')}</div>
        <div class="university-list">${terms.map(row => `<button type="button" class="btn ${row.id === term?.id ? 'btn-primary' : 'btn-outline'}" data-action="university-select-term" data-id="${escapeAttr(row.id)}">${escapeHtml(row.title)}</button>`).join('')}</div>
        <div class="university-form"><strong>${t('universityNewTerm')}</strong>
          <label>${t('universityTermTitle')}<input id="university-term-title" maxlength="160"></label>
          <label>${t('universityAcademicYear')}<input id="university-term-year" maxlength="40"></label>
          <label>${t('universitySemester')}<input id="university-term-semester" maxlength="40"></label>
          <label>${t('universityStartDate')}<input id="university-term-start" type="date"></label>
          <button type="button" class="btn btn-primary" data-action="university-add-term">${t('universityAdd')}</button></div>` : ''}
      ${term ? `<div class="section-title">${t('universityCourses')}</div>
        <div class="university-course-list">${courses.map(row => `<div class="university-course"><strong>${escapeHtml(row.title)}</strong><span>${dig(row.credits)} ${t('universityCredits')} · ${row.grade == null ? t('universityNoGrade') : dig(row.grade)}</span>
          <label>${t('universityGrade')}<input class="university-edit-grade" type="number" min="0" max="20" step="0.01" value="${row.grade ?? ''}"></label>
          <label>${t('universityCourseStatus')}<select class="university-edit-status">${['ongoing','passed','failed','withdrawn','equivalent'].map(k => `<option value="${k}" ${row.status === k ? 'selected' : ''}>${t('universityStatus'+k)}</option>`).join('')}</select></label>
          <button type="button" class="btn btn-outline" data-action="university-update-course" data-id="${escapeAttr(row.id)}">${t('universitySaveCourse')}</button></div>`).join('')}</div>
        <div class="university-form"><strong>${t('universityNewCourse')}</strong>
          <label>${t('universityCourseTitle')}<input id="university-course-title" maxlength="160"></label>
          <label>${t('universityCourseKey')}<input id="university-course-key" maxlength="100"></label>
          <label>${t('universityCredits')}<input id="university-course-credits" type="number" min="0.01" max="100" step="0.01"></label>
          <label>${t('universityInstructor')}<input id="university-course-instructor" maxlength="160"></label>
          <label>${t('universityGrade')}<input id="university-course-grade" type="number" min="0" max="20" step="0.01"></label>
          <label>${t('universityCourseStatus')}<select id="university-course-status">${['ongoing','passed','failed','withdrawn','equivalent'].map(k => `<option value="${k}">${t('universityStatus'+k)}</option>`).join('')}</select></label>
          <button type="button" class="btn btn-primary" data-action="university-add-course">${t('universityAdd')}</button></div>
        <div class="university-form"><strong>${t('universityResources')}</strong>
          ${data.resources.filter(r => courses.some(c => c.id === r.courseId)).map(r => `<div>${escapeHtml(r.title)} · ${t('universityResource'+r.type)}</div>`).join('')}
          <label>${t('universityCourseTitle')}<select id="university-resource-course">${courses.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.title)}</option>`).join('')}</select></label>
          <label>${t('universityResourceTitle')}<input id="university-resource-title" maxlength="160"></label>
          <label>${t('universityResourceType')}<select id="university-resource-type">${['link','book','note'].map(k => `<option value="${k}">${t('universityResource'+k)}</option>`).join('')}</select></label>
          <label>${t('universityResourceUrl')}<input id="university-resource-url" type="url" maxlength="2048"></label>
          <button type="button" class="btn btn-outline" data-action="university-add-resource">${t('universityAdd')}</button></div>
        <div class="university-form"><strong>${t('universityActivities')}</strong>
          <p class="university-hint">${t('universityActivityHint')}</p>
          <label>${t('universityCourseTitle')}<select id="university-activity-course">${courses.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.title)}</option>`).join('')}</select></label>
          <label>${t('universityActivityType')}<select id="university-activity-type">${['class','exam','assignment'].map(k => `<option value="${k}">${t('universityActivity'+k)}</option>`).join('')}</select></label>
          <label>${t('universityItemId')}<input id="university-activity-item" maxlength="80"></label>
          <label><input id="university-activity-planning" type="checkbox" checked>${t('universityShowPlanning')}</label>
          <button type="button" class="btn btn-outline" data-action="university-add-activity">${t('universityAdd')}</button></div>` : ''}
      ${dossier && sourceCourses.length && equivalentCourses.length ? `<div class="university-form"><strong>${t('universityTransfers')}</strong>
        <label>${t('universitySourceCourse')}<select id="university-transfer-source">${sourceCourses.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.title)}</option>`).join('')}</select></label>
        <label>${t('universityTargetCourse')}<select id="university-transfer-target">${equivalentCourses.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.title)}</option>`).join('')}</select></label>
        <label>${t('universityCredits')}<input id="university-transfer-credits" type="number" min="0.01" max="100" step="0.01"></label>
        <label>${t('universityGrade')}<input id="university-transfer-grade" type="number" min="0" max="20" step="0.01"></label>
        <button type="button" class="btn btn-outline" data-action="university-add-transfer">${t('universityAdd')}</button></div>` : ''}
    </section>`;
  }
  window.addEventListener('online', () => { if (data) sync(); });
  return { renderDesk: renderDesk, sync: sync, createDossier: createDossier, createTerm: createTerm,
    createCourse: createCourse, setRules: setRules, selectDossier: selectDossier, selectTerm: selectTerm,
    updateCourseGrade: updateCourseGrade, createTransfer: createTransfer, createActivity: createActivity,
    createResource: createResource, visibleInPlanning: visibleInPlanning };
})();
