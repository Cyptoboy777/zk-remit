# ZK Remit — private, compliant remittances on Midnight

> **Send value across borders. Prove you're compliant. Reveal nothing else.**

ZK Remit lets a sender prove — in zero knowledge — that a cross-border transfer is
**KYC-attested, within licensed limits, on an approved corridor and under their epoch quota**,
then move **shielded settlement value** into escrow. The public ledger sees the corridor, an
amount *band*, an unlinkable nullifier and blinded tags. Name, exact amount, tier, issuer and
recipient stay private. The recipient claims with a claim link / QR; the sender can reclaim after
the corridor’s claim window.

- **Live demo (GitHub Pages):** https://cyptoboy777.github.io/zk-remit/
- **Contract:** [`contract/src/zk-remit.compact`](contract/src/zk-remit.compact)
- **Tests:** `npm test -w contract` (Compact runtime simulator)
- **Privacy Simulator:** original in-app tour — shielded vs disclosed language, proof-bloom moment, cinematic camera, 60fps quality tiers, reduced-motion / WebGL 2D fallback, **EN/ES/PT/ZH/FR** (model-driven; not a teardown clone)
- **Baseline tag:** `wave2-baseline` · **Wave 3 branch:** `wave3`
- **Compare:** https://github.com/Cyptoboy777/zk-remit/compare/wave2-baseline...wave3

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
| Networks | Simulator | Simulator live · Preview address **not set until user deploys** (never faked) |

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

Deploy to Midnight Preview: see [`../midnight-w3-prep/user-deploy-steps.md`](../midnight-w3-prep/user-deploy-steps.md) (captcha faucet + Lace + local proof server — user laptop only). Set `VITE_CONTRACT_ADDRESS` after deploy. **We never invent contract addresses, txs or users.**

## Judge checklist

- [x] Compact compiles (0.31.1) with witnesses + commitments
- [x] Simulator tests assert ledger state (11 tests)
- [x] Frontend calls circuits and reads ledger snapshot
- [ ] Deployed Preview address in README (blocked on user faucet / Lace)
- [x] Privacy table (above) + in-app disclosure preview
- [x] Apache-2.0 · topic tagging welcome: `midnightntwrk`

## License

Apache-2.0. Compact contract and app code for Wave 3 are newly developed / materially extended during the wave relative to `wave2-baseline`.
