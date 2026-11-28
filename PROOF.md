# Proof: ZK Remit on Midnight Preview

Everything here is checkable by a judge without trusting us. Nothing is estimated or invented. Items we have not produced yet are marked **pending** and say so.

## 1. Deployed contract

| Item | Value |
| --- | --- |
| Network | Midnight Preview (ledger 9) |
| Contract address | `0baf0281028181bf6d53c9f1ff37109252202244fe861cea2d90e132ee8615d3` |
| Deploy transaction | `0cdd84e2a98028f3d50972140f9eb75f696ee2903225486bd7876991e4141bad` |
| Deployed | 2026-11-24 |
| Explorer | https://preview.midnightexplorer.com (search the contract address above) |
| Source of these values | [`frontend/src/deployment.json`](frontend/src/deployment.json), written by the deploy script |

The 9 setup transactions the deploy script sent after deployment (demo issuer, 7 corridors, Preview test funds):

| # | Transaction hash |
| --- | --- |
| 1 | `5a10cda4522e2b4f1fc9ab0489174b5064dff2134df1f3644b65638d0f53af33` |
| 2 | `4f8a9bac85d115b68d55841c1298a1e7a73f729aa144b02a5235770faa380ee6` |
| 3 | `00f095cccc638e7add7cb94e77d924bfc1fee818e028932ebf14d9d4e272faeb` |
| 4 | `04ad7da4308ad5b188206c239cc8d2c47aeb001da432845c0a9b9c2866f79260` |
| 5 | `7fc57ae01d32c5cc486ec1b5c46d4256a4f1d7c1e8bd3ac1e318f6309681a7c4` |
| 6 | `6aa66fec24c45b7dc019b4e0b65ef7ab9e1d31082afa9e431f2d34d13430d8fb` |
| 7 | `a17728a1d9254c415a58ac792d03735eebdf3013db78736aa1710d1eb70cb462` |
| 8 | `84fe5d5af562f4f462be2b71402ae4340d5a9800235ae009af0610b3eda06e85` |
| 9 | `0dbabb9edf54baa264fd92d4d524f8200a66be9098a484c6da3daf6123244727` |

## 2. Independent check against the public indexer

```bash
node scripts/verify-deployment.mjs
```

This asks the public Preview indexer for the contract, using no code from the app and no wallet. Output from the CI run on `main` (job `mutation`, step "Confirm the deployment through the public indexer"):

```text
{
  "data": {
    "contractAction": {
      "__typename": "ContractCall"
    }
  }
}

FOUND ContractCall for 0baf0281028181bf6d53c9f1ff37109252202244fe861cea2d90e132ee8615d3
Recorded deploy transaction: 0cdd84e2a98028f3d50972140f9eb75f696ee2903225486bd7876991e4141bad
```

`ContractCall` is the latest action the indexer holds for this address, which is expected after the setup transactions above. The script exits non-zero if the contract is missing, and CI runs it on every push. The query asks the indexer for `contractAction(address)` on `https://indexer.preview.midnight.network/api/v4/graphql`; set `PREVIEW_INDEXER_URL` to use another indexer.

## 3. End-to-end on Preview: issue, send into shielded escrow, claim

**Status: pending.** The transactions below are filled in from a real run on Preview by `npm run e2e:preview`. We do not show hashes we have not produced.

| Step | What happens | Transaction hash |
| --- | --- | --- |
| Issue credential | Issuer attests the sender; only a commitment goes on chain | `PENDING_ISSUE_TX` |
| Mint test funds (Preview only) | `mintTestSettlement` mints a shielded demo coin to the wallet | `PENDING_MINT_TX` |
| Send (shielded escrow) | `sendRemittance` proves the rules and escrows a shielded coin with `receiveShielded` | `PENDING_SEND_TX` |
| Claim | `claim` releases the coin to the recipient with `sendShielded` | `PENDING_CLAIM_TX` |

How to reproduce it yourself, with the UI: switch the app to **Midnight Preview**, connect Lace, press **Get test funds**, **Send**, then open the claim link in a second wallet (steps and the tDUST workaround are in the [README](README.md#check-it-in-five-minutes)). From the command line, the operator runs `npm run e2e:preview`, which needs the deployer wallet, a proof server and tDUST.

## 4. Tests and CI evidence

| Evidence | Where |
| --- | --- |
| 46 contract tests, 46 frontend tests | `npm test`; CI job `contract (0.36.1)` |
| Every contract guard deleted in turn, a test must fail: 33 of 33 reachable guards caught, 1 unreachable and documented | `node scripts/mutation.mjs`; CI job `mutation`; [`contract/mutation-allowlist.json`](contract/mutation-allowlist.json) |
| Browser smoke test under the shipped CSP, Lighthouse in CI | `frontend/ci/` |
| Security review, 17 findings, a test each | [SECURITY.md](SECURITY.md) |

Summary table: [docs/WAVE3-RESULTS.md](docs/WAVE3-RESULTS.md).
