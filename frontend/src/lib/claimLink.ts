import QRCode from 'qrcode';
import { encode, decode, toB64Url, fromB64Url } from './codec';

export type ClaimPayload = {
  v: 3;
  receiptId: string;
  coin: { nonce: string; color: string; value: string };
  salt: string;
  recipientSecret: string;
  network: string;
};

export function buildClaimHash(p: ClaimPayload): string {
  return `#claim=${toB64Url(encode(p))}`;
}

const HEX64 = /^[0-9a-f]{64}$/;
const DIGITS = /^[0-9]{1,20}$/;

/** True only for a fully well-formed payload. Anything else is treated as "no claim link". */
export function isValidPayload(p: unknown): p is ClaimPayload {
  const x = p as ClaimPayload | null;
  return (
    !!x &&
    x.v === 3 &&
    HEX64.test(x.receiptId) &&
    HEX64.test(x.coin?.nonce) &&
    HEX64.test(x.coin?.color) &&
    DIGITS.test(x.coin?.value) &&
    HEX64.test(x.salt) &&
    HEX64.test(x.recipientSecret) &&
    (x.network === 'preview' || x.network === 'simulator')
  );
}

/** The secret lives only in the URL fragment (#...), which browsers never send to any server or referrer. */
export function parseClaimHash(hash: string): ClaimPayload | null {
  const m = hash.match(/^#claim=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const p = decode(fromB64Url(m[1])) as unknown;
    return isValidPayload(p) ? p : null;
  } catch {
    return null;
  }
}

/** Builds a shareable link with the claim in the fragment only; never in the path or query string. */
export function buildClaimLink(origin: string, pathname: string, p: ClaimPayload): string {
  return `${origin}${pathname}${buildClaimHash(p)}`;
}

/** Drops the claim secrets from a payload kept in memory once it has been used. */
export function scrubPayload(p: ClaimPayload): ClaimPayload {
  const zero = '0'.repeat(64);
  return { ...p, salt: zero, recipientSecret: zero, coin: { ...p.coin, nonce: zero } };
}

/** Removes the claim from the address bar and session history entry, without reloading. */
export function clearClaimFromUrl(
  loc: Pick<Location, 'pathname' | 'search' | 'hash'> = location,
  hist: Pick<History, 'replaceState' | 'state'> = history,
): boolean {
  if (!/^#claim=/.test(loc.hash)) return false;
  hist.replaceState(hist.state, '', loc.pathname + loc.search);
  return true;
}

/** A fresh recipient key per transfer, so two transfers to the same person carry unlinkable public tags. */
export function freshRecipientSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function qrDataUrl(text: string, size = 180): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: '#0B1220', light: '#E8EDF4' },
    errorCorrectionLevel: 'M',
  });
}
