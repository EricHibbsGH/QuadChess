/**
 * T-05c — castling (rules.md §7, AMB-5).
 */

import { describe, expect, it } from 'vitest';
import { legalMovesFrom } from '../../src/engine/legalMoves.js';
import { applyMove } from '../../src/engine/gameState.js';
import { pieceAt } from '../../src/engine/board.js';
import type { MoveContext } from '../../src/engine/movement.js';
import { STANDARD_TEAMS } from '../../src/rules/teams.js';
import { STANDARD_FFA } from '../../src/rules/freeForAll.js';
import { boardFrom, destinations, position, sq } from '../support/fixture.js';

const KINGS = { a7: 'BK', n8: 'RK', g14: 'GK' } as const;

function ctx(pieces: Record<string, string>, profile = STANDARD_TEAMS): MoveContext {
  return { board: boardFrom(pieces), profile, enPassant: null, ply: 0 };
}

function yellowKingMoves(pieces: Record<string, string>, profile = STANDARD_TEAMS) {
  return destinations(legalMovesFrom(ctx({ ...KINGS, ...pieces }, profile), sq('h1')));
}

describe('castling availability', () => {
  it('offers both sides when nothing is in the way', () => {
    const moves = yellowKingMoves({ h1: 'YK', k1: 'YR', d1: 'YR' });
    expect(moves).toContain('j1'); // short
    expect(moves).toContain('f1'); // long
  });

  it('is blocked by a piece between king and rook', () => {
    expect(yellowKingMoves({ h1: 'YK', k1: 'YR', d1: 'YR', i1: 'YB' })).not.toContain('j1');
    expect(yellowKingMoves({ h1: 'YK', k1: 'YR', d1: 'YR', e1: 'YN' })).not.toContain('f1');
  });

  it('is unavailable once the king has moved', () => {
    expect(yellowKingMoves({ h1: 'YKm', k1: 'YR', d1: 'YR' })).not.toContain('j1');
  });

  it('is unavailable once that rook has moved', () => {
    const moves = yellowKingMoves({ h1: 'YK', k1: 'YRm', d1: 'YR' });
    expect(moves).not.toContain('j1');
    expect(moves).toContain('f1'); // the other rook is still eligible
  });

  it('is unavailable while the king is in check', () => {
    // A green rook on h14 checks down the h-file.
    const moves = yellowKingMoves({ h1: 'YK', k1: 'YR', d1: 'YR', h14: 'GR' });
    expect(moves).not.toContain('j1');
    expect(moves).not.toContain('f1');
  });

  it('is unavailable when the king would transit an attacked square', () => {
    // A green rook on i14 covers i1, which the king crosses when castling short.
    const moves = yellowKingMoves({ h1: 'YK', k1: 'YR', d1: 'YR', i14: 'GR' });
    expect(moves).not.toContain('j1');
    expect(moves).toContain('f1');
  });

  it('is unavailable when the king would land on an attacked square', () => {
    const moves = yellowKingMoves({ h1: 'YK', k1: 'YR', d1: 'YR', j14: 'GR' });
    expect(moves).not.toContain('j1');
  });

  it('AMB-5 ignores attacks from a TEAMMATE', () => {
    // Red is Yellow's teammate, so a red rook covering j1 does not prevent castling.
    const teamMoves = destinations(
      legalMovesFrom(ctx({ a7: 'BK', g14: 'GK', h1: 'YK', k1: 'YR', d1: 'YR', j14: 'RR' }), sq('h1')),
    );
    expect(STANDARD_TEAMS.castlingConsidersTeammateAttacks).toBe(false);
    expect(teamMoves).toContain('j1');

    // The identical position in free-for-all: Red is an opponent, so it does.
    const ffaMoves = destinations(
      legalMovesFrom(
        ctx({ a7: 'BK', g14: 'GK', h1: 'YK', k1: 'YR', d1: 'YR', j14: 'RR' }, STANDARD_FFA),
        sq('h1'),
      ),
    );
    expect(ffaMoves).not.toContain('j1');
  });

  it('is unavailable when the profile disables castling', () => {
    const noCastling = { ...STANDARD_TEAMS, castling: false };
    const moves = destinations(
      legalMovesFrom(ctx({ ...KINGS, h1: 'YK', k1: 'YR', d1: 'YR' }, noCastling), sq('h1')),
    );
    expect(moves).not.toContain('j1');
    expect(moves).not.toContain('f1');
  });
});

