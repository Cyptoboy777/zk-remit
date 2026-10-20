# ZK Remit — 60-second demo script

**Setup:** open https://cyptoboy777.github.io/zk-remit/ (fresh tab, Simulator mode). Screen 1400×900. Optional: Lace connected for the last beat.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:07 | Hero + three stat tiles | "This is ZK Remit. Aisha is a nurse in Dubai sending money to her family in Kerala. Today every transfer copies her passport into four databases." |
| 0:07–0:17 | ① KYC Attestor → **Issue credential**, **Open corridor 🇦🇪→🇮🇳** | "A licensed exchange house verifies her once — and publishes only a hash into a Merkle tree on Midnight. Left: their private vault. Right: all the chain sees." |
| 0:17–0:32 | ② Sender → $420 → checklist all green → **Prove & send**; point to Public ledger | "Aisha's device proves six things in one Compact circuit: issued, hers, unexpired, licensed corridor, under her tier cap, quota left. The public ledger gets a corridor, an amount band and a nullifier. No name, no amount, no link between her transfers." |
| 0:32–0:40 | ③ Recipient → **Prove & claim**, then click again → "already claimed" | "Her brother claims with his own secret key — exactly once." |
| 0:40–0:50 | ⚔ Attack lab → click Forged, Stolen, Over-limit, Replay | "Forged credential, stolen credential, over the limit, replaying a quota slot — each one is rejected inside the circuit." |
| 0:50–0:57 | ④ Auditor → Mode A prove ownership; Mode B **Use Aisha's view key** → "Matched 2" | "And when a regulator legitimately asks, Aisha discloses on her terms: one receipt, or a read-only view key." |
| 0:57–1:00 | Header (Midnight network / Lace) | "ZK Remit: compliance without surveillance — built on Midnight." |

**Recording tips:** zoom browser to 110%; pre-type nothing (defaults are demo-ready); keep the right column visible so the public-vs-private contrast is always on screen.
