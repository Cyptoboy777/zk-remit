/*
 * ZkRemitSimulator — executes the *compiled* ZK Remit circuits locally with the
 * official Compact runtime. Every assert in the Compact source is enforced exactly
 * as it would be when generating a proof; only proof generation and chain submission
 * are skipped. Used by the unit tests and by the browser "Simulator" demo mode.
 */
import {
  type CircuitContext,
  QueryContext,
  sampleContractAddress,
  createConstructorContext,
  CostModel,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  type Credential,
  type Ledger,
  ledger,
  pureCircuits,
} from './managed/zk-remit/contract/index.js';
import { type ZkRemitPrivateState, witnesses } from './witnesses.js';

export const COUNTRY = { UAE: 784n, INDIA: 356n, USA: 840n, PHILIPPINES: 608n, UK: 826n, NIGERIA: 566n } as const;
export const TIER = { BASIC: 1n, VERIFIED: 2n, ENHANCED: 3n } as const;

export const randomBytes = (n = 32): Uint8Array => {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
};

export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export class ZkRemitSimulator {
  readonly contract: Contract<ZkRemitPrivateState>;
  circuitContext: CircuitContext<ZkRemitPrivateState>;

  constructor(issuerSecret: Uint8Array) {
    this.contract = new Contract<ZkRemitPrivateState>(witnesses);
    const issuerPk = pureCircuits.issuerPublicKey(issuerSecret);
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext({ issuerSecret }, '0'.repeat(64)),
      issuerPk,
    );
    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(currentContractState.data, sampleContractAddress()),
    };
  }

  /** Switch the "device" (private state) executing the next circuit. */
  as(ps: ZkRemitPrivateState): this {
    this.circuitContext = { ...this.circuitContext, currentPrivateState: ps };
    return this;
  }

  get ledger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  issueCredential(commitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.issueCredential(this.circuitContext, commitment).context;
    return this.ledger;
  }

  openCorridor(from: bigint, to: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.openCorridor(this.circuitContext, from, to).context;
    return this.ledger;
  }

  closeCorridor(from: bigint, to: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.closeCorridor(this.circuitContext, from, to).context;
    return this.ledger;
  }

  advanceEpoch(): Ledger {
    this.circuitContext = this.contract.impureCircuits.advanceEpoch(this.circuitContext).context;
    return this.ledger;
  }

  sendRemittance(to: bigint, amountCents: bigint, salt: Uint8Array, slot: bigint, recipientTag: Uint8Array): Uint8Array {
    const r = this.contract.impureCircuits.sendRemittance(this.circuitContext, to, amountCents, salt, slot, recipientTag);
    this.circuitContext = r.context;
    return r.result;
  }

  claim(receiptId: Uint8Array, amountCents: bigint, salt: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.claim(this.circuitContext, receiptId, amountCents, salt).context;
    return this.ledger;
  }

  proveReceiptOwnership(receiptId: Uint8Array, challenge: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.proveReceiptOwnership(
      this.circuitContext,
      receiptId,
      challenge,
    ).context;
    return this.ledger;
  }
}

/** Off-chain issuance performed by the KYC attestor after verifying documents. */
export const makeCredential = (holderSecret: Uint8Array, tier: bigint, country: bigint, expiryEpoch: bigint): Credential => ({
  holderPk: pureCircuits.holderPublicKey(holderSecret),
  tier,
  country,
  expiryEpoch,
  salt: randomBytes(),
});
