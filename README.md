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
| `recipientSecret` | recipient's claim secret (travels in the claim link) | `recipientTagOf(secret)` must equal the receipt's `recipientTag` |
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

## Toolchain (ledger 8 / public nets)

| Component | Pin |
|---|---|
| compactc | **0.31.1** |
| compact-runtime | **0.16.0** |
| Midnight.js | **4.1.1** |
| Proof server | **8.1.3** (never `:latest`) |

## Develop

```bash
export PATH="$HOME/.local/compactc-0.31.1:$PATH"
npm ci
compactc contract/src/zk-remit.compact contract/src/managed/zk-remit   # or npm run compact -w contract
npm test -w contract
npm run build -w frontend
npm run dev -w frontend
```

## Host the frontend on Vercel

`vercel.json` holds the whole setup: import the repo with **Root Directory = repository root** and leave the build settings alone. The build installs `compactc` 0.31.1 (the compiled contract output is not committed, and the frontend needs it to typecheck, bundle and serve the prover keys), compiles the contract, then builds the frontend to `frontend/dist`. `VITE_BASE` is not set, so the app is served from `/`. Use Node 22 or newer. The rewrite sends unknown paths to `index.html` but never `keys/`, `zkir/` or `assets/`, so a missing prover file stays a real 404. Whatever `frontend/src/deployment.json` holds on the deployed branch is what the site uses.

## Deploy to Midnight Preview (operator laptop only)

Needs Docker, Node >= 22, the compiled contract, and a wallet funded on Preview. **The wallet recovery phrase / seed lives in an untracked `.env` or your shell and is never printed, logged or committed.** The deploy script prints only the contract address.

1. Start the proof server (pinned, never `:latest`):
   `docker run -p 6300:6300 midnightntwrk/proof-server:8.1.3 midnight-proof-server -v`
2. Install [Lace](https://www.lace.io/), enable Midnight, create or import a wallet, set the network to **Preview** and the proof server to `http://localhost:6300`.
3. Get tNIGHT from the [Preview faucet](https://midnight-tmnight-preview.nethermind.dev/) (you solve the captcha), then **Generate tDUST** in Lace (fees are paid in tDUST; it takes a few minutes to accrue).
4. Compile and install deploy tooling, then deploy:
   ```bash
   cp .env.example .env            # then put your Lace recovery phrase in .env (it is gitignored)
   npm run compact                 # needs compactc 0.31.1
   npm run deploy:setup            # installs scripts/ dependencies (wallet-sdk) once
   npm run deploy:preview -- --check   # optional: syncs and tells you if tDUST is available, deploys nothing
   npm run deploy:preview          # deploys, registers a demo issuer + 7 corridors, enables Preview test funds, prints the address
   ```
   It writes `frontend/src/deployment.json` (`{ network, contractAddress, deployedAt }`, safe to commit) and `scripts/.local/operator.json` (governor + issuer keys, **private, gitignored**). Pass `--no-seed` to skip seeding.
5. Commit `frontend/src/deployment.json`, then rebuild/redeploy the site. Add the address to the top of this README.

## Test on Midnight Preview

1. Open the app (or `npm run dev -w frontend`). With a deployment recorded it opens in **Midnight Preview** mode; use the toggle (top right) to fall back to the **Simulator**.
2. **Connect Lace.** The app tells you if Lace is missing, on the wrong network, or has no tDUST.
3. **Issuer tab → Operator keys:** paste the contents of `scripts/.local/operator.json` (kept in this browser only), then **Issue my credential**.
4. **Send:** pick a corridor and amount. Proof generation takes up to about a minute; Lace asks you to approve.
5. **Claim:** open the claim link / QR (ideally with a second Lace wallet). **Auditor tab:** prove ownership of a receipt to an auditor challenge, or share a read-only view key.

**Test funds (Preview only).** `sendRemittance` escrows a shielded settlement token and the Preview faucet only issues unshielded tNIGHT, so the contract has a **Preview-only** `mintTestSettlement(amount)` circuit (capped at 1000.00 per call). It is inert unless the governor calls `enableTestMint()`, which `deploy:preview` does and a production deployment never would. In the app, the Send screen shows **Get test funds** when your settlement balance is 0. The first mint records the minted token's colour as the settlement colour; those tokens are demo tokens, not money.

**Releasing escrow on Preview.** Claim and reclaim resolve the escrow coin's real tree index from the indexer right before proving (see "What stays private" above). If the send is still confirming, the app says so and asks the user to try again in a minute; nothing is spent.

**We never invent contract addresses, transactions or users.**

## Deployment (Midnight Preview)

Filled in after the operator deploy (see [`docs/DEPLOY_PREVIEW.md`](docs/DEPLOY_PREVIEW.md)). Nothing here is invented: each value is copied from the deploy script output.

| Item | Value |
|---|---|
| Network | Midnight Preview |
| Contract address | _pending deploy_ |
| Deploy transaction | _pending deploy_ |
| Seed transactions (issuer, corridors, test funds) | _pending deploy_ |
| First end-to-end send / claim | _pending deploy_ |

## Judge checklist

- [x] Compact compiles (0.31.1) with witnesses + commitments
- [x] Simulator tests assert ledger state (contract) + deployment loading / backend selection / friendly-error tests (frontend)
- [x] Frontend calls circuits and reads ledger snapshot
- [ ] Deployed Preview address in README (run `npm run deploy:preview`, then add the address here)
- [x] Privacy table (above) + in-app disclosure preview
- [x] Apache-2.0 license, public repo, topic `midnightntwrk`

## License

Apache-2.0. Compact contract and app code for Wave 3 are newly developed / materially extended during the wave relative to `wave2-baseline`.
