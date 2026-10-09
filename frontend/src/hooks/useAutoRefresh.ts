import { useEffect, useRef } from 'react';

/** While enabled, call `refresh` every `intervalMs` and whenever the tab becomes visible again. */
export function useAutoRefresh(refresh: () => void, enabled: boolean, intervalMs = 60_000) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const ifVisible = () => { if (!document.hidden) latest.current(); };
    document.addEventListener('visibilitychange', ifVisible);
    const id = window.setInterval(ifVisible, intervalMs);
    return () => {
      document.removeEventListener('visibilitychange', ifVisible);
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
