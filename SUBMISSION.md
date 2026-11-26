# ZK Remit — AKINDO Midnight Buildathon, Wave 3

**One-liner:** A privacy-first remittance prototype that models KYC eligibility, corridor policy, transfer limits, and selective disclosure with a Compact contract on Midnight.

- Repo: https://github.com/Cyptoboy777/zk-remit (Apache-2.0; `midnightntwrk` topic)
- Interactive browser simulator: https://cyptoboy777.github.io/zk-remit/
- Vercel website deployment: configured in `vercel.json`; deploy status/link must be added after Vercel publishes it
- Demo video: not recorded yet; see [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)
- Slides: [`docs/ZK-Remit-slides.pdf`](docs/ZK-Remit-slides.pdf), authored in [`SLIDES.md`](SLIDES.md)

## Prototype status

The hosted website executes the compiled Compact circuits in an in-browser runtime simulator. It does **not** connect to Midnight Preview, submit Lace transactions, use a deployed contract, or move real funds. The Lace discovery helper is not a live network adapter. Do not treat setting `VITE_CONTRACT_ADDRESS` as enabling live mode.

The seeded demo corridor is UAE → Philippines. UAE → India remains a product target and is not currently seeded as a demo corridor.

## What the contract models

1. A KYC issuer adds a credential commitment to a historic Merkle tree.
2. A sender proves credential membership and holder binding, checks expiry and issuer revocation, applies corridor policy and tier caps, and consumes an epoch-scoped nullifier.
3. The send circuit receives a shielded coin into escrow and publishes a receipt model. The recipient claims once; the sender can reclaim after the configured claim window.
4. The sender can create a challenge-bound ownership proof or selectively reveal receipt metadata using a view key in the simulator.

The public receipt model includes corridor, amount band, epoch, nullifier/receipt id, blinded tags, escrow commitment, and status. Identity, exact amount, credential, and holder secret are not stored as plain receipt fields. The claim QR contains bearer secrets and must only be shared with its intended recipient.

## Midnight implementation

- Compact source: [`contract/src/zk-remit.compact`](contract/src/zk-remit.compact)
- Pinned toolchain: compactc 0.31.1, Compact runtime 0.16.0, Midnight.js packages 4.1.1
- Public ledger: issuer and revocation registries, corridor policies, historic credential tree, nullifiers, receipts, and counters
- Private witnesses/state: issuer, holder, recipient, escrow opening, and Merkle paths
- Issuer revocation advances a public global credential generation. Sends privately require the credential generation to match, invalidating all older credentials without disclosing which issuer a sender uses. This conservative design requires every holder to re-attest after any issuer revocation; a selective private non-membership accumulator is future work.
- Tests: `npm test -w contract`; CI compiles the Compact source and builds the frontend

## Delivered and still open

| Area | Status |
|---|---|
| Compact contract and shielded escrow flow | Implemented and simulator-tested; not yet exercised on Preview |
| Issuer revocation | Enforced at send time and covered by regression test |
| Browser UX | Sender, recipient claim, issuer setup, activity, auditor view, privacy simulator; mobile navigation and amount validation |
| Vercel website build | Configured to install pinned compactc, compile ZK keys, build the frontend, and serve `frontend/dist` |
| Midnight Preview deployment and Lace calls | Not implemented; requires a deployed contract plus wallet/proof-server and transaction/indexer wiring |
| Rolling monthly volume accumulator | Not implemented; current quota is a count of epoch-scoped slots plus per-transfer caps |
| Issuer-signature credentials | Not implemented |
| Multi-device personas and production payout partner dashboard | Not implemented |
| Demo video | Not recorded |

## Build and run

```bash
npm ci
bash scripts/vercel-build.sh
npm test -w contract
npm run dev -w frontend
```

The Vercel build publishes only the simulator website. It does not deploy the Compact contract to Midnight. Do not publish a contract address or transaction hash unless it has been verified on the actual network.

## Product direction

The intended wedge is privacy-preserving compliance for GCC → India/Philippines remittances, with exchange houses and payout partners as potential customers. A production pilot would still need real Preview deployment, wallet and indexer integration, regulatory review, secure claim-link handling, signed issuer credentials, and a tested approach to rolling-volume limits.
