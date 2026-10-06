import { getWhatsAppConnections, type ConnectionsResult } from "@pakka/backend/channels/whatsapp/connections";
import type { WhatsAppConnectionPublic } from "@pakka/types";
import { unstable_rethrow } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { getAuth } from "@/lib/auth/session";
import { formatError } from "@/lib/errors";

const STATUS: Record<WhatsAppConnectionPublic["status"], { label: string; tone: "ok" | "warn" | "off" }> = {
  active: { label: "Connected", tone: "ok" },
  pending: { label: "Connecting", tone: "warn" },
  validating: { label: "Checking", tone: "warn" },
  failed: { label: "Needs attention", tone: "warn" },
  disconnected: { label: "Disconnected", tone: "off" },
};

const METHOD: Record<WhatsAppConnectionPublic["method"], string> = {
  embedded_signup: "Connected with Facebook",
  assisted: "Assisted setup",
  manual_byo: "Connected manually",
};

/**
 * Placeholder WhatsApp connection panel. Reads `whatsapp_connections_public` (non-secret columns
 * only) as the signed-in member, so row-level security scopes it to their business. Wrap in
 * <Suspense> with a LoadingState.
 */
export async function WhatsAppConnectionPanel({ tenantId, compact }: { tenantId: string; compact?: boolean }) {
  let result: ConnectionsResult;
  try {
    const { supabase } = await getAuth();
    result = await getWhatsAppConnections(supabase, tenantId);
  } catch (err) {
    unstable_rethrow(err);
    const e = formatError(err);
    return <ErrorState compact={compact} title="Couldn't load your WhatsApp connection" description={e.message} retryHref="/dashboard/whatsapp" />;
  }

  if (result.state === "unavailable") {
    return (
      <EmptyState
        compact={compact}
        title="WhatsApp connection details aren't available yet"
        description="Connecting a number isn't switched on for this workspace yet. Once it is, the number, its status and Meta's quality rating appear here."
      />
    );
  }

  if (result.connections.length === 0) {
    return (
      <EmptyState
        compact={compact}
        title="No WhatsApp number connected"
        description="Connect your WhatsApp Business account so your assistant can reply to customers and you can send test messages."
        action={<ConnectPlaceholder />}
      />
    );
  }

  return (
    <ul className="app-grid" style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="WhatsApp numbers">
      {result.connections.map((c) => {
        const s = STATUS[c.status];
        return (
          <li key={c.id} className="app-card">
            <span className={`app-status app-status-${s.tone}`}>
              <span className="app-status-dot" aria-hidden="true" />
              {s.label}
            </span>
            <span className="app-card-title">{c.display_phone ?? "Number pending"}</span>
            <span className="app-card-text">
              {c.verified_name ? `Shows as “${c.verified_name}” · ` : ""}
              {METHOD[c.method]}
              {c.coexistence ? " · WhatsApp Business app still works" : ""}
            </span>
            {!compact ? (
              <dl className="app-facts">
                <div>
                  <dt>Quality rating</dt>
                  <dd>{c.quality_rating ?? "Not reported yet"}</dd>
                </div>
                <div>
                  <dt>Messaging limit</dt>
                  <dd>{c.messaging_limit ?? "Not reported yet"}</dd>
                </div>
              </dl>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The call to action, switched off until the connect flow exists (Embedded Signup and
 * POST /api/onboarding/whatsapp/embedded-signup, docs/handover.md module 10). It does nothing and
 * says so; it never fakes a connection.
 */
function ConnectPlaceholder() {
  return (
    <>
      <button type="button" className="btn btn-primary" disabled aria-describedby="connect-unavailable">
        Connect WhatsApp
      </button>
      <p id="connect-unavailable" className="app-hint" style={{ margin: 0, alignSelf: "center" }}>
        Connecting from the dashboard isn&apos;t switched on yet.
      </p>
    </>
  );
}
