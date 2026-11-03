import {
  ZkRemitSimulator,
  defaultPolicy,
  toHex,
  type ZkRemitPrivateState,
  type CorridorPolicy,
} from '@zk-remit/contract';
import { type Backend, type ShieldedCoin, snapshot } from './types';

export class SimulatorBackend implements Backend {
  readonly kind = 'simulator' as const;
  readonly label = 'In-browser Compact runtime (simulator · no wallet)';
  readonly sim: ZkRemitSimulator;
  constructor(governorSecret: Uint8Array) {
    this.sim = new ZkRemitSimulator(governorSecret);
  }
  async addIssuer(as: ZkRemitPrivateState, pk: Uint8Array) {
    this.sim.as(as).addIssuer(pk);
  }
  async issueCredential(as: ZkRemitPrivateState, c: Uint8Array) {
    this.sim.as(as).issueCredential(c);
  }
  async setCorridorPolicy(as: ZkRemitPrivateState, f: bigint, t: bigint, policy?: CorridorPolicy) {
    this.sim.as(as).setCorridorPolicy(f, t, policy ?? defaultPolicy());
  }
  async advanceEpoch(as: ZkRemitPrivateState) {
    this.sim.as(as).advanceEpoch();
  }
  async sendRemittance(
    as: ZkRemitPrivateState,
    to: bigint,
    slot: bigint,
    tag: Uint8Array,
    coin: ShieldedCoin,
    salt?: Uint8Array,
  ) {
    const receiptId = this.sim.as(as).sendRemittance(to, slot, tag, coin, salt);
    return { receiptId };
  }
  async claim(as: ZkRemitPrivateState, id: Uint8Array) {
    this.sim.as(as).claim(id);
    return {};
  }
  async reclaim(as: ZkRemitPrivateState, id: Uint8Array) {
    this.sim.as(as).reclaim(id);
    return {};
  }
  async proveReceiptOwnership(as: ZkRemitPrivateState, id: Uint8Array, ch: Uint8Array) {
    this.sim.as(as).proveReceiptOwnership(id, ch);
    return {};
  }
  async ledger() {
    return snapshot(this.sim.ledger);
  }
  getEscrow(receiptId: Uint8Array) {
    return this.sim.privateState.escrows?.[toHex(receiptId)];
  }
  withEscrow(
    as: ZkRemitPrivateState,
    receiptId: Uint8Array,
    opening: { coin: ShieldedCoin & { mt_index: bigint }; salt: Uint8Array },
  ) {
    this.sim.as(as).withEscrow(receiptId, opening);
  }
}
