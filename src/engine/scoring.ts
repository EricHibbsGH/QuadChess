/**
 * Scoring (rules.md §12.1).
 *
 * Every value is profile data. All totals are finite integers (INV-5); the
 * helpers here refuse to introduce anything else.
 */

import type { PieceType, PlayerColor } from './pieces.js';
import type { CaptureInfo } from './movement.js';
import type { RulesProfile } from '../rules/types.js';

export type ScoreTable = Readonly<Record<PlayerColor, number>>;

export function emptyScores(profile: RulesProfile): ScoreTable {
  const out: Partial<Record<PlayerColor, number>> = {};
  for (const color of profile.turnOrder) out[color] = 0;
  return out as ScoreTable;
}

function safeInteger(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

export function addScore(scores: ScoreTable, color: PlayerColor, points: number): ScoreTable {
  const delta = safeInteger(points);
  if (delta === 0) return scores;
  return { ...scores, [color]: safeInteger((scores[color] ?? 0) + delta) };
}

/** Points earned for a capture, honouring the dead-piece setting. */
export function captureValue(profile: RulesProfile, capture: CaptureInfo | null): number {
  if (!profile.scoringEnabled || capture === null) return 0;
  if (capture.dead && profile.deadPieceCaptureValue === 'zero') return 0;
  return safeInteger(profile.pieceValues[capture.type] ?? 0);
}

export function pieceValue(profile: RulesProfile, type: PieceType): number {
  return safeInteger(profile.pieceValues[type] ?? 0);
}

export function teamScores(profile: RulesProfile, scores: ScoreTable): readonly number[] {
  if (profile.teams === null) return [];
  return profile.teams.map((team) =>
    safeInteger(team.reduce((total, color) => total + (scores[color] ?? 0), 0)),
  );
}

export interface Ranking {
  readonly color: PlayerColor;
  readonly score: number;
  readonly rank: number;
}

/** Descending by score; equal scores share a rank. */
export function rankPlayers(profile: RulesProfile, scores: ScoreTable): readonly Ranking[] {
  const rows = profile.turnOrder
    .map((color) => ({ color, score: safeInteger(scores[color] ?? 0) }))
    .sort((a, b) => b.score - a.score);

  const out: Ranking[] = [];
  let rank = 0;
  let previous: number | null = null;
  rows.forEach((row, index) => {
    if (previous === null || row.score !== previous) rank = index + 1;
    previous = row.score;
    out.push({ ...row, rank });
  });
  return out;
}

export function leaders(profile: RulesProfile, scores: ScoreTable): readonly PlayerColor[] {
  const ranked = rankPlayers(profile, scores);
  return ranked.filter((row) => row.rank === 1).map((row) => row.color);
}
