import type { TenantContext } from "@pakka/types";
import { createClient, isAuthRetryableFetchError, type SupabaseClient, type User } from "@supabase/supabase-js";
import { serverEnv } from "../lib/env";
import { AppError, toErrorResponse } from "../lib/errors";
import { resolveTenant } from "../lib/tenant";

// Who is calling. The browser sends the signed-in user's Supabase access token as
// `Authorization: Bearer <token>` and, in the dashboard, the business it is working on as
// X-Pakka-Tenant. Every route that acts for a user goes through here, so the check is the same
// everywhere, and it gives the same answers the dashboard gate gives.

export const TENANT_HEADER = "x-pakka-tenant";

/** A Supabase client acting as the caller (anon key + their token), so row-level security applies. */
export type UserClientFactory = (accessToken: string) => SupabaseClient;

export const userClient: UserClientFactory = (accessToken) => {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

const SIGNED_OUT = "Your session has ended. Sign in again.";
// A JWT: base64url segments and dots, about 1 KB. Anything else isn't a Supabase access token.
const TOKEN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*){1,4}$/;
// A tenant id. The header is only ever compared with the caller's own memberships.
const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The bearer token from the Authorization header, or null if there isn't a well-formed one. */
export function bearerToken(request: Request): string | null {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
  return match && match[1].length <= 8192 && TOKEN.test(match[1]) ? match[1] : null;
}

export interface Caller {
  supabase: SupabaseClient;
  user: User;
}

/** Asks Supabase Auth to verify the token (a decoded token alone is not trusted). */
export async function authenticate(request: Request, makeClient: UserClientFactory = userClient): Promise<Caller> {
  const token = bearerToken(request);
  if (!token) throw new AppError("unauthenticated", SIGNED_OUT);
  const supabase = makeClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (!error && data.user) return { supabase, user: data.user };
  if (error && (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500)) {
    throw new AppError("upstream_failed", "We couldn't check your sign-in. Try again in a moment.");
  }
  throw new AppError("unauthenticated", SIGNED_OUT);
}

/** The caller's client and business, or an AppError the route turns into a response. */
export async function requireTenant(
  request: Request,
  makeClient: UserClientFactory = userClient,
): Promise<{ supabase: SupabaseClient; context: TenantContext }> {
  const { supabase, user } = await authenticate(request, makeClient);
  const header = request.headers.get(TENANT_HEADER)?.trim() ?? "";
  const state = await resolveTenant(supabase, user, TENANT_ID.test(header) ? header : null);
  if (state.status === "no_membership") throw new AppError("no_membership", "Your account isn't linked to a business yet.");
  if (state.status === "choose") throw new AppError("forbidden", "Choose a business first.");
  return { supabase, context: state.context };
}

/** The JSON body, or a validation_failed AppError. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("validation_failed", "Send the details as JSON.");
  }
}

type TenantHandler<T> = (args: { supabase: SupabaseClient; context: TenantContext; body: unknown }) => Promise<T>;

/**
 * Wraps a JSON POST route: verifies the token and resolves the tenant on the server, parses the body,
 * runs the backend service, and turns any error into the `{ error: { code, message } }` envelope.
 */
export function tenantRoute<T>(handler: TenantHandler<T>) {
  return async (request: Request, makeClient: UserClientFactory = userClient): Promise<Response> => {
    try {
      const { supabase, context } = await requireTenant(request, makeClient);
      const body = await readJson(request);
      return Response.json(await handler({ supabase, context, body }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      return Response.json(body, { status });
    }
  };
}
