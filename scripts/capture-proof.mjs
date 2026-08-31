import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const proofId = process.argv[2];
const supportedProofs = new Set(["pr-01", "pr-02", "pr-03", "pr-04", "pr-05"]);

if (!supportedProofs.has(proofId)) {
  throw new Error("Use an available proof script from `npm run proof:pr1` through `npm run proof:pr5`.");
}

const expectedWebMcpTools = [
  "get_lab_state",
  "load_mission",
  "run_baseline",
  "inspect_trace",
  "stage_harness_patch",
  "run_candidate_suite",
  "compare_harnesses",
  "export_evidence_receipt",
];

const root = process.cwd();
const outputDir = path.join(root, "output", "playwright", proofId);
const videoDir = path.join(outputDir, ".video-tmp");
const proofPort = Number(process.env.AHL_PROOF_PORT ?? "4378");
if (!Number.isInteger(proofPort) || proofPort < 1 || proofPort > 65_535) {
  throw new Error("AHL_PROOF_PORT must be an integer between 1 and 65535.");
}
const appUrl = `http://127.0.0.1:${proofPort}`;

await mkdir(outputDir, { recursive: true });
await rm(videoDir, { recursive: true, force: true });
await mkdir(videoDir, { recursive: true });

const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules", "vite", "bin", "vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(proofPort),
    "--strictPort",
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);

let serverFailure;
server.once("error", (error) => {
  serverFailure = error;
});
server.once("exit", (code, signal) => {
  if (code !== 0 && code !== null) {
    serverFailure = new Error(`Proof server exited with code ${code}.`);
  } else if (signal && signal !== "SIGTERM") {
    serverFailure = new Error(`Proof server exited after signal ${signal}.`);
  }
});

async function waitForApp() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverFailure) throw serverFailure;
    try {
      const response = await fetch(appUrl);
      const html = await response.text();
      if (
        response.ok
        && html.includes("<title>Agent Harness Lab</title>")
        && html.includes('id="root"')
      ) return;
    } catch {
      // The production preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Agent Harness Lab did not start at ${appUrl} within 30 seconds.`);
}

let browser;

function monitorPage(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
}

async function assertHealthy(page, health) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  if (metrics.document > metrics.viewport || metrics.body > metrics.viewport) {
    throw new Error(`Proof page overflowed: ${JSON.stringify(metrics)}.`);
  }
  if (health.consoleErrors.length || health.pageErrors.length) {
    throw new Error(
      `Proof page reported browser errors: ${[
        ...health.consoleErrors,
        ...health.pageErrors,
      ].join(" | ")}`,
    );
  }
}

async function installWebMcpHarness(page) {
  await page.addInitScript(() => {
    const tools = new Map();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(tool, options) {
          tools.set(tool.name, tool);
          options?.signal?.addEventListener(
            "abort",
            () => tools.delete(tool.name),
            { once: true },
          );
        },
      },
    });
    Object.defineProperty(window, "__webmcpHarness", {
      configurable: true,
      value: {
        names: () => [...tools.keys()],
        async invoke(name, input = {}) {
          const tool = tools.get(name);
          if (!tool) throw new Error(`Tool ${name} is not registered.`);
          return tool.execute(input, { signal: new AbortController().signal });
        },
      },
    });
  });
}

async function invokeWebMcp(page, name, input = {}) {
  return page.evaluate(
    ({ toolName, toolInput }) => window.__webmcpHarness.invoke(toolName, toolInput),
    { toolName: name, toolInput: input },
  );
}

async function preparePr1Page(page, missionId) {
  const mission = missionId === "handoff"
    ? { pattern: /H2.*Broken context handoff/, heading: "Broken context handoff" }
    : { pattern: /A4.*Authority drift/, heading: "Authority drift" };
  await page.getByRole("button", { name: mission.pattern }).click();
  await page.getByRole("heading", { name: mission.heading }).waitFor();
  const phase = await page.getByTestId("phase").textContent();
  if (phase?.trim() !== "mission loaded") {
    throw new Error(`PR1 proof expected mission loaded; received ${phase ?? "no phase"}.`);
  }
}

