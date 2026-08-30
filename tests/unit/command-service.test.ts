import { describe, expect, it, vi } from "vitest";
import { createCommandService, type CommandEffects } from "../../src/app/commands";
import { createLabStore } from "../../src/app/create-store";
import { LabDomainError } from "../../src/domain/errors";
import {
  canonicalSha256,
  runScenarioBaseline,
  runScenarioSuite,
} from "../../src/domain/evaluation";
import { createInitialLabState, type LabCommand } from "../../src/domain/types";
import { completionWithoutProofScenario } from "../../src/scenarios/completion-without-proof";

const baselineResult = await runScenarioBaseline(completionWithoutProofScenario);
const candidateSuite = await runScenarioSuite(completionWithoutProofScenario);

const patch = {
  id: completionWithoutProofScenario.candidate.patch.id,
  layer: completionWithoutProofScenario.candidate.patch.layer,
  hypothesis: "Require evidence before completion.",
  diff: completionWithoutProofScenario.candidate.patch.diff,
};

function context(commandId: string, actor: "human" | "agent" = "human") {
  return { commandId, actor, source: "test" as const };
}

function createHarness(effects?: Partial<CommandEffects>) {
  const store = createLabStore(createInitialLabState());
  let run = 0;
  const service = createCommandService({
    store,
    ids: {
      nextRunId(kind, state) {
        run += 1;
        return `${state.missionId}-${kind}-${run}`;
      },
    },
    effects: {
      runBaseline: effects?.runBaseline ?? vi.fn(async () => baselineResult),
      runCandidateSuite: effects?.runCandidateSuite ?? vi.fn(async () => candidateSuite),
    },
  });
  return { store, service };
}

async function reachCompared(service: ReturnType<typeof createHarness>["service"]) {
  await service.dispatch({ type: "RUN_BASELINE" }, context("baseline"));
  await service.dispatch({ type: "STAGE_PATCH", patch }, context("patch"));
  return service.dispatch({ type: "RUN_CANDIDATE_SUITE" }, context("candidate"));
}

