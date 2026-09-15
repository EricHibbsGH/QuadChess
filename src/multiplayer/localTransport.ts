/**
 * Pass-and-play transport: four people, one device, one tab.
 *
 * An intent is handed straight back to the subscribers. It is asynchronous only
 * so that the interface matches what a networked transport would need.
 */

import type { IntentHandler, MoveIntent, Transport } from './transport.js';

export class LocalTransport implements Transport {
  readonly kind = 'local';
  readonly isLocal = true;

  #handlers = new Set<IntentHandler>();
  #closed = false;

  async send(intent: MoveIntent): Promise<void> {
    if (this.#closed) return;
    for (const handler of [...this.#handlers]) {
      handler(intent);
    }
  }

  onRemote(handler: IntentHandler): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  close(): void {
    this.#closed = true;
    this.#handlers.clear();
  }
}
