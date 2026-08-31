import { LabDomainError } from "../domain/errors";
import {
  canonicalSha256,
  runScenarioBaseline,
  runScenarioSuite,
} from "../domain/evaluation";
import { getScenarioDefinition } from "../scenarios/registry";
import type { CommandEffects } from "./commands";

export const scenarioEffects: CommandEffects = {
  async runBaseline({ state }) {
    const scenario = getScenarioDefinition(state.missionId);
    if (!scenario) {
      throw new LabDomainError(
        "COMMAND_FAILED",
        `No deterministic fixture is registered for ${state.missionId}. Load a mission with an executable fixture.`,
      );
    }
    const result = await runScenarioBaseline(scenario);
    if (result.status !== "failed_as_expected") {
      throw new LabDomainError(
        "COMMAND_FAILED",
        `Fixture ${scenario.id}@${scenario.version} did not fail its declared invariant as expected. No workspace revision was committed.`,
      );
    }
    return result;
  },

  async runCandidateSuite({ state }) {
    const scenario = getScenarioDefinition(state.missionId);
    if (!scenario) {
      throw new LabDomainError(
        "COMMAND_FAILED",
        `${state.missionId} does not have a deterministic candidate suite yet.`,
      );
    }
    const stagedPatch = state.candidate;
    if (!stagedPatch) {
      throw new LabDomainError(
        "INVALID_INPUT",
        "The candidate suite requires a staged fixture patch.",
      );
    }
    const [stagedPatchDigest, fixturePatchDigest] = await Promise.all([
      canonicalSha256({
        id: stagedPatch.id,
        layer: stagedPatch.layer,
        diff: stagedPatch.diff,
      }),
      canonicalSha256({
        id: scenario.candidate.patch.id,
        layer: scenario.candidate.patch.layer,
        diff: scenario.candidate.patch.diff,
      }),
    ]);
    if (stagedPatchDigest !== fixturePatchDigest) {
      throw new LabDomainError(
        "INVALID_INPUT",
        `The staged patch does not match ${scenario.candidate.patch.id}. Reset the mission and stage the declared fixture patch.`,
      );
    }
    return runScenarioSuite(scenario);
  },
};
