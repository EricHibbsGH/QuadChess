/**
 * Free-for-all profile. See rules.md §12.
 *
 * Every other player is an opponent. A checkmated, stalemated, resigned or
 * timed-out player is eliminated; their king leaves the board and their
 * remaining pieces stay as inert, capturable obstacles (AMB-8).
 */

import { SHARED_DEFAULTS, type RulesProfile } from './types.js';

export const STANDARD_FFA: RulesProfile = Object.freeze({
  ...SHARED_DEFAULTS,
  id: 'standard-ffa',
  label: 'Standard Free-for-All',
  description:
    'Four individual players. Eliminated players leave dead pieces on the board. Highest score when the game ends wins.',

  teams: null,

  // No allies, so every teammate-related option is inert but must still be set.
  captureTeammate: false,
  teammateAttacksGiveCheck: false,
  mayExposeTeammateKing: true,

  onCheckmate: 'eliminatePlayer',
  onStalemate: 'eliminatePlayerWithBonus',
  onResign: 'eliminatePlayer',
  onTimeout: 'eliminatePlayer',
  eliminatedPieceBehavior: 'remainAsDead',

  scoringEnabled: true,
});
