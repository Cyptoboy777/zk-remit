/*
 * ZkRemitSimulator — executes compiled Wave 3 circuits via Compact runtime.
 */
import {
  type CircuitContext,
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext,
} from '@midnight-ntwrk/compact-runtime';

/** Coin public key used for simulated callers (any 32-byte hex works off-chain). */
const COIN_PK = '0'.repeat(64);
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

/** Per-call cap of mintTestSettlement, in cents. Must equal the literal in zk-remit.compact (a test checks it). */
export const TEST_MINT_CAP_CENTS = 100_000n;

export const freshCoin = (valueCents: bigint, color: Uint8Array = SETTLEMENT_COLOR) => ({
  nonce: randomBytes(),
  color: new Uint8Array(color),
  value: valueCents,
});

type Coin = { nonce: Uint8Array; color: Uint8Array; value: bigint };
type ImpureName = keyof Contract<ZkRemitPrivateState>['impureCircuits'];

/**
 * Runs the compiled circuits on the Compact runtime (0.21, ledger 9), with no network.
 * Circuits are async in this runtime, so every circuit method returns a Promise. `as()` and
 * `withEscrow()` only change local private state and stay synchronous for easy chaining.
 */
export class ZkRemitSimulator {
  contract: Contract<ZkRemitPrivateState>;
  readonly settlementColor: Uint8Array;
  readonly contractAddress = sampleContractAddress();
  /** Resolves once the constructor has run. Every circuit call awaits it. */
  readonly ready: Promise<void>;
  /** Context returned by the most recent circuit call (zswap inputs/outputs, gas, trace). */
  lastContext: CircuitContext<ZkRemitPrivateState> | undefined;
  private ledgerState: unknown;
  private ps: ZkRemitPrivateState;
  /**
   * Simulated position of the next escrow coin in the coin tree. The real chain assigns the index
   * when the transaction is applied; here each escrow takes the next slot so tests exercise a
   * non-zero index end to end.
   */
  private nextEscrowIndex = 0n;

  constructor(governorSecret: Uint8Array, settlementColor: Uint8Array = SETTLEMENT_COLOR) {
    this.settlementColor = new Uint8Array(settlementColor);
    this.contract = new Contract<ZkRemitPrivateState>(witnesses);
    this.ps = { governorSecret };
    const governorPk = pureCircuits.governorPublicKey(governorSecret);
    this.ready = this.contract
      .initialState(createConstructorContext({ governorSecret }, COIN_PK), governorPk, this.settlementColor)
      .then((r) => {
        this.ledgerState = r.currentContractState;
        this.ps = { ...r.currentPrivateState, ...this.ps };
      });
  }

  /**
   * Test hook: replace some witnesses with dishonest ones, to prove the circuit guards (not just
   * an honest client) are what stops a forged Merkle path or a foreign credential. Call
   * `honestWitnesses()` to undo. Never used by the app.
   */
  withWitnesses(overrides: Partial<typeof witnesses>) {
    this.contract = new Contract<ZkRemitPrivateState>({ ...witnesses, ...overrides } as typeof witnesses);
    return this;
  }
  honestWitnesses() {
    this.contract = new Contract<ZkRemitPrivateState>(witnesses);
    return this;
  }

  /** Convenience: construct and wait for the constructor. */
  static async create(governorSecret: Uint8Array, settlementColor?: Uint8Array) {
    const sim = new ZkRemitSimulator(governorSecret, settlementColor);
    await sim.ready;
    return sim;
  }

  as(ps: ZkRemitPrivateState): this {
    this.ps = { ...this.ps, ...ps };
    return this;
  }

  get privateState(): ZkRemitPrivateState {
    return this.ps;
  }

  get ledger(): Ledger {
    if (this.ledgerState === undefined) throw new Error('ZK Remit simulator is still starting');
    const st = this.ledgerState as { data?: unknown };
    return ledger((st.data ?? st) as Parameters<typeof ledger>[0]);
  }

