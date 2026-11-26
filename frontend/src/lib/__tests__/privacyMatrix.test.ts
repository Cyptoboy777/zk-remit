import { describe, it, expect } from 'vitest';
import { PRIVACY, bandOfCents, privacyFor } from '../privacyMatrix';
import { amountBandOf } from '../disclosure';

describe('privacy matrix', () => {
  it('covers every action with both a public and a private side', () => {
    expect(PRIVACY.map((a) => a.id)).toEqual(['issue', 'send', 'claim', 'reclaim', 'audit']);
    for (const a of PRIVACY) {
      expect(a.public.length).toBeGreaterThan(0);
      expect(a.private.length).toBeGreaterThan(0);
    }
  });

  it('never lists the exact amount, identity or secrets as public', () => {
    const publicText = PRIVACY.flatMap((a) => a.public.map((r) => r.what)).join(' ').toLowerCase();
    expect(publicText).not.toMatch(/exact amount|your name|holder secret|claim secret|who you are/);
  });

  it('always keeps the exact amount private where value moves', () => {
    for (const id of ['send', 'claim', 'reclaim', 'audit'] as const) {
      expect(privacyFor(id).private.some((r) => /exact amount/i.test(r.what))).toBe(true);
    }
  });

  it('uses the same band edges as the disclosure helper (and so the contract)', () => {
    for (const cents of [1, 10000, 10001, 50000, 50001, 100000, 100001, 500000]) {
      expect(bandOfCents(cents)).toBe(amountBandOf(cents));
    }
  });
});
