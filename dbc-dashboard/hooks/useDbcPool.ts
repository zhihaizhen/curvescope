'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDbcPoolBundle, type DbcPoolBundle } from '@/lib/dbc';

const POLL_MS = 15_000;

export interface UseDbcPoolResult {
  bundle: DbcPoolBundle | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

/**
 * Full DBC pool bundle (state + config + metadata + graduation progress),
 * polled every ~15s. Works without a wallet — all reads are public.
 */
export function useDbcPool(poolAddress: string | null): UseDbcPoolResult {
  const [bundle, setBundle] = useState<DbcPoolBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const fetchAll = useCallback(async (address: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      const b = await getDbcPoolBundle(address);
      setBundle(b);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pool');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!poolAddress) {
      setBundle(null);
      setError(null);
      return;
    }
    setLoading(true);
    fetchAll(poolAddress);
    const t = setInterval(() => fetchAll(poolAddress), POLL_MS);
    return () => clearInterval(t);
  }, [poolAddress, fetchAll]);

  const refresh = useCallback(() => {
    if (poolAddress) fetchAll(poolAddress);
  }, [poolAddress, fetchAll]);

  return { bundle, loading, error, lastUpdated, refresh };
}
