import {
  createCommandService,
  type CommandEffects,
} from "../../src/app/commands";
import { createLabStore } from "../../src/app/create-store";
import { scenarioEffects } from "../../src/app/scenario-effects";
import { createInitialLabState } from "../../src/domain/types";
import { createWebMcpExecutor } from "../../src/webmcp/execute";
import { buildEvidenceReceipt } from "../../src/receipts/build-receipt";
import { verifyEvidenceReceipt } from "../../src/receipts/validate-receipt";
import { createWebMcpRuntimeStore } from "../../src/webmcp/status";

export function createWebMcpHarness(
  effects: Partial<CommandEffects> = {},
  receiptOverrides: {
    readonly buildReceipt?: typeof buildEvidenceReceipt;
    readonly verifyReceipt?: typeof verifyEvidenceReceipt;
  } = {},
) {
  const store = createLabStore(createInitialLabState());
  let runSequence = 0;
  const commands = createCommandService({
    store,
    now: () => "2026-08-30T12:00:00.000Z",
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
  const executor = createWebMcpExecutor({
    store,
    commands,
    runtime,
    now: () => "2026-08-30T12:01:00.000Z",
    ...receiptOverrides,
  });
  return { store, commands, runtime, executor };
}