async function preparePr2Page(page) {
  await page.getByRole("button", { name: "Run deterministic baseline" }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="phase"]')?.textContent?.trim() === "baseline failed"
  );
  const phase = await page.getByTestId("phase").textContent();
  const revision = await page.getByTestId("revision").textContent();
  const baseline = page.locator('[aria-labelledby="baseline-trace-title"]');
  const digest = await baseline.locator(".trace-digest").textContent();
  const evidence = await baseline.textContent();
  if (phase?.trim() !== "baseline failed" || !revision?.includes("Revision 2")) {
    throw new Error(`PR2 proof expected baseline failed at revision 2; received ${phase}/${revision}.`);
  }
  if (!digest || !/^sha256:[0-9a-f]{64}$/.test(digest.trim())) {
    throw new Error("PR2 proof is missing its canonical SHA-256 digest.");
  }
  if (!evidence?.includes("completion.target.activation.browser-qa")) {
    throw new Error("PR2 proof is missing its assertion-to-fact evidence reference.");
  }
}

async function runPr3Comparison(page, paced = false) {
  const pause = async (duration = 500) => {
    if (paced) await page.waitForTimeout(duration);
  };

  await pause(700);
  await page.getByRole("button", { name: "Run deterministic baseline" }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="phase"]')?.textContent?.trim() === "baseline failed"
  );
  await pause();
  if (paced) {
    await page.getByRole("heading", { name: "Baseline trajectory" }).scrollIntoViewIfNeeded();
    await pause(850);
  }

  await page.getByRole("button", { name: "Review candidate patch" }).click();
  await page.getByLabel("Causal hypothesis").waitFor();
  await pause();
  if (paced) {
    await page.locator(".diff").scrollIntoViewIfNeeded();
    await pause(850);
  }

  await page.getByRole("button", { name: "Stage declared patch" }).click();
  await page.getByRole("button", { name: "Run target + 2 sealed" }).waitFor();
  await pause();

  await page.getByRole("button", { name: "Run target + 2 sealed" }).click();
  await page.getByRole("table").waitFor();
  await pause(900);

  const phase = await page.getByTestId("phase").textContent();
  const revision = await page.getByTestId("revision").textContent();
  const rows = await page.getByRole("table").locator("tbody tr").count();
  const sealed = await page.locator(".sealed-card").count();
  const promoteEnabled = await page.getByRole("button", { name: "Promote", exact: true }).isEnabled();
  if (
    phase?.trim() !== "compared"
    || !revision?.includes("Revision 5")
    || rows !== 5
    || sealed !== 2
    || !promoteEnabled
  ) {
    throw new Error(
      `PR3 proof expected compared revision 5 with five signals, two sealed trials, and an enabled human decision; received ${phase}/${revision}/${rows}/${sealed}/${promoteEnabled}.`,
    );
  }
}

async function recordPr3Decision(page) {
  await page.locator(".runtime-pill").click();
  const dialog = page.getByRole("dialog", { name: "Agent-facing tool contracts" });
  await dialog.waitFor();
  if (await dialog.locator(".contract").count() !== 8) {
    throw new Error("PR3 proof expected eight planned WebMCP contract previews.");
  }
  await page.waitForTimeout(900);
  await dialog.getByRole("button", { name: "Close tool contracts" }).click();

  const promote = page.getByRole("button", { name: "Promote", exact: true });
  await promote.scrollIntoViewIfNeeded();
  await page.waitForTimeout(650);
  await promote.click();
  const heading = page.getByRole("heading", { name: "Candidate promoted by human" });
  await heading.waitFor();
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1_000);

  const phase = await page.getByTestId("phase").textContent();
  const revision = await page.getByTestId("revision").textContent();
  const decision = await heading.locator("..").textContent();
  if (
    phase?.trim() !== "promoted"
    || !revision?.includes("Revision 6")
    || !decision?.includes("compared revision 5")
  ) {
    throw new Error(`PR3 proof recorded an unexpected decision state: ${phase}/${revision}/${decision}.`);
  }
}

