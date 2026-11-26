---
marp: true
theme: default
paginate: true
backgroundColor: "#070c16"
color: "#e8eaff"
style: |
  h1, h2 { color: #62ddb5; }
  a { color: #86b9ff; }
  table { font-size: 0.7em; }
  table th, table td, table tr { background: #111c2c !important; color: #e8eaff !important; border-color: #263448 !important; }
  code { background: #172438; color: #62ddb5; }
---

# ZK Remit
### Prove compliance. Reveal less.

Privacy-first remittance prototype · AKINDO Midnight Buildathon · Wave 3

**Prototype notice:** browser simulator only. No deployed Midnight Preview contract, live Lace calls, or real funds.

---

## The problem

- Cross-border remittances require repeated identity checks across intermediaries
- Public payment graphs can expose sender/recipient relationships and activity
- Compliance needs verifiable controls and targeted auditability
- Privacy should be a property of the transaction, not a promise in the UI

---

## The idea

1. A licensed issuer attests to eligibility with a credential commitment
2. The sender proves credential membership, holder binding, expiry, corridor policy, and quota
3. The contract models shielded escrow, a one-time recipient claim, and sender reclaim after a timeout
4. The public receipt contains a corridor, amount band, epoch, nullifier, blinded tags, commitment, and status

The hosted demo runs these flows in a local Compact runtime simulator. It does not send a network transaction.

---

## Midnight implementation

- Compact contract with 10 circuits and explicit public disclosures
- Public ledger: issuer/revocation registries, credential tree, corridor policy, nullifiers, receipts, counters
- Private witnesses include holder/issuer/recipient secrets and credential/escrow openings
- Issuer revocation advances a global credential generation; sends privately reject every credential from the previous generation (all holders re-attest)
- Pinned compiler 0.31.1 targets the runtime used by the current Midnight.js package set

---

## What is working

- Compiled Compact contract executed in the official runtime simulator
- Tests cover forged/stolen credentials, policy limits, quota replay, claims, reclaim, audit path, and revocation
- Interactive browser flows for issuer setup, sender, claim, activity, selective audit, and privacy simulation
- Vercel static-site build compiles the contract, generates keys, and builds the frontend

---

## What is not connected yet

- No deployed Preview contract or verified address/transaction hash
- No live Lace deploy/callTx/indexer adapter in the website
- No rolling monthly volume accumulator or issuer-signature credential flow
- The claim QR is a bearer link containing secrets; share only with its intended recipient

---

## Next milestone

Deploy and exercise the contract on Preview, implement and test wallet transactions and indexer reads, then validate the privacy and regulatory model with remittance partners.

# Compliance without surveillance.
### ZK Remit · a prototype on Midnight
