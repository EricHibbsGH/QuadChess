/**
 * T-14 checkmate and stalemate.
 * T-16 elimination and turn advancement.
 * T-17 scoring for every configured event.
 *
 * Mate and stalemate are only decided when the rotation reaches the affected
 * player, because an intervening opponent may rescue them (rules.md §9).
 */

import { describe, expect, it } from 'vitest';
import { classifyTerminal, isInCheck } from '../../src/engine/check.js';
import { hasLegalMove } from '../../src/engine/legalMoves.js';
import { applyMove, createGame, resign } from '../../src/engine/gameState.js';
import { pieceAt } from '../../src/engine/board.js';
import type { MoveContext } from '../../src/engine/movement.js';
import { STANDARD_TEAMS } from '../../src/rules/teams.js';
import { STANDARD_FFA } from '../../src/rules/freeForAll.js';
import { boardFrom, position, sq } from '../support/fixture.js';

function ctx(pieces: Record<string, string>, profile = STANDARD_TEAMS): MoveContext {
  return { board: boardFrom(pieces), profile, enPassant: null, ply: 0 };
}

/**
 * Green queen h8 -> m8 mates the red king on n8: the queen covers every escape
 * square and is defended by the green rook on m4.
 */
const MATE_SETUP = { h8: 'GQ', m4: 'GR', n8: 'RK', h1: 'YK', a7: 'BK', g14: 'GK' } as const;

/**
 * Red king n8 has no legal move but is not in check. Rooks on d7 and d9 cover
 * rank 7 (n7, m7) and rank 9 (n9, m9); the rook on m4 covers the m-file (m7, m8,
 * m9). No green piece attacks n8 itself, so this is stalemate, not mate.
 */
const STALEMATE_SETUP = { d7: 'GR', d9: 'GR', m4: 'GR', n8: 'RK', h1: 'YK', a6: 'BK', g14: 'GK' } as const;

describe('T-14 terminal classification', () => {
  it('recognises checkmate', () => {
    const context = ctx({ ...MATE_SETUP, m8: 'GQ', h8: 'YP' });
    expect(isInCheck(context, 'red')).toBe(true);
    expect(hasLegalMove(context, 'red')).toBe(false);
    expect(classifyTerminal(context, 'red', false)).toBe('checkmate');
  });

  it('recognises stalemate', () => {
    const context = ctx(STALEMATE_SETUP);
    expect(isInCheck(context, 'red')).toBe(false);
    expect(hasLegalMove(context, 'red')).toBe(false);
    expect(classifyTerminal(context, 'red', false)).toBe('stalemate');
  });

  it('reports neither when a legal move exists', () => {
    const context = ctx({ n8: 'RK', h1: 'YK', a7: 'BK', g14: 'GK' });
    expect(hasLegalMove(context, 'red')).toBe(true);
    expect(classifyTerminal(context, 'red', true)).toBe('none');
  });
});

describe('T-14 checkmate in the Teams profile (AMB-6)', () => {
  it('ends the game and loses it for the mated player team', () => {
    const state = position(STANDARD_TEAMS, { pieces: MATE_SETUP, toMove: 'green' });
    const outcome = applyMove(state, STANDARD_TEAMS, { from: sq('h8'), to: sq('m8') });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.events.some((event) => event.kind === 'checkmate' && event.color === 'red')).toBe(true);
    const result = outcome.state.result;
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('win');
    expect(result?.reason).toBe('checkmate');
    expect([...(result?.winners ?? [])].sort()).toEqual(['blue', 'green']);
  });

  it('records the mating move with a # suffix', () => {
    const state = position(STANDARD_TEAMS, { pieces: MATE_SETUP, toMove: 'green' });
    const outcome = applyMove(state, STANDARD_TEAMS, { from: sq('h8'), to: sq('m8') });
    if (!outcome.ok) return;
    expect(outcome.record.text).toBe('Qh8-m8#');
  });

  it('refuses further moves once the game is over', () => {
    const state = position(STANDARD_TEAMS, { pieces: MATE_SETUP, toMove: 'green' });
    const first = applyMove(state, STANDARD_TEAMS, { from: sq('h8'), to: sq('m8') });
    if (!first.ok) return;
    const second = applyMove(first.state, STANDARD_TEAMS, { from: sq('a7'), to: sq('a8') });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('gameOver');
  });
});

