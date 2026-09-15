/**
 * Profile registry. Loading a saved game goes through `resolveProfile`, which
 * refuses unknown rules versions and unknown profile ids, so a future rule
 * change can never silently re-interpret an existing game.
 */

import { STANDARD_FFA } from './freeForAll.js';
import { STANDARD_TEAMS, STANDARD_TEAMS_CLASSIC } from './teams.js';
import { RULES_VERSION, type RulesProfile } from './types.js';

export * from './types.js';
export { STANDARD_TEAMS, STANDARD_TEAMS_CLASSIC } from './teams.js';
export { STANDARD_FFA } from './freeForAll.js';

export const PROFILES: readonly RulesProfile[] = Object.freeze([
  STANDARD_TEAMS,
  STANDARD_FFA,
  STANDARD_TEAMS_CLASSIC,
]);

export const DEFAULT_PROFILE_ID = STANDARD_TEAMS.id;

const BY_ID = new Map<string, RulesProfile>(PROFILES.map((p) => [p.id, p]));

export function getProfile(id: string): RulesProfile | null {
  return BY_ID.get(id) ?? null;
}

export function defaultProfile(): RulesProfile {
  return STANDARD_TEAMS;
}

export type ProfileResolution =
  | { readonly ok: true; readonly profile: RulesProfile }
  | { readonly ok: false; readonly reason: string };

export function resolveProfile(profileId: unknown, rulesVersion: unknown): ProfileResolution {
  if (rulesVersion !== RULES_VERSION) {
    return {
      ok: false,
      reason: `unsupported rules version ${JSON.stringify(rulesVersion)}; this build understands ${RULES_VERSION}`,
    };
  }
  if (typeof profileId !== 'string') {
    return { ok: false, reason: 'missing profile id' };
  }
  const profile = BY_ID.get(profileId);
  if (!profile) {
    return { ok: false, reason: `unknown rules profile ${JSON.stringify(profileId)}` };
  }
  return { ok: true, profile };
}
