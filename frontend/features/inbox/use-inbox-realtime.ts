"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ensureRealtimeAuth, getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  ConversationChangeRow,
  HandoffChangeRow,
  MessageRow,
  toChatMessage,
  type ChatMessage,
} from "./data";
import type { z } from "zod";

/**
 * connecting: subscribing. live: changes arrive. unavailable: not subscribed (no session, the tables
 * aren't in the supabase_realtime publication yet, or the connection dropped and is retrying); the
 * screen still works from its last read and says that updates aren't live.
 */
export type RealtimeState = "connecting" | "live" | "unavailable";

export interface InboxRealtimeHandlers {
  onMessage: (message: ChatMessage) => void;
  onConversation: (row: z.output<typeof ConversationChangeRow>) => void;
  onHandoff: (row: z.output<typeof HandoffChangeRow>) => void;
  /** Re-read everything: after (re)subscribing, an error, or a change we couldn't parse. */
  onResync: () => void;
}

/** At most one resync in this window, so a channel that keeps failing can't flood the database. */
const RESYNC_MIN_GAP_MS = 10_000;
const TABLES = ["messages", "conversations", "handoffs"] as const;

/**
 * One channel per inbox (`inbox:<tenantId>`), never one per conversation. Inserts and updates on
 * messages, conversations and handoffs are filtered to the business; Realtime also applies the
 * member's RLS, so a row from another business never arrives even without the filter.
 */
export function useInboxRealtime(tenantId: string, handlers: InboxRealtimeHandlers): RealtimeState {
  const [state, setState] = useState<RealtimeState>("connecting");
  const lastResyncAt = useRef(0);

  const resync = useEffectEvent(() => {
    const now = Date.now();
    if (now - lastResyncAt.current < RESYNC_MIN_GAP_MS) return;
    lastResyncAt.current = now;
    handlers.onResync();
  });

  const onChange = useEffectEvent((table: (typeof TABLES)[number], row: unknown) => {
    if (table === "messages") {
      const parsed = MessageRow.safeParse(row);
      if (parsed.success && parsed.data.tenant_id === tenantId) handlers.onMessage(toChatMessage(parsed.data));
      else if (!parsed.success) resync();
    } else if (table === "conversations") {
      const parsed = ConversationChangeRow.safeParse(row);
      if (parsed.success && parsed.data.tenant_id === tenantId) handlers.onConversation(parsed.data);
      else if (!parsed.success) resync();
    } else {
      const parsed = HandoffChangeRow.safeParse(row);
      if (parsed.success && parsed.data.tenant_id === tenantId) handlers.onHandoff(parsed.data);
      else if (!parsed.success) resync();
    }
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const topic = `inbox:${tenantId}`;
    const filter = `tenant_id=eq.${tenantId}`;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let subscribedBefore = false;
    let interrupted = false;

    (async () => {
      // supabase.channel() returns an existing channel with the same topic, so make sure one left
      // over from a previous mount (React Strict Mode, fast refresh) is gone first.
      await Promise.all(
        supabase
          .getChannels()
          .filter((c) => c.topic === `realtime:${topic}`)
          .map((c) => supabase.removeChannel(c)),
      );
      if (cancelled) return;

      // Subscribe as the member: without the session, Realtime would authorise us as anonymous and
      // RLS would silently send nothing.
      let signedIn = false;
      try {
        signedIn = await ensureRealtimeAuth(supabase);
      } catch {
        signedIn = false;
      }
      if (cancelled) return;
      if (!signedIn) {
        setState("unavailable");
        return;
      }

      let next = supabase.channel(topic);
      for (const table of TABLES) {
        for (const event of ["INSERT", "UPDATE"] as const) {
          next = next.on("postgres_changes", { event, schema: "public", table, filter }, (payload) =>
            onChange(table, payload.new),
          );
        }
      }
      channel = next.subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setState("live");
          // First subscribe: catch anything that changed between the first read and now.
          // Re-subscribe after an error or a dropped connection: catch what was missed meanwhile.
          if (!subscribedBefore || interrupted) {
            lastResyncAt.current = 0;
            resync();
          }
          subscribedBefore = true;
          interrupted = false;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          interrupted = true;
          setState("unavailable");
          resync();
        } else if (status === "CLOSED") {
          interrupted = true;
          setState("unavailable");
        }
      });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tenantId]);

  return state;
}
