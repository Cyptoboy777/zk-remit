# AKINDO submission draft (Midnight Wave 3)

Note: ZK Remit has no AKINDO product page yet. It has to be created and submitted before Nov 30, 20:30 IST. The Deployment block is filled in by npm run deploy:fill-docs after the Preview deploy; fill the remaining bracketed links by hand. Plain text below, no markdown formatting, ready to paste.

## Product name

ZK Remit

## Tagline

Send money across borders, prove you are compliant, reveal nothing else.

## About

Millions of people send part of every paycheck home. Each transfer leaves a trail of personal data with every company it passes through: name, ID, exact amount, who received it. ZK Remit is a way for licensed remittance operators to settle those transfers on Midnight without spreading that data around.

A licensed KYC issuer gives the sender a credential, and only a commitment to it goes on chain. When the sender pays, their device proves in zero knowledge that the credential is valid and unexpired, that the corridor is open, that the amount is under their tier's limit and that they have not used up this period's quota. The ledger only learns the corridor, an amount band, a one-time nullifier and two blinded tags. The money itself moves as a shielded token into escrow inside the contract.

The recipient gets a claim link or QR code. Opening it walks them through three plain steps, and they claim with a proof that they hold the link. If nobody claims within the corridor's window, the sender can take the money back. When an auditor needs to check a transfer, the sender can prove that a specific receipt is theirs, and nothing else.

## What we built in Wave 3

The contract now holds real value. Sends escrow a shielded settlement token with receiveShielded, and claim and reclaim pay out with sendShielded. Spending that escrow needs the coin's position in Midnight's coin tree, which only exists after the send lands, so the app finds it from the indexer by matching the coin commitment. The amount is never written to public state.

Corridors have on-chain policies: per-tier caps, transfer slots per epoch, a maximum amount band and a claim window. There are multiple KYC issuers in a Merkle tree, with revocation.

On Preview there is a capped test-funds mint so anyone can try a full send and claim. It is switched off unless the governor turns it on.

The frontend connects Lace through the DApp Connector, lets Lace generate the proofs, runs every circuit against the deployed contract and re-reads the receipt from the chain after each step. A Simulator mode, clearly labeled, runs the same compiled contract in the browser for people without a wallet.

When Midnight relaunched Preview on ledger 9 in November, we moved the whole project to the new stack: Compact 0.36.1, Midnight.js 5 and Wallet SDK 2. Deploying is one command that checks Docker, the proof server, the compiler and the wallet's tDUST before it spends anything.

There are 36 contract tests on the Compact runtime and 46 frontend tests, all passing in CI, which also compiles the contract with compactc 0.36.1 on every push, runs a real browser against the production build and records Lighthouse scores.

## Privacy and security work this week

We wrote down, for every action, what the public ledger learns and what stays sealed, and put it in the app as an interactive panel anyone can try. We then reviewed our own contract, app and scripts and wrote up the findings in SECURITY.md with a test for each. The app now seals its local secrets with a device key, gives every transfer its own recipient key so two transfers to the same person cannot be linked, keeps the claim secret in the link's fragment and clears it after use, and ships a strict content security policy. Two contract limits need a redeploy to fix, and we list them plainly instead of hiding them: revoking an issuer does not cancel credentials it already issued, and the governor can lengthen a corridor's claim window for escrows already pending.

## Deployment

<!-- deployment:start -->
Contract address on Midnight Preview: 0baf0281028181bf6d53c9f1ff37109252202244fe861cea2d90e132ee8615d3
Deploy transaction: 0cdd84e2a98028f3d50972140f9eb75f696ee2903225486bd7876991e4141bad
Deployed on: 2026-11-24
Seed transactions recorded: 9
<!-- deployment:end -->
Live app: https://cyptoboy777.github.io/zk-remit/

## Who pays

Licensed remittance operators, not senders. They would pay a small per-transfer fee for compliant private settlement and a per-credential fee when their KYC desk issues a reusable attestation. They already pay for KYC and monitoring. This keeps customer data off chain while the rules are still provable. We do not have partners or users yet. The next step is one operator on one corridor in a sandbox.

## What is next

Walletless claiming for recipients through a sponsored claim, a partner sandbox with one licensed operator, and a mainnet deployment once Midnight's mainnet supports it.

## Links

Repo: https://github.com/Cyptoboy777/zk-remit
Demo video: [link]
Deck: [link]
