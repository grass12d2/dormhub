import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
  /** Тихая перезагрузка: данные обновляются без индикатора загрузки и без сброса ошибки */
  refresh: () => void;
}

/**
 * Загружает данные при монтировании, при смене deps и по запросу;
 * ответы устаревших запросов игнорируются.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [silentVersion, setSilentVersion] = useState(0);
  // Последний вызов load: тихая перезагрузка использует актуальные параметры
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    loadRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Не удалось загрузить данные');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // load намеренно не в зависимостях: перезагрузка по version и переданным deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  useEffect(() => {
    if (silentVersion === 0) return;
    let cancelled = false;
    loadRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [silentVersion]);

  const reload = useCallback(() => setVersion((prev) => prev + 1), []);
  const refresh = useCallback(() => setSilentVersion((prev) => prev + 1), []);
  return { data, error, loading, reload, refresh };
}