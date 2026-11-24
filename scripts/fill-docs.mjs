#!/usr/bin/env node
/*
 * After a deploy: copies the public facts from frontend/src/deployment.json into the README
 * Deployment table and the AKINDO submission draft. Run:  npm run deploy:fill-docs
 * Idempotent: re-running replaces earlier values. Never reads keys or the wallet phrase.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = (p) => resolve(repo, p);
const dep = JSON.parse(readFileSync(path('frontend/src/deployment.json'), 'utf8'));
if (!dep.contractAddress) {
  console.error('frontend/src/deployment.json has no contract address yet. Deploy first (npm run deploy:preview:all).');
  process.exit(1);
}
const EXPLORER = 'https://preview.midnightexplorer.com';
const date = (dep.deployedAt ?? '').slice(0, 10);
const seedTxs = Array.isArray(dep.seedTxs) ? dep.seedTxs : [];
const tx = dep.deployTxHash || 'not recorded';

/** Replace everything between two marker comments (inclusive markers kept). */
const between = (text, name, body) => {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(text)) return null;
  return text.replace(re, `$1\n${body}\n$2`);
};

// README
let readme = readFileSync(path('README.md'), 'utf8');
const table = [
  '| Item | Value |',
  '| --- | --- |',
  '| Network | Midnight Preview (ledger 9) |',
  `| Contract address | \`${dep.contractAddress}\` |`,
  `| Deploy transaction | \`${tx}\` |`,
  `| Deployed | ${date || 'see deployment.json'} |`,
  `| Seed transactions | ${seedTxs.length} (demo issuer, corridors, Preview test funds) |`,
  `| Explorer | ${EXPLORER} (search the address) |`,
].join('\n');
const nextReadme = between(readme, 'deployment', table);
if (nextReadme) writeFileSync(path('README.md'), nextReadme);
else console.warn('README.md has no <!-- deployment:start/end --> markers; skipped.');

// AKINDO draft
let ak = readFileSync(path('docs/AKINDO_SUBMISSION.md'), 'utf8');
const facts = [
  `Contract address on Midnight Preview: ${dep.contractAddress}`,
  `Deploy transaction: ${tx}`,
  `Deployed on: ${date || 'see deployment.json'}`,
  `Seed transactions recorded: ${seedTxs.length}`,
].join('\n');
const nextAk = between(ak, 'deployment', facts);
if (nextAk) writeFileSync(path('docs/AKINDO_SUBMISSION.md'), nextAk);
else console.warn('docs/AKINDO_SUBMISSION.md has no <!-- deployment:start/end --> markers; skipped.');

console.log(`Filled README.md and docs/AKINDO_SUBMISSION.md with ${dep.contractAddress}.`);
