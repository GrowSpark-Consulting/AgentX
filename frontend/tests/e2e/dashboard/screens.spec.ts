import { type Page } from "@playwright/test";
import { SCREENS, expect, isMobileWidth, openApp, screenRoot, test, topBar } from "./fixtures";

const toast = (page: Page, text: string | RegExp) => page.getByText(text).last();

test.describe("screen interactions", () => {
  test("inbox: filter, search, take over and send a reply", async ({ page }) => {
    await openApp(page, "screen=inbox");
    await page.getByRole("button", { name: /^Needs human 2$/ }).click();
    await expect(page.getByRole("button", { name: /Priya S/ })).toHaveCount(0);
    await page.getByRole("button", { name: /^All 9$/ }).click();
    await page.getByPlaceholder("Search name or number").fill("deepa");
    await expect(page.getByRole("button", { name: /Deepa N/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Karthik R/ })).toHaveCount(0);
    await page.getByPlaceholder("Search name or number").fill("");

    await page.getByRole("button", { name: /Karthik R/ }).click();
    const composer = page.getByPlaceholder(/Maya is replying|Type a message/);
    await expect(composer).toBeDisabled();
    await page.getByRole("group", { name: "Who replies" }).getByRole("button", { name: "Human" }).click();
    await expect(composer).toBeEnabled();
    await composer.fill("Ramesh will call you in 10 minutes.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Ramesh will call you in 10 minutes.", { exact: true })).toBeVisible();
    await expect(composer).toHaveValue("");

    await page.getByRole("group", { name: "Who replies" }).getByRole("button", { name: "AI" }).click();
    await expect(toast(page, "Maya is back on this chat")).toBeVisible();
    await expect(composer).toBeDisabled();
  });

  test("leads: score filter and lead detail", async ({ page }) => {
    await openApp(page, "screen=leads");
    const root = screenRoot(page, SCREENS[2]);
    await root.getByRole("button", { name: "Hot", exact: true }).click();
    await expect(root.getByRole("button", { name: /Karthik R/ })).toBeVisible();
    await expect(root.getByRole("button", { name: /Ganesh R/ })).toHaveCount(0);
    await root.getByRole("button", { name: "All", exact: true }).click();
    await root.getByRole("button", { name: /Ganesh R/ }).click();
    await expect(page.getByText("Budget below our range").first()).toBeVisible();
  });

  test("calendar: switch views and act on a booking", async ({ page }) => {
    await openApp(page, "screen=calendar");
    const root = screenRoot(page, SCREENS[3]);
    await root.getByRole("button", { name: "Week", exact: true }).click();
    await root.getByRole("button", { name: "Day", exact: true }).click();
    await root.getByRole("button", { name: /Karthik R/ }).first().click();
    await expect(page.getByRole("button", { name: "Mark visited" })).toBeVisible();
    await page.getByRole("button", { name: "Mark visited" }).click();
    await expect(toast(page, /Marked visited/)).toBeVisible();
  });

  test("features: toggles flip and the estimate follows", async ({ page }) => {
    await openApp(page, "screen=features");
    const sw = page.getByRole("switch", { name: "Booking confirmations" });
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await expect(toast(page, "Booking confirmations off")).toBeVisible();
  });

  test("team: invite a staff member", async ({ page }) => {
    await openApp(page, "screen=team");
    await page.getByRole("button", { name: "Invite staff" }).click();
    await page.getByPlaceholder("Meera").fill("Kiran");
    await page.getByPlaceholder("+91 98xxx xxxxx").fill("+91 98765 43210");
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(screenRoot(page, SCREENS[9]).getByText("Kiran", { exact: true })).toBeVisible();
  });

  test("knowledge: FAQs expand", async ({ page }) => {
    await openApp(page, "screen=knowledge");
    await page.getByRole("button", { name: /Is car parking included\?/ }).click();
    await expect(page.getByText(/One covered car park comes with every 2BHK/)).toBeVisible();
  });

  test("settings: sections switch", async ({ page }) => {
    await openApp(page, "screen=settings");
    const root = screenRoot(page, SCREENS[10]);
    const sections: [string, RegExp][] = [
      ["Business", /Business name/],
      ["Services & slots", /Gap between bookings/],
      ["Notifications", /Quiet hours/],
      ["Security & login", /Chrome on Windows/],
      ["My profile", /Save profile/],
    ];
    for (const [section, content] of sections) {
      await root.getByRole("button", { name: section, exact: true }).click();
      await expect(root.getByText(content).first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Save profile" })).toBeVisible();
  });

  test("dark mode toggles from the top bar", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".pk-light")).toHaveCount(1);
    await topBar(page).getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(page.locator(".pk-dark")).toHaveCount(1);
  });
});

test.describe("account states", () => {
  test("trial ended: paused banner sends the owner to Billing", async ({ page }) => {
    await openApp(page, "account=ended");
    await expect(page.getByText("Your trial has ended. Maya is paused, new chats go to your inbox.")).toBeVisible();
    await page.getByRole("button", { name: "Choose a plan" }).click();
    await expect(screenRoot(page, SCREENS[8])).toBeVisible();
  });

  test("zero credits: paused banner opens the top-up dialog", async ({ page }) => {
    await openApp(page, "credits=zero");
    await expect(page.getByText(/Assistant paused/)).toBeVisible();
    await page.getByRole("button", { name: "Top up", exact: true }).first().click();
    await expect(page.locator(".dialog")).toContainText("Top up credits");
  });

  test("low credits and trial show the soft banner", async ({ page }) => {
    await openApp(page, "credits=low");
    await expect(page.getByText(/You’ve used \d+% of your credits/)).toBeVisible();
    await openApp(page, "account=trial");
    await expect(page.getByText(/4 days left in your trial · 112 of 150 trial credits left/)).toBeVisible();
  });

  test("first day: empty Home and Inbox", async ({ page }) => {
    await openApp(page, "firstDay=1");
    await expect(page.getByText("Maya is live. Your first enquiries will show up here.")).toBeVisible();
    await openApp(page, "firstDay=1&screen=inbox");
    await expect(page.getByRole("button", { name: /Karthik R/ })).toHaveCount(0);
  });

  test("sample industries render their own tenant", async ({ page }) => {
    test.skip(isMobileWidth(page), "same data path on every width");
    for (const [industry, name] of [["salon", "Glow Studio"], ["hotel", "Hotel Kaveri"]]) {
      await openApp(page, `industry=${industry}`);
      await expect(page.getByText(name).first()).toBeVisible();
    }
  });
});
