import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data once (and again when deps change). Returns {data, error, loading, reload}.
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn); fnRef.current = fn;
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: s.data === null, error: null }));
    try { setState({ data: await fnRef.current(), error: null, loading: false }); }
    catch (e) { setState((s) => ({ data: s.data, error: e.message, loading: false })); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { ...state, reload };
}

// Real polling (not WebSockets). Refreshes every `ms` while the tab is visible and on return to the tab.
export function usePolling(fn, ms = 5000, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true, updatedAt: null });
  const fnRef = useRef(fn); fnRef.current = fn;
  useEffect(() => {
    let stop = false, timer;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const data = await fnRef.current();
        if (!stop) setState({ data, error: null, loading: false, updatedAt: new Date() });
      } catch (e) { if (!stop) setState((s) => ({ ...s, error: e.message, loading: false })); }
    };
    tick();
    timer = setInterval(tick, ms);
    const onVis = () => !document.hidden && tick();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
  return state;
}

export function usePageTitle(title, description) {
  useEffect(() => {
    document.title = title ? `${title} | CAIMS Sports Fest 2026` : 'CAIMS Sports Fest 2026 | Chalmeda Anand Rao Institute of Medical Sciences';
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
  }, [title, description]);
}
