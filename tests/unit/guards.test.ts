import { describe, expect, it } from "vitest";
import { assertCommandAllowed, isCommandAllowed } from "../../src/app/guards";
import {
  createInitialLabState,
  type LabCommand,
  type LabPhase,
  type LabState,
} from "../../src/domain/types";
import { runScenarioSuite } from "../../src/domain/evaluation";
import { completionWithoutProofScenario } from "../../src/scenarios/completion-without-proof";

const candidateSuite = await runScenarioSuite(completionWithoutProofScenario);

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
  diff: ["Require browser evidence."],
};

function stateAt(phase: LabPhase): LabState {
  const hasComparison = ["compared", "promoted", "rejected"].includes(phase);
  return {
    ...createInitialLabState(),
    phase,
    revision: phase === "compared" ? 5 : 1,
    candidate: ["patch_staged", "candidate_running", "compared", "promoted", "rejected"].includes(phase)
      ? patch
      : null,
    candidateSuiteResult: hasComparison ? candidateSuite : null,
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

  it("prevents promotion when the compared candidate suite failed", () => {
    const compared = stateAt("compared");
    const failed = {
      ...compared,
      candidateSuiteResult: compared.candidateSuiteResult
        ? { ...compared.candidateSuiteResult, status: "failed" as const }
        : null,
    };

    expect(() =>
      assertCommandAllowed(
        failed,
        { type: "PROMOTE", comparedRevision: failed.revision },
        "human",
      ),
    ).toThrow(/requires a passing candidate suite/);
    expect(isCommandAllowed(
      failed,
      { type: "REJECT", comparedRevision: failed.revision },
      "human",
    )).toBe(true);
  });

  it("rejects an incomplete patch", () => {
    expect(() =>
      assertCommandAllowed(
        stateAt("baseline_failed"),
        { type: "STAGE_PATCH", patch: { ...patch, hypothesis: "  " } },
        "human",
      ),
    ).toThrow(/needs an ID, harness layer, reviewable diff, and causal hypothesis/);
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
