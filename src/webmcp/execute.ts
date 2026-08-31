import type { CommandService } from "../app/commands";
import type { LabStore } from "../app/create-store";
import { LabDomainError, isLabDomainError } from "../domain/errors";
import { getScenarioDefinition } from "../scenarios/registry";
import { buildEvidenceReceipt } from "../receipts/build-receipt";
import { verifyEvidenceReceipt } from "../receipts/validate-receipt";
import type { WebMcpToolName } from "./contracts";
import type { WebMcpRuntimeStore } from "./status";
import { webMcpRuntime } from "./status";
import { parseWebMcpInput, WebMcpInputError } from "./validate";
import {
  selectWebMcpComparisonView,
  selectWebMcpMutationView,
  selectWebMcpReceiptView,
  selectWebMcpSafeStateView,
  selectWebMcpStateView,
  selectWebMcpTraceView,
} from "./views";

export const WEBMCP_OUTPUT_BUDGET = 1_500;

export type WebMcpExecutionResult =
  | {
      readonly ok: true;
      readonly tool: WebMcpToolName;
      readonly data: unknown;
    }
  | {
      readonly ok: false;
      readonly tool: WebMcpToolName;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
      readonly safeState: ReturnType<typeof selectWebMcpSafeStateView>;
    };

export interface WebMcpExecutor {
  readonly execute: (
    name: WebMcpToolName,
    input: unknown,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<WebMcpExecutionResult>;
}

interface WebMcpExecutorDependencies {
  readonly store: LabStore;
  readonly commands: CommandService;
  readonly runtime?: WebMcpRuntimeStore;
  readonly now?: () => string;
  readonly buildReceipt?: typeof buildEvidenceReceipt;
  readonly verifyReceipt?: typeof verifyEvidenceReceipt;
}

function abortIfRequested(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new LabDomainError(
      "COMMAND_ABORTED",
      "The WebMCP call was cancelled before it changed the stable workspace.",
    );
  }
}

function boundedMessage(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length <= 320 ? compact : `${compact.slice(0, 319)}…`;
}

function serializedLength(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("WebMCP output was not JSON serializable.");
  }
  return serialized.length;
}

function enforceOutputBudget<T>(value: T): T {
  if (serializedLength(value) > WEBMCP_OUTPUT_BUDGET) {
    throw new Error("WebMCP output exceeded the external response budget.");
  }
  return value;
}

function failureDetails(error: unknown): { readonly code: string; readonly message: string } {
  if (isLabDomainError(error) || error instanceof WebMcpInputError) {
    return { code: error.code, message: boundedMessage(error.message) };
  }
  return {
    code: "COMMAND_FAILED",
    message: "The tool could not complete. The stable workspace was not changed.",
  };
}

function successMessage(name: WebMcpToolName, revision: number): string {
  switch (name) {
    case "get_lab_state": return `Read stable revision ${revision}.`;
    case "load_mission": return `Loaded a clean mission at revision ${revision}.`;
    case "run_baseline": return `Recorded baseline evidence at revision ${revision}.`;
    case "inspect_trace": return `Read a bounded trace slice at revision ${revision}.`;
    case "stage_harness_patch": return `Staged the fixture patch at revision ${revision}.`;
    case "run_candidate_suite": return `Recorded target and sealed evidence at revision ${revision}.`;
    case "compare_harnesses": return `Read the five-signal comparison at revision ${revision}.`;
    case "export_evidence_receipt": return `Prepared a bounded evidence receipt at revision ${revision}.`;
  }
}

