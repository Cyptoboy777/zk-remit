import { ReceiptStatus } from '@zk-remit/contract';
import type { ReceiptView } from '../lib/types';
import { CorridorFlags } from './flags';

export const statusOf = (status: ReceiptStatus) => {
  if (status === ReceiptStatus.CLAIMED) return { label: 'Claimed', tone: 'ok' as const };
  if (status === ReceiptStatus.REFUNDED) return { label: 'Refunded', tone: 'warn' as const };
  return { label: 'Claimable', tone: 'info' as const };
};

const short = (h: string, n = 4) => (h.length > 2 * n ? `${h.slice(0, 2)}${h.slice(2, 2 + n)}…${h.slice(-n)}` : h);

export function ActivityList({
  receipts,
  iso2,
  limit,
  onViewAll,
  empty,
}: {
  receipts: ReceiptView[];
  iso2: (c: bigint) => string;
  limit?: number;
  onViewAll?: () => void;
  empty?: string;
}) {
  const rows = limit ? receipts.slice(0, limit) : receipts;
  return (
    <section className="activity card">
      <header className="activity-head">
        <h2>Recent activity</h2>
        {onViewAll && receipts.length > 0 && (
          <button type="button" className="text-link" onClick={onViewAll}>
            View all →
          </button>
        )}
      </header>
      {receipts.length === 0 ? (
        <p className="muted">{empty ?? 'No transfers yet. Activity appears here after you send or claim.'}</p>
      ) : (
        <ul className="activity-rows">
          {rows.map((r) => {
            const st = statusOf(r.status);
            return (
              <li key={r.id}>
                <span className="activity-main">
                  <CorridorFlags from={iso2(r.fromCountry)} to={iso2(r.toCountry)} />
                  <span className="muted"> · Remit</span>
                </span>
                <code className="mono activity-hash">{short(r.id)}</code>
                <span className={`pill tone-${st.tone}`}>{st.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
