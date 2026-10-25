import { useCallback, useEffect, useRef, useState } from "react";

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, enabled = true, resetKey: string | null = null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const keyRef = useRef(resetKey);

  useEffect(() => {
    keyRef.current = resetKey;
    setData(null);
    setError(null);
    setLoading(true);
  }, [resetKey]);

  const refresh = useCallback(async () => {
    const requestKey = keyRef.current;
    try {
      const result = await fetcherRef.current();
      if (keyRef.current !== requestKey) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (keyRef.current !== requestKey) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (keyRef.current === requestKey) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled, refresh, resetKey]);

  return { data, error, loading, refresh };
}
