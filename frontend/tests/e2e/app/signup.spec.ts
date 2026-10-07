import { appAlert, expect, expectNoHorizontalOverflow, MOCK_SUPABASE_URL, PASSWORD, SIGNED_OUT, signIn, signUp, test, uniqueEmail } from "../support/app";

test.describe("email and password signup", () => {
  test.use({ storageState: SIGNED_OUT });

  test("a signed-out visitor gets the real signup page, never onboarding", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start your free trial" })).toHaveCount(0);
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("validates the form before calling Supabase", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();

    await signUp(page, uniqueEmail(), "short");
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();

    await signUp(page, uniqueEmail(), PASSWORD, "something-else");
    await expect(page.getByText("Passwords don't match")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("a new account goes straight to the existing onboarding, and keeps going there until it has a business", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();

    // Signed in now, still without a business: /signup leads back to onboarding, while /login is
    // still the real sign-in page (opening it decides nothing).
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    // The e2e server runs the development dashboard, which shows the shell with empty states.
    await page.goto("/dashboard");
    await expect(page.getByTestId("tenant-identity")).toContainText("No business yet");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Signing back in is not a new signup, but the account still has its business to set up.
    await signIn(page, email);
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
  });

  test("with email confirmation on, shows 'check your email' and the link opens onboarding", async ({ page }) => {
    const email = uniqueEmail("confirm.test.local");
    await signUp(page, email);
    await expect(page.getByText("Check your email")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(appAlert(page)).toHaveCount(0);

    const res = await page.request.get(`${MOCK_SUPABASE_URL}/__mock/last-email?to=${encodeURIComponent(email)}`);
    const { link } = (await res.json()) as { link: string };
    await page.goto(link);
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
  });

  test("an address that already has an account gets the same screen as a new one", async ({ page }) => {
    for (const email of ["owner@test.local", "OWNER@test.local"]) {
      await signUp(page, email);
      await expect(page.getByText("Check your email")).toBeVisible();
      await expect(page.getByText(/already (registered|exists|in use|taken)/i)).toHaveCount(0);
      await expect(appAlert(page)).toHaveCount(0);
      await expect(page).toHaveURL(/\/signup$/);
    }
  });

  test("an expired confirmation link gives a safe message", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid&next=%2Fonboarding");
    await expect(page).toHaveURL(/\/signup\?error=link_expired$/);
    await expect(appAlert(page)).toContainText("That link has expired or was already used.");
    await expect(page.getByText("Email link is invalid")).toHaveCount(0);
  });
});
