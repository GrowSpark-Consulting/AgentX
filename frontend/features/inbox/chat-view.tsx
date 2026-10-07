import { Fragment, useEffect, useId, useRef, type CSSProperties } from "react";
import { ErrorState, LoadingState } from "@/components/shared/states";
import type { FormattedError } from "@/lib/errors";
import {
  conversationTag,
  groupByDay,
  handoffReason,
  isWindowOpen,
  lastWrotePhrase,
  type ChatMessage,
  type ConversationSummary,
} from "./data";
import { MessageBubble } from "./message-bubble";

// The open chat, ported from the /dashboard/preview Inbox (components/dashboard/pakka-app.tsx):
// header with the AI / Human control, the status strip, the WhatsApp-style message area with day
// chips, and the composer or the 24-hour-window strip.
//
// Read-only for now. Sending, switching AI/Human and templates are separate work (POST
// /api/conversations/:id/messages and /mode), so those controls are shown switched off and say so.
// Left out on purpose until their data exists: the suggested reply and the lead card.

/** Why the AI / Human switch is off. Shown in the status strip under the header, which the switch's
 *  buttons point to, so keyboard and screen-reader users get it as well as the mouse tooltip. */
const SWITCH_NOTE = "Switching between AI and Human isn’t available yet.";

export type ChatState =
  | { status: "loading" }
  | { status: "error"; error: FormattedError }
  | { status: "ready"; messages: ChatMessage[] };

const strip: CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
  flexWrap: "wrap",
  padding: "9px 14px",
  fontSize: "13px",
  borderBottom: "1px solid var(--color-divider)",
  flex: "none",
};

const segment = (active: boolean, activeBg: string, activeFg: string): CSSProperties => ({
  padding: "6px 12px",
  border: "0",
  background: active ? activeBg : "transparent",
  color: active ? activeFg : "var(--color-text)",
  font: "inherit",
  fontSize: "13px",
  fontWeight: "800",
  cursor: "not-allowed",
});

