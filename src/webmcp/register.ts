import {
  WEBMCP_TOOL_CONTRACTS,
  type WebMcpToolName,
} from "./contracts";
import type { WebMcpExecutor } from "./execute";
import type { WebMcpRuntimeStore } from "./status";
import { webMcpRuntime } from "./status";
import type {
  DocumentWithModelContext,
  WebMcpModelContext,
  WebMcpTool,
} from "./types";

export interface WebMcpRegistrationResult {
  readonly supported: boolean;
  readonly registeredCount: number;
  readonly state: "unavailable" | "ready" | "error" | "stopped";
}

export interface WebMcpRegistration {
  readonly ready: Promise<WebMcpRegistrationResult>;
  readonly abort: () => void;
  readonly signal: AbortSignal;
}

interface RegisterWebMcpDependencies {
  readonly document: Document;
  readonly executor: WebMcpExecutor;
  readonly runtime?: WebMcpRuntimeStore;
}

function detectModelContext(documentRef: Document): WebMcpModelContext | null {
  const modelContext = (documentRef as DocumentWithModelContext).modelContext;
  return typeof modelContext?.registerTool === "function" ? modelContext : null;
}

function toRegisteredTool(
  name: WebMcpToolName,
  executor: WebMcpExecutor,
): WebMcpTool {
  const contract = WEBMCP_TOOL_CONTRACTS.find((candidate) => candidate.name === name);
  if (!contract) throw new Error(`Missing WebMCP contract ${name}.`);
  return {
    name: contract.name,
    title: contract.title,
    description: contract.description,
    inputSchema: contract.inputSchema,
    annotations: contract.annotations,
    async execute(input, options) {
      return executor.execute(name, input, { signal: options.signal });
    },
  };
}

export function registerWebMcpTools({
  document: documentRef,
  executor,
  runtime = webMcpRuntime,
}: RegisterWebMcpDependencies): WebMcpRegistration {
  const controller = new AbortController();
  const modelContext = detectModelContext(documentRef);
  let stopped = false;

  function abort(): void {
    if (stopped) return;
    stopped = true;
    controller.abort();
    runtime.setRegistration(
      "stopped",
      0,
      "WebMCP tools were unregistered from this page lifecycle.",
    );
  }

  if (!modelContext) {
    runtime.setRegistration(
      "unavailable",
      0,
      "WebMCP is unavailable in this browser. Manual controls remain fully functional.",
    );
    return {
      signal: controller.signal,
      abort,
      ready: Promise.resolve({
        supported: false,
        registeredCount: 0,
        state: "unavailable",
      }),
    };
  }

  runtime.setRegistration(
    "registering",
    0,
    `Registering ${WEBMCP_TOOL_CONTRACTS.length} page-local tools.`,
  );

  const ready = (async (): Promise<WebMcpRegistrationResult> => {
    let registeredCount = 0;
    try {
      for (const contract of WEBMCP_TOOL_CONTRACTS) {
        await modelContext.registerTool(
          toRegisteredTool(contract.name, executor),
          { signal: controller.signal },
        );
        registeredCount += 1;
        runtime.setRegistration(
          "registering",
          registeredCount,
          `Registered ${registeredCount} of ${WEBMCP_TOOL_CONTRACTS.length} page-local tools.`,
        );
      }
      if (controller.signal.aborted) {
        return { supported: true, registeredCount: 0, state: "stopped" };
      }
      runtime.setRegistration(
        "ready",
        registeredCount,
        `${registeredCount} WebMCP tools are ready. Promotion and rejection remain human-only.`,
      );
      return { supported: true, registeredCount, state: "ready" };
    } catch {
      controller.abort();
      if (stopped) {
        return { supported: true, registeredCount: 0, state: "stopped" };
      }
      runtime.setRegistration(
        "error",
        0,
        "WebMCP registration failed closed. No partial tool surface remains; manual controls still work.",
      );
      return { supported: true, registeredCount: 0, state: "error" };
    }
  })();

  return { ready, abort, signal: controller.signal };
}
