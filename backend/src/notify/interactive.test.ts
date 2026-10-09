import { describe, expect, it } from "vitest";
import { Interactive, interactiveSummary, LIST_ROWS_MAX } from "./interactive";

const buttons = (over: Partial<Extract<Interactive, { type: "buttons" }>> = {}): Interactive => ({
  type: "buttons",
  body: "Your site visit is tomorrow at 5:00 pm.",
  buttons: [
    { id: "booking:b1:confirm", title: "Confirm" },
    { id: "booking:b1:reschedule", title: "Reschedule" },
    { id: "booking:b1:cancel", title: "Cancel" },
  ],
  ...over,
});
const row = (i: number) => ({ id: `slot:${i}`, title: `Fri 9 Oct, ${i}:00 pm` });
const list = (over: Partial<Extract<Interactive, { type: "list" }>> = {}): Interactive => ({
  type: "list",
  body: "Which time suits you?",
  button: "See times",
  sections: [{ rows: [row(1), row(2), row(3)] }],
  ...over,
});

const valid = (message: unknown) => Interactive.safeParse(message).success;

describe("Interactive (Meta's limits)", () => {
  it("accepts reply buttons and a list at the limits", () => {
    expect(valid(buttons())).toBe(true);
    expect(valid(buttons({ header: "h".repeat(60), body: "b".repeat(1024), footer: "f".repeat(60), buttons: [{ id: "x".repeat(256), title: "t".repeat(20) }] }))).toBe(true);
    expect(valid(list())).toBe(true);
    const ten = Array.from({ length: LIST_ROWS_MAX }, (_, i) => ({ ...row(i), description: "d".repeat(72) }));
    expect(valid(list({ body: "b\n".repeat(2048), button: "b".repeat(20), sections: [{ title: "Morning", rows: ten.slice(0, 5) }, { title: "Evening", rows: ten.slice(5) }] }))).toBe(true);
  });

  it.each([
    ["no buttons", buttons({ buttons: [] })],
    ["four buttons", buttons({ buttons: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: `B${i}` })) })],
    ["a button title over 20 characters", buttons({ buttons: [{ id: "b1", title: "t".repeat(21) }] })],
    ["a button id over 256 characters", buttons({ buttons: [{ id: "x".repeat(257), title: "Yes" }] })],
    ["two buttons with one id", buttons({ buttons: [{ id: "same", title: "Yes" }, { id: "same", title: "No" }] })],
    ["two buttons with one title", buttons({ buttons: [{ id: "a", title: "Yes" }, { id: "b", title: "Yes" }] })],
    ["a blank button title", buttons({ buttons: [{ id: "a", title: "   " }] })],
    ["a button title on two lines", buttons({ buttons: [{ id: "a", title: "Yes\nplease" }] })],
    ["an empty body", buttons({ body: " " })],
    ["a buttons body over 1024 characters", buttons({ body: "b".repeat(1025) })],
    ["a header over 60 characters", buttons({ header: "h".repeat(61) })],
    ["a footer over 60 characters", buttons({ footer: "f".repeat(61) })],
    ["eleven rows", list({ sections: [{ rows: Array.from({ length: LIST_ROWS_MAX + 1 }, (_, i) => row(i)) }] })],
    ["a row title over 24 characters", list({ sections: [{ rows: [{ id: "r", title: "t".repeat(25) }] }] })],
    ["a row description over 72 characters", list({ sections: [{ rows: [{ ...row(1), description: "d".repeat(73) }] }] })],
    ["a row id over 200 characters", list({ sections: [{ rows: [{ id: "x".repeat(201), title: "Fri" }] }] })],
    ["two rows with one id", list({ sections: [{ rows: [row(1), { ...row(2), id: "slot:1" }] }] })],
    ["several sections without titles", list({ sections: [{ rows: [row(1)] }, { rows: [row(2)] }] })],
    ["an empty section", list({ sections: [{ title: "Morning", rows: [] }] })],
    ["no sections", list({ sections: [] })],
    ["a list button label over 20 characters", list({ button: "b".repeat(21) })],
    ["a list body over 4096 characters", list({ body: "b".repeat(4097) })],
    ["an unknown type", { ...buttons(), type: "carousel" }],
  ])("refuses %s", (_why, message) => {
    expect(valid(message)).toBe(false);
  });
});

describe("interactiveSummary", () => {
  it("shows the text and the buttons it offered", () => {
    expect(interactiveSummary(buttons({ footer: "Reply STOP to opt out" }))).toBe(
      "Your site visit is tomorrow at 5:00 pm.\n\nReply STOP to opt out\n\n[Confirm] [Reschedule] [Cancel]",
    );
  });

  it("shows the header, the text and every row of a list, with descriptions", () => {
    const message = list({ header: "Site visit", sections: [{ title: "Friday", rows: [row(5), { ...row(6), description: "With Priya" }] }] });
    expect(interactiveSummary(message)).toBe("Site visit\n\nWhich time suits you?\n\n• Fri 9 Oct, 5:00 pm\n• Fri 9 Oct, 6:00 pm (With Priya)");
  });
});