async function preparePr3Page(page, promote) {
  await runPr3Comparison(page);
  if (promote) {
    await page.getByRole("button", { name: "Promote", exact: true }).click();
    await page.getByRole("heading", { name: "Candidate promoted by human" }).waitFor();
  }
}

async function runPr4AgentComparison(page, paced = false) {
  const pause = async (duration = 500) => {
    if (paced) await page.waitForTimeout(duration);
  };
  const expectResult = (result, phase, revision, tool) => {
    if (!result?.ok || result.data?.phase !== phase || result.data?.revision !== revision) {
      throw new Error(
        `PR4 ${tool} returned an unexpected result: ${JSON.stringify(result)}.`,
      );
    }
  };

  await page.waitForFunction(() =>
    document.querySelector('[data-testid="webmcp-runtime"]')?.getAttribute("data-state") === "ready"
  );
  const runtime = await page.getByTestId("webmcp-runtime").textContent();
  const discovered = await page.evaluate(() => window.__webmcpHarness.names());
  if (
    runtime?.trim() !== "WebMCP · 8 tools"
    || JSON.stringify(discovered) !== JSON.stringify(expectedWebMcpTools)
    || discovered.some((name) => /promote|reject|deploy|execute_code|filesystem/.test(name))
  ) {
    throw new Error(
      `PR4 proof expected the eight bounded WebMCP tools and no decision or broad-execution tools; received ${runtime}/${JSON.stringify(discovered)}.`,
    );
  }

  await pause(700);
  const baseline = await invokeWebMcp(page, "run_baseline", {
    request_id: "proof-baseline",
  });
  expectResult(baseline, "baseline_failed", 2, "run_baseline");
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="phase"]')?.textContent?.trim() === "baseline failed"
  );
  await pause(650);
  if (paced) {
    await page.getByRole("heading", { name: "Baseline trajectory" }).scrollIntoViewIfNeeded();
    await pause(850);
  }

  const trace = await invokeWebMcp(page, "inspect_trace", {
    run: "baseline",
    limit: 2,
  });
  if (!trace?.ok || trace.data?.run !== "baseline" || trace.data?.facts?.length !== 2) {
    throw new Error(`PR4 inspect_trace returned an unexpected result: ${JSON.stringify(trace)}.`);
  }

  const hypothesis = "The fixed completion gate should activate browser QA and require both receipts.";
  const staged = await invokeWebMcp(page, "stage_harness_patch", {
    request_id: "proof-stage",
    hypothesis,
  });
  expectResult(staged, "patch_staged", 3, "stage_harness_patch");
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="phase"]')?.textContent?.trim() === "patch staged"
  );
  await pause(650);
  if (paced) {
    await page.locator(".candidate-summary").scrollIntoViewIfNeeded();
    await pause(850);
  }

  const suite = await invokeWebMcp(page, "run_candidate_suite", {
    request_id: "proof-suite",
  });
  expectResult(suite, "compared", 5, "run_candidate_suite");
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="phase"]')?.textContent?.trim() === "compared"
  );
  const comparison = await invokeWebMcp(page, "compare_harnesses");
  if (
    !comparison?.ok
    || comparison.data?.sealed?.passed !== 2
    || comparison.data?.sealed?.total !== 2
    || comparison.data?.promotionIsHumanOnly !== true
  ) {
    throw new Error(
      `PR4 compare_harnesses returned an unexpected result: ${JSON.stringify(comparison)}.`,
    );
  }
  await pause(900);

  const phase = await page.getByTestId("phase").textContent();
  const revision = await page.getByTestId("revision").textContent();
  const rows = await page.getByRole("table").locator("tbody tr").count();
  const sealed = await page.locator(".sealed-card").count();
  const promoteEnabled = await page.getByRole("button", { name: "Promote", exact: true }).isEnabled();
  const actors = await page.locator(".activity-list .actor-badge").allTextContents();
  const activity = await page.getByRole("region", { name: "Activity provenance" }).textContent();
  if (
    phase?.trim() !== "compared"
    || !revision?.includes("Revision 5")
    || rows !== 5
    || sealed !== 2
    || !promoteEnabled
    || actors.length !== 5
    || actors.some((actor) => actor.trim() !== "agent")
    || !activity?.includes("webmcp")
  ) {
    throw new Error(
      `PR4 proof expected compared revision 5, five signals, two sealed trials, five agent-attributed events, and an enabled human decision; received ${phase}/${revision}/${rows}/${sealed}/${promoteEnabled}/${JSON.stringify(actors)}.`,
    );
  }
}

