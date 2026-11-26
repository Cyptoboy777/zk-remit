import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP_DIRECTIVES, SECURITY_HEADERS, cspString } from '../../../csp.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === '__tests__' ? [] : walk(p)) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });

describe('content security policy', () => {
  it('allows no remote or inline scripts and no plugins', () => {
    expect(CSP_DIRECTIVES['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(CSP_DIRECTIVES['object-src']).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES['base-uri']).toEqual(["'none'"]);
    expect(cspString()).not.toMatch(/unsafe-eval(?!')|script-src[^;]*unsafe-inline/);
  });

  it('vercel.json serves exactly the same headers', () => {
    const v = JSON.parse(readFileSync(join(root, '../vercel.json'), 'utf8'));
    const served = Object.fromEntries(v.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    expect(served).toEqual(SECURITY_HEADERS);
    expect(served['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(served['Referrer-Policy']).toBe('no-referrer');
  });
});

describe('source hygiene', () => {
  const files = walk(join(root, 'src'));

  it('never writes to the console, so secrets and raw errors cannot be logged', () => {
    const offenders = files.filter((f) => /\bconsole\.(log|debug|info|warn|error|trace)\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps secrets out of plaintext browser storage and analytics', () => {
    const allowed = new Set(['secureStore.ts']);
    const offenders = files.filter(
      (f) => !allowed.has(f.split('/').pop()!) && /\b(localStorage|sessionStorage)\b/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
    expect(files.filter((f) => /\b(gtag|analytics|sendBeacon|XMLHttpRequest)\b/.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('shows no host or repository names in the app UI', () => {
    const ui = files.filter((f) => /\.tsx$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(ui).not.toMatch(/vercel|github/i);
  });
});
