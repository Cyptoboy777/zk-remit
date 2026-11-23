import { describe, it, expect } from 'vitest';
import * as L from '@midnight-ntwrk/ledger-v8';
import { contractCoinCommitment, findEscrowIndex, leavesOf } from '../escrowIndex';

const hx = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

const build = (owners: string[], values: bigint[]) => {
  const tt = L.sampleRawTokenType();
  let st = new L.ZswapChainState();
  const coins = values.map((v, i) => {
    const c = L.createShieldedCoinInfo(tt, v);
    const off = L.ZswapOffer.fromOutput(L.ZswapOutput.newContractOwned(c, 0, owners[i]), tt, v);
    st = st.tryApply(off)[0];
    return { nonce: hx(c.nonce), color: hx(c.type), value: c.value };
  });
  return { st, coins };
};

describe('escrow tree index resolution (real mt_index)', () => {
  const ours = L.sampleContractAddress();
  const other = L.sampleContractAddress();

  it('recomputes the exact commitment Zswap stores for a contract-owned coin', () => {
    const tt = L.sampleRawTokenType();
    const c = L.createShieldedCoinInfo(tt, 12345n);
    const [, inserted] = new L.ZswapChainState().tryApply(
      L.ZswapOffer.fromOutput(L.ZswapOutput.newContractOwned(c, 0, ours), tt, 12345n),
    );
    const coin = { nonce: hx(c.nonce), color: hx(c.type), value: c.value };
    expect(contractCoinCommitment(coin, ours)).toBe([...inserted.keys()][0]);
  });

  it('finds the real, non-zero index among other contracts\u2019 coins', () => {
    const { st, coins } = build([other, ours, other, other, ours], [1n, 2n, 3n, 4n, 5n]);
    expect(findEscrowIndex(st, coins[1], ours)).toBe(1n);
    expect(findEscrowIndex(st, coins[4], ours)).toBe(4n);
  });

  it('never returns an index for a coin this contract does not hold', () => {
    const { st, coins } = build([other, ours], [10n, 20n]);
    expect(findEscrowIndex(st, coins[0], ours)).toBeUndefined();
    expect(findEscrowIndex(st, { ...coins[1], value: 21n }, ours)).toBeUndefined();
  });

  it('parses leaves from a state dump', () => {
    const dump = `coin_coms: MerkleTree {\n 0..=1: <collapsed>,\n 2: (${'ab'.repeat(32)}, Some(ContractAddress(00))),\n}`;
    expect(leavesOf(dump).get('ab'.repeat(32))).toBe(2n);
  });
});
