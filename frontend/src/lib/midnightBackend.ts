/*
 * Midnight Preview backend: Lace (DApp Connector 4.x) + Midnight.js 4.1.
 *
 * Joins the contract recorded in deployment.json and drives the real circuits through `callTx`.
 * Never invents addresses, balances or transaction hashes: anything it cannot read from the
 * wallet or the chain becomes a typed MidnightProblem that the UI renders as a friendly state.
 *
 * NOTE: written against Midnight's published Lace / Midnight.js 4.1 guides without being able to
 * run it against Preview from the authoring environment. The wallet adapter (`laceProviders`) is
 * the one place most likely to need a small fix on first contact with a real wallet.
 */
import semver from 'semver';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import * as protocolLedger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  Contract,
  defaultPolicy,
  ledger as decodeLedger,
  toHex,
  witnesses,
  type ZkRemitPrivateState,
} from '@zk-remit/contract';
import type { Backend, LedgerSnapshot, ShieldedCoin } from './types';
import { snapshot } from './types';
import { browserPrivateStateProvider } from './privateStateProvider';
import { fromHex } from './codec';
import { MidnightProblem } from './friendlyErrors';
import type { Deployment } from './deployment';

export type Stage = 'connecting' | 'proving' | 'confirmed';

const PRIVATE_STATE_ID = 'zkRemitPrivateState';

type EscrowOpening = { coin: ShieldedCoin & { mt_index: bigint }; salt: Uint8Array };

// ---------------------------------------------------------------- Lace detection / connection

export const detectLace = (): InitialAPI | undefined => {
  const m = (window as unknown as { midnight?: Record<string, InitialAPI> }).midnight;
  if (!m) return undefined;
  return Object.values(m).find(
    (w) => !!w && typeof w === 'object' && 'apiVersion' in w && semver.satisfies(w.apiVersion, '4.x'),
  );
};

/** Extensions inject `window.midnight` a moment after load, so poll briefly before giving up. */
const waitForLace = async (): Promise<InitialAPI | undefined> => {
  for (let i = 0; i < 30; i++) {
    const found = detectLace();
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  return undefined;
};

const zkBaseUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '');

/** Adapts the Lace ConnectedAPI to Midnight.js wallet + midnight providers. */
const laceProviders = async (api: ConnectedAPI) => {
  const addrs = await api.getShieldedAddresses();
  const Tx = (protocolLedger as any).Transaction;
  const walletProvider = {
    getCoinPublicKey: () => addrs.shieldedCoinPublicKey,
    getEncryptionPublicKey: () => addrs.shieldedEncryptionPublicKey,
    balanceTx: async (tx: any) => {
      const res = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
      return Tx.deserialize('signature', 'proof', 'binding', fromHex(res.tx));
    },
  };
  const midnightProvider = {
    submitTx: async (tx: any) => {
      await api.submitTransaction(toHex(tx.serialize()));
      return tx.identifiers()[0];
    },
  };
  return { walletProvider, midnightProvider };
};

// ---------------------------------------------------------------- Backend

export class MidnightBackend implements Backend {
  readonly kind = 'midnight' as const;
  readonly label = 'Midnight Preview';
  readonly contractAddress: string;

  private readonly escrows = new Map<string, EscrowOpening>();

  private constructor(
    private readonly api: ConnectedAPI,
    private readonly providers: any,
    private readonly deployed: any,
    deployment: Deployment,
    private readonly onStage?: (s: Stage) => void,
  ) {
    this.contractAddress = deployment.contractAddress;
  }

  /** Connects Lace, checks network and fees, and joins the deployed contract. Throws MidnightProblem. */
  static async connect(deployment: Deployment, onStage?: (s: Stage) => void): Promise<MidnightBackend> {
    onStage?.('connecting');
    const initial = await waitForLace();
    if (!initial) throw new MidnightProblem('lace-missing');

    setNetworkId(deployment.network as 'preview');

    let api: ConnectedAPI;
    try {
      api = await initial.connect(deployment.network);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      throw new MidnightProblem(/network/i.test(m) ? 'wrong-network' : 'rejected');
    }

    const cfg = await api.getConfiguration();
    if (cfg.networkId !== deployment.network) throw new MidnightProblem('wrong-network');

    const dust = await api.getDustBalance();
    if (dust.balance <= 0n) throw new MidnightProblem('no-dust');

    const { walletProvider, midnightProvider } = await laceProviders(api);
    const zk = new FetchZkConfigProvider(zkBaseUrl());
    const privateStateProvider = browserPrivateStateProvider<string, ZkRemitPrivateState>();
    (privateStateProvider as any).setContractAddress(deployment.contractAddress);

    const providers = {
      privateStateProvider,
      publicDataProvider: indexerPublicDataProvider(cfg.indexerUri, cfg.indexerWsUri),
      zkConfigProvider: zk,
      proofProvider: httpClientProofProvider(cfg.proverServerUri ?? 'http://localhost:6300', zk),
      walletProvider,
      midnightProvider,
    };

    const compiledContract = (CompiledContract as any)
      .make('zk-remit', Contract)
      .pipe(
        (CompiledContract as any).withWitnesses(witnesses),
        // Assets are served over HTTP by FetchZkConfigProvider; this path is only the compiled-output label.
        (CompiledContract as any).withCompiledFileAssets('./managed/zk-remit'),
      );

    let deployed: any;
    try {
      deployed = await findDeployedContract(providers as any, {
        contractAddress: deployment.contractAddress,
        compiledContract,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: (await privateStateProvider.get(PRIVATE_STATE_ID)) ?? {},
      } as any);
    } catch {
      throw new MidnightProblem('not-found');
    }

    const backend = new MidnightBackend(api, providers, deployed, deployment, onStage);
    const stored = (await privateStateProvider.get(PRIVATE_STATE_ID)) as ZkRemitPrivateState | null;
    for (const [id, rec] of Object.entries(stored?.escrows ?? {})) backend.escrows.set(id, rec as EscrowOpening);
    onStage?.('confirmed');
    return backend;
  }

