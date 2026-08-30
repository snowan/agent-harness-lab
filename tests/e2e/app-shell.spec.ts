import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

function monitorBrowser(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
}

async function expectNoPageOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(metrics.document, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.body, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewport);
}

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    result.violations,
    JSON.stringify(result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    }))),
  ).toEqual([]);
}

async function runBaseline(page: Page) {
  const button = page.getByRole("button", { name: "Run deterministic baseline" });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByTestId("phase")).toHaveText("baseline failed");
  await expect(page.getByTestId("revision")).toContainText("Revision 2");
  await expect(page.getByRole("heading", { name: "Baseline trajectory" })).toBeVisible();
  await expect(page.locator('[aria-labelledby="baseline-trace-title"]').getByText("Invariant failed", { exact: true })).toBeVisible();
}

async function stageCandidate(page: Page, hypothesis?: string) {
  await page.getByRole("button", { name: "Review candidate patch" }).click();
  const patchTab = page.getByRole("tab", { name: "Harness patch" });
  await expect(patchTab).toHaveAttribute("aria-selected", "true");

  const field = page.getByLabel("Causal hypothesis");
  await expect(field).toBeEditable();
  if (hypothesis) await field.fill(hypothesis);
  await page.getByRole("button", { name: "Stage declared patch" }).click();

  await expect(page.getByTestId("phase")).toHaveText("patch staged");
  await expect(page.getByTestId("revision")).toContainText("Revision 3");
  await expect(patchTab).toBeFocused();
  await expect(page.getByText("staged", { exact: true }).first()).toBeVisible();
  await expect(field).toBeDisabled();
}

async function runCandidate(page: Page) {
  await page.getByRole("button", { name: "Run target + 2 sealed" }).click();
  await expect(page.getByTestId("phase")).toHaveText("compared");
  await expect(page.getByTestId("revision")).toContainText("Revision 5");

  const evidenceTab = page.getByRole("tab", { name: "Evidence matrix" });
  await expect(evidenceTab).toHaveAttribute("aria-selected", "true");
  await expect(evidenceTab).toBeFocused();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(5);
  const safetyRow = page.getByRole("table").getByRole("row", { name: /^safety /i });
  await expect(safetyRow.locator(".metric-badge").first()).toHaveText("2/2");
  await expect(safetyRow.locator(".metric-badge").first()).toHaveClass(/pass/);
  await expect(page.locator(".sealed-card")).toHaveCount(2);
  await expect(page.getByText("2 / 2 passed", { exact: true })).toBeVisible();
  await expect(page.getByText("Target trial", { exact: true })).toBeVisible();
  await expect(page.getByText("Limitations", { exact: true })).toBeVisible();
  await expect(page.locator(".target-card")).toHaveAttribute("data-status", "passed");
  await expect(page.locator('.sealed-card[data-status="passed"]')).toHaveCount(2);

  const sealedTones = await page.locator(".sealed-card").first().evaluate((element) => {
    const pass = getComputedStyle(element).borderTopColor;
    element.setAttribute("data-status", "failed");
    const fail = getComputedStyle(element).borderTopColor;
    element.setAttribute("data-status", "passed");
    return { pass, fail };
  });
  expect(sealedTones.fail).not.toBe(sealedTones.pass);
}

