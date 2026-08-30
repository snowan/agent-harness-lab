import { LabDomainError } from "../domain/errors";
import type {
  Actor,
  LabCommand,
  LabPhase,
  LabState,
  StableLabPhase,
} from "../domain/types";

const allowedPhaseByCommand: Readonly<
  Record<
    LabCommand["type"],
    "any_stable" | readonly StableLabPhase[]
  >
> = {
  LOAD_MISSION: "any_stable",
  RUN_BASELINE: ["mission_loaded"],
  STAGE_PATCH: ["baseline_failed"],
  RUN_CANDIDATE_SUITE: ["patch_staged"],
  PROMOTE: ["compared"],
  REJECT: ["compared"],
  RESET: "any_stable",
};

const runningPhases: readonly LabPhase[] = [
  "baseline_running",
  "candidate_running",
];

function validatePatch(command: Extract<LabCommand, { type: "STAGE_PATCH" }>): void {
  const hypothesis = command.patch.hypothesis.trim();
  if (!command.patch.id.trim() || !command.patch.layer.trim() || !hypothesis) {
    throw new LabDomainError(
      "INVALID_INPUT",
      "The candidate patch needs an ID, harness layer, and causal hypothesis before it can be staged.",
    );
  }
  if (hypothesis.length > 280) {
    throw new LabDomainError(
      "INVALID_INPUT",
      `The candidate hypothesis is ${hypothesis.length} characters. Keep it at or below 280 characters.`,
    );
  }
}

function assertHumanDecision(actor: Actor, command: LabCommand): void {
  if ((command.type === "PROMOTE" || command.type === "REJECT") && actor !== "human") {
    throw new LabDomainError(
      "ACTOR_NOT_AUTHORIZED",
      `${actor} cannot ${command.type.toLowerCase()} a candidate. Review the comparison and use the human decision controls.`,
    );
  }
}

export function assertCommandAllowed(
  state: LabState,
  command: LabCommand,
  actor: Actor,
): void {
  assertHumanDecision(actor, command);

  if (command.type === "STAGE_PATCH") {
    validatePatch(command);
  }

  if (
    (command.type === "PROMOTE" || command.type === "REJECT") &&
    command.comparedRevision !== state.revision
  ) {
    throw new LabDomainError(
      "STALE_REVISION",
      `The decision references revision ${command.comparedRevision}, but the current comparison is revision ${state.revision}. Review the latest comparison before deciding.`,
    );
  }

  const allowed = allowedPhaseByCommand[command.type];
  const currentIsStable = !runningPhases.includes(state.phase);
  const phaseAllowed =
    allowed === "any_stable"
      ? currentIsStable
      : allowed.includes(state.phase as StableLabPhase);

  if (!phaseAllowed) {
    const expected =
      allowed === "any_stable" ? "a stable workspace" : allowed.join(" or ");
    throw new LabDomainError(
      "ILLEGAL_TRANSITION",
      `${command.type} cannot run while the workspace is ${state.phase}. Continue from ${expected}.`,
    );
  }
}

export function isCommandAllowed(
  state: LabState,
  command: LabCommand,
  actor: Actor,
): boolean {
  try {
    assertCommandAllowed(state, command, actor);
    return true;
  } catch {
    return false;
  }
}
