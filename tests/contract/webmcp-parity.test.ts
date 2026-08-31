import { describe, expect, it } from "vitest";
import { completionWithoutProofScenario } from "../../src/scenarios/completion-without-proof";
import { createWebMcpHarness } from "./test-harness";

describe("UI and WebMCP parity", () => {
  it("produces equal normalized domain snapshots through the compared state", async () => {
    const ui = createWebMcpHarness();
    const webmcp = createWebMcpHarness();
    const hypothesis = "The same fixed patch should produce the same causal evidence.";

    await ui.commands.dispatch(
      { type: "RUN_BASELINE" },
      { commandId: "ui-baseline", actor: "human", source: "ui" },
    );
    await ui.commands.dispatch(
      {
        type: "STAGE_PATCH",
        patch: {
          id: completionWithoutProofScenario.candidate.patch.id,
          layer: completionWithoutProofScenario.candidate.patch.layer,
          diff: completionWithoutProofScenario.candidate.patch.diff,
          hypothesis,
        },
      },
      { commandId: "ui-stage", actor: "human", source: "ui" },
    );
    await ui.commands.dispatch(
      { type: "RUN_CANDIDATE_SUITE" },
      { commandId: "ui-suite", actor: "human", source: "ui" },
    );

    await webmcp.executor.execute("run_baseline", { request_id: "agent-baseline" });
    await webmcp.executor.execute("stage_harness_patch", {
      request_id: "agent-stage",
      hypothesis,
    });
    await webmcp.executor.execute("run_candidate_suite", { request_id: "agent-suite" });

    const { events: uiEvents, ...uiSnapshot } = ui.store.getState();
    const { events: agentEvents, ...agentSnapshot } = webmcp.store.getState();
    expect(agentSnapshot).toEqual(uiSnapshot);
    expect(agentEvents.map((event) => event.type)).toEqual(
      uiEvents.map((event) => event.type),
    );
    expect(uiEvents.every((event) => event.actor === "human" && event.source === "ui")).toBe(true);
    expect(agentEvents.every((event) => event.actor === "agent" && event.source === "webmcp")).toBe(true);
  });
});
