# Wave 3 submission comment (paste into the AKINDO page, scored by the rubric)

Every number below comes from the repository and its CI run. Nothing is estimated.

ZK Remit: private cross-border remittance on Midnight. A sender proves they hold a valid KYC credential and stay inside a corridor limit, locks the funds in a shielded escrow, and the recipient claims with a one-time link. The public ledger learns a corridor and an amount band, nothing else. A regulator can verify compliance for one receipt without seeing identities or amounts.

What changed since Wave 2: the contract is deployed and used on Midnight Preview (ledger 9), claim and reclaim are written to spend a real shielded escrow (add your Preview send and claim transaction hashes here once you have run them), a Preview-only test-funds mint lets any wallet try it, the app has a Preview mode with Lace, and we ran a security review and a mutation check on our own contract. Details in the README changelog and SECURITY.md.

1. Engineering and Implementation (40%)
- One Compact contract (compactc 0.36.1) with 34 guards across issuer, sender, claim, reclaim, audit and governor circuits. Witness-held private state, Merkle membership for credentials and issuers, per-epoch nullifiers, shielded escrow with receiveShielded and sendShielded, blinded view tags for selective disclosure. The README explains the dual-ledger split and has an architecture diagram.
- Deployed on Midnight Preview: contract 0baf0281028181bf6d53c9f1ff37109252202244fe861cea2d90e132ee8615d3, deploy transaction 0cdd84e2a98028f3d50972140f9eb75f696ee2903225486bd7876991e4141bad. `node scripts/verify-deployment.mjs` confirms it through the public indexer.
- Local secrets are sealed with AES-GCM, claim secrets stay in the URL fragment, strict CSP. SECURITY.md lists 17 findings with fixes and tests.

2. Quality Assurance and Reliability (15%)
- 46 contract tests on the Compact runtime and 46 frontend tests, all passing in CI.
- Mutation check: the script deletes each of the contract's guards, recompiles and requires a test to fail. First run caught 22 of 34. We wrote tests for the 12 misses (forged Merkle paths, band limit, unknown receipts, reclaim opening). Now 33 of 33 reachable guards are caught. One guard is unreachable by design and documented.
- A real Chromium runs the production build under the shipped CSP in CI, sends a transfer in Simulator mode and opens a claim link. Lighthouse in CI: home 96, claim link 97 performance, 100 accessibility.

3. Product and Vision (15%)
- Remittances move personal data through several companies. ZK Remit lets a licensed operator prove compliance without holding or exposing customer data on chain. Next steps are walletless claim, a one-operator sandbox and mainnet when available.

4. User Experience and Design (15%)
- Guided send and claim, proof progress with a live timer, plain-language errors, a Lace and tDUST help card, an interactive panel showing what is public and what stays sealed for every action. Works end to end on Preview with Lace, with a Simulator mode anyone can try without a wallet.

5. Communication (10%)
- Video script and slide deck outline in docs/. README has a judge table mapping each ask to where it is in the app and the proof in the repo.

6. Business Development and Viability (5%)
- Buyers are licensed remittance operators. Fees per transfer and per credential, with a partner sandbox path. Honest status: no partners, users or revenue yet.

Still missing, stated plainly: issuer revocation does not cancel credentials already issued, and the governor can lengthen a corridor's claim window for pending escrows. Both need a contract redeploy and are listed in SECURITY.md. Claim and reclaim on Preview depend on reading the coin's tree position from the indexer, which has no official API.
