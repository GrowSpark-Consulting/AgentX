import type { ConnectionMethod, ConnectionStatus, Role } from "@pakka/types";

// What a member may do to a WhatsApp connection from the dashboard, and whether the API can do it
// yet. The handover lists POST /api/whatsapp/connections/:id/recheck and /disconnect (module 10);
// neither exists on the API today, so both services are null and the buttons say so instead of
// pretending. To switch one on, set it here to a function that calls the API through
// lib/api/client.ts; the UI needs no other change.

export type ConnectionAction = "recheck" | "disconnect";

/** Runs one action against the API. Resolves once the server has done it; throws ApiError if not. */
export type ConnectionService = (args: { connectionId: string; tenantId: string }) => Promise<void>;

export const CONNECTION_SERVICES: Record<ConnectionAction, ConnectionService | null> = {
  recheck: null,
  disconnect: null,
};

/** Shown next to an action whose API endpoint doesn't exist yet. */
export const UNAVAILABLE_REASON: Record<ConnectionAction, string> = {
  recheck: "Recheck will be available when the connection service is switched on.",
  disconnect: "Disconnecting will be available when the connection service is switched on.",
};

// Recheck: owner or admin (handover module 10: "Dashboard, admin"). Disconnect: owner only
// (docs/dashboard-screen-contracts.md, Settings). The handover's endpoint table says "Owner, admin"
// for disconnect; the stricter rule applies until the team settles it. The API decides in the end.
const ROLES: Record<ConnectionAction, readonly Role[]> = {
  recheck: ["owner", "admin"],
  disconnect: ["owner"],
};

// A check already running (validating) or a number no longer connected (disconnected) has nothing
// to recheck. A disconnected number has nothing to disconnect.
const STATUSES: Record<ConnectionAction, readonly ConnectionStatus[]> = {
  recheck: ["pending", "active", "failed"],
  disconnect: ["pending", "validating", "active", "failed"],
};

// `platform` is one of Spark Agent's own test or demo numbers (migration 0014), seeded by script and
// never the client's: recheck and disconnect are for the client's own connections, so it has neither
// (docs/whatsapp-connection-contract.md).
const METHODS: Record<ConnectionAction, readonly ConnectionMethod[]> = {
  recheck: ["embedded_signup", "assisted", "manual_byo"],
  disconnect: ["embedded_signup", "assisted", "manual_byo"],
};

/** The actions this member sees for a connection with this method and status, in display order. */
export function visibleActions(status: ConnectionStatus, role: Role, method: ConnectionMethod): ConnectionAction[] {
  return (["recheck", "disconnect"] as const).filter(
    (a) => METHODS[a].includes(method) && ROLES[a].includes(role) && STATUSES[a].includes(status),
  );
}
