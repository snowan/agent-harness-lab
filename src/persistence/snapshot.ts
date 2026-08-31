import { canonicalJson } from "../domain/evaluation";
import { reduceLabEvents } from "../domain/reducer";
import {
  LAB_STATE_SCHEMA_VERSION,
  createInitialLabState,
  type Actor,
  type CommandSource,
  type DomainEvent,
  type LabState,
  type ScenarioId,
  type StableLabPhase,
} from "../domain/types";
import { FIXTURE_CATALOG_VERSION } from "../scenarios/registry";
import type {
  AssertionResult,
  RunFact,
  SignalSummary,
  SuiteRun,
  TrialRun,
} from "../scenarios/types";
import { SIGNAL_NAMES } from "../scenarios/types";

export const LAB_SNAPSHOT_KEY = "agent-harness-lab:workspace:v1";
export const LAB_SNAPSHOT_SCHEMA_VERSION = 1 as const;
const MAX_SNAPSHOT_CHARACTERS = 1_000_000;
const MAX_EVENTS = 128;

export interface StoredSnapshot {
  readonly schemaVersion: typeof LAB_SNAPSHOT_SCHEMA_VERSION;
  readonly fixtureCatalogVersion: typeof FIXTURE_CATALOG_VERSION;
  readonly stableState: LabState;
  readonly savedAt: string;
}

export interface SnapshotStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

export type SnapshotLoadStatus = "empty" | "restored" | "invalid" | "stale" | "unavailable";

