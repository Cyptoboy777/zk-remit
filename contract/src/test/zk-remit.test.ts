import { describe, it, expect, beforeEach } from 'vitest';
import { pureCircuits } from '../managed/zk-remit/contract/index.js';
import { ZkRemitSimulator, makeCredential, randomBytes, toHex, COUNTRY, TIER } from '../simulator.js';
import type { ZkRemitPrivateState } from '../witnesses.js';

const usd = (d: number) => BigInt(Math.round(d * 100));

describe('ZK Remit contract', () => {
  const issuerSecret = randomBytes();
  let sim: ZkRemitSimulator;
  let alice: ZkRemitPrivateState; // remitter in UAE, VERIFIED tier
  let bobSecret: Uint8Array; // beneficiary in India
  let bobTag: Uint8Array;

  beforeEach(() => {
    sim = new ZkRemitSimulator(issuerSecret);
    sim.openCorridor(COUNTRY.UAE, COUNTRY.INDIA);
    const aliceSecret = randomBytes();
    const credential = makeCredential(aliceSecret, TIER.VERIFIED, COUNTRY.UAE, 3n);
    sim.issueCredential(pureCircuits.credentialCommitment(credential));
    alice = { holderSecret: aliceSecret, credential };
    bobSecret = randomBytes();
    bobTag = pureCircuits.recipientTagOf(bobSecret);
    sim.as(alice);
  });

  it('initialises with the issuer key, epoch 1 and empty registries', () => {
    const fresh = new ZkRemitSimulator(issuerSecret);
    expect(toHex(fresh.ledger.issuerPk)).toBe(toHex(pureCircuits.issuerPublicKey(issuerSecret)));
    expect(fresh.ledger.epoch).toBe(1n);
    expect(fresh.ledger.receipts.isEmpty()).toBe(true);
  });

  it('only the issuer can publish credentials, open corridors or advance epochs', () => {
    sim.as({ issuerSecret: randomBytes() });
    expect(() => sim.issueCredential(randomBytes())).toThrow(/not the KYC issuer/);
    expect(() => sim.openCorridor(COUNTRY.USA, COUNTRY.PHILIPPINES)).toThrow(/not the KYC issuer/);
    expect(() => sim.advanceEpoch()).toThrow(/not the KYC issuer/);
  });

  it('a KYC-verified sender remits privately: only corridor, band, nullifier and blinded tags hit the ledger', () => {
    const salt = randomBytes();
    const id = sim.sendRemittance(COUNTRY.INDIA, usd(420), salt, 0n, bobTag);
    const l = sim.ledger;
    expect(l.totalReceipts).toBe(1n);
    expect(l.nullifiers.member(id)).toBe(true);
    const r = l.receipts.lookup(id);
    expect(r.fromCountry).toBe(COUNTRY.UAE);
    expect(r.toCountry).toBe(COUNTRY.INDIA);
    expect(r.amountBand).toBe(1n); // $100 < x <= $500
    expect(r.claimed).toBe(false);
    // Nothing identifying is stored: no holder pk, no tier, no exact amount.
    const ledgerDump = JSON.stringify(
      [...l.receipts].map(([k, v]) => [toHex(k), { ...v, amountCommit: toHex(v.amountCommit), recipientTag: toHex(v.recipientTag), viewTag: toHex(v.viewTag) }]),
      (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    );
    expect(ledgerDump).not.toContain(toHex(alice.credential!.holderPk));
    expect(ledgerDump).not.toContain(toHex(alice.holderSecret!));
    expect(ledgerDump).not.toContain('42000');
    expect(l.bandVolume.lookup(1n).read()).toBe(1n);
  });

  it('rejects senders without an issued credential (forged credential)', () => {
    const mallorySecret = randomBytes();
    const forged = makeCredential(mallorySecret, TIER.ENHANCED, COUNTRY.UAE, 99n);
    sim.as({ holderSecret: mallorySecret, credential: forged });
    expect(() => sim.sendRemittance(COUNTRY.INDIA, usd(50), randomBytes(), 0n, bobTag)).toThrow(/not found in issuer tree/);
  });

  it('rejects a stolen credential used with a different secret', () => {
    sim.as({ holderSecret: randomBytes(), credential: alice.credential });
    expect(() => sim.sendRemittance(COUNTRY.INDIA, usd(50), randomBytes(), 0n, bobTag)).toThrow(/not bound to this holder/);
  });

  it('rejects amounts above the private tier cap', () => {
    expect(() => sim.sendRemittance(COUNTRY.INDIA, usd(1000.01), randomBytes(), 0n, bobTag)).toThrow(/exceeds tier limit/);
    expect(() => sim.sendRemittance(COUNTRY.INDIA, 0n, randomBytes(), 0n, bobTag)).toThrow(/must be positive/);
  });

  it('rejects unapproved corridors and closed corridors', () => {
    expect(() => sim.sendRemittance(COUNTRY.NIGERIA, usd(10), randomBytes(), 0n, bobTag)).toThrow(/corridor not approved/);
    sim.as({ issuerSecret }).closeCorridor(COUNTRY.UAE, COUNTRY.INDIA);
    sim.as(alice);
    expect(() => sim.sendRemittance(COUNTRY.INDIA, usd(10), randomBytes(), 0n, bobTag)).toThrow(/corridor not approved/);
  });

  it('rate-limits with unlinkable nullifiers: one per (holder, epoch, slot), max tierSlots per epoch', () => {
    for (let s = 0n; s < 8n; s++) sim.sendRemittance(COUNTRY.INDIA, usd(10), randomBytes(), s, bobTag);
    expect(sim.ledger.totalReceipts).toBe(8n);
    expect(() => sim.sendRemittance(COUNTRY.INDIA, usd(10), randomBytes(), 3n, bobTag)).toThrow(/slot already used/);
    expect(() => sim.sendRemittance(COUNTRY.INDIA, usd(10), randomBytes(), 8n, bobTag)).toThrow(/quota for this epoch exhausted/);
    // New epoch → fresh quota, and nullifiers differ (unlinkable across epochs).
    sim.as({ issuerSecret }).advanceEpoch();
    sim.as(alice);
    const id = sim.sendRemittance(COUNTRY.INDIA, usd(10), randomBytes(), 0n, bobTag);
    expect(toHex(id)).toBe(toHex(pureCircuits.nullifierOf(alice.holderSecret!, 2n, 0n)));
    expect(toHex(id)).not.toBe(toHex(pureCircuits.nullifierOf(alice.holderSecret!, 1n, 0n)));
  });

  it('rejects expired credentials after the compliance epoch passes', () => {
    sim.as({ issuerSecret }).advanceEpoch(); // 2
    sim.advanceEpoch(); // 3
    sim.as(alice).sendRemittance(COUNTRY.INDIA, usd(10), randomBytes(), 0n, bobTag); // expiry 3 still ok
    sim.as({ issuerSecret }).advanceEpoch(); // 4
    sim.as(alice);
    expect(() => sim.sendRemittance(COUNTRY.INDIA, usd(10), randomBytes(), 1n, bobTag)).toThrow(/credential expired/);
  });

  it('only the intended recipient can claim, once, with the correct amount opening', () => {
    const salt = randomBytes();
    const id = sim.sendRemittance(COUNTRY.INDIA, usd(250), salt, 0n, bobTag);
    sim.as({ recipientSecret: randomBytes() });
    expect(() => sim.claim(id, usd(250), salt)).toThrow(/not the intended recipient/);
    sim.as({ recipientSecret: bobSecret });
    expect(() => sim.claim(id, usd(2500), salt)).toThrow(/amount opening does not match/);
    sim.claim(id, usd(250), salt);
    expect(sim.ledger.receipts.lookup(id).claimed).toBe(true);
    expect(() => sim.claim(id, usd(250), salt)).toThrow(/already claimed/);
  });

  it('selective disclosure to auditors: prove one receipt, or hand over a view key to list all of them', () => {
    const id1 = sim.sendRemittance(COUNTRY.INDIA, usd(80), randomBytes(), 0n, bobTag);
    const id2 = sim.sendRemittance(COUNTRY.INDIA, usd(900), randomBytes(), 1n, bobTag);
    // Someone else sends too.
    const carolSecret = randomBytes();
    const carolCred = makeCredential(carolSecret, TIER.BASIC, COUNTRY.UAE, 5n);
    sim.as({ issuerSecret }).issueCredential(pureCircuits.credentialCommitment(carolCred));
    const id3 = sim.as({ holderSecret: carolSecret, credential: carolCred }).sendRemittance(COUNTRY.INDIA, usd(60), randomBytes(), 0n, bobTag);

    // Mode A: Alice proves id2 is hers against an auditor challenge; Carol cannot.
    const challenge = randomBytes();
    sim.as(alice).proveReceiptOwnership(id2, challenge);
    expect(sim.ledger.ownershipProofs.size()).toBe(1n);
    sim.as({ holderSecret: carolSecret });
    expect(() => sim.proveReceiptOwnership(id2, challenge)).toThrow(/not sent by this holder/);

    // Mode B: with Alice's view key an auditor finds exactly her receipts.
    const vk = pureCircuits.viewKeyOf(alice.holderSecret!);
    const mine = [...sim.ledger.receipts]
      .filter(([nul, r]) => toHex(pureCircuits.viewTagOf(vk, nul)) === toHex(r.viewTag))
      .map(([nul]) => toHex(nul))
      .sort();
    expect(mine).toEqual([toHex(id1), toHex(id2)].sort());
    expect(mine).not.toContain(toHex(id3));
  });

  it('BASIC tier caps at $200 and 3 transfers per epoch', () => {
    const s = randomBytes();
    const c = makeCredential(s, TIER.BASIC, COUNTRY.UAE, 9n);
    sim.as({ issuerSecret }).issueCredential(pureCircuits.credentialCommitment(c));
    sim.as({ holderSecret: s, credential: c });
    expect(() => sim.sendRemittance(COUNTRY.INDIA, usd(201), randomBytes(), 0n, bobTag)).toThrow(/exceeds tier limit/);
    for (let i = 0n; i < 3n; i++) sim.sendRemittance(COUNTRY.INDIA, usd(200), randomBytes(), i, bobTag);
    expect(() => sim.sendRemittance(COUNTRY.INDIA, usd(1), randomBytes(), 3n, bobTag)).toThrow(/quota/);
  });
});
