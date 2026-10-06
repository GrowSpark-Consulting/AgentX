import { test as setup, expect } from "@playwright/test";
import { OWNER_STATE } from "../../playwright.config";
import { PASSWORD } from "./support/app";

// Signs in once as owner@test.local and saves the session for every project that needs it.
setup("sign in as the owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@test.local");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Test Realty" })).toBeVisible();
  await page.context().storageState({ path: OWNER_STATE });
});
