import type { HumanDecision } from "../domain/types";
import type { FactValue, SignalName } from "../scenarios/types";

export const RECEIPT_SCHEMA_VERSION = "1.0.0" as const;

export interface ReceiptFact {
  readonly id: string;
  readonly sequence: number;
  readonly key: string;
  readonly label: string;
  readonly value: FactValue;
  readonly detail: string;
}

export interface ReceiptAssertion {
  readonly id: string;
  readonly assertionId: string;
  readonly signal: SignalName;
  readonly graderVersion: "1.0.0";
  readonly title: string;
  readonly status: "passed" | "failed" | "not_applicable";
  readonly expected: FactValue;
  readonly actual: FactValue;
  readonly message: string;
  readonly evidenceFactIds: readonly string[];
}

export interface ReceiptRun {
  readonly id: string;
  readonly role: "baseline" | "candidate";
  readonly trialId: string;
  readonly trialKind: "target" | "sealed";
  readonly status: "passed" | "failed_as_expected" | "failed" | "unexpected_pass";
  readonly expectationMet: boolean;
  readonly initialStateDigest: string;
  readonly facts: readonly ReceiptFact[];
  readonly assertions: readonly ReceiptAssertion[];
  readonly resultDigest: string;
}

export interface ReceiptSignalSide {
  readonly passed: number;
  readonly failed: number;
  readonly notApplicable: number;
  readonly assertionResultIds: readonly string[];
  readonly evidenceFactIds: readonly string[];
}

export interface ReceiptSignal {
  readonly name: SignalName;
  readonly baseline: ReceiptSignalSide;
  readonly candidate: ReceiptSignalSide;
}

export interface ReceiptProvenanceEvent {
  readonly id: string;
  readonly commandId: string;
  readonly type: string;
  readonly actor: "human" | "agent" | "system";
  readonly source: "ui" | "webmcp" | "bootstrap" | "test";
}

export interface EvidenceReceiptPayload {
  readonly schemaVersion: typeof RECEIPT_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly fixture: {
    readonly kind: "built-in-deterministic";
    readonly deterministic: true;
    readonly disclosure: string;
  };
  readonly scenario: {
    readonly id: string;
    readonly version: string;
    readonly title: string;
    readonly invariant: string;
  };
  readonly harnesses: {
    readonly baseline: { readonly id: string; readonly version: string };
    readonly candidate: { readonly id: string; readonly version: string };
  };
  readonly candidate: {
    readonly id: string;
    readonly layer: string;
    readonly diff: readonly string[];
    readonly diffDigest: string;
    readonly evaluatedPatchDigest: string;
    readonly hypothesis: string;
  };
  readonly runs: {
    readonly baseline: ReceiptRun;
    readonly target: ReceiptRun;
    readonly sealed: readonly ReceiptRun[];
    readonly suite: {
      readonly id: string;
      readonly status: "passed" | "failed";
      readonly resultDigest: string;
    };
  };
  readonly signals: readonly ReceiptSignal[];
  readonly unresolvedRisks: readonly string[];
  readonly limitations: readonly string[];
  readonly decision: HumanDecision | null;
  readonly provenance: {
    readonly events: readonly ReceiptProvenanceEvent[];
  };
}

export interface EvidenceReceipt extends EvidenceReceiptPayload {
  readonly receiptDigest: string;
}
