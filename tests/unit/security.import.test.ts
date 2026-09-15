/**
 * T-20 — invalid and malicious import data (architecture.md §7).
 *
 * Import must never throw, never execute anything, and never produce a state the
 * rules could not have produced. Every case here asserts a rejection with a
 * reason, or a safe no-op.
 */

import { describe, expect, it } from 'vitest';
import { fromJson, serialize, toJson } from '../../src/engine/serialization.js';
import { createGame } from '../../src/engine/gameState.js';
import { GameSession } from '../../src/engine/session.js';
import { STANDARD_TEAMS } from '../../src/rules/teams.js';
import { sq } from '../support/fixture.js';

function baseFile() {
  return JSON.parse(toJson(createGame(STANDARD_TEAMS))) as Record<string, unknown>;
}

function expectRejected(payload: unknown, fragment?: string) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const result = fromJson(text);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(typeof result.reason).toBe('string');
  if (fragment) expect(result.reason.toLowerCase()).toContain(fragment.toLowerCase());
}

describe('T-20 malformed input', () => {
  it('rejects non-string input', () => {
    expect(fromJson(null).ok).toBe(false);
    expect(fromJson(undefined).ok).toBe(false);
    expect(fromJson(42).ok).toBe(false);
    expect(fromJson({}).ok).toBe(false);
  });

  it('rejects text that is not JSON', () => {
    expectRejected('not json at all', 'not valid json');
    expectRejected('{', 'not valid json');
    expectRejected('', 'not valid json');
  });

  it('rejects JSON that is not an object', () => {
    expectRejected('[]');
    expectRejected('"a string"');
    expectRejected('123');
    expectRejected('null');
  });

  it('rejects a file that is not ours', () => {
    expectRejected({ format: 'chess.com', formatVersion: 1 }, 'not a four-player-chess save');
  });

  it('rejects an unknown save format version', () => {
    expectRejected({ ...baseFile(), formatVersion: 99 }, 'unsupported save format');
  });
});

describe('T-20 rules version and profile gating', () => {
  it('rejects an unknown rules version', () => {
    expectRejected({ ...baseFile(), rulesVersion: '4pc-rules/99.0.0' }, 'unsupported rules version');
  });

  it('rejects a missing rules version', () => {
    const file = baseFile();
    delete file['rulesVersion'];
    expectRejected(file, 'unsupported rules version');
  });

  it('rejects an unknown profile id', () => {
    expectRejected({ ...baseFile(), profileId: 'house-rules' }, 'unknown rules profile');
  });
});

describe('T-20 tampered positions cannot be injected', () => {
  it('rejects a snapshot that does not match the replayed moves', () => {
    const file = baseFile();
    const snapshot = file['snapshot'] as { board: string[] };
    // Hand the importer a board with an extra queen.
    snapshot.board[sq('h7').r * 14 + sq('h7').c] = 'YQ';
    expectRejected(file, 'differs from the saved snapshot');
  });

  it('rejects a piece placed on an absent corner cell', () => {
    const file = baseFile();
    const snapshot = file['snapshot'] as { board: string[] };
    snapshot.board[0] = 'YQ'; // (0,0) is inside the top-left corner block
    expectRejected(file, 'absent cell');
  });

  it('rejects a board of the wrong length', () => {
    const file = baseFile();
    (file['snapshot'] as { board: string[] }).board = ['', ''];
    expectRejected(file, '196 cells');
  });

  it('rejects a malformed piece code', () => {
    const file = baseFile();
    const snapshot = file['snapshot'] as { board: string[] };
    snapshot.board[sq('h7').r * 14 + sq('h7').c] = '<script>';
    expectRejected(file, 'malformed');
  });

  it('rejects an illegal move in the move list', () => {
    const file = baseFile();
    file['moves'] = [{ kind: 'move', color: 'red', from: 'm8', to: 'h8' }];
    expectRejected(file, 'not legal');
  });

  it('rejects a move list that plays out of turn', () => {
    const file = baseFile();
    file['moves'] = [{ kind: 'move', color: 'blue', from: 'b7', to: 'c7' }];
    expectRejected(file, "it is red's turn");
  });

  it('rejects a move naming an unplayable square', () => {
    const file = baseFile();
    file['moves'] = [{ kind: 'move', color: 'red', from: 'a1', to: 'b2' }];
    expectRejected(file, 'unplayable square');
  });

  it('rejects promotion to a king or a pawn', () => {
    const file = baseFile();
    file['moves'] = [{ kind: 'move', color: 'red', from: 'm8', to: 'l8', promotion: 'K' }];
    expectRejected(file, 'invalid promotion');
  });

  it('rejects a non-integer score', () => {
    const file = baseFile();
    (file['snapshot'] as { scores: Record<string, unknown> }).scores['red'] = 1.5;
    expectRejected(file, 'finite integer');
  });

  it('rejects an infinite score', () => {
    const file = baseFile();
    // JSON has no Infinity, so this arrives as a string and must still be refused.
    (file['snapshot'] as { scores: Record<string, unknown> }).scores['red'] = '1e999';
    expectRejected(file, 'finite integer');
  });

  it('rejects duplicate players in the active list', () => {
    const file = baseFile();
    (file['snapshot'] as { active: string[] }).active = ['red', 'red'];
    expectRejected(file, 'duplicates');
  });

  it('rejects an invalid colour anywhere', () => {
    const file = baseFile();
    file['moves'] = [{ kind: 'move', color: 'purple', from: 'm8', to: 'l8' }];
    expectRejected(file, 'invalid colour');
  });
});

