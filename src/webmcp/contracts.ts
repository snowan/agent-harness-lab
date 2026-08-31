import type { JsonSchema, WebMcpToolAnnotations } from "./types";

export const WEBMCP_TOOL_NAMES = [
  "get_lab_state",
  "load_mission",
  "run_baseline",
  "inspect_trace",
  "stage_harness_patch",
  "run_candidate_suite",
  "compare_harnesses",
  "export_evidence_receipt",
] as const;

export type WebMcpToolName = (typeof WEBMCP_TOOL_NAMES)[number];
export type WebMcpToolMode = "read" | "command";

export interface WebMcpToolContract {
  readonly name: WebMcpToolName;
  readonly title: string;
  readonly mode: WebMcpToolMode;
  readonly summary: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly annotations: WebMcpToolAnnotations;
}

const emptyInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const requestIdProperty = {
  type: "string",
  minLength: 1,
  maxLength: 64,
  pattern: "^[A-Za-z0-9._-]+$",
  description: "Optional retry key. Reuse only for the same command and arguments.",
} as const;

export const WEBMCP_TOOL_CONTRACTS: readonly WebMcpToolContract[] = [
  {
    name: "get_lab_state",
    title: "Get lab state",
    mode: "read",
    summary: "Read the current mission, legal phase, run status, candidate, and decision boundary.",
    description: "Read a bounded summary of the selected mission, stable revision, completed runs, staged candidate, decision, and recommended next agent actions.",
    inputSchema: emptyInputSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "load_mission",
    title: "Load mission",
    mode: "command",
    summary: "Select one built-in harness failure fixture and start a clean workspace.",
    description: "Load one of the four built-in deterministic harness failure missions into a clean local workspace.",
    inputSchema: {
      type: "object",
      properties: {
        mission_id: {
          type: "string",
          enum: ["completion", "handoff", "retry", "authority"],
          description: "Stable ID of a built-in mission.",
        },
        request_id: requestIdProperty,
      },
      required: ["mission_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
  },
  {
    name: "run_baseline",
    title: "Run baseline",
    mode: "command",
    summary: "Replay the original harness against the selected deterministic target fixture.",
    description: "Replay the original harness against the selected deterministic target fixture and record its expected invariant failure in the visible workspace.",
    inputSchema: {
      type: "object",
      properties: { request_id: requestIdProperty },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
  },
  {
    name: "inspect_trace",
    title: "Inspect trace",
    mode: "read",
    summary: "Read a bounded slice of observable facts from a completed baseline or candidate run.",
    description: "Read up to three ordered, observable fixture facts from a completed baseline or candidate target run. Use offset to page without requesting the full trace.",
    inputSchema: {
      type: "object",
      properties: {
        run: {
          type: "string",
          enum: ["baseline", "candidate"],
          description: "Completed target run to inspect.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "Zero-based fact offset. Defaults to 0.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 3,
          description: "Fact count from 1 to 3. Defaults to 3.",
        },
      },
      required: ["run"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
  },
  {
    name: "stage_harness_patch",
    title: "Stage harness patch",
    mode: "command",
    summary: "Stage the declared fixture patch with one reviewable causal hypothesis.",
    description: "Stage the selected mission's fixed fixture patch with an optional causal hypothesis. This tool cannot change the declared diff, promote, or deploy.",
    inputSchema: {
      type: "object",
      properties: {
        hypothesis: {
          type: "string",
          minLength: 1,
          maxLength: 280,
          description: "Causal explanation for why the fixed patch should change behavior.",
        },
        request_id: requestIdProperty,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
  },
  {
    name: "run_candidate_suite",
    title: "Run candidate suite",
    mode: "command",
    summary: "Run the staged candidate against the target and two sealed regression fixtures.",
    description: "Run the staged candidate against the selected mission's target and two sealed local fixtures, then publish the derived five-signal comparison.",
    inputSchema: {
      type: "object",
      properties: { request_id: requestIdProperty },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
  },
  {
    name: "compare_harnesses",
    title: "Compare harnesses",
    mode: "read",
    summary: "Compare activation, adherence, outcome, evidence, safety, and remaining risks.",
    description: "Read the bounded five-signal comparison for the completed baseline and candidate suite, including sealed results, risks, and fixture limitations.",
    inputSchema: emptyInputSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: false },
  },
  {
    name: "export_evidence_receipt",
    title: "Read receipt summary",
    mode: "read",
    summary: "Return a bounded digest-bearing receipt summary without downloading or deciding.",
    description: "Build and validate the formal receipt, then return its bounded digest-bearing summary. This read does not download, promote, reject, or deploy anything.",
    inputSchema: emptyInputSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: false },
  },
] as const;

export function getWebMcpContract(name: WebMcpToolName): WebMcpToolContract {
  const contract = WEBMCP_TOOL_CONTRACTS.find((candidate) => candidate.name === name);
  if (!contract) throw new Error(`Unknown WebMCP tool ${name}.`);
  return contract;
}
