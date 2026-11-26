// Runs Lighthouse (mobile defaults) on the built app: home and a claim link. Prints scores; writes JSON.
// Usage: node ci/lighthouse.mjs http://localhost:4173 out-dir
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const [base = 'http://localhost:4173', out = 'lighthouse'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const h = (c) => c.repeat(64);
const payload = { v: 3, receiptId: h('a'), coin: { nonce: h('b'), color: h('c'), value: '42000' }, salt: h('d'), recipientSecret: h('e'), network: 'simulator' };
const b64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pages = { home: `${base}/`, claim: `${base}/#claim=${b64}` };

let worst = 100;
for (const [name, url] of Object.entries(pages)) {
  const file = `${out}/${name}.json`;
  execFileSync(
    'npx',
    ['-y', 'lighthouse@12.2.1', url, '--quiet', '--chrome-flags=--headless=new --no-sandbox', '--output=json', `--output-path=${file}`, '--only-categories=performance,accessibility,best-practices,seo'],
    { stdio: 'inherit' },
  );
  const cats = JSON.parse(readFileSync(file, 'utf8')).categories;
  const row = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, Math.round(v.score * 100)]));
  worst = Math.min(worst, ...Object.values(row));
  console.log(`LIGHTHOUSE ${name} ${JSON.stringify(row)}`);
}
console.log(`LIGHTHOUSE worst ${worst}`);
