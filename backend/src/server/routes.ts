import type { StartTrialResult } from "@pakka/types";
import { getBalance } from "../billing/credits";
import { startTrialFor } from "../billing/start-trial";
import { createTrialTenant } from "../billing/trial";
import { sendTestMessage } from "../channels/whatsapp/test-message";
import { handleWhatsAppVerification } from "../channels/whatsapp/verify-challenge";
import { resolveTenant } from "../lib/tenant";
import { createTemplate } from "../notify/templates";
import { authenticate, readJson, tenantRoute, type UserClientFactory } from "./auth";

// Every HTTP endpoint of the API. A route only parses the request and calls a backend service;
// business logic stays in the modules it imports.

export interface RouteDeps {
  userClient: UserClientFactory;
  inngest: (request: Request) => Promise<Response>;
}

/** The values of a route's `:name` segments, decoded. */
export type RouteParams = Readonly<Record<string, string>>;
export type RouteHandler = (request: Request, deps: RouteDeps, params: RouteParams) => Promise<Response> | Response;
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Route {
  /**
   * A fixed path, or a pattern with `:name` segments (`/api/kb/faqs/:id`) that match one non-empty
   * segment each. A fixed path wins over a pattern; otherwise the first matching route wins.
   */
  path: string;
  methods: Partial<Record<Method, RouteHandler>>;
  /** Called from the browser: CORS applies, and only allowed origins may call it. */
  browser?: boolean;
  /** The largest body accepted, in bytes; bigger requests get 413 before the route runs. Default 1 MB. */
  maxBodyBytes?: number;
}

// Liveness for Railway's healthcheck. Reads nothing else, so it answers even when Supabase or Inngest
// are down. RAILWAY_* are set by the platform.
function health(): Response {
  return Response.json(
    {
      ok: true,
      env: process.env.RAILWAY_ENVIRONMENT_NAME ?? "local",
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

const TRIAL_STATUS: Record<StartTrialResult["status"], number> = {
  ready: 200,
  has_business: 409,
  unavailable: 422,
  invalid: 422,
  failed: 500,
};

// POST /api/onboarding/trial { name, industry } → StartTrialResult. A signed-in account with no
// business yet; the user comes from the verified token, never from the body.
async function startTrial(request: Request, deps: RouteDeps): Promise<Response> {
  const { supabase, user } = await authenticate(request, deps.userClient);
  const body = await readJson(request);
  const result = await startTrialFor(body, {
    currentUser: async () => user,
    sessionState: () => resolveTenant(supabase, user),
    createTrialTenant,
    getBalance,
  });
  return Response.json(result, { status: TRIAL_STATUS[result.status] });
}

// { name, category, language, body, examples } → CreateTemplateResult. Owner or admin.
const templates = tenantRoute(({ context, body }) => createTemplate(context, body));
// { to, body } → SendTestMessageResult. Owner or admin.
const testMessage = tenantRoute(({ supabase, context, body }) => sendTestMessage(supabase, context, body));

export const ROUTES: readonly Route[] = [
  { path: "/api/health", methods: { GET: health } },
  { path: "/api/templates", browser: true, methods: { POST: (request, deps) => templates(request, deps.userClient) } },
  { path: "/api/messages/test", browser: true, methods: { POST: (request, deps) => testMessage(request, deps.userClient) } },
  { path: "/api/onboarding/trial", browser: true, methods: { POST: startTrial } },
  {
    // Meta's callback URL. GET is the verification check; message handling (POST) is not built yet,
    // so other methods get a 405.
    path: "/api/webhooks/whatsapp",
    methods: { GET: (request) => handleWhatsAppVerification(request) },
  },
  {
    // Inngest syncs (PUT), introspects (GET) and runs functions (POST) here.
    path: "/api/inngest",
    methods: { GET: (r, d) => d.inngest(r), POST: (r, d) => d.inngest(r), PUT: (r, d) => d.inngest(r) },
  },
];
