// Theme toggle: auto (OS preference) → dark → light → auto
const STORAGE_KEY = 'theme-preference';
const CYCLE = ['auto', 'dark', 'light'];

const mql = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(preference) {
  const resolved =
    preference === 'auto' ? (mql.matches ? 'dark' : 'light') : preference;
  document.documentElement.setAttribute('data-theme', resolved);
  updateToggleButton(preference);
  updateThemeColor(resolved);
}

function updateThemeColor(resolved) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = resolved === 'dark' ? '#1a1a1e' : '#fed443';
  }
}

function updateToggleButton(preference) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  const labels = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  const icons = { auto: '\u25D1', light: '\u2600\uFE0E', dark: '\u263E\uFE0E' };
  btn.textContent = icons[preference];
  btn.setAttribute('aria-label', `Theme: ${labels[preference]}`);
  btn.title = `Theme: ${labels[preference]}`;
}

function getPreference() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return CYCLE.includes(stored) ? stored : 'auto';
}

export function toggleTheme() {
  const current = getPreference();
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
}

// Listen for OS preference changes when in auto mode
mql.addEventListener('change', () => {
  if (getPreference() === 'auto') {
    applyTheme('auto');
  }
});

// Apply on load (the inline script in <head> handles FOUC prevention,
// this ensures the toggle button state is correct)
applyTheme(getPreference());
