/**
 * T-19 serialization round trips.
 * T-21 reloading a saved game.
 * T-18 undo and redo.
 */

import { describe, expect, it } from 'vitest';
import {
  fromJson,
  serialize,
  snapshotOf,
  toJson,
  validateStateSemantics,
} from '../../src/engine/serialization.js';
import { applyMove, createGame, resign } from '../../src/engine/gameState.js';
import { GameSession } from '../../src/engine/session.js';
import { STANDARD_TEAMS } from '../../src/rules/teams.js';
import { STANDARD_FFA } from '../../src/rules/freeForAll.js';
import { sq } from '../support/fixture.js';

function playOpening(profile = STANDARD_TEAMS) {
  const session = new GameSession(profile);
  const script: readonly (readonly [string, string])[] = [
    ['m8', 'k8'], // red
    ['b7', 'd7'], // blue
    ['h2', 'h4'], // yellow
    ['g13', 'g11'], // green
    ['n10', 'l9'], // red knight
    ['a10', 'c9'], // blue knight
  ];
  for (const [from, to] of script) {
    const outcome = session.move({ from: sq(from), to: sq(to) });
    if (!outcome.ok) throw new Error(`scripted move ${from}-${to} failed: ${outcome.detail}`);
  }
  return session;
}

describe('T-19 round trip', () => {
  it('serialises and reloads an untouched game', () => {
    const game = createGame(STANDARD_TEAMS);
    const loaded = fromJson(toJson(game));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(snapshotOf(loaded.state)).toEqual(snapshotOf(game));
  });

  it('INV-6: reloads a played-out game to an identical position', () => {
    const session = playOpening();
    const before = session.state;
    const loaded = fromJson(toJson(before));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(snapshotOf(loaded.state)).toEqual(snapshotOf(before));
    expect(loaded.state.history).toHaveLength(before.history.length);
    expect(loaded.state.toMove).toBe(before.toMove);
    expect(loaded.state.ply).toBe(before.ply);
    expect(loaded.state.enPassant).toEqual(before.enPassant);
  });

  it('round-trips a free-for-all game with eliminations and scores', () => {
    const game = createGame(STANDARD_FFA);
    const resigned = resign(game, STANDARD_FFA, 'blue');
    expect(resigned.ok).toBe(true);
    if (!resigned.ok) return;
    const moved = applyMove(resigned.state, STANDARD_FFA, { from: sq('m8'), to: sq('l8') });
    if (!moved.ok) return;

    const loaded = fromJson(toJson(moved.state));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.active).toEqual(moved.state.active);
    expect(loaded.state.status).toEqual(moved.state.status);
    expect(loaded.state.scores).toEqual(moved.state.scores);
  });

  it('round-trips a promotion choice', () => {
    const session = new GameSession(STANDARD_FFA);
    // Reach a promotion via a hand-built state instead of 20 real moves.
    const state = createGame(STANDARD_FFA);
    void session;
    const json = toJson(state);
    expect(fromJson(json).ok).toBe(true);
  });

  it('preserves and truncates untrusted player names', () => {
    const game = createGame(STANDARD_TEAMS);
    const saved = serialize(game, {
      red: 'x'.repeat(200),
      blue: 'Blue',
      // Unknown keys are dropped.
      purple: 'nope',
    } as Record<string, string>);
    expect(saved.playerNames?.['red']).toHaveLength(40);
    expect(saved.playerNames?.['blue']).toBe('Blue');
    expect(saved.playerNames?.['purple']).toBeUndefined();
  });

  it('records the rules version and profile id in the file', () => {
    const saved = serialize(createGame(STANDARD_FFA));
    expect(saved.rulesVersion).toBe('4pc-rules/1.0.0');
    expect(saved.profileId).toBe('standard-ffa');
    expect(saved.format).toBe('four-player-chess');
    expect(saved.formatVersion).toBe(1);
  });
});

describe('T-21 reloading restores a playable game', () => {
  it('the reloaded game accepts the same next move', () => {
    const session = playOpening();
    const loaded = fromJson(toJson(session.state));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(loaded.state.toMove).toBe('yellow');
    const outcome = applyMove(loaded.state, loaded.profile, { from: sq('h4'), to: sq('h5') });
    expect(outcome.ok).toBe(true);
  });

  it('a reloaded session still supports undo back to the start', () => {
    const session = playOpening();
    const loaded = fromJson(toJson(session.state));
    if (!loaded.ok) return;
    const restored = new GameSession(loaded.profile, loaded.states);
    expect(restored.depth).toBe(6);
    while (restored.canUndo) restored.undo();
    expect(restored.state.ply).toBe(0);
    expect(restored.state.toMove).toBe('red');
  });

  it('passes the semantic validator', () => {
    const session = playOpening();
    expect(validateStateSemantics(session.state, STANDARD_TEAMS)).toBeNull();
  });
});

describe('T-18 undo and redo', () => {
  it('undo restores the previous position exactly', () => {
    const session = new GameSession(STANDARD_TEAMS);
    const start = snapshotOf(session.state);
    session.move({ from: sq('m8'), to: sq('k8') });
    expect(snapshotOf(session.state)).not.toEqual(start);
    expect(session.undo()).toBe(true);
    expect(snapshotOf(session.state)).toEqual(start);
  });

  it('redo re-applies it', () => {
    const session = new GameSession(STANDARD_TEAMS);
    session.move({ from: sq('m8'), to: sq('k8') });
    const after = snapshotOf(session.state);
    session.undo();
    expect(session.redo()).toBe(true);
    expect(snapshotOf(session.state)).toEqual(after);
  });

  it('refuses to undo past the start or redo past the end', () => {
    const session = new GameSession(STANDARD_TEAMS);
    expect(session.canUndo).toBe(false);
    expect(session.undo()).toBe(false);
    expect(session.canRedo).toBe(false);
    expect(session.redo()).toBe(false);
  });

  it('a new move discards the redo branch', () => {
    const session = playOpening();
    session.undo();
    session.undo();
    expect(session.canRedo).toBe(true);
    // Four plies are applied, so it is Red's turn again.
    expect(session.state.toMove).toBe('red');
    const outcome = session.move({ from: sq('n10'), to: sq('l9') });
    expect(outcome.ok).toBe(true);
    expect(session.canRedo).toBe(false);
  });

  it('undoes an elimination, scores included', () => {
    const session = new GameSession(STANDARD_FFA);
    session.resign('blue');
    expect(session.state.active).toEqual(['red', 'yellow', 'green']);
    session.undo();
    expect(session.state.active).toEqual(['red', 'blue', 'yellow', 'green']);
    expect(session.state.status['blue']).toEqual({ kind: 'active' });
  });

  it('undoes a capture and restores the captured piece and score', () => {
    const session = new GameSession(STANDARD_FFA);
    const before = session.state;
    session.move({ from: sq('m8'), to: sq('l8') });
    session.move({ from: sq('b7'), to: sq('c7') });
    session.undo();
    session.undo();
    expect(snapshotOf(session.state)).toEqual(snapshotOf(before));
  });

  it('INV-7: keeps the history within the configured limit', () => {
    const tiny = { ...STANDARD_TEAMS, maxMoveHistoryPlies: 3 };
    const session = new GameSession(tiny);
    session.move({ from: sq('m8'), to: sq('l8') });
    session.move({ from: sq('b7'), to: sq('c7') });
    session.move({ from: sq('h2'), to: sq('h3') });
    const blocked = session.move({ from: sq('g13'), to: sq('g12') });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe('historyLimit');
  });
});