async function recordPr4HumanDecision(page, paced = false) {
  const pause = async (duration = 500) => {
    if (paced) await page.waitForTimeout(duration);
  };

  await page.getByTestId("webmcp-runtime").click();
  const dialog = page.getByRole("dialog", { name: "Agent-facing tool contracts" });
  await dialog.waitFor();
  if (
    await dialog.locator(".contract").count() !== 8
    || !(await dialog.textContent())?.includes("there is no promotion or rejection tool")
  ) {
    throw new Error("PR4 proof expected eight live contracts and an explicit human-decision boundary.");
  }
  await pause(900);
  await dialog.getByRole("button", { name: "Close tool contracts" }).click();

  const promote = page.getByRole("button", { name: "Promote", exact: true });
  await promote.scrollIntoViewIfNeeded();
  await pause(650);
  await promote.click();
  const heading = page.getByRole("heading", { name: "Candidate promoted by human" });
  await heading.waitFor();
  await heading.scrollIntoViewIfNeeded();
  await pause(850);

  const receipt = await invokeWebMcp(page, "export_evidence_receipt");
  const firstActor = await page.locator(".activity-list .actor-badge").first().textContent();
  const phase = await page.getByTestId("phase").textContent();
  const revision = await page.getByTestId("revision").textContent();
  if (
    phase?.trim() !== "promoted"
    || !revision?.includes("Revision 6")
    || firstActor?.trim() !== "human"
    || !receipt?.ok
    || receipt.data?.decision?.actor !== "human"
    || receipt.data?.decision?.comparedRevision !== 5
  ) {
    throw new Error(
      `PR4 proof recorded an unexpected human decision or receipt: ${phase}/${revision}/${firstActor}/${JSON.stringify(receipt)}.`,
    );
  }
}

async function preparePr4Page(page, promote) {
  await runPr4AgentComparison(page);
  if (promote) await recordPr4HumanDecision(page);
}

async function runPr5HandoffComparison(page, paced = false) {
  const pause = async (duration = 500) => {
    if (paced) await page.waitForTimeout(duration);
  };

  await page.getByRole("button", { name: /H2.*Broken context handoff/ }).click();
  await page.getByRole("heading", { name: "Broken context handoff" }).waitFor();
  await pause(650);
  await page.getByRole("button", { name: "Run deterministic baseline" }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="phase"]')?.textContent?.trim() === "baseline failed"
  );
  await pause(750);
  if (paced) {
    await page.getByRole("heading", { name: "Baseline trajectory" }).scrollIntoViewIfNeeded();
    await pause(850);
  }

  await page.getByRole("button", { name: "Review candidate patch" }).click();
  const hypothesis = page.getByLabel("Causal hypothesis");
  await hypothesis.fill(
    "Validated checkpoints should preserve the blocker and resume from the next planned action.",
  );
  await pause(650);
  await page.getByRole("button", { name: "Stage declared patch" }).click();
  await page.getByRole("button", { name: "Run target + 2 sealed" }).waitFor();
  await pause(650);
  await page.getByRole("button", { name: "Run target + 2 sealed" }).click();
  await page.getByRole("table").waitFor();
  await pause(900);

  const phase = await page.getByTestId("phase").textContent();
  const revision = await page.getByTestId("revision").textContent();
  const rows = await page.getByRole("table").locator("tbody tr").count();
  const sealed = await page.locator('.sealed-card[data-status="passed"]').count();
  const recovery = await page.getByTestId("persistence-status").textContent();
  if (
    phase?.trim() !== "compared"
    || !revision?.includes("Revision 6")
    || rows !== 5
    || sealed !== 2
    || !recovery?.includes("Saved local revision 6 for handoff")
  ) {
    throw new Error(
      `PR5 proof expected handoff compared revision 6 with five signals, two passing sealed trials, and a saved snapshot; received ${phase}/${revision}/${rows}/${sealed}/${recovery}.`,
    );
  }
}

