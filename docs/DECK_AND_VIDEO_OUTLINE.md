# Deck and 2-minute video outline

Rules: real screens only, no invented numbers or users, product name and its own site on the end card.

## Deck (8 slides)

1. Title: ZK Remit. Send money across borders, prove you are compliant, reveal nothing else.
2. Problem: every remittance copies personal data through several companies; compliance today means exposure.
3. How it works: issuer commitment, sender proof, shielded escrow, claim link, auditor disclosure (one diagram).
4. What is public and what stays private: the table from the README, two columns.
5. Under the hood: witnesses, Merkle membership, nullifiers, persistentCommit escrow, receiveShielded / sendShielded, real tree index from the indexer. Dual ledger: public contract state plus shielded Zswap.
6. Live on Midnight Preview: contract address, deploy tx, screenshots of send, claim, read-back.
7. Who pays: licensed remittance operators, per-transfer and per-credential fees, partner sandbox path. Honest status: no partners yet.
8. Team and next steps: walletless claim, one-operator sandbox, mainnet when available.

## Video (about 2:00)

- 0:00 to 0:12 Hook: "Sending money home should not mean handing your identity to everyone in between."
- 0:12 to 0:30 The idea in one sentence over the home screen, then the public vs private panel.
- 0:30 to 1:00 Sender on Preview: connect Lace, issue credential, get test funds, send. Show the proof step and the ledger read-back showing only corridor and band.
- 1:00 to 1:25 Recipient opens the claim link on a second profile: three-step guide, claim, read-back turns to Claimed.
- 1:25 to 1:40 Auditor: prove ownership of one receipt to a challenge.
- 1:40 to 1:52 Under the hood in one shot: the contract's witnesses and the test run passing.
- 1:52 to 2:00 End card: ZK Remit and its site.
