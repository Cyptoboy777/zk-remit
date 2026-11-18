/*
 * Deployment record loading. `deployment.json` is written by `npm run deploy:preview`
 * after a real deployment; until then it holds nulls and the app runs on the simulator.
 * Pure functions only (no Midnight imports) so they are trivially testable.
 */
import raw from '../deployment.json';

export type Deployment = {
  network: string;
  contractAddress: string;
  deployedAt: string;
};

const ADDRESS_RE = /^[0-9a-fA-F]{40,128}$/;

/** Returns a Deployment only when the record holds a plausible contract address. Never invents one. */
export const parseDeployment = (value: unknown): Deployment | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const address = typeof v.contractAddress === 'string' ? v.contractAddress.trim() : '';
  if (!ADDRESS_RE.test(address)) return null;
  const network = typeof v.network === 'string' && v.network.trim() ? v.network.trim() : 'preview';
  const deployedAt = typeof v.deployedAt === 'string' ? v.deployedAt : '';
  return { network, contractAddress: address, deployedAt };
};

/** deployment.json wins; an optional address override (build-time) is the fallback. */
export const resolveDeployment = (json: unknown, addressOverride?: string): Deployment | null => {
  const fromJson = parseDeployment(json);
  if (fromJson) return fromJson;
  const override = addressOverride?.trim();
  return override ? parseDeployment({ network: 'preview', contractAddress: override, deployedAt: '' }) : null;
};

export const loadDeployment = (): Deployment | null =>
  resolveDeployment(raw, (import.meta.env?.VITE_CONTRACT_ADDRESS as string | undefined) ?? undefined);

/** Public explorer. It has a network switcher and search by address; no stable deep-link format is documented. */
export const EXPLORER_URL = 'https://www.midnightexplorer.com/';
