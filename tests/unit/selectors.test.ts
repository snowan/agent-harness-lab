import { describe, expect, it } from "vitest";
import {
  selectActionAvailability,
  selectCandidatePatchView,
  selectCurrentWorkspaceEvents,
  selectDecisionAvailability,
  selectRunTraces,
  selectSealedTrials,
  selectWorkflowSteps,
} from "../../src/app/selectors";
import {
  runScenarioBaseline,
  runScenarioSuite,
} from "../../src/domain/evaluation";
import { reduceLabEvents, reduceLabState } from "../../src/domain/reducer";
import {
  createInitialLabState,
  type CandidatePatch,
  type DomainEvent,
} from "../../src/domain/types";
import { completionWithoutProofScenario } from "../../src/scenarios/completion-without-proof";

const baseline = await runScenarioBaseline(completionWithoutProofScenario);
const suite = await runScenarioSuite(completionWithoutProofScenario);
const patch: CandidatePatch = {
  id: completionWithoutProofScenario.candidate.patch.id,
  layer: completionWithoutProofScenario.candidate.patch.layer,
  hypothesis: completionWithoutProofScenario.candidate.patch.hypothesis,
  diff: completionWithoutProofScenario.candidate.patch.diff,
};
const meta = {
  id: "selector:0",
  commandId: "selector",
  actor: "human" as const,
  source: "test" as const,
};

function sequence(): readonly DomainEvent[] {
  return [
    { ...meta, type: "BASELINE_RUN_STARTED", runId: "baseline-1" },
    { ...meta, id: "selector:1", type: "BASELINE_FAILED_AS_EXPECTED", runId: "baseline-1", result: baseline },
    { ...meta, id: "selector:2", type: "PATCH_STAGED", patch },
    { ...meta, id: "selector:3", type: "CANDIDATE_RUN_STARTED", runId: "candidate-1" },
    { ...meta, id: "selector:4", type: "CANDIDATE_SUITE_COMPLETED", runId: "candidate-1", suite },
  ];
}

describe("PR3 UI selectors", () => {
  it("derives legal action gates and workflow progress from phase", () => {
    const initial = createInitialLabState();
    expect(selectActionAvailability(initial)).toEqual({
      canRunBaseline: true,
      canStagePatch: false,
      canRunCandidateSuite: false,
      canReset: true,
    });
    expect(selectWorkflowSteps(initial).map((step) => step.status)).toEqual([
      "active",
      "pending",
      "pending",
      "pending",
    ]);

    const handoff = createInitialLabState("handoff");
    expect(selectWorkflowSteps(handoff).map((step) => step.status)).toEqual([
      "active",
      "pending",
      "pending",
      "pending",
    ]);
    expect(selectDecisionAvailability(handoff)).toEqual({
      canPromote: false,
      canReject: false,
      reason: "Run and review the candidate suite before deciding.",
    });

    const compared = reduceLabEvents(initial, sequence());
    expect(selectActionAvailability(compared)).toEqual({
      canRunBaseline: false,
      canStagePatch: false,
      canRunCandidateSuite: false,
      canReset: true,
    });
    expect(selectWorkflowSteps(compared).map((step) => step.status)).toEqual([
      "complete",
      "complete",
      "complete",
      "active",
    ]);
  });

  it("exposes ordered trace facts and immutable fixture patch identity", () => {
    const baselineFailed = reduceLabEvents(createInitialLabState(), sequence().slice(0, 2));
    const trace = selectRunTraces(baselineFailed).baseline;
    const candidate = selectCandidatePatchView(baselineFailed);

    expect(trace?.status).toBe("failed_as_expected");
    expect(trace?.facts[0]?.sequence).toBe(0);
    expect(trace?.facts.some((fact) => fact.status === "failed")).toBe(true);
    expect(candidate).toMatchObject({
      id: completionWithoutProofScenario.candidate.patch.id,
      layer: completionWithoutProofScenario.candidate.patch.layer,
      status: "draft",
      stagedHypothesis: null,
    });
    expect(candidate?.diff).toEqual(completionWithoutProofScenario.candidate.patch.diff);
  });

  it("derives the target trace, two sealed trials, and an exact human decision gate", () => {
    const compared = reduceLabEvents(createInitialLabState(), sequence());
    const traces = selectRunTraces(compared);
    const sealed = selectSealedTrials(compared);
    const decision = selectDecisionAvailability(compared);

    expect(traces.candidate?.status).toBe("passed");
    expect(selectCandidatePatchView(compared)?.status).toBe("evaluated");
    expect(sealed).toHaveLength(2);
    expect(sealed.every((trial) => trial.status === "passed")).toBe(true);
    expect(decision).toEqual({
      canPromote: true,
      canReject: true,
      reason: `Reviewing compared revision ${compared.revision}.`,
    });

    const promoted = reduceLabState(compared, {
      ...meta,
      id: "selector:5",
      type: "CANDIDATE_PROMOTED",
      decision: {
        outcome: "promoted",
        actor: "human",
        comparedRevision: compared.revision,
        recordedAt: "2026-08-30T12:00:00.000Z",
      },
    });
    expect(selectDecisionAvailability(promoted)).toEqual({
      canPromote: false,
      canReject: false,
      reason: `Decision recorded for compared revision ${compared.revision}.`,
    });
    expect(selectWorkflowSteps(promoted).every((step) => step.status === "complete")).toBe(true);
  });

  it("does not hide forged staged identity or expose an executable suite action", () => {
    const baselineFailed = reduceLabEvents(createInitialLabState(), sequence().slice(0, 2));
    const forged = {
      ...baselineFailed,
      phase: "patch_staged" as const,
      candidate: {
        ...patch,
        id: "forged.patch",
        diff: ["A forged fixture diff."],
      },
    };

    expect(selectCandidatePatchView(forged)).toMatchObject({
      id: "forged.patch",
      diff: ["A forged fixture diff."],
      status: "staged",
    });
    expect(selectActionAvailability(forged).canRunCandidateSuite).toBe(false);
  });

  it("allows only rejection for a failed comparison and scopes visible activity to the current workspace", () => {
    const compared = reduceLabEvents(createInitialLabState(), sequence());
    const failed = {
      ...compared,
      candidateSuiteResult: compared.candidateSuiteResult
        ? { ...compared.candidateSuiteResult, status: "failed" as const }
        : null,
    };
    expect(selectDecisionAvailability(failed)).toEqual({
      canPromote: false,
      canReject: true,
      reason: "The candidate suite failed; rejection remains available.",
    });

    const loaded = reduceLabState(compared, {
      ...meta,
      id: "selector:mission-switch",
      commandId: "selector-mission-switch",
      type: "MISSION_LOADED",
      missionId: "handoff",
    });
    expect(selectCurrentWorkspaceEvents(loaded).map((event) => event.type)).toEqual([
      "MISSION_LOADED",
    ]);
  });
});
