/*
 * Deploys the compiled ZK Remit contract to Midnight Preview and seeds it for the demo.
 *
 * Runs on the OPERATOR'S LAPTOP only. The wallet comes from an environment variable and is
 * never written to disk, logged or committed. The only thing printed is the contract address.
 *
 *   MIDNIGHT_WALLET_SEED=<64 hex chars>   (put it in an untracked .env, or export it in your shell)
 *   npm run deploy:preview
 *
 * Needs: a local proof server on http://localhost:6300, a wallet funded with tNIGHT that has
 * generated tDUST, and the contract compiled with keys (npm run compact).
 *
 * Flags: --no-seed (deploy only), --no-test-mint (do not enable Preview-only test funds).
 *
 * Writes:
 *   frontend/src/deployment.json   { network, contractAddress, deployedAt }   (public, committed)
 *   scripts/.local/operator.json   governor + demo-issuer keys                 (private, gitignored)
 *
 * NOTE: the wallet-sdk wiring below follows Midnight's published deploy guides for wallet-sdk 1.2 /
 * Midnight.js 4.1. It could not be executed in the environment where it was written, so the first
 * real run may surface small API mismatches; they are all confined to the "wallet" section.
 */
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import WebSocket from 'ws';
import * as Rx from 'rxjs';

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  HDWallet,
  Roles,
  WalletFacade,
  ShieldedWallet,
  UnshieldedWallet,
  DustWallet,
  createKeystore,
  PublicKey,
  NoOpTransactionHistoryStorage,
} from '@midnight-ntwrk/wallet-sdk';

import {
  Contract,
  witnesses,
  pureCircuits,
  randomBytes,
  toHex,
  defaultPolicy,
  COUNTRY,
  SETTLEMENT_COLOR,
} from '../contract/src/index.ts';

// ---------------------------------------------------------------- config

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const ZK_DIR = resolve(repo, 'contract/src/managed/zk-remit');
const DEPLOYMENT_JSON = resolve(repo, 'frontend/src/deployment.json');
const LOCAL_DIR = resolve(here, '.local');

const NETWORK_ID = 'preview' as const;
const env = {
  indexer: process.env.PREVIEW_INDEXER_URL ?? 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWs: process.env.PREVIEW_INDEXER_WS_URL ?? 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: process.env.PREVIEW_NODE_URL ?? 'wss://rpc.preview.midnight.network',
  proofServer: process.env.PROOF_SERVER_URL ?? 'http://localhost:6300',
};

const DEMO_CORRIDORS: [bigint, bigint][] = [
  [COUNTRY.UAE, COUNTRY.PHILIPPINES],
  [COUNTRY.USA, COUNTRY.MEXICO],
  [COUNTRY.UK, COUNTRY.NIGERIA],
  [COUNTRY.GERMANY, COUNTRY.TURKIYE],
  [COUNTRY.SINGAPORE, COUNTRY.INDONESIA],
  [COUNTRY.SAUDI, COUNTRY.PAKISTAN],
  [COUNTRY.SPAIN, COUNTRY.COLOMBIA],
];

const say = (m: string) => console.log(m);
const die = (m: string): never => {
  console.error(`\n${m}\n`);
  process.exit(1);
};

// ---------------------------------------------------------------- preflight

for (const f of ['.env', resolve(repo, '.env')]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* no .env here, fine */
  }
}

const seedHex = (process.env.MIDNIGHT_WALLET_SEED ?? '').trim().replace(/^0x/, '');
if (!/^[0-9a-fA-F]{64}$/.test(seedHex)) {
  die(
    'MIDNIGHT_WALLET_SEED is missing or not 64 hex characters.\n' +
      'Set it in an untracked .env file or export it in this shell, then run again.\n' +
      'It is read from the environment only and is never printed or saved.',
  );
}
if (!existsSync(resolve(ZK_DIR, 'keys')) || !existsSync(resolve(ZK_DIR, 'contract'))) {
  die('Compiled contract not found. Run:  npm run compact   (needs compactc 0.31.1)');
}

try {
  const r = await fetch(env.proofServer, { signal: AbortSignal.timeout(5000) });
  if (!r.ok && r.status >= 500) throw new Error('bad status');
} catch {
  die(`Proof server is not reachable at ${env.proofServer}.\nStart it:  docker run -p 6300:6300 midnightntwrk/proof-server:8.1.3 midnight-proof-server -v`);
}

// ---------------------------------------------------------------- wallet (wallet-sdk 1.2)

