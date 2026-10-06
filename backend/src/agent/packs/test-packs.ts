// Neutral sample packs for the loader tests. Test data only: no industry names, nothing from a real pack.

export function samplePack(over: Record<string, unknown> = {}) {
  return {
    key: "sample-pack",
    version: 1,
    label: "Sample pack",
    bookingModes: ["slot"],
    fields: [
      { key: "budget", label: "Budget", type: "range_inr", required: true },
      { key: "area", label: "Preferred area", type: "text", required: true },
      { key: "size", label: "Size", type: "enum", options: ["small", "medium", "large"] },
      { key: "timeline", label: "Timeline", type: "enum", options: ["now", "soon", "later"], required: true },
      { key: "party", label: "Party size", type: "int" },
      { key: "notes", label: "Notes", type: "text" },
    ],
    scoring: {
      rules: [
        { field: "budget", match: "within_band", points: 30 },
        { field: "timeline", equals: "now", points: 25 },
        { field: "size", in: ["medium", "large"], points: 15 },
        { field: "size", equals: "large", points: 5 },
        { field: "party", gte: 4, points: 10 },
      ],
      thresholds: { hot: 70, warm: 40 },
      hardFails: [{ field: "budget", below: "minimum" }],
    },
    reminders: [
      { event: "visit", anchor: "start", offset: "-1d", template: "reminder_a_v1" },
      { event: "visit", anchor: "start", offset: "-2h", template: "reminder_b_v1" },
    ],
    feedback: { event: "visit", anchor: "end", offset: "+1d", template: "feedback_v1" },
    handoffTriggers: ["asked_human"],
    templates: ["reminder_a_v1", "reminder_b_v1", "feedback_v1"],
    kbStarter: ["Prices"],
    extraGuardrails: [],
    ...over,
  };
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
