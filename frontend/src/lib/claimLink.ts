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

export function parseClaimHash(hash: string): ClaimPayload | null {
  const m = hash.match(/#claim=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const p = decode(fromB64Url(m[1])) as ClaimPayload;
    if (p?.v !== 3 || !p.receiptId) return null;
    return p;
  } catch {
    return null;
  }
}

export async function qrDataUrl(text: string, size = 180): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: '#0B1220', light: '#E8EDF4' },
    errorCorrectionLevel: 'M',
  });
}
