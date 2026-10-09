"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { WHATSAPP_TEXT_MAX } from "@pakka/types";
import { replyFailure, sendStaffReply, type ReplyFailure } from "./staff-reply";

// The reply box under an open chat while its 24-hour window is open (the closed-window strip stays in
// chat-view.tsx). Sends through the API, never optimistically: the message appears in the chat when
// realtime delivers the stored row. The draft is kept on any failure. Enter sends, Shift+Enter adds a line.
// Mounted with key={conversation.id}, so a draft never moves to another chat.

export function ReplyComposer({ tenantId, conversationId }: { tenantId: string; conversationId: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<ReplyFailure | null>(null);
  // A ref, not state: two quick Enter presses must not both pass the check before a re-render.
  const inFlight = useRef(false);
  const errorId = useId();
  const body = text.trim();

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (inFlight.current || body === "" || body.length > WHATSAPP_TEXT_MAX) return;
    inFlight.current = true;
    setSending(true);
    setFailure(null);
    try {
      await sendStaffReply(tenantId, conversationId, body);
      setText("");
    } catch (err) {
      setFailure(replyFailure(err));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  const tooLong = body.length > WHATSAPP_TEXT_MAX;
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
        <textarea
          className="input"
          aria-label="Message"
          aria-describedby={failure ? errorId : undefined}
          aria-invalid={failure || tooLong ? true : undefined}
          placeholder="Write a reply"
          rows={1}
          value={text}
          readOnly={sending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          style={{ flex: "1", minWidth: "0", minHeight: "44px", maxHeight: "140px", fontSize: "15px", resize: "none", fieldSizing: "content" } as React.CSSProperties}
        />
        <button
          type="submit"
          aria-label={sending ? "Sending" : "Send"}
          disabled={sending || body === "" || tooLong}
          style={{ width: "44px", height: "44px", flex: "none", background: "var(--wa-dark)", color: "#fff", border: "0", display: "grid", placeItems: "center", cursor: sending ? "progress" : "pointer", opacity: sending || body === "" || tooLong ? 0.4 : 1 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" style={{ strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </div>
      {tooLong ? (
        <div role="status" style={{ fontSize: "13px", fontWeight: "700" }}>
          Keep it under {WHATSAPP_TEXT_MAX} characters.
        </div>
      ) : null}
      {failure ? (
        <div id={errorId} role="alert" style={{ fontSize: "13px", padding: "8px 10px", background: "var(--color-surface)" }}>
          <strong>{failure.maybeSent ? "Couldn’t confirm it was sent." : "Not sent."}</strong> {failure.message}
          {failure.maybeSent ? " Check the chat before sending it again." : " Your message is still here."}
        </div>
      ) : null}
    </form>
  );
}
