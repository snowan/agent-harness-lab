import { LabDomainError } from "./errors";
import type { DomainEvent, LabPhase, LabState } from "./types";

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
        candidate: null,
        decision: null,
      });

    case "WORKSPACE_RESET":
      return advance(state, event, {
        phase: "mission_loaded",
        baselineRunId: null,
        candidateRunId: null,
        candidate: null,
        decision: null,
      });

    case "BASELINE_RUN_STARTED":
      requirePhase(state, event, "mission_loaded");
      return advance(state, event, {
        phase: "baseline_running",
        baselineRunId: event.runId,
        candidateRunId: null,
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
      return advance(state, event, { phase: "baseline_failed" });

    case "PATCH_STAGED":
      requirePhase(state, event, "baseline_failed");
      return advance(state, event, {
        phase: "patch_staged",
        candidate: event.patch,
        candidateRunId: null,
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
      return advance(state, event, { phase: "compared" });

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
