import {
  createCommandService,
  type CommandEffects,
} from "../../src/app/commands";
import { createLabStore } from "../../src/app/create-store";
import { scenarioEffects } from "../../src/app/scenario-effects";
import { createInitialLabState } from "../../src/domain/types";
import { createWebMcpExecutor } from "../../src/webmcp/execute";
import { createWebMcpRuntimeStore } from "../../src/webmcp/status";

export function createWebMcpHarness(effects: Partial<CommandEffects> = {}) {
  const store = createLabStore(createInitialLabState());
  let runSequence = 0;
  const commands = createCommandService({
    store,
    effects: {
      runBaseline: effects.runBaseline ?? scenarioEffects.runBaseline,
      runCandidateSuite: effects.runCandidateSuite ?? scenarioEffects.runCandidateSuite,
    },
    ids: {
      nextRunId(kind, state) {
        runSequence += 1;
        return `${state.missionId}-${kind}-${runSequence}`;
      },
    },
  });
  const runtime = createWebMcpRuntimeStore();
  const executor = createWebMcpExecutor({ store, commands, runtime });
  return { store, commands, runtime, executor };
}
