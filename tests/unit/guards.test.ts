import { describe, expect, it } from "vitest";
import { assertCommandAllowed, isCommandAllowed } from "../../src/app/guards";
import {
  createInitialLabState,
  type LabCommand,
  type LabPhase,
  type LabState,
} from "../../src/domain/types";

const phases: readonly LabPhase[] = [
  "mission_loaded",
  "baseline_running",
  "baseline_failed",
  "patch_staged",
  "candidate_running",
  "compared",
  "promoted",
  "rejected",
];

const patch = {
  id: "patch-1",
  layer: "completion-contract",
  hypothesis: "Require evidence before completion.",
};

function stateAt(phase: LabPhase): LabState {
  return {
    ...createInitialLabState(),
    phase,
    revision: phase === "compared" ? 5 : 1,
    candidate: ["patch_staged", "candidate_running", "compared", "promoted", "rejected"].includes(phase)
      ? patch
      : null,
  };
}

function command(type: LabCommand["type"], revision: number): LabCommand {
  switch (type) {
    case "LOAD_MISSION": return { type, missionId: "handoff" };
    case "RUN_BASELINE": return { type };
    case "STAGE_PATCH": return { type, patch };
    case "RUN_CANDIDATE_SUITE": return { type };
    case "PROMOTE": return { type, comparedRevision: revision };
    case "REJECT": return { type, comparedRevision: revision };
    case "RESET": return { type };
  }
}

const legalPhases: Readonly<Record<LabCommand["type"], readonly LabPhase[]>> = {
  LOAD_MISSION: ["mission_loaded", "baseline_failed", "patch_staged", "compared", "promoted", "rejected"],
  RUN_BASELINE: ["mission_loaded"],
  STAGE_PATCH: ["baseline_failed"],
  RUN_CANDIDATE_SUITE: ["patch_staged"],
  PROMOTE: ["compared"],
  REJECT: ["compared"],
  RESET: ["mission_loaded", "baseline_failed", "patch_staged", "compared", "promoted", "rejected"],
};

describe("command guards", () => {
  for (const type of Object.keys(legalPhases) as LabCommand["type"][]) {
    for (const phase of phases) {
      const shouldAllow = legalPhases[type].includes(phase);
      it(`${shouldAllow ? "allows" : "rejects"} ${type} from ${phase}`, () => {
        const state = stateAt(phase);
        expect(isCommandAllowed(state, command(type, state.revision), "human")).toBe(shouldAllow);
      });
    }
  }

  it.each(["agent", "system"] as const)("prevents a %s actor from promoting", (actor) => {
    const state = stateAt("compared");
    expect(() =>
      assertCommandAllowed(
        state,
        { type: "PROMOTE", comparedRevision: state.revision },
        actor,
      ),
    ).toThrow(/human decision controls/);
  });

  it("prevents a stale human decision", () => {
    const state = stateAt("compared");
    expect(() =>
      assertCommandAllowed(
        state,
        { type: "REJECT", comparedRevision: state.revision - 1 },
        "human",
      ),
    ).toThrow(/Review the latest comparison/);
  });

  it("rejects an incomplete patch", () => {
    expect(() =>
      assertCommandAllowed(
        stateAt("baseline_failed"),
        { type: "STAGE_PATCH", patch: { ...patch, hypothesis: "  " } },
        "human",
      ),
    ).toThrow(/needs an ID, harness layer, and causal hypothesis/);
  });

  it("rejects a hypothesis longer than 280 characters", () => {
    expect(() =>
      assertCommandAllowed(
        stateAt("baseline_failed"),
        { type: "STAGE_PATCH", patch: { ...patch, hypothesis: "x".repeat(281) } },
        "human",
      ),
    ).toThrow(/at or below 280/);
  });
});
