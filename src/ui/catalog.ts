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

export const TOOL_CONTRACT_PREVIEW = [
  { name: "get_lab_state", mode: "read", summary: "Read mission, phase, runs, patch, and decision." },
  { name: "load_mission", mode: "command", summary: "Select one built-in failure fixture." },
  { name: "run_baseline", mode: "command", summary: "Replay the original deterministic harness." },
  { name: "inspect_trace", mode: "read", summary: "Read a bounded completed-run trace." },
  { name: "stage_harness_patch", mode: "command", summary: "Stage the fixture patch and causal hypothesis." },
  { name: "run_candidate_suite", mode: "command", summary: "Run the target plus two sealed trials." },
  { name: "compare_harnesses", mode: "read", summary: "Compare five evidence signals and risks." },
  { name: "export_evidence_receipt", mode: "read", summary: "Return a portable evidence record." },
] as const;
