# Security

This is the threat model, the audit findings and what was done about each one. It was written during Wave 3 against the contract deployed on Midnight Preview (ledger 9). It is an honest self-review, not a third-party audit.

Report a problem privately to the repository owner before posting it publicly.

## What we protect

| Asset | Who must not learn it |
| --- | --- |
| Sender identity, tier, issuer, exact amount | Everyone except the sender (and an auditor the sender chooses) |
| Recipient identity and wallet | Everyone except the recipient |
| Holder secret, credential, claim secret, operator keys | Anyone but the device that owns them |
| Escrowed value | Anyone but the intended recipient (claim) or the sender (reclaim after the window) |

## Trust assumptions

- The governor key can add or revoke issuers, open or close corridors, change corridor policy and advance the epoch. It cannot move escrowed funds.
- Licensed issuers are trusted to run real KYC. The contract only checks that a credential came from a listed issuer.
- The Midnight network, the Lace wallet and the Compact toolchain behave as documented.
- The Preview test-funds mint is a demo feature. It is off unless the governor enables it, and a production deployment never would.

## Contract findings

The deployed contract is not changed in this pass (it is live and seeded). Findings that need a contract change are marked **needs redeploy** and are the first items for the next release. Each finding has a test in `contract/src/test/zk-remit.test.ts` (names start with S1 to S10).

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| C1 | **Revocation is not enforced at send.** The send circuit keeps the issuer private, so it cannot test the public `revokedIssuers` set. A revoked issuer cannot issue new credentials, but credentials it already issued keep working until they expire. | Medium | Known limit, test S8. Mitigation today: short credential expiry. Fix **needs redeploy**: track a revocation epoch in the credential or prove non-membership in a revocation tree. |
| C2 | **Governor can lengthen the claim window of pending escrows.** `reclaim` reads the corridor's current `claimWindow`, so a policy change delays a sender's refund. Funds are delayed, never taken: the recipient can still claim. | Medium (trust) | Test S9. Fix **needs redeploy**: store the window in the receipt at send time. |
| C3 | **The claim link is a bearer secret.** Whoever opens it first can claim. | Medium | By design, reduced in the app (see F4). Future: bind the claim to the recipient's wallet key. |
| C4 | Claim has no expiry, so it races with reclaim after the window. The first valid transaction wins and the other fails with "already claimed". | Info | By design, test in the lifecycle suite. |
| C5 | The ledger shows corridor, amount band and epoch. With few transfers on a corridor the anonymity set is small. | Info | The app shows an anonymity-set estimate before sending. |
| C6 | `mintTestSettlement` creates demo tokens. | Low | Disabled by default, governor-gated, capped per call, test S10. Never enable it on mainnet. |
| C7 | Replay, double claim, double reclaim, wrong opening, wrong recipient, wrong sender | None found | Tests S1 and the lifecycle suite. A receipt's status moves once, and an opening bound to another receipt fails the escrow commitment. |
| C8 | Expiry and limits | None found | Expired credentials fail (S2). The tier cap is exact to the cent (S3). A slot cannot be reused in an epoch and nullifiers change each epoch (S4). |
| C9 | Integer overflow | None found | All widths are checked by the compiler. The cap check runs before the 128 to 64 bit cast, and `epoch + claimWindow` fails closed if it would overflow. |
| C10 | Access control | None found | Every governor circuit asserts the governor key (S7). Auditor disclosure requires the sender's view key (S6). |

**`disclose()` review.** Every `disclose` call in `zk-remit.compact` writes only: the corridor, the amount band, the epoch, the nullifier, the escrow commitment, the blinded recipient tag, the blinded view tag, tree roots (membership checks) and, for issuer and governor circuits, the operator's own public key. No secret, credential field, tier or exact amount is written to contract state. Assurance level: we confirmed this by reading the circuits and the compiled ledger fields. We did not independently decode a live transaction's full transcript to prove the coin value is absent from it, so treat "exact amount hidden" as "not in contract state", which is what the code guarantees.

## Frontend and tooling findings

| # | Finding | Severity | Fix | Test |
| --- | --- | --- | --- | --- |
| F1 | Secrets (holder secret, credential, escrow openings, operator keys) were kept as readable text in `localStorage`. | High | Sealed with AES-GCM using a non-extractable WebCrypto key held in IndexedDB. If WebCrypto or IndexedDB is unavailable, data stays in memory only and is never written as plaintext. Old entries are re-sealed once and deleted. The name of each entry is bound into the ciphertext, so a value cannot be replayed under another name. | `secureStore.test.ts` |
| F2 | No Content-Security-Policy. | Medium | Strict policy: no inline or remote scripts, no plugins, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`, plus `Referrer-Policy: no-referrer`, `nosniff`, a locked-down Permissions-Policy and COOP. Injected as a meta tag at build time and sent as headers on Vercel. | `security.test.ts`, CI browser smoke test |
| F3 | The recipient tag was the same for every transfer to one person, so receipts to the same recipient could be linked. | Medium | A fresh recipient secret for every transfer (carried in that transfer's claim link). | `claimLink.test.ts`, S5 |
| F4 | Claim link: loose parsing, secrets kept in memory and in the address bar after use. | Low | The secret lives only in the URL fragment (never sent to a server or in a referrer, never in the query). Payloads are strictly validated. After a successful claim the fragment is removed from the address bar and the in-memory secrets are zeroed. The UI warns that the link is single-use and private. | `claimLink.test.ts` |
| F5 | Raw errors were written to the browser console. | Low | Removed. A test fails the build if any `console.*` call or `localStorage` use appears outside the sealed store. Users only see mapped, plain-language messages. | `security.test.ts`, `friendlyErrors.test.ts` |
| F6 | Dependencies. | Info | `npm audit --omit=dev` reports no high or critical issues. It reports 12 moderate ones, all reached through the Midnight SDK's own dependency chain (`@effect/platform` cookie handling, which this app does not use). Tracked, not patchable from this repo. | CI audit step |
| F7 | Deploy tooling. | Info | The wallet phrase is read from an untracked `.env`, never printed or committed. Operator keys go to `scripts/.local/` (git-ignored, owner-only). The script prints only the contract address and transaction hashes. | review |

**Limits of the browser protection.** Sealing at rest protects against someone copying the browser profile's storage, a backup or a synced profile. It cannot stop script that runs inside the page from asking the browser to decrypt, which is why the CSP exists. Keep real funds out of a browser profile you do not control.

## What a network observer sees

An observer can see that a transaction reached the contract, its timing, and the public fields in the table above. They cannot link the sender's identity, the recipient's wallet or the exact amount from contract state. Timing and the small set of corridors and bands can still narrow guesses, which is why the app shows an anonymity-set estimate.

## Verifying this yourself

```bash
npm test                      # contract (S1-S10 and lifecycle) and frontend tests
npm run build -w frontend     # typecheck + production build
```

CI also runs a real Chromium against the production build under the shipped CSP (no violations allowed) and records Lighthouse scores.
