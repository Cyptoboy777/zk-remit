/** Deterministic "what will be revealed" map — mirrors Compact disclose() sites in sendRemittance. */
export type DisclosureMap = {
  public: { key: string; value: string; why: string }[];
  private: { key: string; why: string }[];
};

export const BAND_LABELS = ['≤ $100', '$100–$500', '$500–$1,000', '$1,000–$5,000'] as const;

export function amountBandOf(cents: number): number {
  if (cents <= 10000) return 0;
  if (cents <= 50000) return 1;
  if (cents <= 100000) return 2;
  return 3;
}

export function buildDisclosure(input: {
  fromCountry: string;
  toCountry: string;
  amountCents: number;
  epoch: number;
}): DisclosureMap {
  const band = amountBandOf(input.amountCents);
  return {
    public: [
      { key: 'corridor', value: `${input.fromCountry} → ${input.toCountry}`, why: 'Licensed corridor is public policy.' },
      { key: 'amountBand', value: BAND_LABELS[band] ?? String(band), why: 'Regulators see a band, not the exact amount.' },
      { key: 'epoch', value: String(input.epoch), why: 'Compliance window for quotas and expiry.' },
      { key: 'nullifier', value: '(unlinkable one-time id)', why: 'Proves this slot was used without linking the holder.' },
      { key: 'escrowCommit', value: '(commitment)', why: 'Binds the shielded coin without publishing its nonce.' },
      { key: 'recipientTag', value: '(blinded)', why: 'Only the claim key holder can match it.' },
      { key: 'status', value: 'PENDING', why: 'Claim / reclaim progress is public.' },
    ],
    private: [
      { key: 'exactAmount', why: 'Hidden inside the shielded coin / escrow commitment.' },
      { key: 'senderIdentity', why: 'Holder secret and credential never leave the device.' },
      { key: 'kycTier', why: 'Proven against corridor caps without disclosure.' },
      { key: 'whichIssuer', why: 'Issuer pk is in the credential leaf; only the issuer-tree root is checked.' },
      { key: 'recipientWallet', why: 'Claim uses recipientSecret; payout coin is unlinkable.' },
      { key: 'otherTransfers', why: 'Nullifiers are epoch-scoped and unlinkable across epochs.' },
    ],
  };
}
