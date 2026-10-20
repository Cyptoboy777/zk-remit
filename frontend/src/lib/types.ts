import type { Ledger, ZkRemitPrivateState } from '@zk-remit/contract';
import { toHex } from '@zk-remit/contract';

export type Persona = 'issuer' | 'sender' | 'recipient' | 'mallory';

export type ReceiptView = {
  id: string;
  fromCountry: bigint;
  toCountry: bigint;
  amountBand: bigint;
  epoch: bigint;
  amountCommit: string;
  recipientTag: string;
  viewTag: string;
  claimed: boolean;
};

export type LedgerSnapshot = {
  issuerPk: string;
  epoch: bigint;
  corridors: [bigint, bigint][];
  credentialsIssued: bigint;
  root: string;
  nullifiers: bigint;
  totalReceipts: bigint;
  bandVolume: bigint[];
  receipts: ReceiptView[];
  ownershipProofs: bigint;
};

export const snapshot = (l: Ledger): LedgerSnapshot => ({
  issuerPk: toHex(l.issuerPk),
  epoch: l.epoch,
  corridors: [...l.corridors].map((k) => [k >> 16n, k & 0xffffn] as [bigint, bigint]),
  credentialsIssued: l.credentials.firstFree(),
  root: l.credentials.root().field.toString(16).padStart(64, '0'),
  nullifiers: l.nullifiers.size(),
  totalReceipts: l.totalReceipts,
  bandVolume: [0n, 1n, 2n, 3n].map((b) => (l.bandVolume.member(b) ? l.bandVolume.lookup(b).read() : 0n)),
  receipts: [...l.receipts].map(([id, r]) => ({
    id: toHex(id),
    fromCountry: r.fromCountry,
    toCountry: r.toCountry,
    amountBand: r.amountBand,
    epoch: r.epoch,
    amountCommit: toHex(r.amountCommit),
    recipientTag: toHex(r.recipientTag),
    viewTag: toHex(r.viewTag),
    claimed: r.claimed,
  })),
  ownershipProofs: l.ownershipProofs.size(),
});

/** A backend executes ZK Remit circuits as a given persona (private state). */
export interface Backend {
  readonly kind: 'simulator' | 'midnight';
  readonly label: string;
  readonly contractAddress?: string;
  issueCredential(as: ZkRemitPrivateState, commitment: Uint8Array): Promise<void>;
  openCorridor(as: ZkRemitPrivateState, from: bigint, to: bigint): Promise<void>;
  advanceEpoch(as: ZkRemitPrivateState): Promise<void>;
  sendRemittance(
    as: ZkRemitPrivateState,
    to: bigint,
    amountCents: bigint,
    salt: Uint8Array,
    slot: bigint,
    recipientTag: Uint8Array,
  ): Promise<{ txHash?: string }>;
  claim(as: ZkRemitPrivateState, receiptId: Uint8Array, amountCents: bigint, salt: Uint8Array): Promise<{ txHash?: string }>;
  proveReceiptOwnership(as: ZkRemitPrivateState, receiptId: Uint8Array, challenge: Uint8Array): Promise<{ txHash?: string }>;
  ledger(): Promise<LedgerSnapshot>;
}
