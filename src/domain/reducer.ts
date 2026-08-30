import { LabDomainError } from "./errors";
import { assertTraceableRun, assertTraceableSuite } from "./evaluation";
import type { DomainEvent, LabPhase, LabState } from "./types";
import { getScenarioDefinition } from "../scenarios/registry";

function invalidResult(message: string): never {
  throw new LabDomainError("INVALID_INPUT", message);
}

function hasStableIdentity(value: {
  readonly schemaVersion: number;
  readonly id: string;
  readonly scenarioVersion: string;
  readonly harnessId: string;
  readonly harnessVersion: string;
  readonly harnessDefinitionDigest: string;
  readonly resultDigest: string;
}): boolean {
  const digestPattern = /^sha256:[0-9a-f]{64}$/;
  return Boolean(
    value.schemaVersion === 1
    && value.id.trim()
    && value.scenarioVersion.trim()
    && value.harnessId.trim()
    && value.harnessVersion.trim()
    && digestPattern.test(value.harnessDefinitionDigest)
    && digestPattern.test(value.resultDigest),
  );
}

function assertBaselineStructure(state: LabState, event: Extract<DomainEvent, {
  readonly type: "BASELINE_FAILED_AS_EXPECTED";
}>): void {
  const result = event.result;
  const scenario = getScenarioDefinition(state.missionId);
  if (
    result.scenarioId !== state.missionId
    || result.harnessRole !== "baseline"
    || result.trialKind !== "target"
    || result.expectation !== "fail"
    || !result.expectationMet
    || result.status !== "failed_as_expected"
    || !hasStableIdentity(result)
    || !scenario
  ) {
    invalidResult(
      `Baseline result ${result.id} is not the expected failed target fixture for mission ${state.missionId}.`,
    );
  }
  const { resultDigest: _resultDigest, ...causalResult } = result;
  try {
    assertTraceableRun(scenario, causalResult);
  } catch {
    invalidResult(
      `Baseline result ${result.id} is not derived from mission ${state.missionId}.`,
    );
  }
  if (
    result.harnessDefinitionDigest
      !== scenario.expectedDigests.baselineHarnessDefinition
    || result.initialStateDigest
      !== scenario.expectedDigests.trialInitialStates[result.trialId]
    || result.resultDigest !== scenario.expectedDigests.baselineTarget
  ) {
    invalidResult(
      `Baseline result ${result.id} does not match the reviewed fixture digests.`,
    );
  }
}

function assertCandidateSuiteStructure(state: LabState, event: Extract<DomainEvent, {
  readonly type: "CANDIDATE_SUITE_COMPLETED";
}>): void {
  const suite = event.suite;
  const baseline = state.baselineResult;
  const scenario = getScenarioDefinition(state.missionId);
  if (!baseline || !state.candidate || !scenario) {
    invalidResult(
      `Candidate suite ${suite.id} requires a preserved baseline and staged patch.`,
    );
  }
  const stagedPatchMatches =
    suite.evaluatedPatch.id === state.candidate.id
    && suite.evaluatedPatch.layer === state.candidate.layer
    && suite.evaluatedPatch.diff.length === state.candidate.diff.length
    && suite.evaluatedPatch.diff.every(
      (line, index) => line === state.candidate?.diff[index],
    );
  if (
    suite.scenarioId !== state.missionId
    || suite.scenarioVersion !== baseline.scenarioVersion
    || suite.harnessRole !== "candidate"
    || !stagedPatchMatches
    || !/^sha256:[0-9a-f]{64}$/.test(suite.evaluatedPatchDigest)
    || !hasStableIdentity(suite)
  ) {
    invalidResult(
      `Candidate suite ${suite.id} does not match the mission, baseline version, and staged patch.`,
    );
  }

  const targetRuns = suite.runs.filter((run) => run.trialKind === "target");
  const sealedRuns = suite.runs.filter((run) => run.trialKind === "sealed");
  const trialIds = new Set(suite.runs.map((run) => run.trialId));
  const target = targetRuns[0];
  if (
    suite.runs.length !== 3
    || targetRuns.length !== 1
    || sealedRuns.length !== 2
    || trialIds.size !== suite.runs.length
    || !target
    || target.trialId !== baseline.trialId
    || target.trialVersion !== baseline.trialVersion
  ) {
    invalidResult(
      `Candidate suite ${suite.id} must contain the baseline target plus exactly two distinct sealed trials.`,
    );
  }

  try {
    assertTraceableSuite(scenario, suite);
  } catch {
    invalidResult(
      `Candidate suite ${suite.id} is not derived from mission ${state.missionId}.`,
    );
  }
  const digestMismatch =
    suite.harnessDefinitionDigest
      !== scenario.expectedDigests.candidateHarnessDefinition
    || suite.evaluatedPatchDigest !== scenario.expectedDigests.evaluatedPatch
    || suite.resultDigest !== scenario.expectedDigests.candidateSuite
    || suite.runs.some((run) =>
      run.harnessDefinitionDigest
        !== scenario.expectedDigests.candidateHarnessDefinition
      || run.initialStateDigest
        !== scenario.expectedDigests.trialInitialStates[run.trialId]
      || run.resultDigest !== scenario.expectedDigests.candidateTrials[run.trialId]
    );
  if (digestMismatch) {
    invalidResult(
      `Candidate suite ${suite.id} does not match the reviewed fixture digests.`,
    );
  }

  const inconsistentRun = suite.runs.find((run) =>
    run.scenarioId !== suite.scenarioId
    || run.scenarioVersion !== suite.scenarioVersion
    || run.harnessId !== suite.harnessId
    || run.harnessVersion !== suite.harnessVersion
    || run.harnessDefinitionDigest !== suite.harnessDefinitionDigest
    || run.harnessRole !== "candidate"
    || run.expectation !== "pass"
    || (run.status !== "passed" && run.status !== "failed")
    || run.expectationMet !== (run.status === "passed")
    || !hasStableIdentity(run)
  );
  if (inconsistentRun) {
    invalidResult(
      `Candidate run ${inconsistentRun.id} is inconsistent with suite ${suite.id}.`,
    );
  }
  const expectedStatus = suite.runs.every((run) => run.status === "passed")
    ? "passed"
    : "failed";
  if (suite.status !== expectedStatus) {
    invalidResult(
      `Candidate suite ${suite.id} status is inconsistent with its trial results.`,
    );
  }
}

