import { serve } from "inngest/edge";
import { inngest } from "./client";
import { functions } from "./functions";

// The handler for /api/inngest on the API server (backend/src/server/routes.ts): the only Inngest
// endpoint. The Web-standard adapter takes a Request and returns a Response like every other route,
// and uses the same `inngest` instance as the client and functions (one copy, owned by this package).
export const handleInngest = serve({ client: inngest, functions });
