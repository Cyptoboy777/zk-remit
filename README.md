# ZK Remit — private, compliant remittances on Midnight

> **Send value across borders. Prove you're compliant. Reveal nothing else.**

ZK Remit is an **interactive browser prototype** of a privacy-preserving remittance flow. Its
Compact contract models a sender proving KYC membership, corridor eligibility, transfer limits,
and epoch quota before moving a shielded coin into escrow. The local simulator executes the
compiled contract and demonstrates claim/reclaim and selective disclosure.

**Important:** the hosted website is simulator-only. It does not connect to Midnight Preview,
Lace, a deployed contract, or real funds. The network adapter is intentionally disabled until the
wallet, contract deployment, and transaction/indexer integration are completed. The public ledger
model includes corridor, amount band, epoch, nullifier/receipt id, blinded tags, commitment, and
status; it does not expose the exact amount or credential.

- **Interactive simulator (GitHub Pages):** https://cyptoboy777.github.io/zk-remit/ (no live network transactions)
- **Contract:** [`contract/src/zk-remit.compact`](contract/src/zk-remit.compact)
- **Tests:** `npm test -w contract` (Compact runtime simulator)
- **Privacy Simulator:** original in-app tour — shielded vs disclosed language, proof-bloom moment, cinematic camera, 60fps quality tiers, reduced-motion / WebGL 2D fallback, **EN/ES/PT/ZH/FR** (model-driven; not a teardown clone)
- **Baseline tag:** `wave2-baseline` · Wave 3 work is tracked in Git history
- **Compare:** https://github.com/Cyptoboy777/zk-remit/compare/wave2-baseline...main

## Wave 3 changelog

| Metric | `wave2-baseline` | Wave 3 |
|---|---|---|
| Circuits | 7 | **10** (`addIssuer`, `revokeIssuer`, `setCorridorPolicy`, `sendRemittance`+escrow, `claim`, `reclaim`, …) |
| Value movement | None (compliance receipts only) | **Shielded escrow** via `receiveShielded` / `sendShielded` |
| Corridors | Boolean open/close | On-chain **`CorridorPolicy`** (caps, slots, max band, claim window) |
| Issuers | Single issuer = admin | **Multi-issuer** tree; revoking one issuer advances a global credential generation so old credentials fail privately at send time (all holders must re-attest) |
| Claim UX | Manual amount opening | **Claim link / QR** carrying escrow opening |
| Privacy UX | — | **“What will be revealed”** preview + **anonymity-set** meter + **Privacy Simulator** |
| UI | Basic tabs | Premium global UI · **EN / ES / PT / ZH / FR** |
| Networks | Simulator | Browser simulator only · no deployed Preview contract or live network client |

## What the contract checks (`sendRemittance`)

| # | Statement | Private | Disclosed |
|---|---|---|---|
| 1 | Credential leaf in historic tree | credential, path | root |
| 2 | Credential bound to holder | holder secret | — |
| 3 | Credential uses the current generation and issuer is in the historic registry | issuer key + generation | issuer-tree root; revocation advances a public global generation |
| 4 | Not expired | expiry | — |
| 5 | Corridor open + policy | tier | corridor, band |
| 6 | Amount ≤ tier cap for corridor | exact amount | band only |
| 7 | Epoch quota / nullifier fresh | slot↔holder | nullifier |
| 8 | Shielded coin escrowed | coin nonce | escrow commitment |

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

The current website has no live Midnight transaction client. Setting `VITE_CONTRACT_ADDRESS` alone does not enable one. A real Preview release still requires a tested Lace wallet flow, contract deployment, proof server, transaction submission, and indexer integration. Do not describe the hosted simulator as a live payment or publish invented contract addresses or transaction hashes.

## Deploy the website to Vercel

The root `vercel.json` builds the Compact contract with the pinned compiler, generates ZK keys, builds the Vite frontend, and serves `frontend/dist`. Vercel deployment publishes the **simulator website only**; it does not deploy the Compact contract to Midnight.

## Judge checklist

- [x] Compact compiles (0.31.1) with witnesses + commitments
- [x] Simulator tests assert ledger state (11 tests)
- [x] Frontend executes compiled circuits in the local runtime simulator and reads simulator ledger snapshots
- [x] Issuer revocation invalidates all credentials from the prior global generation; send-time enforcement preserves issuer privacy but requires re-attestation
- [ ] Live Preview deployment and Lace transaction/indexer integration (not yet implemented)
- [x] Privacy table (above) + in-app disclosure preview
- [x] Apache-2.0 · topic tagging welcome: `midnightntwrk`

## License

Apache-2.0. Compact contract and app code for Wave 3 are newly developed / materially extended during the wave relative to `wave2-baseline`.
