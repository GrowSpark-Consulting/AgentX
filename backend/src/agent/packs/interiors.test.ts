import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HandoffTrigger, PackDefinition } from "@pakka/types";
import { describe, expect, it } from "vitest";
import { resolvePack } from "./load";

// The interiors pack, version 1: packs/interiors.json (docs/handover.md, module 3 and "Vertical pack
// system", in the repo's pack format). It is data, so this tests the file itself.

const PACKS_DIR = fileURLToPath(new URL("../../../../packs", import.meta.url));
const raw: unknown = JSON.parse(readFileSync(`${PACKS_DIR}/interiors.json`, "utf8"));
const pack = PackDefinition.parse(raw);
const loaded = resolvePack(raw);

describe("packs/interiors.json", () => {
  it("is valid against the pack format, with no warnings at all", () => {
    expect(PackDefinition.safeParse(raw).success).toBe(true);
    expect(loaded.warnings).toEqual([]);
  });

  it("is version 1 of interiors, which is how the demo business is pinned", () => {
    expect(pack.key).toBe("interiors");
    expect(pack.version).toBe(1);
    expect(pack.label).toBe("Interior design");
  });

  it("books a site measurement visit at the customer's address, through bookingModes", () => {
    expect(pack.bookingModes).toEqual(["field_visit"]);
    expect(pack.bookingType).toBeUndefined();
    expect(loaded.pack.bookingModes).toEqual(["field_visit"]);
  });

  it("asks for property type, area, scope, budget, possession date and pincode, in that order", () => {
    expect(pack.fields.map((f) => [f.key, f.type, f.required])).toEqual([
      ["property_type", "enum", true],
      ["area_sqft", "int", true],
      ["scope", "enum", true],
      ["budget", "range_inr", true],
      ["possession_date", "date_range_or_month", false],
      ["pincode", "text", false],
    ]);
    const options = (key: string) => pack.fields.find((f) => f.key === key)?.options;
    expect(options("property_type")).toEqual(["apartment", "independent_house", "villa", "commercial"]);
    expect(options("scope")).toEqual(["full_home", "modular_kitchen", "wardrobes", "living_room", "bedrooms", "renovation"]);
  });

  it("scores out of 100, hot from 70 and warm from 40, and every scored field is declared", () => {
    expect(pack.scoring.rules.reduce((sum, rule) => sum + rule.points, 0)).toBe(100);
    expect(pack.scoring.thresholds).toEqual({ hot: 70, warm: 40 });
    const declared = new Set(pack.fields.map((f) => f.key));
    for (const rule of pack.scoring.rules) expect(declared.has(rule.field)).toBe(true);
    for (const hardFail of pack.scoring.hardFails) expect(declared.has(hardFail.field)).toBe(true);
  });

  it("scores budget, possession date, scope, area, property type and service area", () => {
    expect(pack.scoring.rules).toEqual([
      { field: "budget", match: "within_service_band", points: 30 },
      { field: "possession_date", match: "starts_within_days", value: 90, points: 25 },
      { field: "scope", in: ["full_home", "modular_kitchen"], points: 15 },
      { field: "area_sqft", gte: 600, points: 15 },
      { field: "property_type", in: ["apartment", "independent_house", "villa"], points: 5 },
      { field: "pincode", match: "in_service_area", points: 10 },
    ]);
  });

  it("disqualifies a budget below the cheapest service, and only that", () => {
    expect(pack.scoring.hardFails).toEqual([{ field: "budget", below: "min_service_price" }]);
  });

  it("hands over for the six triggers in the handover, all of which the agent knows", () => {
    expect(pack.handoffTriggers).toEqual(["asked_human", "complaint", "negotiation", "hot_lead", "kb_gap", "stuck"]);
    for (const trigger of pack.handoffTriggers) expect(HandoffTrigger.safeParse(trigger).success).toBe(true);
  });

  it("reminds 24 hours and 2 hours before the measurement visit and asks for feedback 2 hours after it", () => {
    expect(pack.reminders).toEqual([
      { event: "site_measurement", anchor: "start", offset: "-24h", template: "reminder_24h_v1", feature: "reminder_24h" },
      { event: "site_measurement", anchor: "start", offset: "-2h", template: "reminder_2h_v1", feature: "reminder_2h" },
    ]);
    expect(pack.feedback).toEqual({ event: "site_measurement", anchor: "end", offset: "+2h", template: "feedback_v1", feature: "feedback_request" });
  });

  it("lists the seven templates, and every template a reminder uses is among them", () => {
    expect(pack.templates).toEqual(["booking_confirmed_v1", "reminder_24h_v1", "reminder_2h_v1", "feedback_v1", "review_v1", "nudge_v1", "staff_alert_v1"]);
    for (const reminder of [...pack.reminders, ...(pack.feedback ? [pack.feedback] : [])]) expect(pack.templates).toContain(reminder.template);
  });

  it("starts the knowledge base with six topics, and adds no extra guardrails", () => {
    expect(pack.kbStarter).toEqual([
      "Services and packages",
      "Price per sq ft ranges",
      "Materials and brands",
      "Past projects",
      "Timeline and warranty",
      "Site measurement visit",
    ]);
    expect(pack.extraGuardrails).toEqual([]);
  });
});

describe("the field schema generated from it", () => {
  const schema = loaded.fieldSchema;
  const lead = { property_type: "apartment", area_sqft: 1150, scope: "full_home", budget: "12-15L", possession_date: "March 2027", pincode: "600042" };

  it("accepts a complete lead, and a lead still being filled in", () => {
    expect(schema.parse(lead)).toEqual(lead);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("takes the area as a number or as the digits the model returned", () => {
    expect(schema.parse({ area_sqft: "950" })).toEqual({ area_sqft: 950 });
  });

  it.each<[Record<string, unknown>, string]>([
    [{ property_type: "castle" }, "a property type that is not offered"],
    [{ scope: "everything" }, "a scope that is not offered"],
    [{ area_sqft: "big" }, "an area that is not a number"],
    [{ area_sqft: 12.5 }, "an area that is not whole"],
    [{ budget: "" }, "an empty budget"],
    [{ pincode: "  " }, "a blank pincode"],
  ])("rejects %j (%s)", (fields) => {
    expect(schema.safeParse(fields).success).toBe(false);
  });

  it("drops answers to questions the pack does not ask", () => {
    expect(schema.parse({ ...lead, pets: true })).toEqual(lead);
  });
});
