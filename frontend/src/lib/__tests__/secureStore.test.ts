import { describe, it, expect } from 'vitest';
import { SecureStore, migrateLegacy, type KeyVault, type TextStore } from '../secureStore';
import { encode } from '../codec';

const memText = (): TextStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    keys: () => [...data.keys()],
  };
};
const memVault = (): KeyVault => {
  let k: CryptoKey | null = null;
  return { get: async () => k, put: async (x) => void (k = x) };
};
const secret = { holderSecret: new Uint8Array(32).fill(7), amount: 12345n };

describe('secure store', () => {
  it('never writes the secret in readable form', async () => {
    const text = memText();
    const s = new SecureStore(memVault(), text);
    await s.set('zkremit:ps:abc', secret);
    const stored = [...text.data.values()].join('|');
    expect(stored).not.toMatch(/holderSecret|\$u|\$b|12345|7,7,7/);
    expect(await s.durable()).toBe(true);
  });

  it('round-trips bigint and bytes', async () => {
    const s = new SecureStore(memVault(), memText());
    await s.set('k', secret);
    const back = await s.get<typeof secret>('k');
    expect(back?.amount).toBe(12345n);
    expect(back?.holderSecret).toEqual(secret.holderSecret);
  });

  it('cannot be read with a different key, and tampering is rejected', async () => {
    const text = memText();
    await new SecureStore(memVault(), text).set('k', secret);
    expect(await new SecureStore(memVault(), text).get('k')).toBeNull(); // other device key
    const same = new SecureStore(memVault(), text);
    await same.set('k2', secret);
    const name = [...text.data.keys()].find((x) => x.endsWith('k2'))!;
    const [iv, ct] = text.data.get(name)!.split('.');
    text.data.set(name, `${iv}.${ct.slice(0, -4)}AAAA`);
    expect(await same.get('k2')).toBeNull();
  });

  it('a value sealed under one name cannot be replayed under another', async () => {
    const text = memText();
    const s = new SecureStore(memVault(), text);
    await s.set('a', secret);
    const [k] = [...text.data.keys()];
    text.data.set(k.replace(/a$/, 'b'), text.data.get(k)!);
    expect(await s.get('b')).toBeNull();
  });

  it('stays in memory, never plaintext, when no durable key exists', async () => {
    const text = memText();
    const noVault: KeyVault = { get: async () => { throw new Error('blocked'); }, put: async () => { throw new Error('blocked'); } };
    const s = new SecureStore(noVault, text);
    await s.set('k', secret);
    expect(text.data.size).toBe(0);
    expect(await s.durable()).toBe(false);
    expect((await s.get<typeof secret>('k'))?.amount).toBe(12345n);
  });

  it('migrates old plaintext entries into sealed storage and removes them', async () => {
    const text = memText();
    text.data.set('zkremit:persona:abc', encode({ sender: { holderSecret: new Uint8Array(32).fill(9) } }));
    text.data.set('unrelated', 'keep');
    const s = new SecureStore(memVault(), text);
    expect(await migrateLegacy(s, text, ['zkremit:persona:'])).toBe(1);
    expect(text.data.has('zkremit:persona:abc')).toBe(false);
    expect(text.data.get('unrelated')).toBe('keep');
    expect((await s.get<{ sender: { holderSecret: Uint8Array } }>('zkremit:persona:abc'))?.sender.holderSecret[0]).toBe(9);
  });
});