  // ---- private state helpers

  private async setPrivate(as: ZkRemitPrivateState, extra: Partial<ZkRemitPrivateState> = {}) {
    const ps = this.providers.privateStateProvider;
    const current = ((await ps.get(PRIVATE_STATE_ID)) ?? {}) as ZkRemitPrivateState;
    const escrows = { ...(current.escrows ?? {}), ...Object.fromEntries(this.escrows), ...(as.escrows ?? {}) };
    await ps.set(PRIVATE_STATE_ID, { ...current, ...as, ...extra, escrows });
  }

  private async call(name: string, as: ZkRemitPrivateState, args: unknown[], extra: Partial<ZkRemitPrivateState> = {}) {
    await this.setPrivate(as, extra);
    this.onStage?.('proving');
    const tx = await this.deployed.callTx[name](...args);
    this.onStage?.('confirmed');
    return tx;
  }

  private static txHash(tx: any): string | undefined {
    const h = tx?.public?.txHash;
    return typeof h === 'string' ? h : undefined;
  }

  // ---- circuits

  async addIssuer(as: ZkRemitPrivateState, pk: Uint8Array) {
    await this.call('addIssuer', as, [pk]);
  }
  async issueCredential(as: ZkRemitPrivateState, c: Uint8Array) {
    await this.call('issueCredential', as, [c]);
  }
  async setCorridorPolicy(as: ZkRemitPrivateState, f: bigint, t: bigint, policy = defaultPolicy()) {
    await this.call('setCorridorPolicy', as, [f, t, policy]);
  }
  async advanceEpoch(as: ZkRemitPrivateState) {
    await this.call('advanceEpoch', as, []);
  }

  /** Shielded settlement balance held by the connected wallet, for the escrow colour. */
  async settlementBalance(color: Uint8Array): Promise<bigint> {
    const want = toHex(color).toLowerCase();
    const balances = await this.api.getShieldedBalances();
    const key = Object.keys(balances).find((k) => k.toLowerCase().endsWith(want));
    return key ? balances[key] : 0n;
  }

  async sendRemittance(
    as: ZkRemitPrivateState,
    to: bigint,
    slot: bigint,
    tag: Uint8Array,
    coin: ShieldedCoin,
    salt?: Uint8Array,
  ): Promise<{ receiptId: Uint8Array; txHash?: string }> {
    if ((await this.settlementBalance(coin.color)) < coin.value) throw new MidnightProblem('no-settlement');
    const escrowSaltValue = salt ?? crypto.getRandomValues(new Uint8Array(32));
    const tx = await this.call('sendRemittance', as, [to, slot, tag, coin], { escrowSaltValue });
    const receiptId = tx?.private?.result as Uint8Array | undefined;
    if (!(receiptId instanceof Uint8Array)) throw new MidnightProblem('unknown');
    // The recipient needs this opening (via the claim link); keep it in this device's private state too.
    this.escrows.set(toHex(receiptId), { coin: { ...coin, mt_index: 0n }, salt: escrowSaltValue });
    await this.setPrivate(as);
    return { receiptId, txHash: MidnightBackend.txHash(tx) };
  }

  async claim(as: ZkRemitPrivateState, id: Uint8Array) {
    const tx = await this.call('claim', as, [id]);
    return { txHash: MidnightBackend.txHash(tx) };
  }
  async reclaim(as: ZkRemitPrivateState, id: Uint8Array) {
    const tx = await this.call('reclaim', as, [id]);
    return { txHash: MidnightBackend.txHash(tx) };
  }
  async proveReceiptOwnership(as: ZkRemitPrivateState, id: Uint8Array, challenge: Uint8Array) {
    const tx = await this.call('proveReceiptOwnership', as, [id, challenge]);
    return { txHash: MidnightBackend.txHash(tx) };
  }

  // ---- reads

  async ledger(): Promise<LedgerSnapshot> {
    const state = await this.providers.publicDataProvider.queryContractState(this.contractAddress);
    if (!state) throw new MidnightProblem('not-found');
    return snapshot(decodeLedger(state.data));
  }

  getEscrow(receiptId: Uint8Array) {
    return this.escrows.get(toHex(receiptId));
  }

  withEscrow(_as: ZkRemitPrivateState, receiptId: Uint8Array, opening: EscrowOpening) {
    this.escrows.set(toHex(receiptId), opening);
  }
}
