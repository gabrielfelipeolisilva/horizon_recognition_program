/**
 * Horizon Recognition Program — login page (login.html).
 *
 * Validates ID + profile password with HorizonAuth, applies the 5-attempt
 * lockout, stores the 8-hour session and redirects to the requested page
 * (only whitelisted pages) or to the profile's home panel.
 */
(function () {
  'use strict';

  const Auth = window.HorizonAuth;
  const I18n = window.I18n;
  const t = (key, params) => I18n.t(key, params);
  const $ = (sel) => document.querySelector(sel);

  const params = new URLSearchParams(window.location.search);
  const next = Auth.sanitizeNext(params.get('next'));
  const reason = params.get('reason');
  let lockTimer = null;

  function pageOf(file) {
    return file ? file.replace('.html', '') : null;
  }

  function roleLabel(role) {
    return t('role.' + role);
  }

  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '--';
  }

  function showNotice(kind, text) {
    const el = $('#login-notice');
    el.hidden = false;
    el.className = 'alert alert-' + kind;
    el.textContent = text;
  }

  function showError(text) {
    const el = $('#login-error');
    el.hidden = !text;
    el.textContent = text || '';
  }

  function renderNotice() {
    const session = Auth.getSession();
    const target = pageOf(next);
    if (reason === 'denied' && session && target) {
      showNotice('warning', t('login.denied', { role: roleLabel(session.role), page: t('nav.' + target) }));
    } else if (reason === 'expired') {
      showNotice('warning', t('login.expired'));
    } else if (reason === 'logout') {
      showNotice('success', t('login.loggedOut'));
    } else if (target && !session) {
      showNotice('info', t('login.needed', { page: t('nav.' + target) }));
    } else {
      $('#login-notice').hidden = true;
    }
  }

  function renderSignedIn() {
    const session = Auth.getSession();
    const box = $('#signed-in');
    if (!session) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    $('#signed-avatar').textContent = initials(session.name);
    $('#signed-name').textContent = t('login.signedAs', { name: session.name, id: session.id });
    $('#signed-role').textContent = roleLabel(session.role) + ' · ' + session.area;
    const home = Auth.homeFor(session.role);
    const link = $('#signed-continue');
    link.href = home;
    link.textContent = t('login.continueTo', { page: t('nav.' + pageOf(home)) });
  }

  function updateLockState() {
    const attempts = Auth.getAttempts();
    const remaining = Auth.lockoutRemainingSeconds(attempts);
    const submit = $('#login-submit');
    clearInterval(lockTimer);
    if (remaining > 0) {
      submit.disabled = true;
      showError(t('login.error.locked', { seconds: remaining }));
      lockTimer = setInterval(() => {
        const left = Auth.lockoutRemainingSeconds(Auth.getAttempts());
        if (left <= 0) {
          clearInterval(lockTimer);
          submit.disabled = false;
          showError('');
        } else {
          showError(t('login.error.locked', { seconds: left }));
        }
      }, 1000);
    } else {
      submit.disabled = false;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const submit = $('#login-submit');
    submit.disabled = true;
    showError('');
    const id = $('#login-id').value;
    const password = $('#login-password').value;
    let result;
    try {
      result = await Auth.authenticate(id, password, Auth.getAttempts());
    } catch (e) {
      showError(t('login.error.crypto'));
      submit.disabled = false;
      return;
    }
    Auth.saveAttempts(result.attempts);

    if (!result.ok) {
      $('#login-password').value = '';
      if (result.error === 'locked') {
        updateLockState();
        return;
      }
      const left = Auth.AUTH_CONFIG.maxAttempts - (result.attempts.count || 0);
      let message = t('login.error.' + result.error);
      if (result.error === 'invalidCredentials' && result.attempts.count > 0) {
        message += ' ' + t('login.attemptsLeft', { count: left });
      }
      showError(message);
      submit.disabled = false;
      $(result.error === 'invalidId' || result.error === 'required' ? '#login-id' : '#login-password').focus();
      return;
    }

    Auth.saveSession(result.session);
    const target = next && Auth.canAccess(result.session, pageOf(next)) ? next : Auth.homeFor(result.session.role);
    window.location.replace(target);
  }

  function init() {
    I18n.init();

    // Already signed in with access to the requested page -> go straight there.
    const session = Auth.getSession();
    if (session && next && reason !== 'denied' && Auth.canAccess(session, pageOf(next))) {
      window.location.replace(next);
      return;
    }

    renderNotice();
    renderSignedIn();
    updateLockState();

    $('#login-form').addEventListener('submit', handleSubmit);
    $('#login-id').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
    });
    $('#toggle-password').addEventListener('click', (e) => {
      const input = $('#login-password');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      e.currentTarget.setAttribute('aria-pressed', String(show));
      e.currentTarget.setAttribute('aria-label', t(show ? 'login.hidePassword' : 'login.showPassword'));
      e.currentTarget.textContent = show ? '🙈' : '👁';
    });
    $('#switch-user').addEventListener('click', () => {
      Auth.clearSession();
      Auth.decorate();
      renderSignedIn();
      showNotice('success', t('login.loggedOut'));
      $('#login-id').focus();
    });

    document.addEventListener('languagechange', () => {
      renderNotice();
      renderSignedIn();
      updateLockState();
    });

    if (!session) $('#login-id').focus();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
