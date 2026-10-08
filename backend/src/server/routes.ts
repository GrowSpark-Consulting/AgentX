import type { StartTrialResult } from "@pakka/types";
import { getBalance } from "../billing/credits";
import { startTrialFor } from "../billing/start-trial";
import { createTrialTenant } from "../billing/trial";
import { googleConnectUrl, handleGoogleCallback } from "../booking/google-calendar";
import { sendTestMessage } from "../channels/whatsapp/test-message";
import { handleWhatsAppWebhook } from "../channels/whatsapp/inbound";
import { handleWhatsAppVerification } from "../channels/whatsapp/verify-challenge";
import { deleteDocument, KB_UPLOAD_MAX_BODY_BYTES, uploadDocument } from "../kb/documents";
import { resolveTenant } from "../lib/tenant";
import { createTemplate } from "../notify/templates";
import { authenticate, readJson, requireTenant, tenantRoute, type UserClientFactory } from "./auth";

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
  /** Path params that are secrets (a connect-link token): the request log shows them as `***`. */
  secretParams?: readonly string[];
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
// ?resourceId= → { url }: the Google consent link for one staff member. Owner or admin.
const googleConnect: RouteHandler = (request, deps, params) =>
  tenantRoute(({ context }) => googleConnectUrl(context, new URL(request.url).searchParams.get("resourceId")))(request, deps.userClient, params);

// multipart: file (+ optional title) → 202 { id, title, sourceType, status: "processing", createdAt }. Owner or
// admin. The body is a form, not JSON, so this reads it itself, after the caller and the business are known.
const kbUpload: RouteHandler = async (request, deps) => {
  const { context } = await requireTenant(request, deps.userClient);
  return Response.json(await uploadDocument(context, request), { status: 202 });
};
// → 204. Owner or admin; an upload or imported document and its chunks (an FAQ has its own route).
const kbDeleteDocument: RouteHandler = (request, deps, params) =>
  tenantRoute(({ context }) => deleteDocument(context, params.id), { status: 204 })(request, deps.userClient, params);

export const ROUTES: readonly Route[] = [
  { path: "/api/health", methods: { GET: health } },
  { path: "/api/templates", browser: true, methods: { POST: (request, deps) => templates(request, deps.userClient) } },
  { path: "/api/messages/test", browser: true, methods: { POST: (request, deps) => testMessage(request, deps.userClient) } },
  { path: "/api/onboarding/trial", browser: true, methods: { POST: startTrial } },
  // 6 MB: room for a 5 MB file plus its multipart wrapping; the service checks the 5 MB itself, so a big file
  // is a validation_failed with fields.file, and only a body over 6 MB is refused by the server (413).
  { path: "/api/kb/documents", browser: true, maxBodyBytes: KB_UPLOAD_MAX_BODY_BYTES, methods: { POST: kbUpload } },
  { path: "/api/kb/documents/:id", browser: true, methods: { DELETE: kbDeleteDocument } },
  { path: "/api/calendar/google/connect", browser: true, methods: { GET: googleConnect } },
  // Google sends the browser here after consent (no login: the signed state says who asked). Every answer
  // is a redirect back to the dashboard. The code and state are in the query string, which is never logged.
  { path: "/api/calendar/google/callback", methods: { GET: (request) => handleGoogleCallback(request) } },
  {
    // Meta's callback URL. GET is the verification check; POST delivers messages and statuses (the
    // signature is verified in the handler). Server to server: not `browser`, so no CORS; default body limit.
    path: "/api/webhooks/whatsapp",
    methods: {
      GET: (request) => handleWhatsAppVerification(request),
      POST: (request) => handleWhatsAppWebhook(request),
    },
  },
  {
    // Inngest syncs (PUT), introspects (GET) and runs functions (POST) here.
    path: "/api/inngest",
    methods: { GET: (r, d) => d.inngest(r), POST: (r, d) => d.inngest(r), PUT: (r, d) => d.inngest(r) },
  },
];
