/**
 * Validation rules: required fields, email format, worker IDs, group members,
 * attachments, board evaluations and the workers spreadsheet parser.
 */
const Core = require('../src/core.js');

const person = (id, extra) => Object.assign({ id, name: 'Name ' + id, area: 'Finance', location: 'São Paulo', cl: 'CL3', email: 'user' + id + '@horizon.example' }, extra);

function validNomination(overrides) {
  return Object.assign({
    nominator: person('10000005', { relationship: 'manager' }),
    type: 'individual',
    nominee: person('10000014'),
    group: [],
    category: 'innovation',
    criteria: { innovation: 'S', technical_expertise: 'S', impact: 'A', collaboration: 'A', strategic_thinking: 'B' },
    relevance: '30',
    title: 'AI assistant for test reports',
    description: 'A long enough description of the contribution and its context.',
    evidence: 'Report time dropped from 6h to 40min.',
    attachments: []
  }, overrides);
}

const fieldsOf = (result) => result.errors.map((e) => e.field);
const codeFor = (result, field) => (result.errors.find((e) => e.field === field) || {}).code;

describe('email format', () => {
  test.each(['ana@horizon.example', 'a.b-c@sub.domain.com', ' trim@horizon.example '])('%p is valid', (email) => {
    expect(Core.isValidEmail(email)).toBe(true);
  });
  test.each(['', 'plain', 'no@tld', '@horizon.example', 'a b@horizon.example', 'a@b.c', null, undefined])('%p is invalid', (email) => {
    expect(Core.isValidEmail(email)).toBe(false);
  });
});

describe('worker IDs', () => {
  test('IDs have exactly 8 digits', () => {
    expect(Core.isValidWorkerId('10000001')).toBe(true);
    expect(Core.isValidWorkerId('00000001')).toBe(true);
    expect(Core.isValidWorkerId('1000001')).toBe(false);
    expect(Core.isValidWorkerId('100000011')).toBe(false);
    expect(Core.isValidWorkerId('1000000A')).toBe(false);
    expect(Core.isValidWorkerId(10000001)).toBe(false);
  });

  test('numeric IDs from spreadsheets are left-padded to 8 digits', () => {
    expect(Core.normalizeWorkerId(123)).toBe('00000123');
    expect(Core.normalizeWorkerId(' 42 ')).toBe('00000042');
    expect(Core.normalizeWorkerId('10000001')).toBe('10000001');
    expect(Core.normalizeWorkerId('ABC')).toBe('ABC');
  });
});

