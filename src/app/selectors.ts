import type { Actor, LabState } from "../domain/types";
import { compareHarnesses } from "../domain/evaluation";
import {
  getScenarioDefinition,
  isScenarioImplemented,
} from "../scenarios/registry";
import type {
  HarnessComparison,
  ScenarioDefinition,
  SignalSummary,
  TrialRun,
} from "../scenarios/types";
import { isCommandAllowed } from "./guards";

export interface LabStateSummary {
  readonly missionId: LabState["missionId"];
  readonly phase: LabState["phase"];
  readonly revision: number;
  readonly hasCandidate: boolean;
  readonly decision: LabState["decision"];
  readonly promotionIsHumanOnly: true;
}

export function selectLabStateSummary(state: LabState): LabStateSummary {
  return {
    missionId: state.missionId,
    phase: state.phase,
    revision: state.revision,
    hasCandidate: state.candidate !== null,
    decision: state.decision,
    promotionIsHumanOnly: true,
  };
}

export function selectCanRunBaseline(state: LabState, actor: Actor): boolean {
  return isScenarioImplemented(state.missionId)
    && isCommandAllowed(state, { type: "RUN_BASELINE" }, actor);
}

export interface BaselineRunAvailability {
  readonly available: boolean;
  readonly reason: string;
}

export function selectBaselineRunAvailability(
  state: LabState,
  actor: Actor,
): BaselineRunAvailability {
  if (!isScenarioImplemented(state.missionId)) {
    return {
      available: false,
      reason: "This cataloged mission does not have an executable fixture yet.",
    };
  }
  if (!isCommandAllowed(state, { type: "RUN_BASELINE" }, actor)) {
    return {
      available: false,
      reason: "Reload the mission to reproduce its baseline from a clean state.",
    };
  }
  return {
    available: true,
    reason: "Runs the built-in fixture locally with no model or network call.",
  };
}

export interface BaselineEvidenceView {
  readonly status: "failed_as_expected";
  readonly fixtureDisclosure: string;
  readonly invariant: string;
  readonly passedAssertions: number;
  readonly failedAssertions: number;
  readonly applicableAssertions: number;
  readonly resultDigest: string;
  readonly firstFailure: {
    readonly assertionId: string;
    readonly title: string;
    readonly message: string;
    readonly evidenceFactId: string;
  };
  readonly signals: readonly SignalSummary[];
}

export function selectBaselineEvidence(
  state: LabState,
): BaselineEvidenceView | null {
  const result = state.baselineResult;
  if (!result || result.status !== "failed_as_expected") return null;
  const applicable = result.assertions.filter(
    (assertion) => assertion.status !== "not_applicable",
  );
  const firstFailure = applicable.find(
    (assertion) => assertion.status === "failed",
  );
  const evidenceFactId = firstFailure?.evidenceFactIds[0];
  if (!firstFailure || !evidenceFactId) {
    throw new Error(`Baseline result ${result.id} has no traceable failed assertion.`);
  }
  return {
    status: result.status,
    fixtureDisclosure: result.fixtureDisclosure,
    invariant: result.invariant,
    passedAssertions: applicable.filter(
      (assertion) => assertion.status === "passed",
    ).length,
    failedAssertions: applicable.filter(
      (assertion) => assertion.status === "failed",
    ).length,
    applicableAssertions: applicable.length,
    resultDigest: result.resultDigest,
    firstFailure: {
      assertionId: firstFailure.assertionId,
      title: firstFailure.title,
      message: firstFailure.message,
      evidenceFactId,
    },
    signals: result.signals,
  };
}

export function selectHarnessComparison(
  state: LabState,
): HarnessComparison | null {
  if (!state.baselineResult || !state.candidateSuiteResult) return null;
  return compareHarnesses(state.baselineResult, state.candidateSuiteResult);
}

export function selectScenarioDefinition(
  state: LabState,
): ScenarioDefinition | null {
  return getScenarioDefinition(state.missionId);
}

export function selectCandidateTargetRun(state: LabState): TrialRun | null {
  return state.candidateSuiteResult?.runs.find(
    (run) => run.trialKind === "target",
  ) ?? null;
}

