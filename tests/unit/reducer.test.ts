import { describe, expect, it } from "vitest";
import { reduceLabEvents, reduceLabState } from "../../src/domain/reducer";
import {
  runScenarioBaseline,
  runScenarioSuite,
} from "../../src/domain/evaluation";
import {
  createInitialLabState,
  type CandidatePatch,
  type DomainEvent,
} from "../../src/domain/types";
import { completionWithoutProofScenario } from "../../src/scenarios/completion-without-proof";

const baselineResult = await runScenarioBaseline(completionWithoutProofScenario);
const candidateSuite = await runScenarioSuite(completionWithoutProofScenario);

const patch: CandidatePatch = {
  id: completionWithoutProofScenario.candidate.patch.id,
  layer: completionWithoutProofScenario.candidate.patch.layer,
  hypothesis: "Require evidence before completion.",
  diff: completionWithoutProofScenario.candidate.patch.diff,
};

function event<T extends DomainEvent>(value: T): T {
  return value;
}

const meta = {
  id: "command-1:0",
  commandId: "command-1",
  actor: "human" as const,
  source: "test" as const,
};

function createComparedState() {
  return reduceLabEvents(createInitialLabState(), [
    { ...meta, type: "BASELINE_RUN_STARTED", runId: "baseline-1" },
    { ...meta, id: "baseline:1", type: "BASELINE_FAILED_AS_EXPECTED", runId: "baseline-1", result: baselineResult },
    { ...meta, id: "patch:0", type: "PATCH_STAGED", patch },
    { ...meta, id: "candidate:0", type: "CANDIDATE_RUN_STARTED", runId: "candidate-1" },
    { ...meta, id: "candidate:1", type: "CANDIDATE_SUITE_COMPLETED", runId: "candidate-1", suite: candidateSuite },
  ]);
}

function createBaselineFailedState() {
  return reduceLabEvents(createInitialLabState(), [
    { ...meta, type: "BASELINE_RUN_STARTED", runId: "baseline-1" },
    { ...meta, id: "baseline:1", type: "BASELINE_FAILED_AS_EXPECTED", runId: "baseline-1", result: baselineResult },
  ]);
}

