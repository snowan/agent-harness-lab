import { LabDomainError } from "../domain/errors";
import type { DomainEvent, LabState } from "../domain/types";
import {
  canonicalSha256,
  compareHarnesses,
} from "../domain/evaluation";
import { getScenarioDefinition } from "../scenarios/registry";
import { deepFreeze, type SignalSummary, type TrialRun } from "../scenarios/types";
import {
  RECEIPT_SCHEMA_VERSION,
  type EvidenceReceipt,
  type EvidenceReceiptPayload,
  type ReceiptRun,
  type ReceiptSignalSide,
} from "./types";
import { receiptDigestPayload } from "./digest-payload";

function canonicalTimestamp(value: string): string {
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new LabDomainError(
      "INVALID_INPUT",
      "Receipt creation time must be a canonical ISO 8601 timestamp.",
    );
  }
  return value;
}

function receiptRun(run: TrialRun): ReceiptRun {
  return {
    id: run.id,
    role: run.harnessRole,
    trialId: run.trialId,
    trialKind: run.trialKind,
    status: run.status,
    expectationMet: run.expectationMet,
    initialStateDigest: run.initialStateDigest,
    facts: run.facts.map((fact) => ({
      id: fact.id,
      sequence: fact.sequence,
      key: fact.key,
      label: fact.label,
      value: fact.value,
      detail: fact.detail,
    })),
    assertions: run.assertions.map((assertion) => ({
      id: assertion.id,
      assertionId: assertion.assertionId,
      signal: assertion.signal,
      graderVersion: assertion.graderVersion,
      title: assertion.title,
      status: assertion.status,
      expected: assertion.expected,
      actual: assertion.actual,
      message: assertion.message,
      evidenceFactIds: assertion.evidenceFactIds,
    })),
    resultDigest: run.resultDigest,
  };
}

function receiptSignalSide(summary: SignalSummary): ReceiptSignalSide {
  return {
    passed: summary.passed,
    failed: summary.failed,
    notApplicable: summary.notApplicable,
    assertionResultIds: summary.assertionResultIds,
    evidenceFactIds: summary.evidenceFactIds,
  };
}

function currentWorkspaceEvents(events: readonly DomainEvent[]): readonly DomainEvent[] {
  let boundary = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "MISSION_LOADED" || event?.type === "WORKSPACE_RESET") {
      boundary = index;
      break;
    }
  }
  return events.slice(boundary);
}

export async function buildEvidenceReceipt(
  state: LabState,
  createdAt = new Date().toISOString(),
): Promise<EvidenceReceipt> {
  const scenario = getScenarioDefinition(state.missionId);
  const baseline = state.baselineResult;
  const suite = state.candidateSuiteResult;
  const candidate = state.candidate;
  const target = suite?.runs.find((run) => run.trialKind === "target");
  if (!scenario || !baseline || !suite || !candidate || !target) {
    throw new LabDomainError(
      "ILLEGAL_TRANSITION",
      "A formal evidence receipt requires a completed baseline and candidate comparison.",
    );
  }
  const comparison = compareHarnesses(baseline, suite);
  const payload: EvidenceReceiptPayload = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    createdAt: canonicalTimestamp(createdAt),
    fixture: {
      kind: "built-in-deterministic",
      deterministic: true,
      disclosure: scenario.fixtureDisclosure,
    },
    scenario: {
      id: scenario.id,
      version: scenario.version,
      title: scenario.title,
      invariant: scenario.invariant,
    },
    harnesses: {
      baseline: { id: scenario.baseline.id, version: scenario.baseline.version },
      candidate: { id: scenario.candidate.id, version: scenario.candidate.version },
    },
    candidate: {
      id: candidate.id,
      layer: candidate.layer,
      diff: candidate.diff,
      diffDigest: await canonicalSha256(candidate.diff),
      evaluatedPatchDigest: suite.evaluatedPatchDigest,
      hypothesis: candidate.hypothesis,
    },
    runs: {
      baseline: receiptRun(baseline),
      target: receiptRun(target),
      sealed: suite.runs
        .filter((run) => run.trialKind === "sealed")
        .map(receiptRun),
      suite: {
        id: suite.id,
        status: suite.status,
        resultDigest: suite.resultDigest,
      },
    },
    signals: comparison.signals.map((signal) => ({
      name: signal.signal,
      baseline: receiptSignalSide(signal.baseline),
      candidate: receiptSignalSide(signal.candidate),
    })),
    unresolvedRisks: comparison.unresolvedRisks,
    limitations: comparison.limitations,
    decision: state.decision,
    provenance: {
      events: currentWorkspaceEvents(state.events).map((event) => ({
        id: event.id,
        commandId: event.commandId,
        type: event.type,
        actor: event.actor,
        source: event.source,
      })),
    },
  };
  const receiptDigest = await canonicalSha256(receiptDigestPayload(payload));
  return deepFreeze({ ...payload, receiptDigest });
}
