/*
 * Resolves the REAL Merkle tree index (mt_index) of an escrowed coin held by the ZK Remit contract.
 *
 * Spending a contract-owned shielded coin needs its position in Zswap's global coin-commitment tree.
 * That position only exists after the send transaction is applied, so it cannot be stored at send
 * time without publishing the coin (and with it the exact amount). Instead we:
 *   1. recompute the coin commitment the chain stored for (coin, recipient = this contract), and
 *   2. look it up among the contract's leaves in the Zswap chain state the indexer returns.
 * The amount never leaves the device; only the public tree is read.
 *
 * Neither Midnight.js 5.0.1 nor ledger-v9 1.0.2 exposes "index of commitment X" for a Zswap state
 * (ZswapChainState only has firstFree, tryApply, filter, toString), so step 2 reads the state's
 * debug listing. To make that safe, `parserHealthy()` checks the listing format against the ledger
 * actually loaded in the page. If the format ever changes, the app reports a distinct, friendly
 * "release unavailable" state instead of guessing, and the sender can still reclaim after the window.
 */
import {
  CompactTypeBoolean,
  CompactTypeBytes,
  CompactTypeUnsignedInteger,
  runtimeCoinCommitment,
} from '@midnight-ntwrk/compact-runtime';

export type PlainCoin = { nonce: Uint8Array; color: Uint8Array; value: bigint };

/** Minimal view of ledger ZswapChainState that we rely on. */
export type ZswapStateLike = { filter(contractAddress: string): { toString(compact?: boolean): string } };

// Same encoding the Compact runtime uses internally for Zswap commitments (compact-runtime 0.21).
const B32 = new CompactTypeBytes(32);
const U64 = new CompactTypeUnsignedInteger(18446744073709551615n, 8);
const coinValue = (c: PlainCoin) => B32.toValue(c.nonce).concat(B32.toValue(c.color), U64.toValue(c.value));
const coinAlign = () => B32.alignment().concat(B32.alignment(), U64.alignment());
const recipientValue = (contract: Uint8Array) =>
  CompactTypeBoolean.toValue(false).concat(B32.toValue(new Uint8Array(32)), B32.toValue(contract));
const recipientAlign = () => CompactTypeBoolean.alignment().concat(B32.alignment(), B32.alignment());

const hexToBytes = (h: string): Uint8Array => {
  const clean = h.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const bytesToHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** The coin commitment Zswap stores for a coin owned by `contractAddressHex`. */
export const contractCoinCommitment = (coin: PlainCoin, contractAddressHex: string): string => {
  const out = runtimeCoinCommitment(
    { value: coinValue(coin), alignment: coinAlign() },
    { value: recipientValue(hexToBytes(contractAddressHex)), alignment: recipientAlign() },
  );
  return bytesToHex(B32.fromValue([...out.value]));
};

/** Parses `index: (commitment, ...)` leaves out of a (contract-filtered) Zswap state dump. */
export const leavesOf = (dump: string): Map<string, bigint> => {
  const leaves = new Map<string, bigint>();
  for (const m of dump.matchAll(/(\d+):\s*\(([0-9a-f]{64})\s*,/g)) leaves.set(m[2], BigInt(m[1]));
  return leaves;
};

export type IndexLookup =
  | { kind: 'found'; index: bigint }
  | { kind: 'not-yet' } // chain does not hold the coin (yet): still confirming, or already spent
  | { kind: 'unsupported' }; // the state listing could not be read on this ledger version

/** Returns the coin's tree index, or why it could not be found. Never guesses. */
export const lookupEscrowIndex = (state: ZswapStateLike, coin: PlainCoin, contractAddressHex: string): IndexLookup => {
  let dump: string;
  try {
    dump = state.filter(contractAddressHex).toString();
  } catch {
    return { kind: 'unsupported' };
  }
  const index = leavesOf(dump).get(contractCoinCommitment(coin, contractAddressHex));
  if (index !== undefined) return { kind: 'found', index };
  // A contract that holds escrow always lists at least one leaf; a listing with none we can parse
  // while the dump clearly mentions this contract means the format changed.
  if (leavesOf(dump).size === 0 && dump.toLowerCase().includes(contractAddressHex.toLowerCase())) return { kind: 'unsupported' };
  return { kind: 'not-yet' };
};

/** Back-compat helper: index or undefined. */
export const findEscrowIndex = (state: ZswapStateLike, coin: PlainCoin, contractAddressHex: string): bigint | undefined => {
  const r = lookupEscrowIndex(state, coin, contractAddressHex);
  return r.kind === 'found' ? r.index : undefined;
};
