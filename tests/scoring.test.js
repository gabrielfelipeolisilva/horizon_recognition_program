/**
 * Scoring rules: relevance, criteria, total, 100-point maximum, 60-point eligibility.
 */
const Core = require('../src/core.js');

const allGrades = (categoryId, grade) =>
  Core.getCriteriaIds(categoryId).reduce((acc, id) => Object.assign(acc, { [id]: grade }), {});

describe('relevance score', () => {
  test.each([
    ['15', 15],
    ['30', 30],
    ['50', 50],
    [15, 15],
    [50, 50]
  ])('relevance %p is worth %p points', (level, expected) => {
    expect(Core.calculateRelevanceScore(level)).toBe(expected);
  });

  test('unknown or missing relevance is worth 0', () => {
    expect(Core.calculateRelevanceScore('20')).toBe(0);
    expect(Core.calculateRelevanceScore('')).toBe(0);
    expect(Core.calculateRelevanceScore(undefined)).toBe(0);
  });
});

describe('criteria score', () => {
  test('grades map to S=10, A=7, B=4', () => {
    expect(Core.calculateCriterionScore('S')).toBe(10);
    expect(Core.calculateCriterionScore('A')).toBe(7);
    expect(Core.calculateCriterionScore('B')).toBe(4);
    expect(Core.calculateCriterionScore('C')).toBe(0);
  });

  test('sums the 5 criteria of a category', () => {
    const criteria = { strategic_alignment: 'S', execution: 'A', innovation: 'B', impact: 'S', collaboration: 'A' };
    expect(Core.calculateCriteriaScore(criteria, 'business')).toBe(10 + 7 + 4 + 10 + 7);
  });

  test('ignores criteria that do not belong to the category', () => {
    const criteria = Object.assign(allGrades('business', 'B'), { strategic_thinking: 'S' });
    expect(Core.calculateCriteriaScore(criteria, 'business')).toBe(20);
  });

  test('every category has exactly 5 criteria', () => {
    Core.CATEGORIES.forEach((c) => expect(c.criteria).toHaveLength(Core.CRITERIA_PER_CATEGORY));
    expect(Core.CATEGORIES.map((c) => c.id)).toEqual(['business', 'cultural', 'innovation']);
  });

  test('empty criteria are worth 0', () => {
    expect(Core.calculateCriteriaScore({}, 'cultural')).toBe(0);
    expect(Core.calculateCriteriaScore(null, 'cultural')).toBe(0);
  });
});

describe('total score', () => {
  test('total = relevance + sum of criteria', () => {
    const criteria = { core_values: 'S', inclusivity_diversity: 'A', wellbeing: 'A', teamwork: 'B', impact: 'S' };
    expect(Core.calculateTotalScore('30', criteria, 'cultural')).toEqual({ relevance: 30, criteria: 38, total: 68 });
  });

  test('maximum possible score is exactly 100', () => {
    Core.CATEGORIES.forEach((c) => {
      expect(Core.calculateTotalScore('50', allGrades(c.id, 'S'), c.id).total).toBe(Core.MAX_SCORE);
    });
    expect(Core.MAX_SCORE).toBe(100);
  });

  test('total never exceeds 100 even with stray keys and no category filter', () => {
    const criteria = Object.assign(allGrades('business', 'S'), { extra: 'S' });
    expect(Core.calculateTotalScore('50', criteria).total).toBe(100);
  });

  test('minimum complete score is 35 (15 + 5 x B)', () => {
    expect(Core.calculateTotalScore('15', allGrades('innovation', 'B'), 'innovation').total).toBe(35);
  });

  test('score is complete only with relevance and the 5 grades', () => {
    const partial = { innovation: 'S', technical_expertise: 'S' };
    expect(Core.isScoreComplete('50', partial, 'innovation')).toBe(false);
    expect(Core.isScoreComplete('', allGrades('innovation', 'A'), 'innovation')).toBe(false);
    expect(Core.isScoreComplete('15', allGrades('innovation', 'A'), 'innovation')).toBe(true);
  });
});

describe('eligibility (minimum 60)', () => {
  test('threshold constant is 60', () => {
    expect(Core.MIN_ELIGIBLE_SCORE).toBe(60);
  });

  test.each([
    [59, false],
    [59.99, false],
    [60, true],
    [61, true],
    [100, true],
    [0, false]
  ])('score %p eligible = %p', (total, expected) => {
    expect(Core.isEligible(total)).toBe(expected);
  });

  test('a 55-point total is not eligible and misses 5 points', () => {
    expect(Core.isEligible(55)).toBe(false);
    expect(Core.pointsMissingForEligibility(55)).toBe(5);
    expect(Core.pointsMissingForEligibility(72)).toBe(0);
  });

  test('criteria sums are always 20 + 3k, so totals near 55 are 53 and 56', () => {
    // 10a + 7b + 4c with a + b + c = 5  ->  20 + 6a + 3b
    const reachable = new Set();
    ['15', '30', '50'].forEach((rel) => {
      for (let a = 0; a <= 5; a += 1) {
        for (let b = 0; a + b <= 5; b += 1) reachable.add(Core.calculateRelevanceScore(rel) + 20 + 6 * a + 3 * b);
      }
    });
    expect(reachable.has(55)).toBe(false);
    expect(reachable.has(53)).toBe(true);
    expect(reachable.has(56)).toBe(true);

    const s53 = Core.calculateTotalScore('15', { strategic_alignment: 'S', execution: 'S', innovation: 'S', impact: 'B', collaboration: 'B' }, 'business');
    const s56 = Core.calculateTotalScore('30', { strategic_alignment: 'A', execution: 'A', innovation: 'B', impact: 'B', collaboration: 'B' }, 'business');
    expect(s53.total).toBe(53);
    expect(s56.total).toBe(56);
    expect(Core.isEligible(s53.total)).toBe(false);
    expect(Core.isEligible(s56.total)).toBe(false);
  });

  test('createNomination stores the computed score and starts as Pending', () => {
    const n = Core.createNomination({
      nominator: { id: '10000005', name: 'A', area: 'B', location: 'C', cl: 'CL3', email: 'a@horizon.example', relationship: 'peer' },
      type: 'individual',
      nominee: { id: '10000014', name: 'D', area: 'E', location: 'F', cl: 'CL4', email: 'd@horizon.example' },
      category: 'innovation',
      criteria: { innovation: 'S', technical_expertise: 'S', impact: 'A', collaboration: 'A', strategic_thinking: 'B' },
      relevance: '30',
      title: 'T', description: 'D', evidence: 'E', attachments: []
    }, new Date('2026-01-01T10:00:00Z'));
    expect(n.score).toEqual({ relevance: 30, criteria: 38, total: 68 });
    expect(n.status).toBe('Pending');
    expect(n.reviewedBy).toBeNull();
    expect(n.boardEvaluations).toEqual([]);
    expect(n.id).toMatch(/^NOM-\d+-[0-9A-Z]{5}$/);
  });
});
