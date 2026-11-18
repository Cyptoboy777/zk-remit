import { describe, it, expect } from 'vitest';
import { parseDeployment, resolveDeployment, loadDeployment } from '../deployment';
import { availableModes, defaultMode, modeLabel, pickMode } from '../backendSelect';

const ADDR = 'ab'.repeat(32);

describe('deployment.json loading', () => {
  it('rejects the placeholder record shipped before any deployment', () => {
    expect(parseDeployment({ network: 'preview', contractAddress: null, deployedAt: null })).toBeNull();
  });

  it('rejects empty, malformed and non-object input', () => {
    expect(parseDeployment(undefined)).toBeNull();
    expect(parseDeployment('0x1234')).toBeNull();
    expect(parseDeployment({ contractAddress: '' })).toBeNull();
    expect(parseDeployment({ contractAddress: 'not-an-address' })).toBeNull();
    expect(parseDeployment({ contractAddress: 123 })).toBeNull();
  });

  it('accepts a real-looking record and trims it', () => {
    const d = parseDeployment({ network: 'preview', contractAddress: ` ${ADDR} `, deployedAt: '2026-11-20T10:00:00.000Z' });
    expect(d).toEqual({ network: 'preview', contractAddress: ADDR, deployedAt: '2026-11-20T10:00:00.000Z' });
  });

  it('defaults the network to preview when missing', () => {
    expect(parseDeployment({ contractAddress: ADDR })?.network).toBe('preview');
  });

  it('prefers deployment.json over the override, and falls back to the override', () => {
    const other = 'cd'.repeat(32);
    expect(resolveDeployment({ contractAddress: ADDR }, other)?.contractAddress).toBe(ADDR);
    expect(resolveDeployment({ contractAddress: null }, other)?.contractAddress).toBe(other);
    expect(resolveDeployment({ contractAddress: null }, '')).toBeNull();
    expect(resolveDeployment({ contractAddress: null }, 'junk')).toBeNull();
  });

  it('the committed deployment.json holds no fabricated address', () => {
    // Before `npm run deploy:preview` runs, the app must not believe it is deployed.
    const d = loadDeployment();
    if (d) expect(d.contractAddress).toMatch(/^[0-9a-fA-F]{40,128}$/);
    else expect(d).toBeNull();
  });
});

describe('backend selection', () => {
  const dep = { network: 'preview', contractAddress: ADDR, deployedAt: '' };

  it('defaults to the simulator when nothing is deployed', () => {
    expect(defaultMode(null)).toBe('simulator');
    expect(availableModes(null)).toEqual(['simulator']);
  });

  it('defaults to Midnight Preview when a deployment exists, with the simulator as fallback', () => {
    expect(defaultMode(dep)).toBe('preview');
    expect(availableModes(dep)).toEqual(['preview', 'simulator']);
  });

  it('honours the simulator toggle but never offers Preview without a deployment', () => {
    expect(pickMode('simulator', dep)).toBe('simulator');
    expect(pickMode('preview', dep)).toBe('preview');
    expect(pickMode('preview', null)).toBe('simulator');
    expect(pickMode(null, dep)).toBe('preview');
  });

  it('labels modes in plain language', () => {
    expect(modeLabel('preview')).toBe('Midnight Preview');
    expect(modeLabel('simulator')).toBe('Simulator');
  });
});
