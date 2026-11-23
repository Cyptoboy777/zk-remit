import { ReceiptStatus } from '@zk-remit/contract';
import type { ReceiptView } from '../lib/types';
import { BAND_LABELS } from '../lib/disclosure';

const STATUS: Record<number, string> = {
  [ReceiptStatus.PENDING]: 'Waiting to be claimed',
  [ReceiptStatus.CLAIMED]: 'Claimed',
  [ReceiptStatus.REFUNDED]: 'Returned to sender',
};

const short = (h: string, n = 6) => (h.length > 2 * n ? `${h.slice(0, n)}…${h.slice(-n)}` : h);

/**
 * Shows the receipt exactly as the public ledger stores it, re-read after every step.
 * Only fields the contract disclosed appear here: no amount, no names, no identity.
 */
export function ChainReadback({
  receipt,
  source,
  readAt,
  iso2,
}: {
  receipt?: ReceiptView;
  source: 'preview' | 'simulator';
  readAt: Date | null;
  iso2: (c: bigint) => string;
}) {
  const where = source === 'preview' ? 'Read from Midnight Preview' : 'Read from the simulator ledger';
  return (
    <section className="readback" aria-live="polite" aria-label="What the public ledger shows">
      <header>
        <span className={`dot ${receipt ? 'on' : ''}`} aria-hidden />
        <p className="eyebrow">What the public ledger shows</p>
        <p className="fine muted">{where}{readAt ? ` · ${readAt.toLocaleTimeString()}` : ''}</p>
      </header>
      {receipt ? (
        <dl>
          <div><dt>Status</dt><dd>{STATUS[receipt.status] ?? 'Unknown'}</dd></div>
          <div><dt>Corridor</dt><dd>{iso2(receipt.fromCountry)} → {iso2(receipt.toCountry)}</dd></div>
          <div><dt>Amount band</dt><dd>{BAND_LABELS[Number(receipt.amountBand)] ?? '—'}</dd></div>
          <div><dt>Epoch</dt><dd className="mono">{receipt.epoch.toString()}</dd></div>
          <div><dt>Receipt</dt><dd className="mono">{short(receipt.id)}</dd></div>
          <div><dt>Escrow seal</dt><dd className="mono">{short(receipt.escrowCommit)}</dd></div>
        </dl>
      ) : (
        <p className="muted">Not on the ledger yet. It appears here as soon as the network records it.</p>
      )}
      <p className="fine muted">Exact amount, sender identity and recipient stay private.</p>
    </section>
  );
}
