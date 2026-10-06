import { AppError, toErrorResponse } from "@pakka/backend/lib/errors";
import type { TenantContext } from "@pakka/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireApiTenant } from "@/lib/auth/session";

type Handler<T> = (args: { supabase: SupabaseClient; context: TenantContext; body: unknown }) => Promise<T>;

/**
 * Wraps a JSON POST route: verifies the session and resolves the tenant on the server, parses the
 * body, runs the backend service, and turns any error into the `{ error: { code, message } }`
 * envelope. Business logic stays in @pakka/backend.
 */
export function tenantRoute<T>(handler: Handler<T>) {
  return async (request: Request): Promise<Response> => {
    try {
      const { supabase, context } = await requireApiTenant();
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new AppError("validation_failed", "Send the details as JSON.");
      }
      return Response.json(await handler({ supabase, context, body }));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      return Response.json(body, { status });
    }
  };
}