async function downloadRestoreAndConfirm(page, paced = false) {
  const pause = async (duration = 500) => {
    if (paced) await page.waitForTimeout(duration);
  };
  const phase = (await page.getByTestId("phase").textContent())?.trim();
  const revision = await page.getByTestId("revision").textContent();
  if (phase !== "compared" || !revision) {
    throw new Error(`PR5 recovery proof requires a compared workspace; received ${phase}/${revision}.`);
  }

  const firstDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON receipt" }).click();
  const downloaded = await firstDownload;
  if (!downloaded.suggestedFilename().endsWith(".json")) {
    throw new Error(`PR5 receipt used an unexpected filename ${downloaded.suggestedFilename()}.`);
  }
  const firstReceipt = await page.getByTestId("receipt-download").textContent();
  if (!firstReceipt || !/sha256:[0-9a-f]{64}/.test(firstReceipt)) {
    throw new Error("PR5 proof did not render the verified receipt digest.");
  }
  const firstPath = await downloaded.path();
  if (!firstPath) throw new Error("PR5 receipt download did not produce a readable file.");
  const firstPayload = JSON.parse(await readFile(firstPath, "utf8"));
  if (
    firstPayload.schemaVersion !== "1.0.0"
    || !/^sha256:[0-9a-f]{64}$/.test(firstPayload.receiptDigest)
    || !Array.isArray(firstPayload.runs?.baseline?.facts)
    || !Array.isArray(firstPayload.runs?.baseline?.assertions)
  ) {
    throw new Error("PR5 first receipt did not contain the formal schema, digest, facts, and assertions.");
  }
  await pause(850);

  await page.reload();
  await page.waitForFunction(
    ({ expectedPhase, expectedRevision }) =>
      document.querySelector('[data-testid="phase"]')?.textContent?.trim() === expectedPhase
      && document.querySelector('[data-testid="revision"]')?.textContent?.includes(expectedRevision),
    { expectedPhase: phase, expectedRevision: revision },
  );
  const persistence = page.getByTestId("persistence-status");
  if (
    await persistence.getAttribute("data-state") !== "restored"
    || !(await persistence.textContent())?.includes("Restored local revision")
  ) {
    throw new Error(`PR5 proof did not restore its stable snapshot: ${await persistence.textContent()}.`);
  }
  await page.getByRole("button", { name: "Review evidence" }).click();
  await page.getByRole("table").waitFor();
  await pause(750);

  const secondDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON receipt" }).click();
  const restoredDownload = await secondDownload;
  const restoredPath = await restoredDownload.path();
  if (!restoredPath) throw new Error("PR5 restored receipt did not produce a readable file.");
  const restoredPayload = JSON.parse(await readFile(restoredPath, "utf8"));
  if (restoredPayload.receiptDigest !== firstPayload.receiptDigest) {
    throw new Error(
      `PR5 restored receipt changed canonical digest from ${firstPayload.receiptDigest} to ${restoredPayload.receiptDigest}.`,
    );
  }
  const finalReceipt = await page.getByTestId("receipt-download").textContent();
  if (!finalReceipt || !finalReceipt.includes(restoredPayload.receiptDigest)) {
    throw new Error("PR5 restored proof did not reproduce a verified receipt digest.");
  }
  await pause(850);
}

