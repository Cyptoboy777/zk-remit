/*
 * Browser private-state provider for ZK Remit, adapted from midnightntwrk/example-bboard
 * (Apache-2.0). Private state (secrets + credential) is scoped per contract address and
 * persisted in localStorage with a bigint/Uint8Array-safe codec. It never leaves the device.
 */
import type { PrivateStateId, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import { decode, encode } from './codec';

const KEY = 'zkremit:ps:';

export const browserPrivateStateProvider = <PSI extends PrivateStateId, PS>(): PrivateStateProvider<PSI, PS> => {
  let address: string | null = null;
  const signingKeys = new Map<string, any>();
  const req = () => {
    if (!address) throw new Error('Contract address not set');
    return address;
  };
  const load = (a: string): Record<string, PS> => {
    const raw = localStorage.getItem(KEY + a);
    return raw ? decode<Record<string, PS>>(raw) : {};
  };
  const save = (a: string, v: Record<string, PS>) => localStorage.setItem(KEY + a, encode(v));
  const p: any = {
    setContractAddress(a: string) { address = a; },
    async set(k: PSI, s: PS) { const a = req(); const all = load(a); all[k] = s; save(a, all); },
    async get(k: PSI) { return load(req())[k] ?? null; },
    async remove(k: PSI) { const a = req(); const all = load(a); delete all[k]; save(a, all); },
    async clear() { localStorage.removeItem(KEY + req()); },
    async setSigningKey(a: string, k: any) { signingKeys.set(a, k); },
    async getSigningKey(a: string) { return signingKeys.get(a) ?? null; },
    async removeSigningKey(a: string) { signingKeys.delete(a); },
    async clearSigningKeys() { signingKeys.clear(); },
    async exportPrivateStates() {
      return { format: 'midnight-private-state-export', encryptedPayload: encode(load(req())), salt: 'zk-remit-local' };
    },
    async importPrivateStates(d: any) {
      const a = req(); const incoming = decode<Record<string, PS>>(d.encryptedPayload);
      save(a, { ...load(a), ...incoming });
      return { imported: Object.keys(incoming).length, skipped: 0, overwritten: 0 };
    },
    async exportSigningKeys() {
      return { format: 'midnight-signing-key-export', encryptedPayload: encode(Object.fromEntries(signingKeys)), salt: 'zk-remit-local' };
    },
    async importSigningKeys(d: any) {
      const keys = decode<Record<string, any>>(d.encryptedPayload);
      Object.entries(keys).forEach(([a, k]) => signingKeys.set(a, k));
      return { imported: Object.keys(keys).length, skipped: 0, overwritten: 0 };
    },
  };
  return p as PrivateStateProvider<PSI, PS>;
};
