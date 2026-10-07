import type { SendResult } from "@pakka/types";

// The WhatsApp adapter (module 1, Dev 1) plugs in here. notify.send asks the factory for a sender
// bound to one tenant's connection, and never sees the token. Until a factory is registered, sends
// answer not_available before any credits are spent.

// Both methods throw when WhatsApp does not accept the message.
export interface MessageSender {
  sendText(to: string, text: string): Promise<SendResult>;
  sendTemplate(to: string, name: string, language: string, params: string[]): Promise<SendResult>;
}

/**
 * Thrown by sendText when WhatsApp refuses free text because the 24-hour window has closed (Meta
 * error 131047, the adapter's `outside_window`). notify.send then sends the approved template instead.
 */
export class OutsideWindowError extends Error {
  constructor(message = "WhatsApp only allows an approved template outside the 24-hour window.") {
    super(message);
    this.name = "OutsideWindowError";
  }
}

export type SenderFactory = (connection: { tenantId: string; connectionId: string }) => Promise<MessageSender>;

let factory: SenderFactory | undefined;

/** Called once at startup by the WhatsApp adapter; tests pass a fake, or undefined to reset. */
export function registerSender(next: SenderFactory | undefined): void {
  factory = next;
}

export function senderFactory(): SenderFactory | undefined {
  return factory;
}