test("completes the primary human promotion flow with derived evidence", async ({ page }) => {
  const health = monitorBrowser(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Prove the harness change before you trust it." })).toBeVisible();
  await expect(page.getByTestId("phase")).toHaveText("mission loaded");
  await expect(page.getByTestId("revision")).toContainText("Revision 0");
  await expect(page.getByRole("button", { name: "Promote", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toBeDisabled();
  await expectNoPageOverflow(page);
  await expectAccessible(page);

  await runBaseline(page);
  await expect(page.locator('[aria-labelledby="baseline-trace-title"]')).toContainText("completion.target.activation.browser-qa");
  await expectNoPageOverflow(page);

  await stageCandidate(page);
  await expectAccessible(page);
  await expectNoPageOverflow(page);

  await runCandidate(page);
  await expect(page.getByRole("button", { name: "Promote", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toBeEnabled();
  await expect(page.getByText("Reviewing exact compared revision 5", { exact: false })).toBeVisible();
  await expectAccessible(page);
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: "Promote", exact: true }).click();
  await expect(page.getByTestId("phase")).toHaveText("promoted");
  await expect(page.getByTestId("revision")).toContainText("Revision 6");
  const decisionHeading = page.getByRole("heading", { name: "Candidate promoted by human" });
  await expect(decisionHeading).toBeVisible();
  await expect(decisionHeading).toBeFocused();
  await expect(page.getByText("references compared revision 5", { exact: false })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator(".sealed-card")).toHaveCount(2);
  await expect(page.getByText("candidate promoted", { exact: true })).toBeVisible();
  await expectAccessible(page);
  await expectNoPageOverflow(page);

  expect(health.consoleErrors).toEqual([]);
  expect(health.pageErrors).toEqual([]);
});

test("records a human rejection without discarding the comparison", async ({ page }) => {
  const health = monitorBrowser(page);
  await page.goto("/");
  await runBaseline(page);
  await stageCandidate(page);
  await runCandidate(page);

  const digestBefore = await page.locator(".target-card code").textContent();
  await page.getByRole("button", { name: "Reject", exact: true }).click();

  await expect(page.getByTestId("phase")).toHaveText("rejected");
  await expect(page.getByTestId("revision")).toContainText("Revision 6");
  await expect(page.getByRole("heading", { name: "Candidate rejected by human" })).toBeFocused();
  await expect(page.locator(".target-card code")).toHaveText(digestBefore ?? "");
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(5);
  await expect(page.locator(".sealed-card")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Promote", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toBeDisabled();
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: /H2.*Broken context handoff/ }).click();
  await expect(page.getByTestId("phase")).toHaveText("mission loaded");
  const activity = page.getByRole("region", { name: "Activity provenance" });
  await expect(activity.getByText(/mission loaded/i)).toBeVisible();
  await expect(activity.getByText(/candidate rejected/i)).toHaveCount(0);
  await expect(activity.getByText(/1 event/i)).toBeVisible();
  expect(health.consoleErrors).toEqual([]);
  expect(health.pageErrors).toEqual([]);
});

test("supports roving tabs, visible focus, and a modal contract preview", async ({ page }) => {
  const health = monitorBrowser(page);
  await page.goto("/");

  const trajectoryTab = page.getByRole("tab", { name: "Trajectory" });
  const evidenceTab = page.getByRole("tab", { name: "Evidence matrix" });
  const patchTab = page.getByRole("tab", { name: "Harness patch" });
  await trajectoryTab.focus();
  await page.keyboard.press("End");
  await expect(patchTab).toBeFocused();
  await expect(patchTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(trajectoryTab).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(patchTab).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(trajectoryTab).toBeFocused();

  const outline = await trajectoryTab.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);

  const opener = page.getByRole("button", { name: /Manual mode.*inspect contracts/ });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Agent-facing tool contracts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close tool contracts" })).toBeFocused();
  await expect(dialog.locator(".contract")).toHaveCount(8);
  await expect(dialog).toContainText("planned but not registered");
  await expect(dialog).toContainText("there is no promotion or rejection tool");

  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.querySelector("dialog")?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  const secondOpener = page.getByRole("button", { name: "Inspect planned contracts" });
  await secondOpener.click();
  await dialog.getByRole("button", { name: "Close tool contracts" }).click();
  await expect(secondOpener).toBeFocused();
  await expectNoPageOverflow(page);
  expect(health.consoleErrors).toEqual([]);
  expect(health.pageErrors).toEqual([]);
});

test("loads catalog-only missions truthfully and blocks downstream actions", async ({ page }) => {
  await page.goto("/");
  const handoff = page.getByRole("button", { name: /H2.*Broken context handoff/ });
  await handoff.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("phase")).toHaveText("mission loaded");
  await expect(page.getByTestId("revision")).toContainText("Revision 1");
  await expect(handoff).toHaveAttribute("aria-pressed", "true");
  const run = page.getByRole("button", { name: "Run deterministic baseline" });
  await expect(run).toBeDisabled();
  const disabledStyle = await run.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, shadow: style.boxShadow };
  });
  expect(disabledStyle.shadow).toBe("none");
  expect(disabledStyle.background).not.toBe("rgb(16, 26, 47)");
  await expect(page.getByText("This cataloged mission does not have an executable fixture yet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Promote", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toBeDisabled();
  await expect(page.locator('.workflow li[data-status="unavailable"]')).toHaveCount(4);
  await expect(page.getByText("not executable", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Decision gate unavailable" })).toBeVisible();
  await expect(page.getByText("This catalog entry has no executable comparison or decision gate in the current release.", { exact: true })).toBeVisible();
  await expect(page.getByText("This catalog entry has no executable candidate fixture in the current release.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Evidence matrix" }).click();
  await expect(page.getByText("This catalog entry has no executable baseline, candidate, or sealed evidence in the current release.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Harness patch" }).click();
  await expect(page.getByText("No candidate fixture is implemented for this mission yet.", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
});

test("honors reduced motion and keeps a maximum-length hypothesis reviewable", async ({ page }) => {
  const health = monitorBrowser(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const started = Date.now();
  await runBaseline(page);

  const hypothesis = `${"Evidence-bound browser validation proves the gate. ".repeat(7).slice(0, 279)}.`;
  expect(hypothesis).toHaveLength(280);
  await stageCandidate(page, hypothesis);
  await expect(page.getByText("280/280", { exact: false })).toBeVisible();
  await expect(page.locator(".candidate-summary").getByText(hypothesis, { exact: true })).toBeVisible();
  await runCandidate(page);

  expect(Date.now() - started).toBeLessThan(3_000);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await expectNoPageOverflow(page);
  expect(health.consoleErrors).toEqual([]);
  expect(health.pageErrors).toEqual([]);
});

test("reflows at a 200 percent browser-zoom proxy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The desktop project owns the 200% zoom proxy.");
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto("/");
  await runBaseline(page);
  await stageCandidate(page);
  await runCandidate(page);
  await expectNoPageOverflow(page);

  const decision = page.getByRole("button", { name: "Promote", exact: true });
  await decision.focus();
  await expect(decision).toBeFocused();
  await expect(decision).toBeEnabled();

  await page.getByRole("button", { name: "Inspect planned contracts" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent-facing tool contracts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close tool contracts" })).toBeFocused();
  await expectNoPageOverflow(page);
});