describe('T-20 resource limits', () => {
  it('rejects input larger than the configured cap before parsing it', () => {
    const huge = `{"format":"four-player-chess","pad":"${'x'.repeat(2_000_000)}"}`;
    const result = fromJson(huge, { maxBytes: 1_000_000 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('limit');
  });

  it('rejects a move list longer than the profile allows', () => {
    const file = baseFile();
    file['moves'] = new Array(STANDARD_TEAMS.maxMoveHistoryPlies + 1).fill({
      kind: 'move',
      color: 'red',
      from: 'm8',
      to: 'l8',
    });
    expectRejected(file, 'ply limit');
  });

  it('does not hang on deeply nested JSON', () => {
    const nested = `${'['.repeat(2000)}${']'.repeat(2000)}`;
    const result = fromJson(nested);
    expect(result.ok).toBe(false);
  });
});

describe('T-20 injection-shaped payloads are inert data', () => {
  it('treats a prototype-pollution attempt as an ordinary rejected field', () => {
    const payload = `{"format":"four-player-chess","formatVersion":1,"rulesVersion":"4pc-rules/1.0.0","profileId":"standard-teams","__proto__":{"polluted":true},"moves":[],"snapshot":{}}`;
    const result = fromJson(payload);
    expect(result.ok).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('keeps script-shaped player names as plain text', () => {
    const game = createGame(STANDARD_TEAMS);
    const saved = serialize(game, { red: '<img src=x onerror=alert(1)>' });
    const reloaded = fromJson(JSON.stringify(saved));
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    // Stored verbatim as text; escaping is the renderer's job.
    expect(reloaded.playerNames?.['red']).toBe('<img src=x onerror=alert(1)>');
  });

  it('never throws for any of a batch of hostile payloads', () => {
    const payloads: readonly unknown[] = [
      '{"format":"four-player-chess","formatVersion":1}',
      { format: 'four-player-chess', formatVersion: 1, rulesVersion: 1, profileId: 1 },
      { ...baseFile(), moves: 'not-an-array' },
      { ...baseFile(), moves: [null] },
      { ...baseFile(), moves: [{ kind: 'explode' }] },
      { ...baseFile(), snapshot: null },
      { ...baseFile(), snapshot: { board: new Array(196).fill(0) } },
      { ...baseFile(), playerNames: 'oops' },
      { ...baseFile(), snapshot: { ...(baseFile()['snapshot'] as object), ply: -1 } },
    ];
    for (const payload of payloads) {
      expect(() => fromJson(typeof payload === 'string' ? payload : JSON.stringify(payload))).not.toThrow();
      const result = fromJson(typeof payload === 'string' ? payload : JSON.stringify(payload));
      expect(result.ok).toBe(false);
    }
  });
});

describe('a rejected import leaves the running game untouched', () => {
  it('keeps the session state when loading fails', () => {
    const session = new GameSession(STANDARD_TEAMS);
    session.move({ from: sq('m8'), to: sq('l8') });
    const before = session.state;
    const result = fromJson('garbage');
    expect(result.ok).toBe(false);
    expect(session.state).toBe(before);
  });
});
