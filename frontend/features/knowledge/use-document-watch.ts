"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useEffectEvent, useState } from "react";
import { ensureRealtimeAuth, getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { startPolling } from "./document-watch";

/**
 * idle: nothing is processing. watching: a document is processing and is being re-read. stalled: it
 * has been processing for longer than the polling window; `checkAgain` starts another one.
 */
export type WatchState = "idle" | "watching" | "stalled";

/**
 * While `processing` is true: one Realtime channel on the business's kb_documents (re-read on any
 * change) and polling as the fallback, since Realtime can be unavailable or miss a change. Both stop
 * when nothing is processing, the polling window runs out, or the screen unmounts. One channel and
 * one timer at most: the effect cleans up before it runs again.
 */
export function useDocumentWatch(tenantId: string, processing: boolean, refresh: () => Promise<unknown>) {
  const [stalled, setStalled] = useState(false);
  const [round, setRound] = useState(0);
  const reread = useEffectEvent(() => refresh());

  // A document starting to process again (a new upload) gets a fresh polling window.
  const [wasProcessing, setWasProcessing] = useState(processing);
  if (wasProcessing !== processing) {
    setWasProcessing(processing);
    if (processing) setStalled(false);
  }

  useEffect(() => {
    if (!processing) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const supabase = getSupabaseBrowserClient();
    const topic = `kb-documents:${tenantId}`;

    const poller = startPolling({
      tick: () => reread(),
      onGiveUp: () => {
        if (!cancelled) setStalled(true);
      },
    });

    (async () => {
      // A channel left over from a previous mount (Strict Mode, fast refresh) has the same topic.
      await Promise.all(
        supabase
          .getChannels()
          .filter((c) => c.topic === `realtime:${topic}`)
          .map((c) => supabase.removeChannel(c)),
      );
      let signedIn = false;
      try {
        signedIn = await ensureRealtimeAuth(supabase);
      } catch {
        signedIn = false;
      }
      // Without a session Realtime would subscribe as anonymous and RLS would send nothing: polling only.
      if (cancelled || !signedIn) return;
      channel = supabase
        .channel(topic)
        .on("postgres_changes", { event: "*", schema: "public", table: "kb_documents", filter: `tenant_id=eq.${tenantId}` }, () => {
          if (!cancelled) void reread();
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      poller.stop();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tenantId, processing, round]);

  const state: WatchState = !processing ? "idle" : stalled ? "stalled" : "watching";
  return {
    state,
    checkAgain: () => {
      setStalled(false);
      setRound((r) => r + 1);
      void refresh();
    },
  };
}
