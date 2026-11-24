/*
 * Browser private-state provider for ZK Remit (Midnight.js 5 interface: per-contract views via
 * forContract). Private state (secrets, credential, escrow openings) is scoped per contract address
 * and persisted in localStorage with a bigint/Uint8Array-safe codec. It never leaves the device.
 */
import type { PrivateStateId, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import { decode, encode } from './codec';

const KEY = 'zkremit:ps:';

export const browserPrivateStateProvider = <PSI extends PrivateStateId, PS>(): PrivateStateProvider<PSI, PS> => {
  const signingKeys = new Map<string, unknown>();
  const load = (a: string): Record<string, PS> => {
    const raw = localStorage.getItem(KEY + a);
    return raw ? decode<Record<string, PS>>(raw) : {};
  };
  const save = (a: string, v: Record<string, PS>) => localStorage.setItem(KEY + a, encode(v));
  const forContract = (a: string) => ({
    contractAddress: a,
    async set(k: PSI, s: PS) { const all = load(a); all[k] = s; save(a, all); },
    async get(k: PSI) { return load(a)[k] ?? null; },
    async remove(k: PSI) { const all = load(a); delete all[k]; save(a, all); },
    async clear() { localStorage.removeItem(KEY + a); },
    async exportPrivateStates() {
      return { format: 'midnight-private-state-export', encryptedPayload: encode(load(a)), salt: 'zk-remit-local' };
    },
    async importPrivateStates(d: { encryptedPayload: string }) {
      const incoming = decode<Record<string, PS>>(d.encryptedPayload);
      save(a, { ...load(a), ...incoming });
      return { imported: Object.keys(incoming).length, skipped: 0, overwritten: 0 };
    },
  });
  const p = {
    forContract,
    async clearAll() {
      Object.keys(localStorage).filter((k) => k.startsWith(KEY)).forEach((k) => localStorage.removeItem(k));
    },
    async setSigningKey(a: string, k: unknown) { signingKeys.set(a, k); },
    async getSigningKey(a: string) { return signingKeys.get(a) ?? null; },
    async removeSigningKey(a: string) { signingKeys.delete(a); },
    async clearSigningKeys() { signingKeys.clear(); },
    async exportSigningKeys() {
      return { format: 'midnight-signing-key-export', encryptedPayload: encode(Object.fromEntries(signingKeys)), salt: 'zk-remit-local' };
    },
    async importSigningKeys(d: { encryptedPayload: string }) {
      const keys = decode<Record<string, unknown>>(d.encryptedPayload);
      Object.entries(keys).forEach(([a, k]) => signingKeys.set(a, k));
      return { imported: Object.keys(keys).length, skipped: 0, overwritten: 0 };
    },
  };
  return p as unknown as PrivateStateProvider<PSI, PS>;
};
