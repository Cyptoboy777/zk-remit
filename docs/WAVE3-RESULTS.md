# Wave 3 results

Every figure comes from the repository or its CI run on `main`. Nothing is estimated. Evidence of the live deployment is in [PROOF.md](../PROOF.md).

## Engineering

| Area | Result |
| --- | --- |
| Compact contract | 12 exported circuits, compactc 0.36.1 (language 0.28.0), compiles in CI on every push |
| Circuits | `addIssuer`, `revokeIssuer`, `issueCredential`, `setCorridorPolicy`, `closeCorridor`, `advanceEpoch`, `enableTestMint`, `mintTestSettlement`, `sendRemittance`, `claim`, `reclaim`, `proveReceiptOwnership` |
| Dual ledger | Public contract state (Merkle roots, nullifiers, receipts, corridor policy) plus Zswap shielded escrow (`receiveShielded` in, `sendShielded` out) |
| Private state | Witness-held holder secret, credential, Merkle paths, recipient secret and escrow opening; sealed on the device with AES-GCM |
| Selective disclosure | `proveReceiptOwnership` proves one receipt to one auditor challenge, nothing more |
| Deployment | Midnight Preview ledger 9; address and transaction in [PROOF.md](../PROOF.md) |

## Quality and reliability

| Check | Result |
| --- | --- |
| Contract tests | **46**, on the Compact runtime simulator, asserting ledger state |
| Frontend tests | **46**: secure storage, claim links, privacy matrix, CSP, deployment loading, error copy |
| Guard mutation check | Each `assert()` deleted and recompiled; a test must fail. **33 of 33** reachable guards caught, 1 unreachable guard documented, 0 survived |
| Browser smoke test | Playwright against the production build under the shipped CSP |
| Lighthouse (mobile, CI) | Performance 96 (home) and 97 (claim link); accessibility, best practices and SEO 100 |
| Indexer check | `scripts/verify-deployment.mjs` finds the contract on the public Preview indexer in CI |
| Dependency audit | `npm audit --omit=dev`: 12 moderate, 0 high, all in transitive Midnight SDK dependencies |

## Security

[SECURITY.md](../SECURITY.md) is a self-review, not a third-party audit: 10 contract findings and 7 frontend and tooling findings, each with a fix or a stated status and a test. Two contract limits need a redeploy and are listed openly: revocation is not enforced at send (C1) and the governor can lengthen a pending claim window (C2).

## Progression

The baseline is the `wave2-baseline` tag (the first commits in this repository, 20 Oct 2026).

| | `wave2-baseline` | Wave 3 |
| --- | --- | --- |
| Money movement | Compliance receipts only | Shielded escrow |
| Circuits | 7 | 12 |
| Corridors | Open or closed | On-chain policy: caps, slots, max band, claim window |
| Issuers | One issuer, also admin | Multi-issuer tree with revocation |
| Claim | Manual amount opening | Claim link or QR, fresh secret per transfer |
| Privacy UX | None | "Who sees what" explorer, disclosure preview, anonymity-set meter |
| Security | None | Review, encrypted device storage, strict CSP, a test per finding |
| Verification | Basic tests | 92 tests, guard mutation check, browser smoke test, Lighthouse |
| Network | Simulator | Simulator and Midnight Preview with Lace |

## Honest limits

No partners, users or revenue yet. The Lace send and claim run on Preview is pending in PROOF.md. Claim and reclaim use an indexer lookup for the coin's tree position because Midnight.js 5 has no official API for it.
