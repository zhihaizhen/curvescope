'use client';

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { SOLANA_NETWORK } from '@/lib/solana';

export default function WalletConnect() {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden sm:inline rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400">
        {SOLANA_NETWORK}
      </span>
      <WalletMultiButton />
    </div>
  );
}
