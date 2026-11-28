/*
 * End-to-end run on Midnight Preview, from the command line: issue a credential, mint Preview test
 * funds, send a transfer into shielded escrow, then claim it. It calls the same compiled circuits and
 * the same witnesses the app uses, against the contract in frontend/src/deployment.json, and records
 * the real transaction hashes in docs/e2e-preview.json and in PROOF.md.
 *
 *   npm run e2e:preview
 *
 * Needs (all on the operator's laptop):
 *   - .env with MIDNIGHT_WALLET_MNEMONIC (the deployer wallet; read from .env only, never printed)
 *   - scripts/.local/operator.json (written by the deploy; holds the demo issuer secret)
 *   - a proof server on :6300  (docker run -p 6300:6300 midnightntwrk/proof-server:9.0.2 midnight-proof-server -v)
 *   - tDUST in the wallet  (npm run dust:register)
 *
 * Roles: the operator wallet plays sender and recipient, with separate secrets (the holder secret and a
 * fresh recipient secret), exactly as two people would hold them. The three on-chain proofs and the
 * shielded escrow are the same as in a two-wallet run; only the wallet that pays fees is shared.
 *
 * Transactions are sent one at a time. After each one the script waits until the wallet has settled
 * (synced, no pending coins, tDUST spendable), because a wallet that submits while its tDUST coin is
 * still locked by the previous transaction fails with "could not balance dust".
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import WebSocket from 'ws';
import * as Rx from 'rxjs';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/v9/compact-js';
import { ContractState, ZswapChainState } from '@midnight-ntwrk/midnight-js-protocol/v9';
import { Contract, witnesses, pureCircuits, ledger, ReceiptStatus, randomBytes, toHex, freshCoin, makeCredential, COUNTRY, TIER } from '../contract/src/index.js';
import { lookupEscrowIndex } from '../frontend/src/lib/escrowIndex.js';
import { NETWORK_ID, env, say, die, repo, here, readSeed, buildWallet, readyState, dustOf, reasonOf, proofServerUp, walletProviders, memoryPrivateState } from './wallet.js';

const ZK_DIR = resolve(repo, 'contract/src/managed/zk-remit');
const DEPLOYMENT_JSON = resolve(repo, 'frontend/src/deployment.json');
const OPERATOR_JSON = resolve(here, '.local/operator.json');
const PROOF_MD = resolve(repo, 'PROOF.md');
const RESULT_JSON = resolve(repo, 'docs/e2e-preview.json');
const PS_ID = 'zkRemitPrivateState';

const MINT_CENTS = 10_000n; // 100.00 of Preview test funds
const SEND_CENTS = 5_000n; // 50.00 sent
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fromHex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));
const txOf = (r: any): string => (typeof r?.public?.txHash === 'string' ? r.public.txHash : typeof r?.txHash === 'string' ? r.txHash : '');

const main = async () => {
  // ---- preflight (everything that can be checked before spending a fee)
  const seedBytes = readSeed();
  if (!existsSync(OPERATOR_JSON)) die('scripts/.local/operator.json is missing. It is written by the deploy (npm run deploy:preview:all) on the laptop that deployed.');
  const dep = JSON.parse(readFileSync(DEPLOYMENT_JSON, 'utf8'));
  const op = JSON.parse(readFileSync(OPERATOR_JSON, 'utf8'));
  if (op.contractAddress !== dep.contractAddress) {
    die(`scripts/.local/operator.json is for ${op.contractAddress}, but the app's contract is ${dep.contractAddress}. Use the operator file from that deploy.`);
  }
  if (!(await proofServerUp())) {
    die(`Proof server is not reachable at ${env.proofServer}.\nStart it:  docker run -p 6300:6300 midnightntwrk/proof-server:9.0.2 midnight-proof-server -v`);
  }
  const contractAddress: string = dep.contractAddress;

  const w = await buildWallet(seedBytes);
  say(`Wallet (unshielded address): ${w.address}`);
  let state = await readyState(w.wallet);
  if (dustOf(state) <= 0n) die('This wallet has no tDUST yet. Run  npm run dust:register  first.');

  /** Waits until the wallet is idle again, so the next transaction can spend its tDUST. */
  const settle = async (label: string) => {
    await sleep(15_000);
    await Rx.firstValueFrom(
      w.wallet.state().pipe(
        Rx.filter((s: any) => s.isSynced && (s.unshielded?.pendingCoins?.length ?? 0) === 0 && (s.dust?.availableCoins?.length ?? 1) > 0),
        Rx.timeout({ first: 10 * 60_000 }),
      ),
    ).catch(() => die(`The wallet did not settle after "${label}" within 10 minutes. Nothing more was sent; run the command again.`));
    say(`  settled after ${label}`);
  };

  const zkConfigProvider = new NodeZkConfigProvider<string>(ZK_DIR);
  const { walletProvider, midnightProvider } = walletProviders(w, state);
  const providers: any = {
    privateStateProvider: memoryPrivateState(),
    publicDataProvider: indexerPublicDataProvider({ queryURL: env.indexer, subscriptionURL: env.indexerWs, webSocket: WebSocket as any }),
    zkConfigProvider,
    proofProvider: httpClientProofProvider({ url: env.proofServer, zkConfigProvider }),
    walletProvider,
    midnightProvider,
    config: { networkId: NETWORK_ID, ttlSeconds: 30 * 60 },
  };
  const compiledContract = CompiledContract.make('zk-remit', Contract).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(ZK_DIR),
  );
  const governorSecret = fromHex(op.governorSecret);
  const issuerSecret = fromHex(op.issuerSecret);
  const deployed: any = await findDeployedContract(providers, {
    compiledContract,
    contractAddress,
    privateStateId: PS_ID,
    initialPrivateState: { governorSecret },
  } as any);

  const setPrivate = (s: Record<string, unknown>) => providers.privateStateProvider.forContract(contractAddress).set(PS_ID, s);
  const readLedger = async () => {
    const read: any = await providers.publicDataProvider.queryContractState(contractAddress);
    if (!read) die('The contract was not found on Preview. Check frontend/src/deployment.json.');
    return ledger((read.contractState.deserialize({ v9: ContractState }) as any).data);
  };

  const before = await readLedger();
  if (!before.testMintEnabled) die('Test funds are not enabled on this deployment (enableTestMint was not called), so there is nothing to escrow.');
  const epoch = before.epoch as bigint;
  const results: Record<string, string> = {};

  // ---- 1. issue a credential (the demo issuer attests a fresh holder)
  say('\n1/4  Issue credential');
  const holderSecret = randomBytes();
  const issuerPk = pureCircuits.issuerPublicKey(issuerSecret);
  const credential = makeCredential(holderSecret, issuerPk, TIER.VERIFIED, COUNTRY.UAE, epoch + 11n);
  await setPrivate({ issuerSecret });
  results.issueTx = txOf(await deployed.callTx.issueCredential(pureCircuits.credentialCommitment(credential)));
  say(`  issueCredential  tx ${results.issueTx}`);
  await settle('issueCredential');

  // ---- 2. Preview-only test funds: a shielded settlement coin for the wallet
  say('\n2/4  Mint Preview test funds');
  await setPrivate({ mintNonceValue: randomBytes() });
  results.mintTx = txOf(await deployed.callTx.mintTestSettlement(MINT_CENTS));
  say(`  mintTestSettlement  tx ${results.mintTx}`);
  await settle('mintTestSettlement');
  const color: Uint8Array = (await readLedger()).settlementColor;
  // Wait until the wallet itself can see the shielded coin, or the send cannot be balanced.
  say('  waiting for the wallet to see the minted coin…');
  await Rx.firstValueFrom(
    w.wallet.state().pipe(
      Rx.filter((s: any) => {
        const bal = (s.shielded?.balances ?? {}) as Record<string, bigint>;
        const k = Object.keys(bal).find((x) => x.toLowerCase().endsWith(toHex(color)));
        return !!k && bal[k] >= SEND_CENTS;
      }),
      Rx.timeout({ first: 5 * 60_000 }),
    ),
  ).catch(() => die('The wallet did not show the minted shielded coin within 5 minutes. Nothing was sent; run the command again.'));

  // ---- 3. send into shielded escrow
  say('\n3/4  Send into shielded escrow (UAE -> Philippines)');
  const recipientSecret = randomBytes();
  const salt = randomBytes();
  const coin = freshCoin(SEND_CENTS, color);
  await setPrivate({ holderSecret, credential, escrowSaltValue: salt });
  const sendRes: any = await deployed.callTx.sendRemittance(COUNTRY.PHILIPPINES, 0n, pureCircuits.recipientTagOf(recipientSecret), coin);
  const receiptId: Uint8Array = sendRes?.private?.result;
  if (!(receiptId instanceof Uint8Array)) die('The send finished but returned no receipt id; check the transaction on the explorer.');
  results.sendTx = txOf(sendRes);
  results.receiptId = toHex(receiptId);
  say(`  sendRemittance  tx ${results.sendTx}`);
  say(`  receipt (public nullifier): ${results.receiptId}`);
  await settle('sendRemittance');

  // ---- 4. claim: find the coin's real position in the Zswap tree, then release it
  say('\n4/4  Claim');
  let mt_index: bigint | undefined;
  for (let i = 0; i < 36 && mt_index === undefined; i++) {
    const read: any = await providers.publicDataProvider.queryZSwapAndContractState(contractAddress);
    if (read) {
      const found = lookupEscrowIndex(read.zswapChainState.deserialize({ v9: ZswapChainState }) as any, coin, contractAddress);
      if (found.kind === 'unsupported') die('Could not read the escrowed coin position from this ledger version. Nothing was spent; the sender can still reclaim after the claim window.');
      if (found.kind === 'found') mt_index = found.index;
    }
    if (mt_index === undefined) await sleep(5_000);
  }
  if (mt_index === undefined) die('The escrowed coin is not in the indexer yet. Nothing was spent; run the command again in a minute (a new transfer will be made).');
  say(`  escrow coin found at tree index ${mt_index}`);
  await setPrivate({ recipientSecret, escrows: { [toHex(receiptId)]: { coin: { ...coin, mt_index }, salt } } });
  results.claimTx = txOf(await deployed.callTx.claim(receiptId));
  say(`  claim  tx ${results.claimTx}`);
  await settle('claim');

  // ---- verify on chain, record
  const after = await readLedger();
  const receipt = after.receipts.lookup(receiptId);
  if (receipt.status !== ReceiptStatus.CLAIMED) die('The claim transaction went through but the receipt is not marked claimed. Check the explorer before using these hashes.');
  say(`\nReceipt status on chain: CLAIMED (claimed ${after.claimedCount}, total receipts ${after.totalReceipts})`);

  const ranAt = new Date().toISOString();
  writeFileSync(RESULT_JSON, JSON.stringify({ network: NETWORK_ID, contractAddress, ranAt, ...results }, null, 2) + '\n');
  if (existsSync(PROOF_MD)) {
    let md = readFileSync(PROOF_MD, 'utf8');
    md = md
      .replace('PENDING_ISSUE_TX', results.issueTx)
      .replace('PENDING_MINT_TX', results.mintTx)
      .replace('PENDING_SEND_TX', results.sendTx)
      .replace('PENDING_CLAIM_TX', results.claimTx)
      .replace(/\*\*Status: pending\.\*\*[^\n]*/, `**Status: complete.** Run on Midnight Preview on ${ranAt.slice(0, 10)} with \`npm run e2e:preview\` ([\`scripts/e2e-preview.ts\`](scripts/e2e-preview.ts)); result in [\`docs/e2e-preview.json\`](docs/e2e-preview.json). The receipt \`${results.receiptId}\` is marked CLAIMED on chain. The operator wallet played both sender and recipient, with separate secrets.`);
    writeFileSync(PROOF_MD, md);
  }
  say('Recorded in docs/e2e-preview.json and PROOF.md. Review them, then commit and push.');
  await w.wallet.stop();
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`\nThe end-to-end run did not finish: ${reasonOf(e)}\nNothing in PROOF.md was changed. Transactions already sent are on chain; the next run makes a fresh credential and transfer.\n`);
    process.exit(1);
  });
