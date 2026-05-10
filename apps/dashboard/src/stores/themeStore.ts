import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: () => 'light' | 'dark';
}

const stored = (typeof window !== 'undefined'
  ? localStorage.getItem('cg_theme')
  : null) as Theme | null;

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: stored ?? 'system',
  setTheme: (theme) => {
    localStorage.setItem('cg_theme', theme);
    applyTheme(theme);
    set({ theme });
  },
  resolvedTheme: () => {
    const t = get().theme;
    if (t === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return t;
  },
}));

// Initialize theme on first load
if (typeof window !== 'undefined') {
  applyTheme(stored ?? 'system');
  // Listen to system changes when in system mode
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      const current = useThemeStore.getState().theme;
      if (current === 'system') applyTheme('system');
    });
}
