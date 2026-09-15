/**
 * Turn rotation (rules.md §10.2).
 *
 * The next player is always computed from the ACTIVE set by walking the
 * profile's turn order, never by incrementing an index. That keeps rotation
 * correct when a player is eliminated mid-cycle (INV-4).
 */

import type { PlayerColor } from './pieces.js';
import type { RulesProfile } from '../rules/types.js';

/**
 * The first active player strictly after `current` in turn order, wrapping
 * around. Works whether or not `current` is still active. Returns null when
 * nobody is active.
 */
export function nextActiveAfter(
  profile: RulesProfile,
  active: readonly PlayerColor[],
  current: PlayerColor,
): PlayerColor | null {
  const order = profile.turnOrder;
  const activeSet = new Set(active);
  if (activeSet.size === 0) return null;

  const start = order.indexOf(current);
  if (start < 0) {
    return order.find((color) => activeSet.has(color)) ?? null;
  }

  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(start + offset) % order.length];
    if (candidate !== undefined && activeSet.has(candidate)) return candidate;
  }
  return null;
}

/** Active players in turn order, starting from `from` inclusive. */
export function rotationFrom(
  profile: RulesProfile,
  active: readonly PlayerColor[],
  from: PlayerColor,
): readonly PlayerColor[] {
  const out: PlayerColor[] = [];
  const activeSet = new Set(active);
  const order = profile.turnOrder;
  const start = Math.max(0, order.indexOf(from));
  for (let offset = 0; offset < order.length; offset += 1) {
    const candidate = order[(start + offset) % order.length];
    if (candidate !== undefined && activeSet.has(candidate)) out.push(candidate);
  }
  return out;
}

/** Keeps the active list canonically ordered so serialised states compare cleanly. */
export function sortByTurnOrder(
  profile: RulesProfile,
  colors: readonly PlayerColor[],
): readonly PlayerColor[] {
  return profile.turnOrder.filter((color) => colors.includes(color));
}

/** Round number (1-based) for a ply index, for the move list. */
export function roundOfPly(profile: RulesProfile, ply: number): number {
  return Math.floor(ply / profile.turnOrder.length) + 1;
}
