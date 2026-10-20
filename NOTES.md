# ZK Remit — build & research notes

**Buildathon:** AKINDO "Build Privacy-First Apps on Midnight" — https://app.akindo.io/wave-hacks/jaMZjqPOBsLXvjdG
**Builder:** Crypto boy · AKINDO `@Cryptoboy_777` · GitHub `Cyptoboy777`
**Target wave:** Wave 3 — build period **Oct 27 – Nov 16, 2026**, judging Nov 16–27, pool **US$5,000**, split pro-rata to judge points.
(Wave 1: $3,500, 159 submissions; Wave 2: $4,000, 104 submissions, deadline 2026-10-19 15:00 UTC — already closed.)

## Rules that matter (from the AKINDO page / public API, read 2026-10-20)

- **Technical gate:** at least one Compact contract that compiles → ✅ `contract/src/zk-remit.compact` (compactc 0.31.1 and 0.35.0).
- Repo must carry the **`midnightntwrk` GitHub label/topic** → set as a repo topic.
- Midnight-related code must be **Apache-2.0** → LICENSE + NOTICE.
- Submit: public GitHub repo, README (setup, architecture, Midnight integration, how to test), **slide deck**, **demo/video pitch**, description of progress during the wave, and what changed since a previous wave.
- ⚠️ "Midnight-related functionality submitted for evaluation must be newly developed or materially extended **during the applicable Wave**." This baseline was written on 2026-10-20, *before* Wave 3 opens (Oct 27). For the Wave 3 submission, present this as the starting point and make sure substantial new Midnight functionality lands Oct 27–Nov 16 (see roadmap in SUBMISSION.md), with commit history showing it. Consider asking in the Midnight Discord whether pre-wave scaffolding is acceptable.
- Judging rubric: Engineering & Implementation 40% (compiles, private-state management, dual-ledger understanding, organized repo, README, topics, attribution) · QA & Reliability 15% (simulation + tests that pass, stability) · Product & Vision 15% · UX & Design 15% (intuitive, end-to-end connected to the contract) · Communication 10% (video + slides) · Business Dev 5%.

## Concept choice: ZK Remit vs Private KYC gate

Chose **ZK Remit**. A generic "prove age/country/income to a dApp" gate is the most common ZK-identity
demo (lots of overlap with existing credential/age-verification projects), and it is a single
predicate. ZK Remit *contains* a private KYC gate (Merkle-membership credential + attribute predicates)
but goes further into a concrete regulated workflow with multiple parties and stateful privacy:
rate-limiting nullifiers per epoch, amount commitments opened only to the recipient, one-time claims,
and two auditor disclosure modes. It is clearly different from past winners (PollPower — voting;
BACCHIRI! — ZK sensor proofs; Omega, Cocoa Monster) and maps directly to the Midnight pitch
("prove compliance without disclosing balances or counterparties"). It also fits the builder's
India/remittance focus from the Mezo project (MUSD Pocket).

## Toolchain (verified on this box, Linux x86_64)

| Component | Version | Notes |
|---|---|---|
| compactc | **0.31.1** (lang 0.23.0, runtime 0.16.0) | matches Midnight compatibility matrix for Preview/Preprod/Mainnet; installed from `midnightntwrk/compact` GitHub release zip |
| compactc | 0.35.0 (lang 0.27.0, runtime 0.20.0, ledger 9) | latest release (2026-09-29); contract compiles unchanged; **not** used for the app because Midnight.js 4.1.1 pins runtime 0.16 / ledger 8 |
| compact devtools | 0.5.3 release exists | not needed — the box lacked `xz` to unpack it, so compactc was installed directly from the zip |
| Node | 24.11.1 (installed to `~/.local`) | box default is 20.19; example-bboard requires ≥ 24.11 |
| Midnight.js | 4.1.1 | contracts, types, network-id, fetch-zk-config, http-proof, indexer providers, protocol |
| DApp Connector API | 4.0.1 | Lace `window.midnight.*` with `apiVersion` 4.x |
| compact-runtime | 0.16.0 | simulator + generated code (`checkRuntimeVersion('0.16.0')`) |
| Proof server | 8.1.3 (matrix) | Docker `midnightntwrk/proof-server` on :6300 |

Compile output: 7 circuits in ~25 s; prover keys: `sendRemittance` 10 MB, `proveReceiptOwnership` 5.2 MB, others ~2.8 MB (29 MB total). Keys are generated in CI and served by GitHub Pages under `/zk-remit/keys` + `/zk-remit/zkir` for `FetchZkConfigProvider`.

