import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  COUNTRY,
  TIER,
  makeCredential,
  pureCircuits,
  randomBytes,
  toHex,
  SETTLEMENT_COLOR,
  defaultPolicy,
  freshCoin,
  ReceiptStatus,
  type ZkRemitPrivateState,
} from '@zk-remit/contract';
import { SimulatorBackend } from './lib/simulatorBackend';
import { CONFIGURED_ADDRESS, MidnightBackend } from './lib/midnightBackend';
import type { Backend, LedgerSnapshot } from './lib/types';
import { buildDisclosure, BAND_LABELS, amountBandOf } from './lib/disclosure';
import { anonymitySetSize } from './lib/anonymity';
import { buildClaimHash, parseClaimHash, qrDataUrl, type ClaimPayload } from './lib/claimLink';
import { LOCALES, t, type Locale } from './lib/i18n';
import { fromHex } from './lib/codec';
import PrivacySimulator from './privacy/PrivacySimulator';
import { CorridorFlags, Flag } from './ui/flags';
import { ActivityList, statusOf } from './ui/ActivityList';

type Tab = 'home' | 'send' | 'claim' | 'issuer' | 'auditor' | 'sim' | 'whatsnew' | 'activity';

const COUNTRIES: Record<string, { name: string; iso: string; iso2: string }> = {
  '784': { name: 'United Arab Emirates', iso: 'ARE', iso2: 'AE' },
  '608': { name: 'Philippines', iso: 'PHL', iso2: 'PH' },
  '840': { name: 'United States', iso: 'USA', iso2: 'US' },
  '484': { name: 'Mexico', iso: 'MEX', iso2: 'MX' },
  '826': { name: 'United Kingdom', iso: 'GBR', iso2: 'GB' },
  '566': { name: 'Nigeria', iso: 'NGA', iso2: 'NG' },
  '276': { name: 'Germany', iso: 'DEU', iso2: 'DE' },
  '792': { name: 'Türkiye', iso: 'TUR', iso2: 'TR' },
  '702': { name: 'Singapore', iso: 'SGP', iso2: 'SG' },
  '360': { name: 'Indonesia', iso: 'IDN', iso2: 'ID' },
  '682': { name: 'Saudi Arabia', iso: 'SAU', iso2: 'SA' },
  '586': { name: 'Pakistan', iso: 'PAK', iso2: 'PK' },
  '724': { name: 'Spain', iso: 'ESP', iso2: 'ES' },
  '170': { name: 'Colombia', iso: 'COL', iso2: 'CO' },
};

/** Display UK rather than GB for the United Kingdom, matching the mockups. */
const iso2of = (c: bigint) => {
  const row = COUNTRIES[c.toString()];
  if (!row) return String(c);
  return row.iso2 === 'GB' ? 'UK' : row.iso2;
};
const cn = (c: bigint) => COUNTRIES[c.toString()] ?? { name: `#${c}`, iso: String(c), iso2: String(c) };
const short = (h: string, n = 6) => (h.length > 2 * n ? `${h.slice(0, n)}…${h.slice(-n)}` : h);

const CORRIDORS: { from: bigint; to: bigint }[] = [
  { from: COUNTRY.USA, to: COUNTRY.MEXICO },
  { from: COUNTRY.UAE, to: COUNTRY.PHILIPPINES },
  { from: COUNTRY.UK, to: COUNTRY.NIGERIA },
  { from: COUNTRY.GERMANY, to: COUNTRY.TURKIYE },
  { from: COUNTRY.SINGAPORE, to: COUNTRY.INDONESIA },
  { from: COUNTRY.SAUDI, to: COUNTRY.PAKISTAN },
  { from: COUNTRY.SPAIN, to: COUNTRY.COLOMBIA },
];

const TIER_LABEL: Record<string, string> = { '1': 'Basic', '2': 'Verified', '3': 'Enhanced' };