function stagedPatchMatchesScenario(
  state: LabState,
  scenario: ScenarioDefinition | null,
): boolean {
  const staged = state.candidate;
  const fixture = scenario?.candidate.patch;
  return Boolean(
    staged
    && fixture
    && staged.id === fixture.id
    && staged.layer === fixture.layer
    && staged.diff.length === fixture.diff.length
    && staged.diff.every((line, index) => line === fixture.diff[index]),
  );
}

export interface TraceFactView {
  readonly id: string;
  readonly key: string;
  readonly sequence: number;
  readonly label: string;
  readonly value: boolean | number | string;
  readonly detail: string;
  readonly status: "passed" | "failed" | "observed";
  readonly signals: readonly string[];
  readonly assertionIds: readonly string[];
}

export interface RunTraceView {
  readonly id: string;
  readonly harnessVersion: string;
  readonly role: "baseline" | "candidate";
  readonly status: TrialRun["status"];
  readonly digest: string;
  readonly facts: readonly TraceFactView[];
}

function toTraceView(run: TrialRun): RunTraceView {
  return {
    id: run.id,
    harnessVersion: run.harnessVersion,
    role: run.harnessRole,
    status: run.status,
    digest: run.resultDigest,
    facts: run.facts.map((fact) => {
      const assertions = run.assertions.filter((assertion) =>
        assertion.evidenceFactIds.includes(fact.id)
      );
      return {
        id: fact.id,
        key: fact.key,
        sequence: fact.sequence,
        label: fact.label,
        value: fact.value,
        detail: fact.detail,
        status: assertions.some((assertion) => assertion.status === "failed")
          ? "failed" as const
          : assertions.some((assertion) => assertion.status === "passed")
            ? "passed" as const
            : "observed" as const,
        signals: [...new Set(assertions.map((assertion) => assertion.signal))],
        assertionIds: assertions.map((assertion) => assertion.assertionId),
      };
    }),
  };
}

export interface RunTracesView {
  readonly baseline: RunTraceView | null;
  readonly candidate: RunTraceView | null;
}

export function selectRunTraces(state: LabState): RunTracesView {
  const candidate = selectCandidateTargetRun(state);
  return {
    baseline: state.baselineResult ? toTraceView(state.baselineResult) : null,
    candidate: candidate ? toTraceView(candidate) : null,
  };
}

export interface CandidatePatchView {
  readonly id: string;
  readonly layer: string;
  readonly diff: readonly string[];
  readonly mechanism: string;
  readonly defaultHypothesis: string;
  readonly stagedHypothesis: string | null;
  readonly status: "draft" | "staged" | "evaluated";
  readonly evaluatedDigest: string | null;
}

export function selectCandidatePatchView(
  state: LabState,
): CandidatePatchView | null {
  const scenario = getScenarioDefinition(state.missionId);
  if (!scenario) return null;
  const visiblePatch = state.candidate ?? scenario.candidate.patch;
  return {
    id: visiblePatch.id,
    layer: visiblePatch.layer,
    diff: visiblePatch.diff,
    mechanism: scenario.candidate.patch.mechanism,
    defaultHypothesis: scenario.candidate.patch.hypothesis,
    stagedHypothesis: state.candidate?.hypothesis ?? null,
    status: state.candidateSuiteResult
      ? "evaluated"
      : state.candidate
        ? "staged"
        : "draft",
    evaluatedDigest: state.candidateSuiteResult?.evaluatedPatchDigest ?? null,
  };
}

export interface SealedTrialView {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly status: TrialRun["status"];
  readonly passed: number;
  readonly applicable: number;
  readonly digest: string;
}

export function selectSealedTrials(state: LabState): readonly SealedTrialView[] {
  const scenario = getScenarioDefinition(state.missionId);
  if (!scenario || !state.candidateSuiteResult) return [];
  return state.candidateSuiteResult.runs
    .filter((run) => run.trialKind === "sealed")
    .map((run) => {
      const spec = scenario.trials.find((trial) => trial.id === run.trialId);
      const applicable = run.assertions.filter(
        (assertion) => assertion.status !== "not_applicable",
      );
      return {
        id: run.trialId,
        title: run.trialTitle,
        purpose: spec?.purpose ?? "Regression fixture",
        status: run.status,
        passed: applicable.filter((assertion) => assertion.status === "passed").length,
        applicable: applicable.length,
        digest: run.resultDigest,
      };
    });
}

