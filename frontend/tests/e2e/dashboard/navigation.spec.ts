import {
  SCREENS,
  TAB_SCREENS,
  expect,
  expectNoHorizontalOverflow,
  isMobileWidth,
  navigateTo,
  openApp,
  screenRoot,
  test,
  topBar,
} from "./fixtures";

test.describe("app shell", () => {
  test("loads Home by default with the business, credits and Maya status", async ({ page }) => {
    await openApp(page);
    await expect(screenRoot(page, SCREENS[0])).toBeVisible();
    await expect(topBar(page)).toContainText("Home");
    await expect(topBar(page).getByRole("button", { name: /1,840 credits/ })).toBeVisible();
    await expect(page.getByText("Skyline Homes").first()).toBeVisible();
    await expect(page.getByText("Saturday, 24 Oct 2026")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  for (const screen of SCREENS) {
    test(`?screen=${screen.key} opens ${screen.nav} without overflow`, async ({ page }) => {
      await openApp(page, `screen=${screen.key}`);
      await expect(screenRoot(page, screen)).toBeVisible();
      await expect(topBar(page)).toContainText(screen.title);
      // Only one screen is mounted at a time.
      for (const other of SCREENS.filter((s) => s.key !== screen.key)) {
        await expect(screenRoot(page, other)).toHaveCount(0);
      }
      await expectNoHorizontalOverflow(page);
    });
  }

  test("navigates to every screen and back to Home", async ({ page }) => {
    await openApp(page);
    for (const screen of [...SCREENS.slice(1), SCREENS[0]]) {
      await navigateTo(page, screen);
      await expect(screenRoot(page, screen)).toBeVisible();
      await expect(topBar(page)).toContainText(screen.title);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("Home links open the inbox chat and the calendar", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: /Karthik R/ }).first().click();
    await expect(screenRoot(page, SCREENS[1])).toBeVisible();
    await expect(page.getByText("Karthik R").first()).toBeVisible();
    // On mobile the chat opens full screen; go back to the list to get the tab bar again.
    if (isMobileWidth(page)) await page.getByRole("button", { name: "Back" }).click();
    await navigateTo(page, SCREENS[0]);
    await page.getByRole("button", { name: "Calendar", exact: true }).last().click();
    await expect(screenRoot(page, SCREENS[3])).toBeVisible();
  });
});

test.describe("layout per width", () => {
  test("desktop and tablet show the sidebar; mobile shows the tab bar", async ({ page }) => {
    await openApp(page);
    const sidebarProfile = page.getByText("Owner · My profile");
    if (isMobileWidth(page)) {
      await expect(sidebarProfile).toHaveCount(0);
      const tabs = page.locator("nav").last().getByRole("button");
      await expect(tabs).toHaveText([/Home/, /Inbox/, /Leads/, /Calendar/, /More/]);
    } else {
      await expect(sidebarProfile).toBeVisible();
      await expect(page.locator("nav")).toHaveCount(1);
    }
  });
});

test.describe("mobile navigation", () => {
  test.beforeEach(({ page }) => {
    test.skip(!isMobileWidth(page), "mobile layout only");
  });

  test("More sheet lists the remaining screens and closes on the backdrop", async ({ page }) => {
    await openApp(page);
    await page.locator("nav").last().getByRole("button", { name: "More" }).click();
    const sheetItems = SCREENS.filter((s) => !TAB_SCREENS.includes(s.key));
    for (const s of sheetItems) {
      await expect(page.getByRole("button", { name: s.nav, exact: true })).toBeVisible();
    }
    // The backdrop covers the top of the screen above the sheet.
    await page.mouse.click(195, 40);
    for (const s of sheetItems) {
      await expect(page.getByRole("button", { name: s.nav, exact: true })).toHaveCount(0);
    }
    await expect(screenRoot(page, SCREENS[0])).toBeVisible();
  });

  test("opening a chat hides the tab bar and Back returns to the list", async ({ page }) => {
    await openApp(page, "screen=inbox");
    await page.getByRole("button", { name: /Sanjay K/ }).click();
    await expect(page.getByPlaceholder(/Maya is replying|Type a message/)).toBeVisible();
    await expect(page.locator("nav")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("button", { name: /Sanjay K/ })).toBeVisible();
    await expect(page.locator("nav")).toHaveCount(1);
  });

  test("profile button in the top bar opens Settings › My profile", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "My profile" }).click();
    await expect(screenRoot(page, SCREENS[10])).toBeVisible();
    await expect(page.getByRole("button", { name: "Save profile" })).toBeVisible();
  });
});
