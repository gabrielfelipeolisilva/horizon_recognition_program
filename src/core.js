/**
 * Horizon Recognition Program — shared core module.
 *
 * Contains every business rule (scoring, eligibility, prizes, ranking,
 * consolidated board score, validation), the localStorage data layer and a
 * small set of DOM helpers shared by the three panels.
 *
 * The business-rule section is pure (no DOM, no storage) so it can be tested
 * with Jest in Node. The file works both as a browser global (window.HorizonCore)
 * and as a CommonJS module (require('../src/core.js')).
 */
(function (root, factory) {
  const core = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = core;
  } else {
    root.HorizonCore = core;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constants                                                           */
  /* ------------------------------------------------------------------ */

  const STORAGE_KEYS = Object.freeze({
    nominations: 'hr_nominations',
    workers: 'hr_workers_updated',
    language: 'hr_language',
    theme: 'hr_theme',
    myNominations: 'hr_my_nominations',
    session: 'hr_session',
    loginAttempts: 'hr_login_attempts'
  });

  const USERS = Object.freeze({
    ADMIN: Object.freeze({ id: '00000001', name: 'Admin', area: 'People & Culture', role: 'admin' }),
    BOARD: Object.freeze({ id: '00000002', name: 'Board Member', area: 'R&D Division', role: 'board' })
  });

  // Extra mock evaluators so the "one evaluation per member" rule and the
  // conflict-of-interest average can be demonstrated in a single browser.
  const BOARD_MEMBERS = Object.freeze([
    USERS.BOARD,
    Object.freeze({ id: '00000003', name: 'Board Member 2', area: 'Finance', role: 'board' }),
    Object.freeze({ id: '00000004', name: 'Board Member 3', area: 'Operations', role: 'board' })
  ]);

  const CATEGORIES = Object.freeze([
    Object.freeze({
      id: 'business',
      label: 'Business/Project Excellence',
      criteria: Object.freeze(['strategic_alignment', 'execution', 'innovation', 'impact', 'collaboration'])
    }),
    Object.freeze({
      id: 'cultural',
      label: 'Cultural Impact',
      criteria: Object.freeze(['core_values', 'inclusivity_diversity', 'wellbeing', 'teamwork', 'impact'])
    }),
    Object.freeze({
      id: 'innovation',
      label: 'Innovation and AI Excellence',
      criteria: Object.freeze(['innovation', 'technical_expertise', 'impact', 'collaboration', 'strategic_thinking'])
    })
  ]);

  // English labels used in spreadsheet exports (exports are language-neutral).
  const CRITERIA_LABELS = Object.freeze({
    business: {
      strategic_alignment: 'Strategic Alignment',
      execution: 'Execution',
      innovation: 'Innovation',
      impact: 'Impact',
      collaboration: 'Collaboration'
    },
    cultural: {
      core_values: 'Promotion of Core Values',
      inclusivity_diversity: 'Inclusivity and Diversity',
      wellbeing: 'Employee Well-being',
      teamwork: 'Collaboration and Teamwork',
      impact: 'Impact'
    },
    innovation: {
      innovation: 'Innovation',
      technical_expertise: 'Technical Expertise',
      impact: 'Impact',
      collaboration: 'Collaboration',
      strategic_thinking: 'Strategic Thinking'
    }
  });

  const RELEVANCE_LEVELS = Object.freeze({
    15: Object.freeze({ points: 15, key: 'relevant' }),
    30: Object.freeze({ points: 30, key: 'significant' }),
    50: Object.freeze({ points: 50, key: 'exceptional' })
  });

  const CRITERIA_GRADES = Object.freeze({ S: 10, A: 7, B: 4 });

  const MAX_SCORE = 100;
  const MIN_ELIGIBLE_SCORE = 60;
  const CRITERIA_PER_CATEGORY = 5;

  const PRIZE_TIERS = Object.freeze({
    S: Object.freeze({ stars: 3, amount: 10000 }),
    A: Object.freeze({ stars: 2, amount: 5000 }),
    B: Object.freeze({ stars: 1, amount: 3000 })
  });

  // Maximum number of 1-star (tier B) awards per category.
  const ONE_STAR_LIMITS = Object.freeze({ business: 10, cultural: 5, innovation: 5 });

  // Ranking window that receives tier B (positions 3 to 5).
  const TIER_B_FIRST_POSITION = 3;
  const TIER_B_LAST_POSITION = 5;

  const STATUSES = Object.freeze(['Pending', 'Under Review', 'Approved', 'Rejected']);
  const NOMINATION_TYPES = Object.freeze(['individual', 'grupo']);
  const RELATIONSHIPS = Object.freeze(['manager', 'peer', 'direct_report', 'other']);
  const CONFLICT_REASONS = Object.freeze(['direct_report', 'close_relationship', 'same_project', 'nominator', 'other']);

  const FIELD_LIMITS = Object.freeze({
    titleMax: 120,
    descriptionMin: 30,
    descriptionMax: 3000,
    evidenceMin: 20,
    evidenceMax: 3000,
    commentsMin: 10,
    commentsMax: 1000,
    conflictNotesMin: 10,
    conflictNotesMax: 500
  });

  const ATTACHMENT_RULES = Object.freeze({
    maxFiles: 5,
    maxFileSize: 10 * 1024 * 1024,
    allowedExtensions: Object.freeze(['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'])
  });

  const WORKER_ID_PATTERN = /^\d{8}$/;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ------------------------------------------------------------------ */
  /* Generic helpers                                                     */
  /* ------------------------------------------------------------------ */

  function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Formats an amount with the generic program currency in pt-BR notation.
   * 10000 -> "HZ$ 10.000,00". Implemented manually so the output does not
   * depend on the ICU data available in the runtime.
   */
  function formatCurrency(amount) {
    const value = round2(Number(amount) || 0);
    const negative = value < 0;
    const [intPart, decPart] = Math.abs(value).toFixed(2).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (negative ? '-' : '') + 'HZ$ ' + grouped + ',' + decPart;
  }

  /* ------------------------------------------------------------------ */
  /* Categories                                                          */
  /* ------------------------------------------------------------------ */

  function getCategory(categoryId) {
    return CATEGORIES.find((c) => c.id === categoryId) || null;
  }

  function getCriteriaIds(categoryId) {
    const category = getCategory(categoryId);
    return category ? category.criteria.slice() : [];
  }

  function isValidCategory(categoryId) {
    return getCategory(categoryId) !== null;
  }

  /* ------------------------------------------------------------------ */
  /* Scoring                                                             */
  /* ------------------------------------------------------------------ */

  function calculateRelevanceScore(level) {
    const entry = RELEVANCE_LEVELS[String(level)];
    return entry ? entry.points : 0;
  }

  function calculateCriterionScore(grade) {
    return Object.prototype.hasOwnProperty.call(CRITERIA_GRADES, grade) ? CRITERIA_GRADES[grade] : 0;
  }

  /**
   * Sums the criteria grades. When a category is given, only that
   * category's 5 criteria are counted (stray keys are ignored).
   */
  function calculateCriteriaScore(criteria, categoryId) {
    if (!criteria || typeof criteria !== 'object') return 0;
    const ids = categoryId ? getCriteriaIds(categoryId) : Object.keys(criteria);
    return ids.reduce((sum, id) => sum + calculateCriterionScore(criteria[id]), 0);
  }

  function calculateTotalScore(relevance, criteria, categoryId) {
    const relevanceScore = calculateRelevanceScore(relevance);
    const criteriaScore = calculateCriteriaScore(criteria, categoryId);
    return {
      relevance: relevanceScore,
      criteria: criteriaScore,
      total: Math.min(MAX_SCORE, relevanceScore + criteriaScore)
    };
  }

  function isScoreComplete(relevance, criteria, categoryId) {
    if (!RELEVANCE_LEVELS[String(relevance)]) return false;
    const ids = getCriteriaIds(categoryId);
    if (ids.length !== CRITERIA_PER_CATEGORY) return false;
    return ids.every((id) => criteria && calculateCriterionScore(criteria[id]) > 0);
  }

  function isEligible(total) {
    return Number(total) >= MIN_ELIGIBLE_SCORE;
  }

  function pointsMissingForEligibility(total) {
    return Math.max(0, round2(MIN_ELIGIBLE_SCORE - (Number(total) || 0)));
  }

  /* ------------------------------------------------------------------ */
  /* Prizes                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Tier by ranking position (never by raw score):
   * 1 -> S, 2 -> A, 3..5 -> B (capped by the category's 1-star limit), >5 -> null.
   */
  function determinePrizeTier(position, categoryId, limits) {
    const pos = Number(position);
    if (!Number.isInteger(pos) || pos < 1) return null;
    if (pos === 1) return 'S';
    if (pos === 2) return 'A';
    if (pos >= TIER_B_FIRST_POSITION && pos <= TIER_B_LAST_POSITION) {
      const table = limits || ONE_STAR_LIMITS;
      const limit = categoryId && Object.prototype.hasOwnProperty.call(table, categoryId)
        ? table[categoryId]
        : Infinity;
      const oneStarIndex = pos - TIER_B_FIRST_POSITION + 1; // 1-based count of B awards
      return oneStarIndex <= limit ? 'B' : null;
    }
    return null;
  }

  function getTierStars(tier) {
    const entry = PRIZE_TIERS[tier];
    return entry ? '★'.repeat(entry.stars) : '';
  }

  function getMemberCount(nomination) {
    if (!nomination) return 1;
    if (nomination.type === 'grupo') {
      return Array.isArray(nomination.group) && nomination.group.length > 0 ? nomination.group.length : 1;
    }
    return 1;
  }

  function getRecipients(nomination) {
    if (!nomination) return [];
    if (nomination.type === 'grupo') return Array.isArray(nomination.group) ? nomination.group.slice() : [];
    return nomination.nominee ? [nomination.nominee] : [];
  }

  /**
   * Prize amount for a tier. Group prizes are split equally between members.
   * Returns { tier, total, perMember, members }.
   */
  function calculatePrizeAmount(tier, memberCount) {
    const members = Math.max(1, Math.floor(Number(memberCount) || 1));
    const entry = PRIZE_TIERS[tier];
    if (!entry) return { tier: null, total: 0, perMember: 0, members };
    return {
      tier,
      total: entry.amount,
      perMember: round2(entry.amount / members),
      members
    };
  }

  /* ------------------------------------------------------------------ */
  /* Consolidated score & ranking                                        */
  /* ------------------------------------------------------------------ */

  function isValidEvaluation(evaluation) {
    return Boolean(evaluation) && !evaluation.declaredConflict && Boolean(evaluation.scores);
  }

  /** Average of every board evaluation that did NOT declare a conflict. */
  function computeBoardAverage(evaluations) {
    const valid = (Array.isArray(evaluations) ? evaluations : []).filter(isValidEvaluation);
    if (valid.length === 0) return null;
    const sum = valid.reduce(
      (acc, e) => ({
        relevance: acc.relevance + (Number(e.scores.relevance) || 0),
        criteria: acc.criteria + (Number(e.scores.criteria) || 0),
        total: acc.total + (Number(e.scores.total) || 0)
      }),
      { relevance: 0, criteria: 0, total: 0 }
    );
    return {
      relevance: round2(sum.relevance / valid.length),
      criteria: round2(sum.criteria / valid.length),
      total: round2(sum.total / valid.length)
    };
  }

  /** indexScore is reference only; finalScore = board average. */
  function computeConsolidatedScore(nomination) {
    const evaluations = Array.isArray(nomination && nomination.boardEvaluations) ? nomination.boardEvaluations : [];
    const boardAverage = computeBoardAverage(evaluations);
    return {
      indexScore: (nomination && nomination.score) || null,
      boardAverage,
      finalScore: boardAverage,
      validCount: evaluations.filter(isValidEvaluation).length,
      conflictCount: evaluations.filter((e) => e && e.declaredConflict).length,
      totalEvaluations: evaluations.length
    };
  }

  function compareRankingEntries(a, b) {
    const fa = a.consolidated.finalScore;
    const fb = b.consolidated.finalScore;
    if (fb.total !== fa.total) return fb.total - fa.total;
    if (fb.criteria !== fa.criteria) return fb.criteria - fa.criteria;
    if (b.consolidated.validCount !== a.consolidated.validCount) {
      return b.consolidated.validCount - a.consolidated.validCount;
    }
    return String(a.nomination.createdAt).localeCompare(String(b.nomination.createdAt));
  }

  /**
   * Ranking of one category. Only nominations that are not rejected, have at
   * least one valid (non-conflict) board evaluation and a final score >= 60
   * are ranked. Everything else is returned in `unranked` with a reason.
   */
  function buildCategoryRanking(nominations, categoryId, limits) {
    const entries = (Array.isArray(nominations) ? nominations : [])
      .filter((n) => n && n.category === categoryId)
      .map((n) => ({ nomination: n, consolidated: computeConsolidatedScore(n) }));

    const ranked = [];
    const unranked = [];

    entries.forEach((entry) => {
      let reason = null;
      if (entry.nomination.status === 'Rejected') reason = 'rejected';
      else if (!entry.consolidated.finalScore) reason = 'noEvaluations';
      else if (!isEligible(entry.consolidated.finalScore.total)) reason = 'belowMinimum';
      if (reason) unranked.push(Object.assign({}, entry, { position: null, tier: null, prize: calculatePrizeAmount(null, getMemberCount(entry.nomination)), reason }));
      else ranked.push(entry);
    });

    ranked.sort(compareRankingEntries);

    const rankedWithTier = ranked.map((entry, index) => {
      const position = index + 1;
      const tier = determinePrizeTier(position, categoryId, limits);
      return Object.assign({}, entry, {
        position,
        tier,
        prize: calculatePrizeAmount(tier, getMemberCount(entry.nomination)),
        reason: null
      });
    });

    return { categoryId, ranked: rankedWithTier, unranked };
  }

  function buildAllRankings(nominations, limits) {
    const result = {};
    CATEGORIES.forEach((c) => {
      result[c.id] = buildCategoryRanking(nominations, c.id, limits);
    });
    return result;
  }

  function findRankingEntry(rankings, nominationId) {
    const ids = Object.keys(rankings || {});
    for (let i = 0; i < ids.length; i += 1) {
      const r = rankings[ids[i]];
      const hit = r.ranked.find((e) => e.nomination.id === nominationId) || r.unranked.find((e) => e.nomination.id === nominationId);
      if (hit) return hit;
    }
    return null;
  }

  /** Approved bonuses, total and per category (group prize split by members). */
  function computeFinancialSummary(nominations, limits) {
    const rankings = buildAllRankings(nominations, limits);
    const summary = { total: 0, awards: 0, recipients: 0, byCategory: {} };
    CATEGORIES.forEach((c) => {
      const bucket = { amount: 0, awards: 0, recipients: 0 };
      rankings[c.id].ranked.forEach((entry) => {
        if (entry.tier && entry.nomination.status === 'Approved') {
          bucket.amount = round2(bucket.amount + entry.prize.total);
          bucket.awards += 1;
          bucket.recipients += entry.prize.members;
        }
      });
      summary.byCategory[c.id] = bucket;
      summary.total = round2(summary.total + bucket.amount);
      summary.awards += bucket.awards;
      summary.recipients += bucket.recipients;
    });
    return summary;
  }

  /** One payment line per recipient for approved, awarded nominations. */
  function buildPaymentLines(nominations, limits) {
    const rankings = buildAllRankings(nominations, limits);
    const lines = [];
    CATEGORIES.forEach((c) => {
      rankings[c.id].ranked.forEach((entry) => {
        if (!entry.tier || entry.nomination.status !== 'Approved') return;
        getRecipients(entry.nomination).forEach((person) => {
          lines.push({
            nominationId: entry.nomination.id,
            categoryId: c.id,
            position: entry.position,
            tier: entry.tier,
            stars: getTierStars(entry.tier),
            type: entry.nomination.type,
            members: entry.prize.members,
            prizeTotal: entry.prize.total,
            amount: entry.prize.perMember,
            finalScore: entry.consolidated.finalScore.total,
            recipient: person
          });
        });
      });
    });
    return lines;
  }

  /* ------------------------------------------------------------------ */
  /* Status workflow                                                     */
  /* ------------------------------------------------------------------ */

  function isValidStatus(status) {
    return STATUSES.indexOf(status) !== -1;
  }

  function statusSlug(status) {
    return String(status || '').toLowerCase().replace(/\s+/g, '-');
  }

  function statusKey(status) {
    return 'status.' + statusSlug(status).replace(/-/g, '_');
  }

  /** Returns a new nomination with the status applied and the audit fields set. */
  function applyStatusChange(nomination, status, reviewer, now) {
    if (!isValidStatus(status)) throw new Error('Invalid status: ' + status);
    const date = now instanceof Date ? now : new Date(now || Date.now());
    return Object.assign({}, nomination, {
      status,
      reviewedBy: reviewer && reviewer.name ? reviewer.name : String(reviewer || ''),
      reviewedAt: date.toISOString()
    });
  }

  /* ------------------------------------------------------------------ */
  /* Validation                                                          */
  /* ------------------------------------------------------------------ */

  function isValidEmail(email) {
    return typeof email === 'string' && EMAIL_PATTERN.test(email.trim());
  }

  function isValidWorkerId(id) {
    return typeof id === 'string' && WORKER_ID_PATTERN.test(id.trim());
  }

  /** "123" -> "00000123"; non-numeric values are returned trimmed. */
  function normalizeWorkerId(value) {
    const text = String(value === null || value === undefined ? '' : value).trim();
    if (/^\d{1,8}$/.test(text)) return text.padStart(8, '0');
    return text;
  }

  const PERSON_FIELDS = Object.freeze(['id', 'name', 'area', 'location', 'cl', 'email']);

  function validatePerson(person, prefix) {
    const errors = [];
    const p = person || {};
    PERSON_FIELDS.forEach((field) => {
      if (!isNonEmptyString(p[field])) errors.push({ field: prefix + '.' + field, code: 'required' });
    });
    if (isNonEmptyString(p.id) && !isValidWorkerId(p.id)) errors.push({ field: prefix + '.id', code: 'invalidId' });
    if (isNonEmptyString(p.email) && !isValidEmail(p.email)) errors.push({ field: prefix + '.email', code: 'invalidEmail' });
    return errors;
  }

  /** True when two people have the same values in every person field. */
  function isSamePerson(a, b) {
    if (!a || !b) return false;
    return PERSON_FIELDS.every((f) => String(a[f] || '').trim() === String(b[f] || '').trim());
  }

  function validateTextField(value, field, min, max, errors) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) errors.push({ field, code: 'required' });
    else if (min && text.length < min) errors.push({ field, code: 'tooShort', params: { min } });
    else if (max && text.length > max) errors.push({ field, code: 'tooLong', params: { max } });
  }

  /**
   * Validates the full nomination payload produced by the form.
   * Returns { valid, errors: [{ field, code, params? }] }.
   */
  function validateNomination(data) {
    const d = data || {};
    const errors = [];

    const isSelf = d.selfNomination === true;
    errors.push.apply(errors, validatePerson(d.nominator, 'nominator'));
    // In a self-nomination the relationship is implicit ("self") and not asked.
    if (!isSelf && RELATIONSHIPS.indexOf(d.nominator && d.nominator.relationship) === -1) {
      errors.push({ field: 'nominator.relationship', code: 'required' });
    }

    const nominatorId = d.nominator && d.nominator.id ? d.nominator.id.trim() : '';

    if (NOMINATION_TYPES.indexOf(d.type) === -1) {
      errors.push({ field: 'type', code: 'required' });
    } else if (isSelf && d.type !== 'individual') {
      errors.push({ field: 'selfNomination', code: 'selfGroup' });
    } else if (d.type === 'individual') {
      if (isSelf) {
        // The nominee must be an exact copy of the nominator.
        if (!isSamePerson(d.nominator, d.nominee)) errors.push({ field: 'nominee.id', code: 'selfMismatch' });
      } else {
        errors.push.apply(errors, validatePerson(d.nominee, 'nominee'));
        if (nominatorId && d.nominee && d.nominee.id && d.nominee.id.trim() === nominatorId) {
          errors.push({ field: 'nominee.id', code: 'selfNomination' });
        }
      }
    } else {
      const group = Array.isArray(d.group) ? d.group : [];
      if (group.length === 0) errors.push({ field: 'group', code: 'groupEmpty' });
      const seen = {};
      group.forEach((member, i) => {
        const prefix = 'group.' + i;
        errors.push.apply(errors, validatePerson(member, prefix));
        const id = member && member.id ? member.id.trim() : '';
        if (id) {
          if (seen[id]) errors.push({ field: prefix + '.id', code: 'duplicateMember' });
          seen[id] = true;
          if (id === nominatorId) errors.push({ field: prefix + '.id', code: 'selfNomination' });
        }
      });
    }

    if (!isValidCategory(d.category)) {
      errors.push({ field: 'category', code: 'required' });
    } else {
      getCriteriaIds(d.category).forEach((id) => {
        if (!d.criteria || calculateCriterionScore(d.criteria[id]) === 0) {
          errors.push({ field: 'criteria.' + id, code: 'required' });
        }
      });
    }

    if (!RELEVANCE_LEVELS[String(d.relevance)]) errors.push({ field: 'relevance', code: 'required' });

    validateTextField(d.title, 'title', 0, FIELD_LIMITS.titleMax, errors);
    validateTextField(d.description, 'description', FIELD_LIMITS.descriptionMin, FIELD_LIMITS.descriptionMax, errors);
    validateTextField(d.evidence, 'evidence', FIELD_LIMITS.evidenceMin, FIELD_LIMITS.evidenceMax, errors);

    if (Array.isArray(d.attachments) && d.attachments.length > ATTACHMENT_RULES.maxFiles) {
      errors.push({ field: 'attachments', code: 'fileCount', params: { max: ATTACHMENT_RULES.maxFiles } });
    }

    return { valid: errors.length === 0, errors };
  }

  function getFileExtension(name) {
    const match = /\.([^.]+)$/.exec(String(name || ''));
    return match ? match[1].toLowerCase() : '';
  }

  /** Returns null when the file can be attached, otherwise an error code. */
  function validateAttachment(file, existing) {
    const list = Array.isArray(existing) ? existing : [];
    if (!file || !file.name) return 'fileType';
    if (list.length >= ATTACHMENT_RULES.maxFiles) return 'fileCount';
    if (ATTACHMENT_RULES.allowedExtensions.indexOf(getFileExtension(file.name)) === -1) return 'fileType';
    if (Number(file.size) > ATTACHMENT_RULES.maxFileSize) return 'fileSize';
    if (list.some((f) => f.name === file.name && f.size === file.size)) return 'fileDuplicate';
    return null;
  }

  /** Validates a board evaluation draft. */
  function validateBoardEvaluation(draft, categoryId) {
    const d = draft || {};
    const errors = [];
    if (d.declaredConflict !== true && d.declaredConflict !== false) {
      errors.push({ field: 'declaredConflict', code: 'required' });
      return { valid: false, errors };
    }
    if (d.declaredConflict) {
      if (CONFLICT_REASONS.indexOf(d.conflictReason) === -1) errors.push({ field: 'conflictReason', code: 'required' });
      validateTextField(d.conflictNotes, 'conflictNotes', FIELD_LIMITS.conflictNotesMin, FIELD_LIMITS.conflictNotesMax, errors);
    } else {
      if (!RELEVANCE_LEVELS[String(d.relevance)]) errors.push({ field: 'relevance', code: 'required' });
      getCriteriaIds(categoryId).forEach((id) => {
        if (!d.criteria || calculateCriterionScore(d.criteria[id]) === 0) errors.push({ field: 'criteria.' + id, code: 'required' });
      });
      validateTextField(d.comments, 'comments', FIELD_LIMITS.commentsMin, FIELD_LIMITS.commentsMax, errors);
    }
    return { valid: errors.length === 0, errors };
  }

  /* ------------------------------------------------------------------ */
  /* Worker spreadsheet parsing                                          */
  /* ------------------------------------------------------------------ */

  const WORKER_COLUMN_ALIASES = Object.freeze({
    id: ['id', 'worker id', 'employee id', 'matricula', 'matrícula'],
    name: ['name', 'nome', 'full name', 'nome completo'],
    area: ['area', 'área', 'department', 'departamento'],
    location: ['location', 'localizacao', 'localização', 'local', 'site'],
    cl: ['cl', 'career level', 'nivel', 'nível'],
    email: ['email', 'e-mail', 'mail']
  });

  function normalizeHeader(header) {
    return String(header || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /** Maps raw headers to canonical worker fields. Returns { map, missing }. */
  function mapWorkerColumns(headers) {
    const normalized = (headers || []).map(normalizeHeader);
    const map = {};
    const missing = [];
    Object.keys(WORKER_COLUMN_ALIASES).forEach((field) => {
      const idx = normalized.findIndex((h) => WORKER_COLUMN_ALIASES[field].indexOf(h) !== -1);
      if (idx === -1) missing.push(field);
      else map[field] = headers[idx];
    });
    return { map, missing };
  }

  /**
   * Converts spreadsheet rows (array of objects keyed by header) to workers.
   * Returns { workers, missingColumns, invalidRows, duplicates }.
   */
  function parseWorkerRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const headers = list.length ? Object.keys(list[0]) : [];
    const { map, missing } = mapWorkerColumns(headers);
    if (missing.length) return { workers: [], missingColumns: missing, invalidRows: [], duplicates: 0 };

    const byId = {};
    const order = [];
    const invalidRows = [];
    let duplicates = 0;

    list.forEach((row, index) => {
      const worker = {
        id: normalizeWorkerId(row[map.id]),
        name: String(row[map.name] || '').trim(),
        area: String(row[map.area] || '').trim(),
        location: String(row[map.location] || '').trim(),
        cl: String(row[map.cl] || '').trim(),
        email: String(row[map.email] || '').trim().toLowerCase()
      };
      const isBlank = PERSON_FIELDS.every((f) => !worker[f]);
      if (isBlank) return;
      if (validatePerson(worker, 'worker').length) {
        invalidRows.push(index + 2); // +2: header row + 1-based
        return;
      }
      if (byId[worker.id]) duplicates += 1;
      else order.push(worker.id);
      byId[worker.id] = worker;
    });

    return { workers: order.map((id) => byId[id]), missingColumns: [], invalidRows, duplicates };
  }

  /* ------------------------------------------------------------------ */
  /* Factories                                                           */
  /* ------------------------------------------------------------------ */

  function generateNominationId(now, rand) {
    const ts = Number(now || Date.now());
    const r = typeof rand === 'function' ? rand() : Math.random();
    const suffix = Math.floor(r * 36 ** 5).toString(36).toUpperCase().padStart(5, '0');
    return 'NOM-' + ts + '-' + suffix;
  }

  function clonePerson(p) {
    const src = p || {};
    return {
      id: String(src.id || '').trim(),
      name: String(src.name || '').trim(),
      area: String(src.area || '').trim(),
      location: String(src.location || '').trim(),
      cl: String(src.cl || '').trim(),
      email: String(src.email || '').trim()
    };
  }

  /** Builds the persisted nomination object from validated form data. */
  function createNomination(data, now) {
    const date = now instanceof Date ? now : new Date(now || Date.now());
    const criteria = {};
    getCriteriaIds(data.category).forEach((id) => {
      criteria[id] = data.criteria[id];
    });
    const isSelf = data.selfNomination === true;
    const nominator = Object.assign(clonePerson(data.nominator), { relationship: isSelf ? 'self' : data.nominator.relationship });
    const isGroup = data.type === 'grupo';
    return {
      id: generateNominationId(date.getTime()),
      type: data.type,
      selfNomination: isSelf,
      nominator,
      nominee: isGroup ? null : clonePerson(isSelf ? data.nominator : data.nominee),
      group: isGroup ? data.group.map(clonePerson) : [],
      category: data.category,
      criteria,
      relevance: String(data.relevance),
      score: calculateTotalScore(data.relevance, criteria, data.category),
      title: String(data.title || '').trim(),
      description: String(data.description || '').trim(),
      evidence: String(data.evidence || '').trim(),
      attachments: (data.attachments || []).map((f) => ({ name: f.name, size: Number(f.size) || 0, type: f.type || '' })),
      status: 'Pending',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: date.toISOString(),
      boardEvaluations: []
    };
  }

  /** Builds a board evaluation record. Conflict evaluations carry no scores. */
  function createBoardEvaluation(draft, categoryId, evaluator, now) {
    const date = now instanceof Date ? now : new Date(now || Date.now());
    const conflict = draft.declaredConflict === true;
    const criteria = {};
    if (!conflict) getCriteriaIds(categoryId).forEach((id) => { criteria[id] = draft.criteria[id]; });
    return {
      evaluatorId: evaluator.id,
      evaluatorName: evaluator.name,
      scores: conflict ? null : calculateTotalScore(draft.relevance, criteria, categoryId),
      selections: conflict ? null : { relevance: String(draft.relevance), criteria },
      comments: conflict ? '' : String(draft.comments || '').trim(),
      declaredConflict: conflict,
      conflictReason: conflict ? draft.conflictReason : null,
      conflictNotes: conflict ? String(draft.conflictNotes || '').trim() : null,
      evaluatedAt: date.toISOString()
    };
  }

  /** Adds an evaluation, enforcing one evaluation per board member. */
  function addBoardEvaluation(nomination, evaluation) {
    const list = Array.isArray(nomination.boardEvaluations) ? nomination.boardEvaluations : [];
    if (list.some((e) => e.evaluatorId === evaluation.evaluatorId)) {
      throw new Error('DUPLICATE_EVALUATION');
    }
    return Object.assign({}, nomination, { boardEvaluations: list.concat([evaluation]) });
  }

  function hasEvaluated(nomination, evaluatorId) {
    return (nomination.boardEvaluations || []).some((e) => e.evaluatorId === evaluatorId);
  }

  /** Repairs partially-formed records read from storage. */
  function normalizeNomination(n) {
    if (!n || typeof n !== 'object' || !n.id) return null;
    return Object.assign(
      {
        type: 'individual',
        selfNomination: false,
        nominee: null,
        group: [],
        criteria: {},
        attachments: [],
        status: 'Pending',
        reviewedBy: null,
        reviewedAt: null,
        boardEvaluations: []
      },
      n,
      {
        group: Array.isArray(n.group) ? n.group : [],
        attachments: Array.isArray(n.attachments) ? n.attachments : [],
        boardEvaluations: Array.isArray(n.boardEvaluations) ? n.boardEvaluations : [],
        status: isValidStatus(n.status) ? n.status : 'Pending',
        selfNomination: n.selfNomination === true
      }
    );
  }

  /* ------------------------------------------------------------------ */
  /* Storage (localStorage, prototype-grade)                             */
  /* ------------------------------------------------------------------ */

  const memoryStore = {};
  function getBackend() {
    try {
      if (root && root.localStorage) return root.localStorage;
    } catch (e) {
      /* access denied (privacy mode) -> fall back to memory */
    }
    return {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(memoryStore, k) ? memoryStore[k] : null),
      setItem: (k, v) => { memoryStore[k] = String(v); },
      removeItem: (k) => { delete memoryStore[k]; }
    };
  }

  const Storage = {
    readJSON(key, fallback) {
      try {
        const raw = getBackend().getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    writeJSON(key, value) {
      try {
        getBackend().setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    readString(key, fallback) {
      try {
        const v = getBackend().getItem(key);
        return v === null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    writeString(key, value) {
      try {
        getBackend().setItem(key, value);
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try { getBackend().removeItem(key); } catch (e) { /* ignore */ }
    },
    getNominations() {
      const list = this.readJSON(STORAGE_KEYS.nominations, []);
      return (Array.isArray(list) ? list : []).map(normalizeNomination).filter(Boolean);
    },
    saveNominations(list) {
      return this.writeJSON(STORAGE_KEYS.nominations, list);
    },
    addNomination(nomination) {
      const list = this.getNominations();
      list.push(nomination);
      return this.saveNominations(list);
    },
    getNomination(id) {
      return this.getNominations().find((n) => n.id === id) || null;
    },
    /** Applies `updater(nomination) => nomination` to the stored record. */
    updateNomination(id, updater) {
      const list = this.getNominations();
      const idx = list.findIndex((n) => n.id === id);
      if (idx === -1) return null;
      list[idx] = updater(list[idx]);
      this.saveNominations(list);
      return list[idx];
    },
    getMyNominationIds() {
      const ids = this.readJSON(STORAGE_KEYS.myNominations, []);
      return Array.isArray(ids) ? ids : [];
    },
    rememberMyNomination(id) {
      const ids = this.getMyNominationIds();
      if (ids.indexOf(id) === -1) ids.push(id);
      this.writeJSON(STORAGE_KEYS.myNominations, ids);
    }
  };

  /* ------------------------------------------------------------------ */
  /* DOM helpers (browser only)                                          */
  /* ------------------------------------------------------------------ */

  const UI = {
    $(selector, scope) {
      return (scope || document).querySelector(selector);
    },
    $$(selector, scope) {
      return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
    },
    escapeHtml,
    formatCurrency,

    formatDate(iso, lang) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      try {
        return d.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', {
          year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
      } catch (e) {
        return d.toISOString();
      }
    },

    formatFileSize(bytes) {
      const b = Number(bytes) || 0;
      if (b < 1024) return b + ' B';
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
      return (b / (1024 * 1024)).toFixed(1) + ' MB';
    },

    formatScore(value) {
      const v = round2(value);
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    },

    statusBadge(status, label) {
      return '<span class="status-badge status-' + statusSlug(status) + '">' + escapeHtml(label) + '</span>';
    },

    starsBadge(tier, label) {
      if (!tier) return '<span class="tier-badge tier-none">—</span>';
      return '<span class="tier-badge tier-' + tier.toLowerCase() + '" title="' + escapeHtml(label || '') + '">' +
        '<span class="tier-stars" aria-hidden="true">' + getTierStars(tier) + '</span>' +
        '<span class="tier-letter">' + tier + '</span></span>';
    },

    toast(message, type) {
      let stack = document.getElementById('toast-stack');
      if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toast-stack';
        stack.className = 'toast-stack';
        stack.setAttribute('aria-live', 'polite');
        document.body.appendChild(stack);
      }
      const kind = type || 'info';
      const icons = { success: '✓', error: '✕', warning: '!', info: 'i' };
      const el = document.createElement('div');
      el.className = 'toast toast-' + kind;
      el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      el.innerHTML = '<span class="toast-icon" aria-hidden="true">' + icons[kind] + '</span>' +
        '<span class="toast-message">' + escapeHtml(message) + '</span>' +
        '<button type="button" class="toast-close" aria-label="Close">×</button>';
      const remove = () => {
        el.classList.add('toast-leaving');
        setTimeout(() => el.remove(), 250);
      };
      el.querySelector('.toast-close').addEventListener('click', remove);
      stack.appendChild(el);
      requestAnimationFrame(() => el.classList.add('toast-visible'));
      setTimeout(remove, kind === 'error' ? 6000 : 4000);
    },

    openModal(id) {
      const overlay = document.getElementById(id);
      if (!overlay) return;
      overlay.hidden = false;
      overlay.dataset.openedAt = String(Date.now());
      document.body.classList.add('modal-open');
      requestAnimationFrame(() => overlay.classList.add('is-open'));
      const focusable = overlay.querySelector('[data-autofocus], button, [href], input, select, textarea');
      if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 60);
    },

    closeModal(id) {
      const overlay = typeof id === 'string' ? document.getElementById(id) : id;
      if (!overlay || overlay.hidden) return;
      overlay.classList.remove('is-open');
      overlay.hidden = true;
      if (!document.querySelector('.modal-overlay:not([hidden])')) document.body.classList.remove('modal-open');
      overlay.dispatchEvent(new CustomEvent('modal:closed'));
    },

    /** Wires [data-close-modal], overlay click and Escape for every modal. */
    initModals() {
      document.addEventListener('click', (event) => {
        const closer = event.target.closest('[data-close-modal]');
        if (closer) {
          UI.closeModal(closer.closest('.modal-overlay'));
          return;
        }
        if (event.target.classList && event.target.classList.contains('modal-overlay') && event.target.dataset.dismissible !== 'false') {
          UI.closeModal(event.target);
        }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const open = UI.$$('.modal-overlay:not([hidden])');
        if (!open.length) return;
        open.sort((a, b) => Number(b.dataset.openedAt || 0) - Number(a.dataset.openedAt || 0));
        if (open[0].dataset.dismissible !== 'false') UI.closeModal(open[0]);
      });
    },

    /** "Self-nomination" badge, or an empty string for nominations made by others. */
    selfBadge(n, t) {
      if (!n || n.selfNomination !== true) return '';
      return '<span class="chip chip-self" title="' + escapeHtml(t('badge.self')) + '"><span aria-hidden="true">🙋</span> ' + escapeHtml(t('badge.self')) + '</span>';
    },

    personInline(p) {
      if (!p) return '—';
      return '<span class="person-inline"><strong>' + escapeHtml(p.name) + '</strong> <span class="muted">#' + escapeHtml(p.id) + '</span></span>';
    },

    peopleTable(people, t) {
      return '<div class="table-wrap"><table class="data-table compact">' +
        '<thead><tr>' +
        ['person.id', 'person.name', 'person.area', 'person.location', 'person.cl', 'person.email']
          .map((k) => '<th>' + escapeHtml(t(k)) + '</th>').join('') +
        '</tr></thead><tbody>' +
        people.map((p) => '<tr><td>' + escapeHtml(p.id) + '</td><td>' + escapeHtml(p.name) + '</td><td>' + escapeHtml(p.area) +
          '</td><td>' + escapeHtml(p.location) + '</td><td>' + escapeHtml(p.cl) + '</td><td>' + escapeHtml(p.email) + '</td></tr>').join('') +
        '</tbody></table></div>';
    },

    criteriaTable(categoryId, criteria, t) {
      const ids = getCriteriaIds(categoryId);
      return '<div class="table-wrap"><table class="data-table compact criteria-table">' +
        '<thead><tr><th>' + escapeHtml(t('details.criterion')) + '</th><th>' + escapeHtml(t('details.grade')) + '</th><th class="num">' + escapeHtml(t('details.points')) + '</th></tr></thead><tbody>' +
        ids.map((id) => {
          const grade = criteria && criteria[id];
          return '<tr><td>' + escapeHtml(t('crit.' + categoryId + '.' + id)) + '</td>' +
            '<td>' + (grade ? '<span class="grade-chip grade-' + grade.toLowerCase() + '">' + grade + '</span> ' + escapeHtml(t('grade.label.' + grade)) : '—') + '</td>' +
            '<td class="num">' + calculateCriterionScore(grade) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
    },

    /**
     * Full read-only view of a nomination, shared by the review modal,
     * "My Nominations", the board and the admin panel.
     */
    renderNominationDetails(n, opts) {
      const t = opts.t;
      const lang = opts.lang;
      const isGroup = n.type === 'grupo';
      const section = (titleKey, body, extraClass) =>
        '<section class="detail-section' + (extraClass ? ' ' + extraClass : '') + '"><h3 class="detail-title">' + escapeHtml(t(titleKey)) + '</h3>' + body + '</section>';
      const row = (labelKey, value) => '<div class="detail-row"><dt>' + escapeHtml(t(labelKey)) + '</dt><dd>' + value + '</dd></div>';

      const nominator = n.nominator || {};
      const nominatorHtml = '<dl class="detail-list">' +
        row('person.name', escapeHtml(nominator.name) + ' <span class="muted">#' + escapeHtml(nominator.id) + '</span>') +
        row('person.area', escapeHtml(nominator.area) + ' · ' + escapeHtml(nominator.location) + ' · ' + escapeHtml(nominator.cl)) +
        row('person.email', escapeHtml(nominator.email)) +
        row('form.relationship', escapeHtml(t('relationship.' + nominator.relationship))) +
        '</dl>';

      const recipients = getRecipients(n);
      const nomineeHtml = isGroup
        ? UI.peopleTable(recipients, t)
        : '<dl class="detail-list">' +
          row('person.name', escapeHtml(recipients[0] && recipients[0].name) + ' <span class="muted">#' + escapeHtml(recipients[0] && recipients[0].id) + '</span>') +
          row('person.area', escapeHtml(recipients[0] && recipients[0].area) + ' · ' + escapeHtml(recipients[0] && recipients[0].location) + ' · ' + escapeHtml(recipients[0] && recipients[0].cl)) +
          row('person.email', escapeHtml(recipients[0] && recipients[0].email)) +
          '</dl>';

      const evaluationHtml = '<dl class="detail-list">' +
        row('form.category', '<span class="chip chip-category cat-' + escapeHtml(n.category) + '">' + escapeHtml(t('category.' + n.category)) + '</span>') +
        row('form.relevance', escapeHtml(t('relevance.short.' + n.relevance)) + ' <span class="muted">(' + calculateRelevanceScore(n.relevance) + ' ' + escapeHtml(t('common.pts')) + ')</span>') +
        row('details.indexScore', n.score ? '<strong>' + n.score.total + '</strong> / 100 <span class="muted">(' + escapeHtml(t('score.line', n.score)) + ')</span>' : '—') +
        '</dl>' + UI.criteriaTable(n.category, n.criteria, t);

      const contributionHtml = '<div class="detail-text-block"><h4>' + escapeHtml(t('form.titleLabel')) + '</h4><p class="detail-strong">' + escapeHtml(n.title) + '</p></div>' +
        '<div class="detail-text-block"><h4>' + escapeHtml(t('form.description')) + '</h4><p class="pre-wrap">' + escapeHtml(n.description) + '</p></div>' +
        '<div class="detail-text-block"><h4>' + escapeHtml(t('form.evidence')) + '</h4><p class="pre-wrap">' + escapeHtml(n.evidence) + '</p></div>';

      const attachmentsHtml = (n.attachments && n.attachments.length)
        ? '<ul class="attachment-list readonly">' + n.attachments.map((f) =>
          '<li class="attachment-item"><span class="attachment-ext">' + escapeHtml(getFileExtension(f.name).toUpperCase() || 'FILE') + '</span>' +
          '<span class="attachment-name">' + escapeHtml(f.name) + '</span><span class="attachment-size">' + UI.formatFileSize(f.size) + '</span></li>').join('') + '</ul>' +
          '<p class="muted small">' + escapeHtml(t('details.metadataOnly')) + '</p>'
        : '<p class="muted">' + escapeHtml(t('details.noAttachments')) + '</p>';

      let statusHtml = '';
      if (opts.showStatus) {
        statusHtml = section('details.statusSection', '<dl class="detail-list">' +
          row('details.id', '<code>' + escapeHtml(n.id) + '</code>') +
          row('filter.status', UI.statusBadge(n.status, t(statusKey(n.status)))) +
          row('card.submitted', escapeHtml(UI.formatDate(n.createdAt, lang))) +
          row('details.reviewedBy', escapeHtml(n.reviewedBy || '—')) +
          row('details.reviewedAt', escapeHtml(UI.formatDate(n.reviewedAt, lang))) +
          '</dl>');
      }

      const selfHtml = n.selfNomination === true
        ? '<div class="self-banner span-2">' + UI.selfBadge(n, t) + '<span>' + escapeHtml(t('details.selfInfo')) + '</span></div>'
        : '';

      return '<div class="details-grid' + (opts.compact ? ' compact' : '') + '">' +
        selfHtml +
        statusHtml +
        section('form.nominator.title', nominatorHtml) +
        section(isGroup ? 'details.groupMembers' : 'details.nominee', nomineeHtml) +
        section('details.evaluation', evaluationHtml, 'span-2') +
        section('form.contribution.title', contributionHtml, 'span-2') +
        section('form.attachments.title', attachmentsHtml, 'span-2') +
        '</div>';
    },

    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    debounce(fn, wait) {
      let timer = null;
      return function debounced() {
        const args = arguments;
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(null, args), wait);
      };
    }
  };

  return {
    STORAGE_KEYS,
    USERS,
    BOARD_MEMBERS,
    CATEGORIES,
    CRITERIA_LABELS,
    RELEVANCE_LEVELS,
    CRITERIA_GRADES,
    MAX_SCORE,
    MIN_ELIGIBLE_SCORE,
    CRITERIA_PER_CATEGORY,
    PRIZE_TIERS,
    ONE_STAR_LIMITS,
    STATUSES,
    NOMINATION_TYPES,
    RELATIONSHIPS,
    CONFLICT_REASONS,
    FIELD_LIMITS,
    ATTACHMENT_RULES,
    PERSON_FIELDS,
    round2,
    escapeHtml,
    formatCurrency,
    getCategory,
    getCriteriaIds,
    isValidCategory,
    calculateRelevanceScore,
    calculateCriterionScore,
    calculateCriteriaScore,
    calculateTotalScore,
    isScoreComplete,
    isEligible,
    pointsMissingForEligibility,
    determinePrizeTier,
    getTierStars,
    getMemberCount,
    getRecipients,
    calculatePrizeAmount,
    computeBoardAverage,
    computeConsolidatedScore,
    buildCategoryRanking,
    buildAllRankings,
    findRankingEntry,
    computeFinancialSummary,
    buildPaymentLines,
    isValidStatus,
    statusSlug,
    statusKey,
    applyStatusChange,
    isValidEmail,
    isValidWorkerId,
    normalizeWorkerId,
    validatePerson,
    isSamePerson,
    validateNomination,
    getFileExtension,
    validateAttachment,
    validateBoardEvaluation,
    mapWorkerColumns,
    parseWorkerRows,
    generateNominationId,
    createNomination,
    createBoardEvaluation,
    addBoardEvaluation,
    hasEvaluated,
    normalizeNomination,
    Storage,
    UI
  };
});
