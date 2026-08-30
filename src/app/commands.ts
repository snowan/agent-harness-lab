import { LabDomainError, isLabDomainError } from "../domain/errors";
import { reduceLabEvents, reduceLabState } from "../domain/reducer";
import type {
  CommandContext,
  CommandResult,
  DomainEvent,
  LabCommand,
  LabState,
} from "../domain/types";
import { assertCommandAllowed } from "./guards";
import type { LabStore } from "./create-store";

export interface BaselineRunRequest {
  readonly state: LabState;
  readonly runId: string;
  readonly signal?: AbortSignal;
}

export interface CandidateRunRequest {
  readonly state: LabState;
  readonly runId: string;
  readonly signal?: AbortSignal;
}

export interface CommandEffects {
  readonly runBaseline: (request: BaselineRunRequest) => Promise<void>;
  readonly runCandidateSuite: (request: CandidateRunRequest) => Promise<void>;
}

export interface CommandIdFactory {
  readonly nextRunId: (kind: "baseline" | "candidate", state: LabState) => string;
}

export interface CommandService {
  readonly dispatch: (
    command: LabCommand,
    context: CommandContext,
  ) => Promise<CommandResult>;
}

interface CommandServiceDependencies {
  readonly store: LabStore;
  readonly effects: CommandEffects;
  readonly ids: CommandIdFactory;
}

interface CompletedCommand {
  readonly fingerprint: string;
  readonly result: CommandResult;
}

function commandFingerprint(command: LabCommand, context: CommandContext): string {
  const request = (() => {
    switch (command.type) {
      case "LOAD_MISSION":
        return [command.type, command.missionId];
      case "STAGE_PATCH":
        return [
          command.type,
          command.patch.id,
          command.patch.layer,
          command.patch.hypothesis,
        ];
      case "PROMOTE":
      case "REJECT":
        return [command.type, command.comparedRevision];
      case "RUN_BASELINE":
      case "RUN_CANDIDATE_SUITE":
      case "RESET":
        return [command.type];
    }
  })();

  return JSON.stringify([context.actor, context.source, request]);
}

function eventMeta(context: CommandContext, index: number) {
  return {
    id: `${context.commandId}:${index}`,
    commandId: context.commandId,
    actor: context.actor,
    source: context.source,
  } as const;
}

function abortIfRequested(context: CommandContext): void {
  if (context.signal?.aborted) {
    throw new LabDomainError(
      "COMMAND_ABORTED",
      `Command ${context.commandId} was cancelled before it changed the workspace. Retry when the operation should continue.`,
    );
  }
}

function assertCommandId(context: CommandContext): void {
  if (!context.commandId.trim()) {
    throw new LabDomainError(
      "INVALID_INPUT",
      "A command ID is required so retries can be reconciled safely.",
    );
  }
}

function commandFailure(
  command: LabCommand,
  state: LabState,
  error: unknown,
): LabDomainError {
  if (isLabDomainError(error)) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new LabDomainError(
    "COMMAND_FAILED",
    `${command.type} failed for mission ${state.missionId}: ${message}. The workspace remains at revision ${state.revision}; inspect the failure and retry.`,
    error instanceof Error ? { cause: error } : undefined,
  );
}

export function createCommandService({
  store,
  effects,
  ids,
}: CommandServiceDependencies): CommandService {
  const completed = new Map<string, CompletedCommand>();
  let activeCommandId: string | null = null;

  async function buildEvents(
    command: LabCommand,
    context: CommandContext,
    stableState: LabState,
  ): Promise<readonly DomainEvent[]> {
    switch (command.type) {
      case "LOAD_MISSION":
        return [
          {
            ...eventMeta(context, 0),
            type: "MISSION_LOADED",
            missionId: command.missionId,
          },
        ];

      case "RESET":
        return [
          {
            ...eventMeta(context, 0),
            type: "WORKSPACE_RESET",
          },
        ];

      case "RUN_BASELINE": {
        const runId = ids.nextRunId("baseline", stableState);
        const started: DomainEvent = {
          ...eventMeta(context, 0),
          type: "BASELINE_RUN_STARTED",
          runId,
        };
        const runningState = reduceLabState(stableState, started);
        await effects.runBaseline({
          state: runningState,
          runId,
          ...(context.signal ? { signal: context.signal } : {}),
        });
        abortIfRequested(context);
        return [
          started,
          {
            ...eventMeta(context, 1),
            type: "BASELINE_FAILED_AS_EXPECTED",
            runId,
          },
        ];
      }

      case "STAGE_PATCH":
        return [
          {
            ...eventMeta(context, 0),
            type: "PATCH_STAGED",
            patch: command.patch,
          },
        ];

      case "RUN_CANDIDATE_SUITE": {
        const runId = ids.nextRunId("candidate", stableState);
        const started: DomainEvent = {
          ...eventMeta(context, 0),
          type: "CANDIDATE_RUN_STARTED",
          runId,
        };
        const runningState = reduceLabState(stableState, started);
        await effects.runCandidateSuite({
          state: runningState,
          runId,
          ...(context.signal ? { signal: context.signal } : {}),
        });
        abortIfRequested(context);
        return [
          started,
          {
            ...eventMeta(context, 1),
            type: "CANDIDATE_SUITE_COMPLETED",
            runId,
          },
        ];
      }

      case "PROMOTE":
        return [
          {
            ...eventMeta(context, 0),
            type: "CANDIDATE_PROMOTED",
            decision: {
              outcome: "promoted",
              actor: "human",
              comparedRevision: command.comparedRevision,
            },
          },
        ];

      case "REJECT":
        return [
          {
            ...eventMeta(context, 0),
            type: "CANDIDATE_REJECTED",
            decision: {
              outcome: "rejected",
              actor: "human",
              comparedRevision: command.comparedRevision,
            },
          },
        ];
    }
  }

  return {
    async dispatch(command, context) {
      assertCommandId(context);
      abortIfRequested(context);

      const fingerprint = commandFingerprint(command, context);
      const replay = completed.get(context.commandId);
      if (replay) {
        if (replay.fingerprint !== fingerprint) {
          throw new LabDomainError(
            "INVALID_INPUT",
            `Command ID ${context.commandId} was already used for a different request. Use a new command ID for this command, actor, or source.`,
          );
        }
        return { ...replay.result, replayed: true };
      }

      if (activeCommandId) {
        throw new LabDomainError(
          "RUN_ALREADY_ACTIVE",
          `Command ${activeCommandId} is still running. Wait for it to finish before starting ${context.commandId}.`,
        );
      }

      const stableState = store.getState();
      assertCommandAllowed(stableState, command, context.actor);
      activeCommandId = context.commandId;

      try {
        const events = await buildEvents(command, context, stableState);
        const nextState = reduceLabEvents(stableState, events);
        store.commit(nextState);
        const result: CommandResult = {
          state: nextState,
          events,
          replayed: false,
        };
        completed.set(context.commandId, { fingerprint, result });
        return result;
      } catch (error) {
        throw commandFailure(command, stableState, error);
      } finally {
        activeCommandId = null;
      }
    },
  };
}
