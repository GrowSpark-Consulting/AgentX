import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HandoffTrigger, PackDefinition } from "@pakka/types";
import { describe, expect, it } from "vitest";
import { resolvePack } from "./load";
import { readPackFiles } from "./sync";

// The real-estate pack, version 1: packs/real-estate.json (docs/handover.md, module 3, adapted to the
// repo's pack format). It is data, so this tests the file itself: it validates, it says what the handover
// says, and the field schema generated from it accepts and rejects the right leads.

const PACKS_DIR = fileURLToPath(new URL("../../../../packs", import.meta.url));
const raw: unknown = JSON.parse(readFileSync(`${PACKS_DIR}/real-estate.json`, "utf8"));
const pack = PackDefinition.parse(raw);
const loaded = resolvePack(raw);

describe("packs/real-estate.json", () => {
  it("is valid against the pack format, with no warnings at all", () => {
    expect(PackDefinition.safeParse(raw).success).toBe(true);
    expect(loaded.warnings).toEqual([]);
  });

  it("is version 1 of real-estate, which is how the demo business and new trials are pinned", () => {
    expect(pack.key).toBe("real-estate");
    expect(pack.version).toBe(1);
    expect(pack.label).toBe("Real estate");
  });

  it("books site visits, through bookingModes (not the older single bookingType)", () => {
    expect(pack.bookingModes).toEqual(["site_visit"]);
    expect(pack.bookingType).toBeUndefined();
    expect(loaded.pack.bookingModes).toEqual(["site_visit"]);
  });

  it("asks for budget, preferred area, type, timeline, funding and whether the person decides, in that order", () => {
    expect(pack.fields.map((f) => [f.key, f.type, f.required])).toEqual([
      ["budget", "range_inr", true],
      ["location", "text", true],
      ["config", "enum", false],
      ["timeline", "enum", true],
      ["funding", "enum", false],
      ["decision_maker", "boolean", false],
    ]);
    const options = (key: string) => pack.fields.find((f) => f.key === key)?.options;
    expect(options("config")).toEqual(["1BHK", "2BHK", "3BHK", "Villa", "Plot"]);
    expect(options("timeline")).toEqual(["0-3m", "3-6m", "6m+"]);
    expect(options("funding")).toEqual(["loan_approved", "loan_needed", "own_funds"]);
  });

  it("has decision_maker as an optional yes/no question, and scores it", () => {
    const field = pack.fields.find((f) => f.key === "decision_maker");
    expect(field).toMatchObject({ type: "boolean", required: false, label: "Are you the buyer or co-buyer?" });
    expect(pack.scoring.rules).toContainEqual({ field: "decision_maker", equals: true, points: 10 });
  });

  it("scores budget, timeline, area, funding and decision maker out of 100, hot from 70 and warm from 40", () => {
    expect(pack.scoring.rules).toEqual([
      { field: "budget", match: "within_project_band", points: 30 },
      { field: "timeline", equals: "0-3m", points: 25 },
      { field: "location", match: "in_project_areas", points: 20 },
      { field: "funding", in: ["loan_approved", "own_funds"], points: 15 },
      { field: "decision_maker", equals: true, points: 10 },
    ]);
    expect(pack.scoring.rules.reduce((sum, rule) => sum + rule.points, 0)).toBe(100);
    expect(pack.scoring.thresholds).toEqual({ hot: 70, warm: 40 });
  });

  it("disqualifies a budget below the cheapest project, and only that", () => {
    expect(pack.scoring.hardFails).toEqual([{ field: "budget", below: "min_project_price" }]);
  });

  it("only scores and disqualifies on fields the pack declares", () => {
    const declared = new Set(pack.fields.map((f) => f.key));
    for (const rule of pack.scoring.rules) expect(declared.has(rule.field)).toBe(true);
    for (const hardFail of pack.scoring.hardFails) expect(declared.has(hardFail.field)).toBe(true);
  });

  it("hands over for the six triggers in the handover, all of which the agent knows", () => {
    expect(pack.handoffTriggers).toEqual(["asked_human", "complaint", "negotiation", "hot_lead", "kb_gap", "stuck"]);
    for (const trigger of pack.handoffTriggers) expect(HandoffTrigger.safeParse(trigger).success).toBe(true);
  });

  it("reminds 24 hours and 2 hours before a site visit, and asks for feedback 2 hours after it, all relative to the visit", () => {
    expect(pack.reminders).toEqual([
      { event: "site_visit", anchor: "start", offset: "-24h", template: "reminder_24h_v1", feature: "reminder_24h" },
      { event: "site_visit", anchor: "start", offset: "-2h", template: "reminder_2h_v1", feature: "reminder_2h" },
    ]);
    expect(pack.feedback).toEqual({ event: "site_visit", anchor: "end", offset: "+2h", template: "feedback_v1", feature: "feedback_request" });
  });

  it("lists the seven templates, and every template a reminder uses is among them", () => {
    expect(pack.templates).toEqual(["booking_confirmed_v1", "reminder_24h_v1", "reminder_2h_v1", "feedback_v1", "review_v1", "nudge_v1", "staff_alert_v1"]);
    for (const reminder of [...pack.reminders, ...(pack.feedback ? [pack.feedback] : [])]) expect(pack.templates).toContain(reminder.template);
  });

  it("starts the knowledge base with five topics, and adds no extra guardrails", () => {
    expect(pack.kbStarter).toEqual(["Projects and locations", "Price bands", "Amenities", "Loan partners", "Site visit timings"]);
    expect(pack.extraGuardrails).toEqual([]);
  });
});

