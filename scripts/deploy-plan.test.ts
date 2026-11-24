import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDeploy, pendingKeys, parseBlockLimits, PREVIEW_BLOCK_LIMITS, blockShare, seedSteps, type Cost } from './deploy-plan.js';

// Numbers measured from the real ZK Remit contract against Preview's ledger parameters.
const VK_BYTES = 2_280n;
const cost = (written: bigint): Cost => ({ readTime: 1_785_000_000n, computeTime: 2_011_000_000n, blockUsage: written, bytesWritten: written, bytesChurned: 6_144n });
const ALL = ['addIssuer', 'setCorridorPolicy', 'enableTestMint', 'sendRemittance', 'claim', 'reclaim', 'issueCredential', 'revokeIssuer', 'closeCorridor', 'advanceEpoch', 'mintTestSettlement', 'proveReceiptOwnership'];
const deployCost = (keys: readonly string[]) => cost(5_230n + VK_BYTES * BigInt(keys.length));
const insertCost = () => cost(2_237n);

test('the full deploy is what Preview refused: it needs most of a block', () => {
  assert.ok(blockShare(deployCost(ALL), PREVIEW_BLOCK_LIMITS) > 0.55);
});

test('plan keeps the deploy under 30% of a block and inserts the rest one by one', () => {
  const p = planDeploy(ALL, deployCost, insertCost);
  assert.deepEqual(p.inDeploy, ['addIssuer', 'setCorridorPolicy', 'enableTestMint', 'sendRemittance']);
  assert.equal(p.inserts.length, 8);
  assert.ok(p.deployShare <= 0.3);
  assert.deepEqual([...p.inDeploy, ...p.inserts].sort(), [...ALL].sort());
});

test('a tighter share puts fewer keys in the deploy, never zero-sized surprises', () => {
  const p = planDeploy(ALL, deployCost, insertCost, PREVIEW_BLOCK_LIMITS, 0.11);
  assert.deepEqual(p.inDeploy, []);
  assert.equal(p.inserts.length, 12);
});

test('a single key larger than a block is reported, not attempted', () => {
  assert.throws(() => planDeploy(ALL, deployCost, (c) => cost(c === 'claim' ? 60_000n : 2_237n)), /claim alone needs 120% of a block/);
});

test('resume: only keys the chain does not have yet are pending, order kept', () => {
  assert.deepEqual(pendingKeys(ALL, new Set(['addIssuer', 'setCorridorPolicy', 'enableTestMint', 'claim'])), ALL.filter((c) => !['addIssuer', 'setCorridorPolicy', 'enableTestMint', 'claim'].includes(c)));
  assert.deepEqual(pendingKeys(ALL, new Set(ALL)), []);
});

test('block limits parse from the ledger parameters text', () => {
  const text = 'block_limits: SyntheticCost {\n read_time: 2.000s,\n compute_time: 2.000s,\n block_usage: 1000000,\n bytes_written: 50000,\n bytes_churned: 50000000,\n },';
  assert.deepEqual(parseBlockLimits(text), PREVIEW_BLOCK_LIMITS);
  assert.equal(parseBlockLimits('nothing here'), null);
});

test('seed steps are stable labels', () => {
  assert.deepEqual(seedSteps(2, true), ['issuer', 'corridor-1', 'corridor-2', 'test-mint']);
  assert.deepEqual(seedSteps(1, false), ['issuer', 'corridor-1']);
});
