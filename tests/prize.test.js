/**
 * Prize rules: tier by ranking position, amounts, equal split for groups,
 * 1-star limits per category, consolidated board score and ranking.
 */
const Core = require('../src/core.js');

const person = (id) => ({ id, name: 'Person ' + id, area: 'R&D Division', location: 'Campinas', cl: 'CL3', email: 'p' + id + '@horizon.example' });

function gradesFor(categoryId, grades) {
  return Core.getCriteriaIds(categoryId).reduce((acc, id, i) => Object.assign(acc, { [id]: grades[i] }), {});
}

/** Builds a nomination with the given board evaluations ([relevance, grades] or 'conflict'). */
function makeNomination({ category = 'business', type = 'individual', members = 1, evals = [], status = 'Approved', created = '2026-01-01T10:00:00Z' }) {
  let n = Core.createNomination({
    nominator: Object.assign(person('20000000'), { relationship: 'peer' }),
    type,
    nominee: type === 'individual' ? person('20000001') : null,
    group: type === 'grupo' ? Array.from({ length: members }, (_, i) => person(String(20000100 + i))) : [],
    category,
    criteria: gradesFor(category, 'SSSSS'),
    relevance: '50',
    title: 'Title', description: 'Description', evidence: 'Evidence', attachments: []
  }, new Date(created));
  evals.forEach((ev, idx) => {
    const member = { id: String(30000000 + idx), name: 'Evaluator ' + idx };
    const draft = ev === 'conflict'
      ? { declaredConflict: true, conflictReason: 'same_project', conflictNotes: 'Worked together' }
      : { declaredConflict: false, relevance: ev[0], criteria: gradesFor(category, ev[1]), comments: 'Good work' };
    n = Core.addBoardEvaluation(n, Core.createBoardEvaluation(draft, category, member, new Date(created)));
  });
  return Object.assign(n, { status });
}

describe('determinePrizeTier (by position)', () => {
  test.each([
    [1, 'S'],
    [2, 'A'],
    [3, 'B'],
    [4, 'B'],
    [5, 'B'],
    [6, null],
    [10, null]
  ])('position %p -> %p', (position, tier) => {
    expect(Core.determinePrizeTier(position, 'business')).toBe(tier);
  });

  test('invalid positions have no tier', () => {
    expect(Core.determinePrizeTier(0)).toBeNull();
    expect(Core.determinePrizeTier(-1)).toBeNull();
    expect(Core.determinePrizeTier(2.5)).toBeNull();
    expect(Core.determinePrizeTier(undefined)).toBeNull();
  });

  test('tier amounts and stars', () => {
    expect(Core.PRIZE_TIERS.S).toEqual({ stars: 3, amount: 10000 });
    expect(Core.PRIZE_TIERS.A).toEqual({ stars: 2, amount: 5000 });
    expect(Core.PRIZE_TIERS.B).toEqual({ stars: 1, amount: 3000 });
    expect(Core.getTierStars('S')).toBe('★★★');
    expect(Core.getTierStars('A')).toBe('★★');
    expect(Core.getTierStars('B')).toBe('★');
    expect(Core.getTierStars(null)).toBe('');
  });
});

describe('1-star limits per category', () => {
  test('configured limits: Business 10, Cultural 5, Innovation 5', () => {
    expect(Core.ONE_STAR_LIMITS).toEqual({ business: 10, cultural: 5, innovation: 5 });
  });

  test('with the default limits the 3rd-5th window is the binding rule', () => {
    ['business', 'cultural', 'innovation'].forEach((cat) => {
      expect([3, 4, 5].map((p) => Core.determinePrizeTier(p, cat))).toEqual(['B', 'B', 'B']);
      expect(Core.determinePrizeTier(6, cat)).toBeNull();
    });
  });

  test('a lower limit caps the number of 1-star awards', () => {
    const limits = { business: 1, cultural: 2, innovation: 0 };
    expect(Core.determinePrizeTier(3, 'business', limits)).toBe('B');
    expect(Core.determinePrizeTier(4, 'business', limits)).toBeNull();
    expect(Core.determinePrizeTier(4, 'cultural', limits)).toBe('B');
    expect(Core.determinePrizeTier(5, 'cultural', limits)).toBeNull();
    expect(Core.determinePrizeTier(3, 'innovation', limits)).toBeNull();
    // S and A are never affected by the 1-star limit
    expect(Core.determinePrizeTier(1, 'innovation', limits)).toBe('S');
    expect(Core.determinePrizeTier(2, 'innovation', limits)).toBe('A');
  });

  test('ranking applies the limit', () => {
    const noms = [95, 90, 85, 80, 75].map((_, i) => makeNomination({ evals: [['50', ['SSSSS', 'SSSSA', 'SSSAA', 'SSAAA', 'SAAAA'][i]]] }));
    const ranking = Core.buildCategoryRanking(noms, 'business', { business: 2 });
    expect(ranking.ranked.map((e) => e.tier)).toEqual(['S', 'A', 'B', 'B', null]);
  });
});

