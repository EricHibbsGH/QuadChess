/**
 * Elimination, dead pieces and end-of-game detection (rules.md §10).
 */

import { CELL_COUNT, indexToCoord } from './coordinates.js';
import { withUpdates, type Board } from './board.js';
import { asDead, type Piece, type PlayerColor } from './pieces.js';
import { leaders, teamScores, type ScoreTable } from './scoring.js';
import { teamIndexOf, type RulesProfile } from '../rules/types.js';

export type EliminationReason = 'checkmate' | 'stalemate' | 'resign' | 'timeout';

export type PlayerStatus =
  | { readonly kind: 'active' }
  | { readonly kind: 'eliminated'; readonly by: EliminationReason; readonly atPly: number };

export type StatusTable = Readonly<Record<PlayerColor, PlayerStatus>>;

export const ACTIVE_STATUS: PlayerStatus = Object.freeze({ kind: 'active' });

export function initialStatus(profile: RulesProfile): StatusTable {
  const out: Partial<Record<PlayerColor, PlayerStatus>> = {};
  for (const color of profile.turnOrder) out[color] = ACTIVE_STATUS;
  return out as StatusTable;
}

/**
 * Removes the player from the board according to the profile:
 *   `removed`      -> every piece leaves, king included
 *   `remainAsDead` -> the king leaves, everything else stays as an inert,
 *                     capturable obstacle
 */
export function retirePieces(board: Board, profile: RulesProfile, color: PlayerColor): Board {
  const updates: (readonly [number, Piece | null])[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = board[i];
    if (!piece || piece.owner !== color) continue;

    if (profile.eliminatedPieceBehavior === 'removed') {
      updates.push([i, null]);
      continue;
    }
    if (piece.type === 'K' && profile.eliminatedKingBehavior === 'removed') {
      updates.push([i, null]);
      continue;
    }
    if (!piece.dead) updates.push([i, asDead(piece)]);
  }
  return updates.length === 0 ? board : withUpdates(board, updates);
}

/** Squares still occupied by an eliminated player's dead pieces. */
export function deadPieceSquares(board: Board): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = board[i];
    if (piece?.dead) out.push(i);
  }
  return out;
}

export function deadPieceCoords(board: Board) {
  return deadPieceSquares(board).map(indexToCoord);
}

// --------------------------------------------------------------------------
// Results
// --------------------------------------------------------------------------

export type ResultReason =
  | 'checkmate'
  | 'teamEliminated'
  | 'soleSurvivor'
  | 'allStalemated'
  | 'fiftyMove'
  | 'threefold'
  | 'agreement'
  | 'resignation'
  | 'timeout'
  | 'noPlayers';

export interface GameResult {
  readonly kind: 'win' | 'draw';
  readonly winners: readonly PlayerColor[];
  readonly reason: ResultReason;
  readonly detail: string;
  readonly atPly: number;
}

export function activeTeams(profile: RulesProfile, active: readonly PlayerColor[]): readonly number[] {
  if (profile.teams === null) return [];
  const indexes = new Set<number>();
  for (const color of active) {
    const index = teamIndexOf(profile, color);
    if (index >= 0) indexes.add(index);
  }
  return [...indexes].sort((a, b) => a - b);
}

export function membersOfTeam(profile: RulesProfile, teamIndex: number): readonly PlayerColor[] {
  return profile.teams?.[teamIndex] ?? [];
}

/**
 * Decides whether the game is over from the active set alone. Draws triggered by
 * repetition, the fifty-move rule or universal stalemate are raised by the
 * caller, which owns those counters.
 */
export function evaluateEnd(
  profile: RulesProfile,
  active: readonly PlayerColor[],
  scores: ScoreTable,
  ply: number,
): GameResult | null {
  if (active.length === 0) {
    return { kind: 'draw', winners: [], reason: 'noPlayers', detail: 'No players remain.', atPly: ply };
  }

  if (profile.teams !== null) {
    const teams = activeTeams(profile, active);
    if (teams.length > 1) return null;
    const winningTeam = teams[0];
    if (winningTeam === undefined) {
      return { kind: 'draw', winners: [], reason: 'noPlayers', detail: 'No players remain.', atPly: ply };
    }
    const winners = membersOfTeam(profile, winningTeam);
    return {
      kind: 'win',
      winners,
      reason: 'teamEliminated',
      detail: `Team ${winningTeam + 1} wins: ${winners.join(' and ')}.`,
      atPly: ply,
    };
  }

  if (active.length > 1) return null;

  const winners = profile.scoringEnabled ? leaders(profile, scores) : [...active];
  return {
    kind: winners.length > 1 ? 'draw' : 'win',
    winners,
    reason: 'soleSurvivor',
    detail:
      winners.length > 1
        ? `Tied on points: ${winners.join(', ')}.`
        : `${winners[0] ?? 'nobody'} wins on points.`,
    atPly: ply,
  };
}

/** Immediate team loss, used by `onCheckmate: teamLoses` and by resignation. */
export function teamLossResult(
  profile: RulesProfile,
  losingColor: PlayerColor,
  reason: ResultReason,
  ply: number,
): GameResult {
  const losingTeam = teamIndexOf(profile, losingColor);
  const winningTeam = profile.teams?.findIndex((_, index) => index !== losingTeam) ?? -1;
  const winners = winningTeam >= 0 ? membersOfTeam(profile, winningTeam) : [];
  return {
    kind: winners.length > 0 ? 'win' : 'draw',
    winners,
    reason,
    detail:
      winners.length > 0
        ? `${winners.join(' and ')} win: ${losingColor} lost by ${reason}.`
        : `Game over: ${losingColor} lost by ${reason}.`,
    atPly: ply,
  };
}

export function drawResult(reason: ResultReason, detail: string, ply: number): GameResult {
  return { kind: 'draw', winners: [], reason, detail, atPly: ply };
}

/** Team totals, shown in the status panel even when scoring is off. */
export function teamTotals(profile: RulesProfile, scores: ScoreTable): readonly number[] {
  return teamScores(profile, scores);
}
