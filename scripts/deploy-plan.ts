/*
 * Pure planning for a deploy that fits Preview's block limits. No Midnight imports, unit-tested in
 * deploy-plan.test.ts.
 *
 * A Midnight contract stores one verifier key per circuit. Sending all of them in the deploy makes
 * one big transaction; Preview rejects it with "1010: Transaction would exhaust the block limits".
 * So the deploy carries only the keys that fit comfortably, and each remaining key is added in its
 * own small maintenance transaction signed by the contract's maintenance authority. Progress is
 * saved after every step so a rerun only does what is left.
 */

/** The cost dimensions the ledger checks against each block (ledger SyntheticCost). */
export type Cost = { readTime: bigint; computeTime: bigint; blockUsage: bigint; bytesWritten: bigint; bytesChurned: bigint };
export const DIMENSIONS: (keyof Cost)[] = ['readTime', 'computeTime', 'blockUsage', 'bytesWritten', 'bytesChurned'];

/** Preview's block limits as of the 7 Nov 2026 relaunch (read live from the indexer when possible). */
export const PREVIEW_BLOCK_LIMITS: Cost = {
  readTime: 2_000_000_000_000n, // 2 s in picoseconds
  computeTime: 2_000_000_000_000n,
  blockUsage: 1_000_000n,
  bytesWritten: 50_000n,
  bytesChurned: 50_000_000n,
};

/** Share of a block one transaction may use. Leaves room for the fee payment and other traffic. */
export const DEFAULT_SHARE = 0.3;

/** Highest share of any one block dimension this cost uses (1.0 = a whole block). */
export const blockShare = (cost: Cost, limits: Cost): number =>
  Math.max(...DIMENSIONS.map((d) => (limits[d] > 0n ? Number(cost[d]) / Number(limits[d]) : 0)));

export const fits = (cost: Cost, limits: Cost, share = DEFAULT_SHARE) => blockShare(cost, limits) <= share;

/**
 * Picks which verifier keys ride in the deploy itself: walks `order` (most needed first) and keeps
 * adding keys while the deploy still fits. Everything else becomes one insert transaction each.
 * Throws a plain message if even the bare deploy, or a single key's insert, does not fit.
 */
export const planDeploy = (
  order: readonly string[],
  deployCost: (withKeys: readonly string[]) => Cost,
  insertCost: (circuit: string) => Cost,
  limits: Cost = PREVIEW_BLOCK_LIMITS,
  share = DEFAULT_SHARE,
): { inDeploy: string[]; inserts: string[]; deployShare: number } => {
  const bare = deployCost([]);
  if (!fits(bare, limits, 1)) {
    throw new Error(
      `even the contract without any verifier key uses ${(blockShare(bare, limits) * 100).toFixed(0)}% of a block; ` +
        'the contract state itself must shrink (split the contract)',
    );
  }
  for (const c of order) {
    const s = blockShare(insertCost(c), limits);
    if (s > 1) throw new Error(`the verifier key for ${c} alone needs ${(s * 100).toFixed(0)}% of a block; that circuit must be split`);
  }
  const inDeploy: string[] = [];
  for (const c of order) {
    if (fits(deployCost([...inDeploy, c]), limits, share)) inDeploy.push(c);
    else break;
  }
  return {
    inDeploy,
    inserts: order.filter((c) => !inDeploy.includes(c)),
    deployShare: blockShare(deployCost(inDeploy), limits),
  };
};

/** Keys still to insert: all circuits, minus those the chain already has, in a stable order. */
export const pendingKeys = (all: readonly string[], onChain: ReadonlySet<string>): string[] => all.filter((c) => !onChain.has(c));

/** Reads block limits out of LedgerParameters.toString() (the JS class does not expose them). */
export const parseBlockLimits = (text: string): Cost | null => {
  const m = /block_limits:\s*SyntheticCost\s*\{([^}]*)\}/.exec(text);
  if (!m) return null;
  const field = (name: string) => new RegExp(`${name}:\\s*([0-9.]+)(ps|ns|μs|us|ms|s)?`).exec(m[1]);
  const unit: Record<string, number> = { ps: 1, ns: 1e3, μs: 1e6, us: 1e6, ms: 1e9, s: 1e12 };
  const get = (name: string, time: boolean): bigint | null => {
    const f = field(name);
    if (!f) return null;
    const v = Number(f[1]) * (time ? unit[f[2] ?? 's'] : 1);
    return Number.isFinite(v) ? BigInt(Math.round(v)) : null;
  };
  const out = {
    readTime: get('read_time', true),
    computeTime: get('compute_time', true),
    blockUsage: get('block_usage', false),
    bytesWritten: get('bytes_written', false),
    bytesChurned: get('bytes_churned', false),
  };
  return Object.values(out).every((v) => v !== null && v > 0n) ? (out as Cost) : null;
};

/** Seed steps, in order, each run once; the label is what is saved as done. */
export const seedSteps = (corridors: number, testMint: boolean): string[] => [
  'issuer',
  ...Array.from({ length: corridors }, (_, i) => `corridor-${i + 1}`),
  ...(testMint ? ['test-mint'] : []),
];