describe('calculatePrizeAmount and group split', () => {
  test('individual prize', () => {
    expect(Core.calculatePrizeAmount('S', 1)).toEqual({ tier: 'S', total: 10000, perMember: 10000, members: 1 });
    expect(Core.calculatePrizeAmount('A')).toEqual({ tier: 'A', total: 5000, perMember: 5000, members: 1 });
  });

  test('group prize is split equally between members', () => {
    expect(Core.calculatePrizeAmount('S', 3).perMember).toBe(3333.33);
    expect(Core.calculatePrizeAmount('S', 4).perMember).toBe(2500);
    expect(Core.calculatePrizeAmount('A', 2).perMember).toBe(2500);
    expect(Core.calculatePrizeAmount('B', 3).perMember).toBe(1000);
    expect(Core.calculatePrizeAmount('S', 3).total).toBe(10000);
  });

  test('no tier means no prize', () => {
    expect(Core.calculatePrizeAmount(null, 3)).toEqual({ tier: null, total: 0, perMember: 0, members: 3 });
  });

  test('member count comes from the nomination type', () => {
    expect(Core.getMemberCount(makeNomination({}))).toBe(1);
    expect(Core.getMemberCount(makeNomination({ type: 'grupo', members: 3 }))).toBe(3);
  });

  test('currency uses the generic HZ$ symbol in pt-BR format', () => {
    expect(Core.formatCurrency(10000)).toBe('HZ$ 10.000,00');
    expect(Core.formatCurrency(3333.33)).toBe('HZ$ 3.333,33');
    expect(Core.formatCurrency(1234567.5)).toBe('HZ$ 1.234.567,50');
    expect(Core.formatCurrency(0)).toBe('HZ$ 0,00');
  });
});

describe('consolidated score', () => {
  test('board average ignores conflicted evaluations (2 normal + 1 conflict)', () => {
    // 50+50=100 and 30+41=71 -> average 85.5 ; conflict excluded
    const n = makeNomination({ evals: [['50', 'SSSSS'], ['30', 'SSAAA'], 'conflict'] });
    const c = Core.computeConsolidatedScore(n);
    expect(c.validCount).toBe(2);
    expect(c.conflictCount).toBe(1);
    expect(c.boardAverage).toEqual({ relevance: 40, criteria: 45.5, total: 85.5 });
    expect(c.finalScore).toEqual(c.boardAverage);
  });

  test('index score is a reference only and never enters the final score', () => {
    const n = makeNomination({ evals: [['15', 'BBBBB']] });
    const c = Core.computeConsolidatedScore(n);
    expect(c.indexScore.total).toBe(100);
    expect(c.finalScore.total).toBe(35);
  });

  test('no valid evaluations -> no final score', () => {
    expect(Core.computeBoardAverage([])).toBeNull();
    expect(Core.computeConsolidatedScore(makeNomination({ evals: ['conflict'] })).finalScore).toBeNull();
  });

  test('one evaluation per board member', () => {
    const n = makeNomination({ evals: [['50', 'SSSSS']] });
    const again = Core.createBoardEvaluation({ declaredConflict: false, relevance: '15', criteria: gradesFor('business', 'BBBBB'), comments: 'Again' }, 'business', { id: '30000000', name: 'Evaluator 0' });
    expect(() => Core.addBoardEvaluation(n, again)).toThrow('DUPLICATE_EVALUATION');
    expect(Core.hasEvaluated(n, '30000000')).toBe(true);
    expect(Core.hasEvaluated(n, '39999999')).toBe(false);
  });
});

