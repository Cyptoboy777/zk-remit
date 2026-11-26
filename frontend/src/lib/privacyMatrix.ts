/*
 * What is public and what stays private for every action, stated once and used by the UI, the README
 * and the tests. It mirrors the ledger fields written by contract/src/zk-remit.compact. If a circuit
 * starts writing a new field, add it here; privacyMatrix.test.ts guards the invariants.
 */
export type ActionId = 'issue' | 'send' | 'claim' | 'reclaim' | 'audit';

export type Row = { what: string; note?: string };
export type ActionPrivacy = {
  id: ActionId;
  label: string;
  who: string;
  summary: string;
  public: Row[];
  private: Row[];
};

export const PRIVACY: ActionPrivacy[] = [
  {
    id: 'issue',
    label: 'Get a credential',
    who: 'KYC issuer',
    summary: 'A licensed issuer vouches for you once. Only a fingerprint of the credential is written on chain.',
    public: [
      { what: 'A credential commitment (a hash)', note: 'added to the credential tree' },
      { what: 'That a licensed issuer signed it', note: 'issuer identity is visible on this one step' },
    ],
    private: [
      { what: 'Your name, ID and documents', note: 'never leave the issuer and your device' },
      { what: 'Your tier, country and expiry' },
      { what: 'Your holder secret' },
    ],
  },
  {
    id: 'send',
    label: 'Send',
    who: 'Sender',
    summary: 'Your device proves you are allowed to send, then locks the value in a shielded escrow.',
    public: [
      { what: 'Corridor', note: 'from-country to to-country' },
      { what: 'Amount band', note: 'one of four ranges, never the exact figure' },
      { what: 'Epoch and a one-time nullifier', note: 'stops quota reuse without naming you' },
      { what: 'Blinded recipient tag and view tag' },
      { what: 'Status: waiting to be claimed' },
    ],
    private: [
      { what: 'Who you are' },
      { what: 'Exact amount', note: 'it lives in a shielded coin, not in contract state' },
      { what: 'Your credential, tier and issuer', note: 'proved in zero knowledge, not shown' },
      { what: 'Who the recipient is' },
    ],
  },
  {
    id: 'claim',
    label: 'Claim',
    who: 'Recipient',
    summary: 'The recipient proves they hold the claim link. The escrow pays out to their wallet.',
    public: [{ what: 'Receipt status changes to claimed' }, { what: 'Claimed counter goes up by one' }],
    private: [
      { what: 'Recipient identity and wallet link' },
      { what: 'Exact amount', note: 'still absent from contract state' },
      { what: 'The claim secret', note: 'it only ever lives in the link and on the recipient device' },
    ],
  },
  {
    id: 'reclaim',
    label: 'Reclaim',
    who: 'Sender',
    summary: 'If nobody claims within the corridor window, the sender proves the receipt is theirs and takes the value back.',
    public: [{ what: 'Receipt status changes to refunded' }, { what: 'Refunded counter goes up by one' }],
    private: [{ what: 'That this sender is you', note: 'proved with a view key, not named' }, { what: 'Exact amount' }],
  },
  {
    id: 'audit',
    label: 'Audit',
    who: 'Auditor',
    summary: 'A sender can prove one specific receipt is theirs to one auditor challenge, and nothing else.',
    public: [{ what: 'A hash of the receipt and the auditor challenge', note: 'a proof of ownership, not an identity' }],
    private: [
      { what: 'Sender identity' },
      { what: 'Every other receipt of the same sender' },
      { what: 'Exact amount' },
    ],
  },
];

export const privacyFor = (id: ActionId): ActionPrivacy => PRIVACY.find((a) => a.id === id) ?? PRIVACY[1];

/** Four public amount bands, in cents, matching amountBandOf in the contract. */
export const BAND_EDGES_CENTS = [10000, 50000, 100000] as const;
export const bandOfCents = (cents: number): 0 | 1 | 2 | 3 =>
  cents <= BAND_EDGES_CENTS[0] ? 0 : cents <= BAND_EDGES_CENTS[1] ? 1 : cents <= BAND_EDGES_CENTS[2] ? 2 : 3;
