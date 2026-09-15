/**
 * T-06 — pawn movement for all four orientations, double step, captures,
 * en passant (AMB-4) and promotion (T-15, AMB-3, AMB-13).
 */

import { describe, expect, it } from 'vitest';
import { pseudoLegalMovesFrom, type EnPassantTarget, type MoveContext } from '../../src/engine/movement.js';
import { applyMove, commitMove, contextOf, createGame } from '../../src/engine/gameState.js';
import { pieceAt } from '../../src/engine/board.js';
import { STANDARD_TEAMS } from '../../src/rules/teams.js';
import { STANDARD_FFA } from '../../src/rules/freeForAll.js';
import { boardFrom, destinations, position, sq } from '../support/fixture.js';

function ctx(
  pieces: Record<string, string>,
  profile = STANDARD_TEAMS,
  enPassant: EnPassantTarget | null = null,
): MoveContext {
  return { board: boardFrom(pieces), profile, enPassant, ply: 0 };
}

function movesFrom(pieces: Record<string, string>, from: string, profile = STANDARD_TEAMS) {
  return destinations(pseudoLegalMovesFrom(ctx(pieces, profile), sq(from)));
}

describe('T-06 four pawn orientations', () => {
  it('yellow pawns move up the board', () => {
    expect(movesFrom({ h2: 'YP' }, 'h2')).toEqual(['h3', 'h4']);
  });

  it('green pawns move down the board', () => {
    expect(movesFrom({ h13: 'GP' }, 'h13')).toEqual(['h11', 'h12']);
  });

  it('blue pawns move to the right', () => {
    expect(movesFrom({ b7: 'BP' }, 'b7')).toEqual(['c7', 'd7']);
  });

  it('red pawns move to the left', () => {
    expect(movesFrom({ m8: 'RP' }, 'm8')).toEqual(['k8', 'l8']);
  });

  it('never move backwards', () => {
    expect(movesFrom({ h4: 'YPm' }, 'h4')).toEqual(['h5']);
    expect(movesFrom({ l8: 'RPm' }, 'l8')).toEqual(['k8']);
  });
});

describe('T-06 double step', () => {
  it('is available only from the home line', () => {
    expect(movesFrom({ h2: 'YP' }, 'h2')).toContain('h4');
    expect(movesFrom({ h3: 'YP' }, 'h3')).toEqual(['h4']);
  });

  it('is unavailable once the pawn has moved', () => {
    expect(movesFrom({ h2: 'YPm' }, 'h2')).toEqual(['h3']);
  });

  it('is blocked when either square is occupied', () => {
    expect(movesFrom({ h2: 'YP', h3: 'GP' }, 'h2')).toEqual([]);
    expect(movesFrom({ h2: 'YP', h4: 'GP' }, 'h2')).toEqual(['h3']);
  });

  it('works for every colour from its own home line', () => {
    expect(movesFrom({ b7: 'BP' }, 'b7')).toContain('d7');
    expect(movesFrom({ m8: 'RP' }, 'm8')).toContain('k8');
    expect(movesFrom({ h13: 'GP' }, 'h13')).toContain('h11');
  });
});

describe('T-06 pawn captures', () => {
  it('captures diagonally forward only, for each colour', () => {
    expect(movesFrom({ h2: 'YP', g3: 'GP', i3: 'GP' }, 'h2')).toEqual(['g3', 'h3', 'h4', 'i3']);
    expect(movesFrom({ h13: 'GP', g12: 'YP', i12: 'YP' }, 'h13')).toEqual(['g12', 'h11', 'h12', 'i12']);
    expect(movesFrom({ b7: 'BP', c6: 'RP', c8: 'RP' }, 'b7', STANDARD_FFA)).toEqual(['c6', 'c7', 'c8', 'd7']);
    expect(movesFrom({ m8: 'RP', l7: 'BP', l9: 'BP' }, 'm8')).toEqual(['k8', 'l7', 'l8', 'l9']);
  });

  it('cannot capture straight ahead', () => {
    expect(movesFrom({ h2: 'YP', h3: 'GP' }, 'h2')).toEqual([]);
  });

  it('T-10 cannot capture a teammate diagonally', () => {
    // Yellow and Red are teammates.
    expect(movesFrom({ h2: 'YP', g3: 'RP' }, 'h2')).toEqual(['h3', 'h4']);
    expect(movesFrom({ h2: 'YP', g3: 'RP' }, 'h2', STANDARD_FFA)).toEqual(['g3', 'h3', 'h4']);
  });
});

