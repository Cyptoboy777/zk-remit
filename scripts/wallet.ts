/*
 * Shared operator-wallet code for the Preview scripts (deploy-preview.ts, dust-register.ts).
 *
 * The wallet phrase is read from the environment (or an untracked .env) only. It is never printed,
 * logged or written anywhere. Works the same on macOS, Linux and Windows (PowerShell); no shell
 * tools are used.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import WebSocket from 'ws';
import * as Rx from 'rxjs';
import {
  WalletFacade,
  WalletSeeds,
  ShieldedWallet,
  UnshieldedWallet,
  DustWallet,
  createKeystore,
  PublicKey,
  NoOpTransactionHistoryStorage,
} from '@midnightntwrk/wallet-sdk';

export const here = dirname(fileURLToPath(import.meta.url));
export const repo = resolve(here, '..');

// Load .env first so every setting below can come from it (cwd first, then the repo root).
for (const f of [resolve(process.cwd(), '.env'), resolve(repo, '.env')]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* no .env here, fine */
  }
}

// The node client logs its own reconnects (RPC-CORE / API/INIT ... Normal Closure) straight to the
// console. They are harmless retries but read like failures, so keep them out of the output.
const NOISE = /RPC-CORE|API\/INIT|Failed WS Request|disconnected from wss?:|Normal Closure/;
for (const k of ['error', 'warn', 'log'] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    if (a.some((x) => NOISE.test(typeof x === 'string' ? x : x instanceof Error ? x.message : ''))) return;
    orig(...a);
  };
}

export const NETWORK_ID = 'preview' as const;
export const env = {
  indexer: process.env.PREVIEW_INDEXER_URL ?? 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWs: process.env.PREVIEW_INDEXER_WS_URL ?? 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: process.env.PREVIEW_NODE_URL ?? 'wss://rpc.preview.midnight.network',
  proofServer: process.env.PROOF_SERVER_URL ?? 'http://localhost:6300',
};

export const say = (m: string) => console.log(m);
export const die = (m: string): never => {
  console.error(`\n${m}\n`);
  process.exit(1);
};

/** The master seed from MIDNIGHT_WALLET_MNEMONIC (Lace phrase, BIP39) or MIDNIGHT_WALLET_SEED (64 hex). */
export const readSeed = (): Buffer => {
  const mnemonic = (process.env.MIDNIGHT_WALLET_MNEMONIC ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  const seedHex = (process.env.MIDNIGHT_WALLET_SEED ?? '').trim().replace(/^0x/, '');
  if (mnemonic) {
    if (!validateMnemonic(mnemonic, wordlist)) {
      return die('MIDNIGHT_WALLET_MNEMONIC is not a valid recovery phrase (check the words and their order).');
    }
    // Standard BIP39 seed, the derivation Lace and Midnight's docs use for a recovery phrase.
    return Buffer.from(mnemonicToSeedSync(mnemonic));
  }
  if (/^[0-9a-fA-F]{64}$/.test(seedHex)) return Buffer.from(seedHex, 'hex');
  return die(
    'No wallet is configured.\n' +
      'Put MIDNIGHT_WALLET_MNEMONIC="your 24 Lace words" in the .env file in the repo folder (copy .env.example), then run again.\n' +
      'It is read from that file only and is never printed or saved anywhere else.',
  );
};

/** Is the proof server answering? */
export const proofServerUp = async (url = env.proofServer) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return r.status < 500;
  } catch {
    return false;
  }
};

export type WalletOptions = {
  /** Prove inside this process instead of at a proof server (no Docker needed). */
  wasmProving?: boolean;
};

