# ZK Remit — AKINDO Midnight Buildathon submission (Wave 3)

**One-liner:** Zero-knowledge KYC for cross-border remittances — prove you're verified, within limits
and on a licensed corridor without revealing who you are, how much you sent or who else you paid.

- Repo: https://github.com/Cyptoboy777/zk-remit (topic `midnightntwrk`, Apache-2.0)
- Live demo: https://cyptoboy777.github.io/zk-remit/
- Demo video: _(record from DEMO_SCRIPT.md)_ · Slides: [docs/ZK-Remit-slides.pdf](docs/ZK-Remit-slides.pdf) (Marp source: [SLIDES.md](SLIDES.md))

## What it does

ZK Remit is a compliance and receipt layer for remittance corridors (first: UAE → India).

1. **KYC attestor** (a licensed exchange house) verifies a migrant worker off-chain and publishes
   only a **hash** of her credential (tier, residence country, expiry, holder key, salt) into an
   on-chain Merkle tree.
2. **Sender** generates a ZK proof that her credential is in that tree, belongs to her, is unexpired,
   that her country→destination corridor is licensed, that the amount is within her tier cap, and
   that she still has quota this month (via an unlinkable per-epoch nullifier). Only the corridor,
   an amount band and the nullifier are disclosed.
3. **Recipient** claims with a private claim key and the amount opening — once.
4. **Auditor/regulator** gets *sender-controlled* disclosure: a challenge-bound proof of a single
   receipt, or a read-only view key that lists exactly that sender's receipts.

## The problem

Remittances (≈$685B to LMICs in 2024, World Bank est.; India is #1) are among the most
data-hungry consumer payments: passport, visa, employer and salary data are copied to every
intermediary, and on public blockchains the entire payment graph becomes permanent. Regulators need
assurance and targeted auditability, not a public dossier on every migrant worker.

## How Midnight is used (core, not garnish)

- **Compact contract** with 5 witnesses (`issuerSecret`, `holderSecret`, `heldCredential`,
  `credentialPath`, `recipientSecret`) and explicit `disclose()` on every public value.
- **Dual ledger:** public state = issuer key, `HistoricMerkleTree` of credential commitments,
  corridors `Set`, nullifiers `Set`, receipts `Map`, band `Counter`s; private state = secrets +
  credential, persisted per contract address on the user's device.
- **Selective disclosure as the product:** the receipt is the regulator-facing artifact; what's
  disclosed (corridor, band) is a deliberate policy choice encoded in the circuit.
- **Midnight.js 4.1 + Lace (DApp Connector v4)** for deploy / callTx / indexer state; proof keys
  served alongside the dApp via `FetchZkConfigProvider`.

## Challenges

- Expressing "N transfers per month" without a linkable per-user counter → nullifiers
  `H(sk, epoch, slot)` with `slot < tierSlots(tier)` proven privately.
- Toolchain alignment: latest compactc 0.35 targets ledger 9 / runtime 0.20, but the live networks
  and Midnight.js 4.1.1 use runtime 0.16 / ledger 8 → pinned compactc 0.31.1 and test 0.35.0 in CI.
- Running the compiled circuits in the browser (WASM runtime with Vite 8) for a zero-install demo.
- Testnet faucets are captcha-gated and the proof server needs Docker, so the hosted demo ships a
  faithful simulator mode while network mode is wired to Lace.

## Tech

Compact (compactc 0.31.1 / 0.35.0) · @midnight-ntwrk/compact-runtime 0.16 · Midnight.js 4.1.1 ·
DApp Connector API 4.0.1 · Lace · React 19 · Vite 8 · Vitest 4 · GitHub Actions + Pages.

## How it was built

1. Threat model & disclosure policy table (what each party must / must not learn).
2. Compact contract → `compactc` (7 circuits, prover/verifier keys).
3. `ZkRemitSimulator` on the official runtime + 12 Vitest cases covering forged/stolen credentials,
   tier caps, corridor policy, quota replay, expiry, claims, both audit modes.
4. React dApp with a `Backend` abstraction: in-browser simulator or Lace/Midnight.js.
5. CI compiles with the official compiler, runs tests and deploys the dApp + ZK keys to Pages.

## Progress this wave

_Baseline (pre-wave scaffold, 2026-10-20):_ contract, tests, simulator, dApp, CI/Pages.
_Wave 3 deliverables (Oct 27 – Nov 16) — fill in as they land:_
- [ ] Deployed on Midnight **Preview** via Lace (address + tx hashes here)
- [ ] Shielded value leg: tDUST/stablecoin moved inside `sendRemittance` / `claim` (`receiveShielded` / `sendShielded`)
- [ ] Non-membership **revocation** (sparse Merkle / revocation-epoch accumulator)
- [ ] Rolling monthly **volume** cap via private accumulator (not just count × per-tx cap)
- [ ] Issuer **signature** credentials (`jubjubSchnorrVerify`) so issuance can be off-chain/batched
- [ ] Multi-device personas (separate sender / recipient / issuer apps), mobile-first sender UI
- [ ] Payout-partner dashboard + CSV regulatory report (band volumes per corridor per epoch)

## What's next / roadmap

| Phase | Scope |
|---|---|
| **Wave 3 (now)** | Preview deployment, shielded value leg, revocation, volume accumulator, polished multi-role UX, video + deck |
| Post-buildathon M1 | Pilot design with one UAE exchange house + one Indian payout partner; FATF travel-rule mapping (encrypted originator info to the receiving VASP) |
| M2 | Multi-issuer federation (any licensed KYC provider), corridor-specific policy modules, stablecoin rails |
| M3 | Mainnet; mobile wallet integration (Kuira SDK) for migrant workers |

## Business model & audience

Exchange houses, remittance fintechs and payout partners pay per verified receipt (or SaaS per
corridor); migrant senders get a cheaper, privacy-preserving rail and fewer repeated KYC checks.
Wedge: GCC → India/Philippines corridors (very high volume, KYC-heavy, migrant-worker
population with strong privacy concerns).
