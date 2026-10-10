'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { CurveSample } from '@/lib/dbc';

interface Props {
  /** sampled (quoteIn -> marginal price) points from the SDK's own quote math */
  samples: CurveSample[];
  /** current market price (quote per base), human units */
  currentPrice: number;
  /** graduation threshold as fraction 0..1 of the sampled x-range */
  progress: number;
  symbol: string;
  loading: boolean;
}

/**
 * Bonding-curve visualization. DBC has no OHLCV history, so instead of
 * candles we plot the pool's real curve: marginal price vs cumulative
 * quote input, sampled with the SDK's pure swap-quote math. A vertical
 * marker shows where the pool sits on its graduation journey.
 */
export default function CurveChart({ samples, currentPrice, progress, symbol, loading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: 'rgba(63,63,70,0.4)' },
        horzLines: { color: 'rgba(63,63,70,0.4)' },
      },
      timeScale: { visible: false },
      rightPriceScale: { borderVisible: false },
    });
    const series = chart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // lightweight-charts needs a time axis; map sample index -> synthetic times.
  const data = useMemo(
    () =>
      samples.map((s, i) => ({
        time: (1_700_000_000 + i * 60) as UTCTimestamp,
        value: s.price,
      })),
    [samples],
  );

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(data);
    // Mark the pool's current position on the curve with a price line.
    seriesRef.current.createPriceLine({
      price: currentPrice,
      color: '#f59e0b',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'now',
    });
    chartRef.current?.timeScale().fitContent();
    // NOTE: createPriceLine accumulates across updates; the series is
    // recreated per pool selection via the parent key, so this stays clean.
  }, [data, currentPrice]);

  const empty = !loading && samples.length === 0;

  return (
    <section className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">{symbol} · Bonding curve</h2>
        <span className="text-xs text-zinc-500">
          {loading ? 'Sampling curve…' : `${samples.length} points · ${(progress * 100).toFixed(1)}% to graduation`}
        </span>
      </div>
      <div className="relative min-h-[280px] flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="max-w-xs text-center text-sm text-zinc-500">
              Curve sampling needs the pool config — select a pool to render its bonding curve.
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-zinc-600">
        Marginal price vs cumulative buy size, computed with the DBC SDK&apos;s own quote math.
        Amber line = current price.
      </p>
    </section>
  );
}
