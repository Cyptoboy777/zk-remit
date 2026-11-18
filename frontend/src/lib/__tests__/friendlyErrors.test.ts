import { describe, it, expect } from 'vitest';
import { MidnightProblem, cleanContractMessage, friendlyError, friendlyLine } from '../friendlyErrors';

describe('friendly errors', () => {
  it('maps typed problems to plain-language copy', () => {
    expect(friendlyError(new MidnightProblem('lace-missing')).title).toMatch(/Lace/);
    expect(friendlyError(new MidnightProblem('wrong-network')).body).toMatch(/Preview/);
    expect(friendlyError(new MidnightProblem('no-dust')).body).toMatch(/tDUST/);
    expect(friendlyError(new MidnightProblem('no-settlement')).title).toMatch(/settlement/i);
    expect(friendlyError(new MidnightProblem('operator-key')).body).toMatch(/Issuer tab/);
  });

  it('passes through only the contract rule text', () => {
    expect(cleanContractMessage('Error: ZKR: corridor not approved\n    at foo (file.js:1:1)')).toBe('Corridor not approved');
    const f = friendlyError(new Error('failed assert: ZKR: amount exceeds tier limit'));
    expect(f.problem).toBe('contract');
    expect(f.body).toBe('Amount exceeds tier limit.');
  });

  it('classifies wallet rejection, proof server and network failures', () => {
    expect(friendlyError(new Error('User rejected the request')).problem).toBe('rejected');
    expect(friendlyError(new Error('proof server returned 500')).problem).toBe('proof');
    expect(friendlyError(new Error('WebSocket connection failed')).problem).toBe('network');
  });

  it('never leaks stack traces, urls or env names for unknown errors', () => {
    const e = new Error('boom at http://localhost:6300/prove (VITE_CONTRACT_ADDRESS) \n at stack');
    const text = JSON.stringify(friendlyError(e)) + friendlyLine(e);
    expect(text).not.toMatch(/http|VITE_|stack|localhost|\bat \w/i);
  });

  it('falls back to a generic message for non-Error values', () => {
    expect(friendlyError(undefined).problem).toBe('unknown');
    expect(friendlyError({ weird: true }).problem).toBe('unknown');
  });
});