function requirePhase(
  state: LabState,
  event: DomainEvent,
  expected: LabPhase,
): void {
  if (state.phase !== expected) {
    throw new LabDomainError(
      "ILLEGAL_TRANSITION",
      `${event.type} cannot apply while the workspace is ${state.phase}. Expected ${expected}.`,
    );
  }
}

function advance(
  state: LabState,
  event: DomainEvent,
  changes: Partial<Omit<LabState, "schemaVersion" | "workspaceId" | "revision" | "events">>,
): LabState {
  return {
    ...state,
    ...changes,
    revision: state.revision + 1,
    events: [...state.events, event],
  };
}

export function reduceLabState(state: LabState, event: DomainEvent): LabState {
  switch (event.type) {
    case "MISSION_LOADED":
      return advance(state, event, {
        missionId: event.missionId,
        phase: "mission_loaded",
        baselineRunId: null,
        candidateRunId: null,
        baselineResult: null,
        candidateSuiteResult: null,
        candidate: null,
        decision: null,
      });

    case "WORKSPACE_RESET":
      return advance(state, event, {
        phase: "mission_loaded",
        baselineRunId: null,
        candidateRunId: null,
        baselineResult: null,
        candidateSuiteResult: null,
        candidate: null,
        decision: null,
      });

    case "BASELINE_RUN_STARTED":
      requirePhase(state, event, "mission_loaded");
      return advance(state, event, {
        phase: "baseline_running",
        baselineRunId: event.runId,
        candidateRunId: null,
        baselineResult: null,
        candidateSuiteResult: null,
        candidate: null,
        decision: null,
      });

    case "BASELINE_FAILED_AS_EXPECTED":
      requirePhase(state, event, "baseline_running");
      if (state.baselineRunId !== event.runId) {
        throw new LabDomainError(
          "INVALID_INPUT",
          `Baseline result ${event.runId} does not match active run ${state.baselineRunId ?? "none"}.`,
        );
      }
      assertBaselineStructure(state, event);
      return advance(state, event, {
        phase: "baseline_failed",
        baselineResult: event.result,
      });

    case "PATCH_STAGED":
      requirePhase(state, event, "baseline_failed");
      return advance(state, event, {
        phase: "patch_staged",
        candidate: event.patch,
        candidateRunId: null,
        candidateSuiteResult: null,
        decision: null,
      });

    case "CANDIDATE_RUN_STARTED":
      requirePhase(state, event, "patch_staged");
      return advance(state, event, {
        phase: "candidate_running",
        candidateRunId: event.runId,
        decision: null,
      });

    case "CANDIDATE_SUITE_COMPLETED":
      requirePhase(state, event, "candidate_running");
      if (state.candidateRunId !== event.runId) {
        throw new LabDomainError(
          "INVALID_INPUT",
          `Candidate result ${event.runId} does not match active run ${state.candidateRunId ?? "none"}.`,
        );
      }
      assertCandidateSuiteStructure(state, event);
      return advance(state, event, {
        phase: "compared",
        candidateSuiteResult: event.suite,
      });

    case "CANDIDATE_PROMOTED":
      requirePhase(state, event, "compared");
      return advance(state, event, {
        phase: "promoted",
        decision: event.decision,
      });

    case "CANDIDATE_REJECTED":
      requirePhase(state, event, "compared");
      return advance(state, event, {
        phase: "rejected",
        decision: event.decision,
      });
  }
}

export function reduceLabEvents(
  state: LabState,
  events: readonly DomainEvent[],
): LabState {
  return events.reduce(reduceLabState, state);
}
