/*
 * Private state + witness implementations for the ZK Remit contract.
 *
 * Everything in ZkRemitPrivateState lives only on the user's device (browser
 * private-state provider / Lace). The Compact circuits consume these values as
 * witnesses: they are used inside the ZK proof and never reach the ledger unless
 * a circuit explicitly `disclose()`s a value derived from them.
 */
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Credential, Ledger } from './managed/zk-remit/contract/index.js';

export type ZkRemitPrivateState = {
  /** Only the KYC attestor holds this. */
  readonly issuerSecret?: Uint8Array;
  /** The remitter's long-term secret (never leaves the device). */
  readonly holderSecret?: Uint8Array;
  /** Credential issued off-chain by the KYC attestor; only its hash is on-chain. */
  readonly credential?: Credential;
  /** The beneficiary's claim secret. */
  readonly recipientSecret?: Uint8Array;
};

export const createPrivateState = (s: ZkRemitPrivateState = {}): ZkRemitPrivateState => ({ ...s });

const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`ZK Remit: private state is missing ${what}`);
  return v;
};

type Ctx = WitnessContext<Ledger, ZkRemitPrivateState>;

export const witnesses = {
  issuerSecret: ({ privateState }: Ctx): [ZkRemitPrivateState, Uint8Array] => [
    privateState,
    need(privateState.issuerSecret, 'issuerSecret'),
  ],
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
};
