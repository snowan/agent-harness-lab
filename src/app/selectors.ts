import type { Actor, LabState } from "../domain/types";
import { compareHarnesses } from "../domain/evaluation";
import { isScenarioImplemented } from "../scenarios/registry";
import type { HarnessComparison, SignalSummary } from "../scenarios/types";
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

export function selectRecentEvents(
  state: LabState,
  limit = 5,
): readonly LabState["events"][number][] {
  return state.events.slice(-Math.max(0, limit)).reverse();
}
