import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  COUNTRY,
  TIER,
  makeCredential,
  pureCircuits,
  randomBytes,
  toHex,
  type Credential,
  type ZkRemitPrivateState,
} from '@zk-remit/contract';
import { SimulatorBackend } from './lib/simulatorBackend';
import type { Backend, LedgerSnapshot, ReceiptView } from './lib/types';
import { decode, encode, fromB64Url, fromHex, toB64Url } from './lib/codec';

/* ---------------------------------------------------------------- helpers */

const COUNTRIES: Record<string, { name: string; flag: string }> = {
  '784': { name: 'UAE', flag: '🇦🇪' },
  '356': { name: 'India', flag: '🇮🇳' },
  '840': { name: 'USA', flag: '🇺🇸' },
  '608': { name: 'Philippines', flag: '🇵🇭' },
  '826': { name: 'UK', flag: '🇬🇧' },
  '566': { name: 'Nigeria', flag: '🇳🇬' },
  '484': { name: 'Mexico', flag: '🇲🇽' },
};
const cn = (c: bigint) => COUNTRIES[c.toString()] ?? { name: `#${c}`, flag: '🏳️' };
const BANDS = ['≤ $100', '$100 – $500', '$500 – $1k', '$1k – $5k'];
const TIERS: Record<string, { name: string; cap: number; slots: number }> = {
  '1': { name: 'BASIC', cap: 200, slots: 3 },
  '2': { name: 'VERIFIED', cap: 1000, slots: 8 },
  '3': { name: 'ENHANCED', cap: 5000, slots: 20 },
};
const short = (h: string, n = 6) => (h.length > 2 * n ? `${h.slice(0, n)}…${h.slice(-n)}` : h);
const usdToCents = (s: string) => BigInt(Math.round(parseFloat(s || '0') * 100));
const cents = (c: bigint) => `$${(Number(c) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

type Personas = {
  issuer: ZkRemitPrivateState;
  sender: ZkRemitPrivateState;
  recipient: ZkRemitPrivateState;
  mallory: ZkRemitPrivateState;
};
type KycRecord = { name: string; doc: string; tier: bigint; country: bigint; expiry: bigint; commitment: string };
type Sent = { id: string; amount: bigint; salt: string; to: bigint; link: string };
type LogEntry = { t: string; kind: 'ok' | 'err' | 'info'; title: string; detail?: string };

const freshPersonas = (): Personas => ({
  issuer: { issuerSecret: randomBytes() },
  sender: { holderSecret: randomBytes() },
  recipient: { recipientSecret: randomBytes() },
  mallory: { holderSecret: randomBytes() },
});

const errMsg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  const zkr = m.match(/ZK(R| Remit):[^"\n]*/);
  return zkr ? zkr[0] : m;
};

/* ---------------------------------------------------------------- app */

type Tab = 'issuer' | 'sender' | 'recipient' | 'auditor' | 'attacks';

export default function App() {
  const [personas, setPersonas] = useState<Personas>(freshPersonas);
  const [backend, setBackend] = useState<Backend>(() => new SimulatorBackend(personas.issuer.issuerSecret!));
  const [snap, setSnap] = useState<LedgerSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>('issuer');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [kyc, setKyc] = useState<KycRecord | null>(null);
  const [sent, setSent] = useState<Sent[]>([]);
  const [showNetwork, setShowNetwork] = useState(false);

  useEffect(() => {
    if (backend.kind === 'midnight') localStorage.setItem('zkremit:personas', encode(personas));
  }, [backend, personas]);

  const refresh = useCallback(async () => setSnap(await backend.ledger()), [backend]);
  useEffect(() => { void refresh(); }, [refresh]);

  const push = (kind: LogEntry['kind'], title: string, detail?: string) =>
    setLog((l) => [{ t: new Date().toLocaleTimeString(), kind, title, detail }, ...l].slice(0, 60));

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
    setBackend(new SimulatorBackend(p.issuer.issuerSecret!));
    setKyc(null);
    setSent([]);
    setLog([]);
    push('info', 'New simulated ZK Remit contract deployed', 'Fresh issuer key, epoch 1, empty credential tree.');
  };

  return (
    <div className="app">
      <header className="hero">
        <div className="brand">
          <span className="logo">🌙</span>
          <div>
            <h1>ZK Remit</h1>
            <p className="tag">Send money home. Prove you're compliant. Reveal nothing else.</p>
          </div>
        </div>
        <div className="mode">
          <span className={`pill ${backend.kind}`}>{backend.kind === 'simulator' ? '● Simulator' : '● Midnight'}</span>
          <span className="muted small">{backend.label}</span>
          <button className="ghost" onClick={() => setShowNetwork((s) => !s)}>
            {showNetwork ? 'Close' : 'Midnight network / Lace'}
          </button>
          {backend.kind === 'simulator' && <button className="ghost" onClick={resetSim}>Reset</button>}
        </div>
      </header>

      {showNetwork && (
        <NetworkPanel
          personas={personas}
          onBackend={(b, p) => { setPersonas(p); setBackend(b); setShowNetwork(false); push('info', `Switched to ${b.label}`); }}
          onLog={push}
        />
      )}

      <section className="pitch">
        <div><b>$685B</b><span>sent home to low- &amp; middle-income countries in 2024 (World Bank est.) — every transfer today copies the sender's passport into more databases.</span></div>
        <div><b>0 bytes</b><span>of identity on-chain. The issuer posts a hash; the sender posts a ZK proof.</span></div>
        <div><b>5 checks</b><span>proven in one Compact circuit: issued · bound · unexpired · corridor · tier limits.</span></div>
      </section>

      <nav className="tabs">
        {([
          ['issuer', '① KYC Attestor'],
          ['sender', '② Sender · Dubai'],
          ['recipient', '③ Recipient · Kerala'],
          ['auditor', '④ Auditor'],
          ['attacks', '⚔ Attack lab'],
        ] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      <main className="grid">
        <div className="col">
          {tab === 'issuer' && (
            <IssuerTab backend={backend} personas={personas} setPersonas={setPersonas} kyc={kyc} setKyc={setKyc} snap={snap} run={run} busy={busy} />
          )}
          {tab === 'sender' && (
            <SenderTab backend={backend} personas={personas} kyc={kyc} snap={snap} run={run} busy={busy} sent={sent} setSent={setSent} />
          )}
          {tab === 'recipient' && <RecipientTab backend={backend} personas={personas} snap={snap} run={run} busy={busy} sent={sent} />}
          {tab === 'auditor' && <AuditorTab backend={backend} personas={personas} snap={snap} run={run} busy={busy} />}
          {tab === 'attacks' && <AttackTab backend={backend} personas={personas} kyc={kyc} snap={snap} run={run} busy={busy} />}
          <ActivityLog log={log} />
        </div>
        <div className="col">
          <PublicLedger snap={snap} />
          <DevicePanel personas={personas} kyc={kyc} sent={sent} />
        </div>
      </main>

      <footer>
        Built on <a href="https://midnight.network" target="_blank">Midnight</a> · Compact contract with witnesses &amp; selective
        disclosure · <a href="https://github.com/Cyptoboy777/zk-remit" target="_blank">source</a> · AKINDO Midnight Buildathon
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------- tabs */

type Common = {
  backend: Backend;
  personas: Personas;
  snap: LedgerSnapshot | null;
  run: (label: string, fn: () => Promise<string | void>) => Promise<void>;
  busy: string | null;
};

function IssuerTab({ backend, personas, setPersonas, kyc, setKyc, snap, run, busy }: Common & {
  setPersonas: (p: Personas) => void;
  kyc: KycRecord | null;
  setKyc: (k: KycRecord) => void;
}) {
  const [name, setName] = useState('Aisha Rahman');
  const [doc, setDoc] = useState('P-7731942');
  const [tier, setTier] = useState('2');
  const [country, setCountry] = useState('784');
  const [expiry, setExpiry] = useState('3');
  const issuer = personas.issuer;

  const issue = () =>
    run('Issue KYC credential', async () => {
      const cred: Credential = makeCredential(personas.sender.holderSecret!, BigInt(tier), BigInt(country), BigInt(expiry));
      const commitment = pureCircuits.credentialCommitment(cred);
      await backend.issueCredential(issuer, commitment);
      setPersonas({ ...personas, sender: { ...personas.sender, credential: cred } });
      setKyc({ name, doc, tier: BigInt(tier), country: BigInt(country), expiry: BigInt(expiry), commitment: toHex(commitment) });
      return `On-chain: only commitment ${short(toHex(commitment))}. Name, passport, tier & country stay in the issuer's vault and on Aisha's device.`;
    });

  const corridorOpen = (f: bigint, t: bigint) => snap?.corridors.some(([a, b]) => a === f && b === t);

  return (
    <div className="card">
      <h2>KYC Attestor <span className="muted">— licensed exchange house in Dubai</span></h2>
      <p className="lead">
        The attestor verifies documents off-chain, then publishes <b>only a hash</b> of the credential into an on-chain
        Merkle tree. It never learns what Aisha sends, to whom, or when.
      </p>
      <div className="form">
        <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Passport #<input value={doc} onChange={(e) => setDoc(e.target.value)} /></label>
        <label>KYC tier
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            {Object.entries(TIERS).map(([k, v]) => <option key={k} value={k}>{v.name} — ≤ ${v.cap}/tx, {v.slots} tx/epoch</option>)}
          </select>
        </label>
        <label>Residence
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {Object.entries(COUNTRIES).map(([k, v]) => <option key={k} value={k}>{v.flag} {v.name}</option>)}
          </select>
        </label>
        <label>Valid through epoch<input type="number" min="1" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></label>
      </div>
      <div className="actions">
        <button disabled={!!busy} onClick={issue}>{busy === 'Issue KYC credential' ? 'Proving…' : 'Issue credential → publish commitment'}</button>
        <button className="secondary" disabled={!!busy || corridorOpen(COUNTRY.UAE, COUNTRY.INDIA)}
          onClick={() => run('Open corridor UAE → India', async () => { await backend.openCorridor(issuer, COUNTRY.UAE, COUNTRY.INDIA); })}>
          {corridorOpen(COUNTRY.UAE, COUNTRY.INDIA) ? '✓ Corridor 🇦🇪 → 🇮🇳 open' : 'Open corridor 🇦🇪 → 🇮🇳'}
        </button>
        <button className="secondary" disabled={!!busy || corridorOpen(COUNTRY.USA, COUNTRY.PHILIPPINES)}
          onClick={() => run('Open corridor USA → Philippines', async () => { await backend.openCorridor(issuer, COUNTRY.USA, COUNTRY.PHILIPPINES); })}>
          {corridorOpen(COUNTRY.USA, COUNTRY.PHILIPPINES) ? '✓ Corridor 🇺🇸 → 🇵🇭 open' : 'Open corridor 🇺🇸 → 🇵🇭'}
        </button>
        <button className="secondary" disabled={!!busy}
          onClick={() => run('Advance compliance epoch', async () => { await backend.advanceEpoch(issuer); return 'Quotas reset; every holder gets fresh, unlinkable nullifiers. Expired credentials stop working.'; })}>
          Advance epoch (month) →
        </button>
      </div>
      {kyc && (
        <div className="split">
          <div className="box private"><h4>🔒 Issuer's off-chain vault</h4>
            <dl><dt>Name</dt><dd>{kyc.name}</dd><dt>Passport</dt><dd>{kyc.doc}</dd><dt>Tier</dt><dd>{TIERS[kyc.tier.toString()].name}</dd>
              <dt>Country</dt><dd>{cn(kyc.country).flag} {cn(kyc.country).name}</dd><dt>Expiry</dt><dd>epoch {kyc.expiry.toString()}</dd></dl>
          </div>
          <div className="box public"><h4>🌐 What the chain sees</h4>
            <dl><dt>Leaf</dt><dd className="mono">{short(kyc.commitment, 10)}</dd><dt>Tree size</dt><dd>{snap?.credentialsIssued.toString()}</dd>
              <dt>Root</dt><dd className="mono">{snap ? short(snap.root, 10) : '…'}</dd></dl>
          </div>
        </div>
      )}
    </div>
  );
}

function nextSlot(snap: LedgerSnapshot | null, sk: Uint8Array | undefined, maxSlots: number): bigint | null {
  if (!snap || !sk) return null;
  const used = new Set(snap.receipts.map((r) => r.id));
  for (let s = 0; s < maxSlots; s++) {
    if (!used.has(toHex(pureCircuits.nullifierOf(sk, snap.epoch, BigInt(s))))) return BigInt(s);
  }
  return null;
}

function SenderTab({ backend, personas, kyc, snap, run, busy, sent, setSent }: Common & {
  kyc: KycRecord | null;
  sent: Sent[];
  setSent: (s: Sent[]) => void;
}) {
  const [amount, setAmount] = useState('420');
  const [to, setTo] = useState('356');
  const [recipientTag, setRecipientTag] = useState('');
  const cred = personas.sender.credential;
  const ravisTag = toHex(pureCircuits.recipientTagOf(personas.recipient.recipientSecret!));
  const tagHex = recipientTag || ravisTag;
  const tierInfo = cred ? TIERS[cred.tier.toString()] : undefined;
  const slot = nextSlot(snap, personas.sender.holderSecret, tierInfo?.slots ?? 0);
  const amt = usdToCents(amount);

  const checks = useMemo(() => {
    if (!snap) return [];
    const issued = !!kyc;
    return [
      { ok: issued, label: 'Credential is in the attestor’s Merkle tree', priv: 'path + leaf private, only root disclosed' },
      { ok: issued, label: 'Credential is bound to my secret key', priv: 'holder key never revealed' },
      { ok: !!cred && cred.expiryEpoch >= snap.epoch, label: `Not expired (epoch ${snap.epoch})`, priv: 'expiry private' },
      { ok: !!cred && snap.corridors.some(([f, t]) => f === cred.country && t === BigInt(to)), label: `Corridor ${cred ? cn(cred.country).flag : '?'} → ${cn(BigInt(to)).flag} approved`, priv: 'corridor disclosed (needed for FX/licensing)' },
      { ok: !!tierInfo && amt > 0n && amt <= BigInt(tierInfo.cap * 100), label: 'Amount within my tier cap', priv: 'exact amount + tier private; only band disclosed' },
      { ok: slot !== null, label: `Monthly quota slot available${slot !== null ? ` (#${slot})` : ''}`, priv: 'unlinkable nullifier disclosed' },
    ];
  }, [snap, kyc, cred, to, amt, tierInfo, slot]);

  const send = () =>
    run(`Send ${cents(amt)} ${cn(cred?.country ?? 0n).flag} → ${cn(BigInt(to)).flag}`, async () => {
      const salt = randomBytes();
      const useSlot = slot ?? 0n;
      const id = toHex(pureCircuits.nullifierOf(personas.sender.holderSecret!, snap!.epoch, useSlot));
      const r = await backend.sendRemittance(personas.sender, BigInt(to), amt, salt, useSlot, fromHex(tagHex));
      const link = toB64Url(encode({ r: id, a: amt, s: toHex(salt) }));
      setSent([{ id, amount: amt, salt: toHex(salt), to: BigInt(to), link }, ...sent]);
      return `Receipt ${short(id)} recorded with band "${BANDS[Number(pureCircuits.amountBandOf(amt))]}".${r.txHash ? ` tx ${short(r.txHash)}` : ''} Share the claim link with Ravi privately.`;
    });

  return (
    <div className="card">
      <h2>Sender <span className="muted">— Aisha, nurse in Dubai, sending to her family in Kerala</span></h2>
      {!kyc && <div className="warn">Issue Aisha's credential in ① first (and open the 🇦🇪 → 🇮🇳 corridor).</div>}
      <div className="form">
        <label>Amount (USD)<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Destination
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {Object.entries(COUNTRIES).map(([k, v]) => <option key={k} value={k}>{v.flag} {v.name}</option>)}
          </select>
        </label>
        <label className="wide">Recipient claim tag <span className="muted small">(default: Ravi's)</span>
          <input className="mono" placeholder={ravisTag} value={recipientTag} onChange={(e) => setRecipientTag(e.target.value)} />
        </label>
      </div>
      <h4>Zero-knowledge proof will establish:</h4>
      <ul className="checks">
        {checks.map((c, i) => (
          <li key={i} className={c.ok ? 'ok' : 'bad'}><span>{c.ok ? '✓' : '✗'}</span>{c.label}<em>{c.priv}</em></li>
        ))}
      </ul>
      <div className="actions">
        <button disabled={!!busy || !cred} onClick={send}>{busy?.startsWith('Send') ? 'Generating proof…' : 'Prove & send'}</button>
        <span className="muted small">If any check fails, the circuit rejects — no proof can be produced.</span>
      </div>
      {sent.length > 0 && (
        <>
          <h4>My receipts (private memory)</h4>
          <table className="tbl">
            <thead><tr><th>Receipt</th><th>Amount</th><th>Claim link for recipient</th></tr></thead>
            <tbody>{sent.map((s) => (
              <tr key={s.id}><td className="mono">{short(s.id)}</td><td>{cents(s.amount)}</td>
                <td><button className="tiny" onClick={() => navigator.clipboard?.writeText(s.link)}>Copy link</button> <span className="mono small">{short(s.link, 8)}</span></td></tr>
            ))}</tbody>
          </table>
        </>
      )}
    </div>
  );
}

function RecipientTab({ backend, personas, snap, run, busy, sent }: Common & { sent: Sent[] }) {
  const [link, setLink] = useState('');
  const effective = link || sent[0]?.link || '';
  let parsed: { r: string; a: bigint; s: string } | null = null;
  try { parsed = effective ? decode(fromB64Url(effective)) : null; } catch { parsed = null; }
  const receipt = parsed && snap?.receipts.find((r) => r.id === parsed!.r);
  const myTag = toHex(pureCircuits.recipientTagOf(personas.recipient.recipientSecret!));
  const inbox = snap?.receipts.filter((r) => r.recipientTag === myTag) ?? [];

  return (
    <div className="card">
      <h2>Recipient <span className="muted">— Ravi in Kerala, via a payout partner</span></h2>
      <p className="lead">Ravi proves he owns the secret behind the receipt's claim tag and knows the opening of the amount
        commitment. The payout partner pays out once; nobody learns who Aisha is.</p>
      <div className="box"><b>My claim tag</b> <span className="mono small">{myTag}</span>
        <div className="muted small">Share this (not the secret) with senders. Receipts addressed to me: {inbox.length}</div></div>
      <label className="wide">Claim link from sender<input className="mono" placeholder={sent[0]?.link ?? 'paste link'} value={link} onChange={(e) => setLink(e.target.value)} /></label>
      {parsed && (
        <div className="box">
          Receipt <span className="mono">{short(parsed.r)}</span> · amount {cents(parsed.a)} ·{' '}
          {receipt ? (receipt.claimed ? <b className="bad">already claimed</b> : <b className="good">unclaimed</b>) : <b className="bad">not on ledger</b>}
        </div>
      )}
      <div className="actions">
        <button disabled={!!busy || !parsed} onClick={() => run('Claim payout', async () => {
          const r = await backend.claim(personas.recipient, fromHex(parsed!.r), parsed!.a, fromHex(parsed!.s));
          return `Claimed ${cents(parsed!.a)}. Ledger now marks the receipt claimed; double-payout is impossible.${r.txHash ? ` tx ${short(r.txHash)}` : ''}`;
        })}>Prove & claim</button>
      </div>
    </div>
  );
}

function AuditorTab({ backend, personas, snap, run, busy }: Common) {
  const [vk, setVk] = useState('');
  const [rid, setRid] = useState('');
  const [challenge] = useState(() => toHex(randomBytes()));
  const aishaVk = toHex(pureCircuits.viewKeyOf(personas.sender.holderSecret!));
  const matches: ReceiptView[] = useMemo(() => {
    if (!vk || !snap) return [];
    try {
      const k = fromHex(vk);
      return snap.receipts.filter((r) => toHex(pureCircuits.viewTagOf(k, fromHex(r.id))) === r.viewTag);
    } catch { return []; }
  }, [vk, snap]);
  return (
    <div className="card">
      <h2>Auditor / Regulator <span className="muted">— selective disclosure on the sender's terms</span></h2>
      <div className="split">
        <div className="box">
          <h4>Mode A · Prove one receipt</h4>
          <p className="small">The regulator issues a challenge; Aisha proves a specific receipt is hers. Nothing else is revealed — not even her view key.</p>
          <label>Receipt ID<select value={rid} onChange={(e) => setRid(e.target.value)}>
            <option value="">— choose —</option>
            {snap?.receipts.map((r) => <option key={r.id} value={r.id}>{short(r.id)} · {BANDS[Number(r.amountBand)]}</option>)}
          </select></label>
          <div className="mono small">challenge {short(challenge, 8)}</div>
          <button disabled={!!busy || !rid} onClick={() => run('Prove receipt ownership (as Aisha)', async () => {
            await backend.proveReceiptOwnership(personas.sender, fromHex(rid), fromHex(challenge));
            return 'Accepted: the ledger records H(receipt, challenge) — verifiable proof bound to this audit request.';
          })}>Aisha proves ownership</button>
        </div>
        <div className="box">
          <h4>Mode B · View key (full audit)</h4>
          <p className="small">Aisha can hand a court-ordered auditor her <b>view key</b>. It lists exactly her receipts but cannot send or claim.</p>
          <label>View key<input className="mono" value={vk} onChange={(e) => setVk(e.target.value)} placeholder="paste view key" /></label>
          <button className="tiny" onClick={() => setVk(aishaVk)}>Use Aisha's view key</button>
          <div className="small">Matched {matches.length} / {snap?.receipts.length ?? 0} receipts</div>
          <ul className="small mono">{matches.map((m) => <li key={m.id}>{short(m.id)} · {cn(m.fromCountry).flag}→{cn(m.toCountry).flag} · {BANDS[Number(m.amountBand)]} · epoch {m.epoch.toString()}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function AttackTab({ backend, personas, kyc, snap, run, busy }: Common & { kyc: KycRecord | null }) {
  const tag = pureCircuits.recipientTagOf(personas.recipient.recipientSecret!);
  const ep = snap?.epoch ?? 1n;
  const attacks: { name: string; desc: string; go: () => Promise<unknown> }[] = [
    { name: 'Forged credential', desc: 'Mallory fabricates an ENHANCED credential the issuer never published.',
      go: () => backend.sendRemittance({ ...personas.mallory, credential: makeCredential(personas.mallory.holderSecret!, TIER.ENHANCED, COUNTRY.UAE, 99n) }, COUNTRY.INDIA, 50000n, randomBytes(), 0n, tag) },
    { name: 'Stolen credential', desc: 'Mallory copies Aisha’s credential but doesn’t have her secret key.',
      go: () => backend.sendRemittance({ ...personas.mallory, credential: personas.sender.credential }, COUNTRY.INDIA, 5000n, randomBytes(), 0n, tag) },
    { name: 'Over the tier limit', desc: 'Aisha tries to send $4,999 on a VERIFIED ($1k) credential.',
      go: () => backend.sendRemittance(personas.sender, COUNTRY.INDIA, 499900n, randomBytes(), 7n, tag) },
    { name: 'Unapproved corridor', desc: 'Aisha tries UAE → Nigeria, which the operator hasn’t licensed.',
      go: () => backend.sendRemittance(personas.sender, COUNTRY.NIGERIA, 1000n, randomBytes(), 6n, tag) },
    { name: 'Replay a quota slot', desc: 'Re-use slot #0 this epoch to dodge the monthly count limit.',
      go: () => backend.sendRemittance(personas.sender, COUNTRY.INDIA, 1000n, randomBytes(), 0n, tag) },
    { name: 'Hijack a payout', desc: 'Mallory tries to claim an unclaimed receipt meant for Ravi.',
      go: () => backend.claim({ recipientSecret: randomBytes() }, fromHex((snap?.receipts.find((r) => !r.claimed) ?? snap?.receipts[0])?.id ?? '00'.repeat(32)), 1n, randomBytes()) },
    { name: 'Rogue issuer', desc: 'Mallory tries to publish credentials without the issuer key.',
      go: () => backend.issueCredential({ issuerSecret: randomBytes() }, randomBytes()) },
  ];
  return (
    <div className="card">
      <h2>Attack lab <span className="muted">— every attack is stopped by a Compact assert inside the circuit</span></h2>
      {!kyc && <div className="warn">Set up ① and make one send in ② first for the full effect.</div>}
      <div className="attacks">
        {attacks.map((a) => (
          <div key={a.name} className="attack">
            <b>{a.name}</b><p className="small">{a.desc}</p>
            <button className="danger tiny" disabled={!!busy} onClick={() => run(`Attack: ${a.name}`, async () => { await a.go(); return '⚠ unexpectedly accepted'; })}>Try it</button>
          </div>
        ))}
      </div>
      <p className="muted small">Epoch {ep.toString()}. Rejections appear in the activity log with the exact circuit assertion that failed.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- side panels */

function PublicLedger({ snap }: { snap: LedgerSnapshot | null }) {
  if (!snap) return <div className="card">Loading ledger…</div>;
  const max = Math.max(1, ...snap.bandVolume.map(Number));
  return (
    <div className="card ledger">
      <h3>🌐 Public ledger <span className="muted small">— everything anyone can see</span></h3>
      <div className="stats">
        <div><b>{snap.epoch.toString()}</b><span>epoch</span></div>
        <div><b>{snap.credentialsIssued.toString()}</b><span>credentials (hashes)</span></div>
        <div><b>{snap.totalReceipts.toString()}</b><span>remittances</span></div>
        <div><b>{snap.ownershipProofs.toString()}</b><span>audit proofs</span></div>
      </div>
      <div className="small">Corridors: {snap.corridors.length ? snap.corridors.map(([f, t]) => `${cn(f).flag}→${cn(t).flag}`).join('  ') : 'none'}</div>
      <div className="bands">
        {snap.bandVolume.map((v, i) => (
          <div key={i}><span>{BANDS[i]}</span><i style={{ width: `${(Number(v) / max) * 100}%` }} /><b>{v.toString()}</b></div>
        ))}
      </div>
      <table className="tbl">
        <thead><tr><th>Nullifier / receipt</th><th>Corridor</th><th>Band</th><th>Ep</th><th>Status</th></tr></thead>
        <tbody>
          {snap.receipts.length === 0 && <tr><td colSpan={5} className="muted">No remittances yet</td></tr>}
          {snap.receipts.map((r) => (
            <tr key={r.id}>
              <td className="mono" title={`amountCommit ${r.amountCommit}\nrecipientTag ${r.recipientTag}\nviewTag ${r.viewTag}`}>{short(r.id)}</td>
              <td>{cn(r.fromCountry).flag}→{cn(r.toCountry).flag}</td>
              <td>{BANDS[Number(r.amountBand)]}</td>
              <td>{r.epoch.toString()}</td>
              <td>{r.claimed ? <span className="good">claimed</span> : 'pending'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">No names, no passport numbers, no wallet-to-identity link, no exact amounts, no tier. Receipts from the same sender are unlinkable.</p>
    </div>
  );
}

function DevicePanel({ personas, kyc, sent }: { personas: Personas; kyc: KycRecord | null; sent: Sent[] }) {
  const [reveal, setReveal] = useState(false);
  const s = (b?: Uint8Array) => (b ? (reveal ? short(toHex(b), 10) : '••••••••••••') : '—');
  return (
    <div className="card device">
      <h3>🔒 Private state <span className="muted small">— stays on each user's device, fed to circuits as witnesses</span></h3>
      <dl>
        <dt>Issuer secret</dt><dd className="mono">{s(personas.issuer.issuerSecret)}</dd>
        <dt>Aisha secret</dt><dd className="mono">{s(personas.sender.holderSecret)}</dd>
        <dt>Aisha credential</dt><dd>{personas.sender.credential ? `${TIERS[personas.sender.credential.tier.toString()].name} · ${cn(personas.sender.credential.country).name} · exp ${personas.sender.credential.expiryEpoch}` : '—'}</dd>
        <dt>Aisha identity</dt><dd>{kyc ? `${kyc.name} · ${kyc.doc}` : '—'}</dd>
        <dt>Exact amounts</dt><dd>{sent.length ? sent.map((x) => cents(x.amount)).join(', ') : '—'}</dd>
        <dt>Ravi claim secret</dt><dd className="mono">{s(personas.recipient.recipientSecret)}</dd>
      </dl>
      <button className="tiny ghost" onClick={() => setReveal((r) => !r)}>{reveal ? 'Hide' : 'Reveal'} secrets</button>
    </div>
  );
}

function ActivityLog({ log }: { log: LogEntry[] }) {
  return (
    <div className="card log">
      <h3>Activity</h3>
      {log.length === 0 && <p className="muted small">Circuit executions and rejections will appear here.</p>}
      <ul>{log.map((l, i) => (
        <li key={i} className={l.kind}><span className="t">{l.t}</span><b>{l.kind === 'ok' ? '✓' : l.kind === 'err' ? '✗' : '•'} {l.title}</b>{l.detail && <div className="small">{l.detail}</div>}</li>
      ))}</ul>
    </div>
  );
}

/* ---------------------------------------------------------------- network */

const PERSONA_KEY = 'zkremit:personas';

function NetworkPanel({ personas, onBackend, onLog }: {
  personas: Personas;
  onBackend: (b: Backend, p: Personas) => void;
  onLog: (k: LogEntry['kind'], t: string, d?: string) => void;
}) {
  const [wallet, setWallet] = useState<any>(null);
  const [addr, setAddr] = useState(import.meta.env.VITE_CONTRACT_ADDRESS ?? '');
  const [status, setStatus] = useState('');
  const hasLace = typeof window !== 'undefined' && !!(window as any).midnight;

  const withNet = async <T,>(label: string, fn: (m: typeof import('./lib/midnightBackend')) => Promise<T>) => {
    setStatus(`${label}…`);
    try {
      const m = await import('./lib/midnightBackend');
      const r = await fn(m);
      setStatus('');
      return r;
    } catch (e) {
      setStatus(`${label} failed: ${errMsg(e)}`);
      onLog('err', `${label} failed`, errMsg(e));
      return undefined;
    }
  };

  const stored = (): Personas => {
    const raw = localStorage.getItem(PERSONA_KEY);
    if (raw) return decode<Personas>(raw);
    localStorage.setItem(PERSONA_KEY, encode(personas));
    return personas;
  };

  return (
    <div className="card network">
      <h3>Midnight network mode <span className="muted small">(Lace wallet · Midnight.js · proof server)</span></h3>
      <ol className="small">
        <li>Install the <a href="https://docs.midnight.network/getting-started/installation" target="_blank">Lace wallet with Midnight</a>, set network to <b>Preview</b> and the proof server to <code>http://localhost:6300</code> (run <code>midnightntwrk/proof-server:8.1.3</code> in Docker on port 6300).</li>
        <li>Get tNIGHT from the <a href="https://midnight-tmnight-preview.nethermind.dev/" target="_blank">Preview faucet</a>, then generate tDUST in Lace.</li>
        <li>Connect, then deploy a fresh ZK Remit contract or join an existing one. All tabs then run real ZK proofs on-chain.</li>
      </ol>
      <div className="actions">
        {!wallet ? (
          <button disabled={!hasLace} onClick={async () => {
            const w = await withNet('Connecting Lace', (m) => m.connectLace());
            if (w) { setWallet(w); onLog('ok', `Connected ${w.name} (connector ${w.apiVersion})`, w.shieldedAddress); }
          }}>{hasLace ? 'Connect Lace' : 'Lace not detected'}</button>
        ) : (
          <>
            <span className="pill midnight">● {short(wallet.shieldedAddress, 10)}</span>
            <button onClick={async () => {
              const p = stored();
              const b = await withNet('Deploying contract (proof + tx)', (m) => m.MidnightBackend.deploy(wallet.api, p.issuer.issuerSecret!));
              if (b) { onLog('ok', 'Deployed ZK Remit', b.contractAddress); onBackend(b, p); }
            }}>Deploy new contract</button>
            <input className="mono" placeholder="contract address" value={addr} onChange={(e) => setAddr(e.target.value)} />
            <button className="secondary" disabled={!addr} onClick={async () => {
              const p = stored();
              const b = await withNet('Joining contract', (m) => m.MidnightBackend.join(wallet.api, addr, p.issuer));
              if (b) onBackend(b, p);
            }}>Join</button>
          </>
        )}
      </div>
      {status && <div className="small warn">{status}</div>}
    </div>
  );
}
