import { ping } from "./ping";
import { releaseHolds } from "./release-holds";

// Every Inngest function is registered here and served from the API's /api/inngest (see serve.ts).
export const functions = [ping, releaseHolds];
