// Single source of truth for the page's Content-Security-Policy. vite.config.ts injects it as a <meta>
// tag at build time (so any static host enforces it) and vercel.json repeats it as a real header; a
// unit test keeps the two identical.
//
// 'wasm-unsafe-eval' is required for the Midnight runtime (WebAssembly). Network access is limited to
// this origin, HTTPS/WSS (the wallet supplies the Midnight indexer URLs, so they are not fixed) and an
// optional local proof server on port 6300. No inline or remote scripts are allowed.
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", 'https:', 'wss:', 'http://localhost:6300', 'http://127.0.0.1:6300'],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
};

export const cspString = (d = CSP_DIRECTIVES) =>
  Object.entries(d)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');

// Only deliverable as an HTTP header (ignored in <meta>).
export const HEADER_ONLY = "frame-ancestors 'none'";

export const SECURITY_HEADERS = {
  'Content-Security-Policy': `${cspString()}; ${HEADER_ONLY}`,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
