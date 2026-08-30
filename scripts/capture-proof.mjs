import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const proofId = process.argv[2];

if (proofId !== "pr-01") {
  throw new Error("Use `npm run proof:pr1`; this capture script currently supports pr-01.");
}

const root = process.cwd();
const outputDir = path.join(root, "output", "playwright", proofId);
const videoDir = path.join(outputDir, ".video-tmp");
const appUrl = "http://127.0.0.1:4173";

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
    "4173",
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

try {
  await waitForApp();
  browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  await page.goto(appUrl);
  await page.waitForTimeout(700);
  await page.getByLabel("Choose a failure fixture").selectOption("handoff");
  await page.getByRole("button", { name: "Load mission" }).click();
  await page.getByRole("heading", { name: "Broken context handoff" }).waitFor();
  await page.waitForTimeout(1_400);
  await context.close();

  const videos = (await readdir(videoDir)).filter((file) => file.endsWith(".webm"));
  const video = videos[0];
  if (!video) throw new Error("Playwright did not produce a video file.");
  await copyFile(path.join(videoDir, video), path.join(outputDir, "app-shell.webm"));

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(appUrl);
  await desktopPage.getByLabel("Choose a failure fixture").selectOption("handoff");
  await desktopPage.getByRole("button", { name: "Load mission" }).click();
  await desktopPage.getByRole("heading", { name: "Broken context handoff" }).waitFor();
  await desktopPage.screenshot({
    path: path.join(outputDir, "app-shell.png"),
    fullPage: true,
  });
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(appUrl);
  await mobilePage.getByLabel("Choose a failure fixture").selectOption("authority");
  await mobilePage.getByRole("button", { name: "Load mission" }).click();
  await mobilePage.getByRole("heading", { name: "Authority drift" }).waitFor();
  await mobilePage.screenshot({
    path: path.join(outputDir, "app-shell-mobile.png"),
    fullPage: true,
  });
  await mobileContext.close();
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await rm(videoDir, { recursive: true, force: true });
}

console.log(`Saved PR 1 proof to ${outputDir}`);
