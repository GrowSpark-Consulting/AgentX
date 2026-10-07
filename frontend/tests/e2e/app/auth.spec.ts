import { FLAG_OFF_URL } from "../../../playwright.config";
import { appAlert, PASSWORD, SIGNED_OUT, expect, expectNoHorizontalOverflow, mainNav, signIn, test } from "../support/app";

test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT });

  test("protected pages redirect to sign-in and remember where you were going", async ({ page }) => {
    for (const path of ["/dashboard", "/dashboard/messages/test", "/dashboard/templates/new", "/dashboard/whatsapp", "/dashboard/preview"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    }
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("API routes refuse signed-out callers", async ({ request }) => {
    const res = await request.post("/api/messages/test", { data: { to: "+919840012345", body: "hi" } });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthenticated", message: "Your session has ended. Sign in again." } });
  });

  test("a signed-out visitor gets the real sign-in page", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  });

  test("shows field errors and a safe message for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Enter your password")).toBeVisible();

    await page.getByLabel("Email").fill("owner@test.local");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(appAlert(page)).toContainText("Email or password is incorrect.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signing in opens the dashboard with the business from the membership", async ({ page }) => {
    await signIn(page, "owner@test.local");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Test Realty" })).toBeVisible();
    await expect(page.getByTestId("tenant-identity")).toContainText("Test Realty");
    await expect(page.getByTestId("tenant-identity")).toContainText("Real estate · Owner");
    await expectNoHorizontalOverflow(page);
  });

  test("with a session already in place, submitting the sign-in form decides where you go", async ({ page }) => {
    await signIn(page, "owner@test.local");
    await expect(page).toHaveURL(/\/dashboard$/);

    // Opening /login shows the form; submitting it as an account with no business goes to onboarding,
    // and as a member goes to the dashboard. A wrong password stays on /login.
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.getByLabel("Email").fill("nomember@test.local");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(appAlert(page)).toContainText("Email or password is incorrect.");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@test.local");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("returns to the page you asked for, but never off-site", async ({ page }) => {
    await signIn(page, "owner@test.local", "/dashboard/whatsapp");
    await expect(page).toHaveURL(/\/dashboard\/whatsapp$/);

    await page.context().clearCookies();
    await signIn(page, "owner@test.local", "//evil.example.com/steal");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("keeps the session across reloads and new tabs, and logs out", async ({ page, context }) => {
    await signIn(page, "owner@test.local");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Test Realty" })).toBeVisible();
    const second = await context.newPage();
    await second.goto("/dashboard/templates/new");
    await expect(second.getByRole("heading", { level: 1, name: "Create a message template" })).toBeVisible();
    await second.close();

    // Opening /login with a session never redirects: the real sign-in page renders (both through the
    // proxy and as a server response). Only /signup sends a signed-in member to the app.
    const res = await page.request.get("/login", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await page.goto("/login?next=%2Fdashboard%2Fwhatsapp");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fwhatsapp$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Test Realty" })).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });
});

test.describe("tenant context", () => {
  test.use({ storageState: SIGNED_OUT });

  // Production behaviour (development flag off); the development view is in no-business.spec.ts.
  test("an account with no membership sees a clear empty state, not someone else's business", async ({ page }) => {
    test.skip(!FLAG_OFF_URL, "needs the flag-off server from playwright.config.ts");
    await page.goto(`${FLAG_OFF_URL}/login`);
    await page.getByLabel("Email").fill("nomember@test.local");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    // An existing account with no business is sent to set one up...
    await expect(page).toHaveURL(/:3101\/onboarding$/);
    // ...and the dashboard still refuses it a business that isn't its own.
    await page.goto(`${FLAG_OFF_URL}/dashboard`);
    await expect(page.getByText("Your account isn't linked to a business yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start a free trial" })).toBeVisible();
    await expect(mainNav(page)).toHaveCount(0);
    const res = await page.request.post(`${FLAG_OFF_URL}/api/templates`, { data: {} });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("no_membership");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/:3101\/login$/);
  });

  test("an account in several businesses chooses one; a forged choice is ignored", async ({ page, context }) => {
    await signIn(page, "multi@test.local");
    await expect(page.getByRole("heading", { name: "Which business are you working on?" })).toBeVisible();

    // A cookie naming a business the user isn't a member of changes nothing.
    await context.addCookies([{ name: "pakka_tenant", value: "10000000-0000-0000-0000-000000000003", url: page.url() }]);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Which business are you working on?" })).toBeVisible();

    await page.getByRole("button", { name: /Beta Salon/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Beta Salon" })).toBeVisible();
    await expect(page.getByTestId("tenant-identity")).toContainText("Salon · Admin");
  });

  test("every signed-in screen shows the business and the navigation", async ({ page }) => {
    await signIn(page, "owner@test.local");
    for (const [link, heading] of [
      ["Send test message", "Send a test message"],
      ["Create template", "Create a message template"],
      ["WhatsApp", "WhatsApp connection"],
      ["Home", "Test Realty"],
    ]) {
      await mainNav(page).getByRole("link", { name: link, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByTestId("tenant-identity")).toContainText("Test Realty");
      await expect(mainNav(page).getByRole("link", { name: link, exact: true })).toHaveAttribute("aria-current", "page");
      await expectNoHorizontalOverflow(page);
    }
    await mainNav(page).getByRole("link", { name: /Dashboard preview/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/preview$/);
    await expect(page.locator('[data-screen-label="03 Home"]')).toBeVisible();
  });
});
