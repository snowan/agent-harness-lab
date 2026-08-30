import type { ScenarioId } from "../domain/types";
import { completionWithoutProofScenario } from "./completion-without-proof";
import type { ScenarioDefinition } from "./types";

const implementedScenarios: Readonly<Partial<Record<ScenarioId, ScenarioDefinition>>> = {
  completion: completionWithoutProofScenario,
};

export function getScenarioDefinition(
  scenarioId: ScenarioId,
): ScenarioDefinition | null {
  return implementedScenarios[scenarioId] ?? null;
}

export function isScenarioImplemented(scenarioId: ScenarioId): boolean {
  return getScenarioDefinition(scenarioId) !== null;
}
