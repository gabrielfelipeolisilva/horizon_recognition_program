/**
 * Access control rules: credentials per profile, generic errors, lockout,
 * 8-hour session, page access matrix, admin read-only on the board and
 * safe redirects.
 */
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  globalThis.crypto = require('crypto').webcrypto;
}
const Auth = require('../src/auth.js');

const ADMIN_PASSWORD = 'Horizon@Admin2026';
const BOARD_PASSWORD = 'Horizon@Banca2026';
const NOW = Date.parse('2026-11-03T12:00:00Z');
const HOUR = 60 * 60 * 1000;

describe('password hashing', () => {
  test('SHA-256 hex digest', async () => {
    expect(await Auth.hashPassword('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('plain-text passwords are not stored in the config', () => {
    const config = JSON.stringify(Auth.AUTH_CONFIG);
    expect(config).not.toContain(ADMIN_PASSWORD);
    expect(config).not.toContain(BOARD_PASSWORD);
  });

  test('each profile has its own password hash', async () => {
    expect(Auth.AUTH_CONFIG.roles.admin.passwordHash).toBe(await Auth.hashPassword(ADMIN_PASSWORD));
    expect(Auth.AUTH_CONFIG.roles.board.passwordHash).toBe(await Auth.hashPassword(BOARD_PASSWORD));
    expect(Auth.AUTH_CONFIG.roles.admin.passwordHash).not.toBe(Auth.AUTH_CONFIG.roles.board.passwordHash);
  });
});

describe('authorized users (fixed list)', () => {
  test('admin and board IDs', () => {
    expect(Auth.findAuthorizedUser('00000001')).toMatchObject({ role: 'admin' });
    ['00000002', '00000003', '00000004'].forEach((id) => expect(Auth.findAuthorizedUser(id)).toMatchObject({ role: 'board' }));
    expect(Auth.findAuthorizedUser('10000001')).toBeNull();
    expect(Auth.findAuthorizedUser('')).toBeNull();
  });
});

describe('authenticate', () => {
  test('admin signs in with the admin password', async () => {
    const r = await Auth.authenticate('00000001', ADMIN_PASSWORD, null, NOW);
    expect(r.ok).toBe(true);
    expect(r.session).toMatchObject({ id: '00000001', name: 'Admin', role: 'admin' });
    expect(r.attempts).toEqual({ count: 0, lockedUntil: null });
  });

  test('board member signs in with the board password', async () => {
    const r = await Auth.authenticate(' 00000003 ', BOARD_PASSWORD, null, NOW);
    expect(r.ok).toBe(true);
    expect(r.session).toMatchObject({ id: '00000003', role: 'board' });
  });

  test("one profile's password does not open the other profile", async () => {
    expect((await Auth.authenticate('00000001', BOARD_PASSWORD, null, NOW)).ok).toBe(false);
    expect((await Auth.authenticate('00000002', ADMIN_PASSWORD, null, NOW)).ok).toBe(false);
  });

  test('unknown ID and wrong password return the same generic error', async () => {
    const unknown = await Auth.authenticate('10000001', BOARD_PASSWORD, null, NOW);
    const wrong = await Auth.authenticate('00000002', 'wrong-password', null, NOW);
    expect(unknown.error).toBe('invalidCredentials');
    expect(wrong.error).toBe('invalidCredentials');
    expect(unknown.attempts.count).toBe(1);
  });

  test('format and required checks do not count as attempts', async () => {
    expect(await Auth.authenticate('', '', null, NOW)).toMatchObject({ ok: false, error: 'required', attempts: { count: 0 } });
    expect(await Auth.authenticate('123', 'x', null, NOW)).toMatchObject({ ok: false, error: 'invalidId', attempts: { count: 0 } });
  });

  test('5 failed attempts lock the login for 1 minute', async () => {
    let attempts = null;
    for (let i = 1; i <= 4; i += 1) {
      const r = await Auth.authenticate('00000002', 'bad', attempts, NOW);
      expect(r.error).toBe('invalidCredentials');
      attempts = r.attempts;
      expect(attempts.count).toBe(i);
    }
    const fifth = await Auth.authenticate('00000002', 'bad', attempts, NOW);
    expect(fifth.error).toBe('locked');
    expect(Auth.isLockedOut(fifth.attempts, NOW)).toBe(true);
    expect(Auth.lockoutRemainingSeconds(fifth.attempts, NOW + 15000)).toBe(45);

    // even the right password is refused while locked
    const blocked = await Auth.authenticate('00000002', BOARD_PASSWORD, fifth.attempts, NOW + 30000);
    expect(blocked).toMatchObject({ ok: false, error: 'locked' });

    // after 1 minute the login works and the counter resets
    const later = await Auth.authenticate('00000002', BOARD_PASSWORD, fifth.attempts, NOW + 61000);
    expect(later.ok).toBe(true);
    expect(later.attempts).toEqual({ count: 0, lockedUntil: null });
  });

  test('a failure after an expired lock starts a new count', () => {
    const expired = { count: 0, lockedUntil: new Date(NOW - 1000).toISOString() };
    expect(Auth.registerFailedAttempt(expired, NOW)).toEqual({ count: 1, lockedUntil: null });
  });
});

describe('session (8 hours)', () => {
  const user = { id: '00000002', name: 'Board Member', area: 'R&D Division' };

  test('session expires after 8 hours', () => {
    const s = Auth.createSession(user, 'board', NOW);
    expect(Date.parse(s.expiresAt) - Date.parse(s.loginAt)).toBe(8 * HOUR);
    expect(Auth.isSessionValid(s, NOW + 7.9 * HOUR)).toBe(true);
    expect(Auth.isSessionValid(s, NOW + 8 * HOUR)).toBe(false);
  });

  test('tampered or malformed sessions are invalid', () => {
    const s = Auth.createSession(user, 'board', NOW);
    expect(Auth.isSessionValid(Object.assign({}, s, { role: 'admin' }), NOW)).toBe(false);
    expect(Auth.isSessionValid(Object.assign({}, s, { id: '10000001' }), NOW)).toBe(false);
    expect(Auth.isSessionValid({ id: '00000002' }, NOW)).toBe(false);
    expect(Auth.isSessionValid(null, NOW)).toBe(false);
  });
});

describe('page access', () => {
  const admin = Auth.createSession({ id: '00000001', name: 'Admin', area: 'People & Culture' }, 'admin', NOW);
  const board = Auth.createSession({ id: '00000002', name: 'Board Member', area: 'R&D Division' }, 'board', NOW);

  test('access matrix', () => {
    expect(Auth.canAccess(admin, 'admin', NOW)).toBe(true);
    expect(Auth.canAccess(admin, 'board', NOW)).toBe(true);
    expect(Auth.canAccess(board, 'board', NOW)).toBe(true);
    expect(Auth.canAccess(board, 'admin', NOW)).toBe(false);
    expect(Auth.canAccess(null, 'board', NOW)).toBe(false);
    expect(Auth.canAccess(admin, 'admin', NOW + 9 * HOUR)).toBe(false);
  });

  test('admin is read-only on the board; board members are not', () => {
    expect(Auth.isReadOnly(admin, 'board')).toBe(true);
    expect(Auth.isReadOnly(board, 'board')).toBe(false);
    expect(Auth.isReadOnly(admin, 'admin')).toBe(false);
  });

  test('home page per profile', () => {
    expect(Auth.homeFor('admin')).toBe('admin.html');
    expect(Auth.homeFor('board')).toBe('board.html');
  });

  test('only whitelisted redirect targets are accepted', () => {
    expect(Auth.sanitizeNext('board.html')).toBe('board.html');
    expect(Auth.sanitizeNext('./admin.html')).toBe('admin.html');
    expect(Auth.sanitizeNext('https://evil.example/admin.html')).toBeNull();
    expect(Auth.sanitizeNext('//evil.example')).toBeNull();
    expect(Auth.sanitizeNext('javascript:alert(1)')).toBeNull();
    expect(Auth.sanitizeNext(null)).toBeNull();
  });
});
