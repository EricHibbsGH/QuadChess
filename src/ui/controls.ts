/**
 * Toolbar controls. Pure DOM wiring: every button calls back into the
 * composition root, which owns all game logic.
 */

import { PROFILES } from '../rules/index.js';
import type { RulesProfile } from '../rules/types.js';
import type { Seat } from '../engine/coordinates.js';

export interface ControlCallbacks {
  readonly onNewGame: () => void;
  readonly onProfileChange: (profileId: string) => void;
  readonly onRotate: () => void;
  readonly onToggleSound: (enabled: boolean) => void;
  readonly onToggleCoordinates: (enabled: boolean) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onResign: () => void;
  readonly onDraw: () => void;
  readonly onTransfer: () => void;
}

export interface ControlsModel {
  readonly profile: RulesProfile;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly finished: boolean;
  readonly sound: boolean;
  readonly showCoordinates: boolean;
  readonly viewSeat: Seat;
  readonly orientationLabel: string;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

export class Controls {
  #profileSelect: HTMLSelectElement;
  #undo: HTMLButtonElement;
  #redo: HTMLButtonElement;
  #resign: HTMLButtonElement;
  #draw: HTMLButtonElement;
  #rotate: HTMLButtonElement;
  #sound: HTMLButtonElement;
  #coords: HTMLButtonElement;

  constructor(root: HTMLElement, callbacks: ControlCallbacks) {
    const bar = document.createElement('div');
    bar.className = 'controls';

    // --- game group ---
    const gameGroup = document.createElement('div');
    gameGroup.className = 'control-group';
    gameGroup.setAttribute('role', 'group');
    gameGroup.setAttribute('aria-label', 'Game');

    const profileLabel = document.createElement('label');
    profileLabel.className = 'control-label';
    profileLabel.htmlFor = 'profile-select';
    profileLabel.textContent = 'Rules';

    this.#profileSelect = document.createElement('select');
    this.#profileSelect.id = 'profile-select';
    this.#profileSelect.className = 'profile-select';
    for (const profile of PROFILES) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.label;
      this.#profileSelect.appendChild(option);
    }
    this.#profileSelect.addEventListener('change', () => {
      callbacks.onProfileChange(this.#profileSelect.value);
    });

    gameGroup.append(profileLabel, this.#profileSelect, button('New game', 'primary', callbacks.onNewGame));

    // --- move group ---
    const moveGroup = document.createElement('div');
    moveGroup.className = 'control-group';
    moveGroup.setAttribute('role', 'group');
    moveGroup.setAttribute('aria-label', 'Moves');

    this.#undo = button('Undo', 'secondary', callbacks.onUndo);
    this.#redo = button('Redo', 'secondary', callbacks.onRedo);
    this.#resign = button('Resign', 'danger', callbacks.onResign);
    this.#draw = button('Offer draw', 'secondary', callbacks.onDraw);
    moveGroup.append(this.#undo, this.#redo, this.#resign, this.#draw);

    // --- view group ---
    const viewGroup = document.createElement('div');
    viewGroup.className = 'control-group';
    viewGroup.setAttribute('role', 'group');
    viewGroup.setAttribute('aria-label', 'View');

    this.#rotate = button('Rotate board', 'secondary', callbacks.onRotate);
    this.#sound = button('Sound', 'secondary toggle', () => {
      const next = this.#sound.getAttribute('aria-pressed') !== 'true';
      callbacks.onToggleSound(next);
    });
    this.#coords = button('Coordinates', 'secondary toggle', () => {
      const next = this.#coords.getAttribute('aria-pressed') !== 'true';
      callbacks.onToggleCoordinates(next);
    });
    viewGroup.append(this.#rotate, this.#sound, this.#coords, button('Save / load', 'secondary', callbacks.onTransfer));

    bar.append(gameGroup, moveGroup, viewGroup);
    root.appendChild(bar);
  }

  render(model: ControlsModel): void {
    this.#profileSelect.value = model.profile.id;
    this.#undo.disabled = !model.canUndo;
    this.#redo.disabled = !model.canRedo;
    this.#resign.disabled = model.finished;
    this.#draw.disabled = model.finished;

    this.#sound.setAttribute('aria-pressed', model.sound ? 'true' : 'false');
    this.#sound.textContent = model.sound ? 'Sound on' : 'Sound off';

    this.#coords.setAttribute('aria-pressed', model.showCoordinates ? 'true' : 'false');
    this.#coords.textContent = model.showCoordinates ? 'Coordinates on' : 'Coordinates off';

    this.#rotate.setAttribute('aria-label', `Rotate board. Currently ${model.orientationLabel}`);
    this.#rotate.title = model.orientationLabel;
  }
}
