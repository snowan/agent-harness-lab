import { expect, test } from "@playwright/test";

test("loads a mission through the UI and renders the committed store revision", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Prove the harness change before you trust it." })).toBeVisible();
  await expect(page.getByTestId("phase")).toHaveText("mission loaded");
  await expect(page.getByTestId("revision")).toHaveText("0");

  await page.getByLabel("Choose a failure fixture").selectOption("handoff");
  await page.getByRole("button", { name: "Load mission" }).click();

  await expect(page.getByRole("heading", { name: "Broken context handoff" })).toBeVisible();
  await expect(page.getByTestId("revision")).toHaveText("1");
  const activity = page.getByRole("region", { name: "Workspace activity" });
  await expect(activity.getByText("mission loaded", { exact: true })).toBeVisible();
  await expect(activity.getByText("ui-1 · ui", { exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(consoleErrors).toEqual([]);
});

test("supports keyboard mission loading with visible focus", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Choose a failure fixture").focus();
  await page.getByLabel("Choose a failure fixture").selectOption("authority");
  await page.keyboard.press("Tab");

  const button = page.getByRole("button", { name: "Load mission" });
  await expect(button).toBeFocused();
  const focusRing = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusRing.style).not.toBe("none");
  expect(focusRing.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(focusRing.width).toBeGreaterThanOrEqual(2);
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Authority drift" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("loaded in a clean workspace");
});
