import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { labCommands, labStore } from "../app/runtime";
import {
  selectActionAvailability,
  selectBaselineRunAvailability,
  selectCandidatePatchView,
  selectCurrentWorkspaceEvents,
  selectDecisionAvailability,
  selectHarnessComparison,
  selectRunTraces,
  selectScenarioDefinition,
  selectSealedTrials,
  selectWorkflowSteps,
  type CandidatePatchView,
  type DecisionAvailability,
  type RunTraceView,
  type SealedTrialView,
  type WorkflowStepView,
} from "../app/selectors";
import type {
  CommandResult,
  LabCommand,
  LabState,
  ScenarioId,
} from "../domain/types";
import type {
  HarnessComparison,
  ScenarioDefinition,
  SignalSummary,
  TrialRun,
} from "../scenarios/types";
import {
  getScenarioDefinition,
  isScenarioImplemented,
} from "../scenarios/registry";
import { WEBMCP_TOOL_CONTRACTS } from "../webmcp/contracts";
import {
  webMcpRuntime,
  type WebMcpRuntimeSnapshot,
} from "../webmcp/status";
import {
  getMissionCatalogEntry,
  HARNESS_LAYERS,
  MISSION_CATALOG,
} from "./catalog";

type RunView = "trajectory" | "evidence" | "patch";
type PendingAction =
  | "load"
  | "baseline"
  | "stage"
  | "candidate"
  | "promote"
  | "reject"
  | "reset";

const SIGNAL_EXPLANATIONS = {
  activation: "Did the changed task activate the intended harness artifact?",
  adherence: "Did the trajectory follow the artifact after activation?",
  outcome: "Did externally visible acceptance checks pass?",
  evidence: "Do the completion claim and receipts prove the result?",
  safety: "Did the run preserve scope and external-effect boundaries?",
} as const;

let commandSequence = 0;

function nextCommandId(): string {
  commandSequence += 1;
  return `ui-${commandSequence}`;
}

function formatPhase(phase: string): string {
  return phase.replaceAll("_", " ");
}

function formatEvent(type: string): string {
  return type.toLowerCase().replaceAll("_", " ");
}

function actionHelp(state: LabState, baselineReason: string): string {
  switch (state.phase) {
    case "mission_loaded": return baselineReason;
    case "baseline_failed": return "Review the declared diff; only its causal hypothesis is editable before staging.";
    case "patch_staged": return "Runs one target and two sealed local fixtures, then derives five separate evidence signals.";
    case "compared": return `Reviewing exact compared revision ${state.revision}; only a human can promote or reject it.`;
    case "promoted":
    case "rejected": return `Decision recorded for compared revision ${state.decision?.comparedRevision ?? "unknown"}; no deployment occurred.`;
    case "baseline_running":
    case "candidate_running": return "The command is running against a transient state; overlapping actions stay disabled.";
  }
}

function formatFactValue(value: boolean | number | string): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function signalScore(signal: SignalSummary): string {
  const applicable = signal.passed + signal.failed;
  return `${signal.passed}/${applicable}`;
}

function signalTone(signal: SignalSummary): "fail" | "neutral" | "pass" {
  if (signal.failed > 0) return "fail";
  if (signal.passed > 0) return "pass";
  return "neutral";
}

function statusLabel(status: RunTraceView["status"]): string {
  switch (status) {
    case "failed_as_expected": return "Invariant failed";
    case "unexpected_pass": return "Unexpected pass";
    case "failed": return "Failed";
    case "passed": return "Passed";
  }
}

function webMcpRuntimeLabel(runtime: WebMcpRuntimeSnapshot): string {
  switch (runtime.registration) {
    case "detecting": return "WebMCP · detecting";
    case "registering": return `WebMCP · ${runtime.registeredCount}/${runtime.totalCount}`;
    case "ready": return `WebMCP · ${runtime.registeredCount} tools`;
    case "unavailable": return "Manual mode · WebMCP unavailable";
    case "error": return "Manual mode · registration failed";
    case "stopped": return "Manual mode · tools stopped";
  }
}