describe('validateNomination — required fields', () => {
  test('a complete nomination is valid', () => {
    const r = Core.validateNomination(validNomination());
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  test('an empty payload reports every required block', () => {
    const r = Core.validateNomination({});
    expect(r.valid).toBe(false);
    expect(fieldsOf(r)).toEqual(expect.arrayContaining([
      'nominator.id', 'nominator.name', 'nominator.email', 'nominator.relationship',
      'type', 'category', 'relevance', 'title', 'description', 'evidence'
    ]));
  });

  test('missing nominee fields are reported individually', () => {
    const r = Core.validateNomination(validNomination({ nominee: person('10000014', { name: '', cl: '  ' }) }));
    expect(fieldsOf(r)).toEqual(['nominee.name', 'nominee.cl']);
  });

  test('invalid nominator email and ID', () => {
    const r = Core.validateNomination(validNomination({ nominator: person('123', { email: 'wrong', relationship: 'peer' }) }));
    expect(codeFor(r, 'nominator.id')).toBe('invalidId');
    expect(codeFor(r, 'nominator.email')).toBe('invalidEmail');
  });

  test('relationship must be one of the allowed values', () => {
    const r = Core.validateNomination(validNomination({ nominator: person('10000005', { relationship: 'friend' }) }));
    expect(fieldsOf(r)).toEqual(['nominator.relationship']);
  });

  test('own ID without choosing "Myself" is rejected with a hint', () => {
    const r = Core.validateNomination(validNomination({ nominee: person('10000005') }));
    expect(codeFor(r, 'nominee.id')).toBe('selfNomination');
  });

  test('all 5 criteria of the category are required', () => {
    const r = Core.validateNomination(validNomination({ criteria: { innovation: 'S', impact: 'X' } }));
    expect(fieldsOf(r)).toEqual(['criteria.technical_expertise', 'criteria.impact', 'criteria.collaboration', 'criteria.strategic_thinking']);
  });

  test('category and relevance must be valid', () => {
    const r = Core.validateNomination(validNomination({ category: 'sports', relevance: '20' }));
    expect(fieldsOf(r)).toEqual(['category', 'relevance']);
  });

  test('text length limits', () => {
    const r = Core.validateNomination(validNomination({ title: 'x'.repeat(121), description: 'short', evidence: 'tiny' }));
    expect(codeFor(r, 'title')).toBe('tooLong');
    expect(codeFor(r, 'description')).toBe('tooShort');
    expect(codeFor(r, 'evidence')).toBe('tooShort');
    expect(r.errors.find((e) => e.field === 'description').params).toEqual({ min: Core.FIELD_LIMITS.descriptionMin });
  });

  test('whitespace-only text counts as empty', () => {
    const r = Core.validateNomination(validNomination({ title: '   ' }));
    expect(codeFor(r, 'title')).toBe('required');
  });
});

describe('validateNomination — group members', () => {
  const group = (members) => validNomination({ type: 'grupo', nominee: null, group: members });

  test('a group with valid members is valid', () => {
    expect(Core.validateNomination(group([person('10000001'), person('10000002'), person('10000003')])).valid).toBe(true);
  });

  test('a group with one member is allowed (1+ members)', () => {
    expect(Core.validateNomination(group([person('10000001')])).valid).toBe(true);
  });

  test('an empty group is rejected', () => {
    expect(codeFor(Core.validateNomination(group([])), 'group')).toBe('groupEmpty');
  });

  test('each member is validated with its index', () => {
    const r = Core.validateNomination(group([person('10000001'), person('99', { email: 'bad' })]));
    expect(codeFor(r, 'group.1.id')).toBe('invalidId');
    expect(codeFor(r, 'group.1.email')).toBe('invalidEmail');
  });

  test('duplicated members are rejected', () => {
    const r = Core.validateNomination(group([person('10000001'), person('10000001')]));
    expect(codeFor(r, 'group.1.id')).toBe('duplicateMember');
  });

  test('the nominator cannot be a group member', () => {
    const r = Core.validateNomination(group([person('10000001'), person('10000005')]));
    expect(codeFor(r, 'group.1.id')).toBe('selfNomination');
  });
});

describe('attachments', () => {
  const file = (name, size) => ({ name, size: size || 1000, type: '' });

  test('allowed types and sizes', () => {
    expect(Core.validateAttachment(file('report.pdf'), [])).toBeNull();
    expect(Core.validateAttachment(file('photo.JPG'), [])).toBeNull();
    expect(Core.validateAttachment(file('script.exe'), [])).toBe('fileType');
    expect(Core.validateAttachment(file('noext'), [])).toBe('fileType');
    expect(Core.validateAttachment(file('big.pdf', 11 * 1024 * 1024), [])).toBe('fileSize');
  });

  test('maximum of 5 files and no duplicates', () => {
    const five = [1, 2, 3, 4, 5].map((i) => file('f' + i + '.pdf'));
    expect(Core.validateAttachment(file('six.pdf'), five)).toBe('fileCount');
    expect(Core.validateAttachment(file('f1.pdf'), [file('f1.pdf')])).toBe('fileDuplicate');
  });
});

describe('board evaluation validation', () => {
  const criteria = { strategic_alignment: 'S', execution: 'A', innovation: 'A', impact: 'B', collaboration: 'S' };

  test('conflict declaration is mandatory', () => {
    expect(Core.validateBoardEvaluation({}, 'business').errors[0]).toEqual({ field: 'declaredConflict', code: 'required' });
  });

  test('conflict requires reason and notes, but no scores', () => {
    expect(Core.validateBoardEvaluation({ declaredConflict: true }, 'business').errors.map((e) => e.field)).toEqual(['conflictReason', 'conflictNotes']);
    expect(Core.validateBoardEvaluation({ declaredConflict: true, conflictReason: 'same_project', conflictNotes: 'Same squad last year' }, 'business').valid).toBe(true);
  });

  test('a normal evaluation needs relevance, 5 criteria and comments', () => {
    const r = Core.validateBoardEvaluation({ declaredConflict: false }, 'business');
    expect(r.errors.map((e) => e.field)).toEqual(['relevance', 'criteria.strategic_alignment', 'criteria.execution', 'criteria.innovation', 'criteria.impact', 'criteria.collaboration', 'comments']);
    expect(Core.validateBoardEvaluation({ declaredConflict: false, relevance: '50', criteria, comments: 'Solid evidence of impact.' }, 'business').valid).toBe(true);
  });

  test('conflict evaluations are stored without scores', () => {
    const e = Core.createBoardEvaluation({ declaredConflict: true, conflictReason: 'other', conflictNotes: 'Family member' }, 'business', Core.USERS.BOARD);
    expect(e.scores).toBeNull();
    expect(e.declaredConflict).toBe(true);
    expect(e.evaluatorId).toBe('00000002');
  });
});

describe('workers spreadsheet parsing', () => {
  test('maps columns case-insensitively and accepts PT aliases', () => {
    const rows = [{ ID: '1', Nome: 'Ana', Área: 'Finance', Localização: 'Recife', CL: 'CL2', 'E-mail': 'ANA@horizon.example' }];
    const r = Core.parseWorkerRows(rows);
    expect(r.missingColumns).toEqual([]);
    expect(r.workers).toEqual([{ id: '00000001', name: 'Ana', area: 'Finance', location: 'Recife', cl: 'CL2', email: 'ana@horizon.example' }]);
  });

  test('reports missing required columns', () => {
    const r = Core.parseWorkerRows([{ id: '10000001', name: 'Ana' }]);
    expect(r.missingColumns).toEqual(['area', 'location', 'cl', 'email']);
    expect(r.workers).toEqual([]);
  });

  test('skips invalid rows, ignores blank rows and keeps the last duplicate', () => {
    const base = { area: 'IT', location: 'Remote', cl: 'CL3' };
    const rows = [
      Object.assign({ id: '10000001', name: 'First', email: 'a@horizon.example' }, base),
      Object.assign({ id: '10000002', name: 'Bad email', email: 'nope' }, base),
      { id: '', name: '', area: '', location: '', cl: '', email: '' },
      Object.assign({ id: '10000001', name: 'Second', email: 'b@horizon.example' }, base)
    ];
    const r = Core.parseWorkerRows(rows);
    expect(r.invalidRows).toEqual([3]);
    expect(r.duplicates).toBe(1);
    expect(r.workers).toHaveLength(1);
    expect(r.workers[0].name).toBe('Second');
  });
});
