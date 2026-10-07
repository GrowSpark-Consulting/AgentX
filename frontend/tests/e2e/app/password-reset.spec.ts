import { appAlert, expect, expectNoHorizontalOverflow, MOCK_SUPABASE_URL, PASSWORD, SIGNED_OUT, signUp, test, uniqueEmail } from "../support/app";

test.describe("forgot password", () => {
  test.use({ storageState: SIGNED_OUT });

  test("is linked from sign-in and gives the same answer for any address", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole("heading", { name: "Forgot password" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();

    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();
    await expect(appAlert(page)).toHaveCount(0);
  });

  test("the emailed link opens the new-password form; the new password signs in", async ({ page, context }) => {
    // A fresh account (no business yet), so no other test's sign-in is affected.
    const email = uniqueEmail();
    await signUp(page, email);
    await expect(page).toHaveURL(/\/onboarding$/);
    await context.clearCookies();

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();

    const res = await page.request.get(`${MOCK_SUPABASE_URL}/__mock/last-email?to=${encodeURIComponent(email)}`);
    const { link } = (await res.json()) as { link: string };
    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill("short");
    await page.getByLabel("Confirm new password").fill("short");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm new password").fill(PASSWORD);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(appAlert(page)).toContainText("Choose a password you haven't used for this account before.");

    const fresh = "brand-new-password-2";
    await page.getByLabel("New password", { exact: true }).fill(fresh);
    await page.getByLabel("Confirm new password").fill(fresh);
    await page.getByRole("button", { name: "Save new password" }).click();
    // Still no business: on to onboarding.
    await expect(page).toHaveURL(/\/onboarding$/);

    // The old password no longer works; the new one does.
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(appAlert(page)).toContainText("Email or password is incorrect.");
    await page.getByLabel("Password").fill(fresh);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    // A reset link works once.
    await context.clearCookies();
    await page.goto(link);
    await expect(page).toHaveURL(/\/forgot-password\?error=link_expired$/);
    await expect(appAlert(page)).toContainText("That reset link has expired or was already used.");
  });

  test("the new-password form needs the link's session", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/forgot-password\?error=link_expired$/);
    await expect(page.getByRole("heading", { name: "Forgot password" })).toBeVisible();
  });
});
