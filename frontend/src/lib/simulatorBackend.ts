import { ZkRemitSimulator, type ZkRemitPrivateState } from '@zk-remit/contract';
import { type Backend, snapshot } from './types';

/** Runs the compiled Compact circuits in the browser via @midnight-ntwrk/compact-runtime. */
export class SimulatorBackend implements Backend {
  readonly kind = 'simulator' as const;
  readonly label = 'In-browser Compact runtime (no wallet needed)';
  readonly sim: ZkRemitSimulator;
  constructor(issuerSecret: Uint8Array) {
    this.sim = new ZkRemitSimulator(issuerSecret);
  }
  async issueCredential(as: ZkRemitPrivateState, c: Uint8Array) { this.sim.as(as).issueCredential(c); }
  async openCorridor(as: ZkRemitPrivateState, f: bigint, t: bigint) { this.sim.as(as).openCorridor(f, t); }
  async advanceEpoch(as: ZkRemitPrivateState) { this.sim.as(as).advanceEpoch(); }
  async sendRemittance(as: ZkRemitPrivateState, to: bigint, a: bigint, s: Uint8Array, slot: bigint, tag: Uint8Array) {
    this.sim.as(as).sendRemittance(to, a, s, slot, tag);
    return {};
  }
  async claim(as: ZkRemitPrivateState, id: Uint8Array, a: bigint, s: Uint8Array) {
    this.sim.as(as).claim(id, a, s);
    return {};
  }
  async proveReceiptOwnership(as: ZkRemitPrivateState, id: Uint8Array, ch: Uint8Array) {
    this.sim.as(as).proveReceiptOwnership(id, ch);
    return {};
  }
  async ledger() { return snapshot(this.sim.ledger); }
}