describe('T-14/T-16/T-17 checkmate in free-for-all', () => {
  it('eliminates the mated player and keeps the game running', () => {
    const state = position(STANDARD_FFA, { pieces: MATE_SETUP, toMove: 'green' });
    const outcome = applyMove(state, STANDARD_FFA, { from: sq('h8'), to: sq('m8') });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.state.result).toBeNull();
    expect(outcome.state.active).toEqual(['blue', 'yellow', 'green']);
    expect(outcome.state.status['red']).toMatchObject({ kind: 'eliminated', by: 'checkmate' });
    // Rotation continues with the next active player after red.
    expect(outcome.state.toMove).toBe('blue');
  });

  it('T-17 awards the checkmate bonus to the player who delivered it', () => {
    const state = position(STANDARD_FFA, { pieces: MATE_SETUP, toMove: 'green' });
    const outcome = applyMove(state, STANDARD_FFA, { from: sq('h8'), to: sq('m8') });
    if (!outcome.ok) return;
    expect(outcome.state.scores['green']).toBe(STANDARD_FFA.checkmateBonus);
    expect(outcome.state.scores['red']).toBe(0);
  });

  it('T-16 removes the eliminated king from the board', () => {
    const state = position(STANDARD_FFA, { pieces: MATE_SETUP, toMove: 'green' });
    const outcome = applyMove(state, STANDARD_FFA, { from: sq('h8'), to: sq('m8') });
    if (!outcome.ok) return;
    expect(pieceAt(outcome.state.board, sq('n8'))).toBeNull();
  });

  it('T-16 leaves the eliminated player other pieces on the board as dead', () => {
    const withPawn = { ...MATE_SETUP, m11: 'RP' };
    const state = position(STANDARD_FFA, { pieces: withPawn, toMove: 'green' });
    const outcome = applyMove(state, STANDARD_FFA, { from: sq('h8'), to: sq('m8') });
    if (!outcome.ok) return;
    const pawn = pieceAt(outcome.state.board, sq('m11'));
    expect(pawn).toMatchObject({ owner: 'red', type: 'P', dead: true });
  });
});

describe('T-14 stalemate (AMB-7, AMB-8)', () => {
  it('Teams: skips the stalemated player rather than eliminating them', () => {
    const state = position(STANDARD_TEAMS, { pieces: STALEMATE_SETUP, toMove: 'green' });
    const outcome = applyMove(state, STANDARD_TEAMS, { from: sq('g14'), to: sq('f14') });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.events.some((event) => event.kind === 'stalemate' && event.color === 'red')).toBe(true);
    expect(outcome.events.some((event) => event.kind === 'skip' && event.color === 'red')).toBe(true);
    expect(outcome.state.active).toContain('red');
    expect(outcome.state.status['red']).toEqual({ kind: 'active' });
    expect(outcome.state.toMove).toBe('blue');
    expect(outcome.state.result).toBeNull();
  });

  it('free-for-all: eliminates the stalemated player and pays them the bonus', () => {
    const state = position(STANDARD_FFA, { pieces: STALEMATE_SETUP, toMove: 'green' });
    const outcome = applyMove(state, STANDARD_FFA, { from: sq('g14'), to: sq('f14') });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.state.active).toEqual(['blue', 'yellow', 'green']);
    expect(outcome.state.status['red']).toMatchObject({ kind: 'eliminated', by: 'stalemate' });
    expect(outcome.state.scores['red']).toBe(STANDARD_FFA.stalemateBonus);
    expect(outcome.state.toMove).toBe('blue');
  });
});

describe('T-16 resignation', () => {
  it('Teams: resigning loses the game for that team', () => {
    const game = createGame(STANDARD_TEAMS);
    const outcome = resign(game, STANDARD_TEAMS, 'red');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.result?.reason).toBe('resignation');
    expect([...(outcome.state.result?.winners ?? [])].sort()).toEqual(['blue', 'green']);
  });

  it('free-for-all: resigning eliminates only that player', () => {
    const game = createGame(STANDARD_FFA);
    const outcome = resign(game, STANDARD_FFA, 'red');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.result).toBeNull();
    expect(outcome.state.active).toEqual(['blue', 'yellow', 'green']);
    expect(outcome.state.toMove).toBe('blue');
    expect(outcome.state.scores['red']).toBe(0);
  });

  it('free-for-all: a player who is not to move may also resign', () => {
    const game = createGame(STANDARD_FFA);
    const outcome = resign(game, STANDARD_FFA, 'yellow');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.toMove).toBe('red');
    expect(outcome.state.active).toEqual(['red', 'blue', 'green']);
  });

  it('refuses to resign a player twice', () => {
    const game = createGame(STANDARD_FFA);
    const first = resign(game, STANDARD_FFA, 'red');
    if (!first.ok) return;
    const second = resign(first.state, STANDARD_FFA, 'red');
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('playerNotActive');
  });
});

