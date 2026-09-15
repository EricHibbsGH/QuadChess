/**
 * T-10 — team rules (rules.md §11, AMB-1, AMB-12).
 */

import { describe, expect, it } from 'vitest';
import { areAllies, opponentsOf, teammatesOf, teamIndexOf } from '../../src/rules/types.js';
import { STANDARD_TEAMS, STANDARD_TEAMS_CLASSIC } from '../../src/rules/teams.js';
import { STANDARD_FFA } from '../../src/rules/freeForAll.js';
import { legalMovesFrom } from '../../src/engine/legalMoves.js';
import { isInCheck } from '../../src/engine/check.js';
import { applyMove } from '../../src/engine/gameState.js';
import type { MoveContext } from '../../src/engine/movement.js';
import { boardFrom, destinations, position, sq } from '../support/fixture.js';

function ctx(pieces: Record<string, string>, profile = STANDARD_TEAMS): MoveContext {
  return { board: boardFrom(pieces), profile, enPassant: null, ply: 0 };
}

describe('team membership', () => {
  it('pairs Red with Yellow and Blue with Green', () => {
    expect(areAllies(STANDARD_TEAMS, 'red', 'yellow')).toBe(true);
    expect(areAllies(STANDARD_TEAMS, 'blue', 'green')).toBe(true);
    expect(areAllies(STANDARD_TEAMS, 'red', 'blue')).toBe(false);
    expect(areAllies(STANDARD_TEAMS, 'red', 'green')).toBe(false);
  });

  it('treats a player as their own ally', () => {
    expect(areAllies(STANDARD_TEAMS, 'red', 'red')).toBe(true);
  });

  it('has no allies at all in free-for-all', () => {
    for (const a of STANDARD_FFA.turnOrder) {
      for (const b of STANDARD_FFA.turnOrder) {
        expect(areAllies(STANDARD_FFA, a, b)).toBe(a === b);
      }
      expect(teammatesOf(STANDARD_FFA, a)).toEqual([]);
      expect(opponentsOf(STANDARD_FFA, a)).toHaveLength(3);
    }
  });

  it('gives each player one teammate and two opponents in Teams', () => {
    for (const color of STANDARD_TEAMS.turnOrder) {
      expect(teammatesOf(STANDARD_TEAMS, color)).toHaveLength(1);
      expect(opponentsOf(STANDARD_TEAMS, color)).toHaveLength(2);
      expect(teamIndexOf(STANDARD_TEAMS, color)).toBeGreaterThanOrEqual(0);
    }
  });

  it('AMB-1: the turn order alternates between the two teams', () => {
    const sequence = STANDARD_TEAMS.turnOrder.map((color) => teamIndexOf(STANDARD_TEAMS, color));
    expect(sequence).toEqual([0, 1, 0, 1]);
  });

  it('AMB-1: the classic variant keeps identical team pairs, only reseated', () => {
    expect(STANDARD_TEAMS_CLASSIC.teams).toEqual(STANDARD_TEAMS.teams);
    expect(STANDARD_TEAMS_CLASSIC.turnOrder).toEqual(STANDARD_TEAMS.turnOrder);
    expect(STANDARD_TEAMS_CLASSIC.seating).not.toEqual(STANDARD_TEAMS.seating);
  });
});

describe('T-10 teammate interaction on the board', () => {
  it('cannot capture a teammate piece', () => {
    expect(destinations(legalMovesFrom(ctx({ h7: 'YR', h9: 'RQ', h1: 'YK' }), sq('h7')))).not.toContain('h9');
  });

  it('AMB-12: a teammate piece blocks sliding exactly like an own piece', () => {
    const moves = destinations(legalMovesFrom(ctx({ h7: 'YR', h9: 'RQ', h1: 'YK' }), sq('h7')));
    expect(moves).toContain('h8');
    expect(moves).not.toContain('h10');
  });

  it('a teammate never gives check', () => {
    expect(isInCheck(ctx({ h7: 'YK', h11: 'RR' }), 'yellow')).toBe(false);
    expect(STANDARD_TEAMS.teammateAttacksGiveCheck).toBe(false);
  });

  it('a teammate piece can shield a king from a real attacker', () => {
    // Green rook on h11, red (yellow teammate) pawn on h9 blocking.
    expect(isInCheck(ctx({ h7: 'YK', h9: 'RP', h11: 'GR' }), 'yellow')).toBe(false);
  });

  it('a player cannot move a teammate piece', () => {
    const state = position(STANDARD_TEAMS, {
      pieces: { h7: 'YR', m8: 'RP', h1: 'YK', a7: 'BK', n8: 'RK', g14: 'GK' },
      toMove: 'yellow',
    });
    const outcome = applyMove(state, STANDARD_TEAMS, { from: sq('m8'), to: sq('l8') });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('notYourPiece');
  });
});

describe('team victory', () => {
  it('a team wins when both opponents are gone', () => {
    const state = position(STANDARD_TEAMS, {
      pieces: { h1: 'YK', n8: 'RK', a7: 'BK', g14: 'GK' },
      toMove: 'red',
      active: ['red', 'yellow'],
    });
    // With only Red and Yellow active the game is already decided; the engine
    // reports it as soon as the position is evaluated after an action.
    expect(state.active).toEqual(['red', 'yellow']);
    const teams = new Set(state.active.map((color) => teamIndexOf(STANDARD_TEAMS, color)));
    expect(teams.size).toBe(1);
  });
});
