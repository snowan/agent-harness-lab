import { describe, expect, it, vi } from "vitest";
import { createLabStore } from "../../src/app/create-store";
import { reduceLabState } from "../../src/domain/reducer";
import { createInitialLabState } from "../../src/domain/types";

describe("lab store", () => {
  it("publishes committed revisions and supports unsubscribe", () => {
    const initial = createInitialLabState();
    const store = createLabStore(initial);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const next = reduceLabState(initial, {
      id: "load:0",
      commandId: "load",
      actor: "human",
      source: "test",
      type: "MISSION_LOADED",
      missionId: "handoff",
    });

    store.commit(next);
    unsubscribe();
    store.commit(reduceLabState(next, {
      id: "reset:0",
      commandId: "reset",
      actor: "human",
      source: "test",
      type: "WORKSPACE_RESET",
    }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().revision).toBe(2);
  });

  it("rejects a stale or equal revision", () => {
    const initial = createInitialLabState();
    const store = createLabStore(initial);

    expect(() => store.commit(initial)).toThrow(/Cannot commit revision 0/);
  });
});
