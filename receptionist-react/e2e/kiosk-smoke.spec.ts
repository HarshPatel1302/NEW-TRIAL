import { test, expect } from "@playwright/test";

test.describe("Kiosk shell (production build)", () => {
  test("shows title, flow cards, and connect affordance", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Cyberone Receptionist/i })).toBeVisible();
    await expect(page.getByText("New Visitor")).toBeVisible();
    await expect(page.getByText("Delivery")).toBeVisible();
    await expect(page.locator(".connect-toggle")).toBeVisible({ timeout: 15_000 });
  });
});
