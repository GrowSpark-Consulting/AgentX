import type { Page } from "@playwright/test";
import { expect, expectNoHorizontalOverflow, SIGNED_OUT, signIn, test } from "../support/app";

// Small accessibility and labelling guarantees across the signed-in app, at every project width:
// the shell's skip link, the sign-in page's logo, the sample-data bar over /dashboard/preview and the
// reason the inbox's AI / Human switch is off. Signed in through the project's storage state
// (owner@test.local, Test Realty) unless a test says otherwise.

/** The inbox opens a Supabase Realtime socket; mock-supabase has none, so hold it open and silent. */
async function holdRealtime(page: Page) {
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
}

test.describe("app shell", () => {
  test("Skip to content is the first stop for the keyboard and moves focus to the page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Test Realty" })).toBeVisible();

    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).not.toBeInViewport();
    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await expect(skip).not.toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("sign-in page, signed out", () => {
  test.use({ storageState: SIGNED_OUT });

  test("the logo stays on sign-in, like the other sign-in pages", async ({ page }) => {
    for (const path of ["/login", "/signup", "/forgot-password"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Spark Agent", exact: true })).toHaveAttribute("href", "/login");
    }
    await page.goto("/login");
    await page.getByRole("link", { name: "Spark Agent", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("dashboard preview", () => {
  test("says it's sample data, links back to the real dashboard, and fits the screen", async ({ page }) => {
    await page.goto("/dashboard/preview");
    await expect(page.locator(".sc-host").first()).toBeVisible();

    const bar = page.getByRole("note", { name: "Dashboard preview" });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("Preview");
    await expect(bar).toContainText("Sample data");
    await expect(bar).toBeInViewport();

    // The bar takes its height off the prototype's 100vh frame: no page scroll either way.
    const scroll = await page.evaluate(() => {
      const doc = document.documentElement;
      return { y: doc.scrollHeight - doc.clientHeight, x: doc.scrollWidth - doc.clientWidth };
    });
    expect(scroll.y, "page is taller than the viewport").toBeLessThanOrEqual(1);
    expect(scroll.x, "page is wider than the viewport").toBeLessThanOrEqual(0);

    await bar.getByRole("link", { name: "Back to your dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Test Realty" })).toBeVisible();
  });
});

test.describe("inbox, signed in with chats", () => {
  test.use({ storageState: SIGNED_OUT });

  test("the AI / Human switch is described in text everyone can reach", async ({ page }) => {
    await holdRealtime(page);
    await signIn(page, "inbox@test.local", "/dashboard/inbox?chat=40000000-0000-0000-0000-000000000002");
    const reason = "The AI replies until a team member takes over.";

    const whoReplies = page.getByRole("group", { name: "Who replies" });
    await expect(whoReplies).toHaveAccessibleDescription(reason);
    for (const name of ["AI", "Human"]) {
      await expect(whoReplies.getByRole("button", { name })).toBeEnabled();
      await expect(whoReplies.getByRole("button", { name })).toHaveAccessibleDescription(reason);
    }
    await expect(page.getByText(reason)).toBeVisible();
    await expect(page.getByText("AI is replying. Switch to Human to reply.")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
