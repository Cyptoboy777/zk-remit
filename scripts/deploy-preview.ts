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
import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import WebSocket from 'ws';
import * as Rx from 'rxjs';

import {
  createLedger9UnprovenDeployTx,
  submitTx,
  submitInsertVerifierKeyTx,
  findDeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import { LedgerTransaction } from '@midnight-ntwrk/midnight-js-types';
import { sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import * as L from '@midnightntwrk/ledger-v9';
import { planDeploy, pendingKeys, parseBlockLimits, PREVIEW_BLOCK_LIMITS, seedSteps, blockShare, type Cost } from './deploy-plan.js';
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

  // ---- resumable state (private, gitignored): secrets, the maintenance signing key, progress
  mkdirSync(LOCAL_DIR, { recursive: true });
  const operatorFile = resolve(LOCAL_DIR, 'operator.json');
  type Op = { contractAddress?: string; governorSecret: string; issuerSecret: string; signingKey: string; deployTxHash?: string; keyTxs: Record<string, string>; seeded: string[]; seedTxs: string[] };
  let op: Op | null = null;
  try {
    op = JSON.parse(readFileSync(operatorFile, 'utf8'));
  } catch {
    /* fresh deploy */
  }
  const save = () => {
    writeFileSync(operatorFile, JSON.stringify(op, null, 2));
    try {
      chmodSync(operatorFile, 0o600);
    } catch {
      /* Windows */
    }
  };
  const record = () =>
    writeFileSync(
      DEPLOYMENT_JSON,
      JSON.stringify({ network: NETWORK_ID, contractAddress: op!.contractAddress, deployedAt: new Date().toISOString(), deployTxHash: op!.deployTxHash ?? '', seedTxs: op!.seedTxs }, null, 2) + '\n',
    );
  const fromHex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));
  const txOf = (r: any): string => (typeof r?.public?.txHash === 'string' ? r.public.txHash : typeof r?.txHash === 'string' ? r.txHash : '');

  const chainState = async (address: string): Promise<any | null> => {
    const read: any = await providers.publicDataProvider.queryContractState(address).catch(() => null);
    return read ? read.contractState.deserialize({ v9: L.ContractState }) : null;
  };

  // Resume only if the saved contract really exists on chain; otherwise start a fresh deploy.
  let existing = op?.contractAddress && op.signingKey ? await chainState(op.contractAddress) : null;
  if (!existing) {
    op = {
      governorSecret: op?.governorSecret ?? toHex(randomBytes()),
      issuerSecret: op?.issuerSecret ?? toHex(randomBytes()),
      signingKey: String(sampleSigningKey()),
      keyTxs: {},
      seeded: [],
      seedTxs: [],
    };
  } else {
    say(`Resuming the deploy of ${op!.contractAddress} (saved in scripts/.local/operator.json).`);
  }
  const governorSecret = fromHex(op!.governorSecret);
  const issuerPk = pureCircuits.issuerPublicKey(fromHex(op!.issuerSecret));
  const ORDER = ['addIssuer', 'setCorridorPolicy', 'enableTestMint', 'sendRemittance', 'claim', 'reclaim', 'issueCredential', 'revokeIssuer', 'closeCorridor', 'advanceEpoch', 'mintTestSettlement', 'proveReceiptOwnership'];
  const circuits = ORDER;

  if (!existing) {
    say('Building the deploy transaction…');
    const unsubmitted: any = await createLedger9UnprovenDeployTx(providers, {
      compiledContract,
      signingKey: op!.signingKey,
      args: [pureCircuits.governorPublicKey(governorSecret), SETTLEMENT_COLOR],
      privateStateId: 'zkRemitPrivateState',
      initialPrivateState: { governorSecret },
    } as any);
    const full: any = unsubmitted.private.unprovenTx.deserialize({ v9: L.Transaction });
    if (full.guaranteedOffer || full.fallibleOffer) die('Unexpected coins in the deploy transaction; cannot split it safely.');
    const intent: any = full.intents.get(1);
    const fullState: any = intent.actions.find((a: any) => a instanceof L.ContractDeploy).initialState;
    const allOps: string[] = fullState.operations().map((o: any) => (typeof o === 'string' ? o : new TextDecoder().decode(o)));
    const order = [...ORDER.filter((c) => allOps.includes(c)), ...allOps.filter((c) => !ORDER.includes(c))];

    // Preview's block limits, read live when possible.
    let limits: Cost = PREVIEW_BLOCK_LIMITS;
    let params: any = null;
    try {
      const r: any = await (await fetch(env.indexer, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ block { ledgerParameters } }' }) })).json();
      params = L.LedgerParameters.deserialize(Buffer.from(r.data.block.ledgerParameters, 'hex'));
      limits = parseBlockLimits(params.toString()) ?? limits;
    } catch {
      /* fall back to the known limits */
    }
    const buildDeploy = (keep: readonly string[]) => {
      const st: any = new (L.ContractState as any)();
      st.data = fullState.data;
      st.maintenanceAuthority = fullState.maintenanceAuthority;
      try {
        st.balance = fullState.balance;
      } catch {
        /* empty balance */
      }
      for (const k of keep) st.setOperation(k, fullState.operation(k));
      const d = new (L.ContractDeploy as any)(st);
      return { tx: (L.Transaction as any).fromParts(NETWORK_ID, undefined, undefined, (L.Intent as any).new(intent.ttl).addDeploy(d)), address: String(d.address) };
    };
    const costOf = (tx: any): Cost => (params ? tx.cost(params, true) : { readTime: 0n, computeTime: 0n, blockUsage: BigInt(tx.serialize().length), bytesWritten: BigInt(tx.serialize().length + 3300), bytesChurned: 0n });
    const insertCost = (c: string): Cost => {
      const upd = new (L as any).MaintenanceUpdate(buildDeploy([]).address, [new (L as any).VerifierKeyInsert(c, new (L as any).ContractOperationVersionedVerifierKey('v4', fullState.operation(c).verifierKey))], 0n);
      return costOf((L.Transaction as any).fromParts(NETWORK_ID, undefined, undefined, (L.Intent as any).new(intent.ttl).addMaintenanceUpdate(upd)));
    };
    const plan = planDeploy(order, (keys) => costOf(buildDeploy(keys).tx), insertCost, limits);
    say(`Full deploy would use ${(blockShare(costOf(buildDeploy(order).tx), limits) * 100).toFixed(0)}% of a Preview block, too big for one transaction.`);
    say(`Deploying with ${plan.inDeploy.length} of ${order.length} verifier keys (${(plan.deployShare * 100).toFixed(0)}% of a block); ${plan.inserts.length} more follow, one per transaction.`);
    const { tx, address } = buildDeploy(plan.inDeploy);
    op!.contractAddress = address;
    save(); // saved before submitting so nothing is lost if the window closes
    const res: any = await submitTx(providers, { unprovenTx: LedgerTransaction.seal('v9', 'Unproven', tx) } as any);
    op!.deployTxHash = txOf(res);
    save();
    say(`\nCONTRACT ADDRESS: ${address}`);
    if (op!.deployTxHash) say(`DEPLOY TX: ${op!.deployTxHash}`);
    existing = await chainState(address);
  }
  const contractAddress = op!.contractAddress!;
  await providers.privateStateProvider.setSigningKey(contractAddress, op!.signingKey);

  // Insert every missing verifier key, one per transaction, skipping those already on chain.
  const st: any = existing;
  const allOps: string[] = circuits;
  const have = new Set(allOps.filter((c) => st?.operation(c)?.verifierKey));
  const todo = pendingKeys(allOps, have);
  let k = 0;
  for (const c of todo) {
    const vk = await zkConfigProvider.getVerifierKey(c);
    const r: any = await submitInsertVerifierKeyTx(providers, compiledContract as any, contractAddress, c as any, vk);
    op!.keyTxs[c] = txOf(r);
    save();
    say(`  verifier key ${++k}/${todo.length}: ${c}  tx ${op!.keyTxs[c]}`);
  }
  record(); // all keys in: the contract is usable, so the app may switch to it

  const deployed: any = await findDeployedContract(providers, {
    compiledContract,
    contractAddress,
    privateStateId: 'zkRemitPrivateState',
    initialPrivateState: { governorSecret },
  } as any);

  if (process.argv.includes('--no-seed')) return;
  const steps = seedSteps(DEMO_CORRIDORS.length, !process.argv.includes('--no-test-mint')).filter((s) => !op!.seeded.includes(s));
  if (steps.length) say(`Seeding (${steps.length} transaction(s), one each)…`);
  for (const step of steps) {
    let r: any;
    if (step === 'issuer') r = await deployed.callTx.addIssuer(issuerPk);
    else if (step === 'test-mint') r = await deployed.callTx.enableTestMint(); // PREVIEW ONLY
    else {
      const [from, to] = DEMO_CORRIDORS[Number(step.split('-')[1]) - 1];
      r = await deployed.callTx.setCorridorPolicy(from, to, defaultPolicy());
    }
    const h = txOf(r);
    if (h) op!.seedTxs.push(h);
    op!.seeded.push(step);
    save();
    record();
    say(`  ${step}${h ? `  tx ${h}` : ''}`);
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
    const hint = /1010|exhaust the block/i.test(reason) ? ' (a transaction was too big for a Preview block)' : '';
    console.error(`\nDeploy did not finish: ${reason}${hint}\nProgress is saved in scripts/.local/operator.json; run the same command again to continue where it stopped.\n`);
    process.exit(1);
  });
