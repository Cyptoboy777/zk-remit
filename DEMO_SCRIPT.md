# ZK Remit — 60-second demo script

**Setup:** open the hosted site and confirm the persistent **Interactive simulator · no live transactions** badge. This walkthrough demonstrates the local compiled-contract simulator only; it is not a Midnight Preview deployment. Use a desktop browser wide enough to show the public/private comparison.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:08 | Home hero + prototype notice | "ZK Remit explores how a remittance app can prove compliance without publishing a sender's identity or exact transfer amount. This is a browser simulator, not a live payment network." |
| 0:08–0:18 | **Start a demo transfer** → sender form, $420, UAE → Philippines | "The demo seeds a local issuer, opens a test corridor, and issues a sample credential. Nothing is sent to a chain." |
| 0:18–0:32 | Sender view → **Send privately**; point to public ledger panel | "The compiled Compact contract checks credential membership, holder binding, expiry, corridor policy, tier cap and quota. The simulated ledger records a corridor, amount band and blinded receipt data—not the exact amount or credential." |
| 0:32–0:42 | **Claim** → open transfer | "The intended recipient claims the simulated escrow once. The QR link contains bearer secrets, so treat it like cash and share it only with the recipient." |
| 0:42–0:52 | **Auditor** → preview view-key receipts; create receipt proof | "The sender can preview which receipts match a view key or record a challenge-bound ownership proof in this simulator. This is not an external auditor verification service." |
| 0:52–1:00 | **Privacy Simulator** → compare public and private data | "ZK Remit is a prototype for selective disclosure on Midnight. Live wallet calls and Preview settlement are not yet connected." |

**Recording tips:** keep the simulator badge visible, show the public-versus-private panel, and never imply that the demo moved real funds or generated a live-chain transaction.
