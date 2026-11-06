/**
 * Horizon Recognition Program — Administration panel (admin.html).
 *
 * Dashboard counters, financial summary, consolidated ranking per category,
 * nominations list with individual/bulk status changes, workers directory
 * upload (SheetJS), spreadsheet exports (ExcelJS) and demo-data tools.
 * Access is restricted to the admin profile (HorizonAuth); the logged-in
 * administrator is recorded as reviewer on every status change.
 */
(function () {
  'use strict';

  const Core = window.HorizonCore;
  const Auth = window.HorizonAuth;
  const UI = Core.UI;
  const Workers = window.HorizonWorkers;
  const I18n = window.I18n;
  const t = (key, params) => I18n.t(key, params);
  const { $, $$, escapeHtml } = UI;

  /** Logged-in administrator (falls back to the mock admin only for demo seeds). */
  function currentAdmin() {
    const session = Auth.getSession();
    return session ? { id: session.id, name: session.name, area: session.area, role: session.role } : Core.USERS.ADMIN;
  }

  const state = {
    rankingTab: 'business',
    selected: new Set(),
    confirmAction: null,
    detailsId: null,
    visibleIds: []
  };

  /* ------------------------------------------------------------------ */
  /* Render orchestration                                                */
  /* ------------------------------------------------------------------ */

  function render() {
    const nominations = Core.Storage.getNominations();
    const rankings = Core.buildAllRankings(nominations);
    renderIdentity();
    renderStats(nominations);
    renderFinancial(nominations, rankings);
    renderRanking(rankings);
    renderList(nominations, rankings);
    renderWorkersSource();
    if (state.detailsId && !$('#details-modal').hidden) renderDetails(state.detailsId);
  }

  function renderIdentity() {
    const admin = currentAdmin();
    $('#admin-name').textContent = admin.name;
    $('#admin-role').textContent = t('role.admin') + ' · ' + admin.area;
    $('#admin-avatar').textContent = String(admin.name).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'AD';
  }

  /* ------------------------------------------------------------------ */
  /* Dashboard                                                           */
  /* ------------------------------------------------------------------ */

  function renderStats(nominations) {
    const count = (status) => nominations.filter((n) => n.status === status).length;
    const total = nominations.length;
    const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
    const pending = count('Pending');
    const approved = count('Approved');
    const rejected = count('Rejected');
    const underReview = count('Under Review');
    $('#stat-total').textContent = total;
    $('#stat-pending').textContent = pending;
    $('#stat-approved').textContent = approved;
    $('#stat-rejected').textContent = rejected;
    $('#stat-total-foot').textContent = t('admin.underReviewCount', { count: underReview });
    $('#stat-pending-foot').textContent = t('admin.pctOfTotal', { pct: pct(pending) });
    $('#stat-approved-foot').textContent = t('admin.pctOfTotal', { pct: pct(approved) });
    $('#stat-rejected-foot').textContent = t('admin.pctOfTotal', { pct: pct(rejected) });
  }

  function renderFinancial(nominations, rankings) {
    const summary = Core.computeFinancialSummary(nominations);
    let projected = 0;
    Core.CATEGORIES.forEach((c) => {
      rankings[c.id].ranked.forEach((e) => { if (e.tier) projected += e.prize.total; });
    });
    const categoryCards = Core.CATEGORIES.map((c) => {
      const b = summary.byCategory[c.id];
      return '<div class="financial-card cat-' + c.id + '">' +
        '<span class="financial-label">' + escapeHtml(t('category.' + c.id)) + '</span>' +
        '<span class="financial-value">' + escapeHtml(Core.formatCurrency(b.amount)) + '</span>' +
        '<span class="financial-foot">' + escapeHtml(t('financial.awardsRecipients', { awards: b.awards, recipients: b.recipients })) + '</span>' +
        '</div>';
    }).join('');
    $('#financial-summary').innerHTML =
      '<div class="financial-card financial-total">' +
      '<span class="financial-label">' + escapeHtml(t('financial.total')) + '</span>' +
      '<span class="financial-value">' + escapeHtml(Core.formatCurrency(summary.total)) + '</span>' +
      '<span class="financial-foot">' + escapeHtml(t('financial.awardsRecipients', { awards: summary.awards, recipients: summary.recipients })) + '</span>' +
      '<span class="financial-foot muted">' + escapeHtml(t('financial.projected', { amount: Core.formatCurrency(projected) })) + '</span>' +
      '</div>' + categoryCards;
  }

  /* ------------------------------------------------------------------ */
  /* Ranking                                                             */
  /* ------------------------------------------------------------------ */

  function prizeCell(entry) {
    if (!entry.tier) return '<span class="muted">—</span>';
    if (entry.prize.members > 1) {
      return '<span class="prize-amount">' + escapeHtml(t('ranking.perMember', { amount: Core.formatCurrency(entry.prize.perMember) })) + '</span>' +
        '<span class="prize-foot">' + escapeHtml(t('ranking.groupTotal', { amount: Core.formatCurrency(entry.prize.total), members: entry.prize.members })) + '</span>';
    }
    return '<span class="prize-amount">' + escapeHtml(Core.formatCurrency(entry.prize.total)) + '</span>';
  }

  function nomineesCell(n) {
    const people = Core.getRecipients(n);
    if (n.type === 'grupo') {
      return '<span class="cell-main">' + escapeHtml(t('ranking.groupOf', { count: people.length })) + '</span>' +
        '<span class="cell-sub">' + escapeHtml(people.map((p) => p.name).join(', ')) + '</span>';
    }
    const p = people[0] || {};
    return '<span class="cell-main">' + escapeHtml(p.name) + '</span><span class="cell-sub">#' + escapeHtml(p.id) + ' · ' + escapeHtml(p.area) + '</span>' +
      (n.selfNomination ? '<span class="cell-badge">' + UI.selfBadge(n, t) + '</span>' : '');
  }

  function renderRanking(rankings) {
    const categoryId = state.rankingTab;
    const ranking = rankings[categoryId];
    $$('#ranking-tabs .tab').forEach((btn) => {
      const active = btn.dataset.rankingTab === categoryId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    $('#ranking-meta').textContent = t('ranking.meta', {
      ranked: ranking.ranked.length,
      unranked: ranking.unranked.length,
      limit: Core.ONE_STAR_LIMITS[categoryId]
    });

    if (!ranking.ranked.length && !ranking.unranked.length) {
      $('#ranking-table').innerHTML = '<div class="empty-state compact"><p>' + escapeHtml(t('ranking.empty')) + '</p></div>';
      return;
    }

    const head = '<thead><tr>' +
      '<th class="num">#</th>' +
      '<th>' + escapeHtml(t('table.nominees')) + '</th>' +
      '<th>' + escapeHtml(t('filter.type')) + '</th>' +
      '<th class="num">' + escapeHtml(t('table.indexScore')) + '</th>' +
      '<th class="num">' + escapeHtml(t('table.finalScore')) + '</th>' +
      '<th class="num">' + escapeHtml(t('table.evaluations')) + '</th>' +
      '<th class="num">' + escapeHtml(t('table.conflicts')) + '</th>' +
      '<th>' + escapeHtml(t('filter.status')) + '</th>' +
      '<th>' + escapeHtml(t('table.tier')) + '</th>' +
      '<th class="num">' + escapeHtml(t('table.prize')) + '</th>' +
      '</tr></thead>';

    const rankedRows = ranking.ranked.map((e) => {
      const n = e.nomination;
      return '<tr class="' + (e.tier ? 'has-tier tier-row-' + e.tier.toLowerCase() : '') + '" data-open-details="' + escapeHtml(n.id) + '">' +
        '<td class="num"><span class="position-badge pos-' + Math.min(e.position, 6) + '">' + e.position + '</span></td>' +
        '<td>' + nomineesCell(n) + '</td>' +
        '<td>' + escapeHtml(t('type.' + n.type)) + '</td>' +
        '<td class="num">' + n.score.total + '</td>' +
        '<td class="num"><strong>' + UI.formatScore(e.consolidated.finalScore.total) + '</strong></td>' +
        '<td class="num">' + e.consolidated.validCount + '</td>' +
        '<td class="num">' + (e.consolidated.conflictCount ? '<span class="chip chip-warning chip-xs">' + e.consolidated.conflictCount + '</span>' : '0') + '</td>' +
        '<td>' + UI.statusBadge(n.status, t(Core.statusKey(n.status))) + '</td>' +
        '<td>' + UI.starsBadge(e.tier, e.tier ? t('tier.' + e.tier) : '') + '</td>' +
        '<td class="num">' + prizeCell(e) + '</td>' +
        '</tr>';
    }).join('');

    const unrankedRows = ranking.unranked.map((e) => {
      const n = e.nomination;
      return '<tr class="is-unranked" data-open-details="' + escapeHtml(n.id) + '">' +
        '<td class="num">—</td>' +
        '<td>' + nomineesCell(n) + '</td>' +
        '<td>' + escapeHtml(t('type.' + n.type)) + '</td>' +
        '<td class="num">' + n.score.total + '</td>' +
        '<td class="num">' + (e.consolidated.finalScore ? UI.formatScore(e.consolidated.finalScore.total) : '—') + '</td>' +
        '<td class="num">' + e.consolidated.validCount + '</td>' +
        '<td class="num">' + e.consolidated.conflictCount + '</td>' +
        '<td>' + UI.statusBadge(n.status, t(Core.statusKey(n.status))) + '</td>' +
        '<td colspan="2"><span class="chip chip-muted">' + escapeHtml(t('ranking.reason.' + e.reason)) + '</span></td>' +
        '</tr>';
    }).join('');

    const divider = unrankedRows
      ? '<tr class="table-divider"><td colspan="10">' + escapeHtml(t('ranking.notRanked')) + '</td></tr>'
      : '';

    $('#ranking-table').innerHTML = '<table class="data-table ranking-table zebra">' + head + '<tbody>' + rankedRows + divider + unrankedRows + '</tbody></table>';
  }

  /* ------------------------------------------------------------------ */
  /* Nominations list                                                    */
  /* ------------------------------------------------------------------ */

  function matchesFilters(n) {
    const category = $('#admin-filter-category').value;
    const status = $('#admin-filter-status').value;
    const type = $('#admin-filter-type').value;
    const origin = $('#admin-filter-origin').value;
    const q = $('#admin-search').value.trim().toLowerCase();
    if (category && n.category !== category) return false;
    if (status && n.status !== status) return false;
    if (type && n.type !== type) return false;
    if (origin === 'self' && !n.selfNomination) return false;
    if (origin === 'others' && n.selfNomination) return false;
    if (!q) return true;
    return [n.id, n.title, n.nominator && n.nominator.name]
      .concat(Core.getRecipients(n).map((p) => p.name + ' ' + p.id))
      .join(' ').toLowerCase().indexOf(q) !== -1;
  }

  function renderList(nominations) {
    const existing = new Set(nominations.map((n) => n.id));
    state.selected.forEach((id) => { if (!existing.has(id)) state.selected.delete(id); });

    const items = nominations.filter(matchesFilters).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    state.visibleIds = items.map((n) => n.id);
    const lang = I18n.getLanguage();

    if (!nominations.length) {
      $('#nominations-body').innerHTML = '<tr><td colspan="9"><div class="empty-state compact"><span class="empty-icon" aria-hidden="true">📭</span><p>' +
        escapeHtml(t('list.empty')) + '</p></div></td></tr>';
    } else if (!items.length) {
      $('#nominations-body').innerHTML = '<tr><td colspan="9"><div class="empty-state compact"><p>' + escapeHtml(t('mine.noMatch')) + '</p></div></td></tr>';
    } else {
      $('#nominations-body').innerHTML = items.map((n) => {
        const c = Core.computeConsolidatedScore(n);
        const checked = state.selected.has(n.id);
        return '<tr class="' + (checked ? 'is-selected' : '') + '">' +
          '<td class="col-check"><input type="checkbox" data-select="' + escapeHtml(n.id) + '"' + (checked ? ' checked' : '') + ' aria-label="' + escapeHtml(t('bulk.selectOne', { id: n.id })) + '"></td>' +
          '<td><span class="cell-main">' + escapeHtml(n.title) + '</span><span class="cell-sub"><code>' + escapeHtml(n.id) + '</code> · ' + escapeHtml(UI.formatDate(n.createdAt, lang)) + '</span></td>' +
          '<td>' + nomineesCell(n) + '</td>' +
          '<td><span class="chip chip-category cat-' + n.category + '">' + escapeHtml(t('category.' + n.category)) + '</span></td>' +
          '<td class="num">' + n.score.total + '</td>' +
          '<td class="num">' + (c.finalScore ? '<strong>' + UI.formatScore(c.finalScore.total) + '</strong>' : '—') + '</td>' +
          '<td class="num">' + c.validCount + (c.conflictCount ? ' <span class="chip chip-warning chip-xs" title="' + escapeHtml(t('table.conflicts')) + '">+' + c.conflictCount + '</span>' : '') + '</td>' +
          '<td>' + UI.statusBadge(n.status, t(Core.statusKey(n.status))) + '</td>' +
          '<td class="col-actions"><div class="row-actions">' +
          '<button type="button" class="btn-icon btn-icon-view" data-view="' + escapeHtml(n.id) + '" title="' + escapeHtml(t('action.view')) + '" aria-label="' + escapeHtml(t('action.view')) + '">👁</button>' +
          '<button type="button" class="btn-icon btn-icon-info" data-row-status="Under Review" data-id="' + escapeHtml(n.id) + '" title="' + escapeHtml(t('action.underReview')) + '" aria-label="' + escapeHtml(t('action.underReview')) + '"' + (n.status === 'Under Review' ? ' disabled' : '') + '>◔</button>' +
          '<button type="button" class="btn-icon btn-icon-success" data-row-status="Approved" data-id="' + escapeHtml(n.id) + '" title="' + escapeHtml(t('action.approve')) + '" aria-label="' + escapeHtml(t('action.approve')) + '"' + (n.status === 'Approved' ? ' disabled' : '') + '>✓</button>' +
          '<button type="button" class="btn-icon btn-icon-danger" data-row-status="Rejected" data-id="' + escapeHtml(n.id) + '" title="' + escapeHtml(t('action.reject')) + '" aria-label="' + escapeHtml(t('action.reject')) + '"' + (n.status === 'Rejected' ? ' disabled' : '') + '>✕</button>' +
          '</div></td>' +
          '</tr>';
      }).join('');
    }

    $('#list-count').textContent = nominations.length ? t('list.count', { shown: items.length, total: nominations.length }) : '';
    updateBulkBar();
  }

  function updateBulkBar() {
    const count = state.selected.size;
    $('#bulk-bar').hidden = count === 0;
    $('#bulk-count').textContent = t('bulk.count', { count });
    const visibleSelected = state.visibleIds.filter((id) => state.selected.has(id)).length;
    const selectAll = $('#select-all');
    selectAll.checked = state.visibleIds.length > 0 && visibleSelected === state.visibleIds.length;
    selectAll.indeterminate = visibleSelected > 0 && visibleSelected < state.visibleIds.length;
  }

  /* ------------------------------------------------------------------ */
  /* Status changes                                                      */
  /* ------------------------------------------------------------------ */

  function openConfirm(options) {
    $('#confirm-title').textContent = options.title;
    $('#confirm-message').textContent = options.message;
    const ok = $('#confirm-ok');
    ok.textContent = options.confirmLabel || t('common.confirm');
    ok.className = 'btn ' + (options.variant || 'btn-primary');
    const icon = $('#confirm-icon');
    icon.className = 'modal-icon modal-icon-' + (options.icon || 'info');
    icon.textContent = options.iconText || '?';
    state.confirmAction = options.onConfirm;
    UI.openModal('confirm-modal');
  }

  const STATUS_VARIANTS = {
    Approved: { variant: 'btn-success', icon: 'success', iconText: '✓' },
    Rejected: { variant: 'btn-danger', icon: 'error', iconText: '✕' },
    'Under Review': { variant: 'btn-info', icon: 'info', iconText: '◔' },
    Pending: { variant: 'btn-primary', icon: 'info', iconText: '?' }
  };

  function requestStatusChange(ids, status) {
    if (!ids.length) return;
    const statusLabel = t(Core.statusKey(status));
    const v = STATUS_VARIANTS[status];
    openConfirm({
      title: t('confirm.statusTitle', { status: statusLabel }),
      message: ids.length === 1
        ? t('confirm.statusOne', { id: ids[0], status: statusLabel })
        : t('confirm.statusMany', { count: ids.length, status: statusLabel }),
      confirmLabel: t('confirm.statusButton', { status: statusLabel }),
      variant: v.variant,
      icon: v.icon,
      iconText: v.iconText,
      onConfirm: () => applyStatus(ids, status)
    });
  }

  function applyStatus(ids, status) {
    const session = Auth.requireSession('admin');
    if (!session) return;
    const admin = currentAdmin();
    const idSet = new Set(ids);
    const now = new Date();
    const list = Core.Storage.getNominations().map((n) => (idSet.has(n.id) ? Core.applyStatusChange(n, status, admin, now) : n));
    if (!Core.Storage.saveNominations(list)) {
      UI.toast(t('toast.storageError'), 'error');
      return;
    }
    ids.forEach((id) => state.selected.delete(id));
    render();
    UI.toast(t('toast.statusUpdated', { count: ids.length, status: t(Core.statusKey(status)) }), 'success');
  }

  /* ------------------------------------------------------------------ */
  /* Details modal                                                       */
  /* ------------------------------------------------------------------ */

  function renderDetails(id) {
    const n = Core.Storage.getNomination(id);
    if (!n) {
      UI.closeModal('details-modal');
      return;
    }
    const lang = I18n.getLanguage();
    const rankings = Core.buildAllRankings(Core.Storage.getNominations());
    const entry = Core.findRankingEntry(rankings, id);
    const c = Core.computeConsolidatedScore(n);
    const score = (s) => (s ? UI.formatScore(s.total) : '—');
    const breakdown = (s) => (s ? t('score.line', { relevance: UI.formatScore(s.relevance), criteria: UI.formatScore(s.criteria), total: UI.formatScore(s.total) }) : t('adminDetails.noValidEvals'));

    let rankingText = t('ranking.reason.' + (entry && entry.reason ? entry.reason : 'noEvaluations'));
    if (entry && entry.position) {
      rankingText = t('adminDetails.position', { position: entry.position, category: t('category.' + n.category) });
    }

    const consolidated = '<div class="consolidated-grid">' +
      '<div class="consolidated-card"><span class="consolidated-label">' + escapeHtml(t('adminDetails.indexScore')) + '</span>' +
      '<span class="consolidated-value">' + score(c.indexScore) + '</span><span class="consolidated-foot">' + escapeHtml(t('adminDetails.indexNote')) + '</span></div>' +
      '<div class="consolidated-card"><span class="consolidated-label">' + escapeHtml(t('adminDetails.boardAverage')) + '</span>' +
      '<span class="consolidated-value">' + score(c.boardAverage) + '</span><span class="consolidated-foot">' + escapeHtml(breakdown(c.boardAverage)) + '</span></div>' +
      '<div class="consolidated-card is-final"><span class="consolidated-label">' + escapeHtml(t('adminDetails.finalScore')) + '</span>' +
      '<span class="consolidated-value">' + score(c.finalScore) + '</span><span class="consolidated-foot">' +
      escapeHtml(t('adminDetails.evalSummary', { valid: c.validCount, conflicts: c.conflictCount })) + '</span></div>' +
      '<div class="consolidated-card"><span class="consolidated-label">' + escapeHtml(t('adminDetails.ranking')) + '</span>' +
      '<span class="consolidated-value small">' + (entry && entry.tier ? UI.starsBadge(entry.tier, t('tier.' + entry.tier)) : '') + ' ' + escapeHtml(rankingText) + '</span>' +
      '<span class="consolidated-foot">' + (entry && entry.tier ? prizeCell(entry) : escapeHtml(t('adminDetails.noPrize'))) + '</span></div>' +
      '</div>';

    const evaluations = n.boardEvaluations.length
      ? '<div class="table-wrap"><table class="data-table compact zebra"><thead><tr>' +
        '<th>' + escapeHtml(t('view.evaluator')) + '</th>' +
        '<th class="num">' + escapeHtml(t('score.relevance')) + '</th>' +
        '<th class="num">' + escapeHtml(t('score.criteria')) + '</th>' +
        '<th class="num">' + escapeHtml(t('score.total')) + '</th>' +
        '<th>' + escapeHtml(t('conflict.title')) + '</th>' +
        '<th>' + escapeHtml(t('eval.comments')) + '</th>' +
        '<th>' + escapeHtml(t('board.evaluatedAt')) + '</th>' +
        '</tr></thead><tbody>' +
        n.boardEvaluations.map((e) => '<tr class="' + (e.declaredConflict ? 'is-conflict' : '') + '">' +
          '<td>' + escapeHtml(e.evaluatorName || '') + ' <span class="muted">#' + escapeHtml(e.evaluatorId) + '</span></td>' +
          '<td class="num">' + (e.scores ? e.scores.relevance : '—') + '</td>' +
          '<td class="num">' + (e.scores ? e.scores.criteria : '—') + '</td>' +
          '<td class="num"><strong>' + (e.scores ? e.scores.total : '—') + '</strong></td>' +
          '<td>' + (e.declaredConflict
            ? '<span class="chip chip-warning">' + escapeHtml(t('conflictReason.' + e.conflictReason)) + '</span><span class="cell-sub">' + escapeHtml(e.conflictNotes || '') + '</span>'
            : '<span class="muted">' + escapeHtml(t('conflict.none')) + '</span>') + '</td>' +
          '<td class="pre-wrap">' + escapeHtml(e.comments || '—') + '</td>' +
          '<td>' + escapeHtml(UI.formatDate(e.evaluatedAt, lang)) + '</td>' +
          '</tr>').join('') +
        '</tbody></table></div>'
      : '<p class="muted">' + escapeHtml(t('adminDetails.noEvaluations')) + '</p>';

    $('#details-subtitle').textContent = n.id + ' · ' + t('category.' + n.category);
    $('#details-body').innerHTML = consolidated +
      '<section class="detail-section"><h3 class="detail-title">' + escapeHtml(t('adminDetails.boardEvaluations', { count: n.boardEvaluations.length })) + '</h3>' + evaluations + '</section>' +
      UI.renderNominationDetails(n, { t, lang, showStatus: true });
    $$('[data-detail-status]').forEach((btn) => { btn.disabled = btn.dataset.detailStatus === n.status; });
  }

  function openDetails(id) {
    state.detailsId = id;
    renderDetails(id);
    UI.openModal('details-modal');
    $('#details-modal .modal-body').scrollTop = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Exports (ExcelJS)                                                   */
  /* ------------------------------------------------------------------ */

  function requireExcel() {
    if (!window.ExcelJS) {
      UI.toast(t('export.libMissing'), 'error');
      return null;
    }
    return window.ExcelJS;
  }

  function styleWorksheet(ws, currencyColumns) {
    const header = ws.getRow(1);
    header.height = 22;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1428A0' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF0D1B7A' } } };
    });
    (currencyColumns || []).forEach((key) => {
      ws.getColumn(key).numFmt = '"HZ$" #,##0.00';
    });
    // Automatic column widths based on the longest value in each column.
    ws.columns.forEach((column) => {
      let max = 10;
      column.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        const text = v === null || v === undefined ? '' : (typeof v === 'number' && currencyColumns && currencyColumns.indexOf(column.key) !== -1 ? Core.formatCurrency(v) : String(v));
        const longest = text.split('\n').reduce((m, line) => Math.max(m, line.length), 0);
        max = Math.max(max, longest + 2);
      });
      column.width = Math.min(max, 60);
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (ws.rowCount > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }

  function exportDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (v) => String(v).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function todayStamp() {
    return exportDate(new Date().toISOString()).slice(0, 10);
  }

  async function saveWorkbook(wb, filename) {
    const buffer = await wb.xlsx.writeBuffer();
    UI.downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  }

  async function exportReport() {
    const ExcelJS = requireExcel();
    if (!ExcelJS) return;
    const nominations = Core.Storage.getNominations();
    if (!nominations.length) {
      UI.toast(t('export.noData'), 'warning');
      return;
    }
    try {
      const rankings = Core.buildAllRankings(nominations);
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Horizon Recognition Program';
      wb.created = new Date();
      const ws = wb.addWorksheet(t('export.reportSheet'));
      ws.columns = [
        { header: t('export.col.id'), key: 'id' },
        { header: t('export.col.createdAt'), key: 'createdAt' },
        { header: t('filter.type'), key: 'type' },
        { header: t('export.col.selfNomination'), key: 'selfNomination' },
        { header: t('filter.category'), key: 'category' },
        { header: t('form.nominator.title'), key: 'nominator' },
        { header: t('table.nominees'), key: 'nominees' },
        { header: t('form.titleLabel'), key: 'title' },
        { header: t('form.relevance'), key: 'relevance' },
        { header: t('export.col.indexRelevance'), key: 'indexRelevance' },
        { header: t('export.col.indexCriteria'), key: 'indexCriteria' },
        { header: t('export.col.indexTotal'), key: 'indexTotal' },
        { header: t('export.col.validEvals'), key: 'validEvals' },
        { header: t('table.conflicts'), key: 'conflicts' },
        { header: t('export.col.boardRelevance'), key: 'boardRelevance' },
        { header: t('export.col.boardCriteria'), key: 'boardCriteria' },
        { header: t('export.col.finalScore'), key: 'finalScore' },
        { header: t('export.col.position'), key: 'position' },
        { header: t('table.tier'), key: 'tier' },
        { header: t('export.col.prizeTotal'), key: 'prizeTotal' },
        { header: t('export.col.prizePerMember'), key: 'prizePerMember' },
        { header: t('filter.status'), key: 'status' },
        { header: t('details.reviewedBy'), key: 'reviewedBy' },
        { header: t('details.reviewedAt'), key: 'reviewedAt' }
      ];
      nominations
        .slice()
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .forEach((n) => {
          const entry = Core.findRankingEntry(rankings, n.id);
          const c = entry ? entry.consolidated : Core.computeConsolidatedScore(n);
          ws.addRow({
            id: n.id,
            createdAt: exportDate(n.createdAt),
            type: t('type.' + n.type),
            selfNomination: t(n.selfNomination ? 'common.yes' : 'common.no'),
            category: t('category.' + n.category),
            nominator: n.nominator.name + ' (#' + n.nominator.id + ')',
            nominees: Core.getRecipients(n).map((p) => p.name + ' (#' + p.id + ')').join('; '),
            title: n.title,
            relevance: t('relevance.short.' + n.relevance),
            indexRelevance: n.score.relevance,
            indexCriteria: n.score.criteria,
            indexTotal: n.score.total,
            validEvals: c.validCount,
            conflicts: c.conflictCount,
            boardRelevance: c.finalScore ? c.finalScore.relevance : '',
            boardCriteria: c.finalScore ? c.finalScore.criteria : '',
            finalScore: c.finalScore ? c.finalScore.total : '',
            position: entry && entry.position ? entry.position : '',
            tier: entry && entry.tier ? entry.tier + ' ' + Core.getTierStars(entry.tier) : '',
            prizeTotal: entry && entry.tier ? entry.prize.total : 0,
            prizePerMember: entry && entry.tier ? entry.prize.perMember : 0,
            status: t(Core.statusKey(n.status)),
            reviewedBy: n.reviewedBy || '',
            reviewedAt: exportDate(n.reviewedAt)
          });
        });
      styleWorksheet(ws, ['prizeTotal', 'prizePerMember']);
      await saveWorkbook(wb, 'horizon-report-' + todayStamp() + '.xlsx');
      UI.toast(t('toast.exported', { count: nominations.length }), 'success');
    } catch (e) {
      UI.toast(t('export.failed'), 'error');
    }
  }

  async function exportPayments() {
    const ExcelJS = requireExcel();
    if (!ExcelJS) return;
    const lines = Core.buildPaymentLines(Core.Storage.getNominations());
    if (!lines.length) {
      UI.toast(t('export.noPayments'), 'warning');
      return;
    }
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Horizon Recognition Program';
      wb.created = new Date();
      const ws = wb.addWorksheet(t('export.paymentsSheet'));
      ws.columns = [
        { header: t('export.col.id'), key: 'id' },
        { header: t('filter.category'), key: 'category' },
        { header: t('export.col.position'), key: 'position' },
        { header: t('table.tier'), key: 'tier' },
        { header: t('export.col.stars'), key: 'stars' },
        { header: t('export.col.finalScore'), key: 'finalScore' },
        { header: t('filter.type'), key: 'type' },
        { header: t('export.col.members'), key: 'members' },
        { header: t('export.col.recipientId'), key: 'recipientId' },
        { header: t('export.col.recipientName'), key: 'recipientName' },
        { header: t('person.area'), key: 'area' },
        { header: t('person.location'), key: 'location' },
        { header: t('person.cl'), key: 'cl' },
        { header: t('person.email'), key: 'email' },
        { header: t('export.col.prizeTotal'), key: 'prizeTotal' },
        { header: t('export.col.amount'), key: 'amount' }
      ];
      let total = 0;
      lines.forEach((l) => {
        total = Core.round2(total + l.amount);
        ws.addRow({
          id: l.nominationId,
          category: t('category.' + l.categoryId),
          position: l.position,
          tier: l.tier,
          stars: l.stars,
          finalScore: l.finalScore,
          type: t('type.' + l.type),
          members: l.members,
          recipientId: l.recipient.id,
          recipientName: l.recipient.name,
          area: l.recipient.area,
          location: l.recipient.location,
          cl: l.recipient.cl,
          email: l.recipient.email,
          prizeTotal: l.prizeTotal,
          amount: l.amount
        });
      });
      styleWorksheet(ws, ['prizeTotal', 'amount']);
      const totalRow = ws.addRow({ id: t('export.totalRow'), amount: total });
      totalRow.font = { bold: true };
      totalRow.getCell('amount').numFmt = '"HZ$" #,##0.00';
      totalRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDFC' } };
        cell.border = { top: { style: 'thin', color: { argb: 'FF1428A0' } } };
      });
      await saveWorkbook(wb, 'horizon-payments-' + todayStamp() + '.xlsx');
      UI.toast(t('toast.paymentsExported', { count: lines.length, amount: Core.formatCurrency(total) }), 'success');
    } catch (e) {
      UI.toast(t('export.failed'), 'error');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Workers directory upload (SheetJS)                                  */
  /* ------------------------------------------------------------------ */

  function renderWorkersSource() {
    const info = Workers.getSourceInfo();
    const lang = I18n.getLanguage();
    const sample = Workers.getAll().slice(0, 5);
    $('#workers-source').innerHTML =
      '<div class="workers-source-head">' +
      '<span class="chip ' + (info.isOverride ? 'chip-info' : 'chip-muted') + '">' + escapeHtml(t(info.isOverride ? 'workers.sourceUploaded' : 'workers.sourceDefault')) + '</span>' +
      '<strong>' + escapeHtml(t('workers.count', { count: info.count })) + '</strong>' +
      '</div>' +
      (info.isOverride ? '<p class="muted small">' + escapeHtml(t('workers.updatedAt', { file: info.source || '—', date: UI.formatDate(info.updatedAt, lang) })) + '</p>' : '') +
      '<div class="table-wrap"><table class="data-table compact zebra"><thead><tr>' +
      '<th>' + escapeHtml(t('person.id')) + '</th><th>' + escapeHtml(t('person.name')) + '</th><th>' + escapeHtml(t('person.area')) + '</th><th>' + escapeHtml(t('person.cl')) + '</th>' +
      '</tr></thead><tbody>' +
      sample.map((w) => '<tr><td>' + escapeHtml(w.id) + '</td><td>' + escapeHtml(w.name) + '</td><td>' + escapeHtml(w.area) + '</td><td>' + escapeHtml(w.cl) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<p class="muted small">' + escapeHtml(t('workers.preview', { shown: sample.length, total: info.count })) + '</p>';
  }

  function setUploadStatus(kind, html) {
    const el = $('#workers-status');
    el.hidden = false;
    el.className = 'upload-status upload-status-' + kind;
    el.innerHTML = html;
  }

  async function handleWorkersFile(file) {
    if (!file) return;
    const ext = Core.getFileExtension(file.name);
    if (['xlsx', 'xls', 'csv'].indexOf(ext) === -1) {
      setUploadStatus('error', escapeHtml(t('workers.errorType')));
      UI.toast(t('workers.errorType'), 'error');
      return;
    }
    if (!window.XLSX) {
      setUploadStatus('error', escapeHtml(t('workers.libMissing')));
      UI.toast(t('workers.libMissing'), 'error');
      return;
    }
    try {
      const workbook = ext === 'csv'
        ? window.XLSX.read(await file.text(), { type: 'string', raw: false })
        : window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!rows.length) {
        setUploadStatus('error', escapeHtml(t('workers.errorEmpty')));
        UI.toast(t('workers.errorEmpty'), 'error');
        return;
      }
      const result = Core.parseWorkerRows(rows);
      if (result.missingColumns.length) {
        const msg = t('workers.errorColumns', { columns: result.missingColumns.join(', ') });
        setUploadStatus('error', escapeHtml(msg));
        UI.toast(msg, 'error');
        return;
      }
      if (!result.workers.length) {
        setUploadStatus('error', escapeHtml(t('workers.errorNoValid')));
        UI.toast(t('workers.errorNoValid'), 'error');
        return;
      }
      Workers.replace(result.workers, file.name);
      let html = '<strong>' + escapeHtml(t('workers.success', { count: result.workers.length, file: file.name })) + '</strong>';
      if (result.invalidRows.length) {
        html += '<br>' + escapeHtml(t('workers.skipped', { count: result.invalidRows.length, rows: result.invalidRows.slice(0, 10).join(', ') + (result.invalidRows.length > 10 ? '…' : '') }));
      }
      if (result.duplicates) html += '<br>' + escapeHtml(t('workers.duplicates', { count: result.duplicates }));
      setUploadStatus(result.invalidRows.length || result.duplicates ? 'warning' : 'success', html);
      renderWorkersSource();
      UI.toast(t('workers.success', { count: result.workers.length, file: file.name }), 'success');
    } catch (e) {
      setUploadStatus('error', escapeHtml(t('workers.errorRead')));
      UI.toast(t('workers.errorRead'), 'error');
    }
  }

  async function downloadTemplate() {
    const ExcelJS = requireExcel();
    if (!ExcelJS) return;
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('workers');
      ws.columns = ['id', 'name', 'area', 'location', 'cl', 'email'].map((k) => ({ header: k, key: k }));
      Workers.seed.slice(0, 3).forEach((w) => ws.addRow(w));
      ws.getColumn('id').numFmt = '@';
      styleWorksheet(ws, []);
      await saveWorkbook(wb, 'horizon-workers-template.xlsx');
      UI.toast(t('workers.templateDone'), 'success');
    } catch (e) {
      UI.toast(t('export.failed'), 'error');
    }
  }

  function initWorkersUpload() {
    const zone = $('#workers-drop');
    const input = $('#workers-input');
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    ['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.add('is-dragover');
    }));
    ['dragleave', 'dragend', 'drop'].forEach((type) => zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
    }));
    zone.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleWorkersFile(file);
    });
    input.addEventListener('change', () => {
      handleWorkersFile(input.files[0]);
      input.value = '';
    });
    $('#download-template').addEventListener('click', downloadTemplate);
    $('#reset-workers').addEventListener('click', () => {
      openConfirm({
        title: t('workers.resetTitle'),
        message: t('workers.resetMessage', { count: Workers.seed.length }),
        confirmLabel: t('workers.reset'),
        onConfirm: () => {
          Workers.reset();
          $('#workers-status').hidden = true;
          renderWorkersSource();
          UI.toast(t('workers.resetDone'), 'success');
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Demo data                                                           */
  /* ------------------------------------------------------------------ */

  const DEMO = [
    { cat: 'business', type: 'grupo', nominator: '10000016', people: ['10000002', '10000012', '10000021'], rel: '50', grades: 'SSSAA', status: 'Approved',
      title: 'Smart warehouse rollout across three sites', evals: [['50', 'SSSAA'], ['50', 'SSAAA'], 'conflict'] },
    { cat: 'business', type: 'individual', nominator: '10000020', people: ['10000010'], rel: '50', grades: 'SAAAB', status: 'Under Review',
      title: 'Supplier consolidation that cut lead time by 30%', evals: [['50', 'SAAAB'], ['30', 'SSAAA']] },
    { cat: 'business', type: 'individual', nominator: '10000028', people: ['10000017'], rel: '30', grades: 'SAAAB', status: 'Approved',
      title: 'Monthly close automation for the finance team', evals: [['30', 'SSAAA'], ['30', 'SAAAA']] },
    { cat: 'business', type: 'individual', nominator: '10000006', people: ['10000026'], rel: '30', grades: 'SAAAB', status: 'Pending',
      title: 'Shift scheduling spreadsheet for the assembly line', evals: [['15', 'ABBBB']] },
    { cat: 'cultural', type: 'individual', nominator: '10000005', people: ['10000019'], rel: '30', grades: 'SSAAA', status: 'Approved',
      title: 'Mentoring circle for new joiners in the Northeast hub', evals: [['50', 'SSSAS'], ['30', 'SSAAS']] },
    { cat: 'cultural', type: 'grupo', nominator: '10000003', people: ['10000011', '10000023'], rel: '30', grades: 'SSAAA', status: 'Approved',
      title: 'Accessible design guidelines adopted company-wide', evals: [['30', 'SSSAA'], ['30', 'AAAAA']] },
    { cat: 'cultural', type: 'individual', nominator: '10000013', people: ['10000013'], self: true, rel: '30', grades: 'SAAAA', status: 'Pending',
      title: 'Wellbeing week organized for the customer care team', evals: [['30', 'SAAAA']] },
    { cat: 'innovation', type: 'individual', nominator: '10000007', people: ['10000022'], rel: '50', grades: 'SSSAA', status: 'Approved',
      title: 'AI assistant that triages internal IT tickets', evals: [['50', 'SSSSA'], ['50', 'SSSAA'], 'conflict'] },
    { cat: 'innovation', type: 'grupo', nominator: '10000012', people: ['10000001', '10000029', '10000014'], rel: '50', grades: 'SSAAA', status: 'Approved',
      title: 'Predictive maintenance model for test benches', evals: [['30', 'SSAAA'], ['50', 'SAAAB']] },
    { cat: 'innovation', type: 'individual', nominator: '10000025', people: ['10000009'], rel: '30', grades: 'SAAAB', status: 'Rejected',
      title: 'Contract clause search prototype', evals: [['30', 'AAABB'], ['15', 'AAAAB']] }
  ];

  function gradesToCriteria(categoryId, grades) {
    const criteria = {};
    Core.getCriteriaIds(categoryId).forEach((id, i) => { criteria[id] = grades[i]; });
    return criteria;
  }

  function buildDemoNominations() {
    const find = (id) => Workers.seed.find((w) => w.id === id);
    const base = Date.now() - DEMO.length * 86400000;
    return DEMO.map((d, i) => {
      const created = new Date(base + i * 86400000 + i * 1371);
      const people = d.people.map(find);
      const nominator = Object.assign({}, find(d.nominator), { relationship: i % 2 ? 'peer' : 'manager' });
      let nomination = Core.createNomination({
        selfNomination: d.self === true,
        nominator,
        type: d.type,
        nominee: d.type === 'individual' ? people[0] : null,
        group: d.type === 'grupo' ? people : [],
        category: d.cat,
        criteria: gradesToCriteria(d.cat, d.grades),
        relevance: d.rel,
        title: d.title,
        description: t('demo.description'),
        evidence: t('demo.evidence'),
        attachments: i % 3 === 0 ? [{ name: 'impact-report.pdf', size: 482113, type: 'application/pdf' }] : []
      }, created);
      d.evals.forEach((ev, idx) => {
        const member = Core.BOARD_MEMBERS[idx];
        const when = new Date(created.getTime() + (idx + 1) * 3600000);
        const draft = ev === 'conflict'
          ? { declaredConflict: true, conflictReason: 'same_project', conflictNotes: t('demo.conflictNotes') }
          : { declaredConflict: false, relevance: ev[0], criteria: gradesToCriteria(d.cat, ev[1]), comments: t('demo.comments') };
        nomination = Core.addBoardEvaluation(nomination, Core.createBoardEvaluation(draft, d.cat, member, when));
      });
      if (d.status !== 'Pending') nomination = Core.applyStatusChange(nomination, d.status, currentAdmin(), new Date(created.getTime() + 86400000 / 2));
      return nomination;
    });
  }

  function initTools() {
    $('#load-demo').addEventListener('click', () => {
      openConfirm({
        title: t('tools.loadDemoTitle'),
        message: t('tools.loadDemoMessage', { count: DEMO.length }),
        confirmLabel: t('tools.loadDemo'),
        onConfirm: () => {
          const list = Core.Storage.getNominations().concat(buildDemoNominations());
          if (!Core.Storage.saveNominations(list)) {
            UI.toast(t('toast.storageError'), 'error');
            return;
          }
          render();
          UI.toast(t('tools.demoLoaded', { count: DEMO.length }), 'success');
        }
      });
    });
    $('#clear-data').addEventListener('click', () => {
      openConfirm({
        title: t('tools.clearTitle'),
        message: t('tools.clearMessage'),
        confirmLabel: t('tools.clear'),
        variant: 'btn-danger',
        icon: 'error',
        iconText: '!',
        onConfirm: () => {
          Core.Storage.remove(Core.STORAGE_KEYS.nominations);
          Core.Storage.remove(Core.STORAGE_KEYS.myNominations);
          state.selected.clear();
          render();
          UI.toast(t('tools.cleared'), 'success');
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    if (!Auth.getSession()) return; // guard is redirecting to login
    I18n.init();
    UI.initModals();

    $$('#ranking-tabs .tab').forEach((btn) => btn.addEventListener('click', () => {
      state.rankingTab = btn.dataset.rankingTab;
      renderRanking(Core.buildAllRankings(Core.Storage.getNominations()));
    }));

    ['#admin-filter-category', '#admin-filter-status', '#admin-filter-type', '#admin-filter-origin'].forEach((sel) => $(sel).addEventListener('change', () => renderList(Core.Storage.getNominations())));
    $('#admin-search').addEventListener('input', UI.debounce(() => renderList(Core.Storage.getNominations()), 150));

    $('#nominations-body').addEventListener('change', (e) => {
      const box = e.target.closest('[data-select]');
      if (!box) return;
      if (box.checked) state.selected.add(box.dataset.select);
      else state.selected.delete(box.dataset.select);
      box.closest('tr').classList.toggle('is-selected', box.checked);
      updateBulkBar();
    });
    $('#select-all').addEventListener('change', (e) => {
      state.visibleIds.forEach((id) => {
        if (e.target.checked) state.selected.add(id);
        else state.selected.delete(id);
      });
      renderList(Core.Storage.getNominations());
    });
    $('#bulk-clear').addEventListener('click', () => {
      state.selected.clear();
      renderList(Core.Storage.getNominations());
    });
    $$('[data-bulk-status]').forEach((btn) => btn.addEventListener('click', () => requestStatusChange(Array.from(state.selected), btn.dataset.bulkStatus)));

    document.addEventListener('click', (e) => {
      const view = e.target.closest('[data-view]');
      if (view) {
        openDetails(view.dataset.view);
        return;
      }
      const rowStatus = e.target.closest('[data-row-status]');
      if (rowStatus) {
        requestStatusChange([rowStatus.dataset.id], rowStatus.dataset.rowStatus);
        return;
      }
      const detailStatus = e.target.closest('[data-detail-status]');
      if (detailStatus && state.detailsId) {
        requestStatusChange([state.detailsId], detailStatus.dataset.detailStatus);
        return;
      }
      const rankingRow = e.target.closest('[data-open-details]');
      if (rankingRow) openDetails(rankingRow.dataset.openDetails);
    });

    $('#confirm-ok').addEventListener('click', () => {
      const action = state.confirmAction;
      state.confirmAction = null;
      UI.closeModal('confirm-modal');
      if (typeof action === 'function') action();
    });
    $('#details-modal').addEventListener('modal:closed', () => { state.detailsId = null; });

    $('#export-report').addEventListener('click', exportReport);
    $('#export-payments').addEventListener('click', exportPayments);

    initWorkersUpload();
    initTools();

    document.addEventListener('languagechange', render);
    window.addEventListener('storage', (event) => {
      if (event.key === Core.STORAGE_KEYS.nominations || event.key === Core.STORAGE_KEYS.workers) render();
    });

    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
