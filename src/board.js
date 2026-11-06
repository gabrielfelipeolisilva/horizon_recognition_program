/**
 * Horizon Recognition Program — Evaluation Board panel (board.html).
 *
 * A board member reviews each nomination, declares (or not) a conflict of
 * interest, scores relevance + 5 criteria, reviews and submits. Evaluations are
 * appended to nomination.boardEvaluations[] — one per member per nomination.
 * Conflicted evaluations carry no score and are excluded from the average.
 *
 * Access: the evaluator identity comes from the login session (HorizonAuth).
 * Board members evaluate; administrators get a read-only view of every
 * nomination and its evaluations and can never submit an evaluation.
 */
(function () {
  'use strict';

  const Core = window.HorizonCore;
  const Auth = window.HorizonAuth;
  const UI = Core.UI;
  const I18n = window.I18n;
  const t = (key, params) => I18n.t(key, params);
  const { $, $$, escapeHtml } = UI;

  const state = {
    tab: 'pending',
    member: null,
    readOnly: false,
    currentId: null,
    draft: null
  };

  /* ------------------------------------------------------------------ */
  /* Identity (from the login session)                                   */
  /* ------------------------------------------------------------------ */

  function loadSession() {
    const session = Auth.getSession();
    if (!session) return false;
    state.member = { id: session.id, name: session.name, area: session.area };
    state.readOnly = Auth.isReadOnly(session, 'board');
    return true;
  }

  /** Blocks any write when the session is read-only or no longer valid. */
  function ensureCanEvaluate() {
    const session = Auth.requireSession('board');
    if (!session) return false;
    if (Auth.isReadOnly(session, 'board')) {
      UI.toast(t('board.readOnlyToast'), 'warning');
      return false;
    }
    return true;
  }

  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'BM';
  }

  function renderIdentity() {
    $('#user-avatar').textContent = initials(state.member.name);
    $('#user-name').textContent = state.member.name;
    $('#user-role').textContent = t(state.readOnly ? 'role.admin' : 'role.board') + ' · ' + state.member.area;
    $('#readonly-banner').hidden = !state.readOnly;
    $('#tab-done').hidden = state.readOnly;
    $('#stat-label-pending').textContent = t(state.readOnly ? 'board.statAll' : 'board.statPending');
    $('#stat-label-done').textContent = t(state.readOnly ? 'board.statEvaluations' : 'board.statDone');
    $('#tab-pending-label').textContent = t(state.readOnly ? 'board.tabAll' : 'board.tabPending');
  }

  /* ------------------------------------------------------------------ */
  /* Lists                                                               */
  /* ------------------------------------------------------------------ */

  function matchesFilters(n) {
    const category = $('#board-filter-category').value;
    const q = $('#board-search').value.trim().toLowerCase();
    if (category && n.category !== category) return false;
    if (!q) return true;
    const haystack = [n.id, n.title, n.nominator && n.nominator.name]
      .concat(Core.getRecipients(n).map((p) => p.name + ' ' + p.id))
      .join(' ')
      .toLowerCase();
    return haystack.indexOf(q) !== -1;
  }

  function getMyEvaluation(n) {
    return (n.boardEvaluations || []).find((e) => e.evaluatorId === state.member.id) || null;
  }

  function render() {
    const all = Core.Storage.getNominations();
    const sortNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));
    if (state.readOnly) {
      const evaluations = all.reduce((sum, n) => sum + n.boardEvaluations.length, 0);
      const conflicts = all.reduce((sum, n) => sum + n.boardEvaluations.filter((e) => e.declaredConflict).length, 0);
      $('#stat-pending').textContent = all.length;
      $('#stat-done').textContent = evaluations;
      $('#stat-conflicts').textContent = conflicts;
      $('#count-pending').textContent = all.length;
      renderList($('#panel-pending'), all.filter(matchesFilters).sort(sortNewest), 'all', all.length);
      return;
    }
    const pending = all.filter((n) => n.status !== 'Rejected' && !Core.hasEvaluated(n, state.member.id));
    const done = all.filter((n) => Core.hasEvaluated(n, state.member.id));
    const conflicts = done.filter((n) => getMyEvaluation(n).declaredConflict).length;

    $('#stat-pending').textContent = pending.length;
    $('#stat-done').textContent = done.length;
    $('#stat-conflicts').textContent = conflicts;
    $('#count-pending').textContent = pending.length;
    $('#count-done').textContent = done.length;

    renderList($('#panel-pending'), pending.filter(matchesFilters).sort(sortNewest), 'pending', pending.length);
    renderList($('#panel-done'), done.filter(matchesFilters).sort(sortNewest), 'done', done.length);
  }

  function renderList(container, items, kind, totalCount) {
    if (!totalCount) {
      const keys = {
        pending: ['✅', 'board.emptyPendingTitle', 'board.emptyPendingText'],
        done: ['📋', 'board.emptyDoneTitle', 'board.emptyDoneText'],
        all: ['📭', 'board.emptyAllTitle', 'board.emptyAllText']
      }[kind];
      container.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true">' + keys[0] + '</span>' +
        '<h3>' + escapeHtml(t(keys[1])) + '</h3><p>' + escapeHtml(t(keys[2])) + '</p></div>';
      return;
    }
    if (!items.length) {
      container.innerHTML = '<div class="empty-state compact"><p>' + escapeHtml(t('mine.noMatch')) + '</p></div>';
      return;
    }
    const lang = I18n.getLanguage();
    container.innerHTML = items.map((n) => {
      const people = Core.getRecipients(n).map((p) => p.name).join(', ');
      const mine = getMyEvaluation(n);
      let footer;
      if (kind === 'all') {
        const valid = n.boardEvaluations.filter((e) => !e.declaredConflict).length;
        const conflictsCount = n.boardEvaluations.length - valid;
        footer = '<span class="chip chip-info">' + escapeHtml(t('board.progress', { valid, conflicts: conflictsCount })) + '</span>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-view-all="' + escapeHtml(n.id) + '">' + escapeHtml(t('board.view')) + '</button>';
      } else if (kind === 'pending') {
        footer = '<button type="button" class="btn btn-primary btn-sm" data-evaluate="' + escapeHtml(n.id) + '">' + escapeHtml(t('board.evaluate')) + '</button>';
      } else {
        const badge = mine.declaredConflict
          ? '<span class="chip chip-warning">' + escapeHtml(t('board.conflictDeclared')) + '</span>'
          : '<span class="chip chip-score">' + escapeHtml(t('board.myScore', { total: mine.scores.total })) + '</span>';
        footer = badge + '<button type="button" class="btn btn-secondary btn-sm" data-view="' + escapeHtml(n.id) + '">' + escapeHtml(t('board.view')) + '</button>';
      }
      return '<article class="nomination-card' + (kind === 'pending' ? ' is-actionable' : '') + '"' + (kind === 'pending' ? ' data-evaluate="' + escapeHtml(n.id) + '" tabindex="0"' : '') + '>' +
        '<header class="nomination-card-header">' +
        '<span class="nomination-id">' + escapeHtml(n.id) + '</span>' +
        UI.statusBadge(n.status, t(Core.statusKey(n.status))) +
        '</header>' +
        '<h3 class="nomination-title">' + escapeHtml(n.title) + '</h3>' +
        '<div class="chip-row">' +
        '<span class="chip chip-category cat-' + n.category + '">' + escapeHtml(t('category.' + n.category)) + '</span>' +
        '<span class="chip">' + escapeHtml(t('type.' + n.type)) + (n.type === 'grupo' ? ' · ' + n.group.length : '') + '</span>' +
        UI.selfBadge(n, t) +
        '</div>' +
        '<dl class="meta-list">' +
        '<div><dt>' + escapeHtml(t(n.type === 'grupo' ? 'card.members' : 'card.nominee')) + '</dt><dd>' + escapeHtml(people) + '</dd></div>' +
        '<div><dt>' + escapeHtml(t('details.indexScore')) + '</dt><dd>' + n.score.total + ' / 100</dd></div>' +
        '<div><dt>' + escapeHtml(t(kind === 'done' ? 'board.evaluatedAt' : 'card.submitted')) + '</dt><dd>' +
        escapeHtml(UI.formatDate(kind === 'done' ? mine.evaluatedAt : n.createdAt, lang)) + '</dd></div>' +
        '</dl>' +
        '<footer class="nomination-card-footer">' + footer + '</footer>' +
        '</article>';
    }).join('');
  }

  function switchTab(tab) {
    state.tab = tab;
    $$('.tab').forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    $('#panel-pending').hidden = tab !== 'pending';
    $('#panel-done').hidden = tab !== 'done';
  }

  /* ------------------------------------------------------------------ */
  /* Evaluation modal                                                    */
  /* ------------------------------------------------------------------ */

  function renderEvalCriteria(categoryId, preserve) {
    const previous = preserve ? readEvalCriteria() : {};
    $('#eval-criteria').innerHTML = Core.getCriteriaIds(categoryId).map((id, index) => {
      const key = 'crit.' + categoryId + '.' + id;
      const desc = t(key + '.desc');
      return '<div class="criterion-row">' +
        '<div class="criterion-info">' +
        '<span class="criterion-number">' + (index + 1) + '</span>' +
        '<label class="criterion-name" for="eval-criterion-' + id + '">' + escapeHtml(t(key)) + ' <span class="req">*</span></label>' +
        '<span class="tooltip" tabindex="0" role="button" aria-label="' + escapeHtml(desc) + '">ⓘ<span class="tooltip-text" role="tooltip">' + escapeHtml(desc) + '</span></span>' +
        '</div>' +
        '<select id="eval-criterion-' + id + '" class="grade-select" data-criterion="' + id + '" data-field="criteria.' + id + '">' +
        '<option value="">' + escapeHtml(t('form.selectGrade')) + '</option>' +
        ['S', 'A', 'B'].map((g) => '<option value="' + g + '"' + (previous[id] === g ? ' selected' : '') + '>' + escapeHtml(t('grade.option.' + g)) + '</option>').join('') +
        '</select>' +
        '<p class="field-error" data-error-for="criteria.' + id + '"></p>' +
        '</div>';
    }).join('');
    $$('#eval-criteria .grade-select').forEach(paintGrade);
  }

  function paintGrade(select) {
    select.classList.remove('grade-s', 'grade-a', 'grade-b');
    if (select.value) select.classList.add('grade-' + select.value.toLowerCase());
  }

  function readEvalCriteria() {
    const criteria = {};
    $$('#eval-criteria [data-criterion]').forEach((s) => { if (s.value) criteria[s.dataset.criterion] = s.value; });
    return criteria;
  }

  function readConflict() {
    const checked = $('input[name="conflict"]:checked');
    if (!checked) return null;
    return checked.value === 'yes';
  }

  function collectDraft() {
    return {
      declaredConflict: readConflict(),
      conflictReason: $('#conflict-reason').value,
      conflictNotes: $('#conflict-notes').value,
      relevance: $('#eval-relevance').value,
      criteria: readEvalCriteria(),
      comments: $('#eval-comments').value
    };
  }

  function applyConflictVisibility() {
    const conflict = readConflict() === true;
    $('#conflict-fields').hidden = !conflict;
    $('#scoring-fields').disabled = conflict;
    $('#scoring-fields').classList.toggle('is-disabled', conflict);
    $('#eval-score-panel').classList.toggle('is-disabled', conflict);
  }

  function updateEvalScore() {
    const n = Core.Storage.getNomination(state.currentId);
    if (!n) return;
    const score = Core.calculateTotalScore($('#eval-relevance').value, readEvalCriteria(), n.category);
    $('#eval-score-line').textContent = t('score.line', score);
    $('#eval-score-fill').style.width = score.total + '%';
    const complete = Core.isScoreComplete($('#eval-relevance').value, readEvalCriteria(), n.category);
    $('#eval-score-panel').classList.toggle('is-eligible', Core.isEligible(score.total));
    $('#eval-score-panel').classList.toggle('is-below', complete && !Core.isEligible(score.total));
  }

  function updateCounters() {
    $$('#evaluation-form [data-counter-for]').forEach((counter) => {
      const input = document.getElementById(counter.dataset.counterFor);
      const max = Number(input.getAttribute('maxlength'));
      counter.textContent = input.value.length + ' / ' + max;
      counter.classList.toggle('is-near-limit', input.value.length > max * 0.9);
    });
  }

  function clearErrors() {
    $$('#evaluation-form .field-error').forEach((el) => { el.textContent = ''; });
    $$('#evaluation-form .has-error').forEach((el) => el.classList.remove('has-error'));
  }

  function showErrors(errors) {
    clearErrors();
    let first = null;
    errors.forEach((err) => {
      const holder = $('#evaluation-form [data-error-for="' + err.field + '"]');
      if (holder && !holder.textContent) holder.textContent = t('validation.' + err.code, err.params || {});
      const input = $('#evaluation-form [data-field="' + err.field + '"]');
      if (input) {
        input.classList.add('has-error');
        if (!first) first = input;
      } else if (!first) first = holder;
    });
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderEvalDetails(n) {
    $('#evaluation-subtitle').textContent = n.id + ' · ' + t('category.' + n.category);
    $('#evaluation-details').innerHTML = UI.renderNominationDetails(n, { t, lang: I18n.getLanguage(), showStatus: true, compact: true });
  }

  function openEvaluation(id) {
    if (!ensureCanEvaluate()) return;
    const n = Core.Storage.getNomination(id);
    if (!n) {
      UI.toast(t('toast.notFound'), 'error');
      render();
      return;
    }
    if (Core.hasEvaluated(n, state.member.id)) {
      UI.toast(t('toast.alreadyEvaluated'), 'warning');
      render();
      return;
    }
    state.currentId = id;
    const form = $('#evaluation-form');
    form.reset();
    clearErrors();
    renderEvalDetails(n);
    renderEvalCriteria(n.category, false);
    applyConflictVisibility();
    updateCounters();
    updateEvalScore();
    UI.openModal('evaluation-modal');
    $('#evaluation-modal .modal-body').scrollTop = 0;
  }

  function handleReview() {
    if (!ensureCanEvaluate()) return;
    const n = Core.Storage.getNomination(state.currentId);
    if (!n) return;
    const draft = collectDraft();
    const result = Core.validateBoardEvaluation(draft, n.category);
    if (!result.valid) {
      showErrors(result.errors);
      UI.toast(t('toast.fixErrors', { count: result.errors.length }), 'error');
      return;
    }
    clearErrors();
    state.draft = draft;
    $('#eval-review-body').innerHTML = renderEvaluationSummary(Core.createBoardEvaluation(draft, n.category, state.member), n);
    UI.openModal('eval-review-modal');
  }

  function renderEvaluationSummary(evaluation, n, withoutHeader) {
    const lang = I18n.getLanguage();
    const header = withoutHeader ? '' : '<div class="summary-header">' +
      '<p><strong>' + escapeHtml(n.title) + '</strong></p>' +
      '<p class="muted">' + escapeHtml(n.id) + ' · ' + escapeHtml(t('category.' + n.category)) + '</p>' +
      '</div>';
    const meta = '<dl class="detail-list">' +
      '<div class="detail-row"><dt>' + escapeHtml(t('view.evaluator')) + '</dt><dd>' + escapeHtml(evaluation.evaluatorName) + ' <span class="muted">#' + escapeHtml(evaluation.evaluatorId) + '</span></dd></div>' +
      '<div class="detail-row"><dt>' + escapeHtml(t('board.evaluatedAt')) + '</dt><dd>' + escapeHtml(UI.formatDate(evaluation.evaluatedAt, lang)) + '</dd></div>' +
      '</dl>';
    if (evaluation.declaredConflict) {
      return header + meta +
        '<div class="alert alert-warning"><strong>' + escapeHtml(t('board.conflictDeclared')) + '</strong><br>' + escapeHtml(t('conflict.excluded')) + '</div>' +
        '<dl class="detail-list">' +
        '<div class="detail-row"><dt>' + escapeHtml(t('conflict.reason')) + '</dt><dd>' + escapeHtml(t('conflictReason.' + evaluation.conflictReason)) + '</dd></div>' +
        '<div class="detail-row"><dt>' + escapeHtml(t('conflict.notes')) + '</dt><dd class="pre-wrap">' + escapeHtml(evaluation.conflictNotes) + '</dd></div>' +
        '</dl>';
    }
    return header + meta +
      '<div class="review-score ' + (Core.isEligible(evaluation.scores.total) ? 'is-eligible' : 'is-below') + '">' +
      '<div><span class="review-score-label">' + escapeHtml(t('score.total')) + '</span>' +
      '<span class="review-score-value">' + evaluation.scores.total + '<small>/100</small></span></div>' +
      '<p>' + escapeHtml(t('score.line', evaluation.scores)) + '</p></div>' +
      '<dl class="detail-list">' +
      '<div class="detail-row"><dt>' + escapeHtml(t('form.relevance')) + '</dt><dd>' + escapeHtml(t('relevance.short.' + evaluation.selections.relevance)) + '</dd></div>' +
      '</dl>' +
      UI.criteriaTable(n.category, evaluation.selections.criteria, t) +
      '<div class="detail-text-block"><h4>' + escapeHtml(t('eval.comments')) + '</h4><p class="pre-wrap">' + escapeHtml(evaluation.comments) + '</p></div>';
  }

  function handleConfirm() {
    if (!ensureCanEvaluate()) return;
    const n = Core.Storage.getNomination(state.currentId);
    if (!n || !state.draft) return;
    const evaluation = Core.createBoardEvaluation(state.draft, n.category, state.member);
    try {
      Core.Storage.updateNomination(n.id, (current) => Core.addBoardEvaluation(current, evaluation));
    } catch (e) {
      UI.toast(t(e.message === 'DUPLICATE_EVALUATION' ? 'toast.alreadyEvaluated' : 'toast.storageError'), 'error');
      UI.closeModal('eval-review-modal');
      UI.closeModal('evaluation-modal');
      render();
      return;
    }
    UI.closeModal('eval-review-modal');
    UI.closeModal('evaluation-modal');
    state.draft = null;
    state.currentId = null;
    render();
    UI.toast(t(evaluation.declaredConflict ? 'toast.conflictSaved' : 'toast.evaluationSaved'), 'success');
  }

  /** Administrator read-only view: nomination + every board evaluation. */
  function openViewAll(id) {
    const n = Core.Storage.getNomination(id);
    if (!n) return;
    const c = Core.computeConsolidatedScore(n);
    $('#view-title').textContent = t('board.allViewTitle');
    $('#view-subtitle').textContent = n.id + ' · ' + t('category.' + n.category);
    const evaluations = n.boardEvaluations.length
      ? n.boardEvaluations.map((e) => '<section class="detail-section evaluation-block' + (e.declaredConflict ? ' is-conflict' : '') + '">' +
        renderEvaluationSummary(e, n, true) + '</section>').join('')
      : '<p class="muted">' + escapeHtml(t('adminDetails.noEvaluations')) + '</p>';
    $('#view-body').innerHTML =
      '<div class="readonly-banner">' + escapeHtml(t('board.readOnlyShort')) + '</div>' +
      '<p class="summary-header"><strong>' + escapeHtml(n.title) + '</strong><br><span class="muted">' +
      escapeHtml(t('adminDetails.boardAverage')) + ': ' + (c.finalScore ? UI.formatScore(c.finalScore.total) : '—') + ' · ' +
      escapeHtml(t('adminDetails.evalSummary', { valid: c.validCount, conflicts: c.conflictCount })) + '</span></p>' +
      evaluations +
      '<details class="card-details"><summary>' + escapeHtml(t('view.nominationDetails')) + '</summary>' +
      UI.renderNominationDetails(n, { t, lang: I18n.getLanguage(), showStatus: true, compact: true }) +
      '</details>';
    $('#view-modal').dataset.nominationId = id;
    $('#view-modal').dataset.mode = 'all';
    UI.openModal('view-modal');
  }

  function openView(id) {
    const n = Core.Storage.getNomination(id);
    const mine = n && getMyEvaluation(n);
    if (!mine) return;
    $('#view-title').textContent = t('view.title');
    $('#view-subtitle').textContent = n.id + ' · ' + t('category.' + n.category);
    $('#view-body').innerHTML =
      '<div class="readonly-banner">' + escapeHtml(t('view.readonly')) + '</div>' +
      renderEvaluationSummary(mine, n) +
      '<details class="card-details"><summary>' + escapeHtml(t('view.nominationDetails')) + '</summary>' +
      UI.renderNominationDetails(n, { t, lang: I18n.getLanguage(), showStatus: true, compact: true }) +
      '</details>';
    $('#view-modal').dataset.nominationId = id;
    $('#view-modal').dataset.mode = 'mine';
    UI.openModal('view-modal');
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    if (!loadSession()) return; // guard is redirecting to login
    I18n.init();
    UI.initModals();
    renderIdentity();

    $$('.tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    $('#board-filter-category').addEventListener('change', render);
    $('#board-search').addEventListener('input', UI.debounce(render, 150));

    document.addEventListener('click', (e) => {
      const viewAll = e.target.closest('[data-view-all]');
      if (viewAll) {
        openViewAll(viewAll.dataset.viewAll);
        return;
      }
      const evalBtn = e.target.closest('[data-evaluate]');
      if (evalBtn && !e.target.closest('.modal')) {
        openEvaluation(evalBtn.dataset.evaluate);
        return;
      }
      const viewBtn = e.target.closest('[data-view]');
      if (viewBtn) openView(viewBtn.dataset.view);
    });
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('article[data-evaluate]')) {
        e.preventDefault();
        openEvaluation(e.target.dataset.evaluate);
      }
    });

    const form = $('#evaluation-form');
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', (e) => {
      if (e.target.name === 'conflict') {
        applyConflictVisibility();
        $('#evaluation-form [data-error-for="declaredConflict"]').textContent = '';
      }
      if (e.target.dataset.criterion) paintGrade(e.target);
      if (e.target.dataset.criterion || e.target.id === 'eval-relevance') updateEvalScore();
      if (e.target.dataset.field) {
        const holder = $('#evaluation-form [data-error-for="' + e.target.dataset.field + '"]');
        if (holder) holder.textContent = '';
        e.target.classList.remove('has-error');
      }
    });
    form.addEventListener('input', (e) => {
      updateCounters();
      if (e.target.dataset.field) {
        const holder = $('#evaluation-form [data-error-for="' + e.target.dataset.field + '"]');
        if (holder) holder.textContent = '';
        e.target.classList.remove('has-error');
      }
    });

    $('#eval-review-btn').addEventListener('click', handleReview);
    $('#eval-confirm-btn').addEventListener('click', handleConfirm);

    document.addEventListener('languagechange', () => {
      renderIdentity();
      render();
      if (!$('#evaluation-modal').hidden && state.currentId) {
        const n = Core.Storage.getNomination(state.currentId);
        if (n) {
          renderEvalDetails(n);
          renderEvalCriteria(n.category, true);
          updateEvalScore();
        }
      }
      if (!$('#eval-review-modal').hidden && state.draft) {
        const n = Core.Storage.getNomination(state.currentId);
        if (n) $('#eval-review-body').innerHTML = renderEvaluationSummary(Core.createBoardEvaluation(state.draft, n.category, state.member), n);
      }
      if (!$('#view-modal').hidden && $('#view-modal').dataset.nominationId) {
        const id = $('#view-modal').dataset.nominationId;
        if ($('#view-modal').dataset.mode === 'all') openViewAll(id);
        else openView(id);
      }
    });

    window.addEventListener('storage', (event) => {
      if (event.key === Core.STORAGE_KEYS.nominations) render();
    });

    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
