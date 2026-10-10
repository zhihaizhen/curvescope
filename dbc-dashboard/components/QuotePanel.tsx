'use client';

import { useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { buildSwapTransaction, getSwapQuote, type DbcPoolBundle } from '@/lib/dbc';

interface Props {
  bundle: DbcPoolBundle | null;
}

/**
 * Buy/sell quote estimator for the selected DBC pool, powered by the SDK's
 * own quote math (no wallet needed for quotes). The Execute button builds
 * the swap transaction and sends it through the connected wallet.
 */
export default function QuotePanel({ bundle }: Props) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('1');
  const [sending, setSending] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inSymbol = useMemo(() => {
    if (!bundle) return '';
    // buy = pay quote, sell = pay base
    return direction === 'buy' ? 'quote' : 'base';
  }, [bundle, direction]);

  const quote = useMemo(() => {
    if (!bundle) return null;
    const amt = Number(amount);
    if (!amt || amt <= 0) return null;
    try {
      return getSwapQuote({ bundle, direction, amountInUi: amt });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Quote failed' };
    }
  }, [bundle, direction, amount]);

  const quoteError = quote && 'error' in quote ? quote.error : null;
  const quoteOk = quote && !('error' in quote) ? quote : null;

  const execute = async () => {
    if (!bundle || !publicKey || !connected) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setSending(true);
    setError(null);
    setTxSig(null);
    try {
      const { tx } = await buildSwapTransaction({
        bundle,
        direction,
        amountInUi: amt,
        owner: publicKey,
      });
      const sig = await sendTransaction(tx, connection);
      setTxSig(sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap failed');
    } finally {
      setSending(false);
    }
  };

  const inputCls =
    'w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none';

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Trade</h2>

      {!bundle && <p className="text-sm text-zinc-500">Select a pool to get a quote.</p>}

      {bundle && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-zinc-950 p-1">
            {(['buy', 'sell'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={`rounded-md py-1.5 text-sm font-medium capitalize transition-colors ${
                  direction === d
                    ? d === 'buy'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">
              You pay ({inSymbol} token)
            </span>
            <input
              className={inputCls}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.0"
            />
          </label>

          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
            {quoteError && <p className="text-xs text-red-400">{quoteError}</p>}
            {quoteOk && (
              <>
                <div className="flex justify-between">
                  <span className="text-zinc-500">You receive (est.)</span>
                  <span className="font-semibold text-zinc-100">
                    {quoteOk.amountOutUi.toPrecision(6)}{' '}
                    {direction === 'buy' ? 'base' : 'quote'}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-xs">
                  <span className="text-zinc-500">Effective price</span>
                  <span className="text-zinc-300">
                    {quoteOk.effectivePrice > 0 ? quoteOk.effectivePrice.toPrecision(6) : '—'} quote/base
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-600">
                  Quote only — 1% slippage baked in. Not financial advice.
                </p>
              </>
            )}
            {!quoteOk && !quoteError && (
              <p className="text-xs text-zinc-500">Enter an amount to see a quote.</p>
            )}
          </div>

          {txSig && (
            <p className="mt-2 break-all text-xs text-emerald-400">
              Sent: {txSig.slice(0, 12)}…{txSig.slice(-8)}
            </p>
          )}
          {error && (
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}

          <button
            onClick={execute}
            disabled={!connected || !quoteOk || sending}
            className={`mt-3 w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              direction === 'buy'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
          >
            {!connected
              ? 'Connect wallet to trade'
              : sending
                ? 'Sending…'
                : `Execute ${direction}`}
          </button>
        </>
      )}
    </section>
  );
}
