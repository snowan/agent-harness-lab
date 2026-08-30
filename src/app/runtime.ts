import { LabDomainError } from "../domain/errors";
import { createInitialLabState } from "../domain/types";
import { createCommandService } from "./commands";
import { createLabStore } from "./create-store";

export const labStore = createLabStore(createInitialLabState());

let runSequence = 0;

export const labCommands = createCommandService({
  store: labStore,
  ids: {
    nextRunId(kind, state) {
      runSequence += 1;
      return `${state.missionId}-${kind}-${runSequence}`;
    },
  },
  effects: {
    async runBaseline() {
      throw new LabDomainError(
        "COMMAND_FAILED",
        "The selected mission does not have an executable fixture yet. Load a mission or inspect the workspace state.",
      );
    },
    async runCandidateSuite() {
      throw new LabDomainError(
        "COMMAND_FAILED",
        "The selected mission does not have an executable candidate suite yet. Review the staged workspace state.",
      );
    },
  },
});
