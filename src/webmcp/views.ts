import { LabDomainError } from "../domain/errors";
import type { CommandResult, LabState } from "../domain/types";
import { getScenarioDefinition, isScenarioImplemented } from "../scenarios/registry";
import type { SignalSummary } from "../scenarios/types";
import {
  selectCurrentWorkspaceEvents,
  selectHarnessComparison,
  selectRunTraces,
} from "../app/selectors";

function score(signal: SignalSummary): string {
  return `${signal.passed}/${signal.passed + signal.failed}`;
}

const EXTERNAL_HYPOTHESIS_BUDGET = 128;

function recommendedAgentActions(state: LabState): readonly string[] {
  if (!isScenarioImplemented(state.missionId)) return ["load_mission", "get_lab_state"];
  switch (state.phase) {
    case "mission_loaded":
      return ["run_baseline", "get_lab_state"];
    case "baseline_running":
    case "candidate_running":
      return ["get_lab_state"];
    case "baseline_failed":
      return ["inspect_trace", "stage_harness_patch", "get_lab_state"];
    case "patch_staged":
      return ["inspect_trace", "run_candidate_suite", "get_lab_state"];
    case "compared":
    case "promoted":
    case "rejected":
      return [
        "inspect_trace",
        "compare_harnesses",
        "export_evidence_receipt",
        "get_lab_state",
      ];
  }
}

function hypothesisExcerpt(value: string) {
  let excerpt = "";
  let serializedCharacters = 0;
  let truncated = false;
  for (const symbol of value) {
    const symbolCost = JSON.stringify(symbol).length - 2;
    if (serializedCharacters + symbolCost > EXTERNAL_HYPOTHESIS_BUDGET) {
      truncated = true;
      break;
    }
    excerpt += symbol;
    serializedCharacters += symbolCost;
  }
  return { excerpt, truncated } as const;
}

export function selectWebMcpStateView(state: LabState) {
  const projectedHypothesis = state.candidate
    ? hypothesisExcerpt(state.candidate.hypothesis)
    : null;
  return {
    schemaVersion: state.schemaVersion,
    workspaceId: state.workspaceId,
    missionId: state.missionId,
    phase: state.phase,
    revision: state.revision,
    runs: {
      baseline: state.baselineResult
        ? {
            id: state.baselineResult.id,
            status: state.baselineResult.status,
            digest: state.baselineResult.resultDigest,
          }
        : null,
      candidateSuite: state.candidateSuiteResult
        ? {
            id: state.candidateSuiteResult.id,
            status: state.candidateSuiteResult.status,
            digest: state.candidateSuiteResult.resultDigest,
          }
        : null,
    },
    candidate: state.candidate
      ? {
          id: state.candidate.id,
          layer: state.candidate.layer,
          hypothesisExcerpt: projectedHypothesis?.excerpt ?? "",
          hypothesisTruncated: projectedHypothesis?.truncated ?? false,
        }
      : null,
    decision: state.decision,
    recommendedAgentActions: recommendedAgentActions(state),
    promotionIsHumanOnly: true,
  } as const;
}

export function selectWebMcpSafeStateView(state: LabState) {
  return {
    missionId: state.missionId,
    phase: state.phase,
    revision: state.revision,
    baselineComplete: state.baselineResult !== null,
    candidateStaged: state.candidate !== null,
    candidateSuiteComplete: state.candidateSuiteResult !== null,
    decision: state.decision,
    recommendedAgentActions: recommendedAgentActions(state),
    promotionIsHumanOnly: true,
  } as const;
}

export function selectWebMcpMutationView(result: CommandResult) {
  return {
    missionId: result.state.missionId,
    phase: result.state.phase,
    revision: result.state.revision,
    replayed: result.replayed,
    eventTypes: result.events.map((event) => event.type),
    baselineStatus: result.state.baselineResult?.status ?? null,
    candidateSuiteStatus: result.state.candidateSuiteResult?.status ?? null,
    promotionIsHumanOnly: true,
  } as const;
}

