/**
 * Property-based invariant tests (rules.md §15).
 *
 * Random legal games are played out and every invariant is asserted after each
 * ply. These catch interaction bugs that hand-written fixtures miss.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CELL_COUNT, isPlayableIndex } from '../../src/engine/coordinates.js';
import { isInCheck } from '../../src/engine/check.js';
import {
  applyMove,
  contextOf,
  createGame,
  legalMovesForCurrent,
  type GameState,
} from '../../src/engine/gameState.js';
import { snapshotOf, toJson, fromJson, validateStateSemantics } from '../../src/engine/serialization.js';
import { STANDARD_TEAMS } from '../../src/rules/teams.js';
import { STANDARD_FFA } from '../../src/rules/freeForAll.js';
import type { RulesProfile } from '../../src/rules/types.js';

function checkInvariants(state: GameState, profile: RulesProfile, label: string): void {
  // INV-1: no piece on an unplayable coordinate.
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (state.board[i] && !isPlayableIndex(i)) {
      throw new Error(`${label}: INV-1 violated at cell ${i}`);
    }
  }

  // INV-2: the player to move is never left in an illegal check state by their
  // own legal moves (checked by applying each, below) — here we assert that a
  // player who has already moved is not still in check.
  // INV-3: every active player has exactly one king; eliminated players none.
  const kings = new Map<string, number>();
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = state.board[i];
    if (piece?.type === 'K' && !piece.dead) {
      kings.set(piece.owner, (kings.get(piece.owner) ?? 0) + 1);
    }
  }
  for (const color of state.active) {
    if (kings.get(color) !== 1) throw new Error(`${label}: INV-3 violated for ${color}`);
  }
  for (const color of profile.turnOrder) {
    if (!state.active.includes(color) && kings.has(color)) {
      throw new Error(`${label}: INV-3 violated, eliminated ${color} still has a king`);
    }
  }

  // INV-4: the turn pointer names an active player, and the active list has no
  // eliminated players and no duplicates.
  if (!state.result && !state.active.includes(state.toMove)) {
    throw new Error(`${label}: INV-4 violated, ${state.toMove} is not active`);
  }
  if (new Set(state.active).size !== state.active.length) {
    throw new Error(`${label}: INV-4 violated, duplicate active players`);
  }
  for (const color of state.active) {
    if (state.status[color]?.kind !== 'active') {
      throw new Error(`${label}: INV-4 violated, ${color} is listed active but eliminated`);
    }
  }

  // INV-5: scores are finite integers.
  for (const [color, value] of Object.entries(state.scores)) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${label}: INV-5 violated for ${color}: ${value}`);
    }
  }

  // INV-7: history stays within the limit.
  if (state.history.length > profile.maxMoveHistoryPlies) {
    throw new Error(`${label}: INV-7 violated`);
  }
}

/** Plays up to `plies` pseudo-random legal moves, asserting invariants each step. */
function playout(profile: RulesProfile, picks: readonly number[], plies: number) {
  let state = createGame(profile);
  checkInvariants(state, profile, 'initial');

  for (let ply = 0; ply < plies; ply += 1) {
    if (state.result) break;
    const moves = legalMovesForCurrent(state, profile);
    if (moves.length === 0) break;

    const pick = picks[ply % picks.length] ?? 0;
    const move = moves[pick % moves.length];
    if (!move) break;

    const mover = state.toMove;
    const outcome = applyMove(state, profile, {
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });
    if (!outcome.ok) {
      throw new Error(`a generated legal move was rejected: ${outcome.reason} ${outcome.detail}`);
    }
    state = outcome.state;

    // INV-2: the mover is never in check after their own move.
    if (state.active.includes(mover) && isInCheck(contextOf(state, profile), mover)) {
      throw new Error(`INV-2 violated: ${mover} is in check after their own move at ply ${ply}`);
    }

    checkInvariants(state, profile, `ply ${ply}`);
  }
  return state;
}

const PROFILES: readonly RulesProfile[] = [STANDARD_TEAMS, STANDARD_FFA];

describe('engine invariants hold across random legal games', () => {
  for (const profile of PROFILES) {
    it(`${profile.id}: INV-1..INV-7 hold for 40-ply random playouts`, () => {
      fc.assert(
        fc.property(fc.array(fc.nat({ max: 5000 }), { minLength: 8, maxLength: 40 }), (picks) => {
          playout(profile, picks, 40);
          return true;
        }),
        { numRuns: 25 },
      );
    });

    it(`${profile.id}: INV-6 serialise/deserialise preserves the state`, () => {
      fc.assert(
        fc.property(fc.array(fc.nat({ max: 5000 }), { minLength: 4, maxLength: 20 }), (picks) => {
          const state = playout(profile, picks, 20);
          const loaded = fromJson(toJson(state));
          if (!loaded.ok) throw new Error(`round trip failed: ${loaded.reason}`);
          expect(snapshotOf(loaded.state)).toEqual(snapshotOf(state));
          expect(loaded.state.history.length).toBe(state.history.length);
          return true;
        }),
        { numRuns: 15 },
      );
    });

    it(`${profile.id}: every state passes the semantic validator`, () => {
      fc.assert(
        fc.property(fc.array(fc.nat({ max: 5000 }), { minLength: 4, maxLength: 24 }), (picks) => {
          const state = playout(profile, picks, 24);
          const problem = validateStateSemantics(state, profile);
          if (problem) throw new Error(problem);
          return true;
        }),
        { numRuns: 15 },
      );
    });
  }
});

describe('every generated legal move really is legal', () => {
  it('applying any generated move always succeeds', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 5000 }), { minLength: 4, maxLength: 16 }), (picks) => {
        let state = createGame(STANDARD_FFA);
        for (let ply = 0; ply < 16 && !state.result; ply += 1) {
          const moves = legalMovesForCurrent(state, STANDARD_FFA);
          if (moves.length === 0) break;
          // Try EVERY generated move from this position, not just the chosen one.
          for (const move of moves) {
            const outcome = applyMove(state, STANDARD_FFA, {
              from: move.from,
              to: move.to,
              promotion: move.promotion,
            });
            if (!outcome.ok) {
              throw new Error(`generated move rejected: ${outcome.reason} (${outcome.detail})`);
            }
          }
          const pick = picks[ply % picks.length] ?? 0;
          const chosen = moves[pick % moves.length];
          if (!chosen) break;
          const outcome = applyMove(state, STANDARD_FFA, {
            from: chosen.from,
            to: chosen.to,
            promotion: chosen.promotion,
          });
          if (!outcome.ok) break;
          state = outcome.state;
        }
        return true;
      }),
      { numRuns: 6 },
    );
  });
});

describe('INV-9 state transitions are pure', () => {
  it('applying a move never mutates the input state', () => {
    const state = createGame(STANDARD_TEAMS);
    const before = JSON.stringify(snapshotOf(state));
    for (const move of legalMovesForCurrent(state, STANDARD_TEAMS)) {
      applyMove(state, STANDARD_TEAMS, { from: move.from, to: move.to, promotion: move.promotion });
    }
    expect(JSON.stringify(snapshotOf(state))).toBe(before);
  });
});
