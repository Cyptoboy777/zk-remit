import { useMemo, useState } from 'react';
import { pureCircuits, randomBytes, toHex } from '@zk-remit/contract';
import { fromHex } from '../lib/codec';
import type { ReceiptView } from '../lib/types';

const short = (h: string, n = 6) => (h.length > 2 * n ? `${h.slice(0, n)}…${h.slice(-n)}` : h);

/**
 * Two ways a sender can open a receipt to an auditor, both sender-controlled:
 *  A. challenge-bound ownership proof, recorded on the contract (reveals nothing about the sender);
 *  B. a read-only view key: the auditor recomputes the view tag of each receipt locally.
 */
export default function AuditPanel({
  receipts,
  sentIds,
  viewKeyHex,
  proofCount,
  busy,
  onProve,
}: {
  receipts: ReceiptView[];
  sentIds: string[];
  viewKeyHex: string | null;
  proofCount: bigint | undefined;
  busy: boolean;
  onProve: (receiptIdHex: string, challengeHex: string) => void;
}) {
  const [picked, setPicked] = useState('');
  const [challenge, setChallenge] = useState(() => toHex(randomBytes()));
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  const receiptId = picked || sentIds[0] || '';
  const challengeOk = /^[0-9a-fA-F]{64}$/.test(challenge.trim());

  const audit = useMemo(() => {
    const k = keyInput.trim().replace(/^0x/, '');
    if (!/^[0-9a-fA-F]{64}$/.test(k)) return null;
    const vk = fromHex(k);
    const matches = receipts.filter((r) => toHex(pureCircuits.viewTagOf(vk, fromHex(r.id))) === r.viewTag);
    return { matches, total: receipts.length };
  }, [keyInput, receipts]);

  return (
    <section className="card audit-panel">
      <h2>Disclose to an auditor</h2>
      <p className="muted">You choose what an auditor can verify. Nothing here reveals your identity or the exact amount.</p>

      <h3 className="audit-h">1 · Prove you sent a receipt</h3>
      {sentIds.length === 0 ? (
        <p className="muted">Send a transfer from this device first. Then you can prove you sent it.</p>
      ) : (
        <>
          <label>
            Receipt
            <select value={receiptId} onChange={(e) => setPicked(e.target.value)} aria-label="Receipt to disclose">
              {sentIds.map((id) => (
                <option key={id} value={id}>{short(id, 8)}</option>
              ))}
            </select>
          </label>
          <label>
            Auditor challenge
            <input value={challenge} onChange={(e) => setChallenge(e.target.value)} spellCheck={false} aria-label="Auditor challenge" />
          </label>
          <div className="audit-actions">
            <button type="button" className="btn ghost" onClick={() => setChallenge(toHex(randomBytes()))}>New challenge</button>
            <button type="button" className="btn primary" disabled={busy || !challengeOk || !receiptId} onClick={() => onProve(receiptId, challenge.trim())}>
              Prove I sent this
            </button>
          </div>
          {!challengeOk && <p className="fine">The challenge must be 64 hexadecimal characters.</p>}
        </>
      )}
      {proofCount !== undefined && <p className="fine">Ownership proofs recorded on the contract: {String(proofCount)}</p>}

      <hr />
      <h3 className="audit-h">2 · Share a read-only view key</h3>
      {viewKeyHex ? (
        <>
          <button type="button" className="btn ghost" onClick={() => setShowKey((v) => !v)} aria-expanded={showKey}>
            {showKey ? 'Hide my view key' : 'Show my view key'}
          </button>
          {showKey && <p className="mono break fine">{viewKeyHex}</p>}
        </>
      ) : (
        <p className="muted">A view key appears once this device has a sender identity.</p>
      )}
      <label>
        Auditor: paste a view key to see which receipts it opens
        <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} spellCheck={false} aria-label="View key" />
      </label>
      {audit && (
        <p className="fine" role="status">
          {audit.matches.length} of {audit.total} receipts on the ledger belong to this key.
          {audit.matches.length > 0 ? ` ${audit.matches.map((r) => short(r.id, 5)).join(', ')}` : ''}
        </p>
      )}
    </section>
  );
}