setNetworkId(NETWORK_ID);
(globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;

const buildWallet = async () => {
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hd.type !== 'seedOk') die('The wallet seed could not be used. Check that it is the 64-character hex seed.');
  const derived = (hd as any).hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  if (derived.type !== 'keysDerived') die('Could not derive wallet keys from the seed.');
  const keys = (derived as any).keys;
  (hd as any).hdWallet.clear();

  const shieldedSecretKeys = (ledger as any).ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = (ledger as any).DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = (createKeystore as any)(keys[Roles.NightExternal], NETWORK_ID);

  const base = {
    networkId: NETWORK_ID,
    indexerClientConnection: { indexerHttpUrl: env.indexer, indexerWsUrl: env.indexerWs },
    provingServerUrl: new URL(env.proofServer),
    relayURL: new URL(env.node),
  };
  const configuration = {
    ...base,
    txHistoryStorage: new (NoOpTransactionHistoryStorage as any)(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  };

  const wallet: any = await (WalletFacade as any).init({
    configuration,
    shielded: (cfg: unknown) => (ShieldedWallet as any)(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg: unknown) => (UnshieldedWallet as any)(cfg).startWithPublicKey((PublicKey as any).fromKeyStore(unshieldedKeystore)),
    dust: (cfg: unknown) => (DustWallet as any)(cfg).startWithSecretKey(dustSecretKey, (ledger as any).LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

const waitForFunds = async (wallet: any) => {
  say('Syncing wallet with Preview (this can take a few minutes the first time)…');
  await wallet.waitForSyncedState();
  say('Waiting for tDUST (generate it in Lace for this same wallet if this does not move)…');
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s: any) => s.isSynced)));
    if ((state as any).dust.balance(new Date()) > 0n) return;
    if (Date.now() > deadline) {
      die(
        'No tDUST available after 10 minutes.\n' +
          '1) Get tNIGHT from the Preview faucet.  2) In Lace, generate tDUST for this wallet.  3) Run this again.',
      );
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
};

const walletProviders = (w: Awaited<ReturnType<typeof buildWallet>>) => {
  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = w;
  let state: any;
  const ready = Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s: any) => s.isSynced))).then((s) => (state = s));
  return {
    walletProvider: {
      getCoinPublicKey: async () => ((state ?? (await ready)) as any).shielded.coinPublicKey.toHexString(),
      getEncryptionPublicKey: async () => ((state ?? (await ready)) as any).shielded.encryptionPublicKey.toHexString(),
      balanceTx: async (tx: unknown, ttl?: Date) => {
        const recipe = await wallet.balanceUnboundTransaction(tx, { shieldedSecretKeys, dustSecretKey }, { ttl: ttl ?? new Date(Date.now() + 30 * 60_000) });
        const signed = typeof wallet.signRecipe === 'function'
          ? await wallet.signRecipe(recipe, (payload: Uint8Array) => unshieldedKeystore.signData(payload))
          : recipe;
        return wallet.finalizeRecipe(signed);
      },
    },
    midnightProvider: {
      submitTx: (tx: unknown) => wallet.submitTransaction(tx),
    },
  };
};

// ---------------------------------------------------------------- private state (in memory, deploy-time only)

const memoryPrivateState = () => {
  const store = new Map<string, unknown>();
  const keys = new Map<string, unknown>();
  let address = '';
  return {
    setContractAddress: (a: string) => void (address = a),
    set: async (k: string, v: unknown) => void store.set(`${address}:${k}`, v),
    get: async (k: string) => store.get(`${address}:${k}`) ?? null,
    remove: async (k: string) => void store.delete(`${address}:${k}`),
    clear: async () => void store.clear(),
    setSigningKey: async (a: string, k: unknown) => void keys.set(a, k),
    getSigningKey: async (a: string) => keys.get(a) ?? null,
    removeSigningKey: async (a: string) => void keys.delete(a),
    clearSigningKeys: async () => void keys.clear(),
  } as any;
};

// ---------------------------------------------------------------- main

const main = async () => {
  const w = await buildWallet();
  await waitForFunds(w.wallet);

  const zkConfigProvider = new (NodeZkConfigProvider as any)(ZK_DIR);
  const { walletProvider, midnightProvider } = walletProviders(w);
  const providers: any = {
    privateStateProvider: memoryPrivateState(),
    publicDataProvider: indexerPublicDataProvider(env.indexer, env.indexerWs),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(env.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider,
  };

  const compiledContract = (CompiledContract as any)
    .make('zk-remit', Contract)
    .pipe((CompiledContract as any).withWitnesses(witnesses), (CompiledContract as any).withCompiledFileAssets(ZK_DIR));

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

  // Persist right away so a failure while seeding never loses the address or the governor key.
  mkdirSync(LOCAL_DIR, { recursive: true });
  const operatorFile = resolve(LOCAL_DIR, 'operator.json');
  writeFileSync(
    operatorFile,
    JSON.stringify({ contractAddress, governorSecret: toHex(governorSecret), issuerSecret: toHex(issuerSecret) }, null, 2),
  );
  chmodSync(operatorFile, 0o600);
  writeFileSync(
    DEPLOYMENT_JSON,
    JSON.stringify({ network: NETWORK_ID, contractAddress, deployedAt: new Date().toISOString() }, null, 2) + '\n',
  );

  say(`\nCONTRACT ADDRESS: ${contractAddress}\n`);

  if (process.argv.includes('--no-seed')) return;

  say('Seeding: registering a demo issuer and 7 corridors (one transaction each)…');
  await deployed.callTx.addIssuer(issuerPk);
  let n = 0;
  for (const [from, to] of DEMO_CORRIDORS) {
    await deployed.callTx.setCorridorPolicy(from, to, defaultPolicy());
    say(`  corridor ${++n}/${DEMO_CORRIDORS.length}`);
  }
  if (!process.argv.includes('--no-test-mint')) {
    // PREVIEW ONLY: lets any wallet mint demo settlement funds (capped per call). Skip with --no-test-mint.
    await deployed.callTx.enableTestMint();
    say('  Preview test funds enabled (any wallet can mint a capped amount of demo settlement tokens).');
  }
  say('Seeded. Operator keys were saved to scripts/.local/operator.json (private, gitignored, not printed).');
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // Print a short reason only: never the seed, keys or a stack that could echo configuration.
    const reason = e instanceof Error ? e.message.split('\n')[0].slice(0, 300) : 'unknown error';
    console.error(`\nDeploy did not finish: ${reason}\nIf a contract address was printed above, it is already saved in frontend/src/deployment.json.\n`);
    process.exit(1);
  });