export interface SnapshotLoadResult {
  readonly state: LabState;
  readonly status: SnapshotLoadStatus;
  readonly message: string;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function allowed<const T extends readonly (string | number)[]>(
  value: unknown,
  values: T,
  label: string,
): T[number] {
  if (!values.includes(value as T[number])) {
    throw new Error(`${label} contains a value outside the allowlist.`);
  }
  return value as T[number];
}

function textArray(value: unknown, label: string): readonly string[] {
  return array(value, label).map((item, index) => text(item, `${label}[${index}]`));
}

function factValue(value: unknown, label: string): RunFact["value"] {
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${label} must be a finite number, string, or boolean.`);
}

function projectFact(value: unknown): RunFact {
  const fact = record(value, "run fact");
  return {
    id: text(fact.id, "run fact ID"),
    sequence: integer(fact.sequence, "run fact sequence"),
    key: text(fact.key, "run fact key"),
    label: text(fact.label, "run fact label"),
    value: factValue(fact.value, "run fact value"),
    detail: text(fact.detail, "run fact detail"),
  };
}

function projectAssertion(value: unknown): AssertionResult {
  const assertion = record(value, "assertion result");
  return {
    id: text(assertion.id, "assertion result ID"),
    assertionId: text(assertion.assertionId, "assertion ID"),
    signal: allowed(assertion.signal, SIGNAL_NAMES, "assertion signal"),
    graderVersion: allowed(assertion.graderVersion, ["1.0.0"] as const, "grader version"),
    title: text(assertion.title, "assertion title"),
    status: allowed(
      assertion.status,
      ["passed", "failed", "not_applicable"] as const,
      "assertion status",
    ),
    expected: factValue(assertion.expected, "assertion expected value"),
    actual: factValue(assertion.actual, "assertion actual value"),
    message: text(assertion.message, "assertion message"),
    evidenceFactIds: textArray(assertion.evidenceFactIds, "assertion evidence IDs"),
  };
}

function projectSignal(value: unknown): SignalSummary {
  const signal = record(value, "signal summary");
  return {
    signal: allowed(signal.signal, SIGNAL_NAMES, "signal name"),
    passed: integer(signal.passed, "passed assertion count"),
    failed: integer(signal.failed, "failed assertion count"),
    notApplicable: integer(signal.notApplicable, "not-applicable assertion count"),
    assertionResultIds: textArray(signal.assertionResultIds, "signal assertion IDs"),
    evidenceFactIds: textArray(signal.evidenceFactIds, "signal evidence IDs"),
  };
}

function projectTrialRun(value: unknown): TrialRun {
  const run = record(value, "trial run");
  return {
    schemaVersion: allowed(run.schemaVersion, [1] as const, "trial run schema version"),
    id: text(run.id, "trial run ID"),
    scenarioId: text(run.scenarioId, "trial scenario ID"),
    scenarioVersion: text(run.scenarioVersion, "trial scenario version"),
    scenarioTitle: text(run.scenarioTitle, "trial scenario title"),
    invariant: text(run.invariant, "trial invariant"),
    fixtureDisclosure: text(run.fixtureDisclosure, "trial fixture disclosure"),
    harnessId: text(run.harnessId, "trial harness ID"),
    harnessVersion: text(run.harnessVersion, "trial harness version"),
    harnessDefinitionDigest: text(run.harnessDefinitionDigest, "trial harness digest"),
    harnessRole: allowed(run.harnessRole, ["baseline", "candidate"] as const, "trial harness role"),
    trialId: text(run.trialId, "trial ID"),
    trialVersion: text(run.trialVersion, "trial version"),
    trialKind: allowed(run.trialKind, ["target", "sealed"] as const, "trial kind"),
    trialTitle: text(run.trialTitle, "trial title"),
    expectation: allowed(run.expectation, ["pass", "fail"] as const, "trial expectation"),
    expectationMet: boolean(run.expectationMet, "trial expectation result"),
    status: allowed(
      run.status,
      ["passed", "failed_as_expected", "failed", "unexpected_pass"] as const,
      "trial status",
    ),
    initialStateDigest: text(run.initialStateDigest, "trial initial-state digest"),
    facts: array(run.facts, "run facts").map(projectFact),
    assertions: array(run.assertions, "run assertions").map(projectAssertion),
    signals: array(run.signals, "run signals").map(projectSignal),
    limitations: textArray(run.limitations, "run limitations"),
    resultDigest: text(run.resultDigest, "trial result digest"),
  };
}

function projectSuiteRun(value: unknown): SuiteRun {
  const suite = record(value, "suite run");
  const patch = record(suite.evaluatedPatch, "evaluated patch");
  return {
    schemaVersion: allowed(suite.schemaVersion, [1] as const, "suite schema version"),
    id: text(suite.id, "suite ID"),
    scenarioId: text(suite.scenarioId, "suite scenario ID"),
    scenarioVersion: text(suite.scenarioVersion, "suite scenario version"),
    scenarioTitle: text(suite.scenarioTitle, "suite scenario title"),
    harnessId: text(suite.harnessId, "suite harness ID"),
    harnessVersion: text(suite.harnessVersion, "suite harness version"),
    harnessDefinitionDigest: text(suite.harnessDefinitionDigest, "suite harness digest"),
    harnessRole: allowed(suite.harnessRole, ["baseline", "candidate"] as const, "suite harness role"),
    evaluatedPatch: {
      id: text(patch.id, "evaluated patch ID"),
      layer: text(patch.layer, "evaluated patch layer"),
      diff: textArray(patch.diff, "evaluated patch diff"),
    },
    evaluatedPatchDigest: text(suite.evaluatedPatchDigest, "evaluated patch digest"),
    status: allowed(suite.status, ["passed", "failed"] as const, "suite status"),
    runs: array(suite.runs, "suite runs").map(projectTrialRun),
    signals: array(suite.signals, "suite signals").map(projectSignal),
    limitations: textArray(suite.limitations, "suite limitations"),
    resultDigest: text(suite.resultDigest, "suite result digest"),
  };
}

function projectDecision(value: unknown) {
  const decision = record(value, "human decision");
  return {
    outcome: allowed(decision.outcome, ["promoted", "rejected"] as const, "decision outcome"),
    actor: allowed(decision.actor, ["human"] as const, "decision actor"),
    comparedRevision: integer(decision.comparedRevision, "decision revision"),
    recordedAt: text(decision.recordedAt, "decision timestamp"),
  };
}

function projectPatch(value: unknown) {
  const patch = record(value, "candidate patch");
  const hypothesis = text(patch.hypothesis, "candidate hypothesis");
  if (hypothesis !== hypothesis.trim() || hypothesis.length > 280) {
    throw new Error("Candidate hypothesis must be canonical and at most 280 characters.");
  }
  return {
    id: text(patch.id, "candidate patch ID"),
    layer: text(patch.layer, "candidate patch layer"),
    hypothesis,
    diff: textArray(patch.diff, "candidate diff"),
  };
}

function projectEvent(value: unknown): DomainEvent {
  const event = record(value, "domain event");
  const meta = {
    id: text(event.id, "event ID"),
    commandId: text(event.commandId, "event command ID"),
    actor: allowed(event.actor, ["human", "agent", "system"] as const, "event actor") as Actor,
    source: allowed(event.source, ["ui", "webmcp", "bootstrap", "test"] as const, "event source") as CommandSource,
  };
  switch (event.type) {
    case "MISSION_LOADED":
      return {
        ...meta,
        type: event.type,
        missionId: allowed(
          event.missionId,
          ["completion", "handoff", "retry", "authority"] as const,
          "mission ID",
        ) as ScenarioId,
      };
    case "WORKSPACE_RESET":
      return { ...meta, type: event.type };
    case "BASELINE_RUN_STARTED":
    case "CANDIDATE_RUN_STARTED":
      return { ...meta, type: event.type, runId: text(event.runId, "run ID") };
    case "BASELINE_FAILED_AS_EXPECTED":
      return {
        ...meta,
        type: event.type,
        runId: text(event.runId, "baseline run ID"),
        result: projectTrialRun(event.result),
      };
    case "PATCH_STAGED":
      return { ...meta, type: event.type, patch: projectPatch(event.patch) };
    case "CANDIDATE_SUITE_COMPLETED":
      return {
        ...meta,
        type: event.type,
        runId: text(event.runId, "candidate run ID"),
        suite: projectSuiteRun(event.suite),
      };
    case "CANDIDATE_PROMOTED":
      return {
        ...meta,
        type: event.type,
        decision: projectDecision(event.decision) as Extract<DomainEvent, { type: "CANDIDATE_PROMOTED" }>["decision"],
      };
    case "CANDIDATE_REJECTED":
      return {
        ...meta,
        type: event.type,
        decision: projectDecision(event.decision) as Extract<DomainEvent, { type: "CANDIDATE_REJECTED" }>["decision"],
      };
    default:
      throw new Error("Snapshot contains an unknown domain event.");
  }
}

function isStablePhase(value: unknown): value is StableLabPhase {
  return value === "mission_loaded"
    || value === "baseline_failed"
    || value === "patch_staged"
    || value === "compared"
    || value === "promoted"
    || value === "rejected";
}

function canonicalTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function restoreStableState(value: unknown): LabState {
  const state = record(value, "stable state");
  if (
    state.schemaVersion !== LAB_STATE_SCHEMA_VERSION
    || state.workspaceId !== "local-workspace"
    || !isStablePhase(state.phase)
    || !Array.isArray(state.events)
    || state.events.length > MAX_EVENTS
  ) {
    throw new Error("Snapshot state metadata is invalid or transient.");
  }
  const events = state.events.map(projectEvent);
  if (new Set(events.map((event) => event.id)).size !== events.length) {
    throw new Error("Snapshot contains duplicate domain event IDs.");
  }
  const rebuilt = reduceLabEvents(createInitialLabState(), events);
  if (!isStablePhase(rebuilt.phase) || canonicalJson(rebuilt) !== canonicalJson(value)) {
    throw new Error("Snapshot does not replay to the declared stable state.");
  }
  return rebuilt;
}

function fallback(status: Exclude<SnapshotLoadStatus, "restored">, message: string): SnapshotLoadResult {
  return { state: createInitialLabState(), status, message };
}

export function createStoredSnapshot(
  stableState: LabState,
  savedAt = new Date().toISOString(),
): StoredSnapshot {
  if (
    !isStablePhase(stableState.phase)
    || stableState.events.length > MAX_EVENTS
    || !canonicalTimestamp(savedAt)
  ) {
    throw new Error(
      "Only a bounded stable lab state with a canonical save time can be persisted.",
    );
  }
  return {
    schemaVersion: LAB_SNAPSHOT_SCHEMA_VERSION,
    fixtureCatalogVersion: FIXTURE_CATALOG_VERSION,
    stableState,
    savedAt,
  };
}

export function loadLabSnapshot(storage: SnapshotStorage | null): SnapshotLoadResult {
  if (!storage) return fallback("unavailable", "Local recovery is unavailable; using a clean workspace.");
  let raw: string | null;
  try {
    raw = storage.getItem(LAB_SNAPSHOT_KEY);
  } catch {
    return fallback(
      "unavailable",
      "Local recovery could not be read; using a clean in-memory workspace.",
    );
  }
  try {
    if (raw === null) return fallback("empty", "No saved workspace found; starting clean.");
    if (raw.length > MAX_SNAPSHOT_CHARACTERS) {
      return fallback("invalid", "Saved workspace exceeded the recovery size limit and was ignored.");
    }
    const parsed = record(JSON.parse(raw), "stored snapshot");
    if (parsed.fixtureCatalogVersion !== FIXTURE_CATALOG_VERSION) {
      return fallback("stale", "Saved workspace used an older fixture catalog and was ignored.");
    }
    if (
      parsed.schemaVersion !== LAB_SNAPSHOT_SCHEMA_VERSION
      || !canonicalTimestamp(parsed.savedAt)
      || Object.keys(parsed).sort().join(",")
        !== "fixtureCatalogVersion,savedAt,schemaVersion,stableState"
    ) {
      return fallback("invalid", "Saved workspace metadata was invalid and was ignored.");
    }
    const state = restoreStableState(parsed.stableState);
    return {
      state,
      status: "restored",
      message: `Restored local revision ${state.revision} for ${state.missionId}.`,
    };
  } catch {
    return fallback("invalid", "Saved workspace failed validation and was ignored.");
  }
}

export function saveLabSnapshot(
  storage: SnapshotStorage | null,
  state: LabState,
  savedAt = new Date().toISOString(),
): boolean {
  if (!storage) return false;
  try {
    const serialized = JSON.stringify(createStoredSnapshot(state, savedAt));
    if (serialized.length > MAX_SNAPSHOT_CHARACTERS) return false;
    storage.setItem(LAB_SNAPSHOT_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function discardLabSnapshot(storage: SnapshotStorage | null): void {
  try {
    storage?.removeItem(LAB_SNAPSHOT_KEY);
  } catch {
    // Recovery cleanup must not prevent the clean in-memory workspace from loading.
  }
}
