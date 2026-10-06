import { test as base, expect, type Page } from "@playwright/test";

/** Password for every account in mock-supabase.mjs. */
export const PASSWORD = "e2e-password-1";

/** Signed-out browser state, for tests that start without a session. */
export const SIGNED_OUT = { cookies: [], origins: [] };

/**
 * `test` with a console guard: any console error or page error fails the test. The one exception is
 * the browser's own "Failed to load resource" line for our API routes, which tests trigger on
 * purpose to check error states (the response is asserted instead).
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        if (m.text().startsWith("Failed to load resource") && m.location().url.includes("/api/")) return;
        errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(String(e)));
      await use(errors);
      expect(errors, "console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Mock Supabase (tests/e2e/support/mock-supabase.mjs), for reading the emails it "sends". */
export const MOCK_SUPABASE_URL = "http://127.0.0.1:54399";

/** An address no other test (or project) uses. `@confirm.test.local` needs email confirmation. */
export function uniqueEmail(domain: "test.local" | "confirm.test.local" = "test.local") {
  return `new-${crypto.randomUUID()}@${domain}`;
}

/** Fills in and submits the signup form. */
export async function signUp(page: Page, email: string, password = PASSWORD, confirm = password) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(confirm);
  await page.getByRole("button", { name: "Create account" }).click();
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(0);
}

/** The app shell's main navigation (sidebar on desktop, scrolling row on phones). */
export const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

/** Our ErrorState (role="alert"), not Next.js's route announcer, which also has role="alert". */
export const appAlert = (page: Page) => page.locator('[role="alert"].app-state');
