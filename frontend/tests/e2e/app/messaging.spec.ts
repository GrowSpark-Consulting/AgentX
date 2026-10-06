import type { Page, Route } from "@playwright/test";
import { appAlert, SIGNED_OUT, expect, expectNoHorizontalOverflow, signIn, test } from "../support/app";

// Signed in as owner@test.local (project storage state) unless a test says otherwise.

/** Holds the request until `release()` so the in-flight state can be checked. */
async function holdRoute(page: Page, url: string, response: { status: number; body: unknown }) {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  await page.route(url, async (route: Route) => {
    await released;
    await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
  });
  return release;
}

test.describe("send test message", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/messages/test");
    await expect(page.getByRole("heading", { level: 1, name: "Send a test message" })).toBeVisible();
  });

  test("validates the number and message before sending", async ({ page }) => {
    await page.getByLabel("Message").fill("");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByText("Enter the number with country code, like +919840012345")).toBeVisible();
    await expect(page.getByText("Write a message")).toBeVisible();
    await expect(page.getByLabel("Recipient's WhatsApp number")).toBeFocused();
    await page.getByLabel("Recipient's WhatsApp number").fill("98400 12345");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByLabel("Recipient's WhatsApp number")).toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Recipient's WhatsApp number").fill("+919840012345");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByLabel("Message")).toBeFocused();
    await expect(page.getByLabel("Message")).toHaveAttribute("aria-invalid", "true");
    await expectNoHorizontalOverflow(page);
  });

  test("tells the truth when no WhatsApp number is connected", async ({ page }) => {
    await expect(page.getByRole("note")).toContainText("No WhatsApp number is connected yet");
    await page.getByLabel("Recipient's WhatsApp number").fill("+919840012345");
    await page.getByRole("button", { name: "Send test message" }).click();
    const alert = appAlert(page);
    await expect(alert).toContainText("WhatsApp isn't connected");
    await expect(alert).toContainText("the message was not sent");
    await expect(page.getByRole("status").filter({ hasText: "Sent to" })).toHaveCount(0);
    await alert.getByRole("link", { name: "Check WhatsApp connection" }).click();
    await expect(page).toHaveURL(/\/dashboard\/whatsapp$/);
  });

  test("shows a loading state while sending, then the result", async ({ page }) => {
    const release = await holdRoute(page, "**/api/messages/test", {
      status: 200,
      body: { providerMessageId: "wamid.TEST123", status: "sent" },
    });
    await page.getByLabel("Recipient's WhatsApp number").fill("+919840012345");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Sending your message" })).toBeVisible();
    release();
    await expect(page.getByRole("status").filter({ hasText: "Sent to +919840012345." })).toContainText("wamid.TEST123");
  });

  test("reports server and network failures with a retry", async ({ page }) => {
    await page.route("**/api/messages/test", (route) =>
      route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "upstream_failed", message: "WhatsApp didn't answer. Try again." } }) }),
    );
    await page.getByLabel("Recipient's WhatsApp number").fill("+919840012345");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(appAlert(page)).toContainText("WhatsApp didn't answer. Try again.");
    await page.unroute("**/api/messages/test");
    await page.route("**/api/messages/test", (route) => route.abort("internetdisconnected"));
    await appAlert(page).getByRole("button", { name: "Try again" }).click();
    await expect(appAlert(page)).toContainText("We couldn't reach Pakka");
  });
});

test.describe("send test message as staff", () => {
  test.use({ storageState: SIGNED_OUT });

  test("is limited to owners and admins, on the server too", async ({ page }) => {
    await signIn(page, "staff@test.local", "/dashboard/messages/test");
    await expect(page.getByRole("note").filter({ hasText: "Only an owner or admin" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send test message" })).toBeDisabled();
    const res = await page.request.post("/api/messages/test", { data: { to: "+919840012345", body: "hi" } });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toEqual({ code: "forbidden", message: "Only an owner or admin can send a test message." });
  });
});

test.describe("create template", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/templates/new");
    await expect(page.getByRole("heading", { level: 1, name: "Create a message template" })).toBeVisible();
  });

  async function fillValid(page: Page) {
    await page.getByLabel("Template name").fill("booking_confirmed_v1");
    await page.getByLabel("Message").fill("Hi {{1}}, your visit is booked for {{2}}.");
    await page.getByLabel("Sample for {{1}}").fill("Karthik");
    await page.getByLabel("Sample for {{2}}").fill("Sat 24 Oct, 11 am");
  }

  test("shows the empty variables state and a live preview", async ({ page }) => {
    await expect(page.getByText("No variables yet")).toBeVisible();
    await fillValid(page);
    await expect(page.getByText("No variables yet")).toHaveCount(0);
    await expect(page.getByTestId("template-preview")).toContainText("Hi Karthik, your visit is booked for Sat 24 Oct, 11 am.");
    await page.getByText("Marketing", { exact: true }).click();
    await page.getByText("Tamil", { exact: true }).click();
    await expect(page.getByTestId("template-preview")).toContainText("Marketing · Tamil");
    await expectNoHorizontalOverflow(page);
  });

  test("validates name, variables and sample values", async ({ page }) => {
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText(/Use lowercase letters, numbers and underscores/)).toBeVisible();
    await expect(page.getByText("Write the message")).toBeVisible();
    await expect(page.getByLabel("Template name")).toBeFocused();

    await page.getByLabel("Template name").fill("booking_confirmed_v1");
    await page.getByLabel("Message").fill("Hi {{2}}");
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Number variables in order: {{1}}, {{2}}, …")).toBeVisible();
    await expect(page.getByLabel("Message")).toBeFocused();

    await page.getByLabel("Message").fill("Hi");
    await page.getByRole("button", { name: "+ Add variable" }).click();
    await expect(page.getByLabel("Message")).toHaveValue("Hi {{1}}");
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Add a sample value")).toBeVisible();
    const sample = page.getByLabel("Sample for {{1}}");
    await expect(sample).toBeFocused();
    await expect(sample).toHaveAttribute("aria-invalid", "true");
    await expect(sample).toHaveAccessibleDescription("Add a sample value");
  });

  test("never claims a submission the backend can't make", async ({ page }) => {
    await fillValid(page);
    await page.getByRole("button", { name: "Submit for review" }).click();
    const alert = appAlert(page);
    await expect(alert).toContainText("Not available yet");
    await expect(alert).toContainText("this template was not submitted");
    await expect(page.getByRole("status").filter({ hasText: "submitted to Meta" })).toHaveCount(0);
  });

  test("shows a loading state while submitting, then the result", async ({ page }) => {
    const release = await holdRoute(page, "**/api/templates", {
      status: 200,
      body: { name: "booking_confirmed_v1", language: "en", status: "submitted" },
    });
    await fillValid(page);
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByRole("button", { name: "Submitting…" })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Submitting your template" })).toBeVisible();
    release();
    await expect(page.getByRole("status").filter({ hasText: "booking_confirmed_v1" })).toContainText("was submitted to Meta for review.");
  });

  test("shows server validation errors on the fields", async ({ page }) => {
    await page.route("**/api/templates", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "validation_failed", message: "Check the highlighted fields.", fields: { name: "That name is already used" } } }),
      }),
    );
    await fillValid(page);
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("That name is already used")).toBeVisible();
    await expect(page.getByLabel("Template name")).toBeFocused();
    await expect(appAlert(page)).toContainText("Check the highlighted fields");
  });
});
