import { describe, expect, it } from "vitest";
import { reduceLabEvents, reduceLabState } from "../../src/domain/reducer";
import {
  createInitialLabState,
  type CandidatePatch,
  type DomainEvent,
} from "../../src/domain/types";

const patch: CandidatePatch = {
  id: "patch-1",
  layer: "completion-contract",
  hypothesis: "Require evidence before completion.",
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

describe("reduceLabState", () => {
  it("creates an empty, versioned initial state", () => {
    expect(createInitialLabState()).toEqual({
      schemaVersion: 1,
      workspaceId: "local-workspace",
      missionId: "completion",
      phase: "mission_loaded",
      revision: 0,
      baselineRunId: null,
      candidateRunId: null,
      candidate: null,
      decision: null,
      events: [],
    });
  });

  it("reduces the complete legal event sequence without mutating the input", () => {
    const initial = createInitialLabState();
    const events: DomainEvent[] = [
      event({ ...meta, type: "BASELINE_RUN_STARTED", runId: "baseline-1" }),
      event({ ...meta, id: "command-1:1", type: "BASELINE_FAILED_AS_EXPECTED", runId: "baseline-1" }),
      event({ ...meta, id: "command-2:0", commandId: "command-2", type: "PATCH_STAGED", patch }),
      event({ ...meta, id: "command-3:0", commandId: "command-3", type: "CANDIDATE_RUN_STARTED", runId: "candidate-1" }),
      event({ ...meta, id: "command-3:1", commandId: "command-3", type: "CANDIDATE_SUITE_COMPLETED", runId: "candidate-1" }),
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
    expect(result.candidate).toEqual(patch);
    expect(result.decision?.outcome).toBe("promoted");
    expect(result.events).toEqual(events);
    expect(initial).toEqual(createInitialLabState());
  });

  it("loads another mission and clears run, candidate, and decision state", () => {
    const compared = reduceLabEvents(createInitialLabState(), [
      { ...meta, type: "BASELINE_RUN_STARTED", runId: "baseline-1" },
      { ...meta, id: "1", type: "BASELINE_FAILED_AS_EXPECTED", runId: "baseline-1" },
      { ...meta, id: "2", type: "PATCH_STAGED", patch },
      { ...meta, id: "3", type: "CANDIDATE_RUN_STARTED", runId: "candidate-1" },
      { ...meta, id: "4", type: "CANDIDATE_SUITE_COMPLETED", runId: "candidate-1" },
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
      }),
    ).toThrow(/does not match active run baseline-1/);
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
});