export function selectWebMcpTraceView(
  state: LabState,
  runRole: "baseline" | "candidate",
  offset: number,
  limit: number,
) {
  const traces = selectRunTraces(state);
  const trace = runRole === "baseline" ? traces.baseline : traces.candidate;
  if (!trace) {
    throw new LabDomainError(
      "ILLEGAL_TRANSITION",
      `${runRole === "baseline" ? "Baseline" : "Candidate"} trace is unavailable until that run completes.`,
    );
  }
  const facts = trace.facts.slice(offset, offset + limit);
  const nextOffset = offset + facts.length < trace.facts.length
    ? offset + facts.length
    : null;
  return {
    run: runRole,
    id: trace.id,
    status: trace.status,
    digest: trace.digest,
    totalFacts: trace.facts.length,
    offset,
    nextOffset,
    facts: facts.map((fact) => ({
      sequence: fact.sequence,
      id: fact.id,
      label: fact.label,
      value: fact.value,
      status: fact.status,
      assertionIds: fact.assertionIds,
    })),
  } as const;
}

export function selectWebMcpComparisonView(state: LabState) {
  const comparison = selectHarnessComparison(state);
  if (!comparison || !state.candidateSuiteResult) {
    throw new LabDomainError(
      "ILLEGAL_TRANSITION",
      "Harness comparison is unavailable until the candidate suite completes.",
    );
  }
  return {
    scenarioId: comparison.scenarioId,
    scenarioVersion: comparison.scenarioVersion,
    comparedRevision: state.decision?.comparedRevision ?? state.revision,
    suiteStatus: state.candidateSuiteResult.status,
    signals: comparison.signals.map((entry) => ({
      signal: entry.signal,
      baseline: score(entry.baseline),
      candidate: score(entry.candidate),
      assertionCount: entry.supportingAssertionResultIds.length,
      factCount: entry.supportingFactIds.length,
    })),
    sealed: {
      passed: comparison.sealedRuns.filter((run) => run.status === "passed").length,
      total: comparison.sealedRuns.length,
    },
    unresolvedRisks: comparison.unresolvedRisks,
    limitations: comparison.limitations,
    decision: state.decision,
    promotionIsHumanOnly: true,
  } as const;
}

export function selectWebMcpReceiptView(state: LabState) {
  const scenario = getScenarioDefinition(state.missionId);
  const comparison = selectHarnessComparison(state);
  const events = selectCurrentWorkspaceEvents(state, 16);
  const agentCommands = new Set(
    events.filter((event) => event.actor === "agent").map((event) => event.commandId),
  ).size;
  const humanCommands = new Set(
    events.filter((event) => event.actor === "human").map((event) => event.commandId),
  ).size;
  const projectedHypothesis = state.candidate
    ? hypothesisExcerpt(state.candidate.hypothesis)
    : null;
  return {
    schema: "agent-harness-lab-receipt/0.1",
    fixture: scenario !== null,
    fixtureDisclosure: scenario?.fixtureDisclosure
      ?? "Catalog entry only; no executable fixture is registered.",
    workspace: {
      revision: state.revision,
      phase: state.phase,
    },
    mission: {
      id: state.missionId,
      version: scenario?.version ?? null,
      title: scenario?.title ?? null,
    },
    harness: {
      baseline: scenario?.baseline.version ?? null,
      candidate: scenario?.candidate.version ?? null,
    },
    patch: state.candidate
      ? {
          id: state.candidate.id,
          layer: state.candidate.layer,
          hypothesisExcerpt: projectedHypothesis?.excerpt ?? "",
          hypothesisTruncated: projectedHypothesis?.truncated ?? false,
          evaluatedDigest: state.candidateSuiteResult?.evaluatedPatchDigest ?? null,
        }
      : null,
    evidence: {
      baselineDigest: state.baselineResult?.resultDigest ?? null,
      suiteDigest: state.candidateSuiteResult?.resultDigest ?? null,
      signals: {
        columns: ["baseline", "candidate"],
        scores: Object.fromEntries(
          comparison?.signals.map((entry) => [
            entry.signal,
            [score(entry.baseline), score(entry.candidate)],
          ]) ?? [],
        ),
      },
      sealedPassed: comparison
        ? `${comparison.sealedRuns.filter((run) => run.status === "passed").length}/${comparison.sealedRuns.length}`
        : null,
    },
    decision: state.decision,
    provenance: {
      agentCommands,
      humanCommands,
    },
    limitations: scenario?.limitations ?? ["No executable fixture for this catalog entry."],
    promotionIsHumanOnly: true,
  } as const;
}
