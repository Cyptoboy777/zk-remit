import { describe, it, expect, beforeEach } from 'vitest';
import { pureCircuits, ReceiptStatus } from '../managed/zk-remit/contract/index.js';
import {
  ZkRemitSimulator,
  makeCredential,
  randomBytes,
  toHex,
  COUNTRY,
  TIER,
  SETTLEMENT_COLOR,
  defaultPolicy,
  freshCoin,
} from '../simulator.js';
import type { ZkRemitPrivateState } from '../witnesses.js';

const usd = (d: number) => BigInt(Math.round(d * 100));

describe('ZK Remit Wave 3 contract', () => {
  const governorSecret = randomBytes();
  let sim: ZkRemitSimulator;
  let issuerSecret: Uint8Array;
  let issuerPk: Uint8Array;
  let alice: ZkRemitPrivateState;
  let bobSecret: Uint8Array;
  let bobTag: Uint8Array;

  beforeEach(() => {
    sim = new ZkRemitSimulator(governorSecret);
    issuerSecret = randomBytes();
    issuerPk = pureCircuits.issuerPublicKey(issuerSecret);
    sim.as({ governorSecret }).addIssuer(issuerPk);
    sim.setCorridorPolicy(COUNTRY.UAE, COUNTRY.PHILIPPINES, defaultPolicy());
    sim.setCorridorPolicy(COUNTRY.USA, COUNTRY.MEXICO, defaultPolicy());

    const aliceSecret = randomBytes();
    const credential = makeCredential(aliceSecret, issuerPk, TIER.VERIFIED, COUNTRY.UAE, 3n);
    sim.as({ issuerSecret }).issueCredential(pureCircuits.credentialCommitment(credential));
    alice = { holderSecret: aliceSecret, credential };
    bobSecret = randomBytes();
    bobTag = pureCircuits.recipientTagOf(bobSecret);
    sim.as(alice);
  });

  it('initialises governor, settlement colour, epoch 1', () => {
    const fresh = new ZkRemitSimulator(governorSecret);
    expect(toHex(fresh.ledger.governorPk)).toBe(toHex(pureCircuits.governorPublicKey(governorSecret)));
    expect(toHex(fresh.ledger.settlementColor)).toBe(toHex(SETTLEMENT_COLOR));
    expect(fresh.ledger.epoch).toBe(1n);
    expect(fresh.ledger.totalReceipts).toBe(0n);
  });

  it('only the governor can add issuers, set policy or advance epochs', () => {
    sim.as({ governorSecret: randomBytes() });
    expect(() => sim.addIssuer(randomBytes())).toThrow(/not the governor/);
    expect(() => sim.setCorridorPolicy(COUNTRY.UK, COUNTRY.NIGERIA)).toThrow(/not the governor/);
    expect(() => sim.advanceEpoch()).toThrow(/not the governor/);
  });

  it('supports multiple issuers; revoked issuer cannot issue', () => {
    const issuer2 = randomBytes();
    const pk2 = pureCircuits.issuerPublicKey(issuer2);
    sim.as({ governorSecret }).addIssuer(pk2);
    expect(sim.ledger.issuerCount).toBe(2n);

    const cred = makeCredential(randomBytes(), pk2, TIER.BASIC, COUNTRY.USA, 5n);
    sim.as({ issuerSecret: issuer2 }).issueCredential(pureCircuits.credentialCommitment(cred));

    sim.as({ governorSecret }).revokeIssuer(pk2);
    const cred2 = makeCredential(randomBytes(), pk2, TIER.BASIC, COUNTRY.USA, 5n);
    sim.as({ issuerSecret: issuer2 });
    expect(() => sim.issueCredential(pureCircuits.credentialCommitment(cred2))).toThrow(/issuer is not active/);
  });

  it('private send: only corridor, band, nullifier and tags hit the ledger; status PENDING', () => {
    const coin = freshCoin(usd(420));
    const id = sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, coin);
    const r = sim.ledger.receipts.lookup(id);
    expect(r.fromCountry).toBe(COUNTRY.UAE);
    expect(r.toCountry).toBe(COUNTRY.PHILIPPINES);
    expect(r.amountBand).toBe(1n);
    expect(r.status).toBe(ReceiptStatus.PENDING);
    expect(sim.ledger.totalReceipts).toBe(1n);
    expect(sim.ledger.bandVolume.lookup(1n).read()).toBe(1n);

    const dump = JSON.stringify(
      [...sim.ledger.receipts].map(([k, v]) => [
        toHex(k),
        { ...v, escrowCommit: toHex(v.escrowCommit), recipientTag: toHex(v.recipientTag), viewTag: toHex(v.viewTag) },
      ]),
      (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    );
    expect(dump).not.toContain(toHex(alice.credential!.holderPk));
    expect(dump).not.toContain(toHex(alice.holderSecret!));
    expect(dump).not.toContain(toHex(coin.nonce));
    expect(dump).not.toContain('42000');
  });

  it('rejects forged credentials, wrong holder, wrong token, over-cap, closed corridor', () => {
    const mallory = randomBytes();
    const forged = makeCredential(mallory, issuerPk, TIER.ENHANCED, COUNTRY.UAE, 99n);
    sim.as({ holderSecret: mallory, credential: forged });
    expect(() => sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(usd(50)))).toThrow(
      /not found in issuer tree/,
    );

    sim.as({ holderSecret: randomBytes(), credential: alice.credential });
    expect(() => sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(usd(50)))).toThrow(
      /not bound to this holder/,
    );

    sim.as(alice);
    expect(() =>
      sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(usd(50), randomBytes())),
    ).toThrow(/wrong settlement token/);
    expect(() => sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(usd(1000.01)))).toThrow(
      /exceeds tier limit/,
    );
    expect(() => sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(0n))).toThrow(/must be positive/);
    expect(() => sim.sendRemittance(COUNTRY.NIGERIA, 0n, bobTag, freshCoin(usd(10)))).toThrow(/corridor not approved/);

    sim.as({ governorSecret }).closeCorridor(COUNTRY.UAE, COUNTRY.PHILIPPINES);
    sim.as(alice);
    expect(() => sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(usd(10)))).toThrow(
      /corridor not approved/,
    );
  });

  it('rate-limits with unlinkable nullifiers per epoch', () => {
    for (let s = 0n; s < 8n; s++) {
      sim.sendRemittance(COUNTRY.PHILIPPINES, s, bobTag, freshCoin(usd(10)));
    }
    expect(sim.ledger.totalReceipts).toBe(8n);
    expect(() => sim.sendRemittance(COUNTRY.PHILIPPINES, 3n, bobTag, freshCoin(usd(10)))).toThrow(/slot already used/);
    expect(() => sim.sendRemittance(COUNTRY.PHILIPPINES, 8n, bobTag, freshCoin(usd(10)))).toThrow(
      /quota for this epoch exhausted/,
    );
    sim.as({ governorSecret }).advanceEpoch();
    sim.as(alice);
    const id = sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(usd(10)));
    expect(toHex(id)).toBe(toHex(pureCircuits.nullifierOf(alice.holderSecret!, 2n, 0n)));
  });

  it('claim pays out once to the intended recipient with matching escrow opening', () => {
    const coin = freshCoin(usd(250));
    const salt = randomBytes();
    const id = sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, coin, salt);
    const opening = sim.privateState.escrows![toHex(id)];

    sim.as({ recipientSecret: randomBytes() }).withEscrow(id, opening);
    expect(() => sim.claim(id)).toThrow(/not the intended recipient/);

    sim.as({ recipientSecret: bobSecret, escrows: { [toHex(id)]: { ...opening, salt: randomBytes() } } });
    expect(() => sim.claim(id)).toThrow(/escrow opening does not match/);

    sim.as({ recipientSecret: bobSecret }).withEscrow(id, opening).claim(id);
    expect(sim.ledger.receipts.lookup(id).status).toBe(ReceiptStatus.CLAIMED);
    expect(sim.ledger.claimedCount).toBe(1n);
    expect(() => sim.as({ recipientSecret: bobSecret }).withEscrow(id, opening).claim(id)).toThrow(
      /already claimed/,
    );
  });

  it('reclaim after claimWindow; blocked while window open', () => {
    const coin = freshCoin(usd(80));
    const id = sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, coin);
    const opening = sim.privateState.escrows![toHex(id)];

    sim.as(alice).withEscrow(id, opening);
    expect(() => sim.reclaim(id)).toThrow(/claim window still open/);

    sim.as({ governorSecret }).advanceEpoch(); // epoch 2; window=2 so still open (1+2=3)
    sim.as(alice).withEscrow(id, opening);
    expect(() => sim.reclaim(id)).toThrow(/claim window still open/);

    sim.as({ governorSecret }).advanceEpoch(); // epoch 3
    sim.as(alice).withEscrow(id, opening).reclaim(id);
    expect(sim.ledger.receipts.lookup(id).status).toBe(ReceiptStatus.REFUNDED);
    expect(sim.ledger.refundedCount).toBe(1n);
  });

  it('selective disclosure: prove ownership; view key lists only own receipts', () => {
    const id1 = sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(usd(80)));
    const id2 = sim.sendRemittance(COUNTRY.PHILIPPINES, 1n, bobTag, freshCoin(usd(900)));

    const carolSecret = randomBytes();
    const carolCred = makeCredential(carolSecret, issuerPk, TIER.BASIC, COUNTRY.UAE, 5n);
    sim.as({ issuerSecret }).issueCredential(pureCircuits.credentialCommitment(carolCred));
    const id3 = sim
      .as({ holderSecret: carolSecret, credential: carolCred })
      .sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(usd(60)));

    const challenge = randomBytes();
    sim.as(alice).proveReceiptOwnership(id2, challenge);
    expect(sim.ledger.ownershipProofs.size()).toBe(1n);
    sim.as({ holderSecret: carolSecret });
    expect(() => sim.proveReceiptOwnership(id2, challenge)).toThrow(/not sent by this holder/);

    const vk = pureCircuits.viewKeyOf(alice.holderSecret!);
    const mine = [...sim.ledger.receipts]
      .filter(([nul, r]) => toHex(pureCircuits.viewTagOf(vk, nul)) === toHex(r.viewTag))
      .map(([nul]) => toHex(nul))
      .sort();
    expect(mine).toEqual([toHex(id1), toHex(id2)].sort());
    expect(mine).not.toContain(toHex(id3));
  });

  it('corridor policy caps and maxBand are enforced', () => {
    sim.as({ governorSecret }).setCorridorPolicy(
      COUNTRY.UAE,
      COUNTRY.PHILIPPINES,
      defaultPolicy({ maxBand: 0n, capT2: 5000n, slotsT2: 2n }),
    );
    sim.as(alice);
    expect(() => sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(usd(60)))).toThrow(
      /amount band not allowed|exceeds tier limit/,
    );
    sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, freshCoin(usd(40))); // band 0, under 50
  });

  it('disclosure helpers match disclosed fields for AI-1', () => {
    const coin = freshCoin(usd(150));
    const id = sim.sendRemittance(COUNTRY.PHILIPPINES, 0n, bobTag, coin);
    const r = sim.ledger.receipts.lookup(id);
    // Public surface for the disclosure preview (deterministic).
    const disclosed = {
      fromCountry: Number(r.fromCountry),
      toCountry: Number(r.toCountry),
      amountBand: Number(r.amountBand),
      epoch: Number(r.epoch),
      status: r.status,
      nullifier: toHex(id),
    };
    expect(disclosed.fromCountry).toBe(784);
    expect(disclosed.toCountry).toBe(608);
    expect(disclosed.amountBand).toBe(1);
    expect(['PENDING', 0, ReceiptStatus.PENDING]).toContain(disclosed.status);
  });
});
