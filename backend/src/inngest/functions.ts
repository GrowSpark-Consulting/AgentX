import { ping } from "./ping";

// Every Inngest function is registered here and served from the API's /api/inngest (see serve.ts).
export const functions = [ping];
