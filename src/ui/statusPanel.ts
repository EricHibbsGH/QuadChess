/**
 * Status panel: whose turn it is, per-player state, scores, captured pieces and
 * the result banner.
 *
 * Every player row carries a colour swatch, a tag letter and a pattern class, so
 * ownership is never conveyed by hue alone.
 */

import { COLOR_NAMES, COLOR_TAGS, type PieceType, type PlayerColor } from '../engine/pieces.js';
import { teamIndexOf, type RulesProfile } from '../rules/types.js';
import { teamTotals } from '../engine/elimination.js';
import type { GameState } from '../engine/gameState.js';
import { PIECE_GLYPHS } from './pieceSprites.js';
import { describeResult, escapeText } from './accessibility.js';

export interface StatusModel {
  readonly state: GameState;
  readonly profile: RulesProfile;
  readonly checked: readonly PlayerColor[];
  readonly playerNames: Readonly<Partial<Record<PlayerColor, string>>>;
}

interface PlayerRow {
  readonly root: HTMLLIElement;
  readonly name: HTMLSpanElement;
  readonly status: HTMLSpanElement;
  readonly score: HTMLSpanElement;
  readonly captures: HTMLSpanElement;
}

export class StatusPanel {
  #root: HTMLElement;
  #turn: HTMLParagraphElement;
  #list: HTMLUListElement;
  #teams: HTMLParagraphElement;
  #banner: HTMLDivElement;
  #rows = new Map<PlayerColor, PlayerRow>();

  constructor(root: HTMLElement, profile: RulesProfile) {
    this.#root = root;

    this.#turn = document.createElement('p');
    this.#turn.className = 'turn-indicator';
    this.#turn.id = 'turn-indicator';

    this.#list = document.createElement('ul');
    this.#list.className = 'player-list';
    this.#list.setAttribute('aria-label', 'Players');

    this.#teams = document.createElement('p');
    this.#teams.className = 'team-totals';

    this.#banner = document.createElement('div');
    this.#banner.className = 'result-banner';
    this.#banner.hidden = true;
    this.#banner.setAttribute('role', 'status');

    this.#root.append(this.#turn, this.#list, this.#teams, this.#banner);
    this.#buildRows(profile);
  }

  #buildRows(profile: RulesProfile): void {
    this.#list.replaceChildren();
    this.#rows.clear();

    for (const color of profile.turnOrder) {
      const item = document.createElement('li');
      item.className = 'player-row';
      item.dataset['owner'] = color;

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.textContent = COLOR_TAGS[color];

      const name = document.createElement('span');
      name.className = 'player-name';

      const status = document.createElement('span');
      status.className = 'player-status';

      const score = document.createElement('span');
      score.className = 'player-score';

      const captures = document.createElement('span');
      captures.className = 'player-captures';

      item.append(swatch, name, status, score, captures);
      this.#list.appendChild(item);
      this.#rows.set(color, { root: item, name, status, score, captures });
    }
  }

  /** Called when the rules profile changes, since the team layout changes with it. */
  rebuild(profile: RulesProfile): void {
    this.#buildRows(profile);
  }

  render(model: StatusModel): void {
    const { state, profile } = model;
    const checked = new Set(model.checked);

    const turnName = model.playerNames[state.toMove] ?? COLOR_NAMES[state.toMove];
    this.#turn.textContent = state.result
      ? 'Game over'
      : `${escapeText(turnName)} to move${checked.has(state.toMove) ? ' — in check' : ''}`;
    this.#turn.dataset['owner'] = state.toMove;

    for (const color of profile.turnOrder) {
      const row = this.#rows.get(color);
      if (!row) continue;

      const status = state.status[color];
      const isActive = status?.kind === 'active';
      const isToMove = !state.result && state.toMove === color;

      row.root.classList.toggle('is-to-move', isToMove);
      row.root.classList.toggle('is-eliminated', !isActive);
      row.root.classList.toggle('is-checked', checked.has(color));

      const label = model.playerNames[color] ?? COLOR_NAMES[color];
      const team = profile.teams === null ? '' : ` · Team ${teamIndexOf(profile, color) + 1}`;
      row.name.textContent = `${escapeText(label)}${team}`;

      row.status.textContent = !isActive
        ? `out (${status?.kind === 'eliminated' ? status.by : 'eliminated'})`
        : checked.has(color)
          ? 'in check'
          : isToMove
            ? 'to move'
            : 'waiting';

      row.score.textContent = profile.scoringEnabled ? `${state.scores[color] ?? 0} pts` : '';
      row.score.hidden = !profile.scoringEnabled;

      const captured = state.captured[color] ?? [];
      row.captures.textContent = captured.map((type: PieceType) => PIECE_GLYPHS[type]).join('');
      row.captures.setAttribute(
        'aria-label',
        captured.length === 0 ? 'no captures' : `captured ${captured.length} pieces`,
      );
    }

    if (profile.teams === null) {
      this.#teams.textContent = '';
      this.#teams.hidden = true;
    } else {
      this.#teams.hidden = false;
      const totals = teamTotals(profile, state.scores);
      this.#teams.textContent = profile.scoringEnabled
        ? profile.teams.map((team, i) => `Team ${i + 1} (${team.join(' + ')}): ${totals[i] ?? 0}`).join(' • ')
        : profile.teams.map((team, i) => `Team ${i + 1}: ${team.join(' + ')}`).join(' • ');
    }

    if (state.result) {
      this.#banner.hidden = false;
      this.#banner.textContent = describeResult(state.result);
      this.#banner.dataset['kind'] = state.result.kind;
    } else {
      this.#banner.hidden = true;
      this.#banner.textContent = '';
    }
  }
}
