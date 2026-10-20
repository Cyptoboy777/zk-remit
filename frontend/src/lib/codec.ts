// JSON codec that round-trips bigint and Uint8Array (for localStorage + payment links).
export const encode = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    typeof x === 'bigint' ? { $b: x.toString() } : x instanceof Uint8Array ? { $u: Array.from(x) } : x,
  );
export const decode = <T>(s: string): T =>
  JSON.parse(s, (_k, x) =>
    x && typeof x === 'object' && '$b' in x ? BigInt(x.$b) : x && typeof x === 'object' && '$u' in x ? new Uint8Array(x.$u) : x,
  ) as T;

export const fromHex = (h: string): Uint8Array => {
  const clean = h.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2) throw new Error('Invalid hex');
  return new Uint8Array(clean.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
};

export const toB64Url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64Url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
