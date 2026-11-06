/**
 * Self-nomination: optional, individual only, nominee = nominator,
 * relationship stored as "self", flag persisted and back-compatible.
 */
const Core = require('../src/core.js');

const person = (id, extra) => Object.assign({ id, name: 'Name ' + id, area: 'Finance', location: 'São Paulo', cl: 'CL3', email: 'user' + id + '@horizon.example' }, extra);

function selfNomination(overrides) {
  const nominator = person('10000005');
  return Object.assign({
    selfNomination: true,
    nominator: Object.assign({}, nominator, { relationship: 'self' }),
    type: 'individual',
    nominee: Object.assign({}, nominator),
    group: [],
    category: 'cultural',
    criteria: { core_values: 'S', inclusivity_diversity: 'A', wellbeing: 'A', teamwork: 'S', impact: 'A' },
    relevance: '30',
    title: 'Mentoring circle for new joiners',
    description: 'Organized a monthly mentoring circle for people in their first 90 days.',
    evidence: 'Retention of new joiners rose from 81% to 93%.',
    attachments: []
  }, overrides);
}

const codeFor = (result, field) => (result.errors.find((e) => e.field === field) || {}).code;

describe('self-nomination validation', () => {
  test('a self-nomination copying the nominator is valid', () => {
    const r = Core.validateNomination(selfNomination());
    expect(r.errors).toEqual([]);
  });

  test('the relationship is not required (it is implicit)', () => {
    const data = selfNomination();
    delete data.nominator.relationship;
    expect(Core.validateNomination(data).valid).toBe(true);
  });

  test('nominee data must match the nominator exactly', () => {
    const r = Core.validateNomination(selfNomination({ nominee: person('10000005', { email: 'other@horizon.example' }) }));
    expect(codeFor(r, 'nominee.id')).toBe('selfMismatch');
    const r2 = Core.validateNomination(selfNomination({ nominee: person('10000014') }));
    expect(codeFor(r2, 'nominee.id')).toBe('selfMismatch');
  });

  test('self-nominations must be individual', () => {
    const r = Core.validateNomination(selfNomination({ type: 'grupo', nominee: null, group: [person('10000005'), person('10000014')] }));
    expect(codeFor(r, 'selfNomination')).toBe('selfGroup');
  });

  test('the nominator data is still validated', () => {
    const bad = person('10000005', { email: 'invalid' });
    const r = Core.validateNomination(selfNomination({ nominator: Object.assign({}, bad, { relationship: 'self' }), nominee: bad }));
    expect(codeFor(r, 'nominator.email')).toBe('invalidEmail');
  });

  test('using your own ID without choosing "Myself" is still an error', () => {
    const r = Core.validateNomination(selfNomination({
      selfNomination: false,
      nominator: Object.assign(person('10000005'), { relationship: 'peer' })
    }));
    expect(codeFor(r, 'nominee.id')).toBe('selfNomination');
  });

  test('without the flag the relationship is still required', () => {
    const data = selfNomination({ selfNomination: false, nominee: person('10000014') });
    data.nominator.relationship = '';
    expect(codeFor(Core.validateNomination(data), 'nominator.relationship')).toBe('required');
  });

  test('isSamePerson compares every person field', () => {
    expect(Core.isSamePerson(person('10000001'), person('10000001'))).toBe(true);
    expect(Core.isSamePerson(person('10000001'), person('10000001', { cl: 'CL4' }))).toBe(false);
    expect(Core.isSamePerson(person('10000001'), null)).toBe(false);
  });
});

describe('self-nomination records', () => {
  test('createNomination stores the flag, relationship "self" and the nominator as nominee', () => {
    const n = Core.createNomination(selfNomination({ nominee: person('99999999') }), new Date('2026-11-05T12:00:00Z'));
    expect(n.selfNomination).toBe(true);
    expect(n.nominator.relationship).toBe('self');
    expect(n.nominee).toEqual(person('10000005'));
    expect(n.score.total).toBe(30 + 10 + 7 + 7 + 10 + 7);
  });

  test('nominations by others are stored with selfNomination = false', () => {
    const n = Core.createNomination(selfNomination({
      selfNomination: false,
      nominator: Object.assign(person('10000005'), { relationship: 'manager' }),
      nominee: person('10000014')
    }));
    expect(n.selfNomination).toBe(false);
    expect(n.nominator.relationship).toBe('manager');
  });

  test('older records without the flag are read as nominations by others', () => {
    const legacy = { id: 'NOM-1', status: 'Pending' };
    expect(Core.normalizeNomination(legacy).selfNomination).toBe(false);
    expect(Core.normalizeNomination(Object.assign({}, legacy, { selfNomination: 'yes' })).selfNomination).toBe(false);
    expect(Core.normalizeNomination(Object.assign({}, legacy, { selfNomination: true })).selfNomination).toBe(true);
  });

  test('scoring, ranking and prizes treat self-nominations like any other', () => {
    let n = Core.createNomination(selfNomination(), new Date('2026-11-05T12:00:00Z'));
    n = Core.addBoardEvaluation(n, Core.createBoardEvaluation(
      { declaredConflict: false, relevance: '50', criteria: { core_values: 'S', inclusivity_diversity: 'S', wellbeing: 'S', teamwork: 'S', impact: 'S' }, comments: 'Excellent' },
      'cultural', { id: '00000002', name: 'Board Member' }
    ));
    n.status = 'Approved';
    const ranking = Core.buildCategoryRanking([n], 'cultural');
    expect(ranking.ranked[0]).toMatchObject({ position: 1, tier: 'S' });
    expect(Core.buildPaymentLines([n])[0]).toMatchObject({ amount: 10000, recipient: { id: '10000005' } });
  });
});
