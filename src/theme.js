/**
 * Horizon Recognition Program — light/dark theme module.
 *
 * Load this script as the FIRST element inside <body> so the saved theme is
 * applied before the page paints (no flash). The toggle button is any element
 * with [data-theme-toggle]. Preference is persisted in localStorage "hr_theme".
 * Pages that must stay light (the presentation) set data-force-theme="light"
 * on <body>.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'hr_theme';
  const DARK_CLASS = 'dark-mode';

  function readPreference() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {
      /* storage unavailable */
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function isForcedLight() {
    return document.body && document.body.dataset.forceTheme === 'light';
  }

  function apply(theme) {
    if (!document.body) return;
    const dark = theme === 'dark' && !isForcedLight();
    document.body.classList.toggle(DARK_CLASS, dark);
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.textContent = dark ? '☀' : '🌙';
      btn.setAttribute('aria-pressed', String(dark));
      const label = window.I18n ? window.I18n.t(dark ? 'theme.toLight' : 'theme.toDark') : (dark ? 'Switch to light theme' : 'Switch to dark theme');
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    });
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: dark ? 'dark' : 'light' } }));
  }

  function current() {
    return document.body && document.body.classList.contains(DARK_CLASS) ? 'dark' : 'light';
  }

  function set(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* storage unavailable */
    }
    apply(theme);
  }

  function toggle() {
    set(current() === 'dark' ? 'light' : 'dark');
  }

  // Apply immediately (body already exists when loaded as its first child).
  apply(readPreference());

  document.addEventListener('DOMContentLoaded', () => {
    apply(readPreference());
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-theme-toggle]');
      if (btn) toggle();
    });
    // Re-label the button when the language changes.
    document.addEventListener('languagechange', () => apply(current()));
  });

  // Keep several open tabs in sync.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.newValue) apply(event.newValue);
  });

  window.HorizonTheme = { set, toggle, current, apply };
})();
