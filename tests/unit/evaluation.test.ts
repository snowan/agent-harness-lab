import { describe, expect, it } from "vitest";
import {
  assertTraceableRun,
  canonicalJson,
  canonicalSha256,
  compareHarnesses,
  runScenarioBaseline,
  runScenarioSuite,
  runScenarioTrial,
  verifySuiteRun,
  verifyTrialRun,
} from "../../src/domain/evaluation";
import {
  completionTrialIds,
  completionWithoutProofScenario,
} from "../../src/scenarios/completion-without-proof";
import {
  SIGNAL_NAMES,
  type CompletionHarnessPolicy,
  type CompletionTrialInput,
  type ScenarioDefinition,
  type SignalName,
  type TrialRun,
} from "../../src/scenarios/types";

function summary(run: TrialRun, signal: SignalName) {
  const value = run.signals.find((candidate) => candidate.signal === signal);
  if (!value) throw new Error(`Missing ${signal} summary.`);
  return value;
}

type MutablePolicy = {
  -readonly [Key in keyof CompletionHarnessPolicy]: CompletionHarnessPolicy[Key];
};

function cloneScenario(): ScenarioDefinition {
  return structuredClone(completionWithoutProofScenario);
}

function candidatePolicy(scenario: ScenarioDefinition): MutablePolicy {
  return scenario.candidate.policy as MutablePolicy;
}

function trialInput(
  scenario: ScenarioDefinition,
  trialId: string,
): CompletionTrialInput {
  const trial = scenario.trials.find((candidate) => candidate.id === trialId);
  if (!trial) throw new Error(`Missing trial ${trialId}.`);
  return trial.initialState;
}

function failedSignals(run: TrialRun): readonly SignalName[] {
  return run.signals
    .filter((signal) => signal.failed > 0)
    .map((signal) => signal.signal);
}

