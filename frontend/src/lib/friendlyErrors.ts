/*
 * Turns anything thrown by the wallet, proof server or contract into a short, friendly message.
 * The UI never shows raw errors, stack traces, URLs or configuration names.
 */
export type Problem =
  | 'lace-missing'
  | 'wrong-network'
  | 'no-dust'
  | 'no-settlement'
  | 'operator-key'
  | 'escrow-index'
  | 'escrow-unsupported'
  | 'wallet-version'
  | 'rejected'
  | 'proof'
  | 'network'
  | 'not-found'
  | 'contract'
  | 'unknown';

export class MidnightProblem extends Error {
  constructor(
    readonly problem: Problem,
    /** Already-friendly detail (e.g. a cleaned contract rule); never a raw error. */
    readonly detail?: string,
  ) {
    super(problem);
    this.name = 'MidnightProblem';
  }
}

export type Friendly = { problem: Problem; title: string; body: string };

const COPY: Record<Exclude<Problem, 'contract'>, { title: string; body: string }> = {
  'lace-missing': {
    title: 'Lace wallet not found',
    body: 'Install the Lace wallet extension, enable Midnight in it, then reload this page. You can keep exploring in Simulator mode meanwhile.',
  },
  'wrong-network': {
    title: 'Switch Lace to Midnight Preview',
    body: 'Your wallet is connected to a different network. Open Lace, choose the Preview network, then try again.',
  },
  'no-dust': {
    title: 'Your wallet has no tDUST yet',
    body: 'Transactions need tDUST for fees. Get test tNIGHT from the Preview faucet, then use Lace to generate tDUST. It can take a few minutes to appear.',
  },
  'no-settlement': {
    title: 'No settlement tokens in your wallet',
    body: 'The escrow moves a shielded settlement token, and this wallet does not hold any on Preview yet. Nothing was sent.',
  },
  'operator-key': {
    title: 'Operator keys needed',
    body: 'Issuing a credential needs the operator keys created when the contract was deployed. Import them on the Issuer tab.',
  },
  'escrow-index': {
    title: 'Transfer still confirming',
    body: 'The network has not finished recording this transfer yet. Wait a minute and try again. Nothing was changed.',
  },
  'escrow-unsupported': {
    title: 'Release is unavailable right now',
    body: 'This app could not read where the escrowed funds sit on the network, so it stopped before asking for any fee. The funds stay safe in escrow, and the sender can take them back after the claim window.',
  },
  'wallet-version': {
    title: 'Lace is not on the new Preview ledger yet',
    body: 'Lace built this transaction for the old ledger version, so the network would refuse it. Nothing was sent. Update Lace, let it finish syncing, then try again.',
  },
  rejected: {
    title: 'Request cancelled',
    body: 'The wallet request was declined, so nothing was sent.',
  },
  proof: {
    title: 'Could not generate the proof',
    body: 'The zero-knowledge proof could not be made. Check that Lace is unlocked and set to Preview, then try again. If Lace is set to use a local proof server, make sure it is running.',
  },
  network: {
    title: 'Network is not responding',
    body: 'Midnight Preview could not be reached. Check your connection and try again in a moment.',
  },
  'not-found': {
    title: 'Contract not found on Preview',
    body: 'We could not find the ZK Remit contract on this network. Switch to Simulator mode, or check that your wallet is on Preview.',
  },
  unknown: {
    title: 'Something went wrong',
    body: 'The action did not complete and nothing was sent. Please try again.',
  },
};

/** "ZKR: corridor not approved" -> "Corridor not approved". Only contract assertion text is passed through. */
export const cleanContractMessage = (msg: string): string | null => {
  const m = msg.match(/ZK(?:R| Remit):\s*([^"\n\r]+)/);
  if (!m) return null;
  const text = m[1].trim().replace(/[.\s]+$/, '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
};

export const friendlyError = (e: unknown): Friendly => {
  if (e instanceof MidnightProblem) {
    if (e.problem === 'contract') {
      return { problem: 'contract', title: 'Not allowed by the contract', body: e.detail ?? 'The contract rejected this action.' };
    }
    return { problem: e.problem, ...COPY[e.problem] };
  }
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';

  const rule = cleanContractMessage(msg);
  if (rule) return { problem: 'contract', title: 'Not allowed by the contract', body: `${rule}.` };

  const tag = typeof (e as { _tag?: unknown })?._tag === 'string' ? String((e as { _tag: string })._tag) : '';
  if (/ProtocolVersionMismatch|built for protocol version/i.test(`${tag} ${msg}`)) return { problem: 'wallet-version', ...COPY['wallet-version'] };
  if (/reject|denied|declin|cancel|refus/i.test(msg)) return { problem: 'rejected', ...COPY.rejected };
  if (/prov(er|ing)|proof/i.test(msg)) return { problem: 'proof', ...COPY.proof };
  if (/no contract state|not found at|contract.*not.*found/i.test(msg)) return { problem: 'not-found', ...COPY['not-found'] };
  if (/fetch|network|timeout|timed out|econn|websocket|socket|offline|502|503|504/i.test(msg)) {
    return { problem: 'network', ...COPY.network };
  }
  return { problem: 'unknown', ...COPY.unknown };
};

/** One-line form for the activity log. */
export const friendlyLine = (e: unknown): string => {
  const f = friendlyError(e);
  return f.problem === 'contract' ? f.body : `${f.title}. ${f.body}`;
};
