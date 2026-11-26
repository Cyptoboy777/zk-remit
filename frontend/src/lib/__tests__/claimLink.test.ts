import { describe, it, expect } from 'vitest';
import {
  buildClaimHash,
  buildClaimLink,
  clearClaimFromUrl,
  freshRecipientSecret,
  isValidPayload,
  parseClaimHash,
  scrubPayload,
  type ClaimPayload,
} from '../claimLink';

const h = (c: string) => c.repeat(64);
const payload: ClaimPayload = {
  v: 3,
  receiptId: h('a'),
  coin: { nonce: h('b'), color: h('c'), value: '42000' },
  salt: h('d'),
  recipientSecret: h('e'),
  network: 'preview',
};

describe('claim link', () => {
  it('keeps every secret in the fragment, never in the path or query', () => {
    const link = buildClaimLink('https://app.example', '/pay/', payload);
    const url = new URL(link);
    expect(url.search).toBe('');
    expect(url.pathname).toBe('/pay/');
    expect(url.hash.startsWith('#claim=')).toBe(true);
    expect(link.split('#')[0]).not.toMatch(new RegExp(`${h('e')}|${h('d')}`));
  });

  it('round-trips and rejects malformed or tampered payloads', () => {
    expect(parseClaimHash(buildClaimHash(payload))).toEqual(payload);
    expect(parseClaimHash('#claim=%%%')).toBeNull();
    expect(parseClaimHash('?claim=abc')).toBeNull();
    expect(parseClaimHash(`${buildClaimHash(payload)}&x=1`)).toBeNull();
    expect(isValidPayload({ ...payload, recipientSecret: 'short' })).toBe(false);
    expect(isValidPayload({ ...payload, coin: { ...payload.coin, value: '-1' } })).toBe(false);
    expect(isValidPayload({ ...payload, network: 'mainnet' })).toBe(false);
    expect(isValidPayload({ ...payload, v: 2 })).toBe(false);
  });

  it('scrubs secrets from memory after use', () => {
    const s = scrubPayload(payload);
    expect(s.recipientSecret).toBe(h('0'));
    expect(s.salt).toBe(h('0'));
    expect(s.coin.nonce).toBe(h('0'));
    expect(s.receiptId).toBe(payload.receiptId);
  });

  it('removes the claim from the address bar without reloading, and leaves other URLs alone', () => {
    const calls: unknown[][] = [];
    const hist = { state: { k: 1 }, replaceState: (...a: unknown[]) => void calls.push(a) } as unknown as History;
    expect(clearClaimFromUrl({ pathname: '/pay/', search: '?lang=en', hash: buildClaimHash(payload) }, hist)).toBe(true);
    expect(calls).toEqual([[{ k: 1 }, '', '/pay/?lang=en']]);
    expect(clearClaimFromUrl({ pathname: '/', search: '', hash: '#other' }, hist)).toBe(false);
    expect(calls.length).toBe(1);
  });

  it('gives every transfer its own recipient secret, so public tags are unlinkable', () => {
    const seen = new Set(Array.from({ length: 50 }, () => Array.from(freshRecipientSecret()).join(',')));
    expect(seen.size).toBe(50);
    expect(freshRecipientSecret().length).toBe(32);
  });
});
