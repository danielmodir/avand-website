/* Offline transcript calculation mirrors the owner-scoped API rules. */
const UniversityGpa = (function () {
  'use strict';
  function metrics(courses, rules, approved) {
    const buckets = new Map(), passed = new Map(), missing = new Set();
    let total = 0;
    for (const course of courses) {
      let status = course.status, grade = course.grade;
      const equivalent = status === 'equivalent';
      let credits = Math.round(Number(course.credits) * 100);
      if (equivalent) {
        const transfer = approved.get(course.id);
        if (!transfer) continue;
        credits = Math.round(Number(transfer.acceptedCredits) * 100);
        grade = transfer.grade;
      }
      total += credits;
      const key = course.courseKey ? course.courseKey.toLowerCase() : course.id;
      if (status === 'ongoing' && grade != null && rules.passMark != null)
        status = grade >= rules.passMark ? 'passed' : 'failed';
      if (status === 'passed' || status === 'equivalent') {
        const old = passed.get(key), candidate = { local: !equivalent, credits: credits };
        if (!old || Number(candidate.local) > Number(old.local)
          || (candidate.local === old.local && candidate.credits > old.credits)) passed.set(key, candidate);
      }
      if (grade != null) {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({ status: status, grade: Math.round(Number(grade) * 100), credits: credits });
      }
    }
    let numerator = 0, graded = 0;
    for (const attempts of buckets.values()) {
      let eligible = attempts.filter(entry => {
        if (entry.status === 'ongoing') missing.add('passMark');
        if (['failed','withdrawn','equivalent'].includes(entry.status)) {
          if (rules[entry.status] == null) missing.add(entry.status);
          if (rules[entry.status] === 'exclude') return false;
        }
        return true;
      });
      if (eligible.length > 1) {
        if (rules.repeated == null) missing.add('repeated');
        if (rules.repeated === 'latest') eligible = eligible.slice(-1);
        if (rules.repeated === 'highest') eligible = [eligible.reduce((best, row) => row.grade >= best.grade ? row : best)];
      }
      for (const entry of eligible) { numerator += entry.grade * entry.credits; graded += entry.credits; }
    }
    return { gpa: missing.size || !graded ? null : Math.round(numerator / graded) / 100,
      gradedCredits: missing.size ? null : graded / 100,
      passedCredits: [...passed.values()].reduce((sum, entry) => sum + entry.credits, 0) / 100,
      equivalentCredits: [...passed.values()].filter(entry => !entry.local).reduce((sum, entry) => sum + entry.credits, 0) / 100,
      totalCredits: total / 100, missingRules: [...missing].sort() };
  }
  function transcripts(data) {
    const approved = new Map(data.transfers.filter(t => t.status === 'approved').map(t => [t.targetCourseId, t]));
    return data.dossiers.map(dossier => {
      const terms = data.terms.filter(t => t.dossierId === dossier.id)
        .sort((a,b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
      const termRows = terms.map(term => {
        const courses = data.courses.filter(c => c.termId === term.id);
        return { termId: term.id, ...metrics(courses, dossier.gpaRules, approved) };
      });
      const courses = data.courses.filter(c => terms.some(t => t.id === c.termId));
      return { dossierId: dossier.id, ...metrics(courses, dossier.gpaRules, approved),
        terms: termRows, courses: courses };
    });
  }
  return { transcripts: transcripts };
})();
if (typeof module !== 'undefined') module.exports = UniversityGpa;