async function preparePr5Page(page, variant) {
  if (variant === "desktop") {
    await runPr5HandoffComparison(page);
    return;
  }
  await runPr3Comparison(page);
  await downloadRestoreAndConfirm(page);
}

async function preparePage(page, variant) {
  const health = monitorPage(page);
  if (proofId === "pr-04") await installWebMcpHarness(page);
  await page.goto(appUrl);
  if (proofId === "pr-01") {
    await preparePr1Page(page, variant === "mobile" ? "authority" : "handoff");
  } else if (proofId === "pr-02") {
    await preparePr2Page(page);
  } else if (proofId === "pr-03") {
    await preparePr3Page(page, variant === "mobile");
  } else if (proofId === "pr-04") {
    await preparePr4Page(page, variant === "mobile");
  } else {
    await preparePr5Page(page, variant);
  }
  await assertHealthy(page, health);
}

try {
  await waitForApp();
  browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const videoHealth = monitorPage(page);
  if (proofId === "pr-04") await installWebMcpHarness(page);
  await page.goto(appUrl);
  if (proofId === "pr-01") {
    await page.waitForTimeout(550);
    await preparePr1Page(page, "handoff");
    await page.waitForTimeout(1_400);
  } else if (proofId === "pr-02") {
    await page.waitForTimeout(550);
    await preparePr2Page(page);
    await page.locator('[aria-labelledby="baseline-trace-title"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_400);
  } else if (proofId === "pr-03") {
    await runPr3Comparison(page, true);
    await page.getByRole("table").scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await recordPr3Decision(page);
  } else if (proofId === "pr-04") {
    await runPr4AgentComparison(page, true);
    await page.getByRole("table").scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await recordPr4HumanDecision(page, true);
  } else {
    await runPr5HandoffComparison(page, true);
    await page.getByRole("table").scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await downloadRestoreAndConfirm(page, true);
  }
  await assertHealthy(page, videoHealth);
  await context.close();

  const videos = (await readdir(videoDir)).filter((file) => file.endsWith(".webm"));
  const video = videos[0];
  if (!video) throw new Error("Playwright did not produce a video file.");
  const videoName = proofId === "pr-01"
    ? "app-shell.webm"
    : proofId === "pr-02"
      ? "baseline-engine.webm"
      : proofId === "pr-03"
        ? "human-decision-flow.webm"
        : proofId === "pr-04"
          ? "webmcp-collaboration-flow.webm"
          : "scenario-receipt-recovery-flow.webm";
  await copyFile(path.join(videoDir, video), path.join(outputDir, videoName));

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const desktopPage = await desktopContext.newPage();
  await preparePage(desktopPage, "desktop");
  await desktopPage.screenshot({
    path: path.join(
      outputDir,
      proofId === "pr-01"
        ? "app-shell.png"
        : proofId === "pr-02"
          ? "baseline-engine-desktop.png"
          : proofId === "pr-03"
            ? "human-decision-evidence-desktop.png"
            : proofId === "pr-04"
              ? "webmcp-agent-evidence-desktop.png"
              : "four-scenario-evidence-desktop.png",
    ),
    fullPage: true,
  });
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: proofId === "pr-01"
      ? { width: 390, height: 844 }
      : { width: 320, height: 720 },
  });
  const mobilePage = await mobileContext.newPage();
  await preparePage(mobilePage, "mobile");
  await mobilePage.screenshot({
    path: path.join(
      outputDir,
      proofId === "pr-01"
        ? "app-shell-mobile.png"
        : proofId === "pr-02"
          ? "baseline-engine-mobile-320.png"
          : proofId === "pr-03"
            ? "human-decision-mobile-320.png"
            : proofId === "pr-04"
              ? "webmcp-human-boundary-mobile-320.png"
              : "receipt-recovery-mobile-320.png",
    ),
    fullPage: true,
  });
  await mobileContext.close();
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await rm(videoDir, { recursive: true, force: true });
}

console.log(`Saved ${proofId} proof to ${outputDir}`);
