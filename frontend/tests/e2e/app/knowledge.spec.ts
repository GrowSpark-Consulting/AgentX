import type { APIRequestContext, Page } from "@playwright/test";
import { appAlert, expect, expectNoHorizontalOverflow, mainNav, MOCK_SUPABASE_URL, SIGNED_OUT, signIn, test } from "../support/app";

// The real Knowledge base at /dashboard/knowledge: the Services & prices section against
// mock-supabase.mjs. Every test gets its own account and business (POST /__mock/services-account), so
// the desktop, tablet and phone projects can add, edit and delete at the same time.

type Account = { email: string; tenantId: string };
type StoredService = { id: string; tenant_id: string; name: string; duration_min: number; price_min: number | null; price_max: number | null; resource_type: string; active: boolean };

async function newAccount(
  request: APIRequestContext,
  options: { seed?: boolean; error?: boolean; docs?: boolean; docsError?: boolean } = {},
): Promise<Account> {
  return (await request.post(`${MOCK_SUPABASE_URL}/__mock/services-account`, { data: options })).json();
}
async function stored(request: APIRequestContext, tenantId: string): Promise<StoredService[]> {
  return (await request.get(`${MOCK_SUPABASE_URL}/__mock/services?tenant=${tenantId}`)).json();
}
async function openKnowledge(page: Page, account: Account) {
  await signIn(page, account.email, "/dashboard/knowledge");
  await expect(page.getByRole("heading", { level: 1, name: "Knowledge base" })).toBeVisible();
}

const table = (page: Page) => page.getByRole("table");
const rowFor = (page: Page, name: string) => table(page).getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
const dialog = (page: Page) => page.getByRole("dialog");
/** The services section's Add (the FAQs section has its own, switched off). */
const servicesAdd = (page: Page) => page.getByRole("region", { name: /^Services & prices/ }).getByRole("button", { name: "Add", exact: true });
const toast = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

async function expectDialogFits(page: Page) {
  const box = await dialog(page).boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
}

