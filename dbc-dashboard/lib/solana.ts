import { Connection } from '@solana/web3.js';

/** RPC endpoint, overridable via env. Defaults to public mainnet-beta. */
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

/** Network label shown in the UI. */
export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_NETWORK || 'mainnet-beta';

/** Singleton connection reused across the app. */
let connection: Connection | null = null;

export function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  }
  return connection;
}
