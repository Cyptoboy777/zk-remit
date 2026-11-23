/**
 * Guided recipient flow for someone who opened a claim link, possibly with no crypto experience.
 * Three plain steps, each ticked from real state: the ledger read-back, the wallet connection, the claim.
 */
export function ClaimGuide({
  onLedger,
  checked,
  walletReady,
  simulator,
  claimed,
}: {
  onLedger: boolean;
  checked: boolean;
  walletReady: boolean;
  simulator: boolean;
  claimed: boolean;
}) {
  const steps = [
    {
      done: onLedger,
      title: 'Your transfer is recorded',
      body: onLedger
        ? 'The network shows a sealed transfer addressed to the holder of this link.'
        : checked
          ? 'Not on this network yet. If it was sent moments ago, give it a minute; this page re-checks on its own.'
          : 'Checking the network for this transfer…',
    },
    {
      done: walletReady,
      title: simulator ? 'No wallet needed in the demo' : 'Connect a wallet to receive it',
      body: simulator
        ? 'The simulator runs the real contract logic in your browser, so you can try a claim without installing anything.'
        : 'The money is a private token, so it has to land in a wallet only you control. A wallet is like a personal safe for it. ZK Remit never sees your keys or your recovery phrase.',
    },
    {
      done: claimed,
      title: 'Claim with one tap',
      body: claimed
        ? 'Done. The funds are in your wallet, and the ledger now shows this transfer as claimed.'
        : 'Your device proves you hold this link, without revealing who you are, and the funds are released to you.',
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="claim-guide" aria-label="How claiming works">
      {steps.map((s, i) => (
        <li key={s.title} className={s.done ? 'done' : i === current ? 'now' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="num" aria-hidden>{s.done ? '✓' : i + 1}</span>
          <div>
            <strong>{s.title}</strong>
            <p>{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
