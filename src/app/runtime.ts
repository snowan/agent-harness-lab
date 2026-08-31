import { createInitialLabState } from "../domain/types";
import {
  discardLabSnapshot,
  loadLabSnapshot,
  saveLabSnapshot,
  type SnapshotStorage,
} from "../persistence/snapshot";
import {
  persistenceRuntime,
  persistenceStateForLoad,
} from "../persistence/status";
import { createCommandService } from "./commands";
import { createLabStore } from "./create-store";
import { scenarioEffects } from "./scenario-effects";

function browserStorage(): SnapshotStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const snapshotStorage = browserStorage();
const loadedSnapshot = snapshotStorage
  ? loadLabSnapshot(snapshotStorage)
  : { state: createInitialLabState(), status: "unavailable" as const, message: "Local recovery is unavailable; using a clean workspace." };
if (loadedSnapshot.status === "invalid" || loadedSnapshot.status === "stale") {
  discardLabSnapshot(snapshotStorage);
}
persistenceRuntime.set(
  persistenceStateForLoad(loadedSnapshot.status),
  loadedSnapshot.message,
);

export const labStore = createLabStore(loadedSnapshot.state);

let runSequence = loadedSnapshot.state.events.filter(
  (event) => event.type === "BASELINE_RUN_STARTED"
    || event.type === "CANDIDATE_RUN_STARTED",
).length;

export const labCommands = createCommandService({
  store: labStore,
  ids: {
    nextRunId(kind, state) {
      runSequence += 1;
      return `${state.missionId}-${kind}-${runSequence}`;
    },
  },
  effects: scenarioEffects,
});

labStore.subscribe(() => {
  const state = labStore.getState();
  if (saveLabSnapshot(snapshotStorage, state)) {
    persistenceRuntime.set(
      "saved",
      `Saved local revision ${state.revision} for ${state.missionId}.`,
    );
  } else {
    persistenceRuntime.set(
      snapshotStorage ? "error" : "unavailable",
      "The stable workspace is in memory, but local recovery could not be updated.",
    );
  }
});
