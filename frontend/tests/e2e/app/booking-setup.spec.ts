import type { Page } from "@playwright/test";
import { appAlert, expect, expectNoHorizontalOverflow, mainNav, SIGNED_OUT, test } from "../support/app";
import { expectDialogFits, newDay3Account, open, storedDay3, writesBy } from "../support/day3";

// /dashboard/settings/booking (Day 3: services and resources settings): business hours, staff and
// resources (working hours, service-area pincodes) and services (length, gap, minimum notice), read and
// written under RLS in mock-supabase.mjs. Mocked E2E: the database is the mock, the app is real.

const PATH = "/dashboard/settings/booking";
const dialog = (page: Page) => page.getByRole("dialog");
const section = (page: Page, name: RegExp) => page.getByRole("region", { name });
const hoursSection = (page: Page) => section(page, /^Business hours/);
const resourcesSection = (page: Page) => section(page, /^Staff & resources/);
const servicesSection = (page: Page) => section(page, /^Services & prices/);
const row = (page: Page, scope: ReturnType<typeof section>, name: string) =>
  scope.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
const toast = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

test.describe("Booking setup", () => {
  test.use({ storageState: SIGNED_OUT });

  test("shows business hours, staff and resources, and services with their booking rules", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, PATH, "Booking setup");
    await expect(mainNav(page).getByRole("link", { name: "Booking setup" })).toHaveAttribute("aria-current", "page");

    const hours = hoursSection(page);
    await expect(hours.getByText("Times are in Asia/Kolkata")).toBeVisible();
    await expect(hours.getByRole("definition")).toHaveText([
      "09:30–19:00", "09:30–19:00", "09:30–19:00", "09:30–19:00", "09:30–19:00", "09:30–19:00", "10:00–14:00",
    ]);

    const resources = resourcesSection(page);
    await expect(page.getByRole("heading", { name: "Staff & resources · 3" })).toBeVisible();
    await expect(resources.getByRole("columnheader")).toHaveText(["Name", "Kind", "Working hours", "Service area", "Google Calendar", "Status", "Actions"]);
    await expect(row(page, resources, "Asha")).toContainText("Mon–Sat 10:00–18:00");
    await expect(row(page, resources, "Asha")).toContainText("Any pincode");
    await expect(row(page, resources, "Ravi")).toContainText("Business hours");
    await expect(row(page, resources, "Ravi")).toContainText("600041, 600096");
    await expect(row(page, resources, "Room 2")).toContainText("Off");

    const services = servicesSection(page);
    await expect(row(page, services, "Consultation")).toContainText("60 min");
    await expect(row(page, services, "Consultation")).toContainText("15 min gap · 2 hours notice");
    await expect(row(page, services, "Follow-up")).toContainText("No gap · 60 min notice");
    await expectNoHorizontalOverflow(page);
  });

  test("an empty business is told what to add first", async ({ page, request }) => {
    const account = await newDay3Account(request);
    await open(page, account, PATH, "Booking setup");
    await expect(page.getByText("No business hours yet")).toBeVisible();
    await expect(page.getByText("No staff or resources yet")).toBeVisible();
    await expect(page.getByText("No services yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Set business hours" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add staff or a resource" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("edits business hours, with a split shift and a closed day", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, PATH, "Booking setup");
    const hours = hoursSection(page);
    await hours.getByRole("button", { name: "Edit" }).click();
    await hours.getByLabel("Open on Sunday").uncheck();
    await hours.getByLabel("Saturday closes").fill("13:00");
    await hours.getByRole("button", { name: "Add more hours on Saturday" }).click();
    await hours.getByLabel("Saturday opens (2)").fill("14:00");
    await hours.getByLabel("Saturday closes (2)").fill("18:30");
    await hours.getByRole("button", { name: "Save hours" }).click();

    await expect(toast(page, "Saved business hours")).toBeVisible();
    await expect(hours.getByRole("definition").nth(5)).toHaveText("09:30–13:00, 14:00–18:30");
    await expect(hours.getByRole("definition").nth(6)).toHaveText("Closed");
    const stored = await storedDay3(request, account.tenantId);
    expect(stored.tenant?.business_hours.sat).toEqual([{ start: "09:30", end: "13:00" }, { start: "14:00", end: "18:30" }]);
    expect(stored.tenant?.business_hours.sun).toEqual([]);
  });

  test("refuses hours that end before they start, or overlap, without saving", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, PATH, "Booking setup");
    const hours = hoursSection(page);
    await hours.getByRole("button", { name: "Edit" }).click();
    await hours.getByLabel("Monday closes").fill("08:00");
    await hours.getByRole("button", { name: "Add more hours on Tuesday" }).click();
    await hours.getByLabel("Tuesday opens (2)").fill("12:00");
    await hours.getByLabel("Tuesday closes (2)").fill("20:00");
    await hours.getByLabel("Wednesday opens").fill("nine");
    await hours.getByRole("button", { name: "Save hours" }).click();

    await expect(hours.getByText("Closing time must be after opening time")).toBeVisible();
    await expect(hours.getByLabel("Monday closes")).toHaveAttribute("aria-invalid", "true");
    await expect(hours.getByText("Tuesday's hours overlap")).toBeVisible();
    await expect(hours.getByText("Enter a time like 09:30")).toBeVisible();
    expect((await writesBy(request, account.email)).filter((w) => w.table === "tenants")).toEqual([]);
  });

  test("adds a staff member with their own hours and service-area pincodes", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, PATH, "Booking setup");
    await resourcesSection(page).getByRole("button", { name: "Add", exact: true }).click();
    await expectDialogFits(page);
    const d = dialog(page);
    await d.getByLabel("Name").fill("Meena");
    await d.getByLabel("Kind").fill("staff");
    await d.getByText("Own hours").click();
    for (const day of ["Monday", "Tuesday", "Wednesday"]) await d.getByLabel(`Open on ${day}`).uncheck();
    await d.getByLabel("Thursday opens").fill("9:00");
    await d.getByLabel("Thursday closes").fill("17:00");
    await d.getByLabel("Service-area pincodes").fill("600041, 600119\n600041");
    await d.getByRole("button", { name: "Add", exact: true }).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(toast(page, "Added Meena")).toBeVisible();
    await expect(row(page, resourcesSection(page), "Meena")).toContainText("Thu 09:00–17:00 · Fri–Sat 10:00–18:00");
    await expect(row(page, resourcesSection(page), "Meena")).toContainText("600041, 600119");
    const meena = (await storedDay3(request, account.tenantId)).resources.find((r) => r.name === "Meena");
    expect(meena).toMatchObject({ type: "staff", active: true, service_area: { pincodes: ["600041", "600119"] } });
    expect(meena?.working_hours).toEqual({
      mon: [], tue: [], wed: [], thu: [{ start: "09:00", end: "17:00" }],
      fri: [{ start: "10:00", end: "18:00" }], sat: [{ start: "10:00", end: "18:00" }], sun: [],
    });
  });

  test("validates the resource form before saving", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, PATH, "Booking setup");
    await resourcesSection(page).getByRole("button", { name: "Add", exact: true }).click();
    const d = dialog(page);
    await d.getByRole("button", { name: "Add", exact: true }).click();
    await expect(d.getByText("Give it a name, like the person's name or the room")).toBeVisible();
    await expect(d.getByText(/Say what kind it is/)).toBeVisible();

    await d.getByLabel("Name").fill("asha");
    await d.getByLabel("Kind").fill("staff");
    await d.getByLabel("Service-area pincodes").fill("60004, 600041");
    await d.getByText("Own hours").click();
    await d.getByLabel("Friday closes").fill("09:00");
    await d.getByRole("button", { name: "Add", exact: true }).click();
    await expect(d.getByText("You already have a resource with this name")).toBeVisible();
    await expect(d.getByText("60004 isn't a 6-digit pincode")).toBeVisible();
    await expect(d.getByText("Closing time must be after opening time")).toBeVisible();
    await expect(d.getByLabel("Service-area pincodes")).toHaveAttribute("aria-invalid", "true");
    expect((await writesBy(request, account.email)).filter((w) => w.table === "resources")).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
  });

  test("edits a resource back to the business's hours, and won't delete one that has bookings", async ({ page, request, consoleErrors }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, PATH, "Booking setup");
    await page.getByRole("button", { name: "Edit Asha" }).click();
    const d = dialog(page);
    await expect(d.getByLabel("Thursday opens")).toHaveValue("10:00");
    await d.getByText("Business hours", { exact: true }).click();
    await d.getByRole("button", { name: "Save changes" }).click();
    await expect(toast(page, "Saved Asha")).toBeVisible();
    await expect(row(page, resourcesSection(page), "Asha")).toContainText("Business hours");
    expect((await storedDay3(request, account.tenantId)).resources.find((r) => r.name === "Asha")?.working_hours).toEqual({});

    await page.getByRole("button", { name: "Delete Asha" }).click();
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog(page).getByRole("alert")).toContainText("This resource has bookings, so it can't be deleted");
    // The database refused with 409 (foreign key), which the browser logs; that one line is expected.
    const refused = consoleErrors.findIndex((e) => /Failed to load resource: .*409/.test(e));
    expect(refused, "the browser's log of the refused delete").toBeGreaterThanOrEqual(0);
    consoleErrors.splice(refused, 1);
    await dialog(page).getByRole("button", { name: "Keep it" }).click();
    await expect(row(page, resourcesSection(page), "Asha")).toHaveCount(1);

    await page.getByRole("button", { name: "Delete Room 2" }).click();
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(toast(page, "Deleted Room 2")).toBeVisible();
    await expect(row(page, resourcesSection(page), "Room 2")).toHaveCount(0);
    expect((await storedDay3(request, account.tenantId)).resources.map((r) => r.name).sort()).toEqual(["Asha", "Ravi"]);
  });

  test("sets a service's gap between bookings and minimum notice", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true });
    await open(page, account, PATH, "Booking setup");
    await page.getByRole("button", { name: "Edit Follow-up" }).click();
    const d = dialog(page);
    await expect(d.getByLabel("Gap between bookings (minutes)")).toHaveValue("0");
    await d.getByLabel("Gap between bookings (minutes)").fill("300");
    await d.getByLabel("Minimum notice (minutes)").fill("soon");
    await d.getByRole("button", { name: "Save changes" }).click();
    await expect(d.getByText("Keep the gap to 240 minutes (4 hours) or less")).toBeVisible();
    await expect(d.getByText("Enter whole minutes, like 15")).toBeVisible();

    await d.getByLabel("Gap between bookings (minutes)").fill("10");
    await d.getByLabel("Minimum notice (minutes)").fill("1440");
    await d.getByLabel("Length (minutes)").fill("45");
    await d.getByRole("button", { name: "Save changes" }).click();
    await expect(row(page, servicesSection(page), "Follow-up")).toContainText("10 min gap · 1 day notice");
    await expect(row(page, servicesSection(page), "Follow-up")).toContainText("45 min");
    expect((await storedDay3(request, account.tenantId)).services.find((s) => s.name === "Follow-up")).toMatchObject({ buffer_min: 10, min_notice_min: 1440, duration_min: 45 });
  });

  test("staff see the setup read-only", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true, role: "staff" });
    await open(page, account, PATH, "Booking setup");
    await expect(page.getByText("Only an owner or admin can change these.")).toBeVisible();
    await expect(row(page, resourcesSection(page), "Asha")).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Add|Edit|Delete|Connect|Reconnect)\b/ })).toHaveCount(0);
    await expect(resourcesSection(page).getByRole("columnheader")).toHaveText(["Name", "Kind", "Working hours", "Service area", "Google Calendar", "Status"]);
    // Staff still see whose calendar is connected.
    await expect(row(page, resourcesSection(page), "Ravi")).toContainText("Connected");
  });

  test("a failed read says so and offers to try again", async ({ page, request }) => {
    const account = await newDay3Account(request, { seed: true, error: "resources" });
    await open(page, account, PATH, "Booking setup");
    await expect(appAlert(page).filter({ hasText: "Couldn't load staff and resources" })).toBeVisible();
    await expect(resourcesSection(page).getByRole("button", { name: "Try again" })).toBeVisible();
    // The other sections still work.
    await expect(row(page, servicesSection(page), "Consultation")).toBeVisible();
  });

  test.describe("Google Calendar per staff member", () => {
    test("shows each resource's calendar without ever reading the token", async ({ page, request }) => {
      const account = await newDay3Account(request, { seed: true });
      await open(page, account, PATH, "Booking setup");
      const resources = resourcesSection(page);
      await expect(row(page, resources, "Ravi")).toContainText("Connectedravi@example.com");
      await expect(row(page, resources, "Asha")).toContainText("Not connected");
      await expect(row(page, resources, "Room 2")).toContainText("Needs reconnecting");
      await expect(page.getByRole("button", { name: "Connect Google Calendar for Asha" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Reconnect Google Calendar for Room 2" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Google Calendar for Ravi/ })).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText("never-sent-to-the-browser");
    });

    test("says so when the API hasn't switched Google Calendar on", async ({ page, request }) => {
      // The real API, with no Google credentials in the test environment: 501 not_available.
      const account = await newDay3Account(request, { seed: true });
      await open(page, account, PATH, "Booking setup");
      const answer = page.waitForResponse((r) => r.url().includes("/api/calendar/google/connect?resourceId="));
      await page.getByRole("button", { name: "Connect Google Calendar for Asha" }).click();
      expect((await answer).status()).toBe(501);
      await expect(appAlert(page).filter({ hasText: "Couldn't connect Google Calendar for Asha" })).toContainText("Google Calendar isn't switched on yet.");
      await expect(page).toHaveURL(new RegExp(`${PATH}$`));
      await expect(page.getByRole("button", { name: "Connect Google Calendar for Asha" })).toBeEnabled();
    });

    test("sends the browser to Google's consent screen for that resource", async ({ page, request }) => {
      const account = await newDay3Account(request, { seed: true });
      // The API's answer when Google is configured, and Google itself, stood in for.
      let asked: URL | null = null;
      await page.route("**/api/calendar/google/connect?**", (route) => {
        asked = new URL(route.request().url());
        return route.fulfill({ json: { url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=signed" } });
      });
      await page.route("https://accounts.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>Google</title><h1>Choose an account</h1>" }));
      await open(page, account, PATH, "Booking setup");
      await page.getByRole("button", { name: "Connect Google Calendar for Asha" }).click();
      await expect(page).toHaveURL(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?client_id=test/);
      expect(asked!.searchParams.get("resourceId")).toBe(account.ids.asha);
    });

    test("shows Google's outcome after the callback sends the browser back to the dashboard", async ({ page, request }) => {
      const account = await newDay3Account(request, { seed: true });
      await open(page, account, PATH, "Booking setup");
      await page.goto(`/dashboard?google_calendar=connected&resource=${account.ids.ravi}`);
      await expect(page.getByRole("status").filter({ hasText: "Google Calendar connected for Ravi." })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${PATH}$`)); // forwarded, then the query is cleared

      await page.goto(`/dashboard?google_calendar=denied&resource=${account.ids.asha}`);
      await expect(page.getByRole("status").filter({ hasText: "Google Calendar wasn't connected for Asha: access was declined" })).toBeVisible();
    });
  });
});
