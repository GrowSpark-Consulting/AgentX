import type { Page } from "@playwright/test";
import { expect, MOCK_SUPABASE_URL, SIGNED_OUT, signIn, signUp, test, uniqueEmail } from "../support/app";

// Onboarding's Business step creates the account's trial business through createTrialTenant (the
// mock implements create_trial_tenant like migration 0006). Signing up alone creates nothing.

type Business = {
  memberships: { tenantId: string; name: string; vertical: string; status: string; planKey: string; role: string; credits: number | null; routeCode: string | null }[];
  trialCalls: number;
};
async function business(page: Page, email: string): Promise<Business> {
  const res = await page.request.get(`${MOCK_SUPABASE_URL}/__mock/business?email=${encodeURIComponent(email)}`);
  return res.json();
}

const next = (page: Page, label: string | RegExp) => page.getByRole("button", { name: label });
const trade = (page: Page, name: string) => page.getByRole("radio", { name: new RegExp(`^${name}`) });

/** Opens the wizard with a frozen clock (its import animation runs on timers) and passes the phone step. */
async function toBusinessStep(page: Page) {
  await page.clock.install({ time: new Date("2026-10-24T09:00:00+05:30") });
  await page.goto("/onboarding");
  await next(page, "Send code on WhatsApp").click();
  await page.getByPlaceholder("––––––").fill("123456");
  await next(page, "Verify and continue").click();
  await expect(page.getByRole("heading", { name: "Tell us about your business" })).toBeVisible();
}

async function newAccount(page: Page) {
  const email = uniqueEmail();
  await signUp(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  return email;
}

test.describe("trial signup from onboarding", () => {
  test.use({ storageState: SIGNED_OUT });

  test("signing up creates no business; the Business step creates exactly one trial", async ({ page }) => {
    const email = await newAccount(page);
    expect(await business(page, email)).toEqual({ memberships: [], trialCalls: 0 });

    await toBusinessStep(page);
    await page.getByLabel("Business name").fill("  Sunrise Homes ");
    await trade(page, "Real estate").click();
    await next(page, "Continue").click();
    await expect(page.getByRole("heading", { name: "Teach your assistant" })).toBeVisible();

    const first = await business(page, email);
    expect(first.trialCalls).toBe(1);
    expect(first.memberships).toEqual([
      {
        tenantId: expect.any(String),
        name: "Sunrise Homes",
        vertical: "real-estate",
        status: "trial",
        planKey: "trial",
        role: "owner",
        credits: 300,
        routeCode: expect.stringMatching(/^TRIAL-[2-9A-HJKMNP-Z]{4}$/),
      },
    ]);
    const { routeCode } = first.memberships[0];

    // Back and Continue again: the account has a business now, so nothing new is created.
    await next(page, "Back").click();
    await next(page, "Continue").click();
    await expect(page.getByRole("heading", { name: "Teach your assistant" })).toBeVisible();
    await next(page, "Back").click();
    await expect(page.getByText("Your account already belongs to a business, so no new one was created.")).toBeVisible();
    expect(await business(page, email)).toEqual(first);

    // The rest of the wizard shows the real trial instead of the prototype's sample code and credits.
    await next(page, "Continue").click();
    await next(page, "Import").click();
    for (let i = 0; i < 6; i++) {
      await page.clock.runFor(600);
      await page.waitForTimeout(30);
    }
    await next(page, "Looks good").click();
    await expect(page.getByText(`Your code is ${routeCode}.`)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open WhatsApp test chat" })).toHaveAttribute("href", new RegExp(`\\?text=${routeCode}$`));
    await expect(page.getByText("TRIAL-7F3K")).toHaveCount(0);
    await next(page, "I’ve tried it").click();
    await next(page, "Do this later").click();
    await next(page, "Go live").click();
    await expect(page.getByText(`Test number · code ${routeCode}`)).toBeVisible();
    await expect(page.getByText("7 days · 300 credits")).toBeVisible();
    await expect(page.getByText("150 credits")).toHaveCount(0);

    // Into the dashboard as the new business's owner, with the real Day 1 screens.
    await page.getByRole("link", { name: "Go to my dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sunrise Homes" })).toBeVisible();
    await expect(page.getByTestId("no-business")).toHaveCount(0);

    await page.goto("/dashboard/whatsapp");
    await expect(page.getByRole("heading", { level: 1, name: "WhatsApp connection" })).toBeVisible();
    await expect(page.getByText("No WhatsApp number connected")).toBeVisible();
    await expect(page.getByTestId("no-business")).toHaveCount(0);

    await page.goto("/dashboard/messages/test");
    await expect(page.getByRole("heading", { level: 1, name: "Send a test message" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send test message" })).toBeVisible();
    await expect(page.getByTestId("no-business")).toHaveCount(0);

    await page.goto("/dashboard/templates/new");
    await expect(page.getByRole("heading", { level: 1, name: "Create a message template" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
    await expect(page.getByTestId("no-business")).toHaveCount(0);

    // Back in the wizard later, the Business step still creates nothing.
    await toBusinessStep(page);
    await page.getByLabel("Business name").fill("Another Business");
    await trade(page, "Salon").click();
    await next(page, "Continue").click();
    await expect(page.getByRole("heading", { name: "Teach your assistant" })).toBeVisible();
    expect(await business(page, email)).toEqual(first);
  });

  test("a trade without a pack can't start a trial", async ({ page }) => {
    const email = await newAccount(page);
    await toBusinessStep(page);
    await page.getByLabel("Business name").fill("Hotel Kaveri");
    for (const name of ["Hotel", "Restaurant", "Plumber / Electrician"]) {
      await trade(page, name).click();
      await expect(page.getByText("Trials for this trade aren’t open yet.")).toBeVisible();
      await expect(next(page, "Continue")).toBeDisabled();
    }
    expect(await business(page, email)).toEqual({ memberships: [], trialCalls: 0 });

    await trade(page, "Interior design").click();
    await expect(page.getByText("Trials for this trade aren’t open yet.")).toHaveCount(0);
    await next(page, "Continue").click();
    await expect(page.getByRole("heading", { name: "Teach your assistant" })).toBeVisible();
    const { memberships } = await business(page, email);
    expect(memberships).toMatchObject([{ name: "Hotel Kaveri", vertical: "interiors", role: "owner" }]);
  });

  for (const member of ["owner@test.local", "staff@test.local"]) {
    test(`an existing member (${member}) gets no new trial`, async ({ page }) => {
      const before = await business(page, member);
      await signIn(page, member);
      await expect(page).toHaveURL(/\/dashboard$/);
      await toBusinessStep(page);
      await page.getByLabel("Business name").fill("Side Business");
      await trade(page, "Salon").click();
      await next(page, "Continue").click();
      await expect(page.getByRole("heading", { name: "Teach your assistant" })).toBeVisible();
      await next(page, "Back").click();
      await expect(page.getByText("Your account already belongs to a business, so no new one was created.")).toBeVisible();
      expect(await business(page, member)).toEqual(before);
      expect(before.trialCalls).toBe(0);
    });
  }
});
