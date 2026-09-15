/**
 * Test fixture builder.
 *
 * Positions are written as a sparse map of notation -> piece code so each test
 * can state a minimal position containing only the pieces the rule needs.
 *
 *   'h1': 'YK'    yellow king
 *   'm8': 'RPm'   red pawn that has already moved
 *   'd7': 'GNd'   green knight, dead (eliminated owner)
 */

import { coordToIndex, fromNotation, type Coord } from '../../src/engine/coordinates.js';
import { emptyBoard, withUpdates, type Board } from '../../src/engine/board.js';
import { makePiece, type Piece, type PieceType, type PlayerColor } from '../../src/engine/pieces.js';
import {
  createGame,
  positionKey,
  type GameState,
} from '../../src/engine/gameState.js';
import type { EnPassantTarget } from '../../src/engine/movement.js';
import { initialStatus, type StatusTable } from '../../src/engine/elimination.js';
import { emptyScores } from '../../src/engine/scoring.js';
import { RULES_VERSION, type RulesProfile } from '../../src/rules/types.js';

const COLOR_BY_TAG: Readonly<Record<string, PlayerColor>> = {
  R: 'red',
  B: 'blue',
  Y: 'yellow',
  G: 'green',
};

export function sq(notation: string): Coord {
  const coord = fromNotation(notation);
  if (!coord) throw new Error(`not a playable square: ${notation}`);
  return coord;
}

export function parsePieceCode(code: string): Piece {
  const tag = code[0] ?? '';
  const type = code[1] ?? '';
  const flags = code.slice(2);
  const owner = COLOR_BY_TAG[tag];
  if (!owner) throw new Error(`bad colour tag in "${code}"`);
  if (!'KQRBNP'.includes(type)) throw new Error(`bad piece type in "${code}"`);
  return makePiece(type as PieceType, owner, {
    hasMoved: flags.includes('m'),
    dead: flags.includes('d'),
  });
}

export function boardFrom(pieces: Readonly<Record<string, string>>): Board {
  const updates: (readonly [number, Piece | null])[] = [];
  for (const [notation, code] of Object.entries(pieces)) {
    updates.push([coordToIndex(sq(notation)), parsePieceCode(code)]);
  }
  return withUpdates(emptyBoard(), updates);
}

export interface PositionSpec {
  readonly pieces: Readonly<Record<string, string>>;
  readonly toMove: PlayerColor;
  readonly active?: readonly PlayerColor[];
  readonly enPassant?: EnPassantTarget | null;
  readonly ply?: number;
  readonly status?: StatusTable;
  readonly halfmoveClock?: number;
}

/** A GameState containing only the listed pieces. */
export function position(profile: RulesProfile, spec: PositionSpec): GameState {
  const captured = Object.fromEntries(
    profile.turnOrder.map((color) => [color, [] as readonly PieceType[]]),
  ) as Record<PlayerColor, readonly PieceType[]>;

  const state: GameState = {
    rulesVersion: RULES_VERSION,
    profileId: profile.id,
    board: boardFrom(spec.pieces),
    toMove: spec.toMove,
    active: spec.active ?? [...profile.turnOrder],
    status: spec.status ?? initialStatus(profile),
    scores: emptyScores(profile),
    captured,
    enPassant: spec.enPassant ?? null,
    halfmoveClock: spec.halfmoveClock ?? 0,
    ply: spec.ply ?? 0,
    history: [],
    repetition: {},
    clocks: null,
    result: null,
  };
  return { ...state, repetition: { [positionKey(state)]: 1 } };
}

export function freshGame(profile: RulesProfile): GameState {
  return createGame(profile);
}

/** Destination squares of a move list, as sorted notation, for readable assertions. */
export function destinations(moves: readonly { to: Coord }[]): readonly string[] {
  const seen = new Set<string>();
  for (const move of moves) {
    seen.add(`${'abcdefghijklmn'[move.to.c] ?? '?'}${14 - move.to.r}`);
  }
  return [...seen].sort();
}

export function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}
