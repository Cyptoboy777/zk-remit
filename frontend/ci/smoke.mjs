// CI smoke test: loads the built app in a real Chromium under the shipped Content-Security-Policy,
// runs a simulator send, and fails on any CSP violation, page error or missing step.
// Usage: node ci/smoke.mjs http://localhost:4173
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173';
const problems = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  if (/content security policy|refused to/i.test(t)) problems.push(`csp: ${t}`);
});
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => console.error(`Refused to load: ${e.violatedDirective} ${e.blockedURI}`));
});

const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${String(e.message).split('\n')[0]}`);
    console.log(`FAIL ${name}`);
  }
};

await page.goto(base, { waitUntil: 'load' });
await step('first paint hero is visible before the app starts', () => page.waitForSelector('.home-hero', { timeout: 10000 }));
await step('CSP meta is present', async () => {
  const c = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  if (!c || !c.includes("script-src 'self'")) throw new Error('missing CSP meta');
});
await step('app starts', async () => {
  await page.click('[data-boot-tab="send"]');
  await page.waitForSelector('#root:not([aria-busy])', { timeout: 60000 });
  await page.waitForSelector('.send-layout', { timeout: 60000 });
});
await step('privacy explorer is interactive', async () => {
  await page.click('.nav-link:has-text("Home")');
  await page.waitForSelector('.explorer', { timeout: 20000 });
  await page.click('.seg button:has-text("Claim")');
  await page.waitForSelector('.explorer-sum:has-text("Recipient")', { timeout: 5000 });
});
await step('simulator send produces a claim link', async () => {
  // A deployment is recorded, so the app opens in Preview mode (needs Lace). Use the simulator here.
  await page.click('.mode-toggle button:has-text("Simulator")');
  await page.click('.nav-link:has-text("Home")');
  await page.click('button:has-text("Start a demo transfer")');
  await page.waitForSelector('.send-cta:not([disabled])', { timeout: 180000 });
  await page.click('.send-cta');
  await page.click('.nav-link:has-text("Claim")');
  await page.waitForSelector('img.qr', { timeout: 180000 });
  const text = await page.textContent('.qr-card');
  if (!/Anyone who opens this link can claim/.test(text ?? '')) throw new Error('bearer warning missing');
});
await step('claim link keeps secrets in the fragment only', async () => {
  const link = (await page.textContent('.qr-card .mono')) ?? '';
  const u = new URL(link.trim());
  if (u.search !== '' || !u.hash.startsWith('#claim=')) throw new Error('secret outside fragment');
});

await step('claim link opens a light landing, then the claim view', async () => {
  const h = (c) => c.repeat(64);
  const payload = { v: 3, receiptId: h('a'), coin: { nonce: h('b'), color: h('c'), value: '42000' }, salt: h('d'), recipientSecret: h('e'), network: 'simulator' };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const p2 = await browser.newPage();
  p2.on('pageerror', (e) => problems.push(`claim pageerror: ${e.message}`));
  await p2.goto(`${base}/#claim=${b64}`, { waitUntil: 'load' });
  await p2.waitForSelector('.claim-landing', { timeout: 10000 });
  await p2.click('.claim-landing button');
  await p2.waitForSelector('.claim-layout', { timeout: 90000 });
});

await browser.close();
if (problems.length) {
  console.error('\nSmoke test problems:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('\nSmoke test passed');