export function createWebMcpExecutor({
  store,
  commands,
  runtime = webMcpRuntime,
  now = () => new Date().toISOString(),
  buildReceipt = buildEvidenceReceipt,
  verifyReceipt = verifyEvidenceReceipt,
}: WebMcpExecutorDependencies): WebMcpExecutor {
  let automaticSequence = store.getState().events.reduce((maximum, event) => {
    const match = /^webmcp:[^:]+:auto-(\d+)$/.exec(event.commandId);
    return match?.[1] ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);

  function commandId(
    name: WebMcpToolName,
    requestId: string | undefined,
  ): string {
    if (requestId) return `webmcp:${name}:request-${requestId}`;
    automaticSequence += 1;
    return `webmcp:${name}:auto-${automaticSequence}`;
  }

  async function dispatch(
    name: WebMcpToolName,
    requestId: string | undefined,
    command: Parameters<CommandService["dispatch"]>[0],
    signal?: AbortSignal,
  ) {
    return commands.dispatch(command, {
      commandId: commandId(name, requestId),
      actor: "agent",
      source: "webmcp",
      ...(signal ? { signal } : {}),
    });
  }

  return {
    async execute(name, input, options = {}) {
      runtime.setCall({
        tool: name,
        state: "running",
        message: `Agent call ${name} is running against the local fixture workspace.`,
      });
      try {
        abortIfRequested(options.signal);
        const parsed = parseWebMcpInput(name, input);
        const data = await (async () => {
          switch (parsed.name) {
            case "get_lab_state":
              return selectWebMcpStateView(store.getState());

            case "load_mission":
              return selectWebMcpMutationView(await dispatch(
                parsed.name,
                parsed.value.requestId,
                { type: "LOAD_MISSION", missionId: parsed.value.missionId },
                options.signal,
              ));

            case "run_baseline":
              return selectWebMcpMutationView(await dispatch(
                parsed.name,
                parsed.value.requestId,
                { type: "RUN_BASELINE" },
                options.signal,
              ));

            case "inspect_trace":
              abortIfRequested(options.signal);
              return selectWebMcpTraceView(
                store.getState(),
                parsed.value.run,
                parsed.value.offset,
                parsed.value.limit,
              );

            case "stage_harness_patch": {
              const state = store.getState();
              const scenario = getScenarioDefinition(state.missionId);
              if (!scenario) {
                throw new LabDomainError(
                  "COMMAND_FAILED",
                  `No executable candidate fixture is registered for ${state.missionId}.`,
                );
              }
              return selectWebMcpMutationView(await dispatch(
                parsed.name,
                parsed.value.requestId,
                {
                  type: "STAGE_PATCH",
                  patch: {
                    id: scenario.candidate.patch.id,
                    layer: scenario.candidate.patch.layer,
                    diff: scenario.candidate.patch.diff,
                    hypothesis: parsed.value.hypothesis
                      ?? scenario.candidate.patch.hypothesis,
                  },
                },
                options.signal,
              ));
            }

            case "run_candidate_suite":
              return selectWebMcpMutationView(await dispatch(
                parsed.name,
                parsed.value.requestId,
                { type: "RUN_CANDIDATE_SUITE" },
                options.signal,
              ));

            case "compare_harnesses":
              abortIfRequested(options.signal);
              return selectWebMcpComparisonView(store.getState());

            case "export_evidence_receipt":
              abortIfRequested(options.signal);
              {
                const receiptState = store.getState();
                const receiptRevision = receiptState.revision;
                const receipt = await buildReceipt(receiptState, now());
                const validation = await verifyReceipt(receipt);
                if (!validation.valid) {
                  throw new Error("The formal evidence receipt failed local validation.");
                }
                if (store.getState().revision !== receiptRevision) {
                  throw new LabDomainError(
                    "STALE_REVISION",
                    `Receipt export started at revision ${receiptRevision}, but the workspace changed before validation completed. Export the latest comparison again.`,
                  );
                }
                return selectWebMcpReceiptView(receiptState, receipt);
              }
          }
        })();
        const revision = store.getState().revision;
        const result = enforceOutputBudget({ ok: true, tool: name, data } as const);
        runtime.setCall({
          tool: name,
          state: "succeeded",
          message: successMessage(name, revision),
        });
        return result;
      } catch (error) {
        const details = failureDetails(error);
        runtime.setCall({
          tool: name,
          state: "failed",
          message: `${details.code}: ${details.message}`,
        });
        return enforceOutputBudget({
          ok: false,
          tool: name,
          error: details,
          safeState: selectWebMcpSafeStateView(store.getState()),
        } as const);
      }
    },
  };
}
