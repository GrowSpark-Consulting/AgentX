import type { Page } from "@playwright/test";
import { appAlert, expect, expectNoHorizontalOverflow, mainNav, SIGNED_OUT, signIn, test } from "../support/app";
import { newDay3Account, open, writesBy } from "../support/day3";

// /dashboard/leads and /dashboard/leads/<id> (Day 3): the board by stage with temperature and score
// filters, and the lead detail with collected answers and timeline. Leads, contacts, conversations,
// messages, bookings and the pack's field labels come from mock-supabase.mjs under RLS (mocked E2E).
// Scores and temperatures are seeded as Dev 1's engine would store them; the UI only shows them.

const board = (page: Page) => page.getByTestId("leads-board");
const column = (page: Page, label: string) => board(page).getByRole("region", { name: new RegExp(`^${label} · \\d+$`) });
const card = (page: Page, name: string) => board(page).getByRole("link", { name: new RegExp(name) });
const chip = (page: Page, name: RegExp) => page.getByRole("group", { name: "Temperature" }).getByRole("button", { name });

test.describe("Leads board", () => {
  test.use({ storageState: SIGNED_OUT });

  test("shows a column for every stage with each lead's score, temperature and answers", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, "/dashboard/leads", "Leads");
    await expect(mainNav(page).getByRole("link", { name: "Leads" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("4 open · 2 hot")).toBeVisible();

    const stages = board(page).getByRole("region");
    await expect(stages).toHaveCount(9);
    await expect(stages.getByRole("heading")).toHaveText(["New", "Engaged", "Qualified", "Booked", "Visited", "Won", "Lost", "Nurture", "With staff"]);
    await expect(column(page, "Qualified")).toContainText("Karthik R");
    await expect(column(page, "New")).toContainText("Priya S");
    await expect(column(page, "Booked")).toContainText("Lakshmi V");
    await expect(column(page, "Won")).toContainText("Deepa N");
    await expect(column(page, "Visited")).toContainText("Nothing here");

    const karthik = card(page, "Karthik R");
    await expect(karthik.getByTestId("score-badge")).toHaveText("Hot 82");
    // Answers labelled by the business's pack, in the pack's order.
    await expect(karthik).toContainText("Preferred area: Velachery · Budget: ₹60,00,000 – ₹80,00,000");
    await expect(karthik).toContainText("+91 98xxx xxx21");
    await expect(card(page, "Priya S").getByTestId("score-badge")).toHaveText("Warm 55");
    await expect(card(page, "Lakshmi V").getByTestId("score-badge")).toHaveText("Cold 30");
    await expect(card(page, "Lakshmi V")).toContainText("No answers yet");
    // No name: the masked number, never the full one.
    const unnamed = column(page, "Engaged").getByRole("link");
    await expect(unnamed).toContainText("+91 90xxx xxx52");
    await expect(unnamed.getByTestId("score-badge")).toHaveText("Not scored");
    await expect(page.locator("body")).not.toContainText("9812345621");
    // Read-only: nothing was written.
    expect(await writesBy(request, account.email)).toEqual([]);
  });

  test("filters by hot, warm and cold as stored, and by a minimum score", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, "/dashboard/leads", "Leads");
    await expect(chip(page, /^All · 5$/)).toHaveAttribute("aria-pressed", "true");

    await chip(page, /^Hot · 2$/).click();
    await expect(chip(page, /^Hot/)).toHaveAttribute("aria-pressed", "true");
    await expect(board(page).getByRole("link")).toHaveCount(2);
    await expect(card(page, "Karthik R")).toBeVisible();
    await expect(card(page, "Deepa N")).toBeVisible();

    await chip(page, /^Warm · 1$/).click();
    await expect(board(page).getByRole("link")).toHaveCount(1);
    await expect(card(page, "Priya S")).toBeVisible();

    await chip(page, /^Cold · 1$/).click();
    await expect(board(page).getByRole("link")).toHaveCount(1);
    await expect(card(page, "Lakshmi V")).toBeVisible();

    await chip(page, /^Not scored · 1$/).click();
    await expect(board(page).getByRole("link")).toHaveCount(1);

    await chip(page, /^All/).click();
    await page.getByLabel("Score at least").fill("60");
    await expect(board(page).getByRole("link")).toHaveCount(2);
    await expect(card(page, "Priya S")).toHaveCount(0);

    await chip(page, /^Cold/).click();
    await expect(page.getByText("No leads match these filters")).toBeVisible();
    await expect(board(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(board(page).getByRole("link")).toHaveCount(5);
    await expect(page.getByLabel("Score at least")).toHaveValue("");

    await page.getByLabel("Score at least").fill("high");
    await expect(page.getByText("Enter a whole number, like 70")).toBeVisible();
    await expect(page.getByLabel("Score at least")).toHaveAttribute("aria-invalid", "true");
  });

  test("the board scrolls inside itself; the page never scrolls sideways", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, "/dashboard/leads", "Leads");
    await expect(card(page, "Karthik R")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const scroll = await board(page).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(scroll.scroll).toBeGreaterThan(scroll.client); // nine columns never fit; they scroll here
    await board(page).evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(column(page, "With staff")).toBeInViewport();
  });

  test("a business with no leads says so", async ({ page, request }) => {
    const account = await newDay3Account(request);
    await open(page, account, "/dashboard/leads", "Leads");
    await expect(page.getByText("No leads yet")).toBeVisible();
    await expect(board(page)).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Temperature" })).toHaveCount(0);
  });

  test("a failed read says so and offers to try again", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true, error: "leads" });
    await open(page, account, "/dashboard/leads", "Leads");
    await expect(appAlert(page)).toContainText("Couldn't load your leads");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});

