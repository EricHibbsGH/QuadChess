/**
 * Move history as a real ordered list, readable and navigable without the board.
 *
 * One list item per round, with one span per ply, so a screen reader can walk
 * the game in the same shape a printed score sheet has.
 */

import { COLOR_NAMES, COLOR_TAGS, type PlayerColor } from '../engine/pieces.js';
import { roundOfPly } from '../engine/turnOrder.js';
import type { GameState, HistoryEntry } from '../engine/gameState.js';
import type { RulesProfile } from '../rules/types.js';
import { escapeText } from './accessibility.js';

export class MoveList {
  #root: HTMLElement;
  #list: HTMLOListElement;
  #empty: HTMLParagraphElement;
  #rendered = 0;

  constructor(root: HTMLElement) {
    this.#root = root;

    this.#empty = document.createElement('p');
    this.#empty.className = 'move-list-empty';
    this.#empty.textContent = 'No moves yet.';

    this.#list = document.createElement('ol');
    this.#list.className = 'move-list';
    this.#list.setAttribute('aria-label', 'Move history, one item per round');

    this.#root.append(this.#empty, this.#list);
  }

  render(state: GameState, profile: RulesProfile): void {
    // Undo rewinds history, so rebuild whenever the length shrinks.
    if (state.history.length < this.#rendered) {
      this.#list.replaceChildren();
      this.#rendered = 0;
    }

    this.#empty.hidden = state.history.length > 0;
    this.#list.hidden = state.history.length === 0;

    for (let i = this.#rendered; i < state.history.length; i += 1) {
      const entry = state.history[i];
      if (entry) this.#append(entry, profile);
    }
    this.#rendered = state.history.length;

    const last = this.#list.lastElementChild;
    if (last) last.scrollIntoView({ block: 'nearest' });
  }

  #append(entry: HistoryEntry, profile: RulesProfile): void {
    const round = roundOfPly(profile, entry.ply);
    let item = this.#list.lastElementChild as HTMLLIElement | null;

    if (!item || item.dataset['round'] !== String(round)) {
      item = document.createElement('li');
      item.className = 'move-round';
      item.dataset['round'] = String(round);
      item.value = round;
      this.#list.appendChild(item);
    }

    const ply = document.createElement('span');
    ply.className = 'move-ply';
    ply.dataset['owner'] = entry.color;
    ply.textContent = `${COLOR_TAGS[entry.color]}:${escapeText(entry.text)}`;
    ply.setAttribute('aria-label', this.#describe(entry));
    item.appendChild(ply);
  }

  #describe(entry: HistoryEntry): string {
    const who = COLOR_NAMES[entry.color as PlayerColor];
    if (entry.kind === 'move') {
      return `${who} played ${entry.text}`;
    }
    return `${who} ${entry.kind === 'resign' ? 'resigned' : 'lost on time'}`;
  }

  clear(): void {
    this.#list.replaceChildren();
    this.#rendered = 0;
    this.#empty.hidden = false;
    this.#list.hidden = true;
  }
}
