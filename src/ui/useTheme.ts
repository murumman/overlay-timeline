import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

const query = '(prefers-color-scheme: dark)';

/**
 * The theme actually shown: the user's choice, or Windows' light/dark setting for "system".
 * Also sets `data-theme` on <html> so the CSS variables switch.
 */
export function useResolvedTheme(): 'light' | 'dark' {
  const pref = useStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);
  return resolved;
}
