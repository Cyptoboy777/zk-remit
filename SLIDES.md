---
marp: true
theme: default
paginate: true
backgroundColor: "#07081a"
color: "#e8eaff"
style: |
  h1, h2 { color: #c4b5fd; }
  a { color: #22d3ee; }
  table { font-size: 0.7em; }
  table th, table td, table tr { background: #10122b !important; color: #e8eaff !important; border-color: #262b5a !important; }
  code { background: #161a3a; color: #c4b5fd; }
---

# 🌙 ZK Remit
### Send money home. Prove you're compliant. Reveal nothing else.

Crypto boy (@Cryptoboy_777) · AKINDO Midnight Buildathon · Wave 3
github.com/Cyptoboy777/zk-remit · cyptoboy777.github.io/zk-remit

---

## The problem

- ~$685B/yr flows to low- & middle-income countries (World Bank est., 2024); India is #1
- Every hop (exchange house, correspondent, payout partner, on-ramp) stores the sender's passport & salary
- Public chains make it worse: the whole payment graph is permanent
- Regulators need **assurance + targeted audit**, not a public dossier on every migrant worker

---

## The solution: ZK Remit

1. KYC attestor publishes **only a hash** of a credential (Merkle tree on Midnight)
2. Sender proves in ZK: issued · hers · unexpired · licensed corridor · under tier cap · quota left
3. Public receipt = corridor + amount band + unlinkable nullifier
4. Recipient claims once with a private key; auditor gets **sender-controlled** disclosure

---

## Deep Midnight integration

| Public ledger | Private (witnesses) |
|---|---|
| issuer key, credential tree root, corridors, nullifiers, receipts (band, commitments, tags) | issuer secret, holder secret, credential, Merkle path, exact amount, recipient secret |

- 7 Compact circuits, 5 witnesses, every public value via `disclose()`
- Rate limiting via nullifiers `H(sk, epoch, slot)` — no linkable counters
- Midnight.js 4.1 + Lace (DApp Connector v4) for deploy/call; keys via FetchZkConfigProvider

---

## Demo

- Live: in-browser Compact runtime (zero install) + Lace network mode
- Attack lab: forged / stolen credential, over-limit, bad corridor, quota replay, payout hijack, rogue issuer → all rejected by circuit asserts
- 12/12 Vitest cases on the compiled contract; CI compiles with compactc 0.31.1 & 0.35.0

---

## Market & go-to-market

- Wedge: GCC → India / Philippines corridors (huge volume, KYC-heavy)
- Customers: exchange houses, remittance fintechs, payout partners (per-receipt or per-corridor SaaS)
- Users: fewer repeated KYC checks, no identity trail

---

## Roadmap

| Wave 3 | Next |
|---|---|
| Preview deployment · shielded value leg · revocation · rolling volume cap · signed credentials · multi-device UX | UAE↔India pilot · FATF travel-rule mapping · multi-issuer federation · mobile (Kuira SDK) · mainnet |

---

# Compliance without surveillance.
### ZK Remit on Midnight
