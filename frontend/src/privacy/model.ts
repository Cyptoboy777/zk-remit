/**
 * Pure model for the Privacy Simulator. Every panel/label/3D node reads from this.
 * Input: progress t ∈ [0,1] and break-it knobs. Values mirror real ZK Remit circuits.
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

export type SimModel = {
  t: number;
  step: SimStep;
  stepIndex: number;
  steps: SimStep[];
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
  escrowSealed: boolean;
  status: 'PENDING' | 'CLAIMED' | 'REFUNDED' | 'BLOCKED';
  privateLeak: string[];
  accent: string;
  camera: { target: [number, number, number]; distance: number; label: string };
  nodes: { id: string; label: string; x: number; y: number; z: number; kind: 'private' | 'public' | 'proof' | 'active' }[];
};

export const STEPS: SimStep[] = ['idle', 'credential', 'corridor', 'prove', 'escrow', 'disclosed', 'claim', 'reclaim'];

const STEP_CAM: Record<SimStep, SimModel['camera']> = {
  idle: { target: [0, 0.4, 0], distance: 9, label: 'Overview' },
  credential: { target: [-2.2, 0.6, 0], distance: 6.5, label: 'Issuer attestation' },
  corridor: { target: [0, 0.2, -1], distance: 7, label: 'Corridor policy' },
  prove: { target: [0, 1.2, 0], distance: 5.5, label: 'ZK proof' },
  escrow: { target: [1.8, 0.3, 0.4], distance: 6, label: 'Shielded escrow' },
  disclosed: { target: [0, -0.2, 1.5], distance: 6.5, label: 'Selective disclosure' },
  claim: { target: [2.4, 0.1, -0.5], distance: 6, label: 'Claim' },
  reclaim: { target: [-1.5, -0.4, 0.8], distance: 6.5, label: 'Reclaim' },
};

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
  const escrowSealed = stepIndex >= 4;

  const nodes: SimModel['nodes'] = [
    { id: 'sender', label: 'Sender', x: -3, y: 0, z: 0, kind: step === 'credential' || step === 'prove' ? 'active' : 'private' },
    { id: 'issuer', label: 'Issuer tree', x: -3, y: 1.6, z: -1, kind: step === 'credential' ? 'active' : 'public' },
    { id: 'policy', label: 'Corridor policy', x: 0, y: -0.2, z: -1.4, kind: step === 'corridor' ? 'active' : 'public' },
    { id: 'proof', label: 'ZK proof', x: 0, y: 1.4, z: 0, kind: step === 'prove' ? 'proof' : 'private' },
    { id: 'escrow', label: 'Shielded escrow', x: 2.2, y: 0.3, z: 0.2, kind: step === 'escrow' ? 'active' : escrowSealed ? 'private' : 'public' },
    { id: 'ledger', label: 'Public ledger', x: 0, y: -1.2, z: 1.6, kind: step === 'disclosed' ? 'active' : 'public' },
    { id: 'claim', label: 'Recipient claim', x: 3.2, y: -0.2, z: -0.6, kind: step === 'claim' ? 'active' : 'private' },
  ];

  return {
    t,
    step,
    stepIndex,
    steps: STEPS,
    example,
    disclosure,
    anonymity: { k, risk, degraded: br.revealExactAmount || br.revealIdentity },
    proofProgress,
    escrowSealed,
    status,
    privateLeak,
    accent: status === 'BLOCKED' ? '#FF6F8E' : step === 'prove' ? '#6FB2FF' : '#F25C36',
    camera: STEP_CAM[step],
    nodes,
  };
}