test.describe("Lead detail", () => {
  test.use({ storageState: SIGNED_OUT });

  test("shows identity, stage, score, the answers collected and what's missing", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, "/dashboard/leads", "Leads");
    await card(page, "Karthik R").click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/leads/${account.ids.karthik}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Karthik R" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Leads" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("+91 98xxx xxx21 · Qualified · Not assigned")).toBeVisible();
    await expect(page.getByTestId("score-badge")).toHaveText("82Hot");
    await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toHaveText("Qualified");

    const answers = page.getByTestId("answer-row");
    await expect(answers).toHaveCount(4);
    await expect(answers.nth(0)).toContainText("Preferred area");
    await expect(answers.nth(0)).toContainText("Velachery");
    await expect(answers.nth(1)).toContainText("₹60,00,000 – ₹80,00,000");
    await expect(answers.nth(2)).toContainText("When are you planning");
    await expect(answers.nth(2)).toContainText("Not answered yet");
    // An answer the pack doesn't list is still shown.
    await expect(answers.nth(3)).toContainText("Parking needed");
    await expect(answers.nth(3)).toContainText("Yes");
    await expectNoHorizontalOverflow(page);
  });

  test("shows the timeline: chat, handover and bookings, oldest first", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, `/dashboard/leads/${account.ids.karthik}`, "Karthik R");
    const timeline = page.getByRole("list", { name: "Timeline" }).getByRole("listitem");
    await expect(timeline).toHaveCount(8);
    await expect(timeline.nth(0)).toContainText("Became a lead.");
    await expect(timeline.nth(1)).toContainText("Hi, is a 3BHK available in Velachery?");
    await expect(timeline.nth(2)).toContainText("AI");
    await expect(timeline.nth(3)).toContainText("60 to 80 L");
    await expect(timeline.nth(4)).toContainText("Handed to team");
    await expect(timeline.nth(5)).toContainText("Staff took over the chat (asked human).");
    await expect(timeline.nth(6)).toContainText("Consultation with Asha for Mon 12 Oct, 10:00 am · Confirmed");
    await expect(timeline.nth(7)).toContainText("Consultation with Ravi for Wed 14 Oct, 3:00 pm · Confirmed");
    await expect(page.getByText("Waiting for a person: asked human.")).toBeVisible();

    const bookings = page.getByRole("region", { name: "Bookings" });
    await expect(bookings).toContainText("Consultation with Asha");
    await expect(bookings).toContainText("Mon 12 Oct, 10:00 am – 11:00 am");

    await expect(page.getByRole("link", { name: "Open chat" })).toHaveAttribute("href", `/dashboard/inbox?chat=${account.ids.karthikChat}`);
  });

  test("a lapsed hold and a replaced booking are never shown as appointments", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, `/dashboard/leads/${account.ids.lakshmi}`, "Lakshmi V");
    const timeline = page.getByRole("list", { name: "Timeline" });
    await expect(timeline).toContainText("Consultation with Asha for Mon 12 Oct, 2:00 pm · Hold expired");
    await expect(timeline).toContainText("· Completed");
    await expect(page.getByRole("region", { name: "Bookings" })).not.toContainText("2:00 pm");
    await expect(page.getByTestId("answer-row").filter({ hasText: "Not answered yet" })).toHaveCount(3);
    await expect(page.getByText("Needed to qualify")).toHaveCount(2);

    await page.getByRole("link", { name: "← All leads" }).click();
    await expect(page).toHaveURL(/\/dashboard\/leads$/);
  });

  test("another business's lead, or a broken link, isn't shown", async ({ page, request }) => {
    const other = await newDay3Account(request, { seed: true });
    const account = await newDay3Account(request, { seed: true });
    await signIn(page, account.email, `/dashboard/leads/${other.ids.karthik}`);
    await expect(page.getByText("This lead isn't available")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Karthik R" })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Velachery");
    await page.goto("/dashboard/leads/not-a-lead");
    await expect(page.getByText("This lead isn't available")).toBeVisible();
  });
});
