/**
 * Modal dialogs (architecture.md §9).
 *
 * Built on the native `<dialog>` element, which gives a focus trap, Escape
 * handling and inert background for free. `window.alert`, `confirm` and
 * `prompt` are never used.
 */

import { PIECE_NAMES, COLOR_NAMES, type PieceType, type PlayerColor } from '../engine/pieces.js';
import { escapeText } from './accessibility.js';
import { createPieceSvg } from './pieceSprites.js';

function makeDialog(className: string): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = `dialog ${className}`;
  document.body.appendChild(dialog);
  return dialog;
}

function show(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    // jsdom and very old browsers: degrade to a visible, non-modal panel.
    dialog.setAttribute('open', '');
  }
}

function close(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

export class Dialogs {
  /**
   * Promotion chooser. Resolves with the chosen piece, or null if the player
   * backed out — in which case the move is simply not made.
   */
  async choosePromotion(color: PlayerColor, options: readonly PieceType[]): Promise<PieceType | null> {
    const dialog = makeDialog('promotion-dialog');
    dialog.setAttribute('aria-labelledby', 'promotion-title');

    const title = document.createElement('h2');
    title.id = 'promotion-title';
    title.textContent = `${COLOR_NAMES[color]}: choose a promotion piece`;

    const row = document.createElement('div');
    row.className = 'promotion-options';

    const form = document.createElement('form');
    form.method = 'dialog';

    return new Promise<PieceType | null>((resolve) => {
      let settled = false;
      const finish = (value: PieceType | null) => {
        if (settled) return;
        settled = true;
        close(dialog);
        dialog.remove();
        resolve(value);
      };

      for (const type of options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'promotion-option';
        button.dataset['owner'] = color;
        button.dataset['piece'] = type;
        button.setAttribute('aria-label', `Promote to ${PIECE_NAMES[type]}`);
        button.appendChild(createPieceSvg(type));
        const label = document.createElement('span');
        label.textContent = PIECE_NAMES[type];
        button.appendChild(label);
        button.addEventListener('click', () => finish(type));
        row.appendChild(button);
      }

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'secondary';
      cancel.textContent = 'Cancel move';
      cancel.addEventListener('click', () => finish(null));

      form.append(row, cancel);
      dialog.append(title, form);
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish(null);
      });

      show(dialog);
      (row.firstElementChild as HTMLElement | null)?.focus();
    });
  }

  /** Confirmation before a destructive action. Resolves true only on confirm. */
  async confirm(options: {
    title: string;
    body: string;
    confirmLabel: string;
    danger?: boolean;
  }): Promise<boolean> {
    const dialog = makeDialog('confirm-dialog');
    dialog.setAttribute('aria-labelledby', 'confirm-title');

    const title = document.createElement('h2');
    title.id = 'confirm-title';
    title.textContent = escapeText(options.title);

    const body = document.createElement('p');
    body.textContent = escapeText(options.body);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        close(dialog);
        dialog.remove();
        resolve(value);
      };

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => finish(false));

      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = options.danger ? 'danger' : 'primary';
      confirm.textContent = escapeText(options.confirmLabel);
      confirm.addEventListener('click', () => finish(true));

      actions.append(cancel, confirm);
      dialog.append(title, body, actions);
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish(false);
      });

      show(dialog);
      cancel.focus();
    });
  }

  /** Plain message, used for results and for reporting a rejected import. */
  async message(title: string, body: string): Promise<void> {
    const dialog = makeDialog('message-dialog');
    dialog.setAttribute('aria-labelledby', 'message-title');

    const heading = document.createElement('h2');
    heading.id = 'message-title';
    heading.textContent = escapeText(title);

    const text = document.createElement('p');
    text.textContent = escapeText(body);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    return new Promise<void>((resolve) => {
      const finish = () => {
        close(dialog);
        dialog.remove();
        resolve();
      };
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'primary';
      ok.textContent = 'Close';
      ok.addEventListener('click', finish);
      actions.appendChild(ok);
      dialog.append(heading, text, actions);
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish();
      });
      show(dialog);
      ok.focus();
    });
  }

  /**
   * Import / export panel. The textarea is pre-filled with the current game;
   * pasting a different game and pressing Load hands the text to the caller.
   */
  async transfer(currentJson: string): Promise<string | null> {
    const dialog = makeDialog('transfer-dialog');
    dialog.setAttribute('aria-labelledby', 'transfer-title');

    const title = document.createElement('h2');
    title.id = 'transfer-title';
    title.textContent = 'Save or load a game';

    const help = document.createElement('p');
    help.textContent =
      'Copy this text to keep a game, or paste a saved game and choose Load. Imported text is validated before anything is applied.';

    const label = document.createElement('label');
    label.className = 'sr-only';
    label.htmlFor = 'transfer-text';
    label.textContent = 'Game data as JSON';

    const area = document.createElement('textarea');
    area.id = 'transfer-text';
    area.className = 'transfer-text';
    area.rows = 12;
    area.spellcheck = false;
    area.value = currentJson;

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        close(dialog);
        dialog.remove();
        resolve(value);
      };

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'secondary';
      cancel.textContent = 'Close';
      cancel.addEventListener('click', () => finish(null));

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'secondary';
      copy.textContent = 'Select all';
      copy.addEventListener('click', () => {
        area.focus();
        area.select();
      });

      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'primary';
      load.textContent = 'Load';
      load.addEventListener('click', () => finish(area.value));

      actions.append(cancel, copy, load);
      dialog.append(title, help, label, area, actions);
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish(null);
      });

      show(dialog);
      area.focus();
    });
  }
}
