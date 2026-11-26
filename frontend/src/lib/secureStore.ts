/*
 * Encrypted-at-rest storage for the secrets this app keeps on the device (holder secret, credential,
 * escrow openings, operator keys).
 *
 * Values are sealed with AES-GCM using a non-extractable WebCrypto key that lives in IndexedDB. The
 * browser will not hand the raw key bytes to any script, so a copy of the localStorage data (a backup,
 * a synced profile, a disk image) is unreadable without this browser profile's key.
 *
 * What this does NOT do: it cannot stop code running inside this page (an XSS) from asking the browser
 * to decrypt, which is why the page also ships a strict Content-Security-Policy. See SECURITY.md.
 *
 * If WebCrypto or IndexedDB is unavailable (some private modes), nothing is written to disk at all:
 * the data stays in memory for the session. We never fall back to plaintext.
 */
import { decode, encode } from './codec';

const PREFIX = 'zkremit:enc1:';
const DB = 'zkremit-keys';
const STORE = 'keys';
const KEY_ID = 'device-key-v1';

/** Where the CryptoKey lives. Injectable so tests need no browser. */
export interface KeyVault {
  get(): Promise<CryptoKey | null>;
  put(key: CryptoKey): Promise<void>;
}

/** Where sealed strings live. Matches the localStorage subset we use. */
export interface TextStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  keys(): string[];
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const indexedDbVault = (): KeyVault => {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  const run = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = f(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    get: async () => ((await run('readonly', (s) => s.get(KEY_ID))) as CryptoKey | undefined) ?? null,
    put: async (k) => {
      await run('readwrite', (s) => s.put(k, KEY_ID));
    },
  };
};

export const localTextStore = (): TextStore => ({
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
  keys: () => Object.keys(localStorage),
});

export class SecureStore {
  private keyPromise: Promise<CryptoKey | null> | null = null;
  private readonly memory = new Map<string, string>();

  constructor(
    private readonly vault: KeyVault = indexedDbVault(),
    private readonly text: TextStore = localTextStore(),
    private readonly subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle,
  ) {}

  private key(): Promise<CryptoKey | null> {
    this.keyPromise ??= (async () => {
      if (!this.subtle) return null;
      try {
        const existing = await this.vault.get();
        if (existing) return existing;
        const fresh = await this.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        await this.vault.put(fresh);
        return fresh;
      } catch {
        return null; // no durable key: stay in memory, never plaintext
      }
    })();
    return this.keyPromise;
  }

  /** True when values are really sealed on disk (false = memory only). */
  async durable(): Promise<boolean> {
    return (await this.key()) !== null;
  }

  async set(name: string, value: unknown): Promise<void> {
    const plain = encode(value);
    const key = await this.key();
    if (!key || !this.subtle) {
      this.memory.set(name, plain);
      return;
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await this.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(name) }, key, new TextEncoder().encode(plain)));
    try {
      this.text.setItem(PREFIX + name, `${b64(iv)}.${b64(ct)}`);
    } catch {
      this.memory.set(name, plain);
    }
  }

  async get<T>(name: string): Promise<T | null> {
    const mem = this.memory.get(name);
    if (mem !== undefined) return decode<T>(mem);
    const raw = this.text.getItem(PREFIX + name);
    if (!raw) return null;
    const key = await this.key();
    if (!key || !this.subtle) return null;
    try {
      const [iv, ct] = raw.split('.');
      const plain = await this.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(iv), additionalData: new TextEncoder().encode(name) },
        key,
        unb64(ct),
      );
      return decode<T>(new TextDecoder().decode(plain));
    } catch {
      return null; // wrong key, tampered or corrupt: treat as absent, never throw secrets into the UI
    }
  }

  async remove(name: string): Promise<void> {
    this.memory.delete(name);
    this.text.removeItem(PREFIX + name);
  }

  async removeAll(prefix = ''): Promise<void> {
    for (const k of [...this.memory.keys()]) if (k.startsWith(prefix)) this.memory.delete(k);
    for (const k of this.text.keys()) if (k.startsWith(PREFIX + prefix)) this.text.removeItem(k);
  }
}

/** Shared instance for the app. */
export const secureStore = new SecureStore();

/** Removes secrets an older build left in plaintext, re-sealing them. Safe to run on every start. */
export const migrateLegacy = async (store: SecureStore, text: TextStore, legacyKeys: string[]): Promise<number> => {
  let moved = 0;
  for (const k of text.keys()) {
    if (!legacyKeys.some((p) => k.startsWith(p))) continue;
    const raw = text.getItem(k);
    if (raw) {
      try {
        await store.set(k, decode(raw));
        moved++;
      } catch {
        /* unreadable legacy value: drop it below */
      }
    }
    text.removeItem(k);
  }
  return moved;
};