describe('T-16 free-for-all runs down to a sole survivor', () => {
  it('ends the game and pays the survivor bonus', () => {
    let state = createGame(STANDARD_FFA);
    for (const color of ['red', 'blue', 'yellow'] as const) {
      const outcome = resign(state, STANDARD_FFA, color);
      expect(outcome.ok, color).toBe(true);
      if (!outcome.ok) return;
      state = outcome.state;
    }
    expect(state.active).toEqual(['green']);
    expect(state.result?.kind).toBe('win');
    expect(state.result?.reason).toBe('soleSurvivor');
    expect(state.result?.winners).toEqual(['green']);
    expect(state.scores['green']).toBe(STANDARD_FFA.soleSurvivorBonus);
  });
});

describe('T-17 capture scoring', () => {
  it('pays the configured value for each captured piece type', () => {
    const cases: readonly (readonly [string, string, number])[] = [
      ['GP', 'P', 1],
      ['GN', 'N', 3],
      ['GB', 'B', 5],
      ['GR', 'R', 5],
      ['GQ', 'Q', 9],
    ];
    for (const [code, type, value] of cases) {
      const state = position(STANDARD_FFA, {
        pieces: { h7: 'YR', h9: code, h1: 'YK', a7: 'BK', n8: 'RK', g14: 'GK' },
        toMove: 'yellow',
      });
      const outcome = applyMove(state, STANDARD_FFA, { from: sq('h7'), to: sq('h9') });
      expect(outcome.ok, type).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.state.scores['yellow'], type).toBe(value);
      expect(STANDARD_FFA.pieceValues[type as 'P']).toBe(value);
    }
  });

  it('records captured pieces for the captured-piece display', () => {
    const state = position(STANDARD_FFA, {
      pieces: { h7: 'YR', h9: 'GQ', h1: 'YK', a7: 'BK', n8: 'RK', g14: 'GK' },
      toMove: 'yellow',
    });
    const outcome = applyMove(state, STANDARD_FFA, { from: sq('h7'), to: sq('h9') });
    if (!outcome.ok) return;
    expect(outcome.state.captured['yellow']).toEqual(['Q']);
  });

  it('pays nothing in the Teams profile, where scoring is off', () => {
    const state = position(STANDARD_TEAMS, {
      pieces: { h7: 'YR', h9: 'GQ', h1: 'YK', a7: 'BK', n8: 'RK', g14: 'GK' },
      toMove: 'yellow',
    });
    const outcome = applyMove(state, STANDARD_TEAMS, { from: sq('h7'), to: sq('h9') });
    if (!outcome.ok) return;
    expect(STANDARD_TEAMS.scoringEnabled).toBe(false);
    expect(outcome.state.scores['yellow']).toBe(0);
    // The capture itself still happened and is still displayed.
    expect(outcome.state.captured['yellow']).toEqual(['Q']);
  });

  it('pays normal value for capturing a dead piece', () => {
    const state = position(STANDARD_FFA, {
      pieces: { h7: 'YR', h9: 'GQd', h1: 'YK', a7: 'BK', n8: 'RK', g14: 'GK' },
      toMove: 'yellow',
      active: ['red', 'blue', 'yellow'],
    });
    const outcome = applyMove(state, STANDARD_FFA, { from: sq('h7'), to: sq('h9') });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.scores['yellow']).toBe(9);
  });
});

describe('turn order advances past eliminated players (T-16)', () => {
  it('skips an eliminated player permanently', () => {
    const game = createGame(STANDARD_FFA);
    const resigned = resign(game, STANDARD_FFA, 'blue');
    expect(resigned.ok).toBe(true);
    if (!resigned.ok) return;

    let state = resigned.state;
    expect(state.toMove).toBe('red');
    const move = applyMove(state, STANDARD_FFA, { from: sq('m8'), to: sq('l8') });
    expect(move.ok).toBe(true);
    if (!move.ok) return;
    state = move.state;
    // Blue is gone, so the turn passes from red straight to yellow.
    expect(state.toMove).toBe('yellow');
    expect(state.active).toEqual(['red', 'yellow', 'green']);
  });
});
