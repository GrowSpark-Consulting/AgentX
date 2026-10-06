import type { Page } from "@playwright/test";
import { FLAG_OFF_URL } from "../../../playwright.config";
import { expect, expectNoHorizontalOverflow, mainNav, MOCK_SUPABASE_URL, SIGNED_OUT, signIn, signUp, test, uniqueEmail } from "../support/app";

// The development dashboard for a signed-in account with no business (DEV_DASHBOARD_WITHOUT_TENANT,
// on for the main e2e server). It renders the shell with empty states, invents no tenant, and every
// tenant-scoped path still refuses the account.

/** The other businesses in mock-supabase.mjs; none may ever appear for an account with no business. */
const OTHER_BUSINESSES = ["Test Realty", "Beta Salon", "Bright Interiors"];
const REALTY_ID = "10000000-0000-0000-0000-000000000001";

type RestCall = { method: string; table: string; query: string };
async function restCalls(page: Page, email: string): Promise<RestCall[]> {
  const res = await page.request.get(`${MOCK_SUPABASE_URL}/__mock/rest-log?email=${encodeURIComponent(email)}`);
  return res.json();
}

/** A brand-new account (no business), signed in, on /dashboard. */
async function newAccountOnDashboard(page: Page) {
  const email = uniqueEmail();
  await signUp(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto("/dashboard");
  return email;
}

test.describe("dashboard for an account with no business (development)", () => {
  test.use({ storageState: SIGNED_OUT });

  test("renders the shell and says every section is empty", async ({ page }) => {
    await newAccountOnDashboard(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(mainNav(page)).toBeVisible();
    await expect(page.getByTestId("tenant-identity")).toContainText("No business yet");
    await expect(page.getByTestId("tenant-identity")).toContainText("no business data");
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    await expect(page.getByTestId("no-business")).toHaveCount(2);
    await expect(page.getByText("No business linked")).toBeVisible();
    await expect(page.getByText("No WhatsApp number")).toBeVisible();
    await expect(page.getByText("Your account isn't linked to a business yet")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    // Pages that need a business show an empty state instead of their form or panel.
    for (const [link, heading] of [
      ["Send test message", "Send a test message"],
      ["Create template", "Create a message template"],
      ["WhatsApp", "WhatsApp connection"],
    ]) {
      await mainNav(page).getByRole("link", { name: link, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByTestId("no-business")).toBeVisible();
      await expect(page.locator("form").filter({ has: page.getByRole("button", { name: /send|submit/i }) })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("creates no tenant or membership and runs no tenant-scoped query", async ({ page }) => {
    const email = await newAccountOnDashboard(page);
    for (const path of ["/dashboard", "/dashboard/messages/test", "/dashboard/templates/new", "/dashboard/whatsapp"]) {
      await page.goto(path);
      await expect(page.getByTestId("no-business").first()).toBeVisible();
    }
    // "Start a free trial" is only a link to onboarding; following it creates nothing.
    await page.getByRole("link", { name: "Start a free trial" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto("/dashboard");
    await expect(page.getByTestId("tenant-identity")).toContainText("No business yet");

    const calls = await restCalls(page, email);
    expect(calls.length).toBeGreaterThan(0);
    // Only reads of the user's own memberships: no writes, no tenant-scoped tables, no made-up id.
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.table).toBe("memberships");
    }
    expect(JSON.stringify(calls)).not.toMatch(/tenant_id=eq\.(undefined|null|$)/);
  });

  test("shows no other business's data, even with a forged business cookie", async ({ page, context }) => {
    await newAccountOnDashboard(page);
    await context.addCookies([{ name: "pakka_tenant", value: REALTY_ID, url: page.url() }]);
    for (const path of ["/dashboard", "/dashboard/whatsapp"]) {
      await page.goto(path);
      await expect(page.getByTestId("tenant-identity")).toContainText("No business yet");
      for (const name of OTHER_BUSINESSES) await expect(page.getByText(name)).toHaveCount(0);
    }
    // Tenant-scoped API routes still refuse the account.
    for (const route of ["/api/templates", "/api/messages/test"]) {
      const res = await page.request.post(route, { data: {} });
      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe("no_membership");
    }
  });

  test("logging out still works and the dashboard needs sign-in again", async ({ page }) => {
    await newAccountOnDashboard(page);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test("a member still gets their own business", async ({ page }) => {
    await signIn(page, "owner@test.local");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Test Realty" })).toBeVisible();
    await expect(page.getByTestId("tenant-identity")).toContainText("Real estate · Owner");
    await expect(page.getByTestId("no-business")).toHaveCount(0);
  });

  test("signed out, every dashboard page still redirects to sign-in", async ({ page }) => {
    for (const path of ["/dashboard", "/dashboard/whatsapp", "/dashboard/templates/new"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    }
  });
});

test.describe("dashboard for an account with no business (flag off: production behaviour)", () => {
  test.use({ storageState: SIGNED_OUT });

  test("keeps the blocking 'not linked to a business' screen and no shell", async ({ page }) => {
    test.skip(!FLAG_OFF_URL, "needs the flag-off server from playwright.config.ts");
    const email = uniqueEmail();
    await signUp(page, email);
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto(`${FLAG_OFF_URL}/dashboard`);
    await expect(page.getByText("Your account isn't linked to a business yet")).toBeVisible();
    await expect(mainNav(page)).toHaveCount(0);
    await expect(page.getByTestId("no-business")).toHaveCount(0);
    // A tenant page can't be reached around the gate either.
    await page.goto(`${FLAG_OFF_URL}/dashboard/whatsapp`);
    await expect(page.getByText("Your account isn't linked to a business yet")).toBeVisible();
  });
});
