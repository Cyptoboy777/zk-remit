<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/public/brand/logo.svg" />
    <img src="frontend/public/brand/logo-on-light.svg" alt="ZK Remit" height="64" />
  </picture>
</p>

# ZK Remit — private, compliant remittances on Midnight

> **Send value across borders. Prove you're compliant. Reveal nothing else.**

ZK Remit lets a sender prove — in zero knowledge — that a cross-border transfer is
**KYC-attested, within licensed limits, on an approved corridor and under their epoch quota**,
then move **shielded settlement value** into escrow. The public ledger sees the corridor, an
amount *band*, an unlinkable nullifier and blinded tags. Name, exact amount, tier, issuer and
recipient stay private. The recipient claims with a claim link / QR; the sender can reclaim after
the corridor’s claim window.

- **Live demo (GitHub Pages):** https://cyptoboy777.github.io/zk-remit/
- **Midnight Preview contract:** see [Deployment](#deployment-midnight-preview) below. The address is recorded in [`frontend/src/deployment.json`](frontend/src/deployment.json) and the app switches to it automatically. Until then the app runs in Simulator mode and says so.
- **Deploy guide (laptop):** [`docs/DEPLOY_PREVIEW.md`](docs/DEPLOY_PREVIEW.md)
- **Contract:** [`contract/src/zk-remit.compact`](contract/src/zk-remit.compact)
- **Tests:** `npm test -w contract` (Compact runtime simulator)
- **Privacy Simulator:** original in-app tour — shielded vs disclosed language, proof-bloom moment, cinematic camera, 60fps quality tiers, reduced-motion / WebGL 2D fallback, **EN/ES/PT/ZH/FR** (model-driven; not a teardown clone)
- **Baseline tag:** `wave2-baseline`

## What judges ask for, and where to see it

| Judge ask | Where it is in the app | Proof in the repo |
| --- | --- | --- |
| Real on-chain use of the deployed contract (send, claim, reclaim, receipt proof) with Lace on Preview | Connect Lace, then Send, Claim and Auditor tabs. The Home tab shows the contract address. | Address and transaction hashes in [`frontend/src/deployment.json`](frontend/src/deployment.json); `contract/src/zk-remit.compact` |
| Clear "what is public, what stays private" for every action | Home tab, **Who sees what** (pick Send, Claim, Reclaim, Audit and drag an amount); Send tab, **What the ledger sees** | [`privacyMatrix.ts`](frontend/src/lib/privacyMatrix.ts) plus its test; the table in this README |
| Selective disclosure: a regulator checks compliance without amounts or identities | Auditor tab: prove ownership of one receipt to one challenge | `proveReceiptOwnership` and test S6 |
| Secrets stay local and are never logged or sent | Nothing to configure. Secrets are sealed on the device. | [`secureStore.ts`](frontend/src/lib/secureStore.ts), tests, [SECURITY.md](SECURITY.md) F1, F4, F5 |
| Real-world story and business model | Home tab corridors, the [Who pays](#who-pays-business-model) section | Below |
| Tests for every circuit and edge case, CI green | CI badge on the repo | 36 contract tests and 46 frontend tests, plus a browser smoke test and Lighthouse run in CI |
| Demo video script and deck that match the live app | n/a | [`docs/VIDEO_SCRIPT.md`](docs/VIDEO_SCRIPT.md), [`docs/DECK_AND_VIDEO_OUTLINE.md`](docs/DECK_AND_VIDEO_OUTLINE.md) |

Security review with threat model, findings and fixes: [SECURITY.md](SECURITY.md). Criteria-based comparison with what judges tend to reward: [docs/BENCHMARK.md](docs/BENCHMARK.md).

## Wave 3 changelog

| Metric | `wave2-baseline` | Wave 3 |
|---|---|---|
| Circuits | 7 | **10** (`addIssuer`, `revokeIssuer`, `setCorridorPolicy`, `sendRemittance`+escrow, `claim`, `reclaim`, …) |
| Value movement | None (compliance receipts only) | **Shielded escrow** via `receiveShielded` / `sendShielded` |
| Corridors | Boolean open/close | On-chain **`CorridorPolicy`** (caps, slots, max band, claim window) |
| Issuers | Single issuer = admin | **Multi-issuer** tree + revoke-at-issue |
| Claim UX | Manual amount opening | **Claim link / QR** carrying escrow opening |
| Privacy UX | — | **“What will be revealed”** preview + **anonymity-set** meter + **Privacy Simulator** |
| UI | Basic tabs | Premium global UI · **EN / ES / PT / ZH / FR** |
| Networks | Simulator | Simulator + **Midnight Preview mode** (Lace, `deployment.json`). The app defaults to Preview only when a real deployment is recorded |

## What’s proven (`sendRemittance`)

| # | Statement | Private | Disclosed |
|---|---|---|---|
| 1 | Credential leaf in historic tree | credential, path | root |
| 2 | Credential bound to holder | holder secret | — |
| 3 | Issuer still in activeIssuers tree | which issuer | issuer-tree root |
| 4 | Not expired | expiry | — |
| 5 | Corridor open + policy | tier | corridor, band |
| 6 | Amount ≤ tier cap for corridor | exact amount | band only |
| 7 | Epoch quota / nullifier fresh | slot↔holder | nullifier |
| 8 | Shielded coin escrowed | coin nonce | escrow commitment |

## What stays private / what is public

Midnight runs two ledgers side by side, and ZK Remit uses both on purpose.

**Public ledger (contract state, readable by anyone through the indexer):** `governorPk`, the issuer tree root (`activeIssuers`), the credential tree root (`credentials`), `revokedIssuers`, `corridorPolicy`, `epoch`, `nullifiers`, and one `Receipt` per transfer holding only corridor (from/to country), amount band, epoch, an escrow commitment, a recipient tag, a view tag and a status (PENDING / CLAIMED / REFUNDED). Counters (`totalReceipts`, `claimedCount`, `refundedCount`, `bandVolume`) are aggregates.

**Shielded ledger (Zswap):** the settlement value itself. `sendRemittance` takes custody with `receiveShielded`, `claim`/`reclaim` pay out with `sendShielded`. The chain stores only a coin commitment and, when spent, a nullifier. The coin's nonce and exact value never appear in contract state.

**Private state (on the user's device only, fed to circuits through witnesses):**

| Witness | What it holds | How it is bound on chain |
|---|---|---|
| `holderSecret` | sender's secret key | `holderPublicKey` must equal `credential.holderPk`; derives the nullifier and view key |
| `heldCredential` | tier, country, issuer, expiry, salt | `persistentHash` leaf proven in `credentials` via `credentialPath` |
| `issuerPath` / `credentialPath` | Merkle paths | `merkleTreePathRoot` checked against the historic roots |
| `recipientSecret` | recipient's claim secret (a fresh one per transfer, travels only in that transfer's claim link fragment) | `recipientTagOf(secret)` must equal the receipt's `recipientTag` |
| `escrowSalt` / `escrowOpening` | coin opening + salt, including the coin's real tree index | `persistentCommit` must equal the receipt's `escrowCommit` |
| `governorSecret` / `issuerSecret` | operator keys | hashed and compared with `governorPk` / issuer tree |

**The escrow tree index (`mt_index`).** Spending a contract-held coin needs its position in Zswap's global coin tree, which only exists after the send transaction is applied. So the escrow commitment binds nonce, colour and value only, and `claim`/`reclaim` receive the real index in the opening. The app resolves it right before spending: it recomputes the coin commitment for (coin, this contract) and finds that leaf in the Zswap state the indexer returns for the contract ([`frontend/src/lib/escrowIndex.ts`](frontend/src/lib/escrowIndex.ts), tested against the real ledger WASM). Storing the coin with `writeCoin` would have given the index for free, but it publishes the exact amount, so we did not.

**Selective disclosure.** A sender can prove to an auditor that a given receipt is theirs (`proveReceiptOwnership`, bound to the auditor's challenge) or share a read-only view key, without revealing anything else.

## Who pays (business model)

ZK Remit is infrastructure for licensed remittance operators (money transfer operators, e-money issuers, remittance-focused fintechs) on corridors such as UAE to Philippines, USA to Mexico, Saudi Arabia to Pakistan and UK to Nigeria.

- **Operators pay**, not senders directly: a small per-transfer protocol fee (a fraction of the operator's own fee) for compliant private settlement, plus a per-credential fee when their KYC desk issues an attestation that the user can reuse.
- **Why an operator would:** they already pay for KYC and transaction monitoring. ZK Remit lets them prove limits and corridor rules on chain while keeping customer data off it, which lowers data-breach exposure and makes cross-operator credential reuse possible.
- **Auditors and regulators** get read access to public receipt fields and consent-based disclosure, which is what a partner integration needs to clear compliance review.
- **Partner path:** start with one licensed operator on one corridor in a sandbox, issuing credentials from its existing KYC flow, then add corridors through `setCorridorPolicy`.

Honest status: there are no partners, users or revenue yet. This section describes the intended model, not traction.

## Toolchain (ledger 9: Preview, Preprod, Mainnet)

Midnight Preview restarted as a new ledger 9 chain on 7 Nov 2026, so the whole stack moved up together.

| Component | Pin |
|---|---|
| compactc | **0.36.1** (language 0.28.0) |
| compact-runtime | **0.21.0** |
| Midnight.js | **5.0.1** |
| Wallet SDK (deploy script) | **2.0.1** |
| DApp Connector API (Lace) | **4.1.0** |
| Proof server | **9.0.2** (never `:latest`) |

## Develop

```bash
./scripts/install-compactc.sh          # installs compactc 0.36.1
export PATH="$HOME/.local/compactc-0.36.1:$PATH"
npm ci
compactc contract/src/zk-remit.compact contract/src/managed/zk-remit   # or npm run compact -w contract
npm test -w contract
npm run build -w frontend
npm run dev -w frontend
```

## Host the frontend on Vercel

`vercel.json` holds the whole setup: import the repo with **Root Directory = repository root** and leave the build settings alone. The build installs `compactc` 0.36.1 (the compiled contract output is not committed, and the frontend needs it to typecheck, bundle and serve the prover keys), compiles the contract, then builds the frontend to `frontend/dist`. `VITE_BASE` is not set, so the app is served from `/`. Use Node 22 or newer. The rewrite sends unknown paths to `index.html` but never `keys/`, `zkir/`, `compiler/` or `assets/`, so a missing prover file stays a real 404. Whatever `frontend/src/deployment.json` holds on the deployed branch is what the site uses.

## Deploy to Midnight Preview (operator laptop only)

Full walkthrough: [`docs/DEPLOY_PREVIEW.md`](docs/DEPLOY_PREVIEW.md). Short version: fund a Lace wallet on Preview (faucet, then Generate tDUST), put its phrase in an untracked `.env`, and run

```bash
npm run deploy:preview:all
```

It checks Node, Docker, the proof server (starts 9.0.2 if missing), compactc 0.36.1 and the compiled contract (installs and compiles if missing), the phrase (never printed) and tDUST, then deploys, seeds a demo issuer, 7 corridors and Preview test funds, and fills the Deployment table below. `npm run deploy:check` does everything except the deploy. If Lace's "Generate tDUST" fails, `npm run dust:register` registers the wallet's tNIGHT for tDUST from the command line (Wallet SDK 2, works on Windows too).

## Test on Midnight Preview

1. Open the app (or `npm run dev -w frontend`). With a deployment recorded it opens in **Midnight Preview** mode; use the toggle (top right) to fall back to the **Simulator**.
2. **Connect Lace.** The app tells you if Lace is missing, on the wrong network, or has no tDUST.
3. **Issuer tab → Operator keys:** paste the contents of `scripts/.local/operator.json` (kept in this browser only), then **Issue my credential**.
4. **Send:** pick a corridor and amount. Proof generation takes up to about a minute; Lace asks you to approve.
5. **Claim:** open the claim link / QR (ideally with a second Lace wallet). **Auditor tab:** prove ownership of a receipt to an auditor challenge, or share a read-only view key.

**Test funds (Preview only).** `sendRemittance` escrows a shielded settlement token and the Preview faucet only issues unshielded tNIGHT, so the contract has a **Preview-only** `mintTestSettlement(amount)` circuit (capped at 1000.00 per call). It is inert unless the governor calls `enableTestMint()`, which `deploy:preview` does and a production deployment never would. In the app, the Send screen shows **Get test funds** when your settlement balance is 0. The first mint records the minted token's colour as the settlement colour; those tokens are demo tokens, not money.

**Releasing escrow on Preview.** Claim and reclaim resolve the escrow coin's real tree index from the indexer right before proving (see "What stays private" above). If the send is still confirming, the app says so and asks the user to try again in a minute; nothing is spent. Midnight.js 5 and ledger-v9 have no official "index of this commitment" API, so the lookup reads the Zswap state the indexer returns and has three outcomes: found, not yet (still confirming), or unreadable. Unreadable stops before any fee and tells the user the funds stay in escrow and the sender can reclaim after the window. Tests cover the indexer round trip, indices past 255, and both fallbacks.

**We never invent contract addresses, transactions or users.**

## Deployment (Midnight Preview)

Filled in by `npm run deploy:fill-docs` after the operator deploy (see [`docs/DEPLOY_PREVIEW.md`](docs/DEPLOY_PREVIEW.md)). Nothing here is invented: each value is copied from `frontend/src/deployment.json`, which the deploy script writes.

<!-- deployment:start -->
| Item | Value |
| --- | --- |
| Network | Midnight Preview (ledger 9) |
| Contract address | `0baf0281028181bf6d53c9f1ff37109252202244fe861cea2d90e132ee8615d3` |
| Deploy transaction | `0cdd84e2a98028f3d50972140f9eb75f696ee2903225486bd7876991e4141bad` |
| Deployed | 2026-11-24 |
| Seed transactions | 9 (demo issuer, corridors, Preview test funds) |
| Explorer | https://preview.midnightexplorer.com (search the address) |
<!-- deployment:end -->

## Judge checklist

- [x] Compact compiles (0.36.1, ledger 9) with witnesses + commitments
- [x] Simulator tests assert ledger state (contract) + deployment loading / backend selection / friendly-error tests (frontend)
- [x] Frontend calls circuits and reads ledger snapshot
- [x] Deployed Preview address in README (see Deployment above)
- [x] Security review ([SECURITY.md](SECURITY.md)) with a test per finding
- [x] Privacy table (above) + in-app disclosure preview
- [x] Apache-2.0 license, public repo, topic `midnightntwrk`

## License

Apache-2.0. Compact contract and app code for Wave 3 are newly developed / materially extended during the wave relative to `wave2-baseline`.
