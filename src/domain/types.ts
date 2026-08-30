import type { SuiteRun, TrialRun } from "../scenarios/types";

export const LAB_STATE_SCHEMA_VERSION = 2 as const;

export type ScenarioId = "completion" | "handoff" | "retry" | "authority";

export type LabPhase =
  | "mission_loaded"
  | "baseline_running"
  | "baseline_failed"
  | "patch_staged"
  | "candidate_running"
  | "compared"
  | "promoted"
  | "rejected";

export type StableLabPhase = Exclude<
  LabPhase,
  "baseline_running" | "candidate_running"
>;

export type Actor = "human" | "agent" | "system";
export type CommandSource = "ui" | "webmcp" | "bootstrap" | "test";

export interface CandidatePatch {
  readonly id: string;
  readonly layer: string;
  readonly hypothesis: string;
  readonly diff: readonly string[];
}

export interface HumanDecision {
  readonly outcome: "promoted" | "rejected";
  readonly actor: "human";
  readonly comparedRevision: number;
}

interface EventMeta {
  readonly id: string;
  readonly commandId: string;
  readonly actor: Actor;
  readonly source: CommandSource;
}

export type DomainEvent =
  | (EventMeta & {
      readonly type: "MISSION_LOADED";
      readonly missionId: ScenarioId;
    })
  | (EventMeta & {
      readonly type: "WORKSPACE_RESET";
    })
  | (EventMeta & {
      readonly type: "BASELINE_RUN_STARTED";
      readonly runId: string;
    })
  | (EventMeta & {
      readonly type: "BASELINE_FAILED_AS_EXPECTED";
      readonly runId: string;
      readonly result: TrialRun;
    })
  | (EventMeta & {
      readonly type: "PATCH_STAGED";
      readonly patch: CandidatePatch;
    })
  | (EventMeta & {
      readonly type: "CANDIDATE_RUN_STARTED";
      readonly runId: string;
    })
  | (EventMeta & {
      readonly type: "CANDIDATE_SUITE_COMPLETED";
      readonly runId: string;
      readonly suite: SuiteRun;
    })
  | (EventMeta & {
      readonly type: "CANDIDATE_PROMOTED";
      readonly decision: HumanDecision;
    })
  | (EventMeta & {
      readonly type: "CANDIDATE_REJECTED";
      readonly decision: HumanDecision;
    });

export interface LabState {
  readonly schemaVersion: typeof LAB_STATE_SCHEMA_VERSION;
  readonly workspaceId: string;
  readonly missionId: ScenarioId;
  readonly phase: LabPhase;
  readonly revision: number;
  readonly baselineRunId: string | null;
  readonly candidateRunId: string | null;
  readonly baselineResult: TrialRun | null;
  readonly candidateSuiteResult: SuiteRun | null;
  readonly candidate: CandidatePatch | null;
  readonly decision: HumanDecision | null;
  readonly events: readonly DomainEvent[];
}

export type LabCommand =
  | {
      readonly type: "LOAD_MISSION";
      readonly missionId: ScenarioId;
    }
  | {
      readonly type: "RUN_BASELINE";
    }
  | {
      readonly type: "STAGE_PATCH";
      readonly patch: CandidatePatch;
    }
  | {
      readonly type: "RUN_CANDIDATE_SUITE";
    }
  | {
      readonly type: "PROMOTE";
      readonly comparedRevision: number;
    }
  | {
      readonly type: "REJECT";
      readonly comparedRevision: number;
    }
  | {
      readonly type: "RESET";
    };

export interface CommandContext {
  readonly commandId: string;
  readonly actor: Actor;
  readonly source: CommandSource;
  readonly signal?: AbortSignal;
}

export interface CommandResult {
  readonly state: LabState;
  readonly events: readonly DomainEvent[];
  readonly replayed: boolean;
}

export function createInitialLabState(
  missionId: ScenarioId = "completion",
): LabState {
  return {
    schemaVersion: LAB_STATE_SCHEMA_VERSION,
    workspaceId: "local-workspace",
    missionId,
    phase: "mission_loaded",
    revision: 0,
    baselineRunId: null,
    candidateRunId: null,
    baselineResult: null,
    candidateSuiteResult: null,
    candidate: null,
    decision: null,
    events: [],
  };
}
