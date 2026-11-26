# Benchmark: what Midnight judges tend to reward

Honest scope note. This is a criteria-based comparison, not a teardown of named competitor projects. We could not open the other Wave 3 submissions or the judging rubric while preparing this, so the table compares ZK Remit with what Midnight's own example dApps and past Midnight hackathon write-ups emphasise: working zero-knowledge circuits, real selective disclosure, a clear story, a polished demo and honest documentation. Where we looked at nothing specific we say so rather than invent a rival.

| Area | What strong Midnight projects usually show | ZK Remit today | Gap and what we did |
| --- | --- | --- | --- |
| ZK circuits that matter | Circuits that enforce real rules, not a hash demo | Credential membership, issuer membership, expiry, corridor policy, tier cap, epoch quota with nullifiers, shielded escrow, claim and reclaim | Covered. Added 10 audit tests (S1 to S10) for replay, expiry, caps, quota, access control |
| Selective disclosure | A way to prove one fact and no more | Receipt ownership proof bound to an auditor challenge; view tags | Covered. The Home tab now has an interactive **Who sees what** panel for every action |
| Auditor or regulator view | A role with a defined view | Auditor tab reads public fields only; consent-based ownership proof | Covered |
| Real chain use | Deployed contract, working wallet flow | Live on Preview (ledger 9), seeded, Lace flow | Covered. Gap: claim and reclaim depend on reading the coin's tree index from the indexer, with no official API for it. Documented in the README |
| Secret handling | Secrets only in local private state | Witnesses only; device storage now sealed with AES-GCM; claim secret in the URL fragment only and cleared after use | Fixed in this pass, see SECURITY.md |
| Security story | A threat model and honest limits | SECURITY.md with findings C1 to C10 and F1 to F7 | Added. Two contract findings need a redeploy and are listed as next steps |
| UX | Clear flow, friendly errors, mobile ready | Guided send and claim, proof progress with elapsed time, plain errors, wallet help for the tDUST problem | Improved in this pass |
| Business case | Who pays and why ZK beats the status quo | Operators pay per transfer and per credential; no customer data off chain | Present. Stated honestly: no users or revenue yet |
| Docs and demo | README, video, deck that match the live app | README judge table, submission text, 60 to 90 second script | Updated in this pass |
| Verification | Tests and CI | 36 contract tests, 46 frontend tests, real-browser smoke test under the CSP, Lighthouse scores in CI | Added the browser and Lighthouse jobs |

The most valuable remaining gaps are the two redeploy items (C1 revocation at send, C2 claim window snapshot) and a recorded demo video.
