import { useEffect, useState } from 'react';

/** Live feedback while a zero-knowledge proof is made: stage, elapsed seconds and a plain-language expectation. */
export function ProofProgress({ stage, live, label }: { stage: 'proving' | 'confirmed' | null; live: boolean; label: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    setSecs(0);
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [stage]);
  const confirming = live && stage === 'confirmed';
  const typical = live ? (confirming ? 'Usually under a minute' : 'Usually 20 to 60 seconds') : 'Usually a second or two';
  return (
    <div className="proof-progress" role="status" aria-live="polite">
      <strong>{confirming ? 'Confirming on Midnight Preview' : 'Generating private proof'}…</strong>
      <span>
        {label} · {secs}s · {typical}.{live && !confirming ? ' Lace may ask you to approve.' : ''}
      </span>
      <div className="bar" aria-hidden><i /></div>
    </div>
  );
}
