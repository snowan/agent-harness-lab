import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const proofId = process.argv[2];

if (proofId !== "pr-01" && proofId !== "pr-02") {
  throw new Error("Use `npm run proof:pr1` or `npm run proof:pr2`.");
}

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
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 0) {
    throw new Error(`Proof page has ${overflow}px of horizontal overflow.`);
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

async function preparePr1Page(page, missionId) {
  await page.getByLabel("Choose a failure fixture").selectOption(missionId);
  await page.getByRole("button", { name: "Load mission" }).click();
  const heading = missionId === "handoff" ? "Broken context handoff" : "Authority drift";
  await page.getByRole("heading", { name: heading }).waitFor();
}

async function preparePr2Page(page) {
  await page.getByRole("button", { name: "Run deterministic baseline" }).click();
  const result = page.getByTestId("baseline-result");
  await result.waitFor();
  const phase = await page.getByTestId("phase").textContent();
  const passed = await page.getByTestId("baseline-passed").textContent();
  const failed = await page.getByTestId("baseline-failed").textContent();
  const digest = await page.getByTestId("baseline-digest").textContent();
  const evidence = await page.getByTestId("baseline-evidence-ref").textContent();
  if (phase?.trim() !== "baseline failed") {
    throw new Error(`Proof expected baseline failed; received ${phase ?? "no phase"}.`);
  }
  if (passed?.trim() !== "7/14" || failed?.trim() !== "7/14") {
    throw new Error(`Proof received unexpected derived assertion counts ${passed}/${failed}.`);
  }
  if (!digest || !/^sha256:[0-9a-f]{64}$/.test(digest.trim())) {
    throw new Error("Proof result is missing its canonical SHA-256 digest.");
  }
  if (!evidence?.includes(":fact:artifact.browser_qa.loaded")) {
    throw new Error("Proof result is missing its assertion-to-fact evidence reference.");
  }
}

async function preparePage(page, variant) {
  const health = monitorPage(page);
  await page.goto(appUrl);
  if (proofId === "pr-01") {
    await preparePr1Page(page, variant === "mobile" ? "authority" : "handoff");
  } else {
    await preparePr2Page(page);
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
  await page.goto(appUrl);
  await page.waitForTimeout(550);
  if (proofId === "pr-01") {
    await preparePr1Page(page, "handoff");
  } else {
    await preparePr2Page(page);
    await page.getByTestId("baseline-evidence-ref").scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(1_400);
  await assertHealthy(page, videoHealth);
  await context.close();

  const videos = (await readdir(videoDir)).filter((file) => file.endsWith(".webm"));
  const video = videos[0];
  if (!video) throw new Error("Playwright did not produce a video file.");
  const videoName = proofId === "pr-01" ? "app-shell.webm" : "baseline-engine.webm";
  await copyFile(path.join(videoDir, video), path.join(outputDir, videoName));

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const desktopPage = await desktopContext.newPage();
  await preparePage(desktopPage, "desktop");
  await desktopPage.screenshot({
    path: path.join(
      outputDir,
      proofId === "pr-01" ? "app-shell.png" : "baseline-engine-desktop.png",
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
      proofId === "pr-01" ? "app-shell-mobile.png" : "baseline-engine-mobile-320.png",
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
