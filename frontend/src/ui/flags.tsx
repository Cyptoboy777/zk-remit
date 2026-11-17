/** Simple geometric flags that render on Windows. No regional-indicator emoji. */
import type { ReactNode } from 'react';

const FLAGS: Record<string, ReactNode> = {
  US: (
    <>
      <rect width="18" height="12" fill="#bf0a30" />
      <rect width="18" height="1.2" y="1.2" fill="#fff" />
      <rect width="18" height="1.2" y="3.6" fill="#fff" />
      <rect width="18" height="1.2" y="6" fill="#fff" />
      <rect width="18" height="1.2" y="8.4" fill="#fff" />
      <rect width="18" height="1.2" y="10.8" fill="#fff" />
      <rect width="7.6" height="6.4" fill="#002868" />
    </>
  ),
  MX: (
    <>
      <rect width="6" height="12" fill="#006847" />
      <rect x="6" width="6" height="12" fill="#fff" />
      <rect x="12" width="6" height="12" fill="#ce1126" />
    </>
  ),
  AE: (
    <>
      <rect width="18" height="4" fill="#00732f" />
      <rect y="4" width="18" height="4" fill="#fff" />
      <rect y="8" width="18" height="4" fill="#000" />
      <rect width="5" height="12" fill="#ff0000" />
    </>
  ),
  PH: (
    <>
      <rect width="18" height="6" fill="#0038a8" />
      <rect y="6" width="18" height="6" fill="#ce1126" />
      <polygon points="0,0 8,6 0,12" fill="#fff" />
      <circle cx="3.2" cy="6" r="1.15" fill="#fcd116" />
    </>
  ),
  GB: (
    <>
      <rect width="18" height="12" fill="#012169" />
      <path d="M0 0L18 12M18 0L0 12" stroke="#fff" strokeWidth="2.4" />
      <path d="M0 0L18 12M18 0L0 12" stroke="#c8102e" strokeWidth="1.1" />
      <path d="M9 0V12M0 6H18" stroke="#fff" strokeWidth="4" />
      <path d="M9 0V12M0 6H18" stroke="#c8102e" strokeWidth="2" />
    </>
  ),
  NG: (
    <>
      <rect width="6" height="12" fill="#008751" />
      <rect x="6" width="6" height="12" fill="#fff" />
      <rect x="12" width="6" height="12" fill="#008751" />
    </>
  ),
  DE: (
    <>
      <rect width="18" height="4" fill="#000" />
      <rect y="4" width="18" height="4" fill="#de0000" />
      <rect y="8" width="18" height="4" fill="#ffce00" />
    </>
  ),
  TR: (
    <>
      <rect width="18" height="12" fill="#e30a17" />
      <circle cx="7.2" cy="6" r="3.1" fill="#fff" />
      <circle cx="8.2" cy="6" r="2.45" fill="#e30a17" />
      <polygon points="11.2,6 13.3,6.7 12.5,4.7 13.9,5.8 14.6,3.9 12.2,5.2 11.2,3.3 11.2,5.4 8.9,5.8 11,6.4" fill="#fff" />
    </>
  ),
  SG: (
    <>
      <rect width="18" height="6" fill="#ef3340" />
      <rect y="6" width="18" height="6" fill="#fff" />
      <circle cx="4.2" cy="3.1" r="1.7" fill="#fff" />
      <circle cx="5" cy="3.1" r="1.35" fill="#ef3340" />
    </>
  ),
  ID: (
    <>
      <rect width="18" height="6" fill="#ce1126" />
      <rect y="6" width="18" height="6" fill="#fff" />
    </>
  ),
  SA: (
    <>
      <rect width="18" height="12" fill="#165d31" />
      <rect x="3" y="5.2" width="12" height="1.6" rx="0.4" fill="#fff" />
    </>
  ),
  PK: (
    <>
      <rect width="18" height="12" fill="#01411c" />
      <rect width="4" height="12" fill="#fff" />
      <circle cx="10.6" cy="6" r="2.5" fill="#fff" />
      <circle cx="11.4" cy="5.6" r="2" fill="#01411c" />
    </>
  ),
  ES: (
    <>
      <rect width="18" height="12" fill="#c60b1e" />
      <rect y="3" width="18" height="6" fill="#ffc400" />
    </>
  ),
  CO: (
    <>
      <rect width="18" height="6" fill="#fcd116" />
      <rect y="6" width="18" height="3" fill="#003893" />
      <rect y="9" width="18" height="3" fill="#ce1126" />
    </>
  ),
};

export function Flag({ iso, title }: { iso: string; title?: string }) {
  const code = iso === 'UK' ? 'GB' : iso;
  return (
    <svg
      className="flag"
      viewBox="0 0 18 12"
      width="18"
      height="12"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      {FLAGS[code] ?? <rect width="18" height="12" fill="#1c2a3e" />}
      <rect width="18" height="12" rx="1.5" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" />
    </svg>
  );
}

export function CorridorFlags({ from, to }: { from: string; to: string }) {
  return (
    <span className="corridor-flags">
      <Flag iso={from} />
      <span className="iso">{from}</span>
      <span className="arrow">→</span>
      <Flag iso={to} />
      <span className="iso">{to}</span>
    </span>
  );
}
