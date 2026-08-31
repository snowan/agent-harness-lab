import { describe, expect, it } from "vitest";
import { createCommandService } from "../../src/app/commands";
import { createLabStore } from "../../src/app/create-store";
import { scenarioEffects } from "../../src/app/scenario-effects";
import { canonicalJson } from "../../src/domain/evaluation";
import { createInitialLabState, type LabCommand, type LabState } from "../../src/domain/types";
import {
  LAB_SNAPSHOT_KEY,
  createStoredSnapshot,
  discardLabSnapshot,
  loadLabSnapshot,
  saveLabSnapshot,
  type SnapshotStorage,
} from "../../src/persistence/snapshot";
import { getScenarioDefinition } from "../../src/scenarios/registry";

const savedAt = "2026-08-30T19:00:00.000Z";
const decisionAt = "2026-08-30T18:59:00.000Z";

class MemoryStorage implements SnapshotStorage {
  readonly values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  failRemove = false;

  getItem(key: string): string | null {
    if (this.failRead) throw new Error("read unavailable");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error("quota exceeded");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failRemove) throw new Error("remove unavailable");
    this.values.delete(key);
  }
}

async function buildStableStates(decision?: "PROMOTE" | "REJECT") {
  const scenario = getScenarioDefinition("completion");
  if (!scenario) throw new Error("Completion fixture is required.");
  const store = createLabStore(createInitialLabState());
  const states: LabState[] = [store.getState()];
  let run = 0;
  let command = 0;
  const service = createCommandService({
    store,
    effects: scenarioEffects,
    now: () => decisionAt,
    ids: {
      nextRunId(kind) {
        run += 1;
        return `persistence-${kind}-${run}`;
      },
    },
  });
  const dispatch = async (value: LabCommand) => {
    command += 1;
    await service.dispatch(value, {
      commandId: `persistence-command-${command}`,
      actor: "human",
      source: "test",
    });
    states.push(store.getState());
  };
  await dispatch({ type: "RUN_BASELINE" });
  await dispatch({
    type: "STAGE_PATCH",
    patch: {
      id: scenario.candidate.patch.id,
      layer: scenario.candidate.patch.layer,
      diff: scenario.candidate.patch.diff,
      hypothesis: "Stable local snapshots should recover exact reviewed evidence.",
    },
  });
  await dispatch({ type: "RUN_CANDIDATE_SUITE" });
  if (decision) {
    await dispatch({ type: decision, comparedRevision: store.getState().revision });
  }
  return states;
}

function storeRaw(storage: MemoryStorage, value: unknown): void {
  storage.values.set(LAB_SNAPSHOT_KEY, JSON.stringify(value));
}

