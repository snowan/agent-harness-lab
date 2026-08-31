import type { SnapshotLoadStatus } from "./snapshot";

export type PersistenceState = "clean" | "restored" | "saved" | "fallback" | "unavailable" | "error";

export interface PersistenceSnapshot {
  readonly state: PersistenceState;
  readonly message: string;
}

export interface PersistenceRuntimeStore {
  readonly getSnapshot: () => PersistenceSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly set: (state: PersistenceState, message: string) => void;
}

export function createPersistenceRuntimeStore(): PersistenceRuntimeStore {
  let snapshot: PersistenceSnapshot = {
    state: "clean",
    message: "Local workspace starts clean and saves after each stable revision.",
  };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(state, message) {
      snapshot = { state, message };
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          // Persistence diagnostics cannot change the stable workspace.
        }
      }
    },
  };
}

export function persistenceStateForLoad(status: SnapshotLoadStatus): PersistenceState {
  if (status === "restored") return "restored";
  if (status === "invalid" || status === "stale") return "fallback";
  if (status === "unavailable") return "unavailable";
  return "clean";
}

export const persistenceRuntime = createPersistenceRuntimeStore();
