/*
 * Registers this wallet's tNIGHT for tDUST generation on Midnight Preview (what Lace's
 * "Generate tDUST" button does), using Wallet SDK 2.0.1. Then waits until tDUST shows up.
 *
 *   npm run dust:register                  register any unregistered tNIGHT, then wait for tDUST
 *   npm run dust:register -- --check       only report address and balances, change nothing
 *   npm run dust:register -- --ensure      used by deploy:preview:all: do nothing if tDUST is
 *                                          already there, otherwise ask before registering
 *   --yes            do not ask (with --ensure)
 *   --timeout=MIN    how long to wait for tDUST after registering (default 20 minutes)
 *   --address=mn_addr_preview1...   no wallet needed: ask the indexer what that address holds
 *
 * Reads MIDNIGHT_WALLET_MNEMONIC from .env (never printed). Uses the proof server on :6300 when it
 * is running, otherwise proves inside this process, so it also works without Docker, on Windows too.
 *
 * Exit codes: 0 tDUST available, 2 no tNIGHT, 3 timed out waiting, 4 declined, 1 other failure
 * (including a lost connection to the indexer, which is reported in plain words, never as a 0 balance).
 */
import * as Rx from 'rxjs';
import { createInterface } from 'node:readline/promises';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/v9';
import {
  buildWallet,
  readSeed,
  readyState,
  proofServerUp,
  dustOf,
  fmtDust,
  fmtNight,
  reasonOf,
  indexerNight,
  describeProtocol,
  say,
  env,
  type State,
} from './wallet.js';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const timeoutMin = Number(args.find((a) => a.startsWith('--timeout='))?.split('=')[1] ?? 20) || 20;
const NIGHT = (() => {
  try {
    return String(unshieldedToken().raw);
  } catch {
    return '';
  }
})();
const nightOf = (s: State): bigint => {
  const b = s.unshielded.balances as Record<string, bigint>;
  return (NIGHT && b[NIGHT]) || Object.values(b).reduce((a, v) => a + v, 0n);
};
const unregisteredOf = (s: State) => s.unshielded.availableCoins.filter((c: any) => c?.meta?.registeredForDustGeneration !== true);

let stopWallet: (() => Promise<void>) | undefined;
const finish = async (code: number, msg?: string) => {
  if (msg) (code === 0 ? console.log : console.error)(`\n${msg}\n`);
  // Stopping the wallet can hang when the indexer connection is already broken; never wait long for it.
  await Promise.race([stopWallet?.().catch(() => undefined), new Promise((r) => setTimeout(r, 5_000))]);
  process.exit(code);
};

const ask = async (q: string) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(q)).trim().toLowerCase();
  rl.close();
  return a === 'y' || a === 'yes';
};

const waitForDust = async (wallet: Awaited<ReturnType<typeof buildWallet>>['wallet']) => {
  say(`Waiting for tDUST to appear (up to ${timeoutMin} minutes; it starts once the registration is in a block)…`);
  const started = Date.now();
  const s = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000, undefined, { leading: true, trailing: true }),
      Rx.tap((st) => {
        const mins = Math.floor((Date.now() - started) / 60_000);
        if (mins > 0 && mins % 2 === 0) process.stdout.write('.');
      }),
      Rx.filter((st) => st.isSynced && dustOf(st) > 0n),
      Rx.timeout({ first: timeoutMin * 60_000 }),
    ),
  ).catch(() => null);
  if (!s) {
    return finish(
      3,
      `No tDUST yet after ${timeoutMin} minutes. The registration may still be landing.\n` +
        'Nothing is lost: run  npm run dust:register  again in a few minutes; it will see the registration and only wait.',
    );
  }
  say(`\ntDUST balance: ${fmtDust(dustOf(s))}`);
  return finish(0, 'Done. This wallet now generates tDUST and can pay fees on Preview.');
};

/** What the indexer itself says about an address, with no wallet involved. */
const indexerView = async (address: string) => {
  try {
    return await indexerNight(address);
  } catch (e) {
    say(`  (could not ask the indexer directly: ${reasonOf(e)})`);
    return null;
  }
};

const checkAddress = async (address: string) => {
  if (!/^mn_addr_preview1[0-9a-z]{20,}$/.test(address)) return finish(1, 'That is not a Preview unshielded address (it should start with mn_addr_preview1).');
  say(`Asking the Preview indexer about ${address} (no wallet needed)…`);
  const v = await indexerView(address);
  if (!v) return finish(1, 'Could not reach the Preview indexer. Check your internet connection and try again.');
  say(`Transactions that touched this address: ${v.txCount}`);
  say(`Unspent tNIGHT at this address: ${fmtNight(v.night)}`);
  if (v.txCount === 0) {
    return finish(
      2,
      'The current Preview chain has never seen this address. Preview was restarted on ledger 9 (7 Nov), so tNIGHT\n' +
        'from before that is gone, and an older Lace can keep showing the old balance. Request tNIGHT again at\n' +
        'https://faucet.preview.midnight.network/ for this address, wait for it to land, then run  npm run dust:register',
    );
  }
  return finish(v.night > 0n ? 0 : 2);
};

