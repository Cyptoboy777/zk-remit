/**
 * Shown when the wallet cannot pay fees. Lace 2.5.2 can fail "Generate tDUST" on the current Preview
 * ledger with a protocol-version error, so we explain that plainly and point to the project's helper.
 */
export function DustHelp({ kind }: { kind: 'no-dust' | 'wallet-version' }) {
  return (
    <details className="dust-help" open>
      <summary>{kind === 'wallet-version' ? 'Why this happens and how to fix it' : 'How to get tDUST'}</summary>
      <ol>
        <li>Get free test tNIGHT for your wallet address from the Midnight Preview faucet.</li>
        <li>
          In Lace, choose <strong>Generate tDUST</strong>. tDUST pays transaction fees and appears after a few minutes.
        </li>
        <li>
          If Lace shows a <em>protocol version mismatch</em> error, that is a known problem in Lace 2.5.2 on the new Preview ledger, not
          something you did. Run the project's helper from its folder instead:{' '}
          <code className="mono">npm run dust:register</code>. It registers your tNIGHT for tDUST without Lace and never shows your phrase.
        </li>
        <li>Reload this page and connect again.</li>
      </ol>
    </details>
  );
}
