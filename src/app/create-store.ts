import { LabDomainError } from "../domain/errors";
import type { LabState } from "../domain/types";

export type LabStoreListener = () => void;

export interface LabStoreOptions {
  readonly onListenerError?: (error: unknown) => void;
}

export interface LabStore {
  readonly getState: () => LabState;
  readonly subscribe: (listener: LabStoreListener) => () => void;
  readonly commit: (nextState: LabState) => void;
}

export function createLabStore(
  initialState: LabState,
  options: LabStoreOptions = {},
): LabStore {
  let state = initialState;
  const listeners = new Set<LabStoreListener>();

  function reportListenerError(error: unknown): void {
    try {
      if (options.onListenerError) {
        options.onListenerError(error);
        return;
      }
      console.error("A lab store subscriber failed after the revision committed.", error);
    } catch {
      // Subscriber diagnostics must never make a committed command appear to fail.
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    commit(nextState) {
      if (nextState.revision <= state.revision) {
        throw new LabDomainError(
          "STALE_REVISION",
          `Cannot commit revision ${nextState.revision} over revision ${state.revision}. Re-run the command against the current workspace.`,
        );
      }
      state = nextState;
      listeners.forEach((listener) => {
        try {
          listener();
        } catch (error) {
          reportListenerError(error);
        }
      });
    },
  };
}