describe('ranking and payments', () => {
  test('orders by final score and excludes rejected / unevaluated / below 60', () => {
    const top = makeNomination({ evals: [['50', 'SSSSS']] });
    const second = makeNomination({ evals: [['50', 'SAAAA']] });
    const rejected = makeNomination({ evals: [['50', 'SSSSS']], status: 'Rejected' });
    const waiting = makeNomination({ evals: [] });
    const low = makeNomination({ evals: [['15', 'ABBBB']] });
    const r = Core.buildCategoryRanking([second, low, top, rejected, waiting], 'business');
    expect(r.ranked.map((e) => e.nomination.id)).toEqual([top.id, second.id]);
    expect(r.ranked.map((e) => e.position)).toEqual([1, 2]);
    expect(r.unranked.map((e) => e.reason).sort()).toEqual(['belowMinimum', 'noEvaluations', 'rejected']);
  });

  test('group of 3 approved in 1st place -> prize split by 3', () => {
    const group = makeNomination({ type: 'grupo', members: 3, evals: [['50', 'SSSSS'], ['50', 'SSSSA']] });
    const other = makeNomination({ evals: [['30', 'SSAAA']] });
    const r = Core.buildCategoryRanking([other, group], 'business');
    const first = r.ranked[0];
    expect(first.nomination.id).toBe(group.id);
    expect(first.tier).toBe('S');
    expect(first.prize).toEqual({ tier: 'S', total: 10000, perMember: 3333.33, members: 3 });

    const lines = Core.buildPaymentLines([other, group]);
    const groupLines = lines.filter((l) => l.nominationId === group.id);
    expect(groupLines).toHaveLength(3);
    groupLines.forEach((l) => {
      expect(l.amount).toBe(3333.33);
      expect(l.position).toBe(1);
      expect(l.tier).toBe('S');
    });
    expect(lines.find((l) => l.nominationId === other.id)).toMatchObject({ position: 2, tier: 'A', amount: 5000 });
  });

  test('payments only include approved nominations with a tier', () => {
    const approved = makeNomination({ evals: [['50', 'SSSSS']], status: 'Approved' });
    const pending = makeNomination({ evals: [['50', 'SSSSA']], status: 'Pending' });
    const lines = Core.buildPaymentLines([approved, pending]);
    expect(lines).toHaveLength(1);
    expect(lines[0].nominationId).toBe(approved.id);
  });

  test('financial summary totals approved prizes per category', () => {
    const b1 = makeNomination({ category: 'business', type: 'grupo', members: 3, evals: [['50', 'SSSSS']] });
    const b2 = makeNomination({ category: 'business', evals: [['50', 'SSSAA']] });
    const b3 = makeNomination({ category: 'business', evals: [['30', 'SSAAA']], status: 'Under Review' });
    const c1 = makeNomination({ category: 'cultural', evals: [['50', 'SSSSS']] });
    const summary = Core.computeFinancialSummary([b1, b2, b3, c1]);
    expect(summary.byCategory.business).toEqual({ amount: 15000, awards: 2, recipients: 4 });
    expect(summary.byCategory.cultural).toEqual({ amount: 10000, awards: 1, recipients: 1 });
    expect(summary.byCategory.innovation).toEqual({ amount: 0, awards: 0, recipients: 0 });
    expect(summary.total).toBe(25000);
  });

  test('status changes record reviewer and date', () => {
    const n = makeNomination({ status: 'Pending' });
    const updated = Core.applyStatusChange(n, 'Approved', Core.USERS.ADMIN, new Date('2026-02-01T12:00:00Z'));
    expect(updated.status).toBe('Approved');
    expect(updated.reviewedBy).toBe('Admin');
    expect(updated.reviewedAt).toBe('2026-02-01T12:00:00.000Z');
    expect(n.status).toBe('Pending');
    expect(() => Core.applyStatusChange(n, 'Done', Core.USERS.ADMIN)).toThrow();
  });
});
