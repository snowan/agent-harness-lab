import { describe, expect, it } from "vitest";
import { WEBMCP_OUTPUT_BUDGET } from "../../src/webmcp/execute";
import { buildEvidenceReceipt } from "../../src/receipts/build-receipt";
import type { WebMcpToolName } from "../../src/webmcp/contracts";
import { createWebMcpHarness } from "./test-harness";

function expectBounded(value: unknown): void {
  expect(JSON.stringify(value).length).toBeLessThanOrEqual(WEBMCP_OUTPUT_BUDGET);
}

async function call(
  harness: ReturnType<typeof createWebMcpHarness>,
  name: WebMcpToolName,
  input: Record<string, unknown> = {},
) {
  const result = await harness.executor.execute(name, input);
  expectBounded(result);
  return result;
}

describe("WebMCP executor", () => {
  it("completes the full agent investigation flow without exposing a decision", async () => {
    const harness = createWebMcpHarness();
    const initial = await call(harness, "get_lab_state");
    expect(initial).toMatchObject({ ok: true, data: { phase: "mission_loaded", revision: 0 } });

    const baseline = await call(harness, "run_baseline", { request_id: "flow-baseline" });
    expect(baseline).toMatchObject({
      ok: true,
      data: { phase: "baseline_failed", revision: 2, baselineStatus: "failed_as_expected" },
    });

    const trace = await call(harness, "inspect_trace", { run: "baseline", limit: 2 });
    expect(trace).toMatchObject({ ok: true, data: { run: "baseline", offset: 0 } });
    if (!trace.ok) throw new Error("Expected a trace result.");
    expect((trace.data as { facts: unknown[] }).facts).toHaveLength(2);

    const stage = await call(harness, "stage_harness_patch", {
      request_id: "flow-stage",
      hypothesis: "Browser evidence should activate, repair, recheck, and gate completion.",
    });
    expect(stage).toMatchObject({ ok: true, data: { phase: "patch_staged", revision: 3 } });

    const suite = await call(harness, "run_candidate_suite", { request_id: "flow-suite" });
    expect(suite).toMatchObject({
      ok: true,
      data: { phase: "compared", revision: 5, candidateSuiteStatus: "passed" },
    });

    const comparison = await call(harness, "compare_harnesses");
    expect(comparison).toMatchObject({
      ok: true,
      data: {
        comparedRevision: 5,
        suiteStatus: "passed",
        sealed: { passed: 2, total: 2 },
        promotionIsHumanOnly: true,
      },
    });
    if (!comparison.ok) throw new Error("Expected a comparison result.");
    expect((comparison.data as { signals: unknown[] }).signals).toHaveLength(5);

    const receipt = await call(harness, "export_evidence_receipt");
    expect(receipt).toMatchObject({
      ok: true,
      data: {
        schema: "agent-harness-lab-receipt/1.0.0",
        receiptDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        createdAt: "2026-08-30T12:01:00.000Z",
        fixture: true,
        decision: null,
        provenance: { agentCommands: 3, humanCommands: 0 },
        promotionIsHumanOnly: true,
      },
    });

    expect(harness.store.getState().phase).toBe("compared");
    expect(harness.store.getState().decision).toBeNull();
    expect(harness.store.getState().events.every((event) => (
      event.actor === "agent" && event.source === "webmcp"
    ))).toBe(true);
  });

  it("reconciles a repeated mutation request ID without committing twice", async () => {
    const harness = createWebMcpHarness();
    const first = await call(harness, "run_baseline", { request_id: "retry-safe" });
    const revision = harness.store.getState().revision;
    const replay = await call(harness, "run_baseline", { request_id: "retry-safe" });

    expect(first).toMatchObject({ ok: true, data: { replayed: false } });
    expect(replay).toMatchObject({ ok: true, data: { replayed: true } });
    expect(harness.store.getState().revision).toBe(revision);
  });

  it("rejects a retry key after later work advances the workspace", async () => {
    const harness = createWebMcpHarness();
    await call(harness, "run_baseline", { request_id: "historical-baseline" });
    const authored = "The staged prompt-like hypothesis must not enter trusted failures.";
    await call(harness, "stage_harness_patch", {
      request_id: "later-stage",
      hypothesis: authored,
    });
    const current = harness.store.getState();

    const stale = await call(harness, "run_baseline", { request_id: "historical-baseline" });
    expect(stale).toMatchObject({ ok: false, error: { code: "STALE_REVISION" } });
    expect(stale).not.toHaveProperty("safeState.candidate.hypothesis");
    expect(JSON.stringify(stale)).not.toContain(authored);
    expect(harness.store.getState()).toBe(current);
  });

  it("keeps caller retry keys separate from generated command IDs", async () => {
    const harness = createWebMcpHarness();
    const explicit = await call(harness, "run_baseline", { request_id: "auto-1" });
    expect(explicit).toMatchObject({ ok: true, data: { revision: 2, replayed: false } });
    await call(harness, "load_mission", {
      mission_id: "completion",
      request_id: "reset-between-runs",
    });

    const generated = await call(harness, "run_baseline");
    expect(generated).toMatchObject({ ok: true, data: { revision: 5, replayed: false } });
  });

  it("rejects unknown fields, invalid IDs, and oversized hypotheses before mutation", async () => {
    const harness = createWebMcpHarness();
    const initial = harness.store.getState();

    const unknown = await call(harness, "run_baseline", { surprise: true });
    expect(unknown).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(harness.store.getState()).toBe(initial);

    const invalidId = await call(harness, "load_mission", { mission_id: "external" });
    expect(invalidId).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(harness.store.getState()).toBe(initial);

    await call(harness, "run_baseline", { request_id: "valid-baseline" });
    const baseline = harness.store.getState();
    const oversized = await call(harness, "stage_harness_patch", {
      hypothesis: "x".repeat(281),
    });
    expect(oversized).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(harness.store.getState()).toBe(baseline);
  });

  it("fails illegal ordering safely and preserves the exact stable state", async () => {
    const harness = createWebMcpHarness();
    const initial = harness.store.getState();
    for (const [name, input] of [
      ["inspect_trace", { run: "candidate" }],
      ["stage_harness_patch", {}],
      ["run_candidate_suite", {}],
      ["compare_harnesses", {}],
    ] as const) {
      const result = await call(harness, name, input);
      expect(result).toMatchObject({ ok: false });
      expect(harness.store.getState()).toBe(initial);
    }
  });

  it("keeps every success and failure response within the 1.5K output budget", async () => {
    const harness = createWebMcpHarness();
    await call(harness, "run_baseline", { request_id: "budget-baseline" });
    await call(harness, "stage_harness_patch", {
      request_id: "budget-stage",
      hypothesis: "h".repeat(280),
    });
    await call(harness, "run_candidate_suite", { request_id: "budget-suite" });
    await call(harness, "get_lab_state");
    await call(harness, "inspect_trace", { run: "candidate", offset: 0, limit: 3 });
    await call(harness, "inspect_trace", { run: "candidate", offset: 3, limit: 3 });
    await call(harness, "compare_harnesses");
    await call(harness, "export_evidence_receipt");
    await call(harness, "run_candidate_suite", { unexpected: "field" });
  });

  it("bounds escape-heavy authored text after a human decision", async () => {
    const harness = createWebMcpHarness();
    const hypothesis = [
      "\u0000".repeat(80),
      "\ud800".repeat(80),
      '"'.repeat(60),
      "\\".repeat(60),
    ].join("");
    await call(harness, "run_baseline", { request_id: "escape-baseline" });
    await call(harness, "stage_harness_patch", {
      request_id: "escape-stage",
      hypothesis,
    });
    const compared = await call(harness, "run_candidate_suite", {
      request_id: "escape-suite",
    });
    if (!compared.ok) throw new Error("Expected the escape-heavy suite to complete.");
    await harness.commands.dispatch(
      { type: "PROMOTE", comparedRevision: harness.store.getState().revision },
      { commandId: "human-decision", actor: "human", source: "ui" },
    );

    const state = await call(harness, "get_lab_state");
    const receipt = await call(harness, "export_evidence_receipt");
    expect(state).toMatchObject({
      ok: true,
      data: { candidate: { hypothesisTruncated: true } },
    });
    expect(receipt).toMatchObject({
      ok: true,
      data: {
        patch: {
          id: "completion.browser-proof-gate",
          layer: "skill-trigger+completion-contract",
          evaluatedDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        },
        decision: { outcome: "promoted", actor: "human", comparedRevision: 5 },
      },
    });
    expect(JSON.stringify(receipt)).not.toContain(hypothesis);
  });

  it("does not disclose an unexpected effect error through WebMCP", async () => {
    const internal = "/private/runner/secrets.env contained token=do-not-return";
    const harness = createWebMcpHarness({
      runBaseline: async () => { throw new Error(internal); },
    });
    const before = harness.store.getState();

    const result = await call(harness, "run_baseline", { request_id: "effect-failure" });
    expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_FAILED" } });
    expect(JSON.stringify(result)).not.toContain(internal);
    expect(harness.store.getState()).toBe(before);
  });

  it("honors an already-aborted per-call signal", async () => {
    const harness = createWebMcpHarness();
    const controller = new AbortController();
    controller.abort();
    const initial = harness.store.getState();
    const result = await harness.executor.execute(
      "run_baseline",
      {},
      { signal: controller.signal },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_ABORTED" } });
    expect(harness.store.getState()).toBe(initial);
  });

  it("runs a second fixture and requires comparison before reading its receipt", async () => {
    const harness = createWebMcpHarness();
    const loaded = await call(harness, "load_mission", {
      mission_id: "handoff",
      request_id: "catalog-handoff",
    });
    expect(loaded).toMatchObject({ ok: true, data: { missionId: "handoff", revision: 1 } });
    const run = await call(harness, "run_baseline", { request_id: "catalog-run" });
    expect(run).toMatchObject({
      ok: true,
      data: {
        missionId: "handoff",
        phase: "baseline_failed",
        baselineStatus: "failed_as_expected",
      },
    });
    const receipt = await call(harness, "export_evidence_receipt");
    expect(receipt).toMatchObject({ ok: false, error: { code: "ILLEGAL_TRANSITION" } });
  });

  it("rejects a receipt when the workspace changes during async validation", async () => {
    let releaseBuild: (() => void) | undefined;
    let markBuildStarted: (() => void) | undefined;
    const buildStarted = new Promise<void>((resolve) => {
      markBuildStarted = resolve;
    });
    const buildGate = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });
    const harness = createWebMcpHarness({}, {
      async buildReceipt(state, createdAt) {
        markBuildStarted?.();
        await buildGate;
        return buildEvidenceReceipt(state, createdAt);
      },
    });
    await call(harness, "run_baseline", { request_id: "stale-receipt-baseline" });
    await call(harness, "stage_harness_patch", { request_id: "stale-receipt-stage" });
    await call(harness, "run_candidate_suite", { request_id: "stale-receipt-suite" });

    const exporting = harness.executor.execute("export_evidence_receipt", {});
    await buildStarted;
    const loaded = await call(harness, "load_mission", {
      mission_id: "retry",
      request_id: "stale-receipt-load",
    });
    expect(loaded).toMatchObject({ ok: true, data: { missionId: "retry", revision: 6 } });
    releaseBuild?.();

    await expect(exporting).resolves.toMatchObject({
      ok: false,
      error: { code: "STALE_REVISION" },
      safeState: { missionId: "retry", revision: 6 },
    });
  });

  it.each(["completion", "handoff", "retry", "authority"] as const)(
    "keeps the full %s investigation inside the WebMCP output budget",
    async (missionId) => {
      const harness = createWebMcpHarness();
      if (missionId !== "completion") {
        await call(harness, "load_mission", {
          mission_id: missionId,
          request_id: `${missionId}-load`,
        });
      }
      const baseline = await call(harness, "run_baseline", {
        request_id: `${missionId}-baseline`,
      });
      expect(baseline).toMatchObject({
        ok: true,
        data: { missionId, baselineStatus: "failed_as_expected" },
      });
      await call(harness, "stage_harness_patch", {
        request_id: `${missionId}-stage`,
        hypothesis: `The declared ${missionId} control should repair the target without regressing sealed cases.`,
      });
      const suite = await call(harness, "run_candidate_suite", {
        request_id: `${missionId}-suite`,
      });
      expect(suite).toMatchObject({
        ok: true,
        data: { missionId, candidateSuiteStatus: "passed" },
      });
      const comparison = await call(harness, "compare_harnesses");
      expect(comparison).toMatchObject({
        ok: true,
        data: { scenarioId: missionId, sealed: { passed: 2, total: 2 } },
      });
      const receipt = await call(harness, "export_evidence_receipt");
      expect(receipt).toMatchObject({
        ok: true,
        data: {
          schema: "agent-harness-lab-receipt/1.0.0",
          mission: { id: missionId },
          receiptDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        },
      });
    },
  );
});
