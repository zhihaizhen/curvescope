'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import type { DbcPoolBundle } from '@/lib/dbc';
import { formatPercent } from '@/lib/format';

interface Props {
  bundle: DbcPoolBundle | null;
  symbol: string;
}

interface Alert {
  level: 'ok' | 'warn' | 'info';
  title: string;
  detail: string;
}

/** Graduation / migration alerts for the selected pool. */
export default function GraduationAlerts({ bundle, symbol }: Props) {
  const { connected } = useWallet();

  if (!bundle) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-100">Alerts</h2>
        <p className="text-sm text-zinc-500">Select a pool to see its alerts.</p>
      </section>
    );
  }

  const alerts: Alert[] = [];
  const progress = bundle.quoteProgress;

  if (bundle.isMigrated) {
    alerts.push({
      level: 'info',
      title: `${symbol} has graduated`,
      detail:
        'This pool completed its bonding curve and migrated to DAMM v2. New liquidity lives on the DAMM side; buying here may no longer be possible.',
    });
  } else if (progress >= 0.95) {
    alerts.push({
      level: 'warn',
      title: 'Graduation imminent',
      detail: `Curve is ${formatPercent(progress, 1)} complete. Migration to DAMM v2 can trigger at any time — execution prices may swing as the pool graduates.`,
    });
  } else if (progress >= 0.8) {
    alerts.push({
      level: 'warn',
      title: 'Approaching graduation',
      detail: `Curve is ${formatPercent(progress, 1)} complete. Late-stage pools carry higher price impact; size your trades accordingly.`,
    });
  } else {
    alerts.push({
      level: 'ok',
      title: 'Early stage',
      detail: `Curve is ${formatPercent(progress, 1)} complete. Pool is far from graduation — buy-side liquidity is still deep along the curve.`,
    });
  }

  if (!connected) {
    alerts.push({
      level: 'info',
      title: 'Wallet not connected',
      detail: 'Quotes and curve data are public and work without a wallet. Connect to trade.',
    });
  }

  const styles = {
    ok: 'border-emerald-900 bg-emerald-950/30',
    warn: 'border-amber-900 bg-amber-950/30',
    info: 'border-zinc-700 bg-zinc-800/40',
  } as const;
  const dot = {
    ok: 'bg-emerald-400',
    warn: 'bg-amber-400',
    info: 'bg-zinc-400',
  } as const;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Alerts</h2>
      <ul className="space-y-2">
        {alerts.map((a) => (
          <li key={a.title} className={`rounded-lg border p-3 ${styles[a.level]}`}>
            <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <span className={`h-2 w-2 rounded-full ${dot[a.level]}`} />
              {a.title}
            </p>
            <p className="mt-1 text-xs text-zinc-400">{a.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
