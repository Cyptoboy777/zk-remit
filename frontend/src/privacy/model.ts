/**
 * Pure model for the Privacy Simulator. Every panel/label/3D node reads from this.
 * Input: progress t ∈ [0,1] and break-it knobs. Values mirror real ZK Remit circuits.
 * Original work — not a clone of any teardown simulator.
 */
import { amountBandOf, BAND_LABELS, buildDisclosure } from '../lib/disclosure';

export type SimStep =
  | 'idle'
  | 'credential'
  | 'corridor'
  | 'prove'
  | 'escrow'
  | 'disclosed'
  | 'claim'
  | 'reclaim';

export type BreakIt = {
  anonymityK: number; // slider 1–32
  revealExactAmount: boolean;
  revealIdentity: boolean;
  corridorClosed: boolean;
};

export type NodeKind = 'private' | 'public' | 'proof' | 'active' | 'shielded' | 'leaked';

export type SimEdge = {
  from: string;
  to: string;
  flow: number; // 0–1 animated intensity
  kind: 'private' | 'public' | 'proof';
};

export type SimModel = {
  t: number;
  step: SimStep;
  stepIndex: number;
  steps: SimStep[];
  local: number;
  example: {
    from: string;
    to: string;
    amountCents: number;
    band: number;
    bandLabel: string;
    epoch: number;
    tier: string;
    claimWindow: number;
  };
  disclosure: ReturnType<typeof buildDisclosure>;
  anonymity: { k: number; risk: 'low' | 'medium' | 'high'; degraded: boolean };
  proofProgress: number; // 0–1 within prove step
  proofBloom: number; // peak pulse near proof completion
  escrowSealed: boolean;
  shieldState: 'open' | 'sealing' | 'sealed' | 'disclosed';
  status: 'PENDING' | 'CLAIMED' | 'REFUNDED' | 'BLOCKED';
  privateLeak: string[];
  accent: string;
  camera: { target: [number, number, number]; distance: number; label: string; orbitBias: number };
  nodes: { id: string; label: string; x: number; y: number; z: number; kind: NodeKind; pulse: number }[];
  edges: SimEdge[];
};

export const STEPS: SimStep[] = ['idle', 'credential', 'corridor', 'prove', 'escrow', 'disclosed', 'claim', 'reclaim'];

const STEP_CAM: Record<SimStep, SimModel['camera']> = {
  idle: { target: [0, 0.35, 0], distance: 9.2, label: 'Overview', orbitBias: 0.55 },
  credential: { target: [-2.1, 0.75, -0.2], distance: 6.2, label: 'Issuer attestation', orbitBias: 0.85 },
  corridor: { target: [0.1, 0.15, -1.1], distance: 6.8, label: 'Corridor policy', orbitBias: 0.35 },
  prove: { target: [0, 1.35, 0.1], distance: 5.2, label: 'ZK proof', orbitBias: 0.15 },
  escrow: { target: [1.85, 0.45, 0.35], distance: 5.8, label: 'Shielded escrow', orbitBias: -0.25 },
  disclosed: { target: [0.15, -0.15, 1.55], distance: 6.4, label: 'Selective disclosure', orbitBias: 0.4 },
  claim: { target: [2.55, 0.15, -0.45], distance: 5.9, label: 'Claim', orbitBias: -0.55 },
  reclaim: { target: [-1.35, -0.25, 0.75], distance: 6.3, label: 'Reclaim', orbitBias: 0.7 },
};

