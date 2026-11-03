import type { LedgerSnapshot } from './types';

/** k-anonymity from public ledger only: receipts sharing corridor + band + epoch. */
export function anonymitySetSize(
  snap: LedgerSnapshot,
  from: bigint,
  to: bigint,
  band: number,
  epoch?: bigint,
): { k: number; cohort: number; risk: 'low' | 'medium' | 'high' } {
  const ep = epoch ?? snap.epoch;
  const cohort = snap.receipts.filter(
    (r) => r.fromCountry === from && r.toCountry === to && Number(r.amountBand) === band && r.epoch === ep,
  ).length;
  // After your send you would be cohort+1 if not yet included; use max(cohort,1) for preview.
  const k = Math.max(cohort, 1);
  const risk = k >= 8 ? 'low' : k >= 3 ? 'medium' : 'high';
  return { k, cohort, risk };
}