  private async exec<R = unknown>(name: ImpureName, ...args: unknown[]): Promise<R> {
    await this.ready;
    const ctx = createCircuitContext<ZkRemitPrivateState>({
      circuitId: name as string,
      contractAddress: this.contractAddress,
      coinPublicKeyOrZswapState: COIN_PK,
      contractState: this.ledgerState as Parameters<typeof createCircuitContext>[0]['contractState'],
      privateState: this.ps,
    });
    const fn = this.contract.impureCircuits[name] as unknown as (
      c: CircuitContext<ZkRemitPrivateState>,
      ...a: unknown[]
    ) => Promise<{ result: R; context: CircuitContext<ZkRemitPrivateState> }>;
    const r = await fn(ctx, ...args);
    this.lastContext = r.context;
    this.ledgerState = r.context.callContext.currentQueryContext.state;
    this.ps = (r.context.callContext.currentPrivateState ?? this.ps) as ZkRemitPrivateState;
    return r.result;
  }

  /** Coins this call consumed (each with the tree index it spent). */
  get lastSpent() {
    return this.lastContext?.callContext.currentZswapLocalState?.inputs ?? [];
  }

  async addIssuer(pk: Uint8Array) { await this.exec('addIssuer', pk); return this.ledger; }
  async revokeIssuer(pk: Uint8Array) { await this.exec('revokeIssuer', pk); return this.ledger; }
  async issueCredential(commitment: Uint8Array) { await this.exec('issueCredential', commitment); return this.ledger; }
  async setCorridorPolicy(from: bigint, to: bigint, policy: CorridorPolicy = defaultPolicy()) {
    await this.exec('setCorridorPolicy', from, to, policy);
    return this.ledger;
  }
  async closeCorridor(from: bigint, to: bigint) { await this.exec('closeCorridor', from, to); return this.ledger; }
  async advanceEpoch() { await this.exec('advanceEpoch'); return this.ledger; }
  /** Governor only. Preview/test deployments only. */
  async enableTestMint() { await this.exec('enableTestMint'); return this.ledger; }
  /** Preview-only test funds: mints shielded settlement tokens to the caller, capped per call. */
  async mintTestSettlement(amount: bigint, nonce: Uint8Array = randomBytes()) {
    this.ps = { ...this.ps, mintNonceValue: nonce };
    await this.exec('mintTestSettlement', amount);
    return this.ledger;
  }

  async sendRemittance(to: bigint, slot: bigint, recipientTag: Uint8Array, coin: Coin, escrowSaltValue?: Uint8Array): Promise<Uint8Array> {
    const salt = escrowSaltValue ?? randomBytes();
    this.ps = { ...this.ps, escrowSaltValue: salt };
    const id = await this.exec<Uint8Array>('sendRemittance', to, slot, recipientTag, coin);
    const opening: EscrowRecord = {
      coin: { nonce: coin.nonce, color: coin.color, value: coin.value, mt_index: this.nextEscrowIndex++ },
      salt,
    };
    this.ps = { ...this.ps, escrows: { ...(this.ps.escrows ?? {}), [toHex(id)]: opening }, escrowSaltValue: salt };
    return id;
  }

  /** Share an escrow opening with another private state (claim link). */
  withEscrow(receiptId: Uint8Array, opening: EscrowRecord): this {
    this.ps = { ...this.ps, escrows: { ...(this.ps.escrows ?? {}), [toHex(receiptId)]: opening } };
    return this;
  }

  async claim(receiptId: Uint8Array) { await this.exec('claim', receiptId); return this.ledger; }
  async reclaim(receiptId: Uint8Array) { await this.exec('reclaim', receiptId); return this.ledger; }
  async proveReceiptOwnership(receiptId: Uint8Array, challenge: Uint8Array) {
    await this.exec('proveReceiptOwnership', receiptId, challenge);
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
