import { test, expect } from "@playwright/test";

test("create then view a patch", async ({ page }) => {
  await page.goto("/");
  await page
    .locator("#diff")
    .fill("diff --git a/x b/x\nindex 0..1\n--- a/x\n+++ b/x\n@@ -0,0 +1 @@\n+hello\n");
  await page.getByRole("button", { name: "Share" }).click();
  await page.waitForURL(/\/p\/[A-Za-z0-9]{22}$/);
  await expect(page.locator("text=expires in")).toBeVisible();
  await expect(page.locator("text=curl")).toBeVisible();
});
