/*
 * Midnight network backend: Lace + Midnight.js 4.1.
 * Deploy/call requires a real contract address (VITE_CONTRACT_ADDRESS) and user wallet.
 * Never invents addresses or transaction hashes.
 */
import semver from 'semver';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { ZkRemitPrivateState } from '@zk-remit/contract';
import type { Backend, ShieldedCoin } from './types';

export const NETWORK_ID = (import.meta.env.VITE_NETWORK_ID as string) || 'preview';
export const CONFIGURED_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined)?.trim() || '';

export const detectLace = (): InitialAPI | undefined => {
  const m = (window as unknown as { midnight?: Record<string, InitialAPI> }).midnight;
  if (!m) return undefined;
  return Object.values(m).find((w) => !!w && typeof w === 'object' && 'apiVersion' in w && semver.satisfies(w.apiVersion, '4.x'));
};

export const connectLace = async () => {
  let initial: InitialAPI | undefined;
  for (let i = 0; i < 30 && !initial; i++) {
    initial = detectLace();
    if (!initial) await new Promise((r) => setTimeout(r, 100));
  }
  if (!initial) throw new Error('Midnight Lace wallet (DApp Connector v4) not found.');
  setNetworkId(NETWORK_ID as 'preview');
  const api = await initial.connect(NETWORK_ID);
  const addrs = await api.getShieldedAddresses();
  return { name: (initial as { name?: string }).name ?? 'Lace', apiVersion: initial.apiVersion, shieldedAddress: addrs.shieldedAddress, api };
};

/** Placeholder until the user deploys and sets VITE_CONTRACT_ADDRESS. */
export class MidnightBackend implements Backend {
  readonly kind = 'midnight' as const;
  readonly label: string;
  readonly contractAddress?: string;
  constructor(address?: string) {
    this.contractAddress = address || CONFIGURED_ADDRESS || undefined;
    this.label = this.contractAddress
      ? `Midnight ${NETWORK_ID} · ${this.contractAddress.slice(0, 12)}…`
      : `Midnight ${NETWORK_ID} · not deployed`;
  }
  private needDeployed(): never {
    throw new Error(
      'No contract address configured. Deploy on Preview (see user-deploy-steps.md), then set VITE_CONTRACT_ADDRESS. We never invent addresses.',
    );
  }
  async addIssuer(_as: ZkRemitPrivateState, _pk: Uint8Array): Promise<void> { this.needDeployed(); }
  async issueCredential(_as: ZkRemitPrivateState, _c: Uint8Array): Promise<void> { this.needDeployed(); }
  async setCorridorPolicy(_as: ZkRemitPrivateState, _f: bigint, _t: bigint): Promise<void> { this.needDeployed(); }
  async advanceEpoch(_as: ZkRemitPrivateState): Promise<void> { this.needDeployed(); }
  async sendRemittance(
    _as: ZkRemitPrivateState,
    _to: bigint,
    _slot: bigint,
    _tag: Uint8Array,
    _coin: ShieldedCoin,
  ): Promise<{ receiptId: Uint8Array }> {
    this.needDeployed();
  }
  async claim(_as: ZkRemitPrivateState, _id: Uint8Array): Promise<{ txHash?: string }> { this.needDeployed(); }
  async reclaim(_as: ZkRemitPrivateState, _id: Uint8Array): Promise<{ txHash?: string }> { this.needDeployed(); }
  async proveReceiptOwnership(_as: ZkRemitPrivateState, _id: Uint8Array, _ch: Uint8Array): Promise<{ txHash?: string }> { this.needDeployed(); }
  async ledger(): Promise<import('./types').LedgerSnapshot> { this.needDeployed(); }
}
