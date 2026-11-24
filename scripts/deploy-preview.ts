/*
 * Deploys the compiled ZK Remit contract to Midnight Preview and seeds it for the demo.
 *
 * Runs on the OPERATOR'S LAPTOP only. The wallet comes from an environment variable and is
 * never written to disk, logged or committed. The only thing printed is the contract address.
 *
 *   MIDNIGHT_WALLET_MNEMONIC="<your 24 words>"   the Lace recovery phrase (recommended), OR
 *   MIDNIGHT_WALLET_SEED=<64 hex chars>          a raw hex seed
 *   (put it in an untracked .env, or export it in your shell)
 *
 *   npm run deploy:preview -- --check    syncs the wallet and reports whether tDUST is available, then stops
 *   npm run deploy:preview               deploys
 *
 * Needs: a local proof server on http://localhost:6300, a wallet funded with tNIGHT that has
 * generated tDUST, and the contract compiled with keys (npm run compact).
 *
 * Flags: --check (report funding, do not deploy), --no-seed (deploy only),
 * --no-test-mint (do not enable Preview-only test funds).
 *
 * Writes:
 *   frontend/src/deployment.json   { network, contractAddress, deployedAt, deployTxHash, seedTxs }   (public, committed)
 *   scripts/.local/operator.json   governor + demo-issuer keys                 (private, gitignored)
 *
 * Stack (Midnight Preview relaunched on ledger 9 on 7 Nov 2026): Wallet SDK 2.0.1, Midnight.js 5.0.1,
 * proof server 9.0.2, compactc 0.36.1. The wallet code follows the official Wallet SDK 2 snippets. It was
 * dry-run on a throwaway wallet up to the funding check; the deploy step itself can only run with a
 * funded wallet, so a first real run may still surface a small mismatch confined to this file.
 */
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import WebSocket from 'ws';
import * as Rx from 'rxjs';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  createLedger9MidnightProvider,
  createLedger9WalletProvider,
  type PrivateStateProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/v9/compact-js';
import { WalletFacade, WalletTransaction } from '@midnightntwrk/wallet-sdk';
import { NETWORK_ID, env, say, die, readSeed, buildWallet, readyState, dustOf, reasonOf, type Built, type State } from './wallet.js';

import {
  Contract,
  witnesses,
  pureCircuits,
  randomBytes,
  toHex,
  defaultPolicy,
  COUNTRY,
  SETTLEMENT_COLOR,
} from '../contract/src/index.js';

// ---------------------------------------------------------------- config

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const ZK_DIR = resolve(repo, 'contract/src/managed/zk-remit');
const DEPLOYMENT_JSON = resolve(repo, 'frontend/src/deployment.json');
const LOCAL_DIR = resolve(here, '.local');

const DEMO_CORRIDORS: [bigint, bigint][] = [
  [COUNTRY.UAE, COUNTRY.PHILIPPINES],
  [COUNTRY.USA, COUNTRY.MEXICO],
  [COUNTRY.UK, COUNTRY.NIGERIA],
  [COUNTRY.GERMANY, COUNTRY.TURKIYE],
  [COUNTRY.SINGAPORE, COUNTRY.INDONESIA],
  [COUNTRY.SAUDI, COUNTRY.PAKISTAN],
  [COUNTRY.SPAIN, COUNTRY.COLOMBIA],
];

// ---------------------------------------------------------------- preflight


const seedBytes = readSeed();
if (!existsSync(resolve(ZK_DIR, 'keys')) || !existsSync(resolve(ZK_DIR, 'contract'))) {
  die('Compiled contract not found. Run:  npm run compact   (needs compactc 0.36.1)');
}

try {
  const r = await fetch(env.proofServer, { signal: AbortSignal.timeout(5000) });
  if (!r.ok && r.status >= 500) throw new Error('bad status');
} catch {
  die(`Proof server is not reachable at ${env.proofServer}.\nStart it:  docker run -p 6300:6300 midnightntwrk/proof-server:9.0.2 midnight-proof-server -v`);
}

// ---------------------------------------------------------------- wallet (Wallet SDK 2)

