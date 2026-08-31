import type { ScenarioId } from "../domain/types";
import { authorityDriftScenario } from "./authority-drift";
import { brokenContextHandoffScenario } from "./broken-context-handoff";
import { completionWithoutProofScenario } from "./completion-without-proof";
import { lostToolResponseScenario } from "./lost-tool-response";
import type { ScenarioDefinition } from "./types";

export const FIXTURE_CATALOG_VERSION = "2026-08-30.1";

const implementedScenarios: Readonly<Record<ScenarioId, ScenarioDefinition>> = {
  completion: completionWithoutProofScenario,
  handoff: brokenContextHandoffScenario,
  retry: lostToolResponseScenario,
  authority: authorityDriftScenario,
};

export function getScenarioDefinition(
  scenarioId: ScenarioId,
): ScenarioDefinition | null {
  return implementedScenarios[scenarioId] ?? null;
}

export function isScenarioImplemented(scenarioId: ScenarioId): boolean {
  return getScenarioDefinition(scenarioId) !== null;
}