function easeInOut(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpCam(a: SimModel['camera'], b: SimModel['camera'], u: number): SimModel['camera'] {
  const e = easeInOut(u);
  return {
    target: [lerp(a.target[0], b.target[0], e), lerp(a.target[1], b.target[1], e), lerp(a.target[2], b.target[2], e)],
    distance: lerp(a.distance, b.distance, e),
    label: e < 0.5 ? a.label : b.label,
    orbitBias: lerp(a.orbitBias, b.orbitBias, e),
  };
}

function stepAt(t: number): { step: SimStep; stepIndex: number; local: number } {
  const n = STEPS.length - 1;
  const x = Math.min(1, Math.max(0, t)) * n;
  const stepIndex = Math.min(n, Math.floor(x));
  const local = x - stepIndex;
  return { step: STEPS[stepIndex], stepIndex, local };
}

export function simulate(t: number, br: BreakIt): SimModel {
  const { step, stepIndex, local } = stepAt(t);
  const amountCents = 42000; // labelled example: $420.00 VERIFIED tier
  const example = {
    from: 'ARE',
    to: 'PHL',
    amountCents,
    band: amountBandOf(amountCents),
    bandLabel: BAND_LABELS[amountBandOf(amountCents)],
    epoch: 1,
    tier: 'VERIFIED',
    claimWindow: 2,
  };
  const disclosure = buildDisclosure({
    fromCountry: 'United Arab Emirates',
    toCountry: 'Philippines',
    amountCents,
    epoch: example.epoch,
  });

  let k = br.anonymityK;
  if (br.revealExactAmount) k = Math.max(1, Math.floor(k / 4));
  if (br.revealIdentity) k = 1;
  const risk: SimModel['anonymity']['risk'] = k >= 8 ? 'low' : k >= 3 ? 'medium' : 'high';
  const privateLeak: string[] = [];
  if (br.revealExactAmount) privateLeak.push('exactAmount');
  if (br.revealIdentity) privateLeak.push('senderIdentity');

  let status: SimModel['status'] = 'PENDING';
  if (br.corridorClosed && (step === 'corridor' || stepIndex >= 2)) status = 'BLOCKED';
  else if (step === 'claim' && local > 0.45) status = 'CLAIMED';
  else if (step === 'reclaim' && local > 0.45) status = 'REFUNDED';

  const proofProgress = step === 'prove' ? local : stepIndex > 3 ? 1 : 0;
  // Satisfying bloom: sharp rise in last 30% of prove, soft decay into escrow
  let proofBloom = 0;
  if (step === 'prove') proofBloom = local < 0.7 ? local / 0.7 * 0.35 : 0.35 + easeInOut((local - 0.7) / 0.3) * 0.65;
  else if (step === 'escrow') proofBloom = Math.max(0, 1 - local * 1.4) * 0.55;
  else if (stepIndex > 4) proofBloom = 0;

  const escrowSealed = stepIndex > 4 || (step === 'escrow' && local > 0.35);
  let shieldState: SimModel['shieldState'] = 'open';
  if (step === 'escrow') shieldState = local < 0.35 ? 'sealing' : 'sealed';
  else if (step === 'disclosed') shieldState = 'disclosed';
  else if (stepIndex >= 4) shieldState = 'sealed';

  const nodes: SimModel['nodes'] = [
    {
      id: 'sender',
      label: 'Sender',
      x: -3,
      y: 0,
      z: 0,
      kind: privateLeak.includes('senderIdentity')
        ? 'leaked'
        : step === 'credential' || step === 'prove'
          ? 'active'
          : 'private',
      pulse: step === 'credential' ? 0.4 + local * 0.4 : step === 'prove' ? 0.55 : 0.15,
    },
    {
      id: 'issuer',
      label: 'Issuer tree',
      x: -3,
      y: 1.6,
      z: -1,
      kind: step === 'credential' ? 'active' : 'public',
      pulse: step === 'credential' ? 0.5 + local * 0.5 : 0.1,
    },
    {
      id: 'policy',
      label: 'Corridor policy',
      x: 0,
      y: -0.2,
      z: -1.4,
      kind: status === 'BLOCKED' ? 'leaked' : step === 'corridor' ? 'active' : 'public',
      pulse: step === 'corridor' ? 0.45 + local * 0.4 : 0.1,
    },
    {
      id: 'proof',
      label: 'ZK proof',
      x: 0,
      y: 1.4,
      z: 0,
      kind: step === 'prove' ? 'proof' : proofProgress >= 1 ? 'shielded' : 'private',
      pulse: proofBloom,
    },
    {
      id: 'escrow',
      label: 'Shielded escrow',
      x: 2.2,
      y: 0.3,
      z: 0.2,
      kind:
        privateLeak.includes('exactAmount')
          ? 'leaked'
          : step === 'escrow'
            ? 'active'
            : escrowSealed
              ? 'shielded'
              : 'public',
      pulse: shieldState === 'sealing' ? 0.35 + local : shieldState === 'sealed' ? 0.55 : 0.12,
    },
    {
      id: 'ledger',
      label: 'Public ledger',
      x: 0,
      y: -1.2,
      z: 1.6,
      kind: step === 'disclosed' ? 'active' : 'public',
      pulse: step === 'disclosed' ? 0.5 + local * 0.35 : 0.08,
    },
    {
      id: 'claim',
      label: 'Recipient claim',
      x: 3.2,
      y: -0.2,
      z: -0.6,
      kind: step === 'claim' || step === 'reclaim' ? 'active' : 'private',
      pulse: step === 'claim' || step === 'reclaim' ? 0.5 + local * 0.4 : 0.12,
    },
  ];

  const edges: SimEdge[] = [
    {
      from: 'sender',
      to: 'issuer',
      flow: step === 'credential' ? 0.3 + local * 0.7 : stepIndex > 1 ? 0.25 : 0.05,
      kind: 'public',
    },
    {
      from: 'issuer',
      to: 'proof',
      flow: step === 'credential' ? local : step === 'prove' ? 0.7 : stepIndex > 3 ? 0.2 : 0.05,
      kind: 'private',
    },
    {
      from: 'policy',
      to: 'proof',
      flow: status === 'BLOCKED' ? 0 : step === 'corridor' ? 0.4 + local * 0.6 : stepIndex > 2 ? 0.35 : 0.05,
      kind: status === 'BLOCKED' ? 'public' : 'private',
    },
    {
      from: 'sender',
      to: 'proof',
      flow: step === 'prove' ? 0.55 + local * 0.45 : stepIndex > 3 ? 0.2 : 0.04,
      kind: 'private',
    },
    {
      from: 'proof',
      to: 'escrow',
      flow: step === 'prove' && local > 0.65 ? (local - 0.65) / 0.35 : step === 'escrow' ? 0.85 : escrowSealed ? 0.3 : 0,
      kind: 'proof',
    },
    {
      from: 'escrow',
      to: 'ledger',
      flow: step === 'disclosed' ? 0.5 + local * 0.5 : stepIndex > 5 ? 0.35 : 0.06,
      kind: 'public',
    },
    {
      from: 'escrow',
      to: 'claim',
      flow: step === 'claim' || step === 'reclaim' ? 0.55 + local * 0.45 : 0.05,
      kind: 'private',
    },
  ];

  const next = STEPS[Math.min(STEPS.length - 1, stepIndex + 1)];
  const camera = stepIndex >= STEPS.length - 1 ? STEP_CAM[step] : lerpCam(STEP_CAM[step], STEP_CAM[next], local);

  return {
    t,
    step,
    stepIndex,
    steps: STEPS,
    local,
    example,
    disclosure,
    anonymity: { k, risk, degraded: br.revealExactAmount || br.revealIdentity },
    proofProgress,
    proofBloom,
    escrowSealed,
    shieldState,
    status,
    privateLeak,
    accent: status === 'BLOCKED' ? '#FF6F8E' : step === 'prove' ? '#6FB2FF' : proofBloom > 0.8 ? '#8FD0FF' : '#F25C36',
    camera,
    nodes,
    edges,
  };
}