function MissionRail({
  state,
  pending,
  onLoad,
}: {
  readonly state: LabState;
  readonly pending: PendingAction | null;
  readonly onLoad: (missionId: ScenarioId) => void;
}) {
  const mission = getMissionCatalogEntry(state.missionId);
  return (
    <aside className="mission-rail" aria-labelledby="missions-heading">
      <div className="rail-section">
        <div className="rail-heading">
          <h2 id="missions-heading">Failure missions</h2>
          <span className="count">04 missions · 01 executable</span>
        </div>
        <div className="mission-list">
          {MISSION_CATALOG.map((entry) => (
            <button
              key={entry.id}
              className="mission-card"
              type="button"
              aria-pressed={entry.id === state.missionId}
              disabled={pending !== null}
              onClick={() => onLoad(entry.id)}
            >
              <span className="mission-code">{entry.code}</span>
              <span className="mission-card-copy">
                <strong>{entry.title}</strong>
                <small>{entry.layer}</small>
                <span className="mission-failure">{entry.failure}</span>
              </span>
              <span className={isScenarioImplemented(entry.id) ? "fixture-ready" : "fixture-catalog"}>
                {isScenarioImplemented(entry.id) ? "Executable" : "Catalog"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rail-section layer-section">
        <div className="rail-heading">
          <h3>Harness layers</h3>
          <span className="count">selected</span>
        </div>
        <ul className="layer-stack">
          {HARNESS_LAYERS.map((layer) => (
            <li
              key={layer.id}
              data-active={mission.activeLayers.includes(layer.id)}
            >
              {layer.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="rail-section">
        <p className="fixture-note">
          <strong>Fixture, not telemetry.</strong> Every result comes from a
          declared local assertion. No model API or production claim is implied.
        </p>
      </div>
    </aside>
  );
}

function RunTabs({
  active,
  onChange,
}: {
  readonly active: RunView;
  readonly onChange: (view: RunView) => void;
}) {
  const tabs = [
    { id: "trajectory" as const, label: "Trajectory" },
    { id: "evidence" as const, label: "Evidence matrix" },
    { id: "patch" as const, label: "Harness patch" },
  ];

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const current = tabs.findIndex((tab) => tab.id === active);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#tab-${tab.id}`)
      ?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label="Run views">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className="tab"
          id={`tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`view-${tab.id}`}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={onKeyDown}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function TracePanel({
  title,
  trace,
  role,
  lockedCopy,
}: {
  readonly title: string;
  readonly trace: RunTraceView | null;
  readonly role: "baseline" | "candidate";
  readonly lockedCopy: string;
}) {
  return (
    <article
      className="timeline-panel"
      data-tone={trace ? role : "locked"}
      aria-labelledby={`${role}-trace-title`}
    >
      <header className="timeline-head">
        <div>
          <small>{trace ? `HARNESS ${trace.harnessVersion}` : "NOT RUN"}</small>
          <h3 id={`${role}-trace-title`}>{title}</h3>
        </div>
        <span className={`status-pill ${trace?.status === "passed" ? "pass" : trace ? "fail" : ""}`}>
          {trace ? statusLabel(trace.status) : "Locked"}
        </span>
      </header>

      {trace ? (
        <>
          <ol className="trace-list" aria-label={`${title} ordered facts`}>
            {trace.facts.map((fact) => (
              <li key={fact.id} data-status={fact.status}>
                <span className="trace-sequence">{String(fact.sequence + 1).padStart(2, "0")}</span>
                <div className="trace-copy">
                  <div className="trace-title-row">
                    <strong>{fact.label}</strong>
                    <span>{formatFactValue(fact.value)}</span>
                  </div>
                  <p>{fact.detail}</p>
                  {fact.signals.length ? (
                    <small>{fact.signals.join(" · ")} · {fact.assertionIds.join(", ")}</small>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <code className="trace-digest">{trace.digest}</code>
        </>
      ) : (
        <div className="locked-state">
          <span aria-hidden="true">{role === "candidate" ? "RC" : "—"}</span>
          <p>{lockedCopy}</p>
        </div>
      )}
    </article>
  );
}

function TrajectoryView({
  missionFailure,
  scenario,
  baseline,
  candidate,
}: {
  readonly missionFailure: string;
  readonly scenario: ScenarioDefinition | null;
  readonly baseline: RunTraceView | null;
  readonly candidate: RunTraceView | null;
}) {
  return (
    <>
      <div className="scenario-brief">
        <article className="brief-card">
          <span>Failure case</span>
          <p>{missionFailure}</p>
        </article>
        <article className="brief-card invariant">
          <span>Mission invariant</span>
          <p>{scenario?.invariant ?? "This catalog entry does not have an executable invariant yet."}</p>
        </article>
      </div>
      <div className="timeline-grid">
        <TracePanel
          title="Baseline trajectory"
          role="baseline"
          trace={baseline}
          lockedCopy={scenario
            ? "Run the deterministic baseline to reveal ordered facts and the failed invariant."
            : "This mission is cataloged but not executable in the current release."}
        />
        <TracePanel
          title="Candidate trajectory"
          role="candidate"
          trace={candidate}
          lockedCopy={!scenario
            ? "This catalog entry has no executable candidate fixture in the current release."
            : baseline
              ? "Review and stage the candidate, then run the target and two sealed fixtures."
              : "Reproduce the baseline before proposing a candidate harness change."}
        />
      </div>
    </>
  );
}

function PatchView({
  patch,
  hypothesis,
  onHypothesisChange,
  baselineReady,
  canStage,
  pending,
  candidateTrace,
  onStage,
}: {
  readonly patch: CandidatePatchView | null;
  readonly hypothesis: string;
  readonly onHypothesisChange: (value: string) => void;
  readonly baselineReady: boolean;
  readonly canStage: boolean;
  readonly pending: PendingAction | null;
  readonly candidateTrace: RunTraceView | null;
  readonly onStage: () => void;
}) {
  const hypothesisId = useId();
  if (!patch) {
    return <div className="locked-state wide"><p>No candidate fixture is implemented for this mission yet.</p></div>;
  }
  if (!baselineReady) {
    return (
      <div className="locked-state wide">
        <span aria-hidden="true">01</span>
        <p>Reproduce the deterministic baseline before reviewing or editing the declared candidate patch.</p>
      </div>
    );
  }
  const activation = candidateTrace?.facts.find(
    (fact) => fact.key === "artifact.browser_qa.loaded",
  );
  const recheck = candidateTrace?.facts.find(
    (fact) => fact.key === "repair.rechecked",
  );
  const outcome = candidateTrace?.facts.find(
    (fact) => fact.key === "outcome.mobile_320.no_overflow",
  );
  const evidence = candidateTrace?.facts.find(
    (fact) => fact.key === "completion.receipts_cited",
  );
  const editable = patch.status === "draft";

  return (
    <div className="patch-layout">
      <article className="patch-card">
        <header className="panel-card-head">
          <div>
            <span className="micro">{patch.layer}</span>
            <h3>{patch.id}</h3>
          </div>
          <span className={`status-pill ${patch.status === "evaluated" ? "pass" : "pending"}`}>
            {patch.status}
          </span>
        </header>
        <p className="patch-mechanism">{patch.mechanism}</p>
        <pre className="diff" aria-label="Scrollable read-only harness patch diff" tabIndex={0}>
          {patch.diff.map((line) => <span key={line}>+ {line}</span>)}
        </pre>
        <label className="hypothesis-field" htmlFor={hypothesisId}>
          <span>Causal hypothesis</span>
          <textarea
            id={hypothesisId}
            value={patch.stagedHypothesis ?? hypothesis}
            disabled={!editable || pending !== null}
            maxLength={280}
            rows={5}
            onChange={(event) => onHypothesisChange(event.target.value)}
          />
          <small>{(patch.stagedHypothesis ?? hypothesis).length}/280 · Only this explanation is editable.</small>
        </label>
        {editable ? (
          <button
            className="button primary"
            type="button"
            disabled={!canStage || pending !== null || !hypothesis.trim()}
            onClick={onStage}
          >
            {pending === "stage" ? "Staging patch…" : "Stage declared patch"}
          </button>
        ) : null}
        {patch.evaluatedDigest ? <code className="patch-digest">{patch.evaluatedDigest}</code> : null}
      </article>

      <article className="causal-card">
        <header className="panel-card-head">
          <h3>Causal claim</h3>
          <span className={`status-pill ${candidateTrace ? "pass" : "pending"}`}>
            {candidateTrace ? "Observed" : "Must be tested"}
          </span>
        </header>
        <div className="causal-body">
          <div className="causal-step"><strong>Patch</strong><span>{patch.mechanism}</span></div>
          <div className="causal-step"><strong>Activation</strong><span>{activation?.detail ?? "Observe whether UI work loads browser QA."}</span></div>
          <div className="causal-step"><strong>Adherence</strong><span>{recheck?.detail ?? "Observe desktop, 320 px, and post-repair checks."}</span></div>
          <div className="causal-step"><strong>Outcome</strong><span>{outcome?.detail ?? "Check the repaired 320 px layout and reachable actions."}</span></div>
          <div className="causal-step"><strong>Evidence</strong><span>{evidence?.detail ?? "Require final receipts before completion."}</span></div>
        </div>
      </article>
    </div>
  );
}

function EvidenceView({
  comparison,
  available,
  baseline,
  candidate,
  sealedTrials,
}: {
  readonly comparison: HarnessComparison | null;
  readonly available: boolean;
  readonly baseline: TrialRun | null;
  readonly candidate: RunTraceView | null;
  readonly sealedTrials: readonly SealedTrialView[];
}) {
  if (!available) {
    return (
      <div className="locked-state wide">
        <span aria-hidden="true">—</span>
        <p>This catalog entry has no executable baseline, candidate, or sealed evidence in the current release.</p>
      </div>
    );
  }
  if (!comparison) {
    return (
      <div className="precomparison">
        <div className="locked-state wide">
          <span aria-hidden="true">5×</span>
          <p>Stage the candidate and run the target plus two sealed fixtures to unlock comparison evidence.</p>
        </div>
        <div className="precomparison-grid" aria-label="Evidence availability">
          <article>
            <span>Baseline</span>
            <strong>{baseline ? statusLabel(baseline.status) : "Not run"}</strong>
            {baseline
              ? <code>{baseline.resultDigest}</code>
              : <small>Run the deterministic baseline first.</small>}
          </article>
          <article>
            <span>Candidate</span>
            <strong>Not run</strong>
            <small>Target evidence is locked.</small>
          </article>
          <article>
            <span>Sealed trials</span>
            <strong>0 / 2</strong>
            <small>Regression evidence is locked.</small>
          </article>
        </div>
        {baseline ? (
          <div className="baseline-signal-grid" aria-label="Baseline signal values">
            {baseline.signals.map((signal) => (
              <div key={signal.signal}>
                <span>{signal.signal}</span>
                <strong>{signalScore(signal)}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <>
      <div className="evidence-callout">
        <span aria-hidden="true">≠</span>
        <p><strong>A better output is not enough.</strong> Compare activation, adherence, outcome, evidence, and safety without collapsing them into one score.</p>
      </div>
      <div
        className="table-wrap"
        role="region"
        aria-label="Scrollable five-signal harness comparison"
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">Baseline and candidate evidence signal comparison</caption>
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Baseline</th>
              <th scope="col">Candidate</th>
              <th scope="col">What is measured</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {comparison.signals.map((entry) => (
              <tr key={entry.signal}>
                <th scope="row">{entry.signal}</th>
                <td><span className={`metric-badge ${signalTone(entry.baseline)}`}>{signalScore(entry.baseline)}</span></td>
                <td><span className={`metric-badge ${signalTone(entry.candidate)}`}>{signalScore(entry.candidate)}</span></td>
                <td>{SIGNAL_EXPLANATIONS[entry.signal]}</td>
                <td>
                  <details>
                    <summary>{entry.supportingFactIds.length} facts · {entry.supportingAssertionResultIds.length} assertions</summary>
                    <span>Fact IDs</span>
                    <code>{entry.supportingFactIds.join("\n")}</code>
                    <span>Assertion result IDs</span>
                    <code>{entry.supportingAssertionResultIds.join("\n")}</code>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <article className="target-card" data-status={candidate?.status ?? "not-run"}>
        <header>
          <span>Target trial</span>
          <strong>{candidate ? statusLabel(candidate.status) : "Not run"}</strong>
        </header>
        <h3>Replayed the target with the candidate harness</h3>
        <p>The candidate target run is compared against the baseline before the sealed regression fixtures are considered.</p>
        {candidate ? <code>{candidate.digest}</code> : null}
      </article>

      <div className="sealed-heading">
        <div><span className="micro">Regression guard</span><h3>Sealed trials</h3></div>
        <span className={`status-pill ${sealedTrials.every((trial) => trial.status === "passed") ? "pass" : "fail"}`}>
          {sealedTrials.filter((trial) => trial.status === "passed").length} / {sealedTrials.length} passed
        </span>
      </div>
      <div className="checks-grid">
        {sealedTrials.map((trial) => (
          <article key={trial.id} className="sealed-card" data-status={trial.status}>
            <header><span>Sealed</span><strong>{trial.status}</strong></header>
            <h4>{trial.title}</h4>
            <p>{trial.purpose}</p>
            <span>{trial.passed}/{trial.applicable} assertions passed</span>
            <code>{trial.digest}</code>
          </article>
        ))}
      </div>

      <div className="risk-grid">
        <article>
          <span>Unresolved risks</span>
          <strong>{comparison.unresolvedRisks.length ? comparison.unresolvedRisks.join(" · ") : "None in declared fixtures"}</strong>
        </article>
        <article>
          <span>Limitations</span>
          <strong>{comparison.limitations.join(" · ")}</strong>
        </article>
      </div>
    </>
  );
}

function Workflow({ steps }: { readonly steps: readonly WorkflowStepView[] }) {
  return (
    <ol className="workflow">
      {steps.map((step, index) => (
        <li key={step.id} data-status={step.status}>
          <span>{step.status === "complete" ? "✓" : String(index + 1).padStart(2, "0")}</span>
          <div><strong>{step.label}</strong><small>{step.status}</small></div>
        </li>
      ))}
    </ol>
  );
}

function ReviewRail({
  state,
  patch,
  workflow,
  decision,
  pending,
  onPromote,
  onReject,
}: {
  readonly state: LabState;
  readonly patch: CandidatePatchView | null;
  readonly workflow: readonly WorkflowStepView[];
  readonly decision: DecisionAvailability;
  readonly pending: PendingAction | null;
  readonly onPromote: () => void;
  readonly onReject: () => void;
}) {
  const events = selectCurrentWorkspaceEvents(state, 8);
  const decisionHelpId = useId();
  const candidateReady = state.candidateSuiteResult?.status === "passed";
  const workflowUnavailable = workflow.every((step) => step.status === "unavailable");
  const decisionHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state.decision) decisionHeadingRef.current?.focus();
  }, [state.decision]);

  return (
    <aside className="review-rail" aria-label="Evaluation and decision rail">
      <div className="rail-section">
        <div className="rail-heading"><h2>Change workflow</h2><span className="count">{workflowUnavailable ? "not executable" : state.phase === "promoted" || state.phase === "rejected" ? "04 / 04" : `${workflow.filter((step) => step.status === "complete").length + 1} / 04`}</span></div>
        <Workflow steps={workflow} />
      </div>

      <div className="rail-section">
        <div className="rail-heading"><h3>Candidate</h3><span className="count">one at a time</span></div>
        {patch ? (
          <div className="candidate-summary">
            <span>{patch.layer}</span>
            <strong>{patch.id}</strong>
            <p>{patch.stagedHypothesis ?? "Review the declared diff and write a causal hypothesis."}</p>
            <small>{patch.status}</small>
          </div>
        ) : <p className="empty-candidate">No executable candidate exists for this catalog entry.</p>}
      </div>

      <div className="rail-section">
        <div className="decision-box" data-state={state.decision?.outcome ?? (state.phase === "compared" ? (candidateReady ? "ready" : "failed") : "pending")}>
          <h3
            ref={decisionHeadingRef}
            tabIndex={state.decision ? -1 : undefined}
          >{workflowUnavailable
            ? "Decision gate unavailable"
            : state.decision
            ? `Candidate ${state.decision.outcome} by human`
            : state.phase === "compared"
              ? candidateReady
                ? "Human decision required"
                : "Human rejection required"
              : "Human promotion gate"}</h3>
          <p>{state.decision
            ? `The fixture decision references compared revision ${state.decision.comparedRevision}. Evidence remains available; no deployment occurred.`
            : decision.reason}</p>
          {state.candidateSuiteResult ? (
            <p className="decision-limits">
              <strong>Fixture limits:</strong> {state.candidateSuiteResult.limitations.join(" · ")}
            </p>
          ) : null}
          <div className="decision-actions">
            <button
              className="button primary"
              type="button"
              disabled={!decision.canPromote || pending !== null}
              aria-describedby={decisionHelpId}
              onClick={onPromote}
            >
              {pending === "promote" ? "Promoting…" : "Promote"}
            </button>
            <button
              className="button danger"
              type="button"
              disabled={!decision.canReject || pending !== null}
              aria-describedby={decisionHelpId}
              onClick={onReject}
            >
              {pending === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
          <small id={decisionHelpId}>Human-only controls. They are not part of the registered WebMCP tool set.</small>
        </div>
      </div>

      <div className="rail-section activity-region" role="region" aria-labelledby="activity-heading">
        <div className="rail-heading"><h3 id="activity-heading">Activity provenance</h3><span className="count">newest first · {events.length} {events.length === 1 ? "event" : "events"}</span></div>
        {events.length ? (
          <ol className="activity-list">
            {events.map((event) => (
              <li key={event.id}>
                <span className="actor-badge">{event.actor}</span>
                <div>
                  <strong>{formatEvent(event.type)}</strong>
                  <small>
                    revision {state.events.findIndex((item) => item.id === event.id) + 1}
                    {` · ${event.commandId} · ${event.source}`}
                    {"runId" in event ? ` · ${event.runId}` : ""}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="empty-candidate">Run the baseline to create evidence provenance.</p>}
      </div>
    </aside>
  );
}

function ContractDialog({
  dialogRef,
  runtime,
}: {
  readonly dialogRef: RefObject<HTMLDialogElement | null>;
  readonly runtime: WebMcpRuntimeSnapshot;
}) {
  function keepFocusInside(event: ReactKeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (focusable.length === 1
      || (event.shiftKey && document.activeElement === first)
      || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  return (
    <dialog
      id="contract-dialog"
      ref={dialogRef}
      aria-labelledby="contract-title"
      aria-describedby="contract-copy"
      onKeyDown={keepFocusInside}
    >
      <div className="dialog-head">
        <div><span className="micro">Live WebMCP contract</span><h2 id="contract-title">Agent-facing tool contracts</h2></div>
        <button className="button icon" type="button" aria-label="Close tool contracts" autoFocus onClick={() => dialogRef.current?.close()}>×</button>
      </div>
      <div className="dialog-body">
        <p id="contract-copy">
          {runtime.registration === "ready"
            ? "Eight page-local tools are registered against the same command service and selectors used by this visible workspace."
            : runtime.registration === "error"
              ? `${runtime.message} When registration succeeds, these same eight contracts use the manual workflow's command service and selectors.`
              : `${runtime.message} In a browser that exposes WebMCP, these same eight contracts register without changing the manual workflow.`}
          {" "}Promotion, rejection, deployment, arbitrary execution, and cross-origin access remain outside the tool surface.
        </p>
        <div className="contract-list">
          {WEBMCP_TOOL_CONTRACTS.map((tool) => (
            <article className="contract" key={tool.name}>
              <div><code>{tool.name}</code><span data-mode={tool.mode}>{tool.mode}</span></div>
              <p>{tool.description}</p>
              <small>
                {tool.annotations.readOnlyHint ? "readOnlyHint: true" : "state-changing command"}
                {tool.annotations.untrustedContentHint ? " · untrustedContentHint: true" : ""}
              </small>
            </article>
          ))}
        </div>
        <p className="human-boundary"><span aria-hidden="true">◆</span><strong>Human-only boundary:</strong> there is no promotion or rejection tool.</p>
      </div>
    </dialog>
  );
}

export default function LabApp() {
  const state = useSyncExternalStore(
    labStore.subscribe,
    labStore.getState,
    labStore.getState,
  );
  const mission = getMissionCatalogEntry(state.missionId);
  const scenario = selectScenarioDefinition(state);
  const traces = selectRunTraces(state);
  const patch = selectCandidatePatchView(state);
  const comparison = selectHarnessComparison(state);
  const sealedTrials = selectSealedTrials(state);
  const actions = selectActionAvailability(state);
  const decision = selectDecisionAvailability(state);
  const workflow = selectWorkflowSteps(state);
  const baselineAvailability = selectBaselineRunAvailability(state, "human");
  const webMcp = useSyncExternalStore(
    webMcpRuntime.subscribe,
    webMcpRuntime.getSnapshot,
    webMcpRuntime.getSnapshot,
  );
  const [activeView, setActiveView] = useState<RunView>("trajectory");
  const [hypothesis, setHypothesis] = useState(
    scenario?.candidate.patch.hypothesis ?? "",
  );
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [message, setMessage] = useState("Workspace ready. Reproduce the baseline to begin.");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  const mountedRef = useRef(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const missionRef = useRef(state.missionId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (missionRef.current === state.missionId) return;
    missionRef.current = state.missionId;
    setHypothesis(scenario?.candidate.patch.hypothesis ?? "");
    setActiveView("trajectory");
  }, [scenario, state.missionId]);

  useEffect(() => {
    const call = webMcp.lastCall;
    if (!call) return;
    if (call.state === "failed") {
      setError(call.message);
      return;
    }
    setError(null);
    setMessage(call.message);
    if (call.state !== "succeeded") return;
    if (call.tool === "load_mission") {
      const loadedScenario = getScenarioDefinition(labStore.getState().missionId);
      setHypothesis(loadedScenario?.candidate.patch.hypothesis ?? "");
      setActiveView("trajectory");
    } else if (call.tool === "run_baseline") {
      setActiveView("trajectory");
    } else if (call.tool === "stage_harness_patch") {
      setActiveView("patch");
    } else if (call.tool === "run_candidate_suite" || call.tool === "compare_harnesses") {
      setActiveView("evidence");
    }
  }, [webMcp.lastCall]);

  function focusTab(view: RunView): void {
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`#tab-${view}`)?.focus();
    });
  }

  async function execute(
    action: PendingAction,
    command: LabCommand,
    progress: string,
    success: (result: CommandResult) => string,
  ): Promise<CommandResult | null> {
    if (pendingRef.current) return null;
    const controller = new AbortController();
    abortRef.current = controller;
    pendingRef.current = action;
    setPending(action);
    setError(null);
    setMessage(progress);
    try {
      const result = await labCommands.dispatch(command, {
        commandId: nextCommandId(),
        actor: "human",
        source: "ui",
        signal: controller.signal,
      });
      if (mountedRef.current) setMessage(success(result));
      return result;
    } catch (caught) {
      const copy = caught instanceof Error ? caught.message : String(caught);
      if (mountedRef.current) {
        setError(copy);
        setMessage("The command did not change the stable workspace.");
      }
      return null;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      pendingRef.current = null;
      if (mountedRef.current) setPending(null);
    }
  }

  async function loadMission(missionId: ScenarioId) {
    const result = await execute(
      "load",
      { type: "LOAD_MISSION", missionId },
      `Loading ${getMissionCatalogEntry(missionId).title}…`,
      (completed) => `${getMissionCatalogEntry(completed.state.missionId).title} loaded in a clean workspace.`,
    );
    if (result) {
      const loaded = selectScenarioDefinition(result.state);
      setHypothesis(loaded?.candidate.patch.hypothesis ?? "");
      setActiveView("trajectory");
    }
  }

  async function runBaseline() {
    const result = await execute(
      "baseline",
      { type: "RUN_BASELINE" },
      "Replaying the deterministic baseline…",
      () => "Baseline reproduced. The declared invariant failed as expected.",
    );
    if (result) {
      setActiveView("trajectory");
      focusTab("trajectory");
    }
  }

  async function stagePatch() {
    if (!scenario) return;
    const result = await execute(
      "stage",
      {
        type: "STAGE_PATCH",
        patch: {
          id: scenario.candidate.patch.id,
          layer: scenario.candidate.patch.layer,
          diff: scenario.candidate.patch.diff,
          hypothesis: hypothesis.trim(),
        },
      },
      "Validating and staging the declared candidate patch…",
      () => "Candidate staged. Review the fixed diff or run the target and two sealed fixtures.",
    );
    if (result) {
      setActiveView("patch");
      focusTab("patch");
    }
  }

  async function runCandidateSuite() {
    const result = await execute(
      "candidate",
      { type: "RUN_CANDIDATE_SUITE" },
      "Running the target and two sealed fixtures…",
      (completed) => completed.state.candidateSuiteResult?.status === "passed"
        ? "Candidate suite passed. Review all five signals before making a human decision."
        : "Candidate suite recorded a failure. Review all five signals; only human rejection remains available.",
    );
    if (result) {
      setActiveView("evidence");
      focusTab("evidence");
    }
  }

  async function decide(outcome: "PROMOTE" | "REJECT") {
    const comparedRevision = state.revision;
    await execute(
      outcome === "PROMOTE" ? "promote" : "reject",
      { type: outcome, comparedRevision },
      `${outcome === "PROMOTE" ? "Promoting" : "Rejecting"} the reviewed candidate…`,
      () => `Human decision recorded for compared revision ${comparedRevision}. No deployment occurred.`,
    );
  }

  async function resetMission() {
    const result = await execute(
      "reset",
      { type: "RESET" },
      "Resetting fixture evidence…",
      () => "Mission reset to a clean deterministic workspace.",
    );
    if (result) {
      setHypothesis(scenario?.candidate.patch.hypothesis ?? "");
      setActiveView("trajectory");
    }
  }

  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="brand" href="#lab-workspace" aria-label="Agent Harness Lab home">
          <span className="brand-mark" aria-hidden="true">AH</span>
          <span><strong>Agent Harness Lab</strong><small>Harness change reliability</small></span>
        </a>
        <button
          className="runtime-pill"
          type="button"
          data-state={webMcp.registration}
          data-testid="webmcp-runtime"
          aria-haspopup="dialog"
          aria-controls="contract-dialog"
          aria-label={`${webMcpRuntimeLabel(webMcp)} · inspect contracts`}
          title={webMcp.message}
          onClick={() => dialogRef.current?.showModal()}
        >
          <span aria-hidden="true" /> {webMcpRuntimeLabel(webMcp)}
        </button>
      </header>

      <main className="page-shell">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">Harness reliability workbench</p>
            <h1 id="page-title">Prove the harness change before you trust it.</h1>
            <p>Reproduce a failure, inspect its trajectory, stage one patch, run sealed checks, and leave the final promotion decision with a person.</p>
          </div>
          <aside className="intro-proof" aria-label="Lab measurement promise">
            <span>Measurement contract</span><strong>5 signals</strong><p>Activation, adherence, outcome, evidence, and safety stay separate.</p>
          </aside>
        </section>

        <section className="lab-workspace" id="lab-workspace" aria-label="Interactive harness evaluation workspace">
          <MissionRail state={state} pending={pending} onLoad={loadMission} />

          <section className="run-panel" aria-labelledby="run-heading" aria-busy={pending !== null}>
            <header className="run-header">
              <div className="run-header-top">
                <div className="run-title">
                  <span className="micro">MISSION {mission.code} · <span data-testid="phase">{formatPhase(state.phase)}</span></span>
                  <h2 id="run-heading">{mission.title}</h2>
                  <p>{scenario?.invariant ?? mission.failure}</p>
                  <small className="fixture-disclosure">
                    {scenario?.fixtureDisclosure ?? "Catalog entry only — no executable fixture is registered in this release."}
                  </small>
                  <div className="version-row">
                    <span>Baseline {scenario?.baseline.version ?? "not implemented"}</span>
                    <span>Candidate {scenario?.candidate.version ?? "not implemented"}</span>
                    <span data-testid="revision">Revision {state.revision}</span>
                  </div>
                </div>
                <div className="run-actions" aria-label="Legal lab controls">
                  <button
                    className="button ghost"
                    type="button"
                    disabled={!actions.canReset || pending !== null}
                    onClick={resetMission}
                  >
                    {pending === "reset" ? "Resetting…" : "Reset mission"}
                  </button>
                  {state.phase === "mission_loaded" ? (
                    <button
                      className="button primary"
                      type="button"
                      disabled={!actions.canRunBaseline || pending !== null}
                      aria-describedby="primary-action-help"
                      onClick={runBaseline}
                    >
                      {pending === "baseline" ? "Running baseline…" : "Run deterministic baseline"}
                    </button>
                  ) : null}
                  {state.phase === "baseline_failed" ? (
                    <button className="button" type="button" disabled={pending !== null} onClick={() => setActiveView("patch")}>Review candidate patch</button>
                  ) : null}
                  {state.phase === "patch_staged" ? (
                    <button className="button primary" type="button" disabled={!actions.canRunCandidateSuite || pending !== null} onClick={runCandidateSuite}>
                      {pending === "candidate" ? "Running suite…" : "Run target + 2 sealed"}
                    </button>
                  ) : null}
                  {state.phase === "compared" || state.decision ? (
                    <button className="button" type="button" onClick={() => setActiveView("evidence")}>Review evidence</button>
                  ) : null}
                </div>
              </div>
              <small id="primary-action-help" className="run-help">{actionHelp(state, baselineAvailability.reason)}</small>
              <RunTabs active={activeView} onChange={setActiveView} />
            </header>

            <div className="run-view" id="view-trajectory" role="tabpanel" aria-labelledby="tab-trajectory" hidden={activeView !== "trajectory"}>
              <TrajectoryView missionFailure={mission.failure} scenario={scenario} baseline={traces.baseline} candidate={traces.candidate} />
            </div>
            <div className="run-view" id="view-evidence" role="tabpanel" aria-labelledby="tab-evidence" hidden={activeView !== "evidence"}>
              <EvidenceView
                comparison={comparison}
                available={scenario !== null}
                baseline={state.baselineResult}
                candidate={traces.candidate}
                sealedTrials={sealedTrials}
              />
            </div>
            <div className="run-view" id="view-patch" role="tabpanel" aria-labelledby="tab-patch" hidden={activeView !== "patch"}>
              <PatchView
                patch={patch}
                hypothesis={hypothesis}
                onHypothesisChange={setHypothesis}
                baselineReady={state.baselineResult !== null}
                canStage={actions.canStagePatch}
                pending={pending}
                candidateTrace={traces.candidate}
                onStage={stagePatch}
              />
            </div>
          </section>

          <ReviewRail
            state={state}
            patch={patch}
            workflow={workflow}
            decision={decision}
            pending={pending}
            onPromote={() => decide("PROMOTE")}
            onReject={() => decide("REJECT")}
          />
        </section>

        <section className="contract-surface" aria-labelledby="contract-surface-title">
          <div>
            <p className="eyebrow">WebMCP collaboration layer</p>
            <h2 id="contract-surface-title">Eight narrow tools, one shared state.</h2>
            <p>{webMcp.message} Agent commands commit through the same service as visible controls and appear in activity provenance.</p>
            {webMcp.lastCall ? (
              <p
                className="webmcp-call-status"
                data-state={webMcp.lastCall.state}
                data-testid="webmcp-last-call"
              >
                <strong>{webMcp.lastCall.tool}</strong> · {webMcp.lastCall.message}
              </p>
            ) : null}
          </div>
          <button className="button" type="button" aria-haspopup="dialog" aria-controls="contract-dialog" onClick={() => dialogRef.current?.showModal()}>Inspect live contracts</button>
        </section>

        <div className="announcement-stack" aria-label="Command status">
          {!error ? <p className="status-message" role="status" aria-live="polite" data-testid="status-message">{message}</p> : null}
          {error ? <p className="error-message" role="alert">{error}</p> : null}
        </div>
      </main>

      <ContractDialog dialogRef={dialogRef} runtime={webMcp} />
    </div>
  );
}
