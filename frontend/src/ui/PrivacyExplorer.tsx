import { useId, useState } from 'react';
import { PRIVACY, bandOfCents, privacyFor, type ActionId } from '../lib/privacyMatrix';
import { BAND_LABELS } from '../lib/disclosure';

/**
 * Interactive "who sees what". Pick an action to see what the public ledger learns and what stays
 * sealed, then drag the amount to watch the public band change while the exact figure stays on this device.
 */
export function PrivacyExplorer({ initial = 'send' as ActionId }: { initial?: ActionId }) {
  const [id, setId] = useState<ActionId>(initial);
  const [dollars, setDollars] = useState(420);
  const sliderId = useId();
  const a = privacyFor(id);
  const band = bandOfCents(Math.round(dollars * 100));

  return (
    <section className="card explorer" aria-labelledby="explorer-title">
      <p className="eyebrow">Who sees what</p>
      <h2 id="explorer-title">Public on the ledger, sealed everywhere else</h2>
      <div className="seg" role="group" aria-label="Choose an action">
        {PRIVACY.map((p) => (
          <button key={p.id} type="button" className={p.id === id ? 'on' : ''} aria-pressed={p.id === id} onClick={() => setId(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="explorer-sum" aria-live="polite">
        <strong>{a.who}.</strong> {a.summary}
      </p>
      <div className="explorer-cols" key={id}>
        <div className="col pub">
          <span className="pill">Public</span>
          <ul>
            {a.public.map((r) => (
              <li key={r.what}>
                <span>{r.what}</span>
                {r.note && <em>{r.note}</em>}
              </li>
            ))}
          </ul>
        </div>
        <div className="col sealed">
          <span className="pill tone-warn">Sealed</span>
          <ul>
            {a.private.map((r) => (
              <li key={r.what}>
                <span>{r.what}</span>
                {r.note && <em>{r.note}</em>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {(id === 'send' || id === 'claim') && (
        <div className="band-demo">
          <label htmlFor={sliderId}>
            Try an amount <strong className="mono">${dollars.toLocaleString('en-US')}</strong>
          </label>
          <input id={sliderId} type="range" min={5} max={5000} step={5} value={dollars} onChange={(e) => setDollars(Number(e.target.value))} />
          <div className="band-bars" aria-hidden>
            {BAND_LABELS.map((l, i) => (
              <i key={l} className={i === band ? 'on' : ''} />
            ))}
          </div>
          <p className="fine">
            The ledger would learn only <strong className="mono">{BAND_LABELS[band]}</strong>. The exact{' '}
            <span className="mono">${dollars.toLocaleString('en-US')}</span> never leaves your device.
          </p>
        </div>
      )}
    </section>
  );
}
