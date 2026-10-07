import { API_URL } from "../../../playwright.config";
import { appAlert, asUser, SIGNED_OUT, expect, expectNoHorizontalOverflow, signIn, test } from "../support/app";

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
    const card = page.getByRole("list", { name: "WhatsApp numbers" }).getByRole("listitem");
    await expect(card).toContainText("Connected");
    await expect(card).toContainText("+91 98400 12345");
    await expect(card).toContainText("Shows as “Bright Interiors”");
    await expect(card).toContainText("GREEN");
    await expect(card).toContainText("TIER_1K");
    // Only public fields are rendered.
    await expect(page.locator("body")).not.toContainText(/token|secret/i);
    await expectNoHorizontalOverflow(page);
  });

  test("disconnected", async ({ page }) => {
    await signIn(page, "disconnected@test.local", "/dashboard/whatsapp");
    await expect(page.getByRole("listitem")).toContainText("Disconnected");
    // Sending is refused on the server, not just hidden.
    const res = await page.request.post(`${API_URL}/api/messages/test`, { data: { to: "+919840012345", body: "hi" }, headers: await asUser(page) });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("whatsapp_not_connected");
  });

  test("connecting", async ({ page }) => {
    await signIn(page, "pending@test.local", "/dashboard/whatsapp");
    await expect(page.getByRole("listitem")).toContainText("Connecting");
    const res = await page.request.post(`${API_URL}/api/messages/test`, { data: { to: "+919840012345", body: "hi" }, headers: await asUser(page) });
    expect((await res.json()).error.code).toBe("whatsapp_not_connected");
  });

  test("needs attention", async ({ page }) => {
    await signIn(page, "failed@test.local", "/dashboard/whatsapp");
    await expect(page.getByRole("listitem")).toContainText("Needs attention");
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
  });
});
