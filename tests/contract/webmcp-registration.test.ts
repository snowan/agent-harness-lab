import { describe, expect, it, vi } from "vitest";
import { WEBMCP_TOOL_NAMES } from "../../src/webmcp/contracts";
import type { WebMcpExecutor } from "../../src/webmcp/execute";
import { registerWebMcpTools } from "../../src/webmcp/register";
import { createWebMcpRuntimeStore } from "../../src/webmcp/status";
import type {
  WebMcpModelContext,
  WebMcpRegisterOptions,
  WebMcpTool,
} from "../../src/webmcp/types";

class FakeModelContext implements WebMcpModelContext {
  readonly tools = new Map<string, WebMcpTool>();
  readonly options = new Map<string, WebMcpRegisterOptions | undefined>();

  constructor(private readonly failOn?: string) {}

  async registerTool(tool: WebMcpTool, options?: WebMcpRegisterOptions): Promise<void> {
    if (tool.name === this.failOn) throw new Error("registration rejected");
    this.tools.set(tool.name, tool);
    this.options.set(tool.name, options);
    options?.signal?.addEventListener("abort", () => {
      this.tools.delete(tool.name);
      this.options.delete(tool.name);
    }, { once: true });
  }
}

function documentWith(modelContext?: FakeModelContext): Document {
  return (modelContext ? { modelContext } : {}) as Document;
}

function executor() {
  const execute = vi.fn<WebMcpExecutor["execute"]>(async (name) => ({
    ok: true as const,
    tool: name,
    data: { called: true },
  }));
  return { execute } satisfies WebMcpExecutor;
}

describe("WebMCP registration lifecycle", () => {
  it("registers all eight same-page tools and unregisters them with one abort", async () => {
    const modelContext = new FakeModelContext();
    const runtime = createWebMcpRuntimeStore();
    const calls = executor();
    const registration = registerWebMcpTools({
      document: documentWith(modelContext),
      executor: calls,
      runtime,
    });

    await expect(registration.ready).resolves.toEqual({
      supported: true,
      registeredCount: 8,
      state: "ready",
    });
    expect([...modelContext.tools.keys()]).toEqual(WEBMCP_TOOL_NAMES);
    expect(runtime.getSnapshot()).toMatchObject({ registration: "ready", registeredCount: 8 });

    for (const options of modelContext.options.values()) {
      expect(options?.signal).toBe(registration.signal);
      expect(options?.exposedTo).toBeUndefined();
    }

    const tool = modelContext.tools.get("get_lab_state");
    if (!tool) throw new Error("Expected get_lab_state to register.");
    const controller = new AbortController();
    await tool.execute({}, { signal: controller.signal });
    expect(calls.execute).toHaveBeenCalledWith(
      "get_lab_state",
      {},
      { signal: controller.signal },
    );

    registration.abort();
    expect(modelContext.tools.size).toBe(0);
    expect(runtime.getSnapshot()).toMatchObject({ registration: "stopped", registeredCount: 0 });
  });

  it("keeps manual mode available when the browser has no model context", async () => {
    const runtime = createWebMcpRuntimeStore();
    const registration = registerWebMcpTools({
      document: documentWith(),
      executor: executor(),
      runtime,
    });
    await expect(registration.ready).resolves.toEqual({
      supported: false,
      registeredCount: 0,
      state: "unavailable",
    });
    expect(runtime.getSnapshot()).toMatchObject({
      registration: "unavailable",
      registeredCount: 0,
      message: expect.stringContaining("Manual controls remain fully functional"),
    });
  });

  it("fails closed and removes partial registrations", async () => {
    const modelContext = new FakeModelContext("stage_harness_patch");
    const runtime = createWebMcpRuntimeStore();
    const registration = registerWebMcpTools({
      document: documentWith(modelContext),
      executor: executor(),
      runtime,
    });
    await expect(registration.ready).resolves.toEqual({
      supported: true,
      registeredCount: 0,
      state: "error",
    });
    expect(modelContext.tools.size).toBe(0);
    expect(runtime.getSnapshot()).toMatchObject({ registration: "error", registeredCount: 0 });
  });
});
