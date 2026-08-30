import { useId, useState, useSyncExternalStore } from "react";
import type { ScenarioId } from "./domain/types";
import { labCommands, labStore } from "./app/runtime";
import { selectLabStateSummary, selectRecentEvents } from "./app/selectors";

const missionNames: Readonly<Record<ScenarioId, string>> = {
  completion: "Completion without proof",
  handoff: "Broken context handoff",
  retry: "Lost tool response",
  authority: "Authority drift",
};

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

export default function App() {
  const state = useSyncExternalStore(
    labStore.subscribe,
    labStore.getState,
    labStore.getState,
  );
  const summary = selectLabStateSummary(state);
  const recentEvents = selectRecentEvents(state);
  const missionSelectId = useId();
  const [selectedMission, setSelectedMission] = useState<ScenarioId>(state.missionId);
  const [message, setMessage] = useState("Workspace ready.");
  const [error, setError] = useState<string | null>(null);

  async function loadMission() {
    setError(null);
    try {
      const result = await labCommands.dispatch(
        { type: "LOAD_MISSION", missionId: selectedMission },
        {
          commandId: nextCommandId(),
          actor: "human",
          source: "ui",
        },
      );
      setMessage(`${missionNames[result.state.missionId]} loaded in a clean workspace.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="brand" href="#workspace" aria-label="Agent Harness Lab home">
          <span className="brand-mark" aria-hidden="true">AH</span>
          <span>
            <strong>Agent Harness Lab</strong>
            <small>Harness change reliability</small>
          </span>
        </a>
        <span className="runtime-pill">
          <span aria-hidden="true" />
          Local fixture workspace
        </span>
      </header>

      <main id="workspace" className="workspace">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">Shared command foundation</p>
          <h1 id="page-title">Prove the harness change before you trust it.</h1>
          <p>
            Create a clean mission workspace, preserve every state transition,
            and keep promotion authority with the human reviewer.
          </p>
        </section>

        <section className="mission-panel" aria-labelledby="mission-heading">
          <div>
            <p className="section-label">Mission workspace</p>
            <h2 id="mission-heading">{missionNames[state.missionId]}</h2>
            <p className="phase-line">
              <span className="phase-dot" aria-hidden="true" />
              <span data-testid="phase">{formatPhase(summary.phase)}</span>
            </p>
          </div>

          <div className="mission-control">
            <label htmlFor={missionSelectId}>Choose a failure fixture</label>
            <div className="control-row">
              <select
                id={missionSelectId}
                value={selectedMission}
                onChange={(event) => setSelectedMission(event.target.value as ScenarioId)}
              >
                {Object.entries(missionNames).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
              <button type="button" onClick={loadMission}>Load mission</button>
            </div>
          </div>
        </section>

        <section className="status-grid" aria-label="Workspace status">
          <article className="status-card">
            <span>Stable revision</span>
            <strong data-testid="revision">{summary.revision}</strong>
            <p>Commands commit one complete state or leave this revision unchanged.</p>
          </article>
          <article className="status-card">
            <span>Command path</span>
            <strong>Shared</strong>
            <p>Visible controls and agent tools use the same command boundary.</p>
          </article>
          <article className="status-card accent">
            <span>Decision authority</span>
            <strong>Human only</strong>
            <p>Promotion and rejection require a reviewed comparison and human actor.</p>
          </article>
        </section>

        <section className="activity-panel" aria-labelledby="activity-heading">
          <div className="activity-heading">
            <div>
              <p className="section-label">Append-only provenance</p>
              <h2 id="activity-heading">Workspace activity</h2>
            </div>
            <span>{state.events.length} event{state.events.length === 1 ? "" : "s"}</span>
          </div>

          {recentEvents.length ? (
            <ol className="activity-list">
              {recentEvents.map((event) => (
                <li key={event.id}>
                  <span className="actor-badge">{event.actor}</span>
                  <div>
                    <strong>{formatEvent(event.type)}</strong>
                    <small>{event.commandId} · {event.source}</small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">
              Load a mission to record the first reviewed workspace transition.
            </p>
          )}
        </section>

        <p className="status-message" role="status" aria-live="polite">{message}</p>
        {error ? <p className="error-message" role="alert">{error}</p> : null}
      </main>
    </div>
  );
}
