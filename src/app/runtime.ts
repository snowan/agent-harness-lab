import { createInitialLabState } from "../domain/types";
import { createCommandService } from "./commands";
import { createLabStore } from "./create-store";
import { scenarioEffects } from "./scenario-effects";

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
  effects: scenarioEffects,
});
