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
let lastSdkNote = 0;
const NOISE = /RPC-CORE|API\/INIT|Failed WS Request|disconnected from wss?:|Normal Closure/;
for (const k of ['error', 'warn', 'log'] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    if (a.some((x) => NOISE.test(typeof x === 'string' ? x : x instanceof Error ? x.message : ''))) return;
    // The wallet SDK prints each indexer reconnect as "Wallet.Sync: [object Object]" plus a stack.
    // Say it once a minute in plain words instead; the SDK retries on its own.
    const tagged = a.find((x) => typeof (x as any)?._tag === 'string' && /^Wallet\./.test((x as any)._tag));
    if (tagged) {
      if (Date.now() - lastSdkNote > 60_000) {
        lastSdkNote = Date.now();
        orig(`  (indexer connection dropped, the wallet is reconnecting: ${reasonOf(tagged)})`);
      }
      return;
    }
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

/**
 * The SDK turns a dropped indexer connection into `Wallet.Sync: [object Object]` (it stringifies the
 * WebSocket close event). Remember the real close code and reason here so the scripts can say what
 * actually happened.
 */
export const lastSocketTrouble: { url?: string; code?: number; reason?: string; error?: string; at?: number } = {};
class TrackedWebSocket extends WebSocket {
  constructor(url: string | URL, ...rest: any[]) {
    super(url as any, ...(rest as []));
    const u = String(url);
    this.on('error', (e: Error) => Object.assign(lastSocketTrouble, { url: u, error: e?.message, at: Date.now() }));
    this.on('close', (code: number, reason: Buffer) => {
      if (code !== 1000) Object.assign(lastSocketTrouble, { url: u, code, reason: String(reason ?? ''), at: Date.now() });
    });
  }
}

const CLOSE_MEANING: Record<number, string> = {
  1001: 'the server went away',
  1006: 'the connection dropped without a goodbye (network, VPN, firewall or antivirus cut it)',
  1011: 'the server hit an internal error',
  1012: 'the server is restarting',
  1013: 'the server is busy, try again later',
  4400: 'the server rejected a message',
  4408: 'the connection was not acknowledged in time',
  4429: 'too many requests',
};
const describeSocket = () => {
  const t = lastSocketTrouble;
  if (!t.at) return '';
  const host = (() => {
    try {
      return new URL(t.url ?? '').host;
    } catch {
      return 'the network';
    }
  })();
  if (t.code) return `connection to ${host} closed with code ${t.code}: ${CLOSE_MEANING[t.code] ?? (t.reason || 'no reason given')}`;
  return `could not reach ${host}${t.error ? ` (${t.error})` : ''}`;
};

/**
 * Asks the Preview indexer directly, with only the public address and no wallet, how many
 * transactions ever touched it and how much unspent tNIGHT it holds right now.
 */
export const indexerNight = (address: string, timeoutMs = 120_000) =>
  new Promise<{ txCount: number; night: bigint; highest: number }>((resolveP, rejectP) => {
    const ws = new WebSocket(env.indexerWs, 'graphql-transport-ws');
    const utxos = new Map<string, bigint>();
    let highest = -1;
    let txCount = 0;
    let lastId = -1;
    const NIGHT_RAW = '0'.repeat(64);
    const done = (err?: Error) => {
      clearInterval(ping);
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      if (err) return rejectP(err);
      resolveP({ txCount, highest, night: [...utxos.values()].reduce((a, v) => a + v, 0n) });
    };
    const timer = setTimeout(() => done(new Error(`the indexer did not answer within ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
    const ping = setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 15_000);
    const query = `subscription ($address: UnshieldedAddress!, $transactionId: Int) {
      unshieldedTransactions(address: $address, transactionId: $transactionId) {
        ... on UnshieldedTransaction { type: __typename transaction { id }
          createdUtxos { owner tokenType value outputIndex intentHash } spentUtxos { tokenType value outputIndex intentHash } }
        ... on UnshieldedTransactionsProgress { type: __typename highestTransactionId }
      } }`;
    ws.on('open', () => ws.send(JSON.stringify({ type: 'connection_init' })));
    ws.on('error', (e) => done(new Error(`could not reach the indexer (${e.message})`)));
    ws.on('close', (code) => done(new Error(`the indexer closed the connection (code ${code})`)));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === 'connection_ack') {
        ws.send(JSON.stringify({ id: '1', type: 'subscribe', payload: { query, variables: { address, transactionId: 0 } } }));
      } else if (m.type === 'error') {
        done(new Error(`the indexer refused the query: ${(m.payload ?? []).map((x: any) => x.message).join('; ')}`));
      } else if (m.type === 'next') {
        if (m.payload?.errors?.length) return done(new Error(`the indexer said: ${m.payload.errors.map((x: any) => x.message).join('; ')}`));
        const u = m.payload?.data?.unshieldedTransactions;
        if (u?.type === 'UnshieldedTransactionsProgress') highest = Math.max(highest, Number(u.highestTransactionId));
        if (u?.type === 'UnshieldedTransaction') {
          txCount++;
          lastId = Number(u.transaction?.id);
          const key = (c: any) => `${c.intentHash}:${c.outputIndex}`;
          for (const c of u.createdUtxos ?? []) if (c.tokenType === NIGHT_RAW && c.owner === address) utxos.set(key(c), BigInt(c.value));
          for (const c of u.spentUtxos ?? []) utxos.delete(key(c));
        }
        if (highest >= 0 && lastId >= highest) done();
        else if (highest === 0) done();
      }
    });
  });

export type WalletOptions = {
  /** Prove inside this process instead of at a proof server (no Docker needed). */
  wasmProving?: boolean;
};

export const buildWallet = async (seedBytes: Uint8Array, opts: WalletOptions = {}) => {
  (globalThis as { WebSocket?: unknown }).WebSocket = TrackedWebSocket;
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
  let last = '';
  const failSync = (e: unknown) =>
    die(
      `The wallet could not sync with Preview: ${reasonOf(e)}.\n` +
        'Nothing was sent. Check your internet (turn off any VPN or proxy, allow Node.js through the firewall/antivirus) and run the same command again.',
    );
  // Fail fast instead of hanging: if the indexer connection keeps dropping and the wallet has not
  // moved for 3 minutes, stop and say why.
  let lastStateAt = Date.now();
  const sub = wallet.state().subscribe({ next: () => (lastStateAt = Date.now()), error: () => undefined });
  let stalled: (e: Error) => void = () => undefined;
  const watchdog = setInterval(() => {
    const t = lastSocketTrouble.at ?? 0;
    if (t > lastStateAt && Date.now() - lastStateAt > 180_000) stalled(new Error(describeSocket() || 'no progress for 3 minutes'));
  }, 15_000);
  const stall = new Promise<never>((_, rej) => (stalled = rej));
  const cleanup = () => {
    clearInterval(watchdog);
    sub.unsubscribe();
  };
  await Promise.race([
    stall,
    wallet.waitForSyncedState(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('first sync took too long')), timeoutMs)),
  ]).catch((e) => {
    cleanup();
    return failSync(e);
  });
  return Rx.firstValueFrom(
    Rx.merge(Rx.from(stall), wallet.state()).pipe(
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
  ).finally(cleanup).catch((e) =>
    e?.name !== 'TimeoutError' ? failSync(e) : die(
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

/** Short, safe reason for an error, in plain words: never a stack, never configuration, never "[object Object]". */
export const reasonOf = (e: unknown): string => {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let cur: any = e;
  for (let depth = 0; cur && depth < 6 && !seen.has(cur); depth++) {
    seen.add(cur);
    if (typeof cur === 'string') {
      parts.push(cur);
      break;
    }
    if (typeof cur.code === 'number' && typeof cur.reason === 'string' && !cur.message) {
      parts.push(`connection closed with code ${cur.code}${CLOSE_MEANING[cur.code] ? `: ${CLOSE_MEANING[cur.code]}` : cur.reason ? `: ${cur.reason}` : ''}`);
    } else if (typeof cur.message === 'string' && cur.message && cur.message !== '[object Object]') {
      parts.push(cur.message.split('\n')[0].slice(0, 300));
    } else if (Array.isArray(cur)) {
      parts.push(cur.map((x) => x?.message ?? String(x)).join('; '));
      break;
    }
    cur = cur.cause ?? cur.error ?? cur.left ?? undefined;
  }
  const tag = typeof (e as any)?._tag === 'string' ? (e as any)._tag : '';
  let msg = [...new Set(parts)].join(' <- ') || '';
  if (/Wallet\.Sync|Sync/.test(tag) || !msg) {
    const sock = describeSocket();
    if (sock && !msg.includes(sock)) msg = msg ? `${msg} (${sock})` : sock;
  }
  if (!msg) msg = 'unknown error';
  if (/Wallet\.Sync/.test(tag)) return `lost the indexer connection while syncing: ${msg}`;
  return tag && !msg.includes(tag) ? `${tag.split('/').pop()}: ${msg}` : msg;
};
