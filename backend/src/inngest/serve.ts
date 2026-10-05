import { serve } from "inngest/next";
import { inngest } from "./client";
import { functions } from "./functions";

// Route handlers for /api/inngest, re-exported by frontend/app/api/inngest/route.ts. Built here so the
// app uses the same `inngest` instance as the client and functions (one copy, owned by this package).
export const { GET, POST, PUT } = serve({ client: inngest, functions });
