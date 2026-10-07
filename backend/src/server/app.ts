import { handleInngest } from "../inngest/serve";
import { toErrorResponse } from "../lib/errors";
import { userClient } from "./auth";
import { allowedOrigins, originAllowed, preflight, withCors } from "./cors";
import type { FetchHandler } from "./node";
import { ROUTES, type Method, type Route, type RouteDeps } from "./routes";

export interface AppDeps extends RouteDeps {
  allowedOrigins: ReadonlySet<string>;
}

const notFound = () => Response.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });

function methodNotAllowed(route: Route): Response {
  const allow = [...Object.keys(route.methods), ...(route.browser ? ["OPTIONS"] : [])].join(", ");
  return new Response(null, { status: 405, headers: { allow } });
}

/**
 * The whole API as one fetch-style function: finds the route, answers CORS preflights for browser
 * routes, refuses origins that aren't allowed, and turns anything a route throws into the
 * `{ error: { code, message } }` envelope. `deps` replaces Supabase, Inngest and the origin list in
 * tests; by default they come from serverEnv().
 */
export function createApp(overrides: Partial<AppDeps> = {}): FetchHandler {
  const deps: AppDeps = {
    userClient: overrides.userClient ?? userClient,
    inngest: overrides.inngest ?? handleInngest,
    allowedOrigins: overrides.allowedOrigins ?? allowedOrigins(),
  };

  return async function handle(request: Request): Promise<Response> {
    const route = ROUTES.find((r) => r.path === new URL(request.url).pathname);
    if (!route) return notFound();

    if (request.method === "OPTIONS" && route.browser) {
      return preflight(request, deps.allowedOrigins, Object.keys(route.methods));
    }
    const handler = route.methods[request.method as Method];
    if (!handler) return methodNotAllowed(route);

    if (route.browser && !originAllowed(request, deps.allowedOrigins)) {
      // The browser would hide the answer anyway; refusing here means the route never runs.
      return Response.json({ error: { code: "forbidden", message: "This site isn't allowed to call the API." } }, { status: 403, headers: { vary: "Origin" } });
    }

    let response: Response;
    try {
      response = await handler(request, deps);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      response = Response.json(body, { status });
    }
    return route.browser ? withCors(response, request, deps.allowedOrigins) : response;
  };
}
