/**
 * Team profiles. See rules.md §11.
 *
 * `standard-teams` is the shipped default and encodes resolution A of AMB-1:
 * the reference image's seating, the brief's named team pairs, and the brief's
 * literal turn order. Teammates sit on adjacent arms; a 180-degree rotation maps
 * one team's seats onto the other's, so both teams start congruent.
 *
 * `standard-teams-classic` is resolution C: teammates sit opposite, which is the
 * arrangement most four-player chess implementations use.
 */

import type { PlayerColor } from '../engine/pieces.js';
import { CLASSIC_SEATING, SHARED_DEFAULTS, type RulesProfile } from './types.js';

const TEAM_PAIRS: readonly (readonly PlayerColor[])[] = Object.freeze([
  Object.freeze(['red', 'yellow'] as const),
  Object.freeze(['blue', 'green'] as const),
]);

const TEAM_RULES = {
  teams: TEAM_PAIRS,

  // Teammate interaction (rules.md §11, AMB-12)
  captureTeammate: false,
  teammateAttacksGiveCheck: false,
  mayExposeTeammateKing: true,
  castlingConsidersTeammateAttacks: false,

  // Outcomes (AMB-6, AMB-7)
  onCheckmate: 'teamLoses',
  onStalemate: 'skipTurn',
  onResign: 'teamLoses',
  onTimeout: 'teamLoses',
  eliminatedPieceBehavior: 'removed',

  // Result is a team win; material is tracked for information only.
  scoringEnabled: false,
} as const;

export const STANDARD_TEAMS: RulesProfile = Object.freeze({
  ...SHARED_DEFAULTS,
  ...TEAM_RULES,
  id: 'standard-teams',
  label: 'Standard Teams',
  description:
    'Red + Yellow against Blue + Green. Teammates cannot capture each other. Checkmating one player ends the game and loses it for their team.',
});

export const STANDARD_TEAMS_CLASSIC: RulesProfile = Object.freeze({
  ...SHARED_DEFAULTS,
  ...TEAM_RULES,
  id: 'standard-teams-classic',
  label: 'Standard Teams (classic seating)',
  description:
    'Identical rules to Standard Teams, but seated so teammates sit opposite one another: Red bottom, Blue left, Yellow top, Green right.',
  seating: CLASSIC_SEATING,
});
