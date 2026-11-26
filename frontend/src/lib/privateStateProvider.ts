/*
 * Browser private-state provider for ZK Remit (Midnight.js 5 interface: per-contract views via
 * forContract). Private state (secrets, credential, escrow openings) is scoped per contract address
 * and stored encrypted at rest (AES-GCM, non-extractable key; see secureStore.ts) with a bigint/Uint8Array-safe
 * codec. It never leaves the device.
 */
import type { PrivateStateId, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import { decode, encode } from './codec';
import { secureStore, type SecureStore } from './secureStore';

export const PRIVATE_STATE_PREFIX = 'zkremit:ps:';
const KEY = PRIVATE_STATE_PREFIX;

export const browserPrivateStateProvider = <PSI extends PrivateStateId, PS>(
  store: SecureStore = secureStore,
): PrivateStateProvider<PSI, PS> => {
  const signingKeys = new Map<string, unknown>();
  const load = async (a: string): Promise<Record<string, PS>> => (await store.get<Record<string, PS>>(KEY + a)) ?? {};
  const save = (a: string, v: Record<string, PS>) => store.set(KEY + a, v);
  const forContract = (a: string) => ({
    contractAddress: a,
    async set(k: PSI, s: PS) { const all = await load(a); all[k] = s; await save(a, all); },
    async get(k: PSI) { return (await load(a))[k] ?? null; },
    async remove(k: PSI) { const all = await load(a); delete all[k]; await save(a, all); },
    async clear() { await store.remove(KEY + a); },
    async exportPrivateStates() {
      return { format: 'midnight-private-state-export', encryptedPayload: encode(await load(a)), salt: 'zk-remit-local' };
    },
    async importPrivateStates(d: { encryptedPayload: string }) {
      const incoming = decode<Record<string, PS>>(d.encryptedPayload);
      await save(a, { ...(await load(a)), ...incoming });
      return { imported: Object.keys(incoming).length, skipped: 0, overwritten: 0 };
    },
  });
  const p = {
    forContract,
    async clearAll() {
      await store.removeAll(KEY);
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
