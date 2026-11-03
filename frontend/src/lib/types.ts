import type { Ledger, ZkRemitPrivateState } from '@zk-remit/contract';
import { toHex, ReceiptStatus } from '@zk-remit/contract';

export type ReceiptView = {
  id: string;
  fromCountry: bigint;
  toCountry: bigint;
  amountBand: bigint;
  epoch: bigint;
  escrowCommit: string;
  recipientTag: string;
  viewTag: string;
  status: ReceiptStatus;
};

export type LedgerSnapshot = {
  governorPk: string;
  settlementColor: string;
  epoch: bigint;
  issuerCount: bigint;
  corridors: { from: bigint; to: bigint; open: boolean; maxBand: bigint; claimWindow: bigint }[];
  credentialsIssued: bigint;
  root: string;
  nullifiers: bigint;
  totalReceipts: bigint;
  claimedCount: bigint;
  refundedCount: bigint;
  bandVolume: bigint[];
  receipts: ReceiptView[];
  ownershipProofs: bigint;
};

export const snapshot = (l: Ledger): LedgerSnapshot => ({
  governorPk: toHex(l.governorPk),
  settlementColor: toHex(l.settlementColor),
  epoch: l.epoch,
  issuerCount: l.issuerCount,
  corridors: [...l.corridorPolicy].map(([k, p]) => ({
    from: k >> 16n,
    to: k & 0xffffn,
    open: p.open,
    maxBand: p.maxBand,
    claimWindow: p.claimWindow,
  })),
  credentialsIssued: l.credentials.firstFree(),
  root: l.credentials.root().field.toString(16).padStart(64, '0'),
  nullifiers: l.nullifiers.size(),
  totalReceipts: l.totalReceipts,
  claimedCount: l.claimedCount,
  refundedCount: l.refundedCount,
  bandVolume: [0n, 1n, 2n, 3n].map((b) => (l.bandVolume.member(b) ? l.bandVolume.lookup(b).read() : 0n)),
  receipts: [...l.receipts].map(([id, r]) => ({
    id: toHex(id),
    fromCountry: r.fromCountry,
    toCountry: r.toCountry,
    amountBand: r.amountBand,
    epoch: r.epoch,
    escrowCommit: toHex(r.escrowCommit),
    recipientTag: toHex(r.recipientTag),
    viewTag: toHex(r.viewTag),
    status: r.status,
  })),
  ownershipProofs: l.ownershipProofs.size(),
});

export type ShieldedCoin = { nonce: Uint8Array; color: Uint8Array; value: bigint };

export interface Backend {
  readonly kind: 'simulator' | 'midnight';
  readonly label: string;
  readonly contractAddress?: string;
  addIssuer(as: ZkRemitPrivateState, pk: Uint8Array): Promise<void>;
  issueCredential(as: ZkRemitPrivateState, commitment: Uint8Array): Promise<void>;
  setCorridorPolicy(
    as: ZkRemitPrivateState,
    from: bigint,
    to: bigint,
    policy?: Parameters<import('@zk-remit/contract').ZkRemitSimulator['setCorridorPolicy']>[2],
  ): Promise<void>;
  advanceEpoch(as: ZkRemitPrivateState): Promise<void>;
  sendRemittance(
    as: ZkRemitPrivateState,
    to: bigint,
    slot: bigint,
    recipientTag: Uint8Array,
    coin: ShieldedCoin,
    escrowSalt?: Uint8Array,
  ): Promise<{ receiptId: Uint8Array; txHash?: string }>;
  claim(as: ZkRemitPrivateState, receiptId: Uint8Array): Promise<{ txHash?: string }>;
  reclaim(as: ZkRemitPrivateState, receiptId: Uint8Array): Promise<{ txHash?: string }>;
  proveReceiptOwnership(as: ZkRemitPrivateState, receiptId: Uint8Array, challenge: Uint8Array): Promise<{ txHash?: string }>;
  ledger(): Promise<LedgerSnapshot>;
  /** Simulator-only: access private escrows for claim-link demos. */
  getEscrow?(receiptId: Uint8Array): { coin: ShieldedCoin & { mt_index: bigint }; salt: Uint8Array } | undefined;
  withEscrow?(as: ZkRemitPrivateState, receiptId: Uint8Array, opening: { coin: ShieldedCoin & { mt_index: bigint }; salt: Uint8Array }): void;
}
