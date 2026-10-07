import { serverEnv, type ServerEnv } from "../lib/env";

// Browser routes answer only the frontend's origins: NEXT_PUBLIC_APP_URL plus CORS_ALLOWED_ORIGINS.
// The caller's origin is echoed back when it is on the list, never "*". The API authenticates with
// a bearer token, not cookies, so credentials are never allowed. Server-to-server routes (Meta's
// webhook, Inngest) send no CORS headers at all.

export const CORS_ALLOWED_HEADERS = "authorization, content-type, x-pakka-tenant";
const PREFLIGHT_MAX_AGE_SECONDS = "600";

export function allowedOrigins(env: Pick<ServerEnv, "NEXT_PUBLIC_APP_URL" | "CORS_ALLOWED_ORIGINS"> = serverEnv()): ReadonlySet<string> {
  return new Set([new URL(env.NEXT_PUBLIC_APP_URL).origin, ...(env.CORS_ALLOWED_ORIGINS ?? [])]);
}

/** No Origin header (curl, another server) or an allowed one. Browsers always send Origin cross-site. */
export function originAllowed(request: Request, allowed: ReadonlySet<string>): boolean {
  const origin = request.headers.get("origin");
  return origin === null || allowed.has(origin);
}

/** The answer to a preflight (OPTIONS) for a route that accepts `methods`. */
export function preflight(request: Request, allowed: ReadonlySet<string>, methods: readonly string[]): Response {
  const origin = request.headers.get("origin");
  const method = request.headers.get("access-control-request-method");
  if (origin === null || !allowed.has(origin) || method === null || !methods.includes(method)) {
    return new Response(null, { status: 403, headers: { vary: "Origin" } });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": [...methods, "OPTIONS"].join(", "),
      "access-control-allow-headers": CORS_ALLOWED_HEADERS,
      "access-control-max-age": PREFLIGHT_MAX_AGE_SECONDS,
      vary: "Origin",
    },
  });
}

/** The response with the CORS headers for the caller's origin, if that origin is allowed. */
export function withCors(response: Response, request: Request, allowed: ReadonlySet<string>): Response {
  const headers = new Headers(response.headers);
  headers.append("vary", "Origin");
  const origin = request.headers.get("origin");
  if (origin !== null && allowed.has(origin)) headers.set("access-control-allow-origin", origin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
