'use client';

import type { DbcPoolBundle } from '@/lib/dbc';
import { formatPercent, shortAddress } from '@/lib/format';

interface Props {
  bundle: DbcPoolBundle | null;
  loading: boolean;
}

function ProgressBar({ value, tone }: { value: number; tone: 'emerald' | 'amber' | 'zinc' }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color =
    tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-400' : 'bg-zinc-500';
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Graduation / migration status for the selected DBC pool:
 * quote-curve progress, base-curve progress, migration flag.
 */
export default function MigrationTracker({ bundle, loading }: Props) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Graduation Tracker</h2>

      {!bundle && !loading && (
        <p className="text-sm text-zinc-500">Select a pool to track its DAMM v2 graduation.</p>
      )}
      {loading && !bundle && <p className="text-sm text-zinc-500">Loading pool state…</p>}

      {bundle && (
        <div className="space-y-4">
          <div
            className={`rounded-lg border p-3 text-center ${
              bundle.isMigrated
                ? 'border-zinc-700 bg-zinc-800/40'
                : bundle.quoteProgress >= 0.8
                  ? 'border-amber-800 bg-amber-950/40'
                  : 'border-emerald-900 bg-emerald-950/30'
            }`}
          >
            <p
              className={`text-2xl font-bold ${
                bundle.isMigrated
                  ? 'text-zinc-300'
                  : bundle.quoteProgress >= 0.8
                    ? 'text-amber-300'
                    : 'text-emerald-300'
              }`}
            >
              {bundle.isMigrated ? 'Migrated' : formatPercent(bundle.quoteProgress, 1)}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {bundle.isMigrated
                ? 'This pool graduated to DAMM v2'
                : 'of the bonding curve completed'}
            </p>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-zinc-400">Quote-token curve</span>
              <span className="font-medium text-zinc-200">{formatPercent(bundle.quoteProgress, 1)}</span>
            </div>
            <ProgressBar
              value={bundle.quoteProgress}
              tone={bundle.isMigrated ? 'zinc' : bundle.quoteProgress >= 0.8 ? 'amber' : 'emerald'}
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-zinc-400">Base-token curve</span>
              <span className="font-medium text-zinc-200">{formatPercent(bundle.baseProgress, 1)}</span>
            </div>
            <ProgressBar
              value={bundle.baseProgress}
              tone={bundle.isMigrated ? 'zinc' : 'emerald'}
            />
          </div>

          <dl className="space-y-1.5 border-t border-zinc-800 pt-3 text-xs">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Pool</dt>
              <dd className="font-mono text-zinc-300" title={bundle.address}>
                {shortAddress(bundle.address)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Base mint</dt>
              <dd className="font-mono text-zinc-300" title={bundle.baseMint}>
                {shortAddress(bundle.baseMint)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Quote mint</dt>
              <dd className="font-mono text-zinc-300" title={bundle.quoteMint}>
                {shortAddress(bundle.quoteMint)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Migration target</dt>
              <dd className="text-zinc-300">DAMM v2</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
