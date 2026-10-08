import { releaseExpiredHolds } from "../booking/bookings";
import { inngest } from "./client";

// Every minute, holds nobody confirmed become 'expired' (docs/handover.md, module 5). findSlots and
// hold_slot already treat an expired hold as free, so this only tidies the bookings table.
export const releaseHolds = inngest.createFunction(
  { id: "release-holds", triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => step.run("release", async () => ({ released: await releaseExpiredHolds() })),
);