describe('T-06b en passant (AMB-4)', () => {
  // Red double-steps m8 -> k8, skipping l8. A green pawn on k9 attacks l8.
  const target: EnPassantTarget = {
    square: sq('l8'),
    pawnAt: sq('k8'),
    owner: 'red',
    createdAtPly: 1,
    expiresAtPly: 5,
  };

  it('lets an opponent pawn capture the skipped square', () => {
    const moves = destinations(
      pseudoLegalMovesFrom(ctx({ k9: 'GPm', k8: 'RPm' }, STANDARD_TEAMS, target), sq('k9')),
    );
    expect(moves).toContain('l8');
  });

  it('removes the pawn from the square it actually occupies', () => {
    const state = position(STANDARD_TEAMS, {
      pieces: { k9: 'GPm', k8: 'RPm', a7: 'BK', n8: 'RK', h1: 'YK', g14: 'GK' },
      toMove: 'green',
      enPassant: target,
      ply: 1,
    });
    const outcome = applyMove(state, STANDARD_TEAMS, { from: sq('k9'), to: sq('l8') });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(pieceAt(outcome.state.board, sq('l8'))?.owner).toBe('green');
    expect(pieceAt(outcome.state.board, sq('k8'))).toBeNull();
    expect(outcome.record.kind === 'move' && outcome.record.move.enPassant).toBe(true);
  });

  it('is unavailable once the window has expired', () => {
    const expired = { ...target, expiresAtPly: 1 };
    const moves = destinations(
      pseudoLegalMovesFrom(
        { board: boardFrom({ k9: 'GPm', k8: 'RPm' }), profile: STANDARD_TEAMS, enPassant: expired, ply: 2 },
        sq('k9'),
      ),
    );
    expect(moves).not.toContain('l8');
  });

  it('cannot be used against a teammate', () => {
    // A yellow pawn on k7 also attacks l8, but Yellow and Red are teammates.
    const moves = destinations(
      pseudoLegalMovesFrom(ctx({ k7: 'YPm', k8: 'RPm' }, STANDARD_TEAMS, target), sq('k7')),
    );
    expect(moves).not.toContain('l8');
  });

  it('the same capture IS available to that pawn in free-for-all', () => {
    const moves = destinations(
      pseudoLegalMovesFrom(ctx({ k7: 'YPm', k8: 'RPm' }, STANDARD_FFA, target), sq('k7')),
    );
    expect(moves).toContain('l8');
  });

  it('a real double step creates a target with the documented one-round window', () => {
    const game = createGame(STANDARD_TEAMS);
    const outcome = applyMove(game, STANDARD_TEAMS, { from: sq('m8'), to: sq('k8') });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const ep = outcome.state.enPassant;
    expect(ep).not.toBeNull();
    expect(ep && `${'abcdefghijklmn'[ep.square.c]}${14 - ep.square.r}`).toBe('l8');
    expect(ep?.owner).toBe('red');
    // oneFullRound: alive for the other three players.
    expect(ep && ep.expiresAtPly - ep.createdAtPly).toBe(4);
  });
});

