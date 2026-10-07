import type { Page } from "@playwright/test";
import { appAlert, expect, MOCK_SUPABASE_URL, SIGNED_OUT, test } from "../support/app";

/** Clicks "Continue with Google" and waits for the (mock) Google account chooser. */
async function continueWithGoogle(page: Page) {
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Choose an account" })).toBeVisible();
}

test.describe("Continue with Google", () => {
  test.use({ storageState: SIGNED_OUT });

  test("is offered on sign-in and sign-up", async ({ page }) => {
    for (const path of ["/login", "/signup"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    }
  });

  test("sends the browser to Supabase's Google sign-in with PKCE and our callback", async ({ page }) => {
    await page.goto("/login?next=%2Fdashboard%2Fwhatsapp");
    await continueWithGoogle(page);
    const authorize = new URL(page.url());
    expect(authorize.origin + authorize.pathname).toBe(`${MOCK_SUPABASE_URL}/auth/v1/authorize`);
    expect(authorize.searchParams.get("provider")).toBe("google");
    expect(authorize.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorize.searchParams.get("code_challenge_method")).toBe("s256");
    const redirectTo = new URL(authorize.searchParams.get("redirect_to")!);
    expect(redirectTo.pathname).toBe("/auth/callback");
    expect(redirectTo.searchParams.get("next")).toBe("/dashboard/whatsapp");
  });

  test("an existing account signs in to the dashboard, from sign-in or sign-up", async ({ page, context }) => {
    await page.goto("/login?next=%2Fdashboard%2Fwhatsapp");
    await continueWithGoogle(page);
    await page.getByRole("link", { name: "owner@test.local" }).click();
    await expect(page).toHaveURL(/\/dashboard\/whatsapp$/);
    await expect(page.getByTestId("tenant-identity")).toContainText("Test Realty");

    // The session is a normal cookie session: it survives a reload and logs out as usual.
    await page.reload();
    await expect(page.getByTestId("tenant-identity")).toContainText("Test Realty");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await context.clearCookies();
    await page.goto("/signup");
    await continueWithGoogle(page);
    await page.getByRole("link", { name: "owner@test.local" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Test Realty" })).toBeVisible();
  });

  test("a new account goes to the existing onboarding, from sign-up or sign-in", async ({ page, context }) => {
    await page.goto("/signup");
    await continueWithGoogle(page);
    await page.getByRole("link", { name: "Use a new Google account" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();

    await context.clearCookies();
    await page.goto("/login");
    await continueWithGoogle(page);
    await page.getByRole("link", { name: "Use a new Google account" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    // Signed in without a business yet: /signup leads back to onboarding, not a blank form, while
    // /login stays the real sign-in page.
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("cancelling at Google gives a safe message on the page you started from", async ({ page }) => {
    await page.goto("/signup");
    await continueWithGoogle(page);
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/signup\?error=signin_cancelled$/);
    await expect(appAlert(page)).toContainText("Sign-in was cancelled.");
    await expect(page.getByText("The user denied the request")).toHaveCount(0);

    await page.goto("/login");
    await continueWithGoogle(page);
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/login\?error=signin_cancelled$/);
  });

  test("a failed code exchange gives a safe message and no session", async ({ page }) => {
    // No PKCE verifier cookie in this browser, and the code is unknown to Supabase.
    await page.goto("/auth/callback?code=forged-code&next=%2Fdashboard");
    await expect(page).toHaveURL(/\/login\?error=signin_failed$/);
    await expect(appAlert(page)).toContainText("We couldn't finish signing you in.");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);

    // An error code we never send is not shown at all.
    await page.goto("/login?error=%3Cb%3Eraw%3C%2Fb%3E");
    await expect(appAlert(page)).toHaveCount(0);
  });

  test("an unsafe next never leaves the app", async ({ page, context }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example.com%2Fsteal");
    await continueWithGoogle(page);
    const redirectTo = new URL(new URL(page.url()).searchParams.get("redirect_to")!);
    expect(redirectTo.searchParams.get("next")).toBe("/dashboard");
    await page.getByRole("link", { name: "owner@test.local" }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/dashboard$/);

    // Signed out again, so the failure lands on /login instead of being bounced to the dashboard.
    await context.clearCookies();
    await page.goto("/auth/callback?code=forged-code&next=%2F%2Fevil.example.com");
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/login\?error=signin_failed$/);
  });
});
