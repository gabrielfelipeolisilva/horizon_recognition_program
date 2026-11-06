# Changelog

All notable changes to this project are listed here.

## [1.2.0] — 2026-11-05

### Added
- **Optional self-nomination.** The form asks "Who is this nomination for?" (*Someone else* / *Myself*). With *Myself*, the nominee fields are locked and mirror the nominator in real time, the nomination is individual only and the relationship is stored as `self`.
- `selfNomination` field in the data model (older records are read as `false`).
- "Self-nomination" badge in the review, My Nominations, Board cards and Admin list, ranking and details.
- **Origin** filter in the Admin list and a "Self-nomination" column in the report export.
- One self-nomination in the demo data.
- `tests/self-nomination.test.js` (12 tests) and the self-nomination flow in the end-to-end checks.

### Changed
- Using your own ID without choosing *Myself* now shows an error with a hint to use that option. Self-nomination inside a group is still not allowed.
- FAQ and presentation: "Can I nominate myself?" is now answered "Yes".

## [1.1.0] — 2026-11-03

### Added
- **Login for the Board and Admin panels** (`login.html`, `src/auth.js`, `src/login.js`): authorized worker ID + one generic password per profile, stored only as a SHA-256 hash.
- Page guard that redirects to the login page before protected pages are painted. It re-checks the session every 30 s, on focus, when another tab signs out and before every save.
- 8-hour session that survives browser restarts; **Sign out** button in the header.
- Generic login error, 5-attempt lockout (1 minute), whitelisted redirects only.
- Read-only Board view for administrators: every nomination and its evaluations, with no way to submit.
- Lock icons in the navigation for panels the visitor cannot open.
- `tests/auth.test.js` (17 tests); EN/PT translations for every new text.
- Repository files: `.gitignore`, `LICENSE`, `package-lock.json`, GitHub Actions CI, `.nojekyll` for GitHub Pages, screenshots, `docs/AI-WORKFLOW.md`.

### Changed
- The Board evaluator identity and the Admin `reviewedBy` field now come from the logged-in user.
- Removed the "Evaluating as (demo)" selector from the Board.

### Fixed
- The password input was missing the shared input styles.

## [1.0.0] — 2026-11-03

### Added
- Nomination form with ID autofill, individual and group nominations, dynamic criteria per category, live score, attachments (metadata only), review / rejection / success modals and "My Nominations".
- Evaluation Board with conflict-of-interest declaration, live score, review step and a read-only view of submitted evaluations.
- Admin panel: dashboard, financial summary, ranking per category with tiers and per-member group prizes, single and bulk status changes, workers spreadsheet upload (SheetJS), styled exports (ExcelJS), demo data tools.
- HTML slide presentation of the Program.
- Design system with light/dark themes, responsive layout, EN/PT-BR i18n.
- Jest unit tests for scoring, prizes/ranking and validation.

### Fixed
- The tier letter inside the star badge was rendered white on white.