test.describe("Knowledge base · services", () => {
  test.use({ storageState: SIGNED_OUT });

  test("an empty business says so and offers to add a service", async ({ page, request }) => {
    const account = await newAccount(request);
    await openKnowledge(page, account);
    await expect(mainNav(page).getByRole("link", { name: "Knowledge base", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Services & prices · 0" })).toBeVisible();
    await expect(page.getByText("No services yet")).toBeVisible();
    await expect(table(page)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Add a service" }).click();
    await expect(dialog(page)).toContainText("Add a service");
    await expectDialogFits(page);
  });

  test("lists the business's services in the prototype's table", async ({ page, request }) => {
    const account = await newAccount(request, { seed: true });
    await openKnowledge(page, account);
    await expect(page.getByRole("heading", { name: "Services & prices · 3" })).toBeVisible();
    await expect(table(page).getByRole("columnheader")).toHaveText(["Service", "Length", "Booked with", "Price range", "Status", "Actions"]);
    const rows = table(page).locator("tbody tr");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Bridal trial");
    await expect(rows.nth(0)).toContainText("90 min");
    await expect(rows.nth(0)).toContainText("₹2,500 – ₹5,000");
    await expect(rows.nth(1)).toContainText("Hair spa");
    await expect(rows.nth(1)).toContainText("—");
    await expect(rows.nth(1)).toContainText("Off");
    await expect(rows.nth(2)).toContainText("Haircut");
    await expect(rows.nth(2)).toContainText("₹300 – ₹600");
    await expect(rows.nth(2)).toContainText("Active");
    // The table scrolls inside its own box on narrow screens; the page never scrolls sideways.
    await expectNoHorizontalOverflow(page);
    // Only real data: none of the prototype's sample services, FAQs, questions or documents.
    await expect(page.locator("body")).not.toContainText(/Skyline|HD bridal package|Mehendi|Do you do home service|sent \d+ times/);
  });

  test("adds a service for this business only", async ({ page, request }) => {
    const account = await newAccount(request, { seed: true });
    await openKnowledge(page, account);
    await servicesAdd(page).click();
    await expectDialogFits(page);
    await dialog(page).getByLabel("Name").fill("Keratin");
    await dialog(page).getByLabel("Length (minutes)").fill("150");
    await dialog(page).getByLabel("Booked with").fill("stylist");
    await dialog(page).getByLabel("Lowest price (₹)").fill("4,500");
    await dialog(page).getByLabel("Highest price (₹)").fill("8000");
    await dialog(page).getByRole("button", { name: "Add service" }).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(toast(page, "Added Keratin")).toBeVisible();
    await expect(rowFor(page, "Keratin")).toContainText("150 min");
    await expect(rowFor(page, "Keratin")).toContainText("₹4,500 – ₹8,000");
    await expect(page.getByRole("heading", { name: "Services & prices · 4" })).toBeVisible();

    const saved = (await stored(request, account.tenantId)).find((s) => s.name === "Keratin");
    expect(saved).toMatchObject({ tenant_id: account.tenantId, duration_min: 150, price_min: 4500, price_max: 8000, resource_type: "stylist", active: true });
  });

  test("edits a service", async ({ page, request }) => {
    const account = await newAccount(request, { seed: true });
    await openKnowledge(page, account);
    await page.getByRole("button", { name: "Edit Haircut" }).click();
    await expect(dialog(page)).toContainText("Edit Haircut");
    await expect(dialog(page).getByLabel("Name")).toHaveValue("Haircut");
    await expect(dialog(page).getByLabel("Lowest price (₹)")).toHaveValue("300");
    await dialog(page).getByLabel("Name").fill("Haircut and wash");
    await dialog(page).getByLabel("Lowest price (₹)").fill("");
    await dialog(page).getByLabel("Highest price (₹)").fill("750");
    await dialog(page).getByLabel("Customers can book this").uncheck();
    await dialog(page).getByRole("button", { name: "Save changes" }).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(toast(page, "Saved Haircut and wash")).toBeVisible();
    await expect(rowFor(page, "Haircut and wash")).toContainText("Up to ₹750");
    await expect(rowFor(page, "Haircut and wash")).toContainText("Off");
    await expect(rowFor(page, "Haircut")).toHaveCount(0);
    const saved = (await stored(request, account.tenantId)).find((s) => s.name === "Haircut and wash");
    expect(saved).toMatchObject({ price_min: null, price_max: 750, active: false });
  });

  test("deletes a service after confirming, and keeps it on Keep it", async ({ page, request }) => {
    const account = await newAccount(request, { seed: true });
    await openKnowledge(page, account);
    await page.getByRole("button", { name: "Delete Hair spa" }).click();
    await expect(dialog(page)).toContainText("Delete Hair spa?");
    await expectDialogFits(page);
    await dialog(page).getByRole("button", { name: "Keep it" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(rowFor(page, "Hair spa")).toHaveCount(1);

    await page.getByRole("button", { name: "Delete Hair spa" }).click();
    await dialog(page).getByRole("button", { name: "Delete service" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(toast(page, "Deleted Hair spa")).toBeVisible();
    await expect(rowFor(page, "Hair spa")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Services & prices · 2" })).toBeVisible();
    expect((await stored(request, account.tenantId)).map((s) => s.name).sort()).toEqual(["Bridal trial", "Haircut"]);
  });

  test("validates before saving and sends nothing until the form is right", async ({ page, request }) => {
    const account = await newAccount(request, { seed: true });
    await openKnowledge(page, account);
    await servicesAdd(page).click();
    await dialog(page).getByRole("button", { name: "Add service" }).click();
    await expect(dialog(page).getByText("Give the service a name")).toBeVisible();
    await expect(dialog(page).getByText("Enter how many minutes a booking takes")).toBeVisible();
    await expect(dialog(page).getByText("Say who or what is booked, like staff")).toBeVisible();
    await expect(dialog(page).getByLabel("Name")).toHaveAttribute("aria-invalid", "true");

    await dialog(page).getByLabel("Name").fill("haircut");
    await dialog(page).getByLabel("Length (minutes)").fill("0");
    await dialog(page).getByLabel("Booked with").fill("stylist");
    await dialog(page).getByLabel("Lowest price (₹)").fill("12.50");
    await dialog(page).getByLabel("Highest price (₹)").fill("100");
    await dialog(page).getByRole("button", { name: "Add service" }).click();
    await expect(dialog(page).getByText("You already have a service with this name")).toBeVisible();
    await expect(dialog(page).getByText("A booking takes at least 1 minute")).toBeVisible();
    await expect(dialog(page).getByText("Enter whole rupees, like 1500")).toBeVisible();

    await dialog(page).getByLabel("Name").fill("Head massage");
    await dialog(page).getByLabel("Length (minutes)").fill("20");
    await dialog(page).getByLabel("Lowest price (₹)").fill("500");
    await dialog(page).getByRole("button", { name: "Add service" }).click();
    await expect(dialog(page).getByText("The highest price can't be below the lowest")).toBeVisible();

    // Nothing was written while the form was invalid.
    const log = await (await request.get(`${MOCK_SUPABASE_URL}/__mock/rest-log?email=${account.email}`)).json();
    expect((log as { method: string; table: string }[]).filter((r) => r.table === "services" && r.method !== "GET")).toEqual([]);
    expect(await stored(request, account.tenantId)).toHaveLength(3);

    // Escape closes the dialog without saving.
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
  });

  test("a save or delete that didn't happen is reported, never shown as done", async ({ page, request }) => {
    const account = await newAccount(request, { seed: true });
    await openKnowledge(page, account);
    const haircut = (await stored(request, account.tenantId)).find((s) => s.name === "Haircut")!;

    // Someone else removes the service while this dialog is open; the update then matches no row.
    await page.getByRole("button", { name: "Edit Haircut" }).click();
    await request.delete(`${MOCK_SUPABASE_URL}/__mock/services?id=${haircut.id}`);
    await dialog(page).getByLabel("Length (minutes)").fill("45");
    await dialog(page).getByRole("button", { name: "Save changes" }).click();
    await expect(dialog(page).getByRole("alert")).toContainText("This service no longer exists");
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(rowFor(page, "Haircut")).toHaveCount(1); // not silently changed or removed

    await page.getByRole("button", { name: "Delete Haircut" }).click();
    await dialog(page).getByRole("button", { name: "Delete service" }).click();
    await expect(dialog(page).getByRole("alert")).toContainText("This service no longer exists");
    await expect(dialog(page).getByRole("button", { name: "Delete service" })).toBeEnabled();
    await expect(toast(page, "Deleted")).toHaveCount(0);
  });

  test("every read and write names the session's business", async ({ page, request }) => {
    const account = await newAccount(request, { seed: true });
    await openKnowledge(page, account);
    await page.getByRole("button", { name: "Edit Bridal trial" }).click();
    await dialog(page).getByRole("button", { name: "Save changes" }).click();
    await expect(toast(page, "Saved Bridal trial")).toBeVisible();
    await page.getByRole("button", { name: "Delete Hair spa" }).click();
    await dialog(page).getByRole("button", { name: "Delete service" }).click();
    await expect(toast(page, "Deleted Hair spa")).toBeVisible();

    const log = (await (await request.get(`${MOCK_SUPABASE_URL}/__mock/rest-log?email=${account.email}`)).json()) as { method: string; table: string; query: string }[];
    const services = log.filter((r) => r.table === "services");
    expect(services.map((r) => r.method).sort()).toEqual(["DELETE", "GET", "PATCH"]);
    for (const r of services) expect(decodeURIComponent(r.query)).toContain(`tenant_id=eq.${account.tenantId}`);
  });

  test("a failed read shows an error with Try again", async ({ page, request }) => {
    const account = await newAccount(request, { error: true });
    await openKnowledge(page, account);
    await expect(appAlert(page)).toContainText("Couldn't load your services");
    await expect(appAlert(page)).toContainText("Something went wrong. Try again in a moment.");
    await expect(appAlert(page)).not.toContainText(/boom|unexpected shape/);
    await expect(servicesAdd(page)).toBeDisabled();
    await appAlert(page).getByRole("button", { name: "Try again" }).click();
    await expect(appAlert(page)).toContainText("Couldn't load your services");
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("Knowledge base · FAQs, questions and documents", () => {
  test.use({ storageState: SIGNED_OUT });

  test("FAQs and unanswered questions say they aren't available, and offer nothing to save", async ({ page, request }) => {
    const account = await newAccount(request, { seed: true });
    await openKnowledge(page, account);

    // The prototype's order: questions, services, FAQs, documents.
    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Questions the AI couldn’t answer",
      "Services & prices · 3",
      "FAQs",
      /^Documents/,
    ]);
    const gaps = page.getByRole("region", { name: "Questions the AI couldn’t answer" });
    await expect(gaps).toContainText("Not available yet");
    await expect(gaps.getByRole("button")).toHaveCount(0);
    await expect(gaps.getByRole("textbox")).toHaveCount(0);

    const faqs = page.getByRole("region", { name: "FAQs" });
    await expect(faqs).toContainText("Not available yet");
    await expect(faqs.getByRole("button", { name: "Add" })).toBeDisabled();
    await expect(faqs.getByText("Adding FAQs isn’t switched on yet.")).toBeVisible();
    await expect(faqs.getByRole("button", { expanded: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("lists the business's documents in the prototype's tiles, with upload switched off", async ({ page, request }) => {
    const account = await newAccount(request, { docs: true });
    await openKnowledge(page, account);
    const docs = page.getByRole("region", { name: /^Documents/ });
    await expect(docs.getByRole("heading")).toHaveText("Documents · 2");
    const tiles = docs.getByRole("listitem");
    await expect(tiles).toHaveCount(2);
    // Newest first; the tile label comes from the file type, else from where it came from.
    await expect(tiles.nth(0)).toContainText("WEB");
    await expect(tiles.nth(0)).toContainText("services");
    await expect(tiles.nth(0)).toContainText("From your website · 5 Oct 2026");
    await expect(tiles.nth(1)).toContainText("PDF");
    await expect(tiles.nth(1)).toContainText("Bridal price list.pdf");
    await expect(tiles.nth(1)).toContainText("Uploaded · 1 Oct 2026");
    // No processing state or send counts: nothing stores them.
    await expect(docs.getByRole("list")).not.toContainText(/processing|ready|failed|sent/i);

    await expect(docs.getByRole("button", { name: "Upload" })).toBeDisabled();
    await expect(docs.getByText("Uploading documents isn’t switched on yet, so nothing is sent from here.")).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    // Read only, and only the session's business.
    const log = (await (await request.get(`${MOCK_SUPABASE_URL}/__mock/rest-log?email=${account.email}`)).json()) as { method: string; table: string; query: string }[];
    const reads = log.filter((r) => r.table === "kb_documents");
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) {
      expect(r.method).toBe("GET");
      expect(decodeURIComponent(r.query)).toContain(`tenant_id=eq.${account.tenantId}`);
    }
  });

  test("a business with no documents says so", async ({ page, request }) => {
    const account = await newAccount(request);
    await openKnowledge(page, account);
    const docs = page.getByRole("region", { name: /^Documents/ });
    await expect(docs.getByRole("heading")).toHaveText("Documents · 0");
    await expect(docs.getByText("No documents yet")).toBeVisible();
  });

  test("a failed documents read shows an error with Try again, and the rest of the page still works", async ({ page, request }) => {
    const account = await newAccount(request, { seed: true, docsError: true });
    await openKnowledge(page, account);
    const docs = page.getByRole("region", { name: /^Documents/ });
    await expect(docs.getByRole("alert")).toContainText("Couldn't load your documents");
    await expect(docs.getByRole("alert")).not.toContainText(/boom|unexpected shape/);
    await docs.getByRole("button", { name: "Try again" }).click();
    await expect(docs.getByRole("alert")).toContainText("Couldn't load your documents");
    await expect(table(page).locator("tbody tr")).toHaveCount(3);
  });
});