const main = async () => {
  const addrArg = args.find((a) => a.startsWith('--address='))?.split('=')[1];
  if (addrArg) return checkAddress(addrArg.trim());
  const seed = readSeed();
  const useServer = await proofServerUp();
  if (!useServer && !has('--check')) {
    say(`No proof server at ${env.proofServer}; proving inside this process instead (slower, no Docker needed).`);
  }
  const w = await buildWallet(seed, { wasmProving: !useServer });
  stopWallet = () => w.wallet.stop();
  say(`Wallet (unshielded address): ${w.address}`);
  say('  This must match the mn_addr_preview1... address Lace shows for the wallet you funded.');

  const state = await readyState(w.wallet);
  const night = nightOf(state);
  const dust = dustOf(state);
  const unregistered = unregisteredOf(state);
  say(`Network: Preview, ${describeProtocol(state)}`);
  say(`tNIGHT balance: ${fmtNight(night)}`);
  say(`tDUST balance:  ${fmtDust(dust)}`);
  say(`tNIGHT coins not yet registered for tDUST: ${unregistered.length}`);

  if (night === 0n) {
    // Double-check with the indexer directly so a sync problem can never pass for an empty wallet.
    const v = await indexerView(w.address);
    if (v && v.night > 0n) {
      return finish(
        1,
        `The indexer shows ${fmtNight(v.night)} tNIGHT at this address but the wallet synced 0, so the sync went wrong.\n` +
          'Nothing was sent. Run the same command again.',
      );
    }
    if (v && v.txCount === 0) {
      return finish(
        2,
        'The current Preview chain has never seen this address, so it holds no tNIGHT.\n' +
          'Preview was restarted on ledger 9 (7 Nov); tNIGHT from before that is gone, and an older Lace can keep showing the old balance.\n' +
          '1) Copy the address above.  2) Request tNIGHT at https://faucet.preview.midnight.network/  3) Run this again once it lands.\n' +
          'If Lace shows a different mn_addr_preview1... address, the phrase in .env is for a different wallet.',
      );
    }
    return finish(
      2,
      'This wallet has no tNIGHT yet, so there is nothing to register.\n' +
        '1) Copy the address above.  2) Request tNIGHT at https://faucet.preview.midnight.network/  3) Run this again.\n' +
        'If Lace shows tNIGHT but this says 0, the phrase in .env is for a different wallet: compare the addresses.',
    );
  }
  if (has('--check')) return finish(dust > 0n ? 0 : 4, dust > 0n ? 'tDUST is available.' : 'Run  npm run dust:register  to start tDUST generation.');
  if (unregistered.length === 0) {
    if (dust > 0n) return finish(0, 'All tNIGHT is already registered and tDUST is available.');
    say('All tNIGHT is already registered; tDUST is still building up.');
    return waitForDust(w.wallet);
  }
  if (has('--ensure') && dust > 0n) return finish(0, 'tDUST is available.');
  if (has('--ensure') && !has('--yes')) {
    const ok = await ask(`Register ${unregistered.length} tNIGHT coin(s) for tDUST generation now? This is what Lace's "Generate tDUST" does. [y/N] `);
    if (!ok) return finish(4, 'Not registered. Run  npm run dust:register  when you are ready.');
  }

  // A first registration pays its own fee from the DUST the NIGHT would have generated since it
  // arrived, so wait until that covers the fee (the SDK refuses to build it earlier).
  const { fee } = await w.wallet.estimateRegistration(unregistered as any);
  say(`Registration fee: ${fmtDust(fee)} tDUST (paid from the tDUST this tNIGHT has already generated).`);
  say('Waiting until enough has been generated to cover it (usually a few minutes after the faucet)…');
  try {
    await w.wallet.waitForGeneratedDust(unregistered as any, fee, { timeoutMs: 30 * 60_000 });
  } catch (e) {
    return finish(3, `The tNIGHT has not generated enough to pay the registration fee yet (${reasonOf(e)}).\nRun this again later; nothing was sent.`);
  }

  say('Building, proving and submitting the registration…');
  const recipe = await w.wallet.registerNightUtxosForDustGeneration(
    unregistered as any,
    w.keystore.getPublicKey() as any,
    w.keystore.signDataAsync,
  );
  const finalized = await w.wallet.finalizeRecipe(recipe);
  const txId = await w.wallet.submitTransaction(finalized);
  say(`Registration transaction id: ${String((txId as any)?.toString?.() ?? txId)}`);
  return waitForDust(w.wallet);
};

main().catch((e) => {
  const r = reasonOf(e);
  const hint = /ProtocolVersionMismatch/.test(r)
    ? '\nThe wallet and the network disagree on the ledger version. Wait a minute and run again; if it repeats, the wallet is still catching up with Preview.'
    : /proof|prov/i.test(r)
      ? '\nProving failed. If Docker is available, start the proof server and run again:\n  docker run -p 6300:6300 midnightntwrk/proof-server:9.0.2 midnight-proof-server -v'
      : '';
  return finish(1, `tDUST registration did not finish: ${r}${hint}\nNothing is lost; run the same command again.`);
});
