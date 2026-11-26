# ZK Remit demo video script (about 80 seconds)

Rules: real screens only. No invented numbers, users or partners. Record on Midnight Preview after you have the contract address in the Home tab. If Lace proving is slow, cut the wait to two or three seconds with a "Proving..." caption and never fake the result.

Setup: profile A has Lace with the funded Preview wallet and the operator keys pasted in the Issuer tab. Profile B has a second Lace wallet (the recipient). Screen 1440x900, zoom 100 percent, notifications off.

| Time | On screen | Voice-over | On-screen text |
| --- | --- | --- | --- |
| 0:00 to 0:05 | Hook. Cut straight to the sealed envelope on the Home tab, redacted block and amount band side by side. | Every money transfer leaks your identity to everyone in the chain. This one does not. | Prove you are compliant. Reveal nothing else. |
| 0:05 to 0:20 | Home tab, **Who sees what**. Click Send, then drag the amount slider so the band changes. | Pick any action and see what the public ledger learns. Drag the amount: the ledger only ever learns a band. The exact figure stays on your device. | Public: corridor and band. Sealed: you and the amount. |
| 0:20 to 0:32 | Connect Lace, Issuer tab, Issue my credential. | A licensed issuer vouches for me once. Only a fingerprint of that credential goes on chain, never my documents. | Credential: a commitment, nothing else |
| 0:32 to 0:50 | Send tab: corridor, amount, Send privately. Show the proof progress counter, the Lace approval, then the ledger read-back. | My device proves the credential is valid, the corridor is open and I am under my limit. The value moves into shielded escrow. The chain shows a corridor, a band and a status. Nothing else. | Zero-knowledge proof made in the wallet |
| 0:50 to 1:04 | Copy the claim link, open it in profile B, Claim transfer, read-back turns to claimed. | The recipient opens a one-time link and claims with a proof. If nobody claims in time, the sender takes it back. | Claimed. No identity on chain. |
| 1:04 to 1:14 | Profile A, Auditor tab, prove ownership of the receipt. | When an auditor asks, I prove that one receipt is mine, and nothing more. | Selective disclosure |
| 1:14 to 1:20 | End card: logo, contract address from the Home tab. | ZK Remit, on Midnight. | The same address you can check on the explorer |

Do not claim: partners, users, revenue, mainnet, or that the exact amount is invisible to the network. Say "not in contract state" if asked.