export function ChatView({
  conversation,
  chat,
  now,
  timeZone,
  onBack,
  onRetry,
}: {
  conversation: ConversationSummary;
  chat: ChatState;
  now: Date;
  timeZone: string;
  onBack: () => void;
  onRetry: () => void;
}) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const switchNoteId = useId();
  const messages = chat.status === "ready" ? chat.messages : null;
  const tag = conversationTag(conversation);
  const humanReplying = conversation.mode === "human" || conversation.mode === "external";
  const windowOpen = isWindowOpen(conversation.lastCustomerMsgAt, now);

  // Keep the newest message in view, as the prototype does.
  const lastId = messages?.[messages.length - 1]?.id;
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.id, lastId]);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderBottom: "2px solid var(--color-divider)", flex: "none" }}>
        <button type="button" className="btn btn-icon app-inbox-back" onClick={onBack} aria-label="Back" style={{ width: "36px", height: "36px", marginLeft: "-6px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" style={{ strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" }}>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span aria-hidden="true" style={{ width: "38px", height: "38px", flex: "none", background: "var(--color-neutral-300)", display: "grid", placeItems: "center", fontWeight: "800", fontSize: "13px" }}>
          {conversation.initials}
        </span>
        <div style={{ minWidth: "0", flex: "1", lineHeight: "1.25" }}>
          <h2 style={{ margin: "0", fontWeight: "800", fontSize: "15px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{conversation.name}</h2>
          <div style={{ fontSize: "12px", color: "var(--color-neutral-700)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {conversation.phoneMasked}
            {conversation.language ? ` · ${conversation.language}` : ""}
          </div>
        </div>
        <div role="group" aria-label="Who replies" aria-describedby={switchNoteId} title={SWITCH_NOTE} style={{ display: "flex", border: "2px solid var(--color-text)", flex: "none" }}>
          <button type="button" disabled aria-pressed={conversation.mode === "ai"} aria-describedby={switchNoteId} style={segment(conversation.mode === "ai", "var(--color-text)", "var(--color-bg)")}>
            AI
          </button>
          <button type="button" disabled aria-pressed={humanReplying} aria-describedby={switchNoteId} style={segment(humanReplying, "var(--color-accent)", "#fff")}>
            Human
          </button>
        </div>
      </div>

      {tag === "needs_human" ? (
        <div style={{ ...strip, background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}>
          <span style={{ flex: "1", minWidth: "180px" }}>
            <strong>Needs you:</strong> {handoffReason(conversation.openHandoffs[0]?.trigger)}.{" "}
            <span id={switchNoteId}>{SWITCH_NOTE}</span>
          </span>
        </div>
      ) : null}
      {tag === "human" ? (
        <div style={{ ...strip, background: "var(--color-surface)" }}>
          <span style={{ flex: "1", minWidth: "180px" }}>
            <strong>A team member is replying.</strong> The AI won’t message on this chat.{" "}
            <span id={switchNoteId}>{SWITCH_NOTE}</span>
          </span>
        </div>
      ) : null}
      {tag === "external" ? (
        <div style={{ ...strip, background: "var(--color-surface)" }}>
          <span style={{ flex: "1", minWidth: "180px" }}>
            <strong>A team member is replying from their own number.</strong> The AI won’t message on this chat.{" "}
            <span id={switchNoteId}>{SWITCH_NOTE}</span>
          </span>
        </div>
      ) : null}
      {tag === "ai" ? (
        <div style={{ padding: "8px 14px", fontSize: "13px", color: "var(--color-neutral-700)", borderBottom: "1px solid var(--color-divider)", flex: "none" }}>
          The AI is handling this chat. <span id={switchNoteId}>{SWITCH_NOTE}</span>
        </div>
      ) : null}

      <div
        ref={messagesRef}
        role="log"
        aria-label={`Messages with ${conversation.name}`}
        style={{ flex: "1", minHeight: "0", overflow: "auto", background: "var(--wa-bg)", padding: "16px 14px", display: "flex", flexDirection: "column", gap: "6px" }}
      >
        {chat.status === "loading" ? <LoadingState compact title="Loading messages" /> : null}
        {chat.status === "error" ? <ErrorState compact title="Couldn't load this chat" description={chat.error.message} onRetry={onRetry} /> : null}
        {messages && messages.length === 0 ? (
          <div style={{ alignSelf: "center", fontSize: "12px", background: "var(--wa-sys)", color: "var(--wa-ink)", padding: "5px 10px" }}>No messages in this chat yet.</div>
        ) : null}
        {messages
          ? groupByDay(messages, now, timeZone).map((day) => (
              <Fragment key={day.key}>
                <div style={{ alignSelf: "center", fontSize: "11px", fontWeight: "600", letterSpacing: ".04em", background: "var(--wa-in)", color: "var(--wa-ink)", padding: "4px 10px", opacity: ".85" }}>
                  {day.label}
                </div>
                {day.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} timeZone={timeZone} />
                ))}
              </Fragment>
            ))
          : null}
      </div>

      <div style={{ borderTop: "2px solid var(--color-divider)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px", flex: "none" }}>
        {windowOpen ? (
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              className="input"
              aria-label="Message"
              placeholder="Replying here isn’t switched on yet"
              disabled
              style={{ flex: "1", minWidth: "0", minHeight: "44px", fontSize: "15px" }}
            />
            <button type="button" disabled aria-label="Send" style={{ width: "44px", height: "44px", flex: "none", background: "var(--wa-dark)", color: "#fff", border: "0", display: "grid", placeItems: "center", cursor: "not-allowed", opacity: 0.4 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" style={{ strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", padding: "10px 12px", background: "var(--color-surface)", fontSize: "13px" }}>
            <span style={{ flex: "1", minWidth: "200px" }}>
              <strong>24-hour window closed.</strong>{" "}
              {conversation.lastCustomerMsgAt
                ? `${conversation.firstName} last wrote ${lastWrotePhrase(conversation.lastCustomerMsgAt, now, timeZone)}, so WhatsApp only allows an approved template.`
                : `${conversation.firstName} hasn’t written yet, so WhatsApp only allows an approved template.`}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
