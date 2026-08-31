import type { WebMcpToolName } from "./contracts";

export type WebMcpRegistrationState =
  | "detecting"
  | "unavailable"
  | "registering"
  | "ready"
  | "error"
  | "stopped";

export interface WebMcpCallStatus {
  readonly tool: WebMcpToolName;
  readonly state: "running" | "succeeded" | "failed";
  readonly message: string;
}

export interface WebMcpRuntimeSnapshot {
  readonly registration: WebMcpRegistrationState;
  readonly registeredCount: number;
  readonly totalCount: 8;
  readonly message: string;
  readonly lastCall: WebMcpCallStatus | null;
}

export interface WebMcpRuntimeStore {
  readonly getSnapshot: () => WebMcpRuntimeSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setRegistration: (
    registration: WebMcpRegistrationState,
    registeredCount: number,
    message: string,
  ) => void;
  readonly setCall: (call: WebMcpCallStatus) => void;
}

export function createWebMcpRuntimeStore(): WebMcpRuntimeStore {
  let snapshot: WebMcpRuntimeSnapshot = {
    registration: "detecting",
    registeredCount: 0,
    totalCount: 8,
    message: "Checking this browser for WebMCP support.",
    lastCall: null,
  };
  const listeners = new Set<() => void>();

  function publish(next: WebMcpRuntimeSnapshot): void {
    snapshot = next;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Transient adapter diagnostics must not change command or registration outcomes.
      }
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setRegistration(registration, registeredCount, message) {
      publish({ ...snapshot, registration, registeredCount, message });
    },
    setCall(call) {
      publish({ ...snapshot, lastCall: call });
    },
  };
}

export const webMcpRuntime = createWebMcpRuntimeStore();
