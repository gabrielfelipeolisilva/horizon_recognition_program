/**
 * Horizon Recognition Program — access control for the Board and Admin panels.
 *
 * Login = authorized worker ID + generic password of the profile (one per role).
 * Passwords are never stored in plain text: only their SHA-256 hash is kept here.
 *
 * IMPORTANT: this is prototype-grade ACCESS CONTROL, not security. Everything runs
 * in the browser, so anyone with access to the source code or to localStorage can
 * bypass it. A production version must authenticate on a server (see README).
 *
 * Load this script inside <head> of protected pages and call
 * HorizonAuth.guardPage('board' | 'admin') right after it, so unauthorized
 * visitors are redirected before the page is painted.
 */
(function (root, factory) {
  const auth = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = auth;
  else root.HorizonAuth = auth;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Configuration                                                       */
  /* ------------------------------------------------------------------ */

  const AUTH_CONFIG = Object.freeze({
    sessionKey: 'hr_session',
    attemptsKey: 'hr_login_attempts',
    sessionDurationMs: 8 * 60 * 60 * 1000, // 8 hours
    maxAttempts: 5,
    lockoutMs: 60 * 1000, // 1 minute
    loginPage: 'login.html',
    roles: Object.freeze({
      admin: Object.freeze({
        // SHA-256 of the admin generic password (see README for the demo value)
        passwordHash: '5f3eb107f0aec558104707a0906f6fee721d29a130bb403585664a3385d1b74a',
        home: 'admin.html',
        users: Object.freeze([
          Object.freeze({ id: '00000001', name: 'Admin', area: 'People & Culture' })
        ])
      }),
      board: Object.freeze({
        // SHA-256 of the board generic password (see README for the demo value)
        passwordHash: '245e4e934458ac92d3b23e79283468a0eb0fc2c0069482feebb15f51526e26ad',
        home: 'board.html',
        users: Object.freeze([
          Object.freeze({ id: '00000002', name: 'Board Member', area: 'R&D Division' }),
          Object.freeze({ id: '00000003', name: 'Board Member 2', area: 'Finance' }),
          Object.freeze({ id: '00000004', name: 'Board Member 3', area: 'Operations' })
        ])
      })
    }),
    // Which roles may open each protected page.
    pageAccess: Object.freeze({
      admin: Object.freeze(['admin']),
      board: Object.freeze(['board', 'admin'])
    }),
    // Pages where a role has read-only access.
    readOnly: Object.freeze({
      board: Object.freeze(['admin'])
    })
  });

  const ALLOWED_NEXT = Object.freeze(['board.html', 'admin.html']);

  /* ------------------------------------------------------------------ */
  /* Pure rules (testable in Node)                                       */
  /* ------------------------------------------------------------------ */

  /** SHA-256 hex digest using the Web Crypto API (browser and Node 18+). */
  async function hashPassword(password) {
    const subtle = root.crypto && root.crypto.subtle;
    if (!subtle) throw new Error('WEB_CRYPTO_UNAVAILABLE');
    const data = new TextEncoder().encode(String(password));
    const digest = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Returns { user, role } for an authorized ID, or null. */
  function findAuthorizedUser(id) {
    const key = String(id || '').trim();
    const roles = Object.keys(AUTH_CONFIG.roles);
    for (let i = 0; i < roles.length; i += 1) {
      const user = AUTH_CONFIG.roles[roles[i]].users.find((u) => u.id === key);
      if (user) return { user, role: roles[i] };
    }
    return null;
  }

  function createSession(user, role, now) {
    const loginAt = Number(now || Date.now());
    return {
      id: user.id,
      name: user.name,
      area: user.area,
      role,
      loginAt: new Date(loginAt).toISOString(),
      expiresAt: new Date(loginAt + AUTH_CONFIG.sessionDurationMs).toISOString()
    };
  }

  /** A session is valid if well-formed, not expired and the user is still authorized. */
  function isSessionValid(session, now) {
    if (!session || !session.id || !session.role || !session.expiresAt) return false;
    const expires = Date.parse(session.expiresAt);
    if (Number.isNaN(expires) || Number(now || Date.now()) >= expires) return false;
    const match = findAuthorizedUser(session.id);
    return Boolean(match && match.role === session.role);
  }

  function canAccess(session, page, now) {
    if (!isSessionValid(session, now)) return false;
    const roles = AUTH_CONFIG.pageAccess[page];
    return Boolean(roles && roles.indexOf(session.role) !== -1);
  }

  function isReadOnly(session, page) {
    const roles = AUTH_CONFIG.readOnly[page];
    return Boolean(session && roles && roles.indexOf(session.role) !== -1);
  }

  function emptyAttempts() {
    return { count: 0, lockedUntil: null };
  }

  function isLockedOut(attempts, now) {
    return Boolean(attempts && attempts.lockedUntil && Number(now || Date.now()) < Date.parse(attempts.lockedUntil));
  }

  function lockoutRemainingSeconds(attempts, now) {
    if (!isLockedOut(attempts, now)) return 0;
    return Math.ceil((Date.parse(attempts.lockedUntil) - Number(now || Date.now())) / 1000);
  }

  /** Registers a failed attempt; locks for 1 minute on the 5th consecutive failure. */
  function registerFailedAttempt(attempts, now) {
    const time = Number(now || Date.now());
    if (isLockedOut(attempts, time)) return attempts;
    // A finished lockout starts a fresh count.
    const base = attempts && !attempts.lockedUntil ? attempts : emptyAttempts();
    const count = base.count + 1;
    if (count >= AUTH_CONFIG.maxAttempts) {
      return { count: 0, lockedUntil: new Date(time + AUTH_CONFIG.lockoutMs).toISOString() };
    }
    return { count, lockedUntil: null };
  }

  /**
   * Validates a login. Never reveals whether the ID exists: unknown ID and
   * wrong password produce the same "invalidCredentials" error.
   * Returns { ok, session?, error?, attempts }.
   */
  async function authenticate(id, password, attempts, now) {
    const time = Number(now || Date.now());
    const state = attempts || emptyAttempts();
    if (isLockedOut(state, time)) return { ok: false, error: 'locked', attempts: state };

    const cleanId = String(id || '').trim();
    if (!cleanId || !password) return { ok: false, error: 'required', attempts: state };
    if (!/^\d{8}$/.test(cleanId)) return { ok: false, error: 'invalidId', attempts: state };

    const match = findAuthorizedUser(cleanId);
    const hash = await hashPassword(password);
    if (!match || AUTH_CONFIG.roles[match.role].passwordHash !== hash) {
      const next = registerFailedAttempt(state, time);
      return { ok: false, error: next.lockedUntil ? 'locked' : 'invalidCredentials', attempts: next };
    }
    return { ok: true, session: createSession(match.user, match.role, time), attempts: emptyAttempts() };
  }

  /** Only whitelisted pages are accepted as redirect targets (no open redirect). */
  function sanitizeNext(next) {
    const value = String(next || '').replace(/^\.?\//, '');
    return ALLOWED_NEXT.indexOf(value) !== -1 ? value : null;
  }

  function homeFor(role) {
    return AUTH_CONFIG.roles[role] ? AUTH_CONFIG.roles[role].home : 'index.html';
  }

  /* ------------------------------------------------------------------ */
  /* Browser helpers                                                     */
  /* ------------------------------------------------------------------ */

  function readJSON(key) {
    try {
      const raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable */
    }
  }

  function getSession() {
    const session = readJSON(AUTH_CONFIG.sessionKey);
    return isSessionValid(session) ? session : null;
  }

  function saveSession(session) {
    writeJSON(AUTH_CONFIG.sessionKey, session);
  }

  function clearSession() {
    try {
      root.localStorage.removeItem(AUTH_CONFIG.sessionKey);
    } catch (e) {
      /* storage unavailable */
    }
  }

  function getAttempts() {
    return readJSON(AUTH_CONFIG.attemptsKey) || emptyAttempts();
  }

  function saveAttempts(attempts) {
    writeJSON(AUTH_CONFIG.attemptsKey, attempts);
  }

  function loginUrl(page, reason) {
    const params = new URLSearchParams();
    params.set('next', page + '.html');
    if (reason) params.set('reason', reason);
    return AUTH_CONFIG.loginPage + '?' + params.toString();
  }

  /**
   * Protects a page. Without a valid session -> login. With a session whose
   * role cannot open the page -> login with reason=denied. Also re-checks
   * every 30 s and when another tab logs out, so expired sessions are closed.
   */
  function guardPage(page) {
    const evaluate = () => {
      const raw = readJSON(AUTH_CONFIG.sessionKey);
      if (!isSessionValid(raw)) return { ok: false, reason: raw ? 'expired' : null };
      if (!canAccess(raw, page)) return { ok: false, reason: 'denied' };
      return { ok: true, session: raw };
    };
    const result = evaluate();
    if (!result.ok) {
      root.document.documentElement.classList.add('auth-pending');
      root.location.replace(loginUrl(page, result.reason));
      return null;
    }
    const recheck = () => {
      const r = evaluate();
      if (!r.ok) root.location.replace(loginUrl(page, r.reason));
    };
    root.setInterval(recheck, 30000);
    root.addEventListener('storage', (event) => {
      if (event.key === AUTH_CONFIG.sessionKey || event.key === null) recheck();
    });
    root.addEventListener('focus', recheck);
    return result.session;
  }

  /** Used right before saving: returns the session or redirects to login. */
  function requireSession(page) {
    const session = getSession();
    if (session && canAccess(session, page)) return session;
    root.location.replace(loginUrl(page, session ? 'denied' : 'expired'));
    return null;
  }

  function logout() {
    clearSession();
    root.location.href = AUTH_CONFIG.loginPage + '?reason=logout';
  }

  /** Adds a lock to nav links the current visitor cannot open, and wires [data-logout]. */
  function decorate() {
    const session = getSession();
    root.document.querySelectorAll('[data-auth-link]').forEach((link) => {
      const locked = !canAccess(session, link.dataset.authLink);
      link.classList.toggle('is-locked', locked);
      let icon = link.querySelector('.lock-icon');
      if (locked && !icon) {
        icon = root.document.createElement('span');
        icon.className = 'lock-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '🔒';
        link.appendChild(icon);
      } else if (!locked && icon) {
        icon.remove();
      }
    });
    root.document.querySelectorAll('[data-logout]').forEach((btn) => {
      if (btn.dataset.logoutBound) return;
      btn.dataset.logoutBound = '1';
      btn.addEventListener('click', logout);
    });
  }

  if (root.document) {
    root.document.addEventListener('DOMContentLoaded', decorate);
  }

  return {
    AUTH_CONFIG,
    hashPassword,
    findAuthorizedUser,
    createSession,
    isSessionValid,
    canAccess,
    isReadOnly,
    isLockedOut,
    lockoutRemainingSeconds,
    registerFailedAttempt,
    authenticate,
    sanitizeNext,
    homeFor,
    getSession,
    saveSession,
    clearSession,
    getAttempts,
    saveAttempts,
    guardPage,
    requireSession,
    logout,
    decorate
  };
});
