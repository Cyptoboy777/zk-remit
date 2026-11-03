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

type Tab = 'home' | 'send' | 'claim' | 'issuer' | 'auditor' | 'sim' | 'whatsnew';

const COUNTRIES: Record<string, { name: string; flag: string; iso: string }> = {
  '784': { name: 'United Arab Emirates', flag: '🇦🇪', iso: 'ARE' },
  '608': { name: 'Philippines', flag: '🇵🇭', iso: 'PHL' },
  '840': { name: 'United States', flag: '🇺🇸', iso: 'USA' },
  '484': { name: 'Mexico', flag: '🇲🇽', iso: 'MEX' },
  '826': { name: 'United Kingdom', flag: '🇬🇧', iso: 'GBR' },
  '566': { name: 'Nigeria', flag: '🇳🇬', iso: 'NGA' },
  '276': { name: 'Germany', flag: '🇩🇪', iso: 'DEU' },
  '792': { name: 'Türkiye', flag: '🇹🇷', iso: 'TUR' },
  '702': { name: 'Singapore', flag: '🇸🇬', iso: 'SGP' },
  '360': { name: 'Indonesia', flag: '🇮🇩', iso: 'IDN' },
  '682': { name: 'Saudi Arabia', flag: '🇸🇦', iso: 'SAU' },
  '586': { name: 'Pakistan', flag: '🇵🇰', iso: 'PAK' },
  '724': { name: 'Spain', flag: '🇪🇸', iso: 'ESP' },
  '170': { name: 'Colombia', flag: '🇨🇴', iso: 'COL' },
};
const cn = (c: bigint) => COUNTRIES[c.toString()] ?? { name: `#${c}`, flag: '🏳️', iso: String(c) };
const short = (h: string, n = 6) => (h.length > 2 * n ? `${h.slice(0, n)}…${h.slice(-n)}` : h);

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
        // from Sent list — use backend escrow
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

  if (tab === 'sim') return <PrivacySimulator locale={locale} onBack={() => setTab('home')} />;

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      {!CONFIGURED_ADDRESS && (
        <div className="banner" role="status">{t(locale, 'testnet_banner')}</div>
      )}
      <header className="top">
        <div className="brand" onClick={() => setTab('home')} role="button" tabIndex={0}>
          <img src={`${import.meta.env.BASE_URL}brand/logo-mark-mono-white.svg`} alt="" width={36} height={36} />
          <div>
            <strong>ZK Remit</strong>
            <span className="tag">{t(locale, 'tagline')}</span>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          {(['home', 'send', 'claim', 'issuer', 'auditor', 'sim', 'whatsnew'] as Tab[]).map((id) => (
            <button key={id} type="button" className={tab === id ? 'nav-link on' : 'nav-link'} onClick={() => setTab(id)}>
              {t(locale, id === 'home' ? 'nav_home' : id === 'send' ? 'nav_send' : id === 'claim' ? 'nav_claim' : id === 'issuer' ? 'nav_issuer' : id === 'auditor' ? 'nav_auditor' : id === 'sim' ? 'nav_sim' : 'nav_whatsnew')}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <label className="lang">
            <span className="sr">{t(locale, 'lang')}</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label={t(locale, 'lang')}>
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </label>
          <span className={`pill ${backend.kind}`}>{backend.kind === 'simulator' ? t(locale, 'mode_sim') : t(locale, 'mode_network')}</span>
          <button type="button" className="btn ghost" onClick={resetSim}>Reset</button>
        </div>
      </header>

      <main id="main" className="main">
        {tab === 'home' && (
          <section className="hero-panel">
            <div className="hero-copy">
              <p className="eyebrow">Midnight WaveHack · Wave 3</p>
              <h1>{t(locale, 'tagline')}</h1>
              <p className="lede">
                Shielded escrow, corridor policy and multi-issuer attestations in one Compact contract.
                The ledger sees the corridor and amount band. Your identity and exact amount stay sealed.
              </p>
              <div className="hero-cta">
                <button type="button" className="btn primary" onClick={() => { void seedDemo(); setTab('send'); }} disabled={!!busy}>
                  {setupDone ? t(locale, 'send') : t(locale, 'setup')}
                </button>
                <button type="button" className="btn" onClick={() => setTab('sim')}>{t(locale, 'nav_sim')}</button>
              </div>
              <ul className="corridor-strip">
                {['US→MX', 'AE→PH', 'UK→NG', 'DE→TR', 'SG→ID', 'SA→PK', 'ES→CO'].map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div className="envelope" aria-hidden>
              <div className="env-out">
                <span>Outside</span>
                <p>AE → PH · {BAND_LABELS[1]} · epoch 1</p>
              </div>
              <div className="env-in">
                <span>Sealed</span>
                <p>$███.██ · name · tier · issuer</p>
              </div>
            </div>
          </section>
        )}

        {tab === 'send' && (
          <section className="panel-grid">
            <div className="card">
              <h2>{t(locale, 'nav_send')}</h2>
              {!setupDone && (
                <button type="button" className="btn primary" onClick={() => void seedDemo()} disabled={!!busy}>{t(locale, 'setup')}</button>
              )}
              <label>
                Amount (USD)
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              </label>
              <label>
                Destination
                <select value={toCountry} onChange={(e) => setToCountry(e.target.value)}>
                  {Object.entries(COUNTRIES).map(([code, c]) => (
                    <option key={code} value={code}>{c.flag} {c.name}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn primary" disabled={!!busy || !setupDone} onClick={() => void doSend()}>
                {busy ?? t(locale, 'send')}
              </button>
            </div>
            <div className="card">
              <h3>{t(locale, 'disclose_title')}</h3>
              <div className="env-split">
                <div>
                  <h4>{t(locale, 'disclose_public')}</h4>
                  <ul>{disclosure.public.map((p) => <li key={p.key}><code>{p.key}</code> {p.value}</li>)}</ul>
                </div>
                <div>
                  <h4>{t(locale, 'disclose_private')}</h4>
                  <ul>{disclosure.private.map((p) => <li key={p.key}><code>{p.key}</code></li>)}</ul>
                </div>
              </div>
              <div className={`risk risk-${anon.risk}`}>
                {t(locale, 'risk_title')}: k≈{anon.k} · {t(locale, `risk_${anon.risk}` as 'risk_low')}
              </div>
            </div>
            {sent[0] && (
              <div className="card">
                <h3>Claim link / QR</h3>
                <p className="mono break">{sent[0].link}</p>
                {sent[0].qr && <img src={sent[0].qr} alt="Claim QR code" width={180} height={180} />}
                <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(sent[0].link)}>Copy link</button>
              </div>
            )}
          </section>
        )}

        {tab === 'claim' && (
          <section className="card narrow">
            <h2>{t(locale, 'nav_claim')}</h2>
            <p className="muted">Open a claim link from the sender, or claim the latest simulator receipt.</p>
            {claimPayload && <p className="mono">Receipt {short(claimPayload.receiptId)}</p>}
            <button type="button" className="btn primary" disabled={!!busy} onClick={() => void doClaim()}>{busy ?? t(locale, 'claim')}</button>
          </section>
        )}

        {tab === 'issuer' && (
          <section className="card narrow">
            <h2>{t(locale, 'nav_issuer')}</h2>
            <p>Governor adds licensed issuers; issuers publish credential commitments only.</p>
            <button type="button" className="btn primary" disabled={!!busy || setupDone} onClick={() => void seedDemo()}>{t(locale, 'setup')}</button>
            {snap && (
              <dl className="stats">
                <div><dt>Issuers</dt><dd>{String(snap.issuerCount)}</dd></div>
                <div><dt>Credentials</dt><dd>{String(snap.credentialsIssued)}</dd></div>
                <div><dt>Corridors</dt><dd>{snap.corridors.filter((c) => c.open).length}</dd></div>
                <div><dt>Epoch</dt><dd>{String(snap.epoch)}</dd></div>
              </dl>
            )}
          </section>
        )}

        {tab === 'auditor' && (
          <section className="card">
            <h2>{t(locale, 'nav_auditor')}</h2>
            <p className="muted">Public aggregates only. Selective disclosure requires the sender’s view key or ownership proof.</p>
            {snap && (
              <>
                <dl className="stats">
                  <div><dt>Receipts</dt><dd>{String(snap.totalReceipts)}</dd></div>
                  <div><dt>Claimed</dt><dd>{String(snap.claimedCount)}</dd></div>
                  <div><dt>Refunded</dt><dd>{String(snap.refundedCount)}</dd></div>
                  <div><dt>Band volume</dt><dd>{snap.bandVolume.map(String).join(' / ')}</dd></div>
                </dl>
                <table className="table">
                  <thead><tr><th>Id</th><th>Corridor</th><th>Band</th><th>Status</th></tr></thead>
                  <tbody>
                    {snap.receipts.map((r) => (
                      <tr key={r.id}>
                        <td className="mono">{short(r.id)}</td>
                        <td>{cn(r.fromCountry).iso}→{cn(r.toCountry).iso}</td>
                        <td>{BAND_LABELS[Number(r.amountBand)]}</td>
                        <td>{ReceiptStatus[r.status] ?? r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}

        {tab === 'whatsnew' && (
          <section className="card narrow">
            <h2>{t(locale, 'nav_whatsnew')}</h2>
            <table className="table">
              <thead><tr><th>Metric</th><th>Before (wave2-baseline)</th><th>Wave 3</th></tr></thead>
              <tbody>
                <tr><td>Circuits</td><td>7</td><td>10 (+ reclaim, multi-issuer, policy)</td></tr>
                <tr><td>Value movement</td><td>None</td><td>Shielded escrow / claim / reclaim</td></tr>
                <tr><td>Corridors</td><td>Hard-coded open/close</td><td>On-chain CorridorPolicy</td></tr>
                <tr><td>Issuers</td><td>1</td><td>Many + revoke-at-issue</td></tr>
                <tr><td>UX</td><td>Basic tabs</td><td>Premium UI · claim QR · Privacy Simulator</td></tr>
                <tr><td>Deploy</td><td>Simulator only</td><td>Simulator live; Preview pending user faucet</td></tr>
              </tbody>
            </table>
            <p className="fine">Compare: <code>github.com/Cyptoboy777/zk-remit/compare/wave2-baseline...wave3</code></p>
          </section>
        )}

        <aside className="log card" aria-live="polite">
          <h3>Activity</h3>
          {log.length === 0 && <p className="muted">Actions appear here.</p>}
          <ul>{log.map((e, i) => (
            <li key={i} className={e.kind}><time>{e.t}</time> <strong>{e.title}</strong>{e.detail && <span> — {e.detail}</span>}</li>
          ))}</ul>
        </aside>
      </main>

      <footer className="foot">
        <span>Apache-2.0 · Midnight Compact · {backend.label}</span>
        <span>{CONFIGURED_ADDRESS ? `Contract ${short(CONFIGURED_ADDRESS, 8)}` : 'Contract address: not set'}</span>
      </footer>
    </div>
  );
}
