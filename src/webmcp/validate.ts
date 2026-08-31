import type { ScenarioId } from "../domain/types";
import type { WebMcpToolName } from "./contracts";

export class WebMcpInputError extends Error {
  readonly code = "INVALID_INPUT" as const;

  constructor(message: string) {
    super(message);
    this.name = "WebMcpInputError";
  }
}

interface RetryInput {
  readonly requestId?: string;
}

export type ParsedWebMcpInput =
  | { readonly name: "get_lab_state"; readonly value: Record<string, never> }
  | {
      readonly name: "load_mission";
      readonly value: RetryInput & { readonly missionId: ScenarioId };
    }
  | { readonly name: "run_baseline"; readonly value: RetryInput }
  | {
      readonly name: "inspect_trace";
      readonly value: {
        readonly run: "baseline" | "candidate";
        readonly offset: number;
        readonly limit: number;
      };
    }
  | {
      readonly name: "stage_harness_patch";
      readonly value: RetryInput & { readonly hypothesis?: string };
    }
  | { readonly name: "run_candidate_suite"; readonly value: RetryInput }
  | { readonly name: "compare_harnesses"; readonly value: Record<string, never> }
  | { readonly name: "export_evidence_receipt"; readonly value: Record<string, never> };

function asInputRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new WebMcpInputError("Tool input must be a JSON object.");
  }
  return input as Record<string, unknown>;
}

function assertOnlyKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new WebMcpInputError(
      `Unknown input field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`,
    );
  }
}

function optionalRequestId(input: Record<string, unknown>): RetryInput {
  if (!("request_id" in input)) return {};
  const value = input.request_id;
  if (typeof value !== "string") {
    throw new WebMcpInputError("request_id must be a string when provided.");
  }
  const requestId = value;
  if (
    requestId.length < 1
    || requestId.length > 64
    || !/^[A-Za-z0-9._-]+$/.test(requestId)
  ) {
    throw new WebMcpInputError(
      "request_id must contain 1 to 64 letters, numbers, dots, underscores, or hyphens.",
    );
  }
  return { requestId };
}

function integerInRange(
  value: unknown,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new WebMcpInputError(
      `${name} must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return value as number;
}

export function parseWebMcpInput(
  name: WebMcpToolName,
  rawInput: unknown,
): ParsedWebMcpInput {
  const input = asInputRecord(rawInput);
  switch (name) {
    case "get_lab_state":
    case "compare_harnesses":
    case "export_evidence_receipt":
      assertOnlyKeys(input, []);
      return { name, value: {} } as ParsedWebMcpInput;

    case "load_mission": {
      assertOnlyKeys(input, ["mission_id", "request_id"]);
      const missionId = input.mission_id;
      if (
        missionId !== "completion"
        && missionId !== "handoff"
        && missionId !== "retry"
        && missionId !== "authority"
      ) {
        throw new WebMcpInputError(
          "mission_id must be completion, handoff, retry, or authority.",
        );
      }
      return {
        name,
        value: { missionId, ...optionalRequestId(input) },
      };
    }

    case "run_baseline":
    case "run_candidate_suite":
      assertOnlyKeys(input, ["request_id"]);
      return { name, value: optionalRequestId(input) };

    case "inspect_trace": {
      assertOnlyKeys(input, ["run", "offset", "limit"]);
      if (input.run !== "baseline" && input.run !== "candidate") {
        throw new WebMcpInputError("run must be baseline or candidate.");
      }
      return {
        name,
        value: {
          run: input.run,
          offset: integerInRange(input.offset, 0, "offset", 0, 100),
          limit: integerInRange(input.limit, 3, "limit", 1, 3),
        },
      };
    }

    case "stage_harness_patch": {
      assertOnlyKeys(input, ["hypothesis", "request_id"]);
      const retry = optionalRequestId(input);
      if (!("hypothesis" in input)) return { name, value: retry };
      if (typeof input.hypothesis !== "string") {
        throw new WebMcpInputError("hypothesis must be a string when provided.");
      }
      const hypothesis = input.hypothesis.trim();
      if (!hypothesis || hypothesis.length > 280) {
        throw new WebMcpInputError(
          "hypothesis must contain 1 to 280 non-whitespace characters.",
        );
      }
      return { name, value: { hypothesis, ...retry } };
    }
  }
}
