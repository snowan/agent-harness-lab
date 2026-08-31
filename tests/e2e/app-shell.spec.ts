import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const expectedWebMcpTools = [
  "get_lab_state",
  "load_mission",
  "run_baseline",
  "inspect_trace",
  "stage_harness_patch",
  "run_candidate_suite",
  "compare_harnesses",
  "export_evidence_receipt",
] as const;

async function installWebMcpHarness(page: Page) {
  await page.addInitScript(() => {
    type TestTool = {
      readonly name: string;
      readonly execute: (
        input: Record<string, unknown>,
        options: { readonly signal: AbortSignal },
      ) => Promise<unknown>;
    };
    const tools = new Map<string, TestTool>();
    const bridge = {
      names: () => [...tools.keys()],
      async invoke(name: string, input: Record<string, unknown>) {
        const tool = tools.get(name);
        if (!tool) throw new Error(`Tool ${name} is not registered.`);
        return tool.execute(input, { signal: new AbortController().signal });
      },
    };
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(
          tool: TestTool,
          options?: { readonly signal?: AbortSignal },
        ) {
          tools.set(tool.name, tool);
          options?.signal?.addEventListener("abort", () => tools.delete(tool.name), { once: true });
        },
      },
    });
    Object.defineProperty(window, "__webmcpHarness", {
      configurable: true,
      value: bridge,
    });
  });
}

async function invokeWebMcp(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
) {
  return page.evaluate(async ({ toolName, toolInput }) => {
    const bridge = (window as typeof window & {
      __webmcpHarness: {
        invoke: (name: string, input: Record<string, unknown>) => Promise<unknown>;
      };
    }).__webmcpHarness;
    return bridge.invoke(toolName, toolInput);
  }, { toolName: name, toolInput: input });
}

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
  await expect(page.getByTestId("webmcp-runtime")).toHaveAttribute("data-state", "unavailable");
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

test("supports roving tabs, visible focus, and the live contract dialog", async ({ page }) => {
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
  await expect(dialog).toContainText("WebMCP is unavailable in this browser");
  await expect(dialog).toContainText("there is no promotion or rejection tool");

  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.querySelector("dialog")?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  const secondOpener = page.getByRole("button", { name: "Inspect live contracts" });
  await secondOpener.click();
  await dialog.getByRole("button", { name: "Close tool contracts" }).click();
  await expect(secondOpener).toBeFocused();
  await expectNoPageOverflow(page);
  expect(health.consoleErrors).toEqual([]);
  expect(health.pageErrors).toEqual([]);
});

