/**
 * Online-play dialog: host a room or join one by code. Unlike the other
 * dialogs in dialogs.ts, this one stays open across asynchronous state changes
 * (waiting for a connection, players joining), so it is not a one-shot promise.
 */

import { COLOR_NAMES, type PlayerColor } from '../engine/pieces.js';
import { escapeText } from './accessibility.js';

export interface OnlineDialogCallbacks {
  readonly onHost: () => void;
  readonly onJoin: (roomCode: string) => void;
  readonly onLeave: () => void;
  readonly onClose: () => void;
}

export class OnlineDialog {
  #dialog: HTMLDialogElement;
  #intro: HTMLDivElement;
  #status: HTMLDivElement;
  #callbacks: OnlineDialogCallbacks | null = null;
  #open = false;

  constructor() {
    this.#dialog = document.createElement('dialog');
    this.#dialog.className = 'dialog online-dialog';
    this.#dialog.setAttribute('aria-labelledby', 'online-title');
    document.body.appendChild(this.#dialog);

    const title = document.createElement('h2');
    title.id = 'online-title';
    title.textContent = 'Play online';

    this.#intro = document.createElement('div');
    this.#status = document.createElement('div');
    this.#status.className = 'online-status';
    this.#status.setAttribute('role', 'status');

    this.#dialog.append(title, this.#intro, this.#status);
    this.#dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.#close();
    });
  }

  /** Shows the initial host-or-join choice. */
  open(callbacks: OnlineDialogCallbacks): void {
    this.#callbacks = callbacks;
    this.#renderChoice();
    this.#status.replaceChildren();
    if (typeof this.#dialog.showModal === 'function') this.#dialog.showModal();
    else this.#dialog.setAttribute('open', '');
    this.#open = true;
  }

  #renderChoice(): void {
    this.#intro.replaceChildren();

    const help = document.createElement('p');
    help.textContent =
      'Four people, four computers, one game. One player hosts and shares a room code; the other three join with it. Moves travel directly between browsers.';

    const hostButton = document.createElement('button');
    hostButton.type = 'button';
    hostButton.className = 'primary';
    hostButton.textContent = 'Host a game';
    hostButton.addEventListener('click', () => this.#callbacks?.onHost());

    const joinRow = document.createElement('div');
    joinRow.className = 'online-join-row';

    const label = document.createElement('label');
    label.className = 'sr-only';
    label.htmlFor = 'room-code-input';
    label.textContent = 'Room code';

    const input = document.createElement('input');
    input.id = 'room-code-input';
    input.type = 'text';
    input.placeholder = 'Room code';
    input.autocapitalize = 'characters';
    input.maxLength = 6;
    input.className = 'room-code-input';

    const joinButton = document.createElement('button');
    joinButton.type = 'button';
    joinButton.className = 'secondary';
    joinButton.textContent = 'Join a game';
    joinButton.addEventListener('click', () => {
      const code = input.value.trim();
      if (code) this.#callbacks?.onJoin(code);
    });

    joinRow.append(label, input, joinButton);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'secondary';
    closeButton.textContent = 'Cancel';
    closeButton.addEventListener('click', () => this.#close());

    this.#intro.append(help, hostButton, joinRow, closeButton);
  }

  /** Host is waiting for PeerJS to open before the room code is known. */
  showConnecting(): void {
    this.#setStatus('Connecting…');
  }

  showHosting(roomCode: string, joinUrl: string): void {
    this.#status.replaceChildren();

    const codeBlock = document.createElement('p');
    codeBlock.className = 'room-code-display';
    codeBlock.textContent = roomCode;

    const help = document.createElement('p');
    help.textContent = 'Share this code, or this link, with the other three players:';

    const link = document.createElement('input');
    link.type = 'text';
    link.readOnly = true;
    link.className = 'room-link-input';
    link.value = joinUrl;
    link.addEventListener('focus', () => link.select());

    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'danger';
    leave.textContent = 'Close room';
    leave.addEventListener('click', () => this.#callbacks?.onLeave());

    this.#status.append(help, codeBlock, link, this.#rosterList(), leave);
  }

  showJoined(myColor: PlayerColor): void {
    this.#status.replaceChildren();

    const confirmed = document.createElement('p');
    confirmed.textContent = `Connected. You are playing ${COLOR_NAMES[myColor]}.`;

    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'danger';
    leave.textContent = 'Leave game';
    leave.addEventListener('click', () => this.#callbacks?.onLeave());

    this.#status.append(confirmed, this.#rosterList(), leave);
    this.#close();
  }

  updateRoster(colors: readonly PlayerColor[]): void {
    const existing = this.#status.querySelector('.online-roster');
    existing?.replaceWith(this.#rosterList(colors));
  }

  #rosterList(colors: readonly PlayerColor[] = []): HTMLUListElement {
    const list = document.createElement('ul');
    list.className = 'online-roster';
    for (const color of colors) {
      const item = document.createElement('li');
      item.textContent = `${COLOR_NAMES[color]} connected`;
      list.appendChild(item);
    }
    return list;
  }

  showError(message: string): void {
    this.#setStatus(message, true);
  }

  #setStatus(message: string, isError = false): void {
    this.#status.replaceChildren();
    const p = document.createElement('p');
    if (isError) p.classList.add('online-error');
    p.textContent = escapeText(message);
    this.#status.appendChild(p);
  }

  /** Closes the dialog element without notifying the caller (already leaving). */
  hide(): void {
    if (!this.#open) return;
    this.#open = false;
    if (typeof this.#dialog.close === 'function') this.#dialog.close();
    else this.#dialog.removeAttribute('open');
  }

  #close(): void {
    this.hide();
    this.#callbacks?.onClose();
  }
}