describe("command service", () => {
  it("commits a complete legal workflow through the human decision", async () => {
    const { store, service } = createHarness();
    const compared = await reachCompared(service);
    const decided = await service.dispatch(
      { type: "PROMOTE", comparedRevision: compared.state.revision },
      context("decision"),
    );

    expect(decided.state.phase).toBe("promoted");
    expect(decided.state.decision).toEqual({
      outcome: "promoted",
      actor: "human",
      comparedRevision: compared.state.revision,
    });
    expect(store.getState()).toBe(decided.state);
    expect(decided.state.events.map((event) => event.type)).toEqual([
      "BASELINE_RUN_STARTED",
      "BASELINE_FAILED_AS_EXPECTED",
      "PATCH_STAGED",
      "CANDIDATE_RUN_STARTED",
      "CANDIDATE_SUITE_COMPLETED",
      "CANDIDATE_PROMOTED",
    ]);
  });

  it("leaves the stable state unchanged when an effect fails", async () => {
    const failure = new Error("fixture runner unavailable");
    const { store, service } = createHarness({
      runBaseline: vi.fn(async () => { throw failure; }),
    });
    const before = store.getState();

    await expect(
      service.dispatch({ type: "RUN_BASELINE" }, context("baseline-failure")),
    ).rejects.toMatchObject({ code: "COMMAND_FAILED" });

    expect(store.getState()).toBe(before);
    expect(store.getState().revision).toBe(0);
    expect(store.getState().events).toEqual([]);
  });

  it("rejects rehashed effect output that is not derived from the scenario fixture", async () => {
    const forgedSuite = structuredClone(candidateSuite);
    const target = forgedSuite.runs.find((run) => run.trialKind === "target");
    const firstFact = target?.facts[0];
    if (!target || !firstFact) throw new Error("Expected a target fact.");
    (firstFact as { detail: string }).detail = "Fabricated by an injected effect.";
    const { resultDigest: _oldRunDigest, ...runCausalData } = target;
    (target as { resultDigest: string }).resultDigest = await canonicalSha256(
      runCausalData,
    );
    const { resultDigest: _oldSuiteDigest, ...suiteCausalData } = forgedSuite;
    (forgedSuite as { resultDigest: string }).resultDigest = await canonicalSha256(
      suiteCausalData,
    );

    const { store, service } = createHarness({
      runCandidateSuite: vi.fn(async () => forgedSuite),
    });
    await service.dispatch({ type: "RUN_BASELINE" }, context("baseline-forged"));
    await service.dispatch(
      { type: "STAGE_PATCH", patch },
      context("patch-forged"),
    );
    const before = store.getState();

    await expect(
      service.dispatch(
        { type: "RUN_CANDIDATE_SUITE" },
        context("candidate-forged"),
      ),
    ).rejects.toMatchObject({ code: "COMMAND_FAILED" });
    expect(store.getState()).toBe(before);
  });

  it("returns the prior result when a completed command ID is retried", async () => {
    const { store, service } = createHarness();
    const command: LabCommand = { type: "LOAD_MISSION", missionId: "handoff" };
    const first = await service.dispatch(command, context("load-once"));
    const replay = await service.dispatch(command, context("load-once"));

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.state).toBe(first.state);
    expect(store.getState().revision).toBe(1);

    await expect(
      service.dispatch(command, context("load-once", "agent")),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      service.dispatch({ type: "RESET" }, context("load-once")),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(store.getState()).toBe(first.state);
  });

  it("rejects overlapping commands while a run is active", async () => {
    let release: (() => void) | undefined;
    const waiting = new Promise<typeof baselineResult>((resolve) => {
      release = () => resolve(baselineResult);
    });
    const { service } = createHarness({
      runBaseline: vi.fn(() => waiting),
    });

    const baseline = service.dispatch({ type: "RUN_BASELINE" }, context("slow-run"));
    await Promise.resolve();

    await expect(
      service.dispatch(
        { type: "LOAD_MISSION", missionId: "retry" },
        context("overlap"),
      ),
    ).rejects.toMatchObject({ code: "RUN_ALREADY_ACTIVE" });

    release?.();
    await baseline;
  });

  it("rejects an agent decision even when the comparison is current", async () => {
    const { service } = createHarness();
    const compared = await reachCompared(service);

    await expect(
      service.dispatch(
        { type: "REJECT", comparedRevision: compared.state.revision },
        context("agent-decision", "agent"),
      ),
    ).rejects.toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
  });

  it("rejects an already-aborted command before changing state", async () => {
    const { store, service } = createHarness();
    const controller = new AbortController();
    controller.abort();

    await expect(
      service.dispatch(
        { type: "LOAD_MISSION", missionId: "authority" },
        { ...context("aborted"), signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(LabDomainError);
    expect(store.getState().revision).toBe(0);
  });

  it("publishes one store notification for a multi-event command", async () => {
    const listenerError = new Error("subscriber crashed");
    const onListenerError = vi.fn();
    const store = createLabStore(createInitialLabState(), { onListenerError });
    let run = 0;
    const service = createCommandService({
      store,
      ids: {
        nextRunId(kind, state) {
          run += 1;
          return `${state.missionId}-${kind}-${run}`;
        },
      },
      effects: {
        runBaseline: vi.fn(async () => baselineResult),
        runCandidateSuite: vi.fn(async () => candidateSuite),
      },
    });
    store.subscribe(() => { throw listenerError; });
    const listener = vi.fn();
    store.subscribe(listener);

    const first = await service.dispatch(
      { type: "RUN_BASELINE" },
      context("baseline"),
    );
    const replay = await service.dispatch(
      { type: "RUN_BASELINE" },
      context("baseline"),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(onListenerError).toHaveBeenCalledWith(listenerError);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(store.getState().revision).toBe(2);
  });
});
