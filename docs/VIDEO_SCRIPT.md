# ZK Remit · 2-minute demo video script

Length: about 2:00 at a calm pace (roughly 270 spoken words).
Rules: real screens only, no invented numbers or users. Record the Preview scenes after the contract is deployed. If you record before the deploy, use Simulator mode and leave the "Simulator mode" badge visible, and say "in the simulator" instead of "on Preview".

Setup before recording
- Browser profile A: Lace with the funded Preview wallet, operator keys pasted in the Issuer tab.
- Browser profile B: a second Lace wallet (the recipient).
- Screen at 1440x900, browser zoom 100%, notifications off, bookmarks bar hidden.
- Terminal with `npm test` ready for the under-the-hood shot.

| Time | On screen (shot) | Voice-over | On-screen text |
| --- | --- | --- | --- |
| 0:00 to 0:10 | Home screen, slow push-in on the sealed-envelope card. | Sending money home should not mean handing your identity to every company in between. | Private by design |
| 0:10 to 0:24 | Scroll the home hero, then open Send and hover over "What the ledger sees". | ZK Remit lets a licensed operator settle a transfer on Midnight. The sender proves they follow the rules, and the public ledger only learns the corridor and an amount band. | Prove compliance. Reveal nothing else. |
| 0:24 to 0:38 | Press Connect Lace, approve in Lace. Issuer tab: Issue my credential. | I connect Lace on Midnight Preview. A KYC issuer gives me a credential, and only a commitment to it goes on chain. | Credential: commitment only |
| 0:38 to 1:00 | Send tab: Get test funds (if balance is 0), choose AE to PH, 420, Send privately. Show the proving stage, the Lace approval, then the "What the public ledger shows" panel. | Now I send. My device proves the credential is valid, the corridor is open, the amount is under my limit and I have not used up this period's quota. The money moves as a shielded token into escrow. The read-back from the chain shows the corridor, the band, and "waiting to be claimed". Nothing else. | Zero-knowledge proof made by Lace |
| 1:00 to 1:22 | Copy the claim link, open it in profile B. Show the three-step claim guide, press Claim transfer, approve, read-back turns to Claimed. | The recipient gets a link or a QR code. It walks them through three plain steps, and they claim with a proof that they hold the link. If nobody claims in time, the sender can take the money back. | Claimed, with no identity on chain |
| 1:22 to 1:37 | Back in profile A: Auditor tab, enter a challenge, prove ownership of the receipt. | When an auditor asks, the sender proves that one receipt is theirs, to that auditor's challenge, and nothing more. | Selective disclosure |
| 1:37 to 1:50 | Split screen: the contract's witness list in zk-remit.compact, then the terminal running `npm test` with all tests passing. | Under the hood: Compact witnesses, Merkle membership for issuers and credentials, nullifiers for quotas, and a committed shielded escrow, tested in CI. | Compact 0.36.1 · Midnight.js 5 · ledger 9 |
| 1:50 to 2:00 | End card: ZK Remit logo on the dark background, the app address underneath. | ZK Remit. Prove compliance, reveal nothing else. | ZK Remit · cyptoboy777.github.io/zk-remit |

Recording tips
- Proving can take up to a minute: record it, then cut the wait down to two or three seconds with a "Proving..." caption. Do not fake or speed-ramp the result itself.
- Keep the cursor slow and centered; zoom in 120 to 140 percent in editing on the ledger read-back panels so the corridor and band are readable on a phone.
- Use the contract address and tx hashes from frontend/src/deployment.json if you show them; never type them by hand.
- Music: quiet and low under the voice, fading out on the end card.
