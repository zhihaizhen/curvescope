/**
 * Meteora DBC (Dynamic Bonding Curve) access layer.
 *
 * Verified 2026-10-10 against @meteora-ag/dynamic-bonding-curve-sdk v1.5.13
 * (ground truth: installed .d.ts — the npm README shows older versions).
 *
 * Sources:
 * - https://www.npmjs.com/package/@meteora-ag/dynamic-bonding-curve-sdk
 * - Hackathon track: "Best use of Meteora's Dynamic Bonding Curve (DBC)",
 *   20,000 USDC, slug meteora-dbc — verified live via
 *   https://superteam.fun/api/hackathon/crypto-worlds-fair (37 side tracks).
 *
 * NOTE: DBC has no OHLCV / price-history API (unlike DLMM's datapi). All reads
 * below are on-chain via RPC. Pool listing avoids the SDK's `getPools()`
 * (full getProgramAccounts scan — downloads every pool, hangs in the
 * browser); it does an address-only scan + per-pool fetch instead. Use a
 * dedicated RPC via NEXT_PUBLIC_SOLANA_RPC_URL (e.g. Helius) for
 * production use.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import {
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  DynamicBondingCurveClient,
  getCurrentPoint,
  swapQuoteExactIn,
  type PoolConfig,
  type VirtualPool,
  type VirtualPoolMetadata,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { getConnection, SOLANA_RPC_URL } from './solana';
import { shortAddress } from './format';

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

let client: DynamicBondingCurveClient | null = null;

/** Singleton DBC client. */
export function getDbcClient(): DynamicBondingCurveClient {
  if (!client) client = DynamicBondingCurveClient.create(getConnection(), 'confirmed');
  return client;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DbcPoolSummary {
  address: string;
  name: string;
  symbol: string;
  baseMint: string;
  quoteMint: string;
  /** graduation progress as 0..1 (quote-token curve progress) */
  quoteProgress: number;
  isMigrated: boolean;
}

export interface DbcPoolBundle {
  address: string;
  pool: VirtualPool;
  config: PoolConfig | null;
  metadata: VirtualPoolMetadata | null;
  /** graduation progress as 0..1 */
  quoteProgress: number;
  baseProgress: number;
  baseMint: string;
  quoteMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  isMigrated: boolean;
  /** current slot/timestamp point used by fee/quote math */
  currentPoint: BN | null;
}

export interface CurveSample {
  /** cumulative quote input, human units */
  quoteIn: number;
  /** marginal price (quote per base), human units */
  price: number;
}

export interface DbcQuote {
  /** direction actually quoted */
  baseForQuote: boolean;
  amountIn: BN;
  amountOut: BN;
  /** human-readable output amount */
  amountOutUi: number;
  /** effective price (quote per base for buys), human units */
  effectivePrice: number;
  minimumAmountOut: BN;
  tradingFee: BN;
  protocolFee: BN;
}

/**
 * Runtime shape of the SDK's swap-quote results.
 *
 * The SDK's exported `SwapQuoteResult`/`SwapQuote2Result` types resolve to
 * near-empty types in TS (`keyof SwapQuoteResult` is just "minimumAmountOut")
 * because their `IdlTypes<...>` base doesn't resolve the IDL struct fields.
 * At runtime the objects DO carry the full IDL `swapResult` fields
 * (actualInputAmount, outputAmount, nextSqrtPrice, tradingFee, protocolFee,
 * referralFee) — verified against the program IDL bundled in the .d.ts.
 * So we describe the fields we actually read and cast through unknown.
 */
interface SdkQuoteRuntime {
  actualInputAmount: BN;
  outputAmount: BN;
  nextSqrtPrice: BN;
  tradingFee: BN;
  protocolFee: BN;
  referralFee: BN;
  minimumAmountOut: BN;
}

function asQuoteRuntime(result: unknown): SdkQuoteRuntime {
  return result as SdkQuoteRuntime;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function bnToNumber(bn: BN | number | undefined, decimals: number): number {
  if (bn === undefined || bn === null) return 0;
  const raw = BN.isBN(bn) ? bn : new BN(Math.floor(Number(bn)));
  return raw.toNumber() / Math.pow(10, decimals);
}

function toUiAmount(uiAmount: number, decimals: number): BN {
  const lamports = Math.floor(uiAmount * Math.pow(10, decimals));
  return new BN(lamports.toString());
}

/** Best-effort mint decimals via parsed account info; falls back to 9/6. */
async function getMintDecimals(
  connection: Connection,
  mint: string,
  fallback: number,
): Promise<number> {
  try {
    const info = await connection.getParsedAccountInfo(new PublicKey(mint));
    const data = (info.value?.data as { parsed?: { info?: { decimals?: number } } } | null)
      ?.parsed?.info;
    if (typeof data?.decimals === 'number') return data.decimals;
  } catch {
    /* fall through to fallback */
  }
  return fallback;
}

function metadataName(meta: VirtualPoolMetadata | null, address: string): { name: string; symbol: string } {
  const raw = (meta ?? {}) as unknown as Record<string, unknown>;
  const name = typeof raw.name === 'string' && raw.name ? raw.name : shortAddress(address);
  // DBC metadata carries name/website/logo; symbol is derived from the name's first token.
  const symbol = name.split(/\s+/)[0] || shortAddress(address);
  return { name, symbol };
}

/* ------------------------------------------------------------------ */
/* Pool listing                                                        */
/* ------------------------------------------------------------------ */

export interface ListDbcPoolsOptions {
  query?: string;
  limit?: number;
}

const LIST_LIMIT_DEFAULT = 40;

/**
 * Address-only program-account scan via raw JSON-RPC fetch.
 *
 * Why not `connection.getProgramAccounts()`: @solana/web3.js v1 validates RPC
 * responses with superstruct, and its jayson transport resolves `undefined`
 * (instead of throwing a useful error) when the endpoint answers HTTP 200
 * with an EMPTY body — which is what Helius's free tier does when the scan
 * gets throttled. The app then shows the cryptic
 * "Expected the value to satisfy a union of `type | type`, but received:
 * undefined". Raw fetch lets us detect empty/error responses, retry with
 * backoff, and surface a human-readable message instead.
 */
async function fetchProgramAccountAddresses(
  programId: string,
  { retries = 3 }: { retries?: number } = {},
): Promise<string[]> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getProgramAccounts',
    params: [
      programId,
      {
        encoding: 'base64',
        dataSlice: { offset: 0, length: 0 },
        commitment: 'confirmed',
      },
    ],
  });
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(SOLANA_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`RPC HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      if (!text) {
        throw new Error('RPC returned an empty response (throttled?)');
      }
      const json = JSON.parse(text) as {
        result?: { pubkey: string }[];
        error?: { message?: string };
      };
      if (json.error) {
        // JSON-RPC-level error (e.g. invalid params) — retrying won't help.
        throw new Error(`RPC error: ${json.error.message ?? 'unknown'}`, {
          cause: 'fatal',
        });
      }
      if (!Array.isArray(json.result)) {
        throw new Error('RPC returned an unexpected payload');
      }
      return json.result.map((a) => a.pubkey);
    } catch (e) {
      if (e instanceof Error && (e.cause as unknown) === 'fatal') throw e;
      lastError = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 750 * 2 ** attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Pool scan failed');
}

/**
 * List DBC pools without the full-chain download.
 *
 * The SDK's `getPools()` does a full getProgramAccounts scan that downloads
 * EVERY pool's full account data — thousands of pools on mainnet, megabytes
 * in the browser, effectively hangs. Instead:
 *   1. Address-only scan: getProgramAccounts with dataSlice(0,0) returns
 *      just pubkeys (tiny response, seconds not minutes).
 *   2. Fetch the first `limit` pools individually via `state.getPool()`
 *      (single getAccountInfo each, in parallel). Non-pool program accounts
 *      (configs, etc.) return null and are skipped — we over-fetch
 *      candidates to compensate.
 *   3. Enrich each with metadata + graduation progress in parallel
 *      (failures degrade to fallbacks, never throw the whole list).
 */
export async function listDbcPools(
  opts: ListDbcPoolsOptions = {},
): Promise<{ pools: DbcPoolSummary[]; total: number }> {
  const { query = '', limit = LIST_LIMIT_DEFAULT } = opts;
  const dbc = getDbcClient();

  const addresses = await fetchProgramAccountAddresses(
    DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58(),
  );
  const total = addresses.length;

  const candidates = addresses.slice(0, Math.max(limit * 3, limit + 20));
  const fetched = await Promise.all(
    candidates.map((address) => dbc.state.getPool(address).catch(() => null)),
  );
  const picked: { address: string; poolState: Record<string, unknown> }[] = [];
  for (let i = 0; i < fetched.length && picked.length < limit; i++) {
    const pool = fetched[i];
    if (!pool) continue;
    const poolState = (pool as unknown as { poolState?: Record<string, unknown> })
      .poolState;
    if (!poolState) continue;
    picked.push({
      address: candidates[i],
      poolState,
    });
  }

  const enriched = await Promise.all(
    picked.map(async ({ address, poolState }) => {
      const baseMint = String(poolState.baseMint ?? '');
      const quoteMint = String(poolState.quoteMint ?? '');
      const isMigrated = Boolean(poolState.isMigrated);
      const [metaRes, progressRes] = await Promise.allSettled([
        dbc.state.getPoolMetadata(address),
        dbc.state.getPoolQuoteTokenCurveProgress(address),
      ]);
      const meta =
        metaRes.status === 'fulfilled' && metaRes.value.length > 0 ? metaRes.value[0] : null;
      const quoteProgress =
        progressRes.status === 'fulfilled' && Number.isFinite(progressRes.value)
          ? progressRes.value
          : 0;
      const { name, symbol } = metadataName(meta, address);
      return { address, name, symbol, baseMint, quoteMint, quoteProgress, isMigrated };
    }),
  );

  const q = query.trim().toLowerCase();
  const pools = q
    ? enriched.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.symbol.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          p.baseMint.toLowerCase().includes(q),
      )
    : enriched;
  return { pools, total };
}

/** Look up a single pool by base mint (exact match) — powers the search box. */
export async function findPoolByBaseMint(mint: string): Promise<DbcPoolSummary | null> {
  const dbc = getDbcClient();
  let pk: PublicKey;
  try {
    pk = new PublicKey(mint.trim());
  } catch {
    return null;
  }
  const found = await dbc.state.getPoolByBaseMint(pk);
  if (!found) return null;
  const address = found.publicKey.toBase58();
  const poolState = found.account.poolState as unknown as Record<string, unknown>;
  const [metaRes, progressRes] = await Promise.allSettled([
    dbc.state.getPoolMetadata(address),
    dbc.state.getPoolQuoteTokenCurveProgress(address),
  ]);
  const meta =
    metaRes.status === 'fulfilled' && metaRes.value.length > 0 ? metaRes.value[0] : null;
  const { name, symbol } = metadataName(meta, address);
  return {
    address,
    name,
    symbol,
    baseMint: String(poolState.baseMint ?? ''),
    quoteMint: String(poolState.quoteMint ?? ''),
    quoteProgress:
      progressRes.status === 'fulfilled' && Number.isFinite(progressRes.value)
        ? progressRes.value
        : 0,
    isMigrated: Boolean(poolState.isMigrated),
  };
}

/* ------------------------------------------------------------------ */
/* Pool detail bundle                                                  */
/* ------------------------------------------------------------------ */

/**
 * Fetch everything the dashboard needs for one pool in parallel:
 * on-chain state, config, metadata, graduation progress, mint decimals,
 * and the current slot/timestamp point used by quote math.
 */
export async function getDbcPoolBundle(poolAddress: string): Promise<DbcPoolBundle> {
  const dbc = getDbcClient();
  const connection = getConnection();

  const pool = await dbc.state.getPool(poolAddress);
  if (!pool) throw new Error(`DBC pool not found: ${poolAddress}`);
  const poolState = pool.poolState as unknown as Record<string, unknown>;
  const baseMint = String(poolState.baseMint ?? '');
  const quoteMint = String(poolState.quoteMint ?? '');
  const configAddress = String(poolState.config ?? '');

  const [configRes, metaRes, quoteProgressRes, baseProgressRes, pointRes, decRes] =
    await Promise.allSettled([
      configAddress ? dbc.state.getPoolConfig(configAddress) : Promise.resolve(null),
      dbc.state.getPoolMetadata(poolAddress),
      dbc.state.getPoolQuoteTokenCurveProgress(poolAddress),
      dbc.state.getPoolBaseTokenCurveProgress(poolAddress),
      (async () => {
        // activationType lives on the config; default to Slot on failure.
        const cfg = configAddress ? await dbc.state.getPoolConfig(configAddress) : null;
        const activationType = ((cfg as unknown as Record<string, unknown> | null)
          ?.activationType ?? 0) as 0 | 1;
        return getCurrentPoint(connection, activationType);
      })(),
      (async () => {
        const [b, q] = await Promise.all([
          getMintDecimals(connection, baseMint, 9),
          getMintDecimals(connection, quoteMint, 6),
        ]);
        return { b, q };
      })(),
    ]);

  const config = configRes.status === 'fulfilled' ? configRes.value : null;
  const metaList = metaRes.status === 'fulfilled' ? metaRes.value : [];
  return {
    address: poolAddress,
    pool,
    config,
    metadata: metaList.length > 0 ? metaList[0] : null,
    quoteProgress:
      quoteProgressRes.status === 'fulfilled' && Number.isFinite(quoteProgressRes.value)
        ? quoteProgressRes.value
        : 0,
    baseProgress:
      baseProgressRes.status === 'fulfilled' && Number.isFinite(baseProgressRes.value)
        ? baseProgressRes.value
        : 0,
    baseMint,
    quoteMint,
    baseDecimals: decRes.status === 'fulfilled' ? decRes.value.b : 9,
    quoteDecimals: decRes.status === 'fulfilled' ? decRes.value.q : 6,
    isMigrated: Boolean(poolState.isMigrated),
    currentPoint: pointRes.status === 'fulfilled' ? pointRes.value : null,
  };
}

/* ------------------------------------------------------------------ */
/* Quotes & curve sampling (pure SDK math, no wallet needed)           */
/* ------------------------------------------------------------------ */

export interface QuoteRequest {
  bundle: DbcPoolBundle;
  /** 'buy' = quote -> base, 'sell' = base -> quote */
  direction: 'buy' | 'sell';
  /** human-readable input amount in the input token's units */
  amountInUi: number;
  slippageBps?: number;
}

/**
 * Exact-in quote using the SDK's own math (sync, no RPC).
 * Throws a descriptive error when the bundle lacks config/currentPoint.
 */
export function getSwapQuote(req: QuoteRequest): DbcQuote {
  const { bundle, direction, amountInUi, slippageBps = 100 } = req;
  if (!bundle.config) throw new Error('Pool config unavailable — cannot quote');
  if (!bundle.currentPoint) throw new Error('Current point unavailable — cannot quote');
  const baseForQuote = direction === 'sell';
  const inDecimals = baseForQuote ? bundle.baseDecimals : bundle.quoteDecimals;
  const outDecimals = baseForQuote ? bundle.quoteDecimals : bundle.baseDecimals;
  const amountIn = toUiAmount(amountInUi, inDecimals);
  if (amountIn.isZero() || amountIn.isNeg()) throw new Error('Amount must be positive');

  const dbc = getDbcClient();
  const r = asQuoteRuntime(
    dbc.pool.swapQuote({
      virtualPool: bundle.pool,
      config: bundle.config,
      swapBaseForQuote: baseForQuote,
      amountIn,
      slippageBps,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint: bundle.currentPoint,
    }),
  );

  const amountOutUi = bnToNumber(r.outputAmount, outDecimals);
  const amountInUiNum = bnToNumber(amountIn, inDecimals);
  // effective price expressed as quote per base
  const effectivePrice = baseForQuote
    ? amountInUiNum / (amountOutUi || 1)
    : amountOutUi > 0
      ? amountInUiNum / amountOutUi
      : 0;

  return {
    baseForQuote,
    amountIn,
    amountOut: r.outputAmount,
    amountOutUi,
    effectivePrice,
    minimumAmountOut: r.minimumAmountOut,
    tradingFee: r.tradingFee,
    protocolFee: r.protocolFee,
  };
}

/**
 * Sample the bonding curve using the SDK's pure quote math: for N
 * geometrically-spaced buy sizes (quote -> base), compute the marginal
 * price. Returns points suitable for a line chart. This is the pool's real
 * curve as traders experience it — not a fitted approximation.
 */
export function sampleBondingCurve(bundle: DbcPoolBundle, samples = 36): CurveSample[] {
  if (!bundle.config || !bundle.currentPoint) return [];
  const { quoteDecimals, baseDecimals } = bundle;
  // Sample buy sizes from 0.1% to ~50% of a reference scale. The reference
  // scale is derived from current quote reserves when available.
  const poolState = bundle.pool.poolState as unknown as Record<string, unknown>;
  const quoteReserve = poolState.quoteReserve as unknown as BN | undefined;
  const reserveUi = quoteReserve ? bnToNumber(quoteReserve, quoteDecimals) : 1000;
  const maxIn = Math.max(reserveUi * 0.5, 1);

  const points: CurveSample[] = [];
  for (let i = 1; i <= samples; i++) {
    const quoteIn = maxIn * Math.pow(i / samples, 2);
    try {
      const q = asQuoteRuntime(
        swapQuoteExactIn(
          bundle.pool,
          bundle.config,
          false, // quote -> base (buy)
          toUiAmount(quoteIn, quoteDecimals),
          0,
          false,
          bundle.currentPoint,
          false,
        ),
      );
      const outUi = bnToNumber(q.outputAmount, baseDecimals);
      if (outUi > 0) points.push({ quoteIn, price: quoteIn / outUi });
    } catch {
      /* skip sizes the curve math rejects */
    }
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* Swap execution (needs a connected wallet to sign)                   */
/* ------------------------------------------------------------------ */

export interface SwapExecution {
  bundle: DbcPoolBundle;
  direction: 'buy' | 'sell';
  amountInUi: number;
  owner: PublicKey;
  slippageBps?: number;
}

/** Build an unsigned swap Transaction; the caller signs/sends via the wallet adapter. */
export async function buildSwapTransaction(exec: SwapExecution) {
  const quote = getSwapQuote({
    bundle: exec.bundle,
    direction: exec.direction,
    amountInUi: exec.amountInUi,
    slippageBps: exec.slippageBps ?? 100,
  });
  const dbc = getDbcClient();
  const tx = await dbc.pool.swap({
    owner: exec.owner,
    pool: new PublicKey(exec.bundle.address),
    amountIn: quote.amountIn,
    minimumAmountOut: quote.minimumAmountOut,
    swapBaseForQuote: quote.baseForQuote,
    referralTokenAccount: null,
  });
  return { tx, quote };
}