describe("reduceLabState", () => {
  it("creates an empty, versioned initial state", () => {
    expect(createInitialLabState()).toEqual({
      schemaVersion: 2,
      workspaceId: "local-workspace",
      missionId: "completion",
      phase: "mission_loaded",
      revision: 0,
      baselineRunId: null,
      candidateRunId: null,
      baselineResult: null,
      candidateSuiteResult: null,
      candidate: null,
      decision: null,
      events: [],
    });
  });

  it("reduces the complete legal event sequence without mutating the input", () => {
    const initial = createInitialLabState();
    const events: DomainEvent[] = [
      event({ ...meta, type: "BASELINE_RUN_STARTED", runId: "baseline-1" }),
      event({ ...meta, id: "command-1:1", type: "BASELINE_FAILED_AS_EXPECTED", runId: "baseline-1", result: baselineResult }),
      event({ ...meta, id: "command-2:0", commandId: "command-2", type: "PATCH_STAGED", patch }),
      event({ ...meta, id: "command-3:0", commandId: "command-3", type: "CANDIDATE_RUN_STARTED", runId: "candidate-1" }),
      event({ ...meta, id: "command-3:1", commandId: "command-3", type: "CANDIDATE_SUITE_COMPLETED", runId: "candidate-1", suite: candidateSuite }),
      event({
        ...meta,
        id: "command-4:0",
        commandId: "command-4",
        type: "CANDIDATE_PROMOTED",
        decision: { outcome: "promoted", actor: "human", comparedRevision: 5 },
      }),
    ];

    const result = reduceLabEvents(initial, events);

    expect(result.phase).toBe("promoted");
    expect(result.revision).toBe(6);
    expect(result.baselineRunId).toBe("baseline-1");
    expect(result.candidateRunId).toBe("candidate-1");
    expect(result.baselineResult).toBe(baselineResult);
    expect(result.candidateSuiteResult).toBe(candidateSuite);
    expect(result.candidate).toEqual(patch);
    expect(result.decision?.outcome).toBe("promoted");
    expect(result.events).toEqual(events);
    expect(initial).toEqual(createInitialLabState());
  });

  it("loads another mission and clears run, candidate, and decision state", () => {
    const compared = reduceLabEvents(createInitialLabState(), [
      { ...meta, type: "BASELINE_RUN_STARTED", runId: "baseline-1" },
      { ...meta, id: "1", type: "BASELINE_FAILED_AS_EXPECTED", runId: "baseline-1", result: baselineResult },
      { ...meta, id: "2", type: "PATCH_STAGED", patch },
      { ...meta, id: "3", type: "CANDIDATE_RUN_STARTED", runId: "candidate-1" },
      { ...meta, id: "4", type: "CANDIDATE_SUITE_COMPLETED", runId: "candidate-1", suite: candidateSuite },
    ]);

    const loaded = reduceLabState(compared, {
      ...meta,
      id: "load:0",
      commandId: "load",
      type: "MISSION_LOADED",
      missionId: "handoff",
    });

    expect(loaded).toMatchObject({
      missionId: "handoff",
      phase: "mission_loaded",
      baselineRunId: null,
      candidateRunId: null,
      baselineResult: null,
      candidateSuiteResult: null,
      candidate: null,
      decision: null,
    });
  });

  it("rejects a result whose run ID does not match the active run", () => {
    const running = reduceLabState(createInitialLabState(), {
      ...meta,
      type: "BASELINE_RUN_STARTED",
      runId: "baseline-1",
    });

    expect(() =>
      reduceLabState(running, {
        ...meta,
        id: "1",
        type: "BASELINE_FAILED_AS_EXPECTED",
        runId: "baseline-other",
        result: baselineResult,
      }),
    ).toThrow(/does not match active run baseline-1/);
  });

  it("rejects a structurally invalid baseline fixture result", () => {
    const running = reduceLabState(createInitialLabState(), {
      ...meta,
      type: "BASELINE_RUN_STARTED",
      runId: "baseline-1",
    });
    const invalid = structuredClone(baselineResult);
    (invalid as { expectation: "pass" | "fail" }).expectation = "pass";

    expect(() =>
      reduceLabState(running, {
        ...meta,
        id: "invalid-baseline:1",
        type: "BASELINE_FAILED_AS_EXPECTED",
        runId: "baseline-1",
        result: invalid,
      }),
    ).toThrow(/expected failed target fixture/);
  });

  it("rejects a candidate suite that drops a sealed trial", () => {
    const running = reduceLabEvents(createInitialLabState(), [
      { ...meta, type: "BASELINE_RUN_STARTED", runId: "baseline-1" },
      {
        ...meta,
        id: "baseline:1",
        type: "BASELINE_FAILED_AS_EXPECTED",
        runId: "baseline-1",
        result: baselineResult,
      },
      { ...meta, id: "patch:0", type: "PATCH_STAGED", patch },
      {
        ...meta,
        id: "candidate:0",
        type: "CANDIDATE_RUN_STARTED",
        runId: "candidate-1",
      },
    ]);
    const incomplete = structuredClone(candidateSuite);
    (incomplete.runs as typeof incomplete.runs[number][]).pop();

    expect(() =>
      reduceLabState(running, {
        ...meta,
        id: "candidate:1",
        type: "CANDIDATE_SUITE_COMPLETED",
        runId: "candidate-1",
        suite: incomplete,
      }),
    ).toThrow(/exactly two distinct sealed trials/);
  });

  it("rejects a candidate suite evaluated against a different staged patch", () => {
    const mismatchedSuite = structuredClone(candidateSuite);
    (mismatchedSuite as unknown as {
      evaluatedPatch: {
        id: string;
        layer: string;
        diff: readonly string[];
      };
    }).evaluatedPatch = {
      id: patch.id,
      layer: patch.layer,
      diff: ["A different completion policy."],
    };
    const running = reduceLabEvents(createInitialLabState(), [
      { ...meta, type: "BASELINE_RUN_STARTED", runId: "baseline-1" },
      {
        ...meta,
        id: "baseline:1",
        type: "BASELINE_FAILED_AS_EXPECTED",
        runId: "baseline-1",
        result: baselineResult,
      },
      {
        ...meta,
        id: "patch:0",
        type: "PATCH_STAGED",
        patch,
      },
      {
        ...meta,
        id: "candidate:0",
        type: "CANDIDATE_RUN_STARTED",
        runId: "candidate-1",
      },
    ]);

    expect(() =>
      reduceLabState(running, {
        ...meta,
        id: "candidate:1",
        type: "CANDIDATE_SUITE_COMPLETED",
        runId: "candidate-1",
        suite: mismatchedSuite,
      }),
    ).toThrow(/staged patch/);
  });

  it("rejects a forged suite even when its patch identity agrees", () => {
    const forgedSuite = structuredClone(candidateSuite);
    const firstRun = forgedSuite.runs[0];
    const firstFact = firstRun?.facts[0];
    if (!firstFact) throw new Error("Expected a candidate fact fixture.");
    (firstFact as { value: boolean | number | string }).value = "forged";
    const running = reduceLabEvents(createInitialLabState(), [
      { ...meta, type: "BASELINE_RUN_STARTED", runId: "baseline-1" },
      {
        ...meta,
        id: "baseline:1",
        type: "BASELINE_FAILED_AS_EXPECTED",
        runId: "baseline-1",
        result: baselineResult,
      },
      { ...meta, id: "patch:0", type: "PATCH_STAGED", patch },
      {
        ...meta,
        id: "candidate:0",
        type: "CANDIDATE_RUN_STARTED",
        runId: "candidate-1",
      },
    ]);

    expect(() =>
      reduceLabState(running, {
        ...meta,
        id: "candidate:1",
        type: "CANDIDATE_SUITE_COMPLETED",
        runId: "candidate-1",
        suite: forgedSuite,
      }),
    ).toThrow(/not derived from mission/);
  });

  it("rejects an event applied from the wrong phase", () => {
    expect(() =>
      reduceLabState(createInitialLabState(), {
        ...meta,
        type: "PATCH_STAGED",
        patch,
      }),
    ).toThrow(/Expected baseline_failed/);
  });

  it("rejects a forged staged patch at the reducer boundary", () => {
    const baselineFailed = createBaselineFailedState();

    expect(() =>
      reduceLabState(baselineFailed, {
        ...meta,
        id: "forged-patch:0",
        commandId: "forged-patch",
        type: "PATCH_STAGED",
        patch: {
          ...patch,
          diff: ["A forged completion contract."],
        },
      }),
    ).toThrow(/declared fixture identity/);
  });

  it("rejects a forged non-human promotion event at the reducer boundary", () => {
    const compared = createComparedState();

    expect(() =>
      reduceLabState(compared, {
        ...meta,
        id: "forged-decision:0",
        commandId: "forged-decision",
        actor: "agent",
        type: "CANDIDATE_PROMOTED",
        decision: {
          outcome: "promoted",
          actor: "human",
          comparedRevision: compared.revision,
        },
      }),
    ).toThrow(/must be a human decision/);
  });

  it("rejects a decision event that does not bind the current comparison revision", () => {
    const compared = createComparedState();

    expect(() =>
      reduceLabState(compared, {
        ...meta,
        id: "stale-decision:0",
        commandId: "stale-decision",
        type: "CANDIDATE_REJECTED",
        decision: {
          outcome: "rejected",
          actor: "human",
          comparedRevision: compared.revision - 1,
        },
      }),
    ).toThrow(/current compared revision/);
  });

  it.each([
    ["CANDIDATE_PROMOTED", "rejected"],
    ["CANDIDATE_REJECTED", "promoted"],
  ] as const)("rejects %s with a contradictory %s outcome", (type, outcome) => {
    const compared = createComparedState();
    const forged = {
      ...meta,
      id: "contradictory-decision:0",
      commandId: "contradictory-decision",
      type,
      decision: {
        outcome,
        actor: "human",
        comparedRevision: compared.revision,
      },
    } as unknown as DomainEvent;

    expect(() => reduceLabState(compared, forged)).toThrow(/must be a human decision/);
  });

  it("rejects promotion when the candidate suite failed", () => {
    const compared = createComparedState();
    const failed = {
      ...compared,
      candidateSuiteResult: compared.candidateSuiteResult
        ? { ...compared.candidateSuiteResult, status: "failed" as const }
        : null,
    };

    expect(() =>
      reduceLabState(failed, {
        ...meta,
        id: "failed-promotion:0",
        commandId: "failed-promotion",
        type: "CANDIDATE_PROMOTED",
        decision: {
          outcome: "promoted",
          actor: "human",
          comparedRevision: failed.revision,
        },
      }),
    ).toThrow(/requires a passing candidate suite/);
  });
});
