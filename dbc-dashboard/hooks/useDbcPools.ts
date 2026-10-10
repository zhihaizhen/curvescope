'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { findPoolByBaseMint, listDbcPools, type DbcPoolSummary } from '@/lib/dbc';

export interface UseDbcPoolsResult {
  pools: DbcPoolSummary[];
  total: number;
  loading: boolean;
  error: string | null;
  query: string;
  setQuery: (q: string) => void;
  refresh: () => void;
}

/** DBC pool list with search + manual refresh. No wallet needed. */
export function useDbcPools(): UseDbcPoolsResult {
  const [pools, setPools] = useState<DbcPoolSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const queryRef = useRef(query);
  queryRef.current = query;

  const fetchPools = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const trimmed = q.trim();
      // Looks like a mint address? Try the exact on-chain lookup first.
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
        const found = await findPoolByBaseMint(trimmed);
        if (found) {
          setPools([found]);
          setTotal(1);
          return;
        }
        // fall through to text search on empty result
      }
      const { pools, total } = await listDbcPools({ query: trimmed, limit: 40 });
      setPools(pools);
      setTotal(total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pools');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchPools(queryRef.current), 400);
    return () => clearTimeout(t);
  }, [query, fetchPools]);

  const refresh = useCallback(() => fetchPools(queryRef.current), [fetchPools]);

  return { pools, total, loading, error, query, setQuery, refresh };
}
