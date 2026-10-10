# CurveScope — a Meteora DBC pool explorer

**Pitch:** CurveScope is a real-time explorer for Meteora's **Dynamic Bonding Curves (DBC)**,
built for the **Crypto World's Fair hackathon** — "Best use of Meteora's Dynamic Bonding
Curve (DBC)" track ($20,000 USDC). DBC pools launch tokens along a bonding curve and
graduate into DAMM v2 liquidity. CurveScope makes that journey visible: browse every DBC
pool on-chain, see each pool's **graduation progress %** toward DAMM v2, inspect the pool's
**real bonding curve** (marginal price vs buy size, computed with the DBC SDK's own
quote math — not a fitted approximation), get **graduation alerts** as pools approach the
migration threshold, and estimate **buy/sell quotes** with one-click swap execution through
your wallet.

Everything public works without a wallet. Only trade execution needs a signature.

## Sprint plan (hard close: Tue 2026-10-13 14:59 CST / Oct 12 11:59 PM PDT)

| Day | Focus |
| --- | --- |
| Sat (today) | Pivot repo DLMM → DBC, SDK verified, pool list + curve chart + quotes working |
| Sun | UI polish, alerts tuning, edge cases (migrated pools, weird mints) |
| Mon | README, demo video, pitch write-up, submission package |
| Tue | Submission buffer — user registers + submits on Superteam Earn before 14:59 CST |

## Local setup

```bash
cd ~/workspace/hackathon/dbc-dashboard
npm install
cp .env.example .env   # optional; defaults point at public mainnet-beta RPC
npm run dev            # http://localhost:3000
npm run build          # production build check
```

No wallet connection is required to browse pools, the curve chart, graduation tracking,
alerts, or the quote estimator — those are all public reads. Connecting a wallet
(Phantom/Solflare) unlocks the Execute button on the Trade panel. No secrets or keys
are stored anywhere in this repo.

## Notes on the Meteora DBC track

- Track verified 2026-10-10 via the official API
  (https://superteam.fun/api/hackathon/crypto-worlds-fair): **"Best use of Meteora's
  Dynamic Bonding Curve (DBC)"**, 20,000 USDC, slug `meteora-dbc`. There is no DLMM
  track — DBC ≠ DLMM (DBC = token-launch bonding curves graduating to DAMM v2;
  DLMM = concentrated-liquidity bins).
- Data layer: `@meteora-ag/dynamic-bonding-curve-sdk` v1.5.13. Ground truth was the
  installed `.d.ts` — the npm README shows an older version. Key verified facts:
  - Client: `DynamicBondingCurveClient.create(connection, commitment)` (the old
    `DynamicBondingCurve` class name is stale). Program ID
    `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`.
  - `client.state.getPools()` — full on-chain scan; `getPoolQuoteTokenCurveProgress(address)`
    returns **0–100** (converted to 0–1 in the app); `getPoolMetadata(address)` →
    `{ name, website, logo }` (no symbol field).
  - `client.pool.swapQuote({ virtualPool, config, swapBaseForQuote, amountIn, slippageBps,
    hasReferral, eligibleForFirstSwapWithMinFee, currentPoint })` is **synchronous**;
    returns `outputAmount` + `minimumAmountOut` + fee breakdown. Pure function
    `swapQuoteExactIn(virtualPool, config, swapBaseForQuote, amountIn, slippageBps,
    hasReferral, currentPoint, eligibleForFirstSwapWithMinFee)` drives the curve chart.
  - `client.pool.swap({ owner, pool, amountIn, minimumAmountOut, swapBaseForQuote,
    referralTokenAccount })` builds the swap Transaction (async).
  - DBC has **no OHLCV / price-history API** (unlike DLMM's datapi), so there are no
    K-line candles. The "chart" is the pool's real bonding curve sampled from the
    SDK's own quote math, plus a current-price marker from live reserves.
- **RPC matters:** `getPools()` is a full `getProgramAccounts` scan — slow on the
  public RPC. Set `NEXT_PUBLIC_SOLANA_RPC_URL` to a dedicated endpoint (e.g. Helius)
  in production; the demo works on public RPC with a patience tax.

## What's in the repo

| Path | Role |
| --- | --- |
| `lib/dbc.ts` | DBC data layer: client singleton, `listDbcPools`, `findPoolByBaseMint`, `getDbcPoolBundle`, `getSwapQuote`, `sampleBondingCurve`, `buildSwapTransaction` |
| `lib/solana.ts` | RPC connection helper (unchanged from scaffold) |
| `lib/format.ts` | `formatPercent`, `formatUsd`, `shortAddress` |
| `hooks/useDbcPools.ts` | Pool list + debounced search (mint lookup supported) |
| `hooks/useDbcPool.ts` | Pool detail bundle, polled every 15s |
| `components/PoolSelector.tsx` | Pool list with per-pool graduation progress bars |
| `components/CurveChart.tsx` | Bonding-curve chart (lightweight-charts line series) |
| `components/MigrationTracker.tsx` | Quote/base curve progress + DAMM v2 migration status |
| `components/QuotePanel.tsx` | Buy/sell quote estimator + wallet-signed execution |
| `components/GraduationAlerts.tsx` | Near-graduation / migrated / disconnected-wallet alerts |
| `components/Providers.tsx`, `components/WalletConnect.tsx` | Wallet adapter wiring (unchanged) |

## TODO (prioritized)

1. **Graduation threshold axis** — the chart's x-axis is sampled buy size; anchor it to
   the pool's real `migrationThreshold` from config so "how far to graduation" is exact.
2. **Creator / fee info** — surface `poolFees` and creator fee percentages from the
   pool config in the tracker (track-relevant detail for judging).
3. **Transfer-hook pools** — pools with token-transfer hooks need extra accounts on
   swap (`getPreSwapInstructions`); detect them and build correct transactions.
4. **Migrated-pool UX** — migrated pools currently show 100% + a note; link out to the
   DAMM v2 pool on Meteora's app instead of a dead quote box.
5. **Search UX** — add "recent pools" / trending sort once a ranking heuristic is chosen
   (graduation velocity = progress delta over time).
6. **Demo video + pitch** — record a 2–3 min walkthrough before Tue submission.
7. **Mobile layout pass** — grid collapses to one column; test on a real phone.