// Wallet building and the ledger-9 readiness check live in wallet.ts (shared with dust-register.ts).
const settledState = (wallet: WalletFacade) => readyState(wallet);

const waitForFunds = async (wallet: WalletFacade) => {
  let state = await settledState(wallet);
  if (dustOf(state) > 0n) return state;
  say('Waiting for tDUST (generate it in Lace for this same wallet if this does not move)…');
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 15_000));
    state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
    if (dustOf(state) > 0n) return state;
    if (Date.now() > deadline) {
      return die(
        'No tDUST available after 10 minutes.\n' +
          '1) Get tNIGHT from the Preview faucet.  2) Run  npm run dust:register  (or Generate tDUST in Lace).  3) Run this again.',
      );
    }
  }
};

const walletProviders = ({ wallet, keystore }: Built, state: State) => {
  // Midnight.js calls the key getters synchronously, so they are read once from the settled state.
  const coinPublicKey = state.shielded.coinPublicKey.toHexString();
  const encryptionPublicKey = state.shielded.encryptionPublicKey.toHexString();
  return {
    walletProvider: createLedger9WalletProvider({
      getCoinPublicKey: () => coinPublicKey as any,
      getEncryptionPublicKey: () => encryptionPublicKey as any,
      balanceTx: async (tx, ttl) => {
        // The wallet runs its own copy of the ledger, so transactions cross as bytes.
        const recipe = await wallet.balanceUnboundTransaction(wallet.adoptTransaction(tx.serialize(), 'Unbound'), {
          ttl: ttl ?? new Date(Date.now() + 30 * 60_000),
        });
        const signed = await wallet.signRecipe(recipe, keystore.signDataAsync);
        const finalized = await wallet.finalizeRecipe(signed);
        return Buffer.from(WalletTransaction.toWire(finalized).transaction, 'hex');
      },
    }),
    midnightProvider: createLedger9MidnightProvider(
      (tx) => wallet.submitTransaction(wallet.adoptTransaction(tx.serialize(), 'Finalized')) as any,
    ),
  };
};

// ---------------------------------------------------------------- private state (in memory, deploy-time only)

const memoryPrivateState = (): PrivateStateProvider<string, unknown> => {
  const store = new Map<string, unknown>();
  const keys = new Map<string, unknown>();
  const forContract = (address: string) => ({
    contractAddress: address,
    set: async (k: string, v: unknown) => void store.set(`${address}:${k}`, v),
    get: async (k: string) => store.get(`${address}:${k}`) ?? null,
    remove: async (k: string) => void store.delete(`${address}:${k}`),
    clear: async () => [...store.keys()].filter((k) => k.startsWith(`${address}:`)).forEach((k) => store.delete(k)),
    exportPrivateStates: async () => {
      throw new Error('export is not used by the deploy script');
    },
    importPrivateStates: async () => {
      throw new Error('import is not used by the deploy script');
    },
  });
  return {
    forContract,
    clearAll: async () => store.clear(),
    setSigningKey: async (a: string, k: unknown) => void keys.set(a, k),
    getSigningKey: async (a: string) => keys.get(a) ?? null,
    removeSigningKey: async (a: string) => void keys.delete(a),
    clearSigningKeys: async () => keys.clear(),
    exportSigningKeys: async () => {
      throw new Error('export is not used by the deploy script');
    },
    importSigningKeys: async () => {
      throw new Error('import is not used by the deploy script');
    },
  } as unknown as PrivateStateProvider<string, unknown>;
};

// ---------------------------------------------------------------- main