export const buildWallet = async (seedBytes: Uint8Array, opts: WalletOptions = {}) => {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
  let seeds: ReturnType<typeof WalletSeeds.fromMasterSeed>;
  try {
    seeds = WalletSeeds.fromMasterSeed(seedBytes);
  } catch {
    return die('The wallet seed could not be used. Check your recovery phrase.');
  }
  const keystore = createKeystore({ kind: 'schnorr', secret: seeds.unshielded }, NETWORK_ID);
  const configuration = {
    networkId: NETWORK_ID,
    indexerClientConnection: { indexerHttpUrl: env.indexer, indexerWsUrl: env.indexerWs },
    ...(opts.wasmProving
      ? { provers: { v9: { kind: 'wasm' as const } } }
      : { provingServerUrl: new URL(env.proofServer) }),
    relayURL: new URL(env.node),
    txHistoryStorage: new NoOpTransactionHistoryStorage(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  };
  const wallet = await WalletFacade.init({
    configuration: configuration as any,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSeed(seeds.shielded),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (cfg) => DustWallet(cfg).startWithSeed(seeds.dust),
  });
  await wallet.start(seeds);
  const address = keystore.getBech32Address().asString();
  return { wallet, keystore, address };
};
export type Built = Awaited<ReturnType<typeof buildWallet>>;
export type State = Awaited<ReturnType<WalletFacade['waitForSyncedState']>>;

/**
 * The ledger-9 fork version the SDK uses (DefaultForkSchedule). Transactions are stamped with the
 * protocol version the wallet sees; a sub-wallet still reading the chain below this version builds
 * for ledger 8, which current Preview rejects (Lace 2.5.2 hits exactly this as
 * ProtocolVersionMismatchError). So nothing is built until every sub-wallet is past it.
 */
export const V9_FORK = (() => {
  try {
    const f = (WalletFacade.resolveConfiguration({ networkId: NETWORK_ID } as any) as any).forks?.v9;
    return typeof f === 'number' || typeof f === 'bigint' ? Number(f) : 2_000_000;
  } catch {
    return 2_000_000;
  }
})();

export const describeProtocol = (s: State) => {
  const p: any = s.protocol;
  return p._tag === 'Settled'
    ? `settled at protocol ${String(p.version)}`
    : `crossing ${String(p.from)} -> ${String(p.to)} (behind: ${(p.behind ?? []).join(', ') || '-'})`;
};

/** Synced, on one ledger, and that ledger is 9: the only state in which it is safe to build a transaction. */
export const readyState = async (wallet: WalletFacade, timeoutMs = 45 * 60_000): Promise<State> => {
  say('Syncing the wallet with Preview (the first sync can take several minutes)…');
  await wallet.waitForSyncedState();
  let last = '';
  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.tap((s) => {
        const d = describeProtocol(s);
        if (d !== last && s.isSynced) {
          last = d;
          if (!(s.protocol._tag === 'Settled' && Number(s.activeProtocolVersion) >= V9_FORK)) {
            say(`  waiting for the wallet to reach ledger 9 (${d})…`);
          }
        }
      }),
      Rx.filter((s) => s.isSynced && s.protocol._tag === 'Settled' && Number(s.activeProtocolVersion) >= V9_FORK),
      Rx.timeout({ first: timeoutMs }),
    ),
  ).catch(() =>
    die(
      `The wallet did not reach ledger 9 within ${Math.round(timeoutMs / 60_000)} minutes (${last || 'still syncing'}).\n` +
        'Nothing was sent. Check your internet connection and run the same command again; sync resumes from the start.',
    ),
  );
};

export const nightOf = (s: State): bigint => {
  const b = s.unshielded.balances as Record<string, bigint>;
  return Object.values(b).reduce((a, v) => a + v, 0n);
};
export const dustOf = (s: State): bigint => s.dust.balance(new Date());
export const fmtNight = (raw: bigint) => `${raw / 1_000_000n}.${(raw % 1_000_000n).toString().padStart(6, '0')}`;
export const fmtDust = (raw: bigint) =>
  `${raw / 1_000_000_000_000_000n}.${(raw % 1_000_000_000_000_000n).toString().padStart(15, '0').slice(0, 6)}`;

/** Short, safe reason for an error: never a stack, never configuration. */
export const reasonOf = (e: unknown) => {
  const any = e as { _tag?: string; message?: string };
  const tag = typeof any?._tag === 'string' ? any._tag.split('/').pop() : '';
  const msg = e instanceof Error || typeof any?.message === 'string' ? String(any.message).split('\n')[0].slice(0, 300) : 'unknown error';
  return tag && !msg.includes(tag) ? `${tag}: ${msg}` : msg;
};
