import { test as base, expect, type Page } from "@playwright/test";
import { SIGNED_OUT, signUp, uniqueEmail } from "../support/app";

/** Any console error or uncaught page error fails the test. */
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(String(e)));
      await use(errors);
      expect(errors, "console errors").toEqual([]);
    },
    { auto: true },
  ],
});

/** The wizard's footer button that moves to the next step (label changes per step). */
const next = (page: Page, label: string | RegExp) => page.getByRole("button", { name: label });
/** Trade, coexistence and manual-mode pickers are radio-like buttons. */
const option = (page: Page, text: string) => page.locator("button").filter({ hasText: text }).first();

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(0);
}

/** Runs the prototype's timers (import animation, connection checks) with a frozen clock. */
async function advance(page: Page, ms: number, times: number) {
  for (let i = 0; i < times; i++) {
    await page.clock.runFor(ms);
    await page.waitForTimeout(30);
  }
}

async function openOnboarding(page: Page) {
  await page.clock.install({ time: new Date("2026-10-24T09:00:00+05:30") });
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
}

/** Walks the wizard to the given step heading, picking a trade on the Business step. */
async function walkTo(page: Page, stop: "WhatsApp" | "Team" | "Live", trade = "Real estate", { codeSent = false } = {}) {
  if (!codeSent) await next(page, "Send code on WhatsApp").click();
  await page.getByPlaceholder("––––––").fill("123456");
  await next(page, "Verify and continue").click();
  await page.getByLabel("Business name").fill("Sunrise Homes");
  await option(page, trade).click();
  await next(page, "Continue").click();
  await next(page, "Import").click();
  await advance(page, 600, 6);
  await next(page, "Looks good").click();
  await next(page, "I’ve tried it").click();
  if (stop === "WhatsApp") return;
  await next(page, "Do this later").click();
  if (stop === "Team") return;
  await next(page, "Go live").click();
}

test("/ redirects to /onboarding", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
});

test("walks every step without overflow, and Back returns", async ({ page }) => {
  await openOnboarding(page);
  await expectNoHorizontalOverflow(page);

  await next(page, "Send code on WhatsApp").click();
  const verify = next(page, "Verify and continue");
  await expect(verify).toBeDisabled();
  await page.getByPlaceholder("––––––").fill("123456");
  await verify.click();

  await expect(page.getByRole("heading", { name: "Tell us about your business" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  // The name starts empty (the trade's sample is only a placeholder) and is required.
  const name = page.getByLabel("Business name");
  await expect(name).toHaveValue("");
  await expect(name).toHaveAttribute("placeholder", "Skyline Homes");
  await expect(next(page, "Continue")).toBeDisabled();
  await option(page, "Salon").click();
  await expect(name).toHaveValue("");
  await name.fill("   ");
  await expect(next(page, "Continue")).toBeDisabled();
  await name.fill("Glow Studio");
  await next(page, "Continue").click();

  await expect(page.getByRole("heading", { name: "Teach your assistant" })).toBeVisible();
  await expect(next(page, "Looks good")).toBeDisabled();
  await next(page, "Import").click();
  await advance(page, 600, 6);
  await expect(next(page, "Looks good")).toBeEnabled();
  await expectNoHorizontalOverflow(page);
  await next(page, "Looks good").click();

  await expect(page.getByRole("heading", { name: "Try your assistant now" })).toBeVisible();
  await next(page, "Back").click();
  await expect(page.getByRole("heading", { name: "Teach your assistant" })).toBeVisible();
  await next(page, "Looks good").click();
  await next(page, "I’ve tried it").click();

  await expect(page.getByRole("heading", { name: "Connect your WhatsApp number" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await next(page, "Do this later").click();

  await expect(page.getByRole("heading", { name: "Team, calendar and features" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await next(page, "Go live").click();

  await expect(page.getByRole("link", { name: "Go to my dashboard" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Connect with Facebook: pop-up steps, checks, then live", async ({ page }) => {
  await openOnboarding(page);
  await walkTo(page, "WhatsApp");
  await next(page, "Continue with Facebook").click();
  const popup = page.getByRole("dialog");
  for (const cta of ["Continue", "Next", "Next", "Verify", "Finish"]) {
    await popup.getByRole("button", { name: cta, exact: true }).click();
  }
  await expect(popup).toHaveCount(0);
  await advance(page, 700, 8);
  await expect(next(page, /^Continue$/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("manual partner access fails without IDs, then waits for “hi”", async ({ page }) => {
  await openOnboarding(page);
  await walkTo(page, "WhatsApp");
  await option(page, "Manual connection").click();
  await next(page, "Check connection").click();
  await advance(page, 700, 3);
  await expect(next(page, "Fix details")).toBeVisible();
  await next(page, "Fix details").click();
  await page.getByPlaceholder("234567890123456").fill("234567890123456");
  await page.getByPlaceholder("109876543210987").fill("109876543210987");
  await next(page, "Check connection").click();
  await advance(page, 700, 8);
  await next(page, "Prototype: “hi” received").click();
  await expect(next(page, /^Continue$/)).toBeVisible();
});

test.describe("onboarding → dashboard", () => {
  // Signed in through the project's storage state: /dashboard is the signed-in home.
  test("completing onboarding is a full page load to /dashboard", async ({ page }) => {
    await openOnboarding(page);
    await walkTo(page, "Live");
    // A marker on window survives a client-side render but not a new document.
    await page.evaluate(() => ((window as unknown as { __onboardingDoc: boolean }).__onboardingDoc = true));
    await page.getByRole("link", { name: "Go to my dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Test Realty" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __onboardingDoc?: boolean }).__onboardingDoc)).toBeUndefined();
    // The dashboard document has neither the onboarding wizard nor its font class on <html>.
    await expect(page.getByRole("heading", { name: "Start your free trial" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.className)).toBe("");
    await expectNoHorizontalOverflow(page);
  });

});

test.describe("onboarding needs an account", () => {
  test.use({ storageState: SIGNED_OUT });

  test("signed out, / and /onboarding go to sign-up", async ({ page }) => {
    for (const path of ["/", "/onboarding"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/signup\?next=%2Fonboarding$/);
      await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
    }
  });

  test("a new account walks the existing wizard, with the same dummy WhatsApp code and no email code", async ({ page }) => {
    await signUp(page, uniqueEmail());
    await expect(page).toHaveURL(/\/onboarding$/);

    // Reload with the frozen clock the wizard's timers need; the session cookie carries over.
    await openOnboarding(page);
    await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();
    await expect(page.getByLabel(/email/i)).toHaveCount(0);
    await next(page, "Send code on WhatsApp").click();
    await expect(page.getByText(/6-digit code sent to \+91/)).toBeVisible();
    await expect(page.getByText(/sent to .*@/)).toHaveCount(0);

    await walkTo(page, "Live", "Salon", { codeSent: true });
    await expect(page.getByRole("link", { name: "Go to my dashboard" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
