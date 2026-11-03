/*
 * Private state + witness implementations for ZK Remit Wave 3.
 * Secrets never leave the device unless a circuit explicitly disclose()s a derived value.
 */
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Credential, EscrowOpening, Ledger } from './managed/zk-remit/contract/index.js';

export type EscrowRecord = {
  coin: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint };
  salt: Uint8Array;
};

export type ZkRemitPrivateState = {
  readonly governorSecret?: Uint8Array;
  readonly issuerSecret?: Uint8Array;
  readonly holderSecret?: Uint8Array;
  readonly credential?: Credential;
  readonly recipientSecret?: Uint8Array;
  /** Salt used for the most recent sendRemittance escrow commitment. */
  readonly escrowSaltValue?: Uint8Array;
  /** receiptId hex -> opening retained for claim/reclaim. */
  readonly escrows?: Record<string, EscrowRecord>;
};

export const createPrivateState = (s: ZkRemitPrivateState = {}): ZkRemitPrivateState => ({ ...s });

const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`ZK Remit: private state is missing ${what}`);
  return v;
};

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

type Ctx = WitnessContext<Ledger, ZkRemitPrivateState>;

export const witnesses = {
  governorSecret: ({ privateState }: Ctx): [ZkRemitPrivateState, Uint8Array] => [
    privateState,
    need(privateState.governorSecret, 'governorSecret'),
  ],
  issuerSecret: ({ privateState }: Ctx): [ZkRemitPrivateState, Uint8Array] => [
    privateState,
    need(privateState.issuerSecret, 'issuerSecret'),
  ],
  issuerPath: ({ privateState, ledger }: Ctx, pk: Uint8Array) => {
    const path = ledger.activeIssuers.findPathForLeaf(pk);
    if (!path) throw new Error('ZK Remit: issuer public key not found in activeIssuers tree');
    return [privateState, path] as [ZkRemitPrivateState, typeof path];
  },
  holderSecret: ({ privateState }: Ctx): [ZkRemitPrivateState, Uint8Array] => [
    privateState,
    need(privateState.holderSecret, 'holderSecret'),
  ],
  heldCredential: ({ privateState }: Ctx): [ZkRemitPrivateState, Credential] => [
    privateState,
    need(privateState.credential, 'credential'),
  ],
  credentialPath: ({ privateState, ledger }: Ctx, commitment: Uint8Array) => {
    const path = ledger.credentials.findPathForLeaf(commitment);
    if (!path) throw new Error('ZK Remit: credential commitment not found in issuer tree');
    return [privateState, path] as [ZkRemitPrivateState, typeof path];
  },
  recipientSecret: ({ privateState }: Ctx): [ZkRemitPrivateState, Uint8Array] => [
    privateState,
    need(privateState.recipientSecret, 'recipientSecret'),
  ],
  escrowSalt: ({ privateState }: Ctx): [ZkRemitPrivateState, Uint8Array] => [
    privateState,
    need(privateState.escrowSaltValue, 'escrowSaltValue'),
  ],
  escrowOpening: ({ privateState }: Ctx, receiptId: Uint8Array): [ZkRemitPrivateState, EscrowOpening] => {
    const rec = need(privateState.escrows, 'escrows')[toHex(receiptId)];
    if (!rec) throw new Error('ZK Remit: no escrow opening for this receipt');
    return [privateState, { coin: rec.coin, salt: rec.salt }];
  },
};
