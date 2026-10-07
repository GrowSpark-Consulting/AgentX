"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { DialogFrame } from "@/features/knowledge/dialog-frame";
import { formatError, type FormattedError } from "@/lib/errors";
import { CONNECTION_SERVICES, UNAVAILABLE_REASON, type ConnectionAction } from "@/lib/whatsapp/connection-actions";

// Recheck and Disconnect for one WhatsApp connection. Each runs through CONNECTION_SERVICES; while a
// service is null (its API endpoint doesn't exist yet) the control is switched off and says why.
// Nothing here changes what the page shows until the server has done it: on success the page is
// re-read from whatsapp_connections_public.

export function WhatsAppConnectionActions({
  connectionId,
  tenantId,
  displayPhone,
  actions,
}: {
  connectionId: string;
  tenantId: string;
  displayPhone: string | null;
  actions: ConnectionAction[];
}) {
  const router = useRouter();
  const hintId = useId();
  const [busy, setBusy] = useState<ConnectionAction | null>(null);
  const [error, setError] = useState<FormattedError | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (actions.length === 0) return null;
  const unavailable = actions.filter((a) => !CONNECTION_SERVICES[a]);

  async function run(action: ConnectionAction) {
    const service = CONNECTION_SERVICES[action];
    if (!service || busy) return;
    setBusy(action);
    setError(null);
    try {
      await service({ connectionId, tenantId });
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      <div className="app-actions">
        {actions.includes("recheck") ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!CONNECTION_SERVICES.recheck || busy !== null}
            aria-describedby={CONNECTION_SERVICES.recheck ? undefined : `${hintId}-recheck`}
            onClick={() => run("recheck")}
          >
            {busy === "recheck" ? "Rechecking…" : "Recheck connection"}
          </button>
        ) : null}
        {actions.includes("disconnect") ? (
          <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => setConfirming(true)}>
            Disconnect
          </button>
        ) : null}
      </div>
      {unavailable.map((a) => (
        <p key={a} id={`${hintId}-${a}`} className="app-hint" style={{ margin: 0 }}>
          {UNAVAILABLE_REASON[a]}
        </p>
      ))}
      {error && !confirming ? <ErrorState compact title={error.title} description={error.message} /> : null}

      {confirming ? (
        <DialogFrame title="Disconnect this WhatsApp number?" onClose={() => setConfirming(false)} busy={busy === "disconnect"}>
          <>
            <div style={{ fontSize: "14px", color: "var(--color-neutral-700)" }}>
              {displayPhone ?? "This number"} will stop sending and receiving messages through Spark Agent, and your
              assistant will stop replying from it. You can connect it again later.
            </div>
            {CONNECTION_SERVICES.disconnect ? null : (
              <p id={`${hintId}-confirm`} className="app-notice" style={{ margin: 0 }}>
                {UNAVAILABLE_REASON.disconnect} Nothing has been changed.
              </p>
            )}
            {error ? <ErrorState compact title={error.title} description={error.message} /> : null}
            <div className="dialog-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!CONNECTION_SERVICES.disconnect || busy !== null}
                aria-describedby={CONNECTION_SERVICES.disconnect ? undefined : `${hintId}-confirm`}
                onClick={() => run("disconnect")}
              >
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect number"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={busy === "disconnect"} autoFocus>
                Keep it connected
              </button>
            </div>
          </>
        </DialogFrame>
      ) : null}
    </div>
  );
}