test("lets an agent run the shared WebMCP workflow while a human owns promotion", async ({ page }) => {
  const health = monitorBrowser(page);
  await installWebMcpHarness(page);
  await page.goto("/");

  const runtime = page.getByTestId("webmcp-runtime");
  await expect(runtime).toHaveAttribute("data-state", "ready");
  await expect(runtime).toContainText("WebMCP · 8 tools");
  const discovered = await page.evaluate(() => (
    (window as typeof window & { __webmcpHarness: { names: () => string[] } })
      .__webmcpHarness.names()
  ));
  expect(discovered).toEqual(expectedWebMcpTools);
  expect(discovered.join(" ")).not.toMatch(/promote|reject|deploy|execute_code|filesystem/);

  const beforeIllegal = await page.getByTestId("revision").textContent();
  const illegal = await invokeWebMcp(page, "run_candidate_suite", {
    request_id: "browser-illegal-order",
  });
  expect(illegal).toMatchObject({ ok: false, error: { code: "ILLEGAL_TRANSITION" } });
  await expect(page.getByTestId("phase")).toHaveText("mission loaded");
  await expect(page.getByTestId("revision")).toHaveText(beforeIllegal ?? "");
  await expect(page.getByTestId("webmcp-last-call")).toHaveAttribute("data-state", "failed");
  await expect(page.getByRole("alert")).toContainText("ILLEGAL_TRANSITION");

  const baseline = await invokeWebMcp(page, "run_baseline", { request_id: "browser-baseline" });
  expect(baseline).toMatchObject({ ok: true, data: { phase: "baseline_failed", revision: 2 } });
  expect(JSON.stringify(baseline).length).toBeLessThanOrEqual(1_500);
  await expect(page.getByTestId("phase")).toHaveText("baseline failed");
  await expect(page.getByTestId("revision")).toContainText("Revision 2");
  await expect(page.getByTestId("webmcp-last-call")).toContainText("run_baseline");

  const trace = await invokeWebMcp(page, "inspect_trace", { run: "baseline", limit: 2 });
  expect(trace).toMatchObject({ ok: true, data: { run: "baseline", offset: 0 } });
  expect(JSON.stringify(trace).length).toBeLessThanOrEqual(1_500);
  await expect(page.getByTestId("revision")).toContainText("Revision 2");

  const hypothesis = "The fixed completion gate should activate browser QA and require both receipts.";
  const staged = await invokeWebMcp(page, "stage_harness_patch", {
    request_id: "browser-stage",
    hypothesis,
  });
  expect(staged).toMatchObject({ ok: true, data: { phase: "patch_staged", revision: 3 } });
  await expect(page.getByTestId("phase")).toHaveText("patch staged");
  await expect(page.getByRole("tab", { name: "Harness patch" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".candidate-summary")).toContainText(hypothesis);

  const suite = await invokeWebMcp(page, "run_candidate_suite", { request_id: "browser-suite" });
  expect(suite).toMatchObject({ ok: true, data: { phase: "compared", revision: 5 } });
  await expect(page.getByTestId("phase")).toHaveText("compared");
  await expect(page.getByRole("tab", { name: "Evidence matrix" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(5);
  await expect(page.locator(".sealed-card")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Promote", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toBeEnabled();

  const agentBadges = page.locator(".activity-list .actor-badge");
  await expect(agentBadges).toHaveCount(5);
  await expect(agentBadges).toHaveText(["agent", "agent", "agent", "agent", "agent"]);
  await expect(page.getByRole("region", { name: "Activity provenance" })).toContainText("webmcp");

  const beforeInvalid = await page.getByTestId("revision").textContent();
  const invalid = await invokeWebMcp(page, "run_candidate_suite", { unexpected: true });
  expect(invalid).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  await expect(page.getByTestId("revision")).toHaveText(beforeInvalid ?? "");
  await expect(page.getByTestId("webmcp-last-call")).toHaveAttribute("data-state", "failed");

  const comparison = await invokeWebMcp(page, "compare_harnesses");
  expect(comparison).toMatchObject({
    ok: true,
    data: { sealed: { passed: 2, total: 2 }, promotionIsHumanOnly: true },
  });
  expect(JSON.stringify(comparison).length).toBeLessThanOrEqual(1_500);

  await page.getByRole("button", { name: "Promote", exact: true }).click();
  await expect(page.getByTestId("phase")).toHaveText("promoted");
  await expect(page.getByRole("heading", { name: "Candidate promoted by human" })).toBeVisible();
  await expect(page.locator(".activity-list .actor-badge").first()).toHaveText("human");

  const receipt = await invokeWebMcp(page, "export_evidence_receipt");
  expect(receipt).toMatchObject({
    ok: true,
    data: {
      decision: { outcome: "promoted", actor: "human", comparedRevision: 5 },
      promotionIsHumanOnly: true,
    },
  });
  expect(JSON.stringify(receipt).length).toBeLessThanOrEqual(1_500);

  await expectAccessible(page);
  await expectNoPageOverflow(page);
  expect(health.consoleErrors).toEqual([]);
  expect(health.pageErrors).toEqual([]);
});

test("resets a stale hypothesis draft when an agent reloads the same mission", async ({ page }) => {
  const health = monitorBrowser(page);
  await installWebMcpHarness(page);
  await page.goto("/");

  await invokeWebMcp(page, "run_baseline", { request_id: "same-mission-baseline-1" });
  await page.getByRole("button", { name: "Review candidate patch" }).click();
  const field = page.getByLabel("Causal hypothesis");
  const fixtureHypothesis = await field.inputValue();
  await field.fill("A stale local draft that must not survive a clean mission reload.");

  const loaded = await invokeWebMcp(page, "load_mission", {
    mission_id: "completion",
    request_id: "same-mission-load",
  });
  expect(loaded).toMatchObject({ ok: true, data: { phase: "mission_loaded", revision: 3 } });
  await expect(page.getByRole("tab", { name: "Trajectory" })).toHaveAttribute("aria-selected", "true");
  await invokeWebMcp(page, "run_baseline", { request_id: "same-mission-baseline-2" });
  await page.getByRole("button", { name: "Review candidate patch" }).click();
  await expect(page.getByLabel("Causal hypothesis")).toHaveValue(fixtureHypothesis);
  await expect(page.getByTestId("webmcp-last-call")).toHaveAttribute("data-state", "succeeded");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expectAccessible(page);
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

  await page.getByRole("button", { name: "Inspect live contracts" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent-facing tool contracts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close tool contracts" })).toBeFocused();
  await expectNoPageOverflow(page);
});
