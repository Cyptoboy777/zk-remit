/*
 * Which backend the app starts on, and what the user can toggle to.
 * Preview is the default only when a real deployment exists; the simulator is always available.
 */
import type { Deployment } from './deployment';

export type Mode = 'preview' | 'simulator';

export const defaultMode = (deployment: Deployment | null): Mode => (deployment ? 'preview' : 'simulator');

/** Modes the toggle offers. Preview is hidden until there is something real to join. */
export const availableModes = (deployment: Deployment | null): Mode[] =>
  deployment ? ['preview', 'simulator'] : ['simulator'];

/** Honour a requested mode only if it is available; otherwise fall back to the default. */
export const pickMode = (requested: Mode | null | undefined, deployment: Deployment | null): Mode =>
  requested && availableModes(deployment).includes(requested) ? requested : defaultMode(deployment);

export const modeLabel = (mode: Mode): string => (mode === 'preview' ? 'Midnight Preview' : 'Simulator');
