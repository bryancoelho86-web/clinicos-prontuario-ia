const KEY = 'clinicos_theme';

export function getStoredTheme() {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setStoredTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // localStorage indisponível (modo privado etc) — tema só não persiste entre sessões.
  }
  applyTheme(theme);
}
