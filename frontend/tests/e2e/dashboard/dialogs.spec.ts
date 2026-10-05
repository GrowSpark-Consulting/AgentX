import { type Page } from "@playwright/test";
import { expect, expectNoHorizontalOverflow, isMobileWidth, openApp, test, topBar } from "./fixtures";

const dialog = (page: Page) => page.locator(".dialog");

/** On tablet and mobile a deep-linked chat opens with the lead card sheet on top; close it first. */
async function closeLeadSheetIfOpen(page: Page) {
  const close = page.getByRole("button", { name: "Close", exact: true });
  if (await close.isVisible()) await close.click();
}

test.describe("dialogs", () => {
  test("top-up: pick a pack, pay, credits are added", async ({ page }) => {
    await openApp(page);
    await topBar(page).getByRole("button", { name: /credits/ }).click();
    await expect(dialog(page)).toContainText("Top up credits");
    await expectNoHorizontalOverflow(page);
    await dialog(page).getByRole("button", { name: /1,000 credits/ }).click();
    await dialog(page).getByRole("button", { name: "Pay ₹2,398 with UPI" }).click();
    await expect(dialog(page)).toContainText("1,000 credits added");
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(topBar(page).getByRole("button", { name: /2,840 credits/ })).toBeVisible();
  });

  test("top-up: Cancel and the backdrop both close without charging", async ({ page }) => {
    await openApp(page);
    const pill = topBar(page).getByRole("button", { name: /1,840 credits/ });
    await pill.click();
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await pill.click();
    await page.locator(".dialog-backdrop").click({ position: { x: 5, y: 5 } });
    await expect(dialog(page)).toHaveCount(0);
    await expect(pill).toBeVisible();
  });

  test("upgrade: a locked feature opens the plan dialog and upgrading unlocks it", async ({ page }) => {
    await openApp(page, "plan=starter&screen=features");
    const upgrade = page.getByRole("button", { name: "Upgrade" });
    const lockedBefore = await upgrade.count();
    expect(lockedBefore).toBeGreaterThan(0);
    await upgrade.first().click();
    await expect(dialog(page)).toContainText(/is on the Growth plan/);
    await expect(dialog(page)).toContainText("Credits a month");
    await dialog(page).getByRole("button", { name: "Upgrade to Growth" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText(/You’re on Growth/)).toBeVisible();
    expect(await upgrade.count()).toBeLessThan(lockedBefore);
  });

  test("upgrade: backdrop closes the dialog", async ({ page }) => {
    await openApp(page, "plan=starter&screen=features");
    await page.getByRole("button", { name: "Upgrade" }).first().click();
    await expect(dialog(page)).toBeVisible();
    await page.locator(".dialog-backdrop").click({ position: { x: 5, y: 5 } });
    await expect(dialog(page)).toHaveCount(0);
  });

  test("template: a chat outside the 24-hour window can only send an approved template", async ({ page }) => {
    await openApp(page, "screen=inbox&chat=anitha");
    await closeLeadSheetIfOpen(page);
    await expect(page.getByText("24-hour window closed.")).toBeVisible();
    await page.getByRole("button", { name: "Send a template" }).click();
    await expect(dialog(page)).toContainText("Send a template to Anitha");
    await dialog(page).getByRole("button", { name: /Rebooking offer/ }).click();
    await dialog(page).getByRole("button", { name: "Send template" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText("Template sent · noshow_rebook_v1 · 2 credits")).toBeVisible();
    await expect(page.getByText("24-hour window closed.")).toHaveCount(0);
  });

  test("settings: disconnect WhatsApp asks for confirmation", async ({ page }) => {
    await openApp(page, "screen=settings");
    await page.getByRole("button", { name: "WhatsApp number", exact: true }).click();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(dialog(page)).toContainText("Disconnect +91 98400 12345?");
    await dialog(page).getByRole("button", { name: "Keep connected" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText("Disconnected", { exact: true }).first()).toBeVisible();
  });

  test("settings: closing the account requires typing the business name", async ({ page }) => {
    await openApp(page, "screen=settings");
    await page.getByRole("button", { name: "Data & privacy", exact: true }).click();
    await page.getByRole("button", { name: /^Close Skyline Homes\s?’s account$/ }).click();
    await expect(dialog(page)).toContainText("Close Skyline Homes’s account?");
    const confirm = dialog(page).getByRole("button", { name: "Close account", exact: true });
    await expect(confirm).toBeDisabled();
    await dialog(page).getByPlaceholder("Skyline Homes").fill("Skyline Homes");
    await expect(confirm).toBeEnabled();
    await dialog(page).getByRole("button", { name: "Keep my account" }).click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test("inbox: lead card opens as a sheet below 1180px and inline above", async ({ page }) => {
    await openApp(page, "screen=inbox");
    if (isMobileWidth(page)) await page.getByRole("button", { name: /Karthik R/ }).click();
    const wide = (page.viewportSize()?.width ?? 0) >= 1180;
    if (wide) {
      await expect(page.getByRole("button", { name: "Lead", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open lead" })).toBeVisible();
      return;
    }
    await page.getByRole("button", { name: "Lead", exact: true }).click();
    await expect(page.getByRole("button", { name: "Open lead" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("button", { name: "Open lead" })).toHaveCount(0);
  });
});
