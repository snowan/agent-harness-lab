import { describe, expect, it } from "vitest";
import { createCommandService } from "../../src/app/commands";
import { createLabStore } from "../../src/app/create-store";
import { scenarioEffects } from "../../src/app/scenario-effects";
import { selectHarnessComparison } from "../../src/app/selectors";
import { createInitialLabState } from "../../src/domain/types";
import { completionWithoutProofScenario } from "../../src/scenarios/completion-without-proof";

function createHarness() {
  const store = createLabStore(createInitialLabState());
  let runSequence = 0;
  const service = createCommandService({
    store,
    effects: scenarioEffects,
    ids: {
      nextRunId(kind) {
        runSequence += 1;
        return `test-${kind}-${runSequence}`;
      },
    },
  });
  let commandSequence = 0;
  const context = () => ({
    commandId: `engine-${++commandSequence}`,
    actor: "human" as const,
    source: "test" as const,
  });
  return { store, service, context };
}

describe("scenario command effects", () => {
  it("commits baseline facts, a three-trial candidate suite, and a derived comparison", async () => {
    const { store, service, context } = createHarness();
    const baseline = await service.dispatch({ type: "RUN_BASELINE" }, context());
    await service.dispatch(
      {
        type: "STAGE_PATCH",
        patch: {
          id: completionWithoutProofScenario.candidate.patch.id,
          layer: completionWithoutProofScenario.candidate.patch.layer,
          hypothesis: "Browser receipts should explain whether the completion gate changes behavior.",
          diff: completionWithoutProofScenario.candidate.patch.diff,
        },
      },
      context(),
    );
    const candidate = await service.dispatch(
      { type: "RUN_CANDIDATE_SUITE" },
      context(),
    );
    const comparison = selectHarnessComparison(store.getState());

    expect(baseline.state.baselineResult?.status).toBe("failed_as_expected");
    expect(candidate.state.phase).toBe("compared");
    expect(candidate.state.candidateSuiteResult?.runs).toHaveLength(3);
    expect(candidate.state.candidateSuiteResult?.status).toBe("passed");
    expect(comparison?.signals).toHaveLength(5);
    expect(comparison?.sealedRuns).toHaveLength(2);
  });

  it("clears all evaluation evidence when the mission is reset", async () => {
    const { store, service, context } = createHarness();
    await service.dispatch({ type: "RUN_BASELINE" }, context());
    expect(store.getState().baselineResult).not.toBeNull();

    await service.dispatch({ type: "RESET" }, context());

    expect(store.getState()).toMatchObject({
      phase: "mission_loaded",
      baselineRunId: null,
      baselineResult: null,
      candidateRunId: null,
      candidateSuiteResult: null,
      candidate: null,
      decision: null,
    });
  });

  it("leaves the stable revision unchanged for an unavailable or mismatched fixture", async () => {
    const { store, service, context } = createHarness();
    await service.dispatch(
      { type: "LOAD_MISSION", missionId: "handoff" },
      context(),
    );
    const unavailable = store.getState();

    await expect(
      service.dispatch({ type: "RUN_BASELINE" }, context()),
    ).rejects.toMatchObject({ code: "COMMAND_FAILED" });
    expect(store.getState()).toBe(unavailable);

    await service.dispatch(
      { type: "LOAD_MISSION", missionId: "completion" },
      context(),
    );
    await service.dispatch({ type: "RUN_BASELINE" }, context());
    const baselineFailed = store.getState();

    await expect(
      service.dispatch(
        {
          type: "STAGE_PATCH",
          patch: {
            id: completionWithoutProofScenario.candidate.patch.id,
            layer: completionWithoutProofScenario.candidate.patch.layer,
            hypothesis: "This fixture should be rejected before staging.",
            diff: ["A caller-supplied patch that impersonates the fixture identity."],
          },
        },
        context(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(store.getState()).toBe(baselineFailed);
    expect(store.getState().phase).toBe("baseline_failed");
    expect(store.getState().candidate).toBeNull();
  });
});
