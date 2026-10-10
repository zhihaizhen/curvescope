'use client';

import { useMemo, useState } from 'react';
import PoolSelector from '@/components/PoolSelector';
import CurveChart from '@/components/CurveChart';
import MigrationTracker from '@/components/MigrationTracker';
import QuotePanel from '@/components/QuotePanel';
import GraduationAlerts from '@/components/GraduationAlerts';
import { useDbcPools } from '@/hooks/useDbcPools';
import { useDbcPool } from '@/hooks/useDbcPool';
import { sampleBondingCurve } from '@/lib/dbc';

/**
 * CurveScope — a DBC (Dynamic Bonding Curve) explorer for the Crypto World's
 * Fair hackathon, "Best use of Meteora's Dynamic Bonding Curve (DBC)" track.
 *
 * Left: pool list with graduation progress.
 * Middle: real bonding-curve chart + graduation alerts.
 * Right: DAMM v2 graduation tracker + buy/sell quote panel.
 */
export default function Home() {
  const {
    pools,
    total,
    loading: poolsLoading,
    error: poolsError,
    query,
    setQuery,
    refresh: refreshPools,
  } = useDbcPools();

  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const { bundle, loading: poolLoading } = useDbcPool(selectedAddress);

  const samples = useMemo(() => (bundle ? sampleBondingCurve(bundle, 40) : []), [bundle]);

  const symbol = useMemo(() => {
    if (!bundle) return '—';
    const meta = bundle.metadata as unknown as Record<string, unknown> | null;
    const name = typeof meta?.name === 'string' && meta.name ? meta.name : '';
    return name.split(/\s+/)[0] || '—';
  }, [bundle]);

  const currentPrice = useMemo(() => {
    if (!bundle) return 0;
    const st = bundle.pool.poolState as unknown as Record<string, unknown>;
    // effective price from current reserves: quoteReserve / baseReserve
    const quoteReserve = Number((st.quoteReserve as unknown as { toString(): string })?.toString() ?? 0);
    const baseReserve = Number((st.baseReserve as unknown as { toString(): string })?.toString() ?? 0);
    if (!quoteReserve || !baseReserve) return 0;
    return (
      (quoteReserve / 10 ** bundle.quoteDecimals) /
      (baseReserve / 10 ** bundle.baseDecimals)
    );
  }, [bundle]);

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 p-4 lg:grid-cols-12">
      {/* left: pool list */}
      <div className="lg:col-span-3 lg:h-[calc(100vh-140px)] lg:min-h-[560px]">
        <PoolSelector
          pools={pools}
          total={total}
          loading={poolsLoading}
          error={poolsError}
          query={query}
          setQuery={setQuery}
          selectedAddress={selectedAddress}
          onSelect={setSelectedAddress}
          onRefresh={refreshPools}
        />
      </div>

      {/* middle: curve chart + alerts */}
      <div className="flex flex-col gap-4 lg:col-span-6 lg:h-[calc(100vh-140px)] lg:min-h-[560px]">
        <div className="min-h-[360px] flex-1">
          <CurveChart
            key={selectedAddress ?? 'none'}
            samples={samples}
            currentPrice={currentPrice}
            progress={bundle?.quoteProgress ?? 0}
            symbol={symbol}
            loading={poolLoading}
          />
        </div>
        <GraduationAlerts bundle={bundle} symbol={symbol} />
      </div>

      {/* right: migration tracker + trade */}
      <div className="flex flex-col gap-4 lg:col-span-3">
        <MigrationTracker bundle={bundle} loading={poolLoading} />
        <QuotePanel bundle={bundle} />
      </div>
    </div>
  );
}