describe("the field schema generated from it", () => {
  const schema = loaded.fieldSchema;
  const lead = { budget: "60-70L", location: "Tambaram", config: "2BHK", timeline: "0-3m", funding: "loan_needed", decision_maker: true };

  it("accepts a complete lead as it is", () => {
    expect(schema.parse(lead)).toEqual(lead);
  });

  it("accepts a lead that is still being filled in, even an empty one", () => {
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.parse({ location: "OMR", timeline: "6m+" })).toEqual({ location: "OMR", timeline: "6m+" });
  });

  it("takes decision_maker as a yes/no, including the text the model sometimes returns", () => {
    expect(schema.parse({ decision_maker: false })).toEqual({ decision_maker: false });
    expect(schema.parse({ decision_maker: "true" })).toEqual({ decision_maker: true });
  });

  it("takes a budget as a number or a range such as 50-60L", () => {
    expect(schema.parse({ budget: 6500000 })).toEqual({ budget: 6500000 });
    expect(schema.parse({ budget: "50-60L" })).toEqual({ budget: "50-60L" });
  });

  it.each<[Record<string, unknown>, string]>([
    [{ config: "4BHK" }, "a type that is not offered"],
    [{ timeline: "soon" }, "a timeline that is not offered"],
    [{ funding: "cash" }, "a funding option that is not offered"],
    [{ decision_maker: "maybe" }, "a decision maker that is not yes or no"],
    [{ decision_maker: null }, "a null decision maker"],
    [{ budget: "" }, "an empty budget"],
    [{ location: "   " }, "a blank area"],
    [{ budget: true }, "a budget that is a yes/no"],
  ])("rejects %j (%s)", (fields) => {
    expect(schema.safeParse(fields).success).toBe(false);
  });

  it("drops answers to questions the pack does not ask", () => {
    expect(schema.parse({ ...lead, pets_allowed: true })).toEqual(lead);
  });
});

describe("the packs folder", () => {
  it("holds real-estate version 1 and loads without warnings", async () => {
    const files = await readPackFiles(PACKS_DIR);
    const entry = files.find((f) => f.key === "real-estate");
    expect(entry).toMatchObject({ file: "real-estate.json", key: "real-estate", version: 1 });
    expect(entry?.warnings).toEqual([]);
  });
});