export interface ActionAvailability {
  readonly canRunBaseline: boolean;
  readonly canStagePatch: boolean;
  readonly canRunCandidateSuite: boolean;
  readonly canReset: boolean;
}

export function selectActionAvailability(state: LabState): ActionAvailability {
  const scenario = getScenarioDefinition(state.missionId);
  const patch = scenario?.candidate.patch;
  return {
    canRunBaseline: selectCanRunBaseline(state, "human"),
    canStagePatch: Boolean(patch) && isCommandAllowed(
      state,
      {
        type: "STAGE_PATCH",
        patch: {
          id: patch?.id ?? "unavailable",
          layer: patch?.layer ?? "unavailable",
          hypothesis: patch?.hypothesis ?? "unavailable",
          diff: patch?.diff ?? ["unavailable"],
        },
      },
      "human",
    ),
    canRunCandidateSuite: stagedPatchMatchesScenario(state, scenario)
      && isCommandAllowed(
        state,
        { type: "RUN_CANDIDATE_SUITE" },
        "human",
      ),
    canReset: isCommandAllowed(state, { type: "RESET" }, "human"),
  };
}

export interface WorkflowStepView {
  readonly id: "baseline" | "patch" | "suite" | "decision";
  readonly label: string;
  readonly status: "pending" | "active" | "complete" | "unavailable";
}

const phaseOrder: Readonly<Record<LabState["phase"], number>> = {
  mission_loaded: 0,
  baseline_running: 0,
  baseline_failed: 1,
  patch_staged: 2,
  candidate_running: 2,
  compared: 3,
  promoted: 4,
  rejected: 4,
};

export function selectWorkflowSteps(
  state: LabState,
): readonly WorkflowStepView[] {
  const current = phaseOrder[state.phase];
  const steps = [
    { id: "baseline", label: "Reproduce baseline" },
    { id: "patch", label: "Stage one patch" },
    { id: "suite", label: "Run target + sealed" },
    { id: "decision", label: "Human decision" },
  ] as const;
  if (!isScenarioImplemented(state.missionId)) {
    return steps.map((step) => ({ ...step, status: "unavailable" as const }));
  }
  return steps.map((step, index) => ({
    ...step,
    status: index < current
      ? "complete" as const
      : index === current
        ? "active" as const
        : "pending" as const,
  }));
}

export interface DecisionAvailability {
  readonly canPromote: boolean;
  readonly canReject: boolean;
  readonly reason: string;
}

export function selectDecisionAvailability(
  state: LabState,
): DecisionAvailability {
  if (!isScenarioImplemented(state.missionId)) {
    return {
      canPromote: false,
      canReject: false,
      reason: "This catalog entry has no executable comparison or decision gate in the current release.",
    };
  }
  const compared = state.phase === "compared";
  const suitePassed = state.candidateSuiteResult?.status === "passed";
  if (compared && suitePassed) {
    return {
      canPromote: isCommandAllowed(
        state,
        { type: "PROMOTE", comparedRevision: state.revision },
        "human",
      ),
      canReject: isCommandAllowed(
        state,
        { type: "REJECT", comparedRevision: state.revision },
        "human",
      ),
      reason: `Reviewing compared revision ${state.revision}.`,
    };
  }
  if (compared) {
    return {
      canPromote: false,
      canReject: isCommandAllowed(
        state,
        { type: "REJECT", comparedRevision: state.revision },
        "human",
      ),
      reason: "The candidate suite failed; rejection remains available.",
    };
  }
  if (state.decision) {
    return {
      canPromote: false,
      canReject: false,
      reason: `Decision recorded for compared revision ${state.decision.comparedRevision}.`,
    };
  }
  return {
    canPromote: false,
    canReject: false,
    reason: "Run and review the candidate suite before deciding.",
  };
}

export function selectRecentEvents(
  state: LabState,
  limit = 5,
): readonly LabState["events"][number][] {
  return state.events.slice(-Math.max(0, limit)).reverse();
}

export function selectCurrentWorkspaceEvents(
  state: LabState,
  limit = 8,
): readonly LabState["events"][number][] {
  let boundary = -1;
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index];
    if (event?.type === "MISSION_LOADED" || event?.type === "WORKSPACE_RESET") {
      boundary = index;
      break;
    }
  }
  return state.events
    .slice(boundary < 0 ? 0 : boundary)
    .slice(-Math.max(0, limit))
    .reverse();
}
