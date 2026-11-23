# Deploy ZK Remit to Midnight Preview (operator laptop)

This runs on your own laptop. Your wallet recovery phrase stays on your laptop, in an untracked `.env` file. Never paste it into a chat, an issue, a commit or a website.

Tip: create a fresh Lace wallet just for Preview testing, so this phrase never protects real funds.

Time needed: about 45 minutes, most of it waiting for the faucet and tDUST.

## 0. What you need

- Docker Desktop (running)
- Node.js 22 or newer (`node -v`)
- Git, and this repo cloned: `git clone https://github.com/Cyptoboy777/zk-remit && cd zk-remit && git checkout wave3-top`
- Chrome or Brave with the Lace wallet extension

## 1. Start the proof server (keep this terminal open)

```bash
docker run -p 6300:6300 midnightntwrk/proof-server:8.1.3 midnight-proof-server -v
```

Check it in another terminal: `curl http://localhost:6300/version` should answer.

## 2. Set up Lace for Preview

1. Install Lace from lace.io and turn on Midnight.
2. Create a new wallet (write the 24 words on paper).
3. Settings: network **Preview**, proof server **http://localhost:6300**.

## 3. Get test tokens

1. Copy your unshielded Preview address from Lace.
2. Open the Preview faucet (https://midnight-tmnight-preview.nethermind.dev/), paste the address, solve the captcha, request tNIGHT.
3. In Lace, press **Generate tDUST**. Fees are paid in tDUST, and it takes a few minutes to build up.

## 4. Install, compile and check

```bash
npm ci
./scripts/install-compactc.sh 0.31.1
export PATH="$HOME/.local/compactc-0.31.1:$PATH"
npm run compact                 # compiles the contract with prover keys (about a minute)
npm run deploy:setup            # installs the deploy tooling once
cp .env.example .env            # open .env and put your Lace 24 words after MIDNIGHT_WALLET_MNEMONIC=
npm run deploy:preview -- --check
```

`--check` syncs the wallet and tells you whether tDUST is available. It deploys nothing. If it says no tDUST, wait a few minutes and run it again.

## 5. Deploy

```bash
npm run deploy:preview
```

It prints `CONTRACT ADDRESS: ...` and `DEPLOY TX: ...`, then registers a demo issuer, opens 7 corridors and enables Preview test funds, printing a tx hash for each.

It writes two files:

- `frontend/src/deployment.json`: network, contract address, deploy time and tx hashes. Public, commit it.
- `scripts/.local/operator.json`: governor and demo-issuer keys. Private and gitignored. Do not share or commit it.

If the deploy stops halfway, the address is already saved in `deployment.json`. Run it again with `--no-seed` only if you need a fresh contract.

## 6. Publish the address

```bash
git add frontend/src/deployment.json
git commit -m "Record Midnight Preview deployment"
git push origin wave3-top
```

Then fill the "Deployment (Midnight Preview)" table in `README.md` with the printed address and tx hashes (or send them to your assistant to fill in). Once the branch is merged, both the hosted sites rebuild and open in Midnight Preview mode on this contract automatically; Simulator stays available from the toggle.

## 7. Test the live flow (and record the demo)

1. Open the app, press **Connect Lace**, approve.
2. **Issuer** tab: paste the contents of `scripts/.local/operator.json` (it stays in this browser only), then **Issue my credential**.
3. **Send**: press **Get test funds** once, pick a corridor and amount, send. Proving takes up to a minute; approve in Lace. The "What the public ledger shows" panel re-reads the receipt from Preview.
4. **Claim**: open the claim link or QR, ideally in a second browser profile with a second Lace wallet. Claim; the read-back panel turns to "Claimed".
5. **Auditor**: prove ownership of the receipt to a challenge.

Copy the send and claim tx hashes into the README table too.

## Troubleshooting

- "Proof server is not reachable": Docker is not running or port 6300 is busy.
- "No tDUST": generate tDUST in Lace for the same wallet and wait.
- "Transfer still confirming" on claim: the send is not indexed yet. Wait a minute and press claim again.
