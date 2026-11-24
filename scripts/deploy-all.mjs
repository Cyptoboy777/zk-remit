#!/usr/bin/env node
/*
 * One command for the operator's laptop:  npm run deploy:preview:all
 *
 * Checks everything the Preview deploy needs, fixes what it safely can, explains the rest in plain
 * words, then runs the funding check and the deploy, and finally fills the docs with the result.
 *
 *   1. Node.js 22.12 or newer           5. contract compiled with ZK keys (compiles if missing)
 *   2. packages installed (npm ci)      6. wallet phrase present in .env (never printed)
 *   3. Docker running                   7. tDUST on that wallet (deploy-preview --check)
 *   4. proof server 9.0.2 on :6300      8. deploy + seed, then fill README / AKINDO draft
 *      (starts it in Docker if absent)
 *
 * Flags: --check-only (stop after step 7), --yes (do not ask before deploying).
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPACTC = '0.36.1';
const PROOF_IMAGE = 'midnightntwrk/proof-server:9.0.2';
const args = new Set(process.argv.slice(2));

const ok = (m) => console.log(`  \u2713 ${m}`);
const info = (m) => console.log(`    ${m}`);
const step = (n, m) => console.log(`\n[${n}/8] ${m}`);
const stop = (m) => {
  console.error(`\n  \u2717 ${m}\n`);
  process.exit(1);
};
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts }).trim();
const tryRun = (cmd) => {
  try {
    return sh(cmd);
  } catch {
    return null;
  }
};
const run = (cmd, argv, env = process.env) => spawnSync(cmd, argv, { cwd: repo, stdio: 'inherit', env, shell: platform() === 'win32' }).status === 0;

for (const f of [join(repo, '.env')]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* optional */
  }
}
const proofUrl = process.env.PROOF_SERVER_URL ?? 'http://localhost:6300';

console.log('ZK Remit \u00b7 Midnight Preview deploy');

// 1 ------------------------------------------------------------------ Node
step(1, 'Node.js');
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 12)) {
  stop(`Node ${process.versions.node} is too old. Install Node 22.12 or newer (nodejs.org, the LTS button), then run this again.`);
}
ok(`Node ${process.versions.node}`);
if (platform() === 'win32') {
  stop('The Compact compiler has no Windows build. Open this folder in WSL (Ubuntu) and run the same command there.');
}

// 2 ------------------------------------------------------------------ packages
step(2, 'Packages');
if (!existsSync(join(repo, 'node_modules/@midnightntwrk/wallet-sdk')) || !existsSync(join(repo, 'node_modules/@midnight-ntwrk/midnight-js-contracts'))) {
  info('Installing packages (npm ci), one time only\u2026');
  if (!run('npm', ['ci'])) stop('npm ci failed. Check your internet connection and run this again.');
}
ok('installed');

// 3 ------------------------------------------------------------------ Docker
step(3, 'Docker');
if (tryRun('docker info --format "{{.ServerVersion}}"') === null) {
  stop('Docker is not running. Open Docker Desktop (or start the Docker service), wait until it says "running", then run this again.');
}
ok('running');

// 4 ------------------------------------------------------------------ proof server
step(4, `Proof server (${proofUrl})`);
const proofUp = async () => {
  try {
    const r = await fetch(proofUrl, { signal: AbortSignal.timeout(4000) });
    return r.status < 500;
  } catch {
    return false;
  }
};
if (!(await proofUp())) {
  if (!/localhost|127\.0\.0\.1/.test(proofUrl)) stop(`No proof server answers at ${proofUrl}. Start it, or remove PROOF_SERVER_URL from .env to use a local one.`);
  info(`Not running. Starting ${PROOF_IMAGE} in Docker (the first download takes a few minutes)\u2026`);
  tryRun('docker rm -f zk-remit-proof-server');
  if (!run('docker', ['run', '-d', '--name', 'zk-remit-proof-server', '-p', '6300:6300', PROOF_IMAGE, 'midnight-proof-server', '-v'])) {
    stop(`Could not start the proof server. Try by hand:  docker run -p 6300:6300 ${PROOF_IMAGE} midnight-proof-server -v`);
  }
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    up = await proofUp();
  }
  if (!up) stop('The proof server container started but is not answering yet. Wait a minute and run this again.');
}
const running = tryRun(`docker ps --format "{{.Image}}"`) ?? '';
if (running && !running.includes('proof-server:9.0.2') && running.includes('proof-server')) {
  info('Note: an older proof-server image is running. Preview (ledger 9) needs 9.0.2; stop the old one if proving fails.');
}
ok('answering');