describe("canonical evaluation data", () => {
  it("sorts object keys, preserves array order, and matches the SHA-256 vector", async () => {
    expect(canonicalJson({ b: 2, a: 1, nested: { z: -0, a: true } })).toBe(
      '{"a":1,"b":2,"nested":{"a":true,"z":0}}',
    );
    expect(canonicalJson({ values: [2, 1] })).not.toBe(
      canonicalJson({ values: [1, 2] }),
    );
    await expect(canonicalSha256({ b: 2, a: 1 })).resolves.toBe(
      "sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
  });

  it("rejects unstable or non-JSON values", () => {
    expect(() => canonicalJson({ missing: undefined })).toThrow(/undefined/);
    expect(() => canonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow(
      /non-finite/,
    );
    expect(() => canonicalJson(new Date(0))).toThrow(/plain objects/);
    expect(() => canonicalJson({ callback: () => undefined })).toThrow(/function/);
    expect(() => canonicalJson({ [Symbol("hidden")]: true })).toThrow(/symbol keys/);
    expect(() => canonicalJson(Array(1))).toThrow(/sparse arrays/);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cyclic/);
  });
});

describe("Completion without proof fixture", () => {
  it("is immutable, versioned, has one target and two sealed trials, and stores no scores", () => {
    expect(Object.isFrozen(completionWithoutProofScenario)).toBe(true);
    expect(Object.isFrozen(completionWithoutProofScenario.trials)).toBe(true);
    expect(completionWithoutProofScenario.schemaVersion).toBe(1);
    expect(completionWithoutProofScenario.trials.filter((trial) => trial.kind === "target")).toHaveLength(1);
    expect(completionWithoutProofScenario.trials.filter((trial) => trial.kind === "sealed")).toHaveLength(2);

    for (const trial of completionWithoutProofScenario.trials) {
      const signals = new Set(
        completionWithoutProofScenario.assertions
          .filter((assertion) => assertion.trialId === trial.id)
          .map((assertion) => assertion.signal),
      );
      expect(signals).toEqual(new Set(SIGNAL_NAMES));
    }

    const fixtureKeys: string[] = [];
    function collectKeys(value: unknown): void {
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        fixtureKeys.push(key);
        collectKeys(nested);
      }
    }
    collectKeys(completionWithoutProofScenario);
    expect(fixtureKeys).not.toContain("score");
    expect(fixtureKeys).not.toContain("aggregateScore");
    expect(fixtureKeys).not.toContain("status");
  });

  it("derives the exact expected baseline failure and five signal counts", async () => {
    const run = await runScenarioBaseline(completionWithoutProofScenario);

    expect(run.status).toBe("failed_as_expected");
    expect(run.expectationMet).toBe(true);
    expect(run.assertions.find(
      (assertion) => assertion.assertionId === completionWithoutProofScenario.invariantAssertionId,
    )?.status).toBe("failed");
    expect(summary(run, "activation")).toMatchObject({ passed: 0, failed: 1 });
    expect(summary(run, "adherence")).toMatchObject({ passed: 1, failed: 2 });
    expect(summary(run, "outcome")).toMatchObject({ passed: 3, failed: 2 });
    expect(summary(run, "evidence")).toMatchObject({ passed: 1, failed: 2 });
    expect(summary(run, "safety")).toMatchObject({ passed: 2, failed: 0 });
    await expect(
      verifyTrialRun(completionWithoutProofScenario, run),
    ).resolves.toBeUndefined();
  });

  it("derives a passing candidate target and both sealed cases", async () => {
    const suite = await runScenarioSuite(completionWithoutProofScenario);
    const target = suite.runs.find((run) => run.trialKind === "target");
    const docs = suite.runs.find((run) => run.trialId === completionTrialIds.docsSealed);
    const passingUi = suite.runs.find(
      (run) => run.trialId === completionTrialIds.passingUiSealed,
    );

    expect(suite.status).toBe("passed");
    expect(suite.runs).toHaveLength(3);
    expect(target?.status).toBe("passed");
    expect(docs?.status).toBe("passed");
    expect(passingUi?.status).toBe("passed");
    expect(target && summary(target, "activation")).toMatchObject({ passed: 1, failed: 0 });
    expect(target && summary(target, "adherence")).toMatchObject({ passed: 3, failed: 0 });
    expect(target && summary(target, "outcome")).toMatchObject({ passed: 5, failed: 0 });
    expect(target && summary(target, "evidence")).toMatchObject({ passed: 3, failed: 0 });
    expect(target && summary(target, "safety")).toMatchObject({ passed: 2, failed: 0 });
    expect(target?.facts.find((fact) => fact.key === "check.count")?.value).toBe(4);
    expect(docs?.facts.find((fact) => fact.key === "artifact.browser_qa.loaded")?.value).toBe(false);
    expect(docs?.facts.find((fact) => fact.key === "check.count")?.value).toBe(0);
    expect(passingUi?.facts.find((fact) => fact.key === "repair.applied")?.value).toBe(false);
  });

  it("matches the fixture's reviewed golden harness and result digests", async () => {
    const baseline = await runScenarioBaseline(completionWithoutProofScenario);
    const suite = await runScenarioSuite(completionWithoutProofScenario);
    const expected: ScenarioDefinition["expectedDigests"] =
      completionWithoutProofScenario.expectedDigests;

    await expect(
      canonicalSha256(completionWithoutProofScenario.baseline),
    ).resolves.toBe(expected.baselineHarnessDefinition);
    await expect(
      canonicalSha256(completionWithoutProofScenario.candidate),
    ).resolves.toBe(expected.candidateHarnessDefinition);
    expect(suite.evaluatedPatchDigest).toBe(expected.evaluatedPatch);
    for (const trial of completionWithoutProofScenario.trials) {
      await expect(canonicalSha256(trial.initialState)).resolves.toBe(
        expected.trialInitialStates[trial.id],
      );
    }
    expect(baseline.resultDigest).toBe(expected.baselineTarget);
    for (const run of suite.runs) {
      expect(run.resultDigest).toBe(expected.candidateTrials[run.trialId]);
    }
    expect(suite.resultDigest).toBe(expected.candidateSuite);
  });

  it.each([
    {
      signal: "activation" as const,
      mutate: (scenario: ScenarioDefinition) => {
        candidatePolicy(scenario).activationKinds = [];
      },
    },
    {
      signal: "adherence" as const,
      mutate: (scenario: ScenarioDefinition) => {
        candidatePolicy(scenario).recheckAfterRepair = false;
      },
    },
    {
      signal: "outcome" as const,
      mutate: (scenario: ScenarioDefinition) => {
        const input = trialInput(scenario, completionTrialIds.target);
        (input.desktop as { consoleErrorCount: number }).consoleErrorCount = 1;
      },
    },
    {
      signal: "evidence" as const,
      mutate: (scenario: ScenarioDefinition) => {
        candidatePolicy(scenario).completionGate = "advisory";
      },
    },
    {
      signal: "safety" as const,
      mutate: (scenario: ScenarioDefinition) => {
        candidatePolicy(scenario).externalWriteTargets = ["external-review-system"];
      },
    },
  ])(
    "derives a $signal failure from changed trial or harness inputs",
    async ({ signal, mutate }) => {
      const scenario = cloneScenario();
      mutate(scenario);
      const run = await runScenarioTrial(
        scenario,
        "candidate",
        completionTrialIds.target,
      );
      expect(failedSignals(run)).toContain(signal);
    },
  );

  it("detects sealed-case over-triggering and invented repairs", async () => {
    const docsScenario = cloneScenario();
    candidatePolicy(docsScenario).activationKinds = ["ui", "docs"];
    const passingScenario = cloneScenario();
    candidatePolicy(passingScenario).repairMode = "always";

    const docs = await runScenarioTrial(
      docsScenario,
      "candidate",
      completionTrialIds.docsSealed,
    );
    const passing = await runScenarioTrial(
      passingScenario,
      "candidate",
      completionTrialIds.passingUiSealed,
    );
    expect(failedSignals(docs)).toEqual(["activation", "adherence"]);
    expect(failedSignals(passing)).toEqual(["adherence"]);
  });

  it("invalidates pre-repair receipts when the repair is not replayed", async () => {
    const scenario = cloneScenario();
    candidatePolicy(scenario).recheckAfterRepair = false;

    const run = await runScenarioTrial(
      scenario,
      "candidate",
      completionTrialIds.target,
    );

    expect(run.facts.find((fact) => fact.key === "repair.applied")?.value).toBe(true);
    expect(run.facts.find((fact) => fact.key === "repair.rechecked")?.value).toBe(false);
    expect(run.facts.find((fact) => fact.key === "check.count")?.value).toBe(2);
    expect(run.facts.find(
      (fact) => fact.key === "check.desktop.executed",
    )?.value).toBe(true);
    expect(run.facts.find(
      (fact) => fact.key === "check.mobile_320.executed",
    )?.value).toBe(true);
    expect(run.facts.find((fact) => fact.key === "receipt.desktop")?.value).toBe(false);
    expect(run.facts.find((fact) => fact.key === "receipt.mobile_320")?.value).toBe(false);
    expect(run.facts.find(
      (fact) => fact.key === "completion.receipts_cited",
    )?.value).toBe(false);
    expect(failedSignals(run)).toEqual(["adherence", "evidence"]);
  });

  it("derives repair and outcome facts from trial input plus harness policy", async () => {
    const passingInputScenario = cloneScenario();
    const input = trialInput(passingInputScenario, completionTrialIds.target);
    (input.mobile320 as { overflowPx: number; actionsReachable: boolean }).overflowPx = 0;
    (input.mobile320 as { overflowPx: number; actionsReachable: boolean }).actionsReachable = true;
    const changedInputRun = await runScenarioTrial(
      passingInputScenario,
      "candidate",
      completionTrialIds.target,
    );

    const noRepairScenario = cloneScenario();
    candidatePolicy(noRepairScenario).repairMode = "never";
    const noRepairRun = await runScenarioTrial(
      noRepairScenario,
      "candidate",
      completionTrialIds.target,
    );
    const original = await runScenarioTrial(
      completionWithoutProofScenario,
      "candidate",
      completionTrialIds.target,
    );

    expect(changedInputRun.facts.find((fact) => fact.key === "repair.applied")?.value).toBe(false);
    expect(changedInputRun.resultDigest).not.toBe(original.resultDigest);
    expect(noRepairRun.facts.find(
      (fact) => fact.key === "outcome.mobile_320.no_overflow",
    )?.value).toBe(false);
    expect(noRepairRun.resultDigest).not.toBe(original.resultDigest);
  });

  it("keeps a candidate suite failed even if a tampered fixture expects failure", async () => {
    const scenario = cloneScenario();
    candidatePolicy(scenario).activationKinds = ["ui", "docs"];
    const docsTrial = scenario.trials.find(
      (trial) => trial.id === completionTrialIds.docsSealed,
    );
    if (!docsTrial) throw new Error("Missing docs sealed trial.");
    (docsTrial.expectedOutcome as { candidate: "pass" | "fail" }).candidate = "fail";

    const suite = await runScenarioSuite(scenario);

    expect(suite.runs.find(
      (run) => run.trialId === completionTrialIds.docsSealed,
    )?.status).toBe("failed");
    expect(suite.status).toBe("failed");
  });

  it("produces byte-equal canonical output and one digest over 20 executions", async () => {
    const suites = await Promise.all(
      Array.from({ length: 20 }, () => runScenarioSuite(completionWithoutProofScenario)),
    );
    const baselines = await Promise.all(
      Array.from({ length: 20 }, () => runScenarioBaseline(completionWithoutProofScenario)),
    );

    expect(new Set(suites.map(canonicalJson))).toHaveLength(1);
    expect(new Set(suites.map((suite) => suite.resultDigest))).toHaveLength(1);
    expect(new Set(baselines.map(canonicalJson))).toHaveLength(1);
    expect(new Set(baselines.map((run) => run.resultDigest))).toHaveLength(1);
  });

  it("rejects broken fact provenance, sequence, summaries, and digests", async () => {
    const run = await runScenarioBaseline(completionWithoutProofScenario);
    const unknownReference = structuredClone(run);
    (unknownReference.assertions[0]?.evidenceFactIds as string[] | undefined)?.splice(
      0,
      1,
      "unknown-fact",
    );
    const brokenSequence = structuredClone(run);
    if (brokenSequence.facts[0]) {
      (brokenSequence.facts[0] as { sequence: number }).sequence = 4;
    }
    const tamperedSummary = structuredClone(run);
    if (tamperedSummary.signals[0]) {
      (tamperedSummary.signals[0] as { passed: number }).passed += 1;
    }
    const tamperedDigest = structuredClone(run);
    (tamperedDigest as { resultDigest: string }).resultDigest = "sha256:deadbeef";

    expect(() => {
      const { resultDigest: _digest, ...withoutDigest } = unknownReference;
      assertTraceableRun(completionWithoutProofScenario, withoutDigest);
    }).toThrow(/unknown fact/);
    expect(() => {
      const { resultDigest: _digest, ...withoutDigest } = brokenSequence;
      assertTraceableRun(completionWithoutProofScenario, withoutDigest);
    }).toThrow(/facts are not derived/);
    expect(() => {
      const { resultDigest: _digest, ...withoutDigest } = tamperedSummary;
      assertTraceableRun(completionWithoutProofScenario, withoutDigest);
    }).toThrow(/not derived/);
    await expect(
      verifyTrialRun(completionWithoutProofScenario, tamperedDigest),
    ).rejects.toThrow(/digest/);
  });

  it("rejects semantically tampered results even after an attacker rehashes them", async () => {
    const run = structuredClone(
      await runScenarioBaseline(completionWithoutProofScenario),
    );
    const firstFact = run.facts[0];
    if (!firstFact) throw new Error("Expected a baseline fact.");
    (firstFact as { detail: string }).detail = "Fabricated but internally rehashed.";
    const { resultDigest: _oldRunDigest, ...runCausalData } = run;
    (run as { resultDigest: string }).resultDigest = await canonicalSha256(
      runCausalData,
    );

    await expect(
      verifyTrialRun(completionWithoutProofScenario, run),
    ).rejects.toThrow(/facts are not derived/);

    const suite = structuredClone(
      await runScenarioSuite(completionWithoutProofScenario),
    );
    (suite as { status: "passed" | "failed" }).status = "failed";
    const { resultDigest: _oldSuiteDigest, ...suiteCausalData } = suite;
    (suite as { resultDigest: string }).resultDigest = await canonicalSha256(
      suiteCausalData,
    );

    await expect(
      verifySuiteRun(completionWithoutProofScenario, suite),
    ).rejects.toThrow(/status is not derived/);
  });

  it("derives comparison signals and preserves both sealed runs", async () => {
    const baseline = await runScenarioBaseline(completionWithoutProofScenario);
    const suite = await runScenarioSuite(completionWithoutProofScenario);
    const comparison = compareHarnesses(baseline, suite);

    expect(comparison.signals.map((entry) => entry.signal)).toEqual(SIGNAL_NAMES);
    expect(comparison.sealedRuns.map((run) => run.trialId)).toEqual([
      completionTrialIds.docsSealed,
      completionTrialIds.passingUiSealed,
    ]);
    expect(comparison.unresolvedRisks).toEqual([]);
    for (const entry of comparison.signals) {
      expect(entry.supportingAssertionResultIds.length).toBeGreaterThan(0);
      expect(entry.supportingFactIds.length).toBeGreaterThan(0);
    }
    expect(canonicalJson(comparison)).not.toContain('"score"');
  });
});
