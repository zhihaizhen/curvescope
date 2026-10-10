'use client';

import type { DbcPoolSummary } from '@/lib/dbc';
import { formatPercent, shortAddress } from '@/lib/format';

interface Props {
  pools: DbcPoolSummary[];
  total: number;
  loading: boolean;
  error: string | null;
  query: string;
  setQuery: (q: string) => void;
  selectedAddress: string | null;
  onSelect: (address: string) => void;
  onRefresh: () => void;
}

export default function PoolSelector({
  pools,
  total,
  loading,
  error,
  query,
  setQuery,
  selectedAddress,
  onSelect,
  onRefresh,
}: Props) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="border-b border-zinc-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">DBC Pools</h2>
          <button
            onClick={onRefresh}
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, symbol, mint or address…"
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
        />
        <p className="mt-2 text-xs text-zinc-500">
          {loading ? 'Scanning on-chain pools…' : `${pools.length} shown · ${total.toLocaleString()} total on-chain`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error && (
          <div className="m-2 rounded-md border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </div>
        )}
        {!error && pools.length === 0 && !loading && (
          <p className="p-4 text-sm text-zinc-500">No pools found. Try a different search.</p>
        )}
        <ul className="space-y-1">
          {pools.map((pool) => {
            const selected = pool.address === selectedAddress;
            const pct = Math.round(pool.quoteProgress * 100);
            return (
              <li key={pool.address}>
                <button
                  onClick={() => onSelect(pool.address)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selected
                      ? 'border-emerald-500 bg-emerald-950/30'
                      : 'border-transparent hover:border-zinc-700 hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100" title={pool.name}>
                      {pool.symbol}
                    </span>
                    {pool.isMigrated ? (
                      <span className="shrink-0 rounded-full bg-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-300">
                        migrated
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs font-semibold text-emerald-400">
                        {formatPercent(pool.quoteProgress, 0)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                    <span title={pool.address}>{shortAddress(pool.address)}</span>
                    <span title={pool.name} className="truncate pl-2">{pool.name}</span>
                  </div>
                  {/* graduation progress bar */}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pool.isMigrated ? 'bg-zinc-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${pool.isMigrated ? 100 : pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    {pool.isMigrated ? 'Graduated to DAMM v2' : `Graduation progress ${pct}%`}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
