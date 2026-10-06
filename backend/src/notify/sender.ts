import type { SendResult } from "@pakka/types";

// The WhatsApp adapter (module 1, Dev 1) plugs in here. notify.send asks the factory for a sender
// bound to one tenant's connection, and never sees the token. Until a factory is registered, sends
// answer not_available before any credits are spent.

export interface MessageSender {
  sendText(to: string, text: string): Promise<SendResult>;
  sendTemplate(to: string, name: string, language: string, params: string[]): Promise<SendResult>;
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
