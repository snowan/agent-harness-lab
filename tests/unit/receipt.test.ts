import { describe, expect, it } from "vitest";
import { createCommandService } from "../../src/app/commands";
import { createLabStore } from "../../src/app/create-store";
import { scenarioEffects } from "../../src/app/scenario-effects";
import { createInitialLabState, type LabCommand } from "../../src/domain/types";
import { buildEvidenceReceipt } from "../../src/receipts/build-receipt";
import {
  downloadEvidenceReceipt,
  receiptFilename,
} from "../../src/receipts/download-receipt";
import receiptSchema from "../../src/receipts/receipt.schema.json";
import {
  validateEvidenceReceipt,
  verifyEvidenceReceipt,
} from "../../src/receipts/validate-receipt";
import { getScenarioDefinition } from "../../src/scenarios/registry";

const receiptTime = "2026-08-30T18:00:00.000Z";
const decisionTime = "2026-08-30T17:59:00.000Z";

async function createWorkspace(decision?: "PROMOTE" | "REJECT") {
  const scenario = getScenarioDefinition("completion");
  if (!scenario) throw new Error("Completion fixture is required.");
  const store = createLabStore(createInitialLabState());
  let run = 0;
  let command = 0;
  const service = createCommandService({
    store,
    effects: scenarioEffects,
    now: () => decisionTime,
    ids: {
      nextRunId(kind) {
        run += 1;
        return `receipt-${kind}-${run}`;
      },
    },
  });
  const dispatch = (value: LabCommand) => {
    command += 1;
    return service.dispatch(value, {
      commandId: `receipt-command-${command}`,
      actor: "human",
      source: "test",
    });
  };
  await dispatch({ type: "RUN_BASELINE" });
  await dispatch({
    type: "STAGE_PATCH",
    patch: {
      id: scenario.candidate.patch.id,
      layer: scenario.candidate.patch.layer,
      diff: scenario.candidate.patch.diff,
      hypothesis: "Browser receipts should gate a completion claim.",
    },
  });
  await dispatch({ type: "RUN_CANDIDATE_SUITE" });
  if (decision) {
    await dispatch({ type: decision, comparedRevision: store.getState().revision });
  }
  return store.getState();
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("formal evidence receipts", () => {
  it("builds and verifies an undecided digest-bearing receipt", async () => {
    const workspace = await createWorkspace();
    const receipt = await buildEvidenceReceipt(workspace, receiptTime);
    const laterExport = await buildEvidenceReceipt(
      workspace,
      "2026-08-30T18:15:00.000Z",
    );

    expect(validateEvidenceReceipt(receipt)).toEqual({ valid: true, errors: [] });
    await expect(verifyEvidenceReceipt(receipt)).resolves.toEqual({
      valid: true,
      errors: [],
    });
    expect(receipt).toMatchObject({
      schemaVersion: "1.0.0",
      createdAt: receiptTime,
      decision: null,
      receiptDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      fixture: { kind: "built-in-deterministic", deterministic: true },
      runs: { sealed: [{ trialKind: "sealed" }, { trialKind: "sealed" }] },
    });
    expect(receipt.runs.baseline.facts.length).toBeGreaterThan(0);
    expect(receipt.runs.baseline.assertions.length).toBeGreaterThan(0);
    const firstAssertion = receipt.runs.baseline.assertions[0];
    expect(firstAssertion?.evidenceFactIds.length).toBeGreaterThan(0);
    expect(
      receipt.runs.baseline.facts.some(
        (fact) => fact.id === firstAssertion?.evidenceFactIds[0],
      ),
    ).toBe(true);
    expect(receipt.signals).toHaveLength(5);
    expect(laterExport.createdAt).not.toBe(receipt.createdAt);
    expect(laterExport.receiptDigest).toBe(receipt.receiptDigest);
    expect(JSON.stringify(receipt)).not.toContain("hiddenReasoning");
  });

  it.each([
    ["PROMOTE", "promoted"],
    ["REJECT", "rejected"],
  ] as const)("records a timestamped human %s decision", async (command, outcome) => {
    const receipt = await buildEvidenceReceipt(
      await createWorkspace(command),
      receiptTime,
    );
    expect(receipt.decision).toEqual({
      outcome,
      actor: "human",
      comparedRevision: 5,
      recordedAt: decisionTime,
    });
    await expect(verifyEvidenceReceipt(receipt)).resolves.toMatchObject({ valid: true });
  });

  it("rejects incomplete workspaces, extra fields, and digest tampering", async () => {
    await expect(
      buildEvidenceReceipt(createInitialLabState(), receiptTime),
    ).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });

    const receipt = await buildEvidenceReceipt(await createWorkspace(), receiptTime);
    const topLevel = jsonClone(receipt) as unknown as Record<string, unknown>;
    topLevel.hiddenReasoning = "do not admit undeclared fields";
    expect(validateEvidenceReceipt(topLevel)).toMatchObject({ valid: false });

    const nested = jsonClone(receipt) as unknown as {
      candidate: Record<string, unknown>;
    };
    nested.candidate.hiddenReasoning = "also forbidden when nested";
    expect(validateEvidenceReceipt(nested)).toMatchObject({ valid: false });

    const tampered = jsonClone(receipt) as unknown as {
      scenario: { title: string };
    };
    tampered.scenario.title = "Tampered title";
    expect(validateEvidenceReceipt(tampered)).toMatchObject({ valid: true });
    await expect(verifyEvidenceReceipt(tampered)).resolves.toEqual({
      valid: false,
      errors: ["$receipt.receiptDigest does not match the canonical receipt payload."],
    });

    const retimestamped = jsonClone(receipt) as unknown as { createdAt: string };
    retimestamped.createdAt = "2026-08-30T20:00:00.000Z";
    await expect(verifyEvidenceReceipt(retimestamped)).resolves.toEqual({
      valid: true,
      errors: [],
    });
  });

  it("closes every object shape in the published schema", () => {
    const visited = new Set<object>();
    function inspect(value: unknown, path: string): void {
      if (!value || typeof value !== "object" || visited.has(value)) return;
      visited.add(value);
      if (Array.isArray(value)) {
        value.forEach((item, index) => inspect(item, `${path}[${index}]`));
        return;
      }
      const node = value as Record<string, unknown>;
      if (node.type === "object") {
        expect(node.additionalProperties, path).toBe(false);
      }
      for (const [key, child] of Object.entries(node)) {
        inspect(child, `${path}.${key}`);
      }
    }
    inspect(receiptSchema, "$schema");
  });

  it("downloads the exact JSON receipt with a deterministic filename", async () => {
    const receipt = await buildEvidenceReceipt(await createWorkspace(), receiptTime);
    const lifecycle: string[] = [];
    const capturedBlobs: Blob[] = [];
    const anchor = {
      href: "",
      download: "",
      rel: "",
      hidden: false,
      click: () => lifecycle.push("clicked"),
      remove: () => lifecycle.push("removed"),
    };
    const fakeDocument = {
      createElement: () => anchor,
      body: { append: () => lifecycle.push("appended") },
    } as unknown as Document;

    const filename = downloadEvidenceReceipt(receipt, {
      document: fakeDocument,
      createObjectUrl(blob) {
        capturedBlobs.push(blob);
        lifecycle.push("created");
        return "blob:receipt";
      },
      revokeObjectUrl(url) {
        lifecycle.push(`revoked:${url}`);
      },
    });

    expect(filename).toBe(receiptFilename(receipt));
    expect(anchor).toMatchObject({
      href: "blob:receipt",
      download: "agent-harness-lab-completion-2026-08-30T18-00-00-000Z.json",
      rel: "noopener",
      hidden: true,
    });
    const capturedBlob = capturedBlobs[0];
    if (!capturedBlob) throw new Error("Expected the receipt blob to be captured.");
    await expect(capturedBlob.text()).resolves.toBe(`${JSON.stringify(receipt, null, 2)}\n`);
    await Promise.resolve();
    expect(lifecycle).toEqual([
      "created",
      "appended",
      "clicked",
      "removed",
      "revoked:blob:receipt",
    ]);
  });
});
