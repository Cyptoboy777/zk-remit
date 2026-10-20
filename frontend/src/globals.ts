import { Buffer } from 'buffer';
// Midnight libraries expect a few Node globals in the browser.
(globalThis as any).process = (globalThis as any).process ?? { env: { NODE_ENV: import.meta.env.MODE } };
(globalThis as any).Buffer = (globalThis as any).Buffer ?? Buffer;
