/*
 * Resolves the REAL Merkle tree index (mt_index) of an escrowed coin held by the ZK Remit contract.
 *
 * Spending a contract-owned shielded coin needs its position in Zswap's global coin-commitment tree.
 * That position only exists after the send transaction is applied, so it cannot be stored at send
 * time without publishing the coin (and with it the exact amount). Instead we:
 *   1. recompute the coin commitment the chain stored for (coin, recipient = this contract), and
 *   2. look it up among the contract's leaves in the Zswap chain state the indexer returns.
 * The amount never leaves the device; only the public tree is read.
 */
import {
  ShieldedCoinInfoDescriptor,
  ShieldedCoinRecipientDescriptor,
  runtimeCoinCommitment,
} from '@midnight-ntwrk/compact-runtime';

export type PlainCoin = { nonce: Uint8Array; color: Uint8Array; value: bigint };

/** Minimal view of ledger ZswapChainState that we rely on. */
export type ZswapStateLike = { filter(contractAddress: string): { toString(compact?: boolean): string } };

const hexToBytes = (h: string): Uint8Array => {
  const clean = h.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const bytesToHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** The coin commitment Zswap stores for a coin owned by `contractAddressHex`. */
export const contractCoinCommitment = (coin: PlainCoin, contractAddressHex: string): string => {
  const recipient = { is_left: false, left: { bytes: new Uint8Array(32) }, right: { bytes: hexToBytes(contractAddressHex) } };
  const out = runtimeCoinCommitment(
    { value: ShieldedCoinInfoDescriptor.toValue(coin), alignment: ShieldedCoinInfoDescriptor.alignment() },
    { value: ShieldedCoinRecipientDescriptor.toValue(recipient as any), alignment: ShieldedCoinRecipientDescriptor.alignment() },
  );
  return bytesToHex(out.value[0]);
};

/** Parses `index: (commitment, ...)` leaves out of a (contract-filtered) Zswap state dump. */
export const leavesOf = (dump: string): Map<string, bigint> => {
  const leaves = new Map<string, bigint>();
  for (const m of dump.matchAll(/(\d+):\s*\(([0-9a-f]{64})\s*,/g)) leaves.set(m[2], BigInt(m[1]));
  return leaves;
};

/** Returns the coin's tree index, or undefined if the chain does not (yet) hold it for this contract. */
export const findEscrowIndex = (state: ZswapStateLike, coin: PlainCoin, contractAddressHex: string): bigint | undefined => {
  const want = contractCoinCommitment(coin, contractAddressHex);
  return leavesOf(state.filter(contractAddressHex).toString()).get(want);
};
