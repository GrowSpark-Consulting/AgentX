import { test as base, expect, type Page } from "@playwright/test";

/** Every dashboard screen: `?screen=` key, sidebar label, top-bar title and the screen's root marker. */
export const SCREENS = [
  { key: "home", nav: "Home", title: "Home", label: "03 Home" },
  { key: "inbox", nav: "Inbox", title: "Inbox", label: "04 Inbox" },
  { key: "leads", nav: "Leads", title: "Leads", label: "05 Leads" },
  { key: "calendar", nav: "Calendar", title: "Calendar", label: "06 Calendar" },
  { key: "features", nav: "Features", title: "Features", label: "07 Features" },
  { key: "agent", nav: "Agent settings", title: "Agent settings", label: "08 Agent settings" },
  { key: "knowledge", nav: "Knowledge base", title: "Knowledge base", label: "09 Knowledge base" },
  { key: "templates", nav: "Templates", title: "Message templates", label: "16 Templates" },
  { key: "billing", nav: "Billing & credits", title: "Billing & credits", label: "10 Billing" },
  { key: "team", nav: "Team", title: "Team", label: "11 Team" },
  { key: "settings", nav: "Settings", title: "Settings", label: "15 Settings" },
] as const;

export type Screen = (typeof SCREENS)[number];

/** Screens on the mobile tab bar; the rest sit in the More sheet. */
export const TAB_SCREENS = ["home", "inbox", "leads", "calendar"];

/** The app switches to its mobile layout below this width. */
export const MOBILE_MAX = 720;

export const isMobileWidth = (page: Page) => (page.viewportSize()?.width ?? 1440) < MOBILE_MAX;

/** Matches a nav button whose name is the label, optionally followed by a count badge ("Inbox 2"). */
export const navName = (label: string) => new RegExp(`^${label.replace(/[&]/g, "\\$&")}( \\d+)?$`);

export function screenRoot(page: Page, screen: Screen) {
  return page.locator(`[data-screen-label="${screen.label}"]`);
}

/** Opens /dashboard with the given query string and waits for the client-only app to mount. */
export async function openApp(page: Page, query = "") {
  await page.goto(`/dashboard${query ? `?${query}` : ""}`);
  await expect(page.locator(".sc-host").first()).toBeVisible();
}

/** The top bar's title (the first line of the header on mobile, the only title on desktop). */
export function topBar(page: Page) {
  return page.locator("header");
}

/** Fails if the page or the scrolling main area is wider than the viewport. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector("main");
    return {
      page: doc.scrollWidth - doc.clientWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
  expect(overflow.page, "page is wider than the viewport").toBeLessThanOrEqual(0);
  expect(overflow.main, "main content is wider than its column").toBeLessThanOrEqual(1);
}

/** Navigates with the sidebar (desktop, tablet) or the tab bar and More sheet (mobile). */
export async function navigateTo(page: Page, screen: Screen) {
  if (!isMobileWidth(page)) {
    await page.locator("nav").first().getByRole("button", { name: navName(screen.nav) }).click();
    return;
  }
  const tabBar = page.locator("nav").last();
  if (TAB_SCREENS.includes(screen.key)) {
    await tabBar.getByRole("button", { name: navName(screen.nav) }).click();
  } else {
    await tabBar.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: screen.nav, exact: true }).click();
  }
}

/**
 * `test` with a console guard: any console error or uncaught page error fails the test.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(String(e)));
      await use(errors);
      expect(errors, "console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
