import type { Actor, LabState } from "../domain/types";
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
  return isCommandAllowed(state, { type: "RUN_BASELINE" }, actor);
}

export function selectRecentEvents(
  state: LabState,
  limit = 5,
): readonly LabState["events"][number][] {
  return state.events.slice(-Math.max(0, limit)).reverse();
}
