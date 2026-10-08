import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HandoffTrigger, PackDefinition } from "@pakka/types";
import { describe, expect, it } from "vitest";
import { resolvePack } from "./load";

// The salon pack, version 1: packs/salon.json (docs/handover.md, module 3 and "Vertical pack system", in
// the repo's pack format). It is data, so this tests the file itself.

const PACKS_DIR = fileURLToPath(new URL("../../../../packs", import.meta.url));
const raw: unknown = JSON.parse(readFileSync(`${PACKS_DIR}/salon.json`, "utf8"));
const pack = PackDefinition.parse(raw);
const loaded = resolvePack(raw);

describe("packs/salon.json", () => {
  it("is valid against the pack format, with no warnings at all", () => {
    expect(PackDefinition.safeParse(raw).success).toBe(true);
    expect(loaded.warnings).toEqual([]);
  });

  it("is version 1 of salon, which is how the demo business is pinned", () => {
    expect(pack.key).toBe("salon");
    expect(pack.version).toBe(1);
    expect(pack.label).toBe("Beauty parlour");
  });

  it("books time slots with a stylist, through bookingModes", () => {
    expect(pack.bookingModes).toEqual(["slot"]);
    expect(pack.bookingType).toBeUndefined();
    expect(loaded.pack.bookingModes).toEqual(["slot"]);
  });

  it("asks for the services, stylist, date, time and party size, in that order", () => {
    expect(pack.fields.map((f) => [f.key, f.type, f.required])).toEqual([
      ["services", "text", true],
      ["preferred_stylist", "text", false],
      ["preferred_date", "date_range_or_month", true],
      ["preferred_time", "enum", true],
      ["party_size", "int", false],
    ]);
    expect(pack.fields.find((f) => f.key === "preferred_time")?.options).toEqual(["morning", "afternoon", "evening"]);
  });

  it("scores out of 100, hot from 60 and warm from 30, and every scored field is declared", () => {
    expect(pack.scoring.rules.reduce((sum, rule) => sum + rule.points, 0)).toBe(100);
    expect(pack.scoring.thresholds).toEqual({ hot: 60, warm: 30 });
    const declared = new Set(pack.fields.map((f) => f.key));
    for (const rule of pack.scoring.rules) expect(declared.has(rule.field)).toBe(true);
    for (const hardFail of pack.scoring.hardFails) expect(declared.has(hardFail.field)).toBe(true);
  });

  it("scores the services, how soon, the stylist, the time of day and the party size", () => {
    expect(pack.scoring.rules).toEqual([
      { field: "services", match: "in_service_catalog", points: 40 },
      { field: "preferred_date", match: "starts_within_days", value: 7, points: 30 },
      { field: "preferred_stylist", match: "is_available_stylist", points: 10 },
      { field: "preferred_time", match: "within_working_hours", points: 10 },
      { field: "party_size", gte: 2, points: 10 },
    ]);
  });

  it("disqualifies a request for services the salon does not offer, and only that", () => {
    expect(pack.scoring.hardFails).toEqual([{ field: "services", match: "none_in_service_catalog" }]);
  });

  it("hands over for five of the handover's six triggers, all of which the agent knows, and not for a hot lead", () => {
    // A hot salon lead is simply someone ready to book a slot, which the agent does by itself; handing it to staff
    // would hand over nearly every good booking and defeat the automation.
    expect(pack.handoffTriggers).toEqual(["asked_human", "complaint", "negotiation", "kb_gap", "stuck"]);
    expect(pack.handoffTriggers).not.toContain("hot_lead");
    for (const trigger of pack.handoffTriggers) expect(HandoffTrigger.safeParse(trigger).success).toBe(true);
  });

  it("reminds 24 hours and 2 hours before the appointment and asks for feedback 2 hours after it", () => {
    expect(pack.reminders).toEqual([
      { event: "appointment", anchor: "start", offset: "-24h", template: "reminder_24h_v1", feature: "reminder_24h" },
      { event: "appointment", anchor: "start", offset: "-2h", template: "reminder_2h_v1", feature: "reminder_2h" },
    ]);
    expect(pack.feedback).toEqual({ event: "appointment", anchor: "end", offset: "+2h", template: "feedback_v1", feature: "feedback_request" });
  });

  it("lists the eight templates, and every template a reminder uses is among them", () => {
    expect(pack.templates).toEqual([
      "booking_confirmed_v1",
      "reminder_24h_v1",
      "reminder_2h_v1",
      "feedback_v1",
      "review_v1",
      "nudge_v1",
      "noshow_rebook_v1",
      "staff_alert_v1",
    ]);
    for (const reminder of [...pack.reminders, ...(pack.feedback ? [pack.feedback] : [])]) expect(pack.templates).toContain(reminder.template);
  });

  it("starts the knowledge base with five topics, and adds no extra guardrails", () => {
    expect(pack.kbStarter).toEqual(["Services and prices", "Stylists and specialities", "Packages and offers", "Opening hours", "Cancellation policy"]);
    expect(pack.extraGuardrails).toEqual([]);
  });
});

describe("the field schema generated from it", () => {
  const schema = loaded.fieldSchema;
  const lead = { services: "haircut and facial", preferred_stylist: "Meena", preferred_date: "this Saturday", preferred_time: "evening", party_size: 2 };

  it("accepts a complete lead, and a lead still being filled in", () => {
    expect(schema.parse(lead)).toEqual(lead);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("takes the party size as a number or as the digits the model returned", () => {
    expect(schema.parse({ party_size: "3" })).toEqual({ party_size: 3 });
  });

  it.each<[Record<string, unknown>, string]>([
    [{ preferred_time: "midnight" }, "a time of day that is not offered"],
    [{ party_size: "many" }, "a party size that is not a number"],
    [{ services: "" }, "empty services"],
    [{ preferred_date: "   " }, "a blank date"],
  ])("rejects %j (%s)", (fields) => {
    expect(schema.safeParse(fields).success).toBe(false);
  });

  it("drops answers to questions the pack does not ask", () => {
    expect(schema.parse({ ...lead, pets: true })).toEqual(lead);
  });
});
