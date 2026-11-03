/*
 * ZkRemitSimulator — executes compiled Wave 3 circuits via Compact runtime.
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
  type CorridorPolicy,
  type Ledger,
  ledger,
  pureCircuits,
  ReceiptStatus,
} from './managed/zk-remit/contract/index.js';
import { type EscrowRecord, type ZkRemitPrivateState, witnesses } from './witnesses.js';

export { ReceiptStatus };

export const COUNTRY = {
  UAE: 784n,
  INDIA: 356n,
  USA: 840n,
  PHILIPPINES: 608n,
  UK: 826n,
  NIGERIA: 566n,
  MEXICO: 484n,
  GERMANY: 276n,
  TURKIYE: 792n,
  SINGAPORE: 702n,
  INDONESIA: 360n,
  SAUDI: 682n,
  PAKISTAN: 586n,
  SPAIN: 724n,
  COLOMBIA: 170n,
} as const;

export const TIER = { BASIC: 1n, VERIFIED: 2n, ENHANCED: 3n } as const;

export const SETTLEMENT_COLOR = new Uint8Array(32).fill(0x7a); // demo tUSD colour

export const randomBytes = (n = 32): Uint8Array => {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
};

export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export const defaultPolicy = (overrides: Partial<CorridorPolicy> = {}): CorridorPolicy => ({
  open: true,
  maxBand: 3n,
  capT1: 20000n,
  capT2: 100000n,
  capT3: 500000n,
  slotsT1: 3n,
  slotsT2: 8n,
  slotsT3: 20n,
  claimWindow: 2n,
  ...overrides,
});

export const freshCoin = (valueCents: bigint, color: Uint8Array = SETTLEMENT_COLOR) => ({
  nonce: randomBytes(),
  color: new Uint8Array(color),
  value: valueCents,
});

export class ZkRemitSimulator {
  readonly contract: Contract<ZkRemitPrivateState>;
  circuitContext: CircuitContext<ZkRemitPrivateState>;
  readonly settlementColor: Uint8Array;

  constructor(governorSecret: Uint8Array, settlementColor: Uint8Array = SETTLEMENT_COLOR) {
    this.settlementColor = new Uint8Array(settlementColor);
    this.contract = new Contract<ZkRemitPrivateState>(witnesses);
    const governorPk = pureCircuits.governorPublicKey(governorSecret);
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext({ governorSecret }, '0'.repeat(64)),
      governorPk,
      this.settlementColor,
    );
    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(currentContractState.data, sampleContractAddress()),
    };
  }

  as(ps: ZkRemitPrivateState): this {
    this.circuitContext = { ...this.circuitContext, currentPrivateState: { ...this.circuitContext.currentPrivateState, ...ps } };
    return this;
  }

  get privateState(): ZkRemitPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  get ledger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  addIssuer(pk: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.addIssuer(this.circuitContext, pk).context;
    return this.ledger;
  }

  revokeIssuer(pk: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.revokeIssuer(this.circuitContext, pk).context;
    return this.ledger;
  }

  issueCredential(commitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.issueCredential(this.circuitContext, commitment).context;
    return this.ledger;
  }

  setCorridorPolicy(from: bigint, to: bigint, policy: CorridorPolicy = defaultPolicy()): Ledger {
    this.circuitContext = this.contract.impureCircuits.setCorridorPolicy(this.circuitContext, from, to, policy).context;
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

  sendRemittance(
    to: bigint,
    slot: bigint,
    recipientTag: Uint8Array,
    coin: { nonce: Uint8Array; color: Uint8Array; value: bigint },
    escrowSaltValue?: Uint8Array,
  ): Uint8Array {
    const salt = escrowSaltValue ?? randomBytes();
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: { ...this.circuitContext.currentPrivateState, escrowSaltValue: salt },
    };
    const r = this.contract.impureCircuits.sendRemittance(this.circuitContext, to, slot, recipientTag, coin);
    this.circuitContext = r.context;
    const id = r.result;
    const opening: EscrowRecord = {
      coin: { nonce: coin.nonce, color: coin.color, value: coin.value, mt_index: 0n },
      salt,
    };
    const escrows = { ...(this.circuitContext.currentPrivateState.escrows ?? {}), [toHex(id)]: opening };
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: { ...this.circuitContext.currentPrivateState, escrows, escrowSaltValue: salt },
    };
    return id;
  }

  /** Share an escrow opening with another private state (claim link). */
  withEscrow(receiptId: Uint8Array, opening: EscrowRecord): this {
    const escrows = { ...(this.circuitContext.currentPrivateState.escrows ?? {}), [toHex(receiptId)]: opening };
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: { ...this.circuitContext.currentPrivateState, escrows },
    };
    return this;
  }

  claim(receiptId: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.claim(this.circuitContext, receiptId).context;
    return this.ledger;
  }

  reclaim(receiptId: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.reclaim(this.circuitContext, receiptId).context;
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

export const makeCredential = (
  holderSecret: Uint8Array,
  issuerPk: Uint8Array,
  tier: bigint,
  country: bigint,
  expiryEpoch: bigint,
): Credential => ({
  holderPk: pureCircuits.holderPublicKey(holderSecret),
  issuerPk,
  tier,
  country,
  expiryEpoch,
  salt: randomBytes(),
});
