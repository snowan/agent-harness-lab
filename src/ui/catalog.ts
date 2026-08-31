import type { ScenarioId } from "../domain/types";

export interface MissionCatalogEntry {
  readonly id: ScenarioId;
  readonly code: string;
  readonly title: string;
  readonly layer: string;
  readonly failure: string;
  readonly activeLayers: readonly HarnessLayerId[];
}

export type HarnessLayerId =
  | "instructions"
  | "skills"
  | "context"
  | "tools"
  | "completion";

export const HARNESS_LAYERS: readonly {
  readonly id: HarnessLayerId;
  readonly label: string;
}[] = [
  { id: "instructions", label: "Instructions" },
  { id: "skills", label: "Skills & activation" },
  { id: "context", label: "Context & memory" },
  { id: "tools", label: "Tools & permissions" },
  { id: "completion", label: "Completion contract" },
];

export const MISSION_CATALOG: readonly MissionCatalogEntry[] = [
  {
    id: "completion",
    code: "C1",
    title: "Completion without proof",
    layer: "skill + completion gate",
    failure: "A responsive UI change is declared complete before mobile browser evidence exists.",
    activeLayers: ["skills", "completion"],
  },
  {
    id: "handoff",
    code: "H2",
    title: "Broken context handoff",
    layer: "checkpoint + resume policy",
    failure: "A resumed session repeats work and loses the active blocker.",
    activeLayers: ["instructions", "context"],
  },
  {
    id: "retry",
    code: "R3",
    title: "Lost tool response",
    layer: "retry + reconciliation",
    failure: "An ambiguous write response causes a duplicate side effect.",
    activeLayers: ["instructions", "tools"],
  },
  {
    id: "authority",
    code: "A4",
    title: "Authority drift",
    layer: "capability lease + approval",
    failure: "Broad write authority survives its mission and is reused later.",
    activeLayers: ["tools"],
  },
];

export function getMissionCatalogEntry(
  missionId: ScenarioId,
): MissionCatalogEntry {
  const mission = MISSION_CATALOG.find((candidate) => candidate.id === missionId);
  if (!mission) throw new Error(`Unknown mission ${missionId}.`);
  return mission;
}
