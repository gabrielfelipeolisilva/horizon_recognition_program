/**
 * Horizon Recognition Program — nomination form (index.html).
 *
 * Responsibilities: nominator/nominee autofill from the workers directory,
 * self-nomination (nominee mirrors the nominator), individual vs group nominations, dynamic criteria per category, live score,
 * attachments (metadata only), review modal, eligibility rule (< 60 rejected
 * and not saved) and the "My Nominations" list with filters.
 */
(function () {
  'use strict';

  const Core = window.HorizonCore;
  const UI = Core.UI;
  const Workers = window.HorizonWorkers;
  const I18n = window.I18n;
  const t = (key, params) => I18n.t(key, params);
  const { $, $$, escapeHtml } = UI;

  const state = {
    attachments: [],
    memberSeq: 0,
    pendingNomination: null
  };

  /* ------------------------------------------------------------------ */
  /* Person fields (nominator, nominee, group members)                    */
  /* ------------------------------------------------------------------ */

  const PERSON_INPUTS = [
    { field: 'id', key: 'person.id', type: 'text', placeholderKey: 'person.idPlaceholder', inputmode: 'numeric', maxlength: 8 },
    { field: 'name', key: 'person.name', type: 'text' },
    { field: 'area', key: 'person.area', type: 'text' },
    { field: 'location', key: 'person.location', type: 'text' },
    { field: 'cl', key: 'person.cl', type: 'text', placeholderKey: 'person.clPlaceholder' },
    { field: 'email', key: 'person.email', type: 'email', placeholderKey: 'person.emailPlaceholder' }
  ];

  /**
   * @param {string} domPrefix  prefix for element ids (e.g. "nominee", "group-3")
   * @param {string} errorPrefix prefix used by validation errors (e.g. "nominee", "group.0")
   */
  function personFieldsHtml(domPrefix, errorPrefix) {
    return PERSON_INPUTS.map((input) => {
      const id = domPrefix + '-' + input.field;
      const errorField = errorPrefix + '.' + input.field;
      const isId = input.field === 'id';
      return '<div class="form-group' + (isId ? ' form-group-id' : '') + '">' +
        '<label for="' + id + '"><span data-i18n="' + input.key + '">' + escapeHtml(t(input.key)) + '</span> <span class="req">*</span></label>' +
        '<div class="input-wrap">' +
        '<input type="' + input.type + '" id="' + id + '" data-person-field="' + input.field + '" data-field="' + errorField + '"' +
        (input.maxlength ? ' maxlength="' + input.maxlength + '"' : '') +
        (input.inputmode ? ' inputmode="' + input.inputmode + '"' : '') +
        (isId ? ' list="workers-datalist" autocomplete="off"' : ' autocomplete="off"') +
        (input.placeholderKey ? ' data-i18n-placeholder="' + input.placeholderKey + '" placeholder="' + escapeHtml(t(input.placeholderKey)) + '"' : '') +
        '>' +
        (isId ? '<span class="lookup-status" aria-live="polite"></span>' : '') +
        '</div>' +
        '<p class="field-error" data-error-for="' + errorField + '"></p>' +
        '</div>';
    }).join('');
  }

  function readPerson(container) {
    const person = {};
    $$('[data-person-field]', container).forEach((input) => {
      person[input.dataset.personField] = input.value.trim();
    });
    return person;
  }

  function writePerson(container, person) {
    $$('[data-person-field]', container).forEach((input) => {
      const field = input.dataset.personField;
      input.value = person && person[field] ? person[field] : '';
    });
  }

  /** Autofill: looks the ID up in the workers DB and fills the other fields. */
  function handleIdLookup(input) {
    const container = input.closest('[data-person-prefix], .group-member');
    const status = input.parentElement.querySelector('.lookup-status');
    const raw = input.value.trim();
    const others = $$('[data-person-field]', container).filter((el) => el !== input);

    const clearAutofilled = () => {
      others.forEach((el) => {
        if (el.classList.contains('autofilled')) {
          el.value = '';
          el.classList.remove('autofilled');
        }
      });
    };

    if (!raw) {
      clearAutofilled();
      setLookupStatus(status, '', '');
      return;
    }
    if (!/^\d{8}$/.test(raw)) {
      clearAutofilled();
      setLookupStatus(status, raw.length >= 8 ? 'error' : 'pending', raw.length >= 8 ? t('lookup.invalid') : t('lookup.typing'));
      return;
    }
    const worker = Workers.findById(raw);
    if (worker) {
      others.forEach((el) => {
        el.value = worker[el.dataset.personField] || '';
        el.classList.add('autofilled');
        clearFieldError(el.dataset.field);
      });
      clearFieldError(input.dataset.field);
      setLookupStatus(status, 'found', t('lookup.found', { name: worker.name }));
    } else {
      clearAutofilled();
      setLookupStatus(status, 'missing', t('lookup.notFound'));
    }
    updateDuplicateHints();
  }

  function setLookupStatus(el, kind, text) {
    if (!el) return;
    el.className = 'lookup-status' + (kind ? ' lookup-' + kind : '');
    el.textContent = text;
    el.title = text;
  }

  function refreshWorkersDatalist() {
    const list = $('#workers-datalist');
    if (!list) return;
    list.innerHTML = Workers.getAll()
      .map((w) => '<option value="' + escapeHtml(w.id) + '">' + escapeHtml(w.name + ' — ' + w.area) + '</option>')
      .join('');
  }

  /* ------------------------------------------------------------------ */
  /* Self-nomination                                                     */
  /* ------------------------------------------------------------------ */

  function isSelf() {
    const checked = $('input[name="nomination-target"]:checked');
    return Boolean(checked && checked.value === 'self');
  }

  /** Copies the nominator into the (locked) nominee fields. */
  function syncSelf() {
    if (!isSelf()) return;
    writePerson($('#individual-fields'), readPerson($('#nominator-fields')));
    PERSON_INPUTS.forEach((input) => clearFieldError('nominee.' + input.field));
  }

  /** Applies the "Myself" / "Someone else" choice to the whole form. */
  function applyTargetState(clearOnLeave) {
    const self = isSelf();
    const nomineeContainer = $('#individual-fields');
    const nomineeInputs = $$('[data-person-field]', nomineeContainer);
    const groupRadio = $('input[name="nomination-type"][value="grupo"]');

    $('#self-notice').hidden = !self;
    $('#relationship-group').hidden = self;
    groupRadio.disabled = self;
    groupRadio.closest('.radio-pill').classList.toggle('is-disabled', self);
    nomineeContainer.classList.toggle('is-mirrored', self);
    clearFieldError('selfNomination');

    if (self) {
      $('input[name="nomination-type"][value="individual"]').checked = true;
      applyTypeVisibility();
      nomineeInputs.forEach((input) => {
        input.readOnly = true;
        input.classList.remove('autofilled', 'has-error');
        input.setAttribute('aria-readonly', 'true');
        input.removeAttribute('list');
      });
      setLookupStatus(nomineeContainer.querySelector('.lookup-status'), '', '');
      clearFieldError('nominator.relationship');
      syncSelf();
    } else {
      nomineeInputs.forEach((input) => {
        const wasMirrored = input.readOnly;
        input.readOnly = false;
        input.removeAttribute('aria-readonly');
        if (input.dataset.personField === 'id') input.setAttribute('list', 'workers-datalist');
        if (clearOnLeave && wasMirrored) input.value = '';
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Nomination type & group members                                     */
  /* ------------------------------------------------------------------ */

  function getType() {
    const checked = $('input[name="nomination-type"]:checked');
    return checked ? checked.value : 'individual';
  }

  function applyTypeVisibility() {
    const isGroup = getType() === 'grupo';
    $('#individual-fields').hidden = isGroup;
    $('#group-fields').hidden = !isGroup;
    if (isGroup && $$('.group-member').length === 0) addMember();
  }

  function addMember(person) {
    state.memberSeq += 1;
    const domPrefix = 'group-' + state.memberSeq;
    const wrapper = document.createElement('div');
    wrapper.className = 'group-member';
    wrapper.dataset.memberSeq = String(state.memberSeq);
    wrapper.innerHTML =
      '<div class="group-member-header">' +
      '<span class="member-index"></span>' +
      '<button type="button" class="btn-icon-text btn-remove-member"><span aria-hidden="true">×</span> <span data-i18n="form.removeMember">' + escapeHtml(t('form.removeMember')) + '</span></button>' +
      '</div>' +
      '<div class="form-grid member-grid"></div>';
    $('#group-members').appendChild(wrapper);
    reindexMembers();
    if (person) writePerson(wrapper, person);
    const firstInput = $('input', wrapper);
    if (!person && firstInput && document.activeElement && document.activeElement.id === 'add-member') firstInput.focus();
    return wrapper;
  }

  /** Re-renders member numbering and error prefixes after add/remove. */
  function reindexMembers() {
    const members = $$('.group-member');
    members.forEach((member, index) => {
      const values = readPerson(member);
      const grid = $('.member-grid', member);
      grid.innerHTML = personFieldsHtml('group-' + member.dataset.memberSeq, 'group.' + index);
      writePerson(member, values);
      $('.member-index', member).textContent = t('form.memberN', { n: index + 1 });
      $('.btn-remove-member', member).disabled = members.length === 1;
    });
  }

  function removeMember(member) {
    if ($$('.group-member').length <= 1) return;
    member.remove();
    reindexMembers();
    updateDuplicateHints();
  }

  /** Visual hint for duplicated member IDs while typing. */
  function updateDuplicateHints() {
    const seen = {};
    $$('.group-member [data-person-field="id"]').forEach((input) => {
      const v = input.value.trim();
      input.classList.toggle('is-duplicate', Boolean(v) && Boolean(seen[v]));
      if (v) seen[v] = true;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Criteria & live score                                               */
  /* ------------------------------------------------------------------ */

  function gradeOptionsHtml(selected) {
    return '<option value="">' + escapeHtml(t('form.selectGrade')) + '</option>' +
      ['S', 'A', 'B'].map((g) =>
        '<option value="' + g + '"' + (selected === g ? ' selected' : '') + '>' + escapeHtml(t('grade.option.' + g)) + '</option>'
      ).join('');
  }

  function renderCriteria(preserve) {
    const container = $('#criteria-container');
    const categoryId = $('#category').value;
    const previous = preserve ? readCriteria() : {};
    if (!categoryId) {
      container.innerHTML = '<div class="empty-inline">' + escapeHtml(t('form.criteriaEmpty')) + '</div>';
      return;
    }
    const rows = Core.getCriteriaIds(categoryId).map((id, index) => {
      const nameKey = 'crit.' + categoryId + '.' + id;
      const desc = t(nameKey + '.desc');
      return '<div class="criterion-row">' +
        '<div class="criterion-info">' +
        '<span class="criterion-number">' + (index + 1) + '</span>' +
        '<label class="criterion-name" for="criterion-' + id + '">' + escapeHtml(t(nameKey)) + ' <span class="req">*</span></label>' +
        '<span class="tooltip" tabindex="0" role="button" aria-label="' + escapeHtml(desc) + '">ⓘ<span class="tooltip-text" role="tooltip">' + escapeHtml(desc) + '</span></span>' +
        '</div>' +
        '<p class="criterion-desc">' + escapeHtml(desc) + '</p>' +
        '<select id="criterion-' + id + '" class="grade-select" data-criterion="' + id + '" data-field="criteria.' + id + '">' +
        gradeOptionsHtml(previous[id]) +
        '</select>' +
        '<p class="field-error" data-error-for="criteria.' + id + '"></p>' +
        '</div>';
    }).join('');
    container.innerHTML = '<div class="criteria-header"><span>' + escapeHtml(t('form.criteriaTitle', { category: t('category.' + categoryId) })) + '</span></div>' + rows;
    $$('.grade-select', container).forEach(paintGradeSelect);
  }

  function paintGradeSelect(select) {
    select.classList.remove('grade-s', 'grade-a', 'grade-b');
    if (select.value) select.classList.add('grade-' + select.value.toLowerCase());
  }

  function readCriteria() {
    const criteria = {};
    $$('#criteria-container [data-criterion]').forEach((select) => {
      if (select.value) criteria[select.dataset.criterion] = select.value;
    });
    return criteria;
  }

  function updateRelevanceHelp() {
    const value = $('#relevance').value;
    const help = $('#relevance-desc');
    help.textContent = value ? t('relevance.desc.' + value) : t('form.relevanceHelp');
  }

  function updateScore() {
    const categoryId = $('#category').value;
    const relevance = $('#relevance').value;
    const criteria = readCriteria();
    const score = Core.calculateTotalScore(relevance, criteria, categoryId || null);
    const complete = Core.isScoreComplete(relevance, criteria, categoryId);
    const eligible = Core.isEligible(score.total);

    $('#score-line').textContent = t('score.line', score);
    $('#score-relevance').textContent = score.relevance;
    $('#score-criteria').textContent = score.criteria;
    $('#score-total').textContent = score.total;
    $('#score-meter-fill').style.width = score.total + '%';

    const panel = $('#score-panel');
    panel.classList.toggle('is-eligible', eligible);
    panel.classList.toggle('is-below', complete && !eligible);

    const status = $('#score-status');
    if (!complete) status.textContent = t('score.statusIncomplete');
    else if (eligible) status.textContent = t('score.statusEligible');
    else status.textContent = t('score.statusBelow', { missing: Core.pointsMissingForEligibility(score.total) });
    return score;
  }

  /* ------------------------------------------------------------------ */
  /* Attachments                                                         */
  /* ------------------------------------------------------------------ */

  function addFiles(fileList) {
    Array.prototype.forEach.call(fileList, (file) => {
      const meta = { name: file.name, size: file.size, type: file.type || '' };
      const error = Core.validateAttachment(meta, state.attachments);
      if (error) {
        UI.toast(t('validation.' + error, { name: file.name, max: Core.ATTACHMENT_RULES.maxFiles }), 'error');
        return;
      }
      state.attachments.push(meta);
    });
    renderAttachments();
  }

  function renderAttachments() {
    const list = $('#attachment-list');
    list.innerHTML = state.attachments.map((file, index) =>
      '<li class="attachment-item">' +
      '<span class="attachment-ext">' + escapeHtml(Core.getFileExtension(file.name).toUpperCase() || 'FILE') + '</span>' +
      '<span class="attachment-name" title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</span>' +
      '<span class="attachment-size">' + UI.formatFileSize(file.size) + '</span>' +
      '<button type="button" class="btn-icon" data-remove-attachment="' + index + '" aria-label="' + escapeHtml(t('form.removeFile', { name: file.name })) + '">×</button>' +
      '</li>'
    ).join('');
    clearFieldError('attachments');
  }

  function initDropZone() {
    const zone = $('#file-drop');
    const input = $('#file-input');
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
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', () => {
      addFiles(input.files);
      input.value = '';
    });
    $('#attachment-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-attachment]');
      if (!btn) return;
      state.attachments.splice(Number(btn.dataset.removeAttachment), 1);
      renderAttachments();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Validation display                                                  */
  /* ------------------------------------------------------------------ */

  function clearFieldError(field) {
    const el = document.querySelector('[data-error-for="' + field + '"]');
    if (el) el.textContent = '';
    const input = document.querySelector('[data-field="' + field + '"]');
    if (input) {
      input.classList.remove('has-error');
      input.removeAttribute('aria-invalid');
    }
  }

  function clearAllErrors() {
    $$('.field-error').forEach((el) => { el.textContent = ''; });
    $$('.has-error').forEach((el) => el.classList.remove('has-error'));
    $$('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  function showErrors(errors) {
    clearAllErrors();
    let first = null;
    errors.forEach((err) => {
      const msg = t('validation.' + err.code, err.params || {});
      const holder = document.querySelector('[data-error-for="' + err.field + '"]');
      if (holder && !holder.textContent) holder.textContent = msg;
      const input = document.querySelector('[data-field="' + err.field + '"]');
      if (input) {
        input.classList.add('has-error');
        input.setAttribute('aria-invalid', 'true');
        if (!first) first = input;
      } else if (!first && holder) {
        first = holder;
      }
    });
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof first.focus === 'function') setTimeout(() => first.focus({ preventScroll: true }), 300);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Collect, review, submit                                             */
  /* ------------------------------------------------------------------ */

  function collectFormData() {
    const self = isSelf();
    const nominator = readPerson($('#nominator-fields'));
    nominator.relationship = self ? 'self' : $('#nominator-relationship').value;
    const type = self ? 'individual' : getType();
    return {
      selfNomination: self,
      nominator,
      type,
      nominee: type === 'individual' ? readPerson($('#individual-fields')) : null,
      group: type === 'grupo' ? $$('.group-member').map(readPerson) : [],
      category: $('#category').value,
      criteria: readCriteria(),
      relevance: $('#relevance').value,
      title: $('#title').value,
      description: $('#description').value,
      evidence: $('#evidence').value,
      attachments: state.attachments.slice()
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    const data = collectFormData();
    const result = Core.validateNomination(data);
    if (!result.valid) {
      showErrors(result.errors);
      UI.toast(t('toast.fixErrors', { count: result.errors.length }), 'error');
      return;
    }
    clearAllErrors();
    // Build the record now so the review shows exactly what will be stored.
    state.pendingNomination = Core.createNomination(data);
    $('#review-body').innerHTML = renderReview(state.pendingNomination);
    UI.openModal('review-modal');
  }

  function renderReview(nomination) {
    const eligible = Core.isEligible(nomination.score.total);
    return '<div class="review-score ' + (eligible ? 'is-eligible' : 'is-below') + '">' +
      '<div><span class="review-score-label">' + escapeHtml(t('score.total')) + '</span>' +
      '<span class="review-score-value">' + nomination.score.total + '<small>/100</small></span></div>' +
      '<p>' + escapeHtml(t('score.line', nomination.score)) + '</p>' +
      '</div>' +
      UI.renderNominationDetails(nomination, { t, lang: I18n.getLanguage(), showStatus: false });
  }

  function handleConfirm() {
    const nomination = state.pendingNomination;
    if (!nomination) return;
    UI.closeModal('review-modal');

    if (!Core.isEligible(nomination.score.total)) {
      $('#rejection-message').textContent = t('rejection.message', {
        score: nomination.score.total,
        min: Core.MIN_ELIGIBLE_SCORE,
        missing: Core.pointsMissingForEligibility(nomination.score.total)
      });
      resetForm();
      UI.openModal('rejection-modal');
      UI.toast(t('toast.notEligible'), 'warning');
      return;
    }

    const saved = Core.Storage.addNomination(nomination);
    if (!saved) {
      UI.toast(t('toast.storageError'), 'error');
      return;
    }
    Core.Storage.rememberMyNomination(nomination.id);
    $('#success-message').textContent = t('success.message', { id: nomination.id, score: nomination.score.total });
    resetForm();
    renderMyNominations();
    UI.openModal('success-modal');
    UI.toast(t('toast.submitted'), 'success');
  }

  function resetForm() {
    const form = $('#nomination-form');
    form.reset();
    state.attachments = [];
    state.pendingNomination = null;
    $('#group-members').innerHTML = '';
    $$('.autofilled').forEach((el) => el.classList.remove('autofilled'));
    $$('.lookup-status').forEach((el) => setLookupStatus(el, '', ''));
    $('input[name="nomination-target"][value="others"]').checked = true;
    applyTargetState(true);
    applyTypeVisibility();
    renderCriteria(false);
    renderAttachments();
    updateRelevanceHelp();
    updateCounters();
    clearAllErrors();
    updateScore();
  }

  /** Demo helper: fills the form with an eligible example nomination. */
  function fillExample() {
    resetForm();
    const nominatorInput = $('#nominator-id');
    nominatorInput.value = '10000005';
    handleIdLookup(nominatorInput);
    $('#nominator-relationship').value = 'manager';
    const nomineeInput = $('#nominee-id');
    nomineeInput.value = '10000014';
    handleIdLookup(nomineeInput);
    $('#category').value = 'innovation';
    renderCriteria(false);
    const grades = { innovation: 'S', technical_expertise: 'S', impact: 'A', collaboration: 'A', strategic_thinking: 'B' };
    $$('#criteria-container [data-criterion]').forEach((select) => {
      select.value = grades[select.dataset.criterion];
      paintGradeSelect(select);
    });
    $('#relevance').value = '30';
    $('#title').value = t('example.title');
    $('#description').value = t('example.description');
    $('#evidence').value = t('example.evidence');
    updateRelevanceHelp();
    updateCounters();
    updateScore();
    UI.toast(t('toast.exampleFilled'), 'info');
  }

  /* ------------------------------------------------------------------ */
  /* Counters                                                            */
  /* ------------------------------------------------------------------ */

  function updateCounters() {
    $$('[data-counter-for]').forEach((counter) => {
      const input = document.getElementById(counter.dataset.counterFor);
      const max = Number(input.getAttribute('maxlength'));
      counter.textContent = input.value.length + ' / ' + max;
      counter.classList.toggle('is-near-limit', input.value.length > max * 0.9);
    });
  }

  /* ------------------------------------------------------------------ */
  /* My Nominations                                                      */
  /* ------------------------------------------------------------------ */

  function renderMyNominations() {
    const list = $('#my-nominations-list');
    const myIds = Core.Storage.getMyNominationIds();
    const category = $('#filter-category').value;
    const status = $('#filter-status').value;
    const all = Core.Storage.getNominations().filter((n) => myIds.indexOf(n.id) !== -1);
    const items = all
      .filter((n) => (!category || n.category === category) && (!status || n.status === status))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    $('#mine-count').textContent = all.length ? t('mine.count', { shown: items.length, total: all.length }) : '';

    if (!all.length) {
      list.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true">🏆</span>' +
        '<h3>' + escapeHtml(t('mine.emptyTitle')) + '</h3><p>' + escapeHtml(t('mine.emptyText')) + '</p></div>';
      return;
    }
    if (!items.length) {
      list.innerHTML = '<div class="empty-state compact"><p>' + escapeHtml(t('mine.noMatch')) + '</p></div>';
      return;
    }
    const lang = I18n.getLanguage();
    list.innerHTML = items.map((n) => {
      const people = Core.getRecipients(n).map((p) => p.name).join(', ');
      return '<article class="nomination-card">' +
        '<header class="nomination-card-header">' +
        '<span class="nomination-id">' + escapeHtml(n.id) + '</span>' +
        UI.statusBadge(n.status, t(Core.statusKey(n.status))) +
        '</header>' +
        '<h3 class="nomination-title">' + escapeHtml(n.title) + '</h3>' +
        '<div class="chip-row">' +
        '<span class="chip chip-category cat-' + n.category + '">' + escapeHtml(t('category.' + n.category)) + '</span>' +
        '<span class="chip">' + escapeHtml(t('type.' + n.type)) + (n.type === 'grupo' ? ' · ' + n.group.length : '') + '</span>' +
        UI.selfBadge(n, t) +
        '<span class="chip chip-score">' + escapeHtml(t('card.score', { total: n.score.total })) + '</span>' +
        '</div>' +
        '<dl class="meta-list">' +
        '<div><dt>' + escapeHtml(t(n.type === 'grupo' ? 'card.members' : 'card.nominee')) + '</dt><dd>' + escapeHtml(people) + '</dd></div>' +
        '<div><dt>' + escapeHtml(t('card.relevance')) + '</dt><dd>' + escapeHtml(t('relevance.short.' + n.relevance)) + '</dd></div>' +
        '<div><dt>' + escapeHtml(t('card.submitted')) + '</dt><dd>' + escapeHtml(UI.formatDate(n.createdAt, lang)) + '</dd></div>' +
        (n.reviewedAt ? '<div><dt>' + escapeHtml(t('card.reviewed')) + '</dt><dd>' + escapeHtml(UI.formatDate(n.reviewedAt, lang)) + '</dd></div>' : '') +
        '</dl>' +
        '<details class="card-details"><summary>' + escapeHtml(t('card.showDetails')) + '</summary>' +
        UI.renderNominationDetails(n, { t, lang, showStatus: true, compact: true }) +
        '</details>' +
        '</article>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* i18n re-render                                                      */
  /* ------------------------------------------------------------------ */

  function rerenderDynamic() {
    reindexMembers();
    applyTargetState(false);
    renderCriteria(true);
    renderAttachments();
    updateRelevanceHelp();
    updateScore();
    renderMyNominations();
    $$('[data-person-field="id"]').forEach((input) => {
      if (input.value.trim()) {
        const status = input.parentElement.querySelector('.lookup-status');
        const worker = Workers.findById(input.value.trim());
        if (worker) setLookupStatus(status, 'found', t('lookup.found', { name: worker.name }));
        else if (/^\d{8}$/.test(input.value.trim())) setLookupStatus(status, 'missing', t('lookup.notFound'));
      }
    });
    if (!$('#review-modal').hidden && state.pendingNomination) {
      $('#review-body').innerHTML = renderReview(state.pendingNomination);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    I18n.init();
    UI.initModals();

    $('#nominator-fields').innerHTML = personFieldsHtml('nominator', 'nominator');
    $('#individual-fields').innerHTML = personFieldsHtml('nominee', 'nominee');
    $('#individual-fields').setAttribute('aria-live', 'polite');
    refreshWorkersDatalist();

    const form = $('#nomination-form');
    form.addEventListener('submit', handleSubmit);

    form.addEventListener('input', (event) => {
      const target = event.target;
      if (target.dataset.personField === 'id') handleIdLookup(target);
      else if (target.dataset.personField && target.classList.contains('autofilled')) target.classList.remove('autofilled');
      if (target.dataset.field) clearFieldError(target.dataset.field);
      if (target.matches('#title, #description, #evidence')) updateCounters();
      // Self-nomination: the nominee follows every change made to the nominator.
      if (target.closest('#nominator-fields')) syncSelf();
    });

    form.addEventListener('change', (event) => {
      const target = event.target;
      if (target.name === 'nomination-target') {
        applyTargetState(true);
      } else if (target.name === 'nomination-type') {
        applyTypeVisibility();
        clearFieldError('group');
      } else if (target.id === 'category') {
        renderCriteria(false);
        updateScore();
      } else if (target.id === 'relevance') {
        updateRelevanceHelp();
        updateScore();
      } else if (target.dataset.criterion) {
        paintGradeSelect(target);
        updateScore();
      }
      if (target.dataset.field) clearFieldError(target.dataset.field);
    });

    $('#add-member').addEventListener('click', () => {
      addMember();
      clearFieldError('group');
    });
    $('#group-members').addEventListener('click', (event) => {
      const btn = event.target.closest('.btn-remove-member');
      if (btn) removeMember(btn.closest('.group-member'));
    });

    $('#reset-form').addEventListener('click', () => {
      resetForm();
      UI.toast(t('toast.formCleared'), 'info');
    });
    $('#fill-example').addEventListener('click', fillExample);
    $('#confirm-submit').addEventListener('click', handleConfirm);

    $('#filter-category').addEventListener('change', renderMyNominations);
    $('#filter-status').addEventListener('change', renderMyNominations);

    initDropZone();
    applyTargetState(false);
    applyTypeVisibility();
    updateRelevanceHelp();
    updateCounters();
    updateScore();
    renderMyNominations();

    document.addEventListener('languagechange', rerenderDynamic);

    // Status changes made by the admin in another tab show up immediately.
    window.addEventListener('storage', (event) => {
      if (event.key === Core.STORAGE_KEYS.nominations || event.key === Core.STORAGE_KEYS.myNominations) renderMyNominations();
      if (event.key === Core.STORAGE_KEYS.workers) refreshWorkersDatalist();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