## Network endpoints (docs, 2026-10)

- **Preview** (public, used by this dApp): RPC `https://rpc.preview.midnight.network`, indexer `https://indexer.preview.midnight.network/api/v4/graphql`, faucet https://midnight-tmnight-preview.nethermind.dev/
- **Preprod:** Midnight-hosted endpoints retired 2026-10-09; now Blockfrost (`https://midnight-preprod.blockfrost.io/api/v0`, needs a `project_id` token). Faucet https://midnight-tmnight-preprod.nethermind.dev/
- Lace supplies `indexerUri`, `indexerWsUri`, `proverServerUri` via `getConfiguration()`, so the dApp doesn't hard-code them.
- Fees: wallet holds tNIGHT (faucet) and generates **tDUST** in Lace to pay fees.

## Testnet deployment — blocked (and exactly why)

Attempted feasibility headlessly; not doable from this box:
1. **Faucets require a captcha.** Both Preview and Preprod faucet bundles embed Cloudflare **Turnstile** (`cf-turnstile`, `siteKey`) — no headless API without solving a captcha (and solving it would be circumventing it).
2. **No Docker** on the box → cannot run `midnightntwrk/proof-server` (or `midnight-local-dev` for a local chain).
3. Deploying via the browser path needs the **Lace** extension with a funded wallet, which is a user-owned account.

Exact steps for the builder (≈15 min):
1. Install Docker; `docker run -p 6300:6300 midnightntwrk/proof-server:8.1.3`.
2. Install Lace with Midnight; create a wallet; Network = **Preview**; Proof server = `http://localhost:6300`.
3. Get tNIGHT at https://midnight-tmnight-preview.nethermind.dev/ (solve captcha), then **Generate tDUST** in Lace.
4. Open https://cyptoboy777.github.io/zk-remit/ → **Midnight network / Lace → Connect Lace → Deploy new contract**. Approve in Lace. Copy the contract address.
5. Run the flow (issue → corridor → send → claim → audit). Record the address + tx hashes into SUBMISSION.md, and set the repo variable / `VITE_CONTRACT_ADDRESS` so the "Join" field is pre-filled.
   (Alternative CLI path: port example-bboard's `bboard-cli` wallet-sdk flow with a seed in an env var — never commit the seed.)

## Design decisions

- **Credential = commitment in a `HistoricMerkleTree<16>`** (65k credentials). Historic roots let senders prove against a slightly older root while new credentials are being issued.
- **Rate limiting via nullifiers** `H("nullifier", sk, epoch, slot)` with `slot < tierSlots(tier)`: enforces "N transfers per month" without any per-user on-chain counter (which would be linkable).
- **Per-transfer cap** by tier; monthly volume cap = cap × slots. Precise rolling-sum caps need a private accumulator — roadmap.
- **Amount** is committed (`persistentCommit`) and only the band is disclosed; the recipient proves the opening in `claim`.
- **Audit**: (A) `proveReceiptOwnership` binds a proof to an auditor challenge and stores `H(receipt, challenge)` — reveals nothing about the sender; (B) the view key lets an auditor recompute `viewTag` for every nullifier — a scoped, read-only disclosure.
- Ran into: an exported circuit named `send` collides with a binding imported by `import CompactStandardLibrary;` → circuit renamed `sendRemittance`.
- Vite 8: `vite-plugin-top-level-await` is unnecessary (and needs rollup/esbuild); `isomorphic-ws` needs a browser shim so the indexer provider gets `globalThis.WebSocket`.

## Verification log (2026-10-20, IST)

- `compactc 0.31.1` full compile ✅ (7 circuits, keys) · `compactc 0.35.0` full compile ✅
- `vitest`: 12/12 ✅
- Frontend `tsc --noEmit` ✅, `vite build` ✅ (≈42 MB dist incl. keys)
- Headless Chrome E2E on the built site: issue → corridor → 2 sends → claim → double-claim rejected → ownership proof → view-key audit (2/2 matched) → 7 attacks all rejected with the expected circuit assertion; 0 console errors.
- GitHub Actions (first push): CI ✅ (compactc 0.31.1 + 0.35.0 compile, 12/12 tests, frontend build) · Pages ✅
- Live site https://cyptoboy777.github.io/zk-remit/ — same headless E2E passes; `/keys/*.prover|verifier` and `/zkir/*` served; the Midnight.js/Lace chunk loads in-browser without errors (Lace absent in headless Chrome, so the wallet path itself is untested).
