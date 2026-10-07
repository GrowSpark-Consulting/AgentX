import { API_URL } from "../../../playwright.config";
import type { Page } from "@playwright/test";
import { appAlert, asUser, SIGNED_OUT, expect, expectNoHorizontalOverflow, signIn, test } from "../support/app";

const RECHECK_OFF = "Recheck will be available when the connection service is switched on.";
const DISCONNECT_OFF = "Disconnecting will be available when the connection service is switched on.";

const card = (page: Page) => page.getByRole("list", { name: "WhatsApp numbers" }).getByRole("listitem");
const recheck = (page: Page) => page.getByRole("button", { name: "Recheck connection" });
const disconnect = (page: Page) => page.getByRole("button", { name: "Disconnect", exact: true });

/** Only public, non-secret fields reach the page, whatever the status. */
async function expectNoSecrets(page: Page) {
  await expect(page.locator("body")).not.toContainText(/token|secret|EAA[A-Za-z0-9]/i);
}

// Each account in mock-supabase.mjs returns a different answer from whatsapp_connections_public.
test.describe("WhatsApp connection panel", () => {
  test.use({ storageState: SIGNED_OUT });

  test("while the public view doesn't exist yet", async ({ page }) => {
    await signIn(page, "owner@test.local", "/dashboard/whatsapp");
    await expect(page.getByText("WhatsApp connection details aren't available yet")).toBeVisible();
    await expect(appAlert(page)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("connected", async ({ page }) => {
    await signIn(page, "connected@test.local", "/dashboard/whatsapp");
    await expect(card(page)).toContainText("Connected");
    await expect(card(page)).toContainText("+91 98400 12345");
    await expect(card(page)).toContainText("Shows as “Bright Interiors”");
    await expect(card(page)).toContainText("Your assistant replies to customers from this number.");
    await expect(card(page)).toContainText("GREEN");
    await expect(card(page)).toContainText("TIER_1K");
    await expect(card(page)).toContainText("1 Oct 2026");
    await expect(card(page)).toContainText("102938475610");
    await expect(card(page)).toContainText("109876543210987");
    await expectNoSecrets(page);
    await expectNoHorizontalOverflow(page);
  });

  test("recheck is switched off and says why until the API has it", async ({ page }) => {
    await signIn(page, "connected@test.local", "/dashboard/whatsapp");
    await expect(recheck(page)).toBeDisabled();
    await expect(recheck(page)).toHaveAccessibleDescription(RECHECK_OFF);
    await expectNoHorizontalOverflow(page);
  });

  test("disconnect asks first, and can't go through until the API has it", async ({ page }) => {
    await signIn(page, "connected@test.local", "/dashboard/whatsapp");
    await expect(card(page)).toContainText("Connected");
    // From here on, nothing may be written anywhere.
    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") writes.push(`${r.method()} ${r.url()}`);
    });
    await expect(page.getByText(DISCONNECT_OFF)).toBeVisible();
    await disconnect(page).click();

    const dialog = page.getByRole("dialog", { name: "Disconnect this WhatsApp number?" });
    await expect(dialog).toContainText("+91 98400 12345 will stop sending and receiving messages through Spark Agent");
    const confirm = dialog.getByRole("button", { name: "Disconnect number" });
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveAccessibleDescription(`${DISCONNECT_OFF} Nothing has been changed.`);
    await expect(dialog.getByRole("button", { name: "Keep it connected" })).toBeFocused();
    // The dialog fits the screen at every width.
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expectNoHorizontalOverflow(page);

    await dialog.getByRole("button", { name: "Keep it connected" }).click();
    await expect(dialog).toHaveCount(0);
    await disconnect(page).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // Still connected, no claim that anything happened, no request sent.
    await expect(card(page)).toContainText("Connected");
    await expect(page.locator("body")).not.toContainText(/number disconnected|tokens deleted/i);
    expect(writes).toEqual([]);
  });

  test("an admin may recheck but not disconnect; staff see the status only", async ({ page }) => {
    await signIn(page, "wa-admin@test.local", "/dashboard/whatsapp");
    await expect(card(page)).toContainText("Connected");
    await expect(recheck(page)).toBeDisabled();
    await expect(disconnect(page)).toHaveCount(0);

    await page.context().clearCookies();
    await signIn(page, "wa-staff@test.local", "/dashboard/whatsapp");
    await expect(card(page)).toContainText("Connected");
    await expect(recheck(page)).toHaveCount(0);
    await expect(disconnect(page)).toHaveCount(0);
    await expectNoSecrets(page);
  });

  test("checking", async ({ page }) => {
    await signIn(page, "validating@test.local", "/dashboard/whatsapp");
    await expect(card(page)).toContainText("Checking");
    await expect(card(page)).toContainText("We're running the connection checks with Meta.");
    // A check is already running: nothing to recheck, but the owner can still disconnect.
    await expect(recheck(page)).toHaveCount(0);
    await expect(disconnect(page)).toBeVisible();
    await expectNoSecrets(page);
    await expectNoHorizontalOverflow(page);
  });

  test("disconnected", async ({ page }) => {
    await signIn(page, "disconnected@test.local", "/dashboard/whatsapp");
    await expect(page.getByRole("listitem")).toContainText("Disconnected");
    await expect(card(page)).toContainText("no longer sends or receives messages");
    await expect(recheck(page)).toHaveCount(0);
    await expect(disconnect(page)).toHaveCount(0);
    // Connecting again needs the connect flow, which isn't switched on: it says so.
    const connect = page.getByRole("button", { name: "Connect WhatsApp" });
    await expect(connect).toBeDisabled();
    await expect(connect).toHaveAccessibleDescription("Connecting from the dashboard isn't switched on yet.");
    await expectNoSecrets(page);
    await expectNoHorizontalOverflow(page);
    // Sending is refused on the server, not just hidden.
    const res = await page.request.post(`${API_URL}/api/messages/test`, { data: { to: "+919840012345", body: "hi" }, headers: await asUser(page) });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("whatsapp_not_connected");
  });

  test("connecting", async ({ page }) => {
    await signIn(page, "pending@test.local", "/dashboard/whatsapp");
    await expect(page.getByRole("listitem")).toContainText("Connecting");
    await expect(card(page)).toContainText("Setup with Meta isn't finished yet.");
    await expectNoSecrets(page);
    const res = await page.request.post(`${API_URL}/api/messages/test`, { data: { to: "+919840012345", body: "hi" }, headers: await asUser(page) });
    expect((await res.json()).error.code).toBe("whatsapp_not_connected");
  });

  test("needs attention", async ({ page }) => {
    await signIn(page, "failed@test.local", "/dashboard/whatsapp");
    await expect(page.getByRole("listitem")).toContainText("Needs attention");
    await expect(card(page)).toContainText("A connection check failed, so messages aren't being sent.");
    await expect(recheck(page)).toBeDisabled();
    await expect(recheck(page)).toHaveAccessibleDescription(RECHECK_OFF);
    await expect(disconnect(page)).toBeVisible();
    await expectNoSecrets(page);
    await expectNoHorizontalOverflow(page);
  });

  test("no number connected", async ({ page }) => {
    await signIn(page, "staff@test.local", "/dashboard/whatsapp");
    await expect(page.getByText("No WhatsApp number connected")).toBeVisible();
    // A placeholder until the connect flow exists: switched off, and it says why.
    const connect = page.getByRole("button", { name: "Connect WhatsApp" });
    await expect(connect).toBeDisabled();
    await expect(connect).toHaveAccessibleDescription("Connecting from the dashboard isn't switched on yet.");
    await expectNoHorizontalOverflow(page);
  });

  test("load error", async ({ page }) => {
    await signIn(page, "viewerror@test.local", "/dashboard/whatsapp");
    const alert = appAlert(page);
    await expect(alert).toContainText("Couldn't load your WhatsApp connection");
    await expect(alert).not.toContainText(/boom|internal detail/);
    await expect(alert.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/dashboard/whatsapp");
  });

  test("loading", async ({ page }) => {
    await signIn(page, "slow@test.local");
    await expect(page.getByRole("heading", { level: 1, name: "Test Realty" })).toBeVisible();
    // The panel streams in after the page shell; don't wait for the full document.
    await page.goto("/dashboard/whatsapp", { waitUntil: "commit" });
    await expect(page.getByRole("status").filter({ hasText: "Checking your WhatsApp connection" })).toBeVisible();
    await expect(page.getByText("No WhatsApp number connected")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("status").filter({ hasText: "Checking your WhatsApp connection" })).toHaveCount(0);
  });

  test("home shows the same status", async ({ page }) => {
    await signIn(page, "connected@test.local");
    await expect(page.getByRole("heading", { level: 1, name: "Bright Interiors" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "+91 98400 12345" })).toContainText("Connected");
    // The home card is a summary: no actions and no ids.
    await expect(recheck(page)).toHaveCount(0);
    await expect(disconnect(page)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("109876543210987");
  });
});
