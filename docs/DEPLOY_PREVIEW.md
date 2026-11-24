# Deploy ZK Remit to Midnight Preview (your laptop)

Your wallet phrase stays on your laptop in an untracked `.env` file. Never paste it into a chat, an issue, a commit or a website.

Tip: make a fresh Lace wallet just for Preview, so this phrase never guards real money.

Time: about 30 to 45 minutes, mostly waiting for tDUST and the first wallet sync.

Note: Midnight Preview restarted as a new ledger 9 chain on 7 Nov 2026. Old Preview balances and contracts are gone, so even an old Lace wallet needs fresh tNIGHT and a fresh "Generate tDUST".

## What you need (one time)

- Docker Desktop, open and running
- Node.js 22.12 or newer (`node -v`)
- macOS or Linux. On Windows, use WSL (Ubuntu): the Compact compiler has no Windows build.
- Chrome or Brave with the Lace wallet extension

## The steps

1. Lace: install it, turn on Midnight, create a wallet, set the network to Preview. Write the 24 words on paper.
2. Faucet: copy your `mn_addr_preview1...` address from Lace, open https://faucet.preview.midnight.network/ , paste it, solve the captcha, request tNIGHT.
3. In Lace, press Generate tDUST, then Review and Confirm. tDUST starts filling up over a few minutes.
4. Get the code and add your phrase:
   ```bash
   git clone https://github.com/Cyptoboy777/zk-remit && cd zk-remit && git checkout wave3-top
   cp .env.example .env      # open .env, put your 24 words in quotes after MIDNIGHT_WALLET_MNEMONIC=
   ```
5. Run the one command:
   ```bash
   npm run deploy:preview:all
   ```
   It checks Node, installs packages, checks Docker, starts the proof server 9.0.2 in Docker if it is not running, installs compactc 0.36.1 and compiles the contract if needed, checks your phrase (never printed), syncs your wallet and checks tDUST, then asks "Deploy now? [y/N]". Type `y`.
   It prints your wallet address first: it must match the address Lace shows. If tDUST is still 0 it waits up to 10 minutes.
6. When it finishes it has written `frontend/src/deployment.json` and filled the README and AKINDO draft. Publish it:
   ```bash
   git add frontend/src/deployment.json README.md docs/AKINDO_SUBMISSION.md
   git commit -m "Deploy ZK Remit to Midnight Preview" && git push
   ```

Only want to test your setup without deploying? `npm run deploy:check` runs steps 1 to 7 and stops.

## What gets written

- `frontend/src/deployment.json`: network, contract address, time, deploy tx hash, seed tx hashes. Public; commit it.
- `scripts/.local/operator.json`: governor and demo-issuer keys. Private and git-ignored. Do not share or commit it.

If the deploy stops halfway, the address is already saved. `npm run deploy:fill-docs` re-fills the docs at any time.

## Try the live flow (and record the demo)

1. Open the app, press Connect Lace, approve. Proofs are made by Lace, so app users do not need Docker.
2. Issuer tab: paste the contents of `scripts/.local/operator.json` (it stays in this browser), then Issue my credential.
3. Send: press Get test funds once, pick a corridor and amount, send, approve in Lace. "What the public ledger shows" re-reads the receipt from Preview.
4. Claim: open the claim link or QR, ideally in a second browser profile with a second Lace wallet, and claim.
5. Auditor: prove ownership of the receipt.

## If something goes wrong

- "Docker is not running": open Docker Desktop and wait until it says running.
- "Proof server is not reachable": Docker is off or port 6300 is taken by something else.
- "No tDUST": press Generate tDUST in Lace for the same wallet and wait a few minutes. The address printed by the script must match Lace.
- Lines like `Wallet.Sync` or `RPC-CORE ... disconnected` during sync are retries; leave it running.
- "Transfer still confirming" on claim: the send is not indexed yet. Wait a minute and press claim again.