describe('castling execution', () => {
  it('moves the king two squares and jumps the rook over it (short)', () => {
    const state = position(STANDARD_TEAMS, {
      pieces: { ...KINGS, h1: 'YK', k1: 'YR', d1: 'YR' },
      toMove: 'yellow',
    });
    const outcome = applyMove(state, STANDARD_TEAMS, { from: sq('h1'), to: sq('j1') });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(pieceAt(outcome.state.board, sq('j1'))).toMatchObject({ type: 'K', owner: 'yellow' });
    expect(pieceAt(outcome.state.board, sq('i1'))).toMatchObject({ type: 'R', owner: 'yellow' });
    expect(pieceAt(outcome.state.board, sq('h1'))).toBeNull();
    expect(pieceAt(outcome.state.board, sq('k1'))).toBeNull();
    expect(outcome.record.kind === 'move' && outcome.record.move.castle).toBe('short');
    expect(outcome.record.text).toBe('O-O');
  });

  it('moves the king two squares the other way (long)', () => {
    const state = position(STANDARD_TEAMS, {
      pieces: { ...KINGS, h1: 'YK', k1: 'YR', d1: 'YR' },
      toMove: 'yellow',
    });
    const outcome = applyMove(state, STANDARD_TEAMS, { from: sq('h1'), to: sq('f1') });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(pieceAt(outcome.state.board, sq('f1'))).toMatchObject({ type: 'K', owner: 'yellow' });
    expect(pieceAt(outcome.state.board, sq('g1'))).toMatchObject({ type: 'R', owner: 'yellow' });
    // The rook lands on g1 and, with the g-file empty in this fixture, checks the
    // green king on g14 — so castling can itself deliver check.
    expect(outcome.record.text).toBe('O-O-O+');
    expect(outcome.events.some((event) => event.kind === 'check' && event.color === 'green')).toBe(true);
  });

  it('marks both pieces as moved so castling cannot repeat', () => {
    const state = position(STANDARD_TEAMS, {
      pieces: { ...KINGS, h1: 'YK', k1: 'YR', d1: 'YR' },
      toMove: 'yellow',
    });
    const outcome = applyMove(state, STANDARD_TEAMS, { from: sq('h1'), to: sq('j1') });
    if (!outcome.ok) return;
    expect(pieceAt(outcome.state.board, sq('j1'))?.hasMoved).toBe(true);
    expect(pieceAt(outcome.state.board, sq('i1'))?.hasMoved).toBe(true);
  });
});

describe('every army can castle from its own back line', () => {
  const setups: readonly (readonly [string, Record<string, string>, string, string])[] = [
    ['yellow', { h1: 'YK', k1: 'YR', d1: 'YR' }, 'h1', 'j1'],
    ['blue', { a7: 'BK', a4: 'BR', a11: 'BR' }, 'a7', 'a5'],
    ['green', { g14: 'GK', d14: 'GR', k14: 'GR' }, 'g14', 'e14'],
    ['red', { n8: 'RK', n11: 'RR', n4: 'RR' }, 'n8', 'n10'],
  ];

  it.each(setups)('%s can castle short', (_color, pieces, from, to) => {
    const board = { h1: 'YK', a7: 'BK', n8: 'RK', g14: 'GK', ...pieces };
    const moves = destinations(legalMovesFrom(ctx(board), sq(from)));
    expect(moves).toContain(to);
  });
});