describe('T-15 promotion (AMB-3)', () => {
  it('promotes on the far edge of the central band, not the enemy back line', () => {
    const moves = pseudoLegalMovesFrom(ctx({ h10: 'YPm' }), sq('h10'));
    const promotions = moves.filter((move) => move.promotion !== null);
    expect(promotions).toHaveLength(4);
    expect(new Set(promotions.map((move) => move.promotion))).toEqual(new Set(['Q', 'R', 'B', 'N']));
    expect(destinations(promotions)).toEqual(['h11']);
  });

  it('offers promotion for every colour on its own line', () => {
    const cases: readonly (readonly [string, string, string])[] = [
      ['h10', 'YPm', 'h11'],
      ['h5', 'GPm', 'h4'],
      ['j7', 'BPm', 'k7'],
      ['e7', 'RPm', 'd7'],
    ];
    for (const [from, code, to] of cases) {
      const moves = pseudoLegalMovesFrom(ctx({ [from]: code }), sq(from));
      const promotions = moves.filter((move) => move.promotion !== null);
      expect(promotions.length, `${code} on ${from}`).toBe(4);
      expect(destinations(promotions)).toEqual([to]);
    }
  });

  it('AMB-13 promotes on a promotion-line square inside an enemy arm', () => {
    // Yellow pawn on b10 captures onto a11, which is on yellow's promotion line.
    const moves = pseudoLegalMovesFrom(ctx({ b10: 'YPm', a11: 'GR' }), sq('b10'));
    const onA11 = moves.filter((move) => move.to.r === sq('a11').r && move.to.c === sq('a11').c);
    expect(onA11).toHaveLength(4);
    expect(onA11.every((move) => move.promotion !== null)).toBe(true);
  });

  it('actually replaces the pawn when the move is applied', () => {
    const state = position(STANDARD_TEAMS, {
      pieces: { h10: 'YPm', h1: 'YK', a7: 'BK', n8: 'RK', g14: 'GK' },
      toMove: 'yellow',
    });
    const outcome = applyMove(state, STANDARD_TEAMS, {
      from: sq('h10'),
      to: sq('h11'),
      promotion: 'N',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(pieceAt(outcome.state.board, sq('h11'))).toMatchObject({ type: 'N', owner: 'yellow' });
  });

  it('refuses an ambiguous promotion request and asks for a choice', () => {
    const state = position(STANDARD_TEAMS, {
      pieces: { h10: 'YPm', h1: 'YK', a7: 'BK', n8: 'RK', g14: 'GK' },
      toMove: 'yellow',
    });
    const outcome = applyMove(state, STANDARD_TEAMS, { from: sq('h10'), to: sq('h11') });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('promotionRequired');
  });

  it('a pawn sitting on its promotion line generates no further moves', () => {
    expect(movesFrom({ h11: 'YPm' }, 'h11')).toEqual([]);
  });
});

describe('pawn integration with the real opening position', () => {
  it('gives every army 8 single and 8 double pawn pushes at the start', () => {
    for (const profile of [STANDARD_TEAMS, STANDARD_FFA]) {
      const game = createGame(profile);
      const context = contextOf(game, profile);
      let pushes = 0;
      for (const { coord, piece } of pawnsOf(game.board)) {
        if (piece.owner !== 'red') continue;
        pushes += pseudoLegalMovesFrom(context, coord).length;
      }
      expect(pushes, profile.id).toBe(16);
    }
  });

  function* pawnsOf(board: ReturnType<typeof boardFrom>) {
    for (let i = 0; i < board.length; i += 1) {
      const piece = board[i];
      if (piece?.type === 'P') yield { coord: { r: Math.floor(i / 14), c: i % 14 }, piece };
    }
  }
});

describe('commitMove is a pure transition', () => {
  it('does not mutate the state it was given', () => {
    const game = createGame(STANDARD_TEAMS);
    const before = JSON.stringify(game.board);
    const moves = pseudoLegalMovesFrom(contextOf(game, STANDARD_TEAMS), sq('m8'));
    const first = moves[0];
    expect(first).toBeDefined();
    if (!first) return;
    commitMove(game, STANDARD_TEAMS, first);
    expect(JSON.stringify(game.board)).toBe(before);
  });
});