// 5 ------------------------------------------------------------------ compiled contract
step(5, `Contract compiled with keys (compactc ${COMPACTC})`);
const managed = join(repo, 'contract/src/managed/zk-remit');
const compiledFor = () => {
  try {
    return JSON.parse(readFileSync(join(managed, 'compiler/contract-info.json'), 'utf8'))['compiler-version'] ?? null;
  } catch {
    return null;
  }
};
if (!existsSync(join(managed, 'keys/sendRemittance.prover')) || compiledFor() !== COMPACTC) {
  const local = join(homedir(), `.local/compactc-${COMPACTC}`);
  const env = { ...process.env, PATH: `${local}:${process.env.PATH}` };
  const have = tryRun(`PATH="${env.PATH}" compactc --version`);
  if (!have?.startsWith(COMPACTC)) {
    info(`Installing compactc ${COMPACTC} into ${local}\u2026`);
    if (!run('bash', ['scripts/install-compactc.sh', COMPACTC], env)) stop('Could not install the Compact compiler. Check your internet connection and run this again.');
  }
  info('Compiling the contract with ZK keys (about a minute)\u2026');
  if (!run('npm', ['run', 'compact', '-w', 'contract'], env)) stop('The contract did not compile. Run  npm run compact  to see why.');
}
ok(`compiled${compiledFor() ? ` (compactc ${compiledFor()})` : ''}`);

// 6 ------------------------------------------------------------------ wallet phrase
step(6, 'Wallet phrase in .env');
const phrase = (process.env.MIDNIGHT_WALLET_MNEMONIC ?? '').trim().split(/\s+/).filter(Boolean);
const seed = (process.env.MIDNIGHT_WALLET_SEED ?? '').trim();
if (phrase.length === 0 && !/^(0x)?[0-9a-fA-F]{64}$/.test(seed)) {
  stop(
    'No wallet phrase found. Create a file named .env in this folder (copy .env.example) with one line:\n' +
      '      MIDNIGHT_WALLET_MNEMONIC="your 24 Lace words"\n' +
      '    It stays on this laptop: it is git-ignored, never printed and never uploaded.',
  );
}
if (phrase.length && ![12, 15, 18, 21, 24].includes(phrase.length)) stop(`The phrase in .env has ${phrase.length} words; a Lace phrase has 24. Check it and run again.`);
ok(phrase.length ? `${phrase.length}-word phrase found (not shown)` : 'hex seed found (not shown)');

// 7 ------------------------------------------------------------------ funding
step(7, 'Wallet funding (tDUST)');
info('Syncing the wallet with Preview. The first sync can take several minutes.');
if (!run('npm', ['run', 'deploy:preview', '--', '--check'])) stop('The funding check did not finish. The message above says why.');
if (args.has('--check-only')) {
  console.log('\nCheck finished (--check-only). Run  npm run deploy:preview:all  without it to deploy.\n');
  process.exit(0);
}

// 8 ------------------------------------------------------------------ deploy
step(8, 'Deploy + seed');
if (!args.has('--yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question('    Deploy ZK Remit to Midnight Preview now? It spends a little tDUST. [y/N] ')).trim().toLowerCase();
  rl.close();
  if (a !== 'y' && a !== 'yes') {
    console.log('    Not deployed. Run again when ready.');
    process.exit(0);
  }
}
if (!run('npm', ['run', 'deploy:preview'])) stop('The deploy did not finish. If an address was printed it is saved; run this again to continue.');
run('node', ['scripts/fill-docs.mjs']);
console.log(`
Done. Next:
  git add frontend/src/deployment.json README.md docs/AKINDO_SUBMISSION.md
  git commit -m "Deploy ZK Remit to Midnight Preview" && git push
The live app switches to Preview mode on its own once deployment.json is pushed.
`);