const NAV: { id: Tab; label: 'nav_home' | 'nav_send' | 'nav_claim' | 'nav_issuer' | 'nav_auditor' | 'nav_sim' | 'nav_whatsnew' }[] = [
  { id: 'home', label: 'nav_home' },
  { id: 'send', label: 'nav_send' },
  { id: 'claim', label: 'nav_claim' },
  { id: 'issuer', label: 'nav_issuer' },
  { id: 'auditor', label: 'nav_auditor' },
  { id: 'sim', label: 'nav_sim' },
  { id: 'whatsnew', label: 'nav_whatsnew' },
];

type Personas = { governor: ZkRemitPrivateState; issuer: ZkRemitPrivateState; sender: ZkRemitPrivateState; recipient: ZkRemitPrivateState };
type Sent = { id: string; amount: bigint; link: string; qr?: string };

const freshPersonas = (): Personas => {
  const governorSecret = randomBytes();
  const issuerSecret = randomBytes();
  return {
    governor: { governorSecret },
    issuer: { issuerSecret },
    sender: { holderSecret: randomBytes() },
    recipient: { recipientSecret: randomBytes() },
  };
};

const errMsg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  const zkr = m.match(/ZK(R| Remit):[^"\n]*/);
  return zkr ? zkr[0] : m;
};

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [personas, setPersonas] = useState<Personas>(freshPersonas);
  const [backend, setBackend] = useState<Backend>(() => new SimulatorBackend(personas.governor.governorSecret!));
  const [snap, setSnap] = useState<LedgerSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>(() => (parseClaimHash(location.hash) ? 'claim' : 'home'));
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ t: string; kind: 'ok' | 'err' | 'info'; title: string; detail?: string }[]>([]);
  const [amount, setAmount] = useState('420');
  const [toCountry, setToCountry] = useState(String(COUNTRY.PHILIPPINES));
  const [sent, setSent] = useState<Sent[]>([]);
  const [claimPayload, setClaimPayload] = useState<ClaimPayload | null>(() => parseClaimHash(location.hash));
  const [setupDone, setSetupDone] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const refresh = useCallback(async () => setSnap(await backend.ledger()), [backend]);
  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  useEffect(() => {
    const onHash = () => {
      const p = parseClaimHash(location.hash);
      if (p) { setClaimPayload(p); setTab('claim'); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const push = (kind: 'ok' | 'err' | 'info', title: string, detail?: string) =>
    setLog((l) => [{ t: new Date().toLocaleTimeString(), kind, title, detail }, ...l].slice(0, 40));

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const d = await fn();
      push('ok', label, d || undefined);
    } catch (e) {
      push('err', `${label} — rejected`, errMsg(e));
    } finally {
      setBusy(null);
      await refresh().catch(() => undefined);
    }
  };

  const resetSim = () => {
    const p = freshPersonas();
    setPersonas(p);
    setBackend(new SimulatorBackend(p.governor.governorSecret!));
    setSent([]);
    setSetupDone(false);
    setLog([]);
    push('info', 'New simulator contract', 'Governor key rotated · epoch 1 · empty trees');
  };

  const seedDemo = () =>
    run(t(locale, 'setup'), async () => {
      const issuerPk = pureCircuits.issuerPublicKey(personas.issuer.issuerSecret!);
      await backend.addIssuer(personas.governor, issuerPk);
      await backend.setCorridorPolicy(personas.governor, COUNTRY.UAE, COUNTRY.PHILIPPINES, defaultPolicy());
      await backend.setCorridorPolicy(personas.governor, COUNTRY.USA, COUNTRY.MEXICO, defaultPolicy());
      await backend.setCorridorPolicy(personas.governor, COUNTRY.UK, COUNTRY.NIGERIA, defaultPolicy());
      await backend.setCorridorPolicy(personas.governor, COUNTRY.GERMANY, COUNTRY.TURKIYE, defaultPolicy());
      await backend.setCorridorPolicy(personas.governor, COUNTRY.SINGAPORE, COUNTRY.INDONESIA, defaultPolicy());
      await backend.setCorridorPolicy(personas.governor, COUNTRY.SAUDI, COUNTRY.PAKISTAN, defaultPolicy());
      await backend.setCorridorPolicy(personas.governor, COUNTRY.SPAIN, COUNTRY.COLOMBIA, defaultPolicy());
      const cred = makeCredential(personas.sender.holderSecret!, issuerPk, TIER.VERIFIED, COUNTRY.UAE, 12n);
      await backend.issueCredential(personas.issuer, pureCircuits.credentialCommitment(cred));
      setPersonas((p) => ({ ...p, sender: { ...p.sender, credential: cred } }));
      setSetupDone(true);
      return `Issuer ${short(toHex(issuerPk))} · 7 corridors · credential issued`;
    });

  const cents = Math.round(parseFloat(amount || '0') * 100);
  const disclosure = useMemo(
    () =>
      buildDisclosure({
        fromCountry: cn(COUNTRY.UAE).name,
        toCountry: cn(BigInt(toCountry)).name,
        amountCents: cents,
        epoch: Number(snap?.epoch ?? 1n),
      }),
    [cents, toCountry, snap?.epoch],
  );
  const anon = useMemo(
    () => anonymitySetSize(snap ?? ({ receipts: [], epoch: 1n } as unknown as LedgerSnapshot), COUNTRY.UAE, BigInt(toCountry), amountBandOf(cents)),
    [snap, toCountry, cents],
  );

  const doSend = () =>
    run(t(locale, 'send'), async () => {
      if (!personas.sender.credential) throw new Error('Seed the demo first (issuer + credential).');
      const coin = freshCoin(BigInt(cents), SETTLEMENT_COLOR);
      const tag = pureCircuits.recipientTagOf(personas.recipient.recipientSecret!);
      const { receiptId } = await backend.sendRemittance(personas.sender, BigInt(toCountry), 0n, tag, coin);
      const opening = backend.getEscrow?.(receiptId);
      if (!opening) throw new Error('Escrow opening missing from private state');
      const payload: ClaimPayload = {
        v: 3,
        receiptId: toHex(receiptId),
        coin: { nonce: toHex(opening.coin.nonce), color: toHex(opening.coin.color), value: String(opening.coin.value) },
        salt: toHex(opening.salt),
        recipientSecret: toHex(personas.recipient.recipientSecret!),
        network: 'simulator',
      };
      const hash = buildClaimHash(payload);
      const link = `${location.origin}${location.pathname}${hash}`;
      const qr = await qrDataUrl(link);
      setSent((s) => [{ id: toHex(receiptId), amount: BigInt(cents), link, qr }, ...s]);
      return `Receipt ${short(toHex(receiptId))} · claim link ready`;
    });

  const doClaim = () =>
    run(t(locale, 'claim'), async () => {
      const p = claimPayload ?? sent[0];
      if (!p) throw new Error('No claim payload');
      const payload: ClaimPayload =
        'receiptId' in p && 'coin' in (p as ClaimPayload)
          ? (p as ClaimPayload)
          : {
              v: 3,
              receiptId: (p as Sent).id,
              coin: { nonce: '', color: '', value: '' },
              salt: '',
              recipientSecret: toHex(personas.recipient.recipientSecret!),
              network: 'simulator',
            };
      if (!payload.coin.nonce) {
        const id = fromHex(payload.receiptId);
        const opening = backend.getEscrow?.(id);
        if (!opening) throw new Error('Open the claim link from the sender device, or use the QR.');
        backend.withEscrow?.(personas.recipient, id, opening);
        await backend.claim(personas.recipient, id);
        return `Claimed ${short(payload.receiptId)}`;
      }
      const id = fromHex(payload.receiptId);
      const opening = {
        coin: {
          nonce: fromHex(payload.coin.nonce),
          color: fromHex(payload.coin.color),
          value: BigInt(payload.coin.value),
          mt_index: 0n,
        },
        salt: fromHex(payload.salt),
      };
      const recipient = { recipientSecret: fromHex(payload.recipientSecret) };
      backend.withEscrow?.(recipient, id, opening);
      await backend.claim(recipient, id);
      return `Claimed ${short(payload.receiptId)}`;
    });

  const receipts = snap?.receipts ?? [];
  const go = (id: Tab) => { setMoreOpen(false); setTab(id); };
  const startDemo = () => { void seedDemo(); setTab('send'); };
  const pickCorridor = (to: bigint) => { setToCountry(String(to)); setTab('send'); };

  const toIso = iso2of(BigInt(toCountry));
  const bandLabel = BAND_LABELS[amountBandOf(cents)] ?? BAND_LABELS[1];
  const cred = personas.sender.credential;
  const credHash = cred ? short(toHex(pureCircuits.credentialCommitment(cred))) : null;
  const credTier = cred ? TIER_LABEL[String(cred.tier)] ?? 'Verified' : null;

  const waiting = claimPayload ?? sent[0];
  const waitingId = waiting ? ('receiptId' in waiting && typeof (waiting as ClaimPayload).receiptId === 'string' ? (waiting as ClaimPayload).receiptId : (waiting as Sent).id) : null;
  const waitingAmount = waiting
    ? 'amount' in waiting && (waiting as Sent).amount !== undefined
      ? (waiting as Sent).amount
      : (waiting as ClaimPayload).coin?.value
        ? BigInt((waiting as ClaimPayload).coin.value)
        : sent.find((s) => s.id === waitingId)?.amount
    : undefined;
  const waitingReceipt = waitingId ? receipts.find((r) => r.id === waitingId) : undefined;
  const unsealed = waitingReceipt?.status === ReceiptStatus.CLAIMED;

  const sending = !!busy && (busy === t(locale, 'send') || /send/i.test(busy));
  const sendStep = !setupDone ? 4 : sending ? 4 : 3;

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <div className="brand" onClick={() => go('home')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') go('home'); }}>
          <span className="mark" aria-hidden>Z</span>
          <strong>ZK Remit</strong>
          {!CONFIGURED_ADDRESS && (
            <span className="pill demo" role="status">{t(locale, 'testnet_banner')}</span>
          )}
        </div>
        <div className="top-actions">
          <label className="lang">
            <span className="sr">{t(locale, 'lang')}</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label={t(locale, 'lang')}>
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn ghost quiet" onClick={resetSim}>Reset</button>
        </div>
      </header>
      <nav className="nav" aria-label="Primary">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'nav-link on' : 'nav-link'}
            onClick={() => go(item.id)}
          >
            {t(locale, item.label)}
          </button>
        ))}
      </nav>

      <main id="main" className="main">
        <div className="stage" key={tab}>

        {tab === 'home' && (
          <>
            <section className="home-hero">
              <div className="hero-copy">
                <p className="eyebrow">Private by design · Global by nature</p>
                <h1>
                  <span className="h-mobile">Private by design</span>
                  <span className="h-desk">Send value across borders. Prove compliance. Reveal nothing else.</span>
                </h1>
                <p className="lede lede-mobile">Send value across borders. Prove compliance. Reveal nothing else.</p>
                <p className="lede">Move money with the confidence of a proof, and the privacy of a sealed envelope.</p>
                <div className="hero-cta">
                  <button type="button" className="btn primary" onClick={startDemo} disabled={!!busy}>
                    Start a demo transfer
                  </button>
                  <button type="button" className="text-link" onClick={() => go('sim')}>Privacy Simulator ↗</button>
                </div>
              </div>
              <aside className="seal-hero" aria-hidden>
                <p className="seal-kicker">A remittance, carefully sealed</p>
                <div className="seal-body">
                  <div className="seal-public">
                    <span className="eyebrow">Public view</span>
                    <p className="seal-corridor"><CorridorFlags from="AE" to="PH" /></p>
                    <span className="eyebrow">Amount band</span>
                    <p className="mono band">{BAND_LABELS[1].replace('–', ' — ')}</p>
                  </div>
                  <div className="seal-private">
                    <span className="eyebrow">Sealed content</span>
                    <p className="redact-block" />
                    <p className="fine">Identity hidden</p>
                    <p className="fine">Exact amount hidden</p>
                  </div>
                </div>
                <p className="seal-foot mono">Midnight · Zero-knowledge proof</p>
              </aside>
              <ul className="corridor-strip">
                {CORRIDORS.map((c) => (
                  <li key={`${c.from}-${c.to}`}>
                    <button type="button" className="chip corridor" onClick={() => pickCorridor(c.to)}>
                      <CorridorFlags from={iso2of(c.from)} to={iso2of(c.to)} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <ActivityList receipts={receipts} iso2={iso2of} limit={5} onViewAll={() => go('activity')} />
          </>
        )}

        {tab === 'send' && (
          <section className="send-layout">
            <div className="send-main">
              <p className="eyebrow">New transfer</p>
              <h1 className="page-title">Send privately</h1>
              <p className="lede">A compliant transfer, with only the essentials on-chain.</p>

              <ol className="steps" aria-label="Transfer steps">
                {[
                  { n: '01', title: 'Recipient', note: 'Demo recipient · claim link after send' },
                  { n: '02', title: 'Corridor', note: `${iso2of(COUNTRY.UAE)} → ${toIso}` },
                  { n: '03', title: 'Amount', note: cents ? `$${(cents / 100).toFixed(2)}` : 'Enter an amount' },
                  { n: '04', title: 'Credential', note: setupDone ? `${credTier ?? 'Verified'} · issued` : 'Seed the demo to issue' },
                ].map((s, i) => (
                  <li key={s.n} className={sendStep === i + 1 ? 'on' : i + 1 < sendStep ? 'done' : ''}>
                    <strong>{s.n}  {s.title}</strong>
                    <span>{s.note}</span>
                  </li>
                ))}
              </ol>
              <p className="step-mobile eyebrow">Step {sendStep} of 4 · {['Recipient', 'Corridor', 'Amount', 'Credential'][sendStep - 1]}</p>
              <div className="step-bar" aria-hidden><i style={{ width: `${(sendStep / 4) * 100}%` }} /></div>

              {!setupDone && (
                <button type="button" className="btn primary" onClick={() => void seedDemo()} disabled={!!busy}>
                  {busy ?? t(locale, 'setup')}
                </button>
              )}

              <div className="field-grid">
                <label className="field">
                  Amount to send
                  <span className="field-box amount">
                    <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount in USD" />
                    <span className="suffix">USD</span>
                  </span>
                </label>
                <label className="field">
                  Corridor
                  <span className="field-box">
                    <span className="field-prefix"><Flag iso="AE" /> AE  →</span>
                    <select value={toCountry} onChange={(e) => setToCountry(e.target.value)} aria-label="Destination country">
                      {Object.entries(COUNTRIES).map(([code, c]) => (
                        <option key={code} value={code}>{c.iso2 === 'GB' ? 'UK' : c.iso2} · {c.name}</option>
                      ))}
                    </select>
                  </span>
                </label>
              </div>

              <div className="field">
                <span className="field-label">Issuer credential</span>
                <div className="field-box static">
                  {setupDone
                    ? `Verified KYC · ${credTier ?? 'Verified'} · valid through epoch ${String(cred?.expiryEpoch ?? '—')} · ${credHash}`
                    : 'Seed the demo to issue a Verified credential for the sender.'}
                </div>
              </div>

              {sending && (
                <div className="proof-progress" role="status">
                  <strong>Generating zero-knowledge proof</strong>
                  <span>Checking corridor policy and credential…</span>
                  <div className="bar" aria-hidden><i /></div>
                </div>
              )}

              <button
                type="button"
                className="btn primary send-cta"
                disabled={!!busy || !setupDone || !cents}
                onClick={() => void doSend()}
              >
                {busy ?? t(locale, 'send')}
              </button>
            </div>

            <aside className="ledger-card">
              <h2>What the ledger sees</h2>
              <span className="pill">Public</span>
              <p className="eyebrow">Corridor</p>
              <p className="ledger-value"><CorridorFlags from="AE" to={toIso} /></p>
              <p className="eyebrow">Amount band</p>
              <p className="ledger-value mono">{bandLabel.replace('–', ' — ')}</p>
              <hr />
              <h2>What stays private</h2>
              <span className="pill tone-warn">Sealed</span>
              <ul className="private-list">
                <li><span>Recipient identity</span><em>Hidden</em></li>
                <li><span>Exact amount</span><em>Hidden</em></li>
                <li><span>Transfer note</span><em>Hidden</em></li>
              </ul>
              <p className="fine">Protected by Midnight zero-knowledge proofs. Anonymity set k≈{anon.k} · {t(locale, `risk_${anon.risk}` as 'risk_low')}</p>
            </aside>
            <ActivityList receipts={receipts} iso2={iso2of} limit={4} onViewAll={() => go('activity')} />
          </section>
        )}

        {tab === 'claim' && (
          <>
            <section className="claim-layout">
              <div>
                <p className="eyebrow">Private claim</p>
                <h1 className="page-title">{waiting ? 'A transfer is waiting for you.' : 'No transfer is waiting.'}</h1>
                <p className="lede">
                  {waiting
                    ? 'Your sender shared a secure claim link. Verify, then unseal.'
                    : 'Send a transfer first, or open a claim link from the sender.'}
                </p>
                {waiting && (
                  <div className={`unseal-card ${unsealed ? 'open' : ''}`}>
                    <p className="eyebrow accent">
                      {unsealed ? 'Claimed' : 'Proof ready'}
                      {waitingReceipt ? ` · ${iso2of(waitingReceipt.fromCountry)} → ${iso2of(waitingReceipt.toCountry)}` : ''}
                    </p>
                    <h2>{unsealed ? 'The envelope is open.' : 'The envelope is yours to open.'}</h2>
                    <div className="value-reveal">
                      <span className="eyebrow">Transfer value</span>
                      {unsealed && waitingAmount !== undefined ? (
                        <p className="mono amount-open">${(Number(waitingAmount) / 100).toFixed(2)} USD</p>
                      ) : (
                        <p className="redact-block wide" aria-label="Amount sealed until you claim" />
                      )}
                    </div>
                    {waitingId && <p className="mono fine">Receipt {short(waitingId)}</p>}
                    {!unsealed && (
                      <button type="button" className="btn primary" disabled={!!busy} onClick={() => void doClaim()}>
                        {busy ?? 'Claim transfer  →'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <aside className="qr-card">
                <p className="eyebrow">Secure claim link</p>
                {sent[0]?.qr ? (
                  <>
                    <img className="qr" src={sent[0].qr} alt="Claim QR code" width={190} height={190} />
                    <p className="mono break fine">{sent[0].link}</p>
                    <button type="button" className="btn ghost" onClick={() => navigator.clipboard.writeText(sent[0].link)}>Copy link</button>
                  </>
                ) : (
                  <p className="muted">A QR code appears here after you send a transfer in this session.</p>
                )}
              </aside>
            </section>
            <ActivityList receipts={receipts} iso2={iso2of} limit={5} onViewAll={() => go('activity')} />
          </>
        )}

        {tab === 'issuer' && (
          <>
            <section className="page-head">
              <p className="eyebrow">Credential issuer</p>
              <h1 className="page-title">Issue with confidence.</h1>
              <p className="lede">Create reusable KYC attestations without exposing personal data.</p>
            </section>
            <div className="stat-row">
              <div className="stat-card">
                <div>
                  <strong className="mono">{String(snap?.credentialsIssued ?? 0)}</strong>
                  <span>Credentials issued</span>
                </div>
                <div>
                  <strong className="mono">{String(snap?.issuerCount ?? 0)}</strong>
                  <span>Licensed issuers</span>
                </div>
                <div>
                  <strong>{setupDone ? 'Verified' : '—'}</strong>
                  <span>Sender tier</span>
                </div>
              </div>
              <button type="button" className="cta-panel" disabled={!!busy || setupDone} onClick={() => void seedDemo()}>
                <strong>＋  Issue KYC credential</strong>
                <span>{setupDone ? 'A demo credential is already issued in this session.' : 'Seed the demo to add an issuer and issue a private attestation.'}</span>
              </button>
            </div>
            <section className="card table-card">
              <h2>Credentials</h2>
              {setupDone && cred && credHash ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Holder</th>
                      <th>Tier</th>
                      <th>Credential</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Demo sender</td>
                      <td><span className="pill">{credTier ?? 'Verified'}</span></td>
                      <td className="mono">{credHash}</td>
                      <td><span className="pill tone-ok">Active</span></td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="muted">No credentials yet. Issue a demo attestation to see it listed here — names are never stored, only a commitment.</p>
              )}
            </section>
            <ActivityList receipts={receipts} iso2={iso2of} limit={5} onViewAll={() => go('activity')} />
          </>
        )}

        {tab === 'auditor' && (
          <>
            <section className="page-head">
              <p className="eyebrow">Selective disclosure</p>
              <h1 className="page-title">A clear view, by consent.</h1>
              <p className="lede">Review only the fields that are public on the ledger. Everything else stays sealed without the sender’s view key.</p>
            </section>
            <div className="auditor-grid">
              <section className="card disclose-card">
                <h2>Public on the ledger</h2>
                <span className="pill">Protocol default</span>
                {receipts[0] ? (
                  <dl className="audit-dl">
                    <div><dt>Corridor</dt><dd><CorridorFlags from={iso2of(receipts[0].fromCountry)} to={iso2of(receipts[0].toCountry)} /></dd></div>
                    <div><dt>Amount band</dt><dd className="mono">{BAND_LABELS[Number(receipts[0].amountBand)]}</dd></div>
                    <div><dt>Status</dt><dd>{statusOf(receipts[0].status).label}</dd></div>
                    <div><dt>Epoch</dt><dd className="mono">{String(receipts[0].epoch)}</dd></div>
                  </dl>
                ) : (
                  <p className="muted">Send a transfer to inspect a real receipt’s public fields.</p>
                )}
                <hr />
                <dl className="audit-dl sealed">
                  <div><dt>Sender identity</dt><dd><span className="redact-inline" title="Sealed" aria-label="Sealed" /></dd></div>
                  <div><dt>Exact amount</dt><dd><span className="redact-inline" title="Sealed" aria-label="Sealed" /></dd></div>
                  <div><dt>Transfer note</dt><dd><span className="redact-inline" title="Sealed" aria-label="Sealed" /></dd></div>
                </dl>
              </section>
              <section className="card timeline-card">
                <h2>Audit timeline</h2>
                {log.length === 0 ? (
                  <p className="muted">Timeline entries appear when you seed, send, or claim in this session.</p>
                ) : (
                  <ol className="timeline">
                    {log.slice(0, 8).map((e, i) => (
                      <li key={`${e.t}-${i}`} className={e.kind}>
                        <strong>{e.title}</strong>
                        {e.detail && <span>{e.detail}</span>}
                        <time>{e.t}</time>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
            {snap && (
              <dl className="stats">
                <div><dt>Receipts</dt><dd>{String(snap.totalReceipts)}</dd></div>
                <div><dt>Claimed</dt><dd>{String(snap.claimedCount)}</dd></div>
                <div><dt>Refunded</dt><dd>{String(snap.refundedCount)}</dd></div>
                <div><dt>Band volume</dt><dd>{snap.bandVolume.map(String).join(' / ')}</dd></div>
              </dl>
            )}
            <ActivityList receipts={receipts} iso2={iso2of} onViewAll={() => go('activity')} />
          </>
        )}

        {tab === 'sim' && (
          <PrivacySimulator locale={locale} onBack={() => go('home')} />
        )}

        {tab === 'whatsnew' && (
          <section className="card narrow">
            <p className="eyebrow">Wave 3</p>
            <h1 className="page-title">{t(locale, 'nav_whatsnew')}</h1>
            <table className="table">
              <thead><tr><th>Metric</th><th>Before (wave2-baseline)</th><th>Wave 3</th></tr></thead>
              <tbody>
                <tr><td>Circuits</td><td>7</td><td>10 (+ reclaim, multi-issuer, policy)</td></tr>
                <tr><td>Value movement</td><td>None</td><td>Shielded escrow / claim / reclaim</td></tr>
                <tr><td>Corridors</td><td>Hard-coded open/close</td><td>On-chain CorridorPolicy</td></tr>
                <tr><td>Issuers</td><td>1</td><td>Many + revoke-at-issue</td></tr>
                <tr><td>UX</td><td>Basic tabs</td><td>Claim QR · Privacy Simulator</td></tr>
                <tr><td>Deploy</td><td>Simulator only</td><td>Simulator live; Preview pending user faucet</td></tr>
              </tbody>
            </table>
            <p className="fine">Compare: <code>github.com/Cyptoboy777/zk-remit/compare/wave2-baseline...wave3</code></p>
          </section>
        )}

        {tab === 'activity' && (
          <>
            <section className="page-head">
              <p className="eyebrow">Session log</p>
              <h1 className="page-title">Activity</h1>
              <p className="lede">Every row is from this simulator session. Nothing is pre-filled.</p>
            </section>
            <ActivityList receipts={receipts} iso2={iso2of} />
            <aside className="card log" aria-live="polite">
              <h2>Actions</h2>
              {log.length === 0 ? <p className="muted">Actions appear here.</p> : (
                <ul>{log.map((e, i) => (
                  <li key={i} className={e.kind}><time>{e.t}</time> <strong>{e.title}</strong>{e.detail && <span> — {e.detail}</span>}</li>
                ))}</ul>
              )}
            </aside>
          </>
        )}

        </div>
      </main>

      <footer className="foot">
        <span>Apache-2.0 · Midnight Compact · {backend.label}</span>
        <span>{CONFIGURED_ADDRESS ? `Contract ${short(CONFIGURED_ADDRESS, 8)}` : 'Midnight Preview'}</span>
      </footer>

      <nav className="dock" aria-label="Mobile">
        {([
          ['home', 'Home'],
          ['send', 'Send'],
          ['claim', 'Claim'],
          ['activity', 'Activity'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'on' : ''} onClick={() => go(id)}>{label}</button>
        ))}
        <button type="button" className={moreOpen || (tab !== 'home' && tab !== 'send' && tab !== 'claim' && tab !== 'activity') ? 'on' : ''} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>•••</button>
      </nav>
      {moreOpen && (
        <div className="sheet" role="dialog" aria-label="More">
          <button type="button" onClick={() => go('issuer')}>{t(locale, 'nav_issuer')}</button>
          <button type="button" onClick={() => go('auditor')}>{t(locale, 'nav_auditor')}</button>
          <button type="button" onClick={() => go('sim')}>{t(locale, 'nav_sim')}</button>
          <button type="button" onClick={() => go('whatsnew')}>{t(locale, 'nav_whatsnew')}</button>
          <button type="button" onClick={() => { setMoreOpen(false); resetSim(); }}>Reset demo</button>
        </div>
      )}
    </div>
  );
}