const main = async () => {
  const w = await buildWallet(seedBytes);
  // Public address only, so you can confirm this is the same wallet you funded in Lace.
  say(`Wallet (unshielded address): ${w.address}`);

  if (process.argv.includes('--check')) {
    // Funding check only: nothing is deployed and nothing is written.
    const state = await settledState(w.wallet);
    const dust = dustOf(state) > 0n;
    say(`Wallet synced. tDUST available: ${dust ? 'yes' : 'no'}`);
    say(
      dust
        ? 'This wallet can deploy. Run again without --check (or: npm run deploy:preview:all).'
        : 'No tDUST yet. Run  npm run dust:register  to register your tNIGHT for tDUST (works when Lace\'s "Generate tDUST" fails).\n' +
            'If it stays "no" after ~10 minutes, compare the address above with the one Lace shows: they must match.',
    );
    await w.wallet.stop();
    return;
  }

  const state = await waitForFunds(w.wallet);

  const zkConfigProvider = new NodeZkConfigProvider<string>(ZK_DIR);
  const { walletProvider, midnightProvider } = walletProviders(w, state);
  const providers: any = {
    privateStateProvider: memoryPrivateState(),
    publicDataProvider: indexerPublicDataProvider({ queryURL: env.indexer, subscriptionURL: env.indexerWs, webSocket: WebSocket as any }),
    zkConfigProvider,
    proofProvider: httpClientProofProvider({ url: env.proofServer, zkConfigProvider }),
    walletProvider,
    midnightProvider,
    config: { networkId: NETWORK_ID, ttlSeconds: 30 * 60 },
  };

  const compiledContract = CompiledContract.make('zk-remit', Contract).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(ZK_DIR),
  );

  const governorSecret = randomBytes();
  const issuerSecret = randomBytes();
  const governorPk = pureCircuits.governorPublicKey(governorSecret);
  const issuerPk = pureCircuits.issuerPublicKey(issuerSecret);

  say('Deploying contract (generating the deployment proof)…');
  const deployed: any = await deployContract(providers, {
    compiledContract,
    privateStateId: 'zkRemitPrivateState',
    initialPrivateState: { governorSecret },
    args: [governorPk, SETTLEMENT_COLOR],
  } as any);
  const contractAddress: string = deployed.deployTxData.public.contractAddress;
  const txOf = (r: any): string => (typeof r?.public?.txHash === 'string' ? r.public.txHash : '');
  const deployTxHash = txOf(deployed.deployTxData);
  const seedTxs: string[] = [];
  const record = () =>
    writeFileSync(
      DEPLOYMENT_JSON,
      JSON.stringify({ network: NETWORK_ID, contractAddress, deployedAt: new Date().toISOString(), deployTxHash, seedTxs }, null, 2) + '\n',
    );

  // Persist right away so a failure while seeding never loses the address or the governor key.
  mkdirSync(LOCAL_DIR, { recursive: true });
  const operatorFile = resolve(LOCAL_DIR, 'operator.json');
  writeFileSync(
    operatorFile,
    JSON.stringify({ contractAddress, governorSecret: toHex(governorSecret), issuerSecret: toHex(issuerSecret) }, null, 2),
  );
  chmodSync(operatorFile, 0o600);
  record();

  say(`\nCONTRACT ADDRESS: ${contractAddress}`);
  if (deployTxHash) say(`DEPLOY TX: ${deployTxHash}`);
  say('');

  if (process.argv.includes('--no-seed')) return;

  say('Seeding: registering a demo issuer and 7 corridors (one transaction each)…');
  const seeded = (label: string, r: any) => {
    const h = txOf(r);
    if (h) seedTxs.push(h);
    record();
    say(`  ${label}${h ? `  tx ${h}` : ''}`);
  };
  seeded('demo issuer registered', await deployed.callTx.addIssuer(issuerPk));
  let n = 0;
  for (const [from, to] of DEMO_CORRIDORS) {
    seeded(`corridor ${++n}/${DEMO_CORRIDORS.length}`, await deployed.callTx.setCorridorPolicy(from, to, defaultPolicy()));
  }
  if (!process.argv.includes('--no-test-mint')) {
    // PREVIEW ONLY: lets any wallet mint demo settlement funds (capped per call). Skip with --no-test-mint.
    seeded('Preview test funds enabled', await deployed.callTx.enableTestMint());
  }
  say('Seeded. Operator keys were saved to scripts/.local/operator.json (private, gitignored, not printed).');
  say('Next: npm run deploy:fill-docs   (writes the address and tx hashes into README and the AKINDO draft)');
  await w.wallet.stop();
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // Print a short reason only: never the seed, keys or a stack that could echo configuration.
    const reason = reasonOf(e);
    console.error(`\nDeploy did not finish: ${reason}\nIf a contract address was printed above, it is already saved in frontend/src/deployment.json.\n`);
    process.exit(1);
  });
