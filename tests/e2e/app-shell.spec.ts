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

test("reproduces a deterministic baseline and renders traceable evidence", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  const runButton = page.getByRole("button", {
    name: "Run deterministic baseline",
  });
  await expect(runButton).toBeEnabled();
  await runButton.focus();
  await expect(runButton).toBeFocused();
  const focusRing = await runButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusRing.style).not.toBe("none");
  expect(focusRing.width).toBeGreaterThanOrEqual(2);
  await page.keyboard.press("Enter");

  const result = page.getByTestId("baseline-result");
  await expect(result).toBeVisible();
  await expect(page.getByTestId("phase")).toHaveText("baseline failed");
  await expect(page.getByTestId("revision")).toHaveText("2");
  await expect(result).toContainText("Built-in deterministic fixture");
  await expect(result).toContainText("Failed as expected");
  await expect(page.getByTestId("baseline-passed")).toHaveText("7/14");
  await expect(page.getByTestId("baseline-failed")).toHaveText("7/14");
  const firstDigest = (await page.getByTestId("baseline-digest").textContent())?.trim();
  expect(firstDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  await expect(page.getByTestId("baseline-evidence-ref")).toContainText(
    "completion.target.activation.browser-qa",
  );
  await expect(page.getByTestId("baseline-evidence-ref")).toContainText(
    ":fact:artifact.browser_qa.loaded",
  );
  await expect(page.getByRole("status")).toContainText(
    "invariant failed as expected",
  );

  await page.getByRole("button", { name: "Load mission" }).click();
  await expect(page.getByTestId("baseline-result")).toHaveCount(0);
  await page.getByRole("button", { name: "Run deterministic baseline" }).click();
  await expect(page.getByTestId("baseline-result")).toBeVisible();
  const replayDigest = (await page.getByTestId("baseline-digest").textContent())?.trim();
  expect(replayDigest).toBe(firstDigest);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("explains why an unimplemented mission cannot run", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Choose a failure fixture").selectOption("handoff");
  await page.getByRole("button", { name: "Load mission" }).click();

  const runButton = page.getByRole("button", {
    name: "Run deterministic baseline",
  });
  await expect(runButton).toBeDisabled();
  const describedBy = await runButton.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(
    "This cataloged mission does not have an executable fixture yet.",
  );
});
