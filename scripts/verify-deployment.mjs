// Confirms the deployed contract exists on Midnight Preview using only the public indexer, with no
// help from this repo's app or wallet. Prints what the indexer returns.
// Usage: node scripts/verify-deployment.mjs   (reads frontend/src/deployment.json)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(readFileSync(join(here, '../frontend/src/deployment.json'), 'utf8'));
const url = process.env.PREVIEW_INDEXER_URL ?? 'https://indexer.preview.midnight.network/api/v4/graphql';
const query = `query($a: HexEncoded!) { contractAction(address: $a) { __typename ... on ContractDeploy { address } } }`;

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query, variables: { a: d.contractAddress } }),
});
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
const found = body?.data?.contractAction;
if (!found) { console.error('\nNOT FOUND by the indexer (or the query shape changed).'); process.exit(1); }
console.log(`\nFOUND ${found.__typename} for ${d.contractAddress}`);
console.log(`Recorded deploy transaction: ${d.deployTxHash}`);
