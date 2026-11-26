const test = require('node:test');
const assert = require('node:assert/strict');
const { transcripts } = require('../frontend/demo/js/core/university-gpa.js');

test('ungraded attempts stay out of GPA and repetition follows dossier rules', () => {
  const data = { dossiers: [{ id: 'd', gpaRules: { failed: 'include', withdrawn: 'exclude',
    repeated: 'latest', equivalent: 'exclude', passMark: 10 } }],
    terms: [{ id: 'a', dossierId: 'd', startDate: '2025-01-01' },
      { id: 'b', dossierId: 'd', startDate: '2026-01-01' }],
    courses: [
      { id: 'old', termId: 'a', courseKey: 'MATH', credits: 3, grade: 0, status: 'failed' },
      { id: 'new', termId: 'b', courseKey: 'math', credits: 3, grade: 16, status: 'passed' },
      { id: 'open', termId: 'b', courseKey: '', credits: 2, grade: null, status: 'ongoing' },
    ], transfers: [] };
  const row = transcripts(data)[0];
  assert.equal(row.gpa, 16);
  assert.equal(row.gradedCredits, 3);
  assert.equal(row.passedCredits, 3);
  assert.equal(row.totalCredits, 8);
  assert.deepEqual(row.missingRules, []);
});