function cloneSnapshot(state: LabState): {
  fixtureCatalogVersion: string;
  stableState: {
    phase: string;
    events: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
} {
  return JSON.parse(JSON.stringify(createStoredSnapshot(state, savedAt))) as {
    fixtureCatalogVersion: string;
    stableState: {
      phase: string;
      events: Array<Record<string, unknown>>;
    };
    [key: string]: unknown;
  };
}

describe("versioned local workspace recovery", () => {
  it("round-trips each stable evaluation phase and both human decisions", async () => {
    const stableStates = [
      ...(await buildStableStates()),
      (await buildStableStates("PROMOTE")).at(-1),
      (await buildStableStates("REJECT")).at(-1),
    ].filter((state): state is LabState => Boolean(state));

    expect(stableStates.map((state) => state.phase)).toEqual([
      "mission_loaded",
      "baseline_failed",
      "patch_staged",
      "compared",
      "promoted",
      "rejected",
    ]);
    for (const state of stableStates) {
      const storage = new MemoryStorage();
      expect(saveLabSnapshot(storage, state, savedAt)).toBe(true);
      const loaded = loadLabSnapshot(storage);
      expect(loaded).toMatchObject({ status: "restored" });
      expect(canonicalJson(loaded.state)).toBe(canonicalJson(state));
    }
  });

  it("falls back cleanly for absent, unavailable, malformed, or stale storage", async () => {
    const empty = loadLabSnapshot(new MemoryStorage());
    expect(empty).toMatchObject({ status: "empty", state: { revision: 0 } });
    expect(loadLabSnapshot(null)).toMatchObject({
      status: "unavailable",
      state: { phase: "mission_loaded", revision: 0 },
    });

    const malformed = new MemoryStorage();
    malformed.values.set(LAB_SNAPSHOT_KEY, "{not-json");
    expect(loadLabSnapshot(malformed)).toMatchObject({ status: "invalid" });

    const stale = new MemoryStorage();
    const compared = (await buildStableStates()).at(-1);
    if (!compared) throw new Error("Expected a compared state.");
    const staleSnapshot = cloneSnapshot(compared);
    staleSnapshot.fixtureCatalogVersion = "older-catalog";
    storeRaw(stale, staleSnapshot);
    expect(loadLabSnapshot(stale)).toMatchObject({
      status: "stale",
      state: { missionId: "completion", phase: "mission_loaded", revision: 0 },
    });

    const readFailure = new MemoryStorage();
    readFailure.failRead = true;
    expect(loadLabSnapshot(readFailure)).toMatchObject({
      status: "unavailable",
      message: "Local recovery could not be read; using a clean in-memory workspace.",
    });
  });

  it("rejects transient state, unexpected fields, invalid provenance, and tampered evidence", async () => {
    const compared = (await buildStableStates()).at(-1);
    if (!compared) throw new Error("Expected a compared state.");

    const transientStorage = new MemoryStorage();
    const transient = cloneSnapshot(compared);
    transient.stableState.phase = "candidate_running";
    storeRaw(transientStorage, transient);
    expect(loadLabSnapshot(transientStorage)).toMatchObject({ status: "invalid" });

    const unexpectedStorage = new MemoryStorage();
    const unexpected = cloneSnapshot(compared);
    unexpected.hiddenReasoning = "undeclared root field";
    storeRaw(unexpectedStorage, unexpected);
    expect(loadLabSnapshot(unexpectedStorage)).toMatchObject({ status: "invalid" });

    const invalidActorStorage = new MemoryStorage();
    const invalidActor = cloneSnapshot(compared);
    invalidActor.stableState.events[0]!.actor = "intruder";
    storeRaw(invalidActorStorage, invalidActor);
    expect(loadLabSnapshot(invalidActorStorage)).toMatchObject({ status: "invalid" });

    const impossiblePairStorage = new MemoryStorage();
    const impossiblePair = cloneSnapshot(compared);
    impossiblePair.stableState.events[0]!.actor = "human";
    impossiblePair.stableState.events[0]!.source = "webmcp";
    storeRaw(impossiblePairStorage, impossiblePair);
    expect(loadLabSnapshot(impossiblePairStorage)).toMatchObject({ status: "invalid" });

    const paddedHypothesisStorage = new MemoryStorage();
    const paddedHypothesis = cloneSnapshot(compared);
    const patchEvent = paddedHypothesis.stableState.events.find(
      (event) => event.type === "PATCH_STAGED",
    );
    const persistedPatch = patchEvent?.patch as Record<string, unknown> | undefined;
    if (!persistedPatch || typeof persistedPatch.hypothesis !== "string") {
      throw new Error("Expected a persisted candidate hypothesis.");
    }
    persistedPatch.hypothesis = ` ${persistedPatch.hypothesis} `;
    storeRaw(paddedHypothesisStorage, paddedHypothesis);
    expect(loadLabSnapshot(paddedHypothesisStorage)).toMatchObject({ status: "invalid" });

    const duplicateEventStorage = new MemoryStorage();
    const duplicateEvent = cloneSnapshot(compared);
    duplicateEvent.stableState.events[1]!.id = duplicateEvent.stableState.events[0]!.id;
    storeRaw(duplicateEventStorage, duplicateEvent);
    expect(loadLabSnapshot(duplicateEventStorage)).toMatchObject({ status: "invalid" });

    const hiddenNestedStorage = new MemoryStorage();
    const hiddenNested = cloneSnapshot(compared);
    const baselineEvent = hiddenNested.stableState.events.find(
      (event) => event.type === "BASELINE_FAILED_AS_EXPECTED",
    );
    const baselineResult = baselineEvent?.result as Record<string, unknown> | undefined;
    if (!baselineResult) throw new Error("Expected persisted baseline evidence.");
    baselineResult.hiddenReasoning = "undeclared nested field";
    storeRaw(hiddenNestedStorage, hiddenNested);
    expect(loadLabSnapshot(hiddenNestedStorage)).toMatchObject({ status: "invalid" });

    const tamperedStorage = new MemoryStorage();
    const tampered = cloneSnapshot(compared);
    const tamperedBaseline = tampered.stableState.events.find(
      (event) => event.type === "BASELINE_FAILED_AS_EXPECTED",
    )?.result as Record<string, unknown> | undefined;
    if (!tamperedBaseline) throw new Error("Expected persisted baseline evidence.");
    tamperedBaseline.resultDigest = `sha256:${"0".repeat(64)}`;
    storeRaw(tamperedStorage, tampered);
    expect(loadLabSnapshot(tamperedStorage)).toMatchObject({ status: "invalid" });
  });

  it("keeps storage failures non-fatal and cleanup best-effort", async () => {
    const compared = (await buildStableStates()).at(-1);
    if (!compared) throw new Error("Expected a compared state.");
    const storage = new MemoryStorage();
    storage.failWrite = true;
    expect(saveLabSnapshot(storage, compared, savedAt)).toBe(false);

    const oversizedHistory: LabState = {
      ...compared,
      events: Array.from({ length: 129 }, (_, index) => ({
        id: `oversized-${index}`,
        commandId: `oversized-${index}`,
        actor: "human" as const,
        source: "test" as const,
        type: "WORKSPACE_RESET" as const,
      })),
    };
    expect(saveLabSnapshot(new MemoryStorage(), oversizedHistory, savedAt)).toBe(false);

    storage.failRemove = true;
    expect(() => discardLabSnapshot(storage)).not.toThrow();
  });
});
