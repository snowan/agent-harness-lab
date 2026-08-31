import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  runScenarioBaseline,
  runScenarioSuite,
  verifySuiteRun,
  verifyTrialRun,
} from "../../src/domain/evaluation";
import type { ScenarioId } from "../../src/domain/types";
import { getScenarioDefinition } from "../../src/scenarios/registry";
import { SIGNAL_NAMES } from "../../src/scenarios/types";

const scenarioIds = ["completion", "handoff", "retry", "authority"] as const;

function scenario(id: ScenarioId) {
  const found = getScenarioDefinition(id);
  if (!found) throw new Error(`Missing scenario ${id}.`);
  return found;
}

describe("complete deterministic scenario catalog", () => {
  it.each(scenarioIds)("registers immutable target and sealed fixtures for %s", (id) => {
    const fixture = scenario(id);
    const target = fixture.trials.filter((trial) => trial.kind === "target");
    const sealed = fixture.trials.filter((trial) => trial.kind === "sealed");
    const assertionSignals = new Set(fixture.assertions.map((assertion) => assertion.signal));

    expect(Object.isFrozen(fixture)).toBe(true);
    expect(Object.isFrozen(fixture.trials)).toBe(true);
    expect(Object.isFrozen(fixture.candidate.patch.diff)).toBe(true);
    expect(target).toHaveLength(1);
    expect(sealed).toHaveLength(2);
    expect(new Set(fixture.trials.map((trial) => trial.id)).size).toBe(3);
    expect([...assertionSignals]).toEqual(expect.arrayContaining([...SIGNAL_NAMES]));
    for (const trial of fixture.trials) {
      const signals = new Set(
        fixture.assertions
          .filter((assertion) => assertion.trialId === trial.id)
          .map((assertion) => assertion.signal),
      );
      expect([...signals]).toEqual(expect.arrayContaining([...SIGNAL_NAMES]));
      expect(signals.size).toBe(SIGNAL_NAMES.length);
    }
  });

  it.each(scenarioIds)("reproduces reviewed golden digests for %s", async (id) => {
    const fixture = scenario(id);
    const baseline = await runScenarioBaseline(fixture);
    const suite = await runScenarioSuite(fixture);

    await verifyTrialRun(fixture, baseline);
    await verifySuiteRun(fixture, suite);
    expect(baseline).toMatchObject({
      status: "failed_as_expected",
      expectationMet: true,
      resultDigest: fixture.expectedDigests.baselineTarget,
      harnessDefinitionDigest: fixture.expectedDigests.baselineHarnessDefinition,
    });
    expect(suite).toMatchObject({
      status: "passed",
      resultDigest: fixture.expectedDigests.candidateSuite,
      evaluatedPatchDigest: fixture.expectedDigests.evaluatedPatch,
      harnessDefinitionDigest: fixture.expectedDigests.candidateHarnessDefinition,
    });
    expect(suite.runs).toHaveLength(3);
    expect(suite.runs.filter((run) => run.trialKind === "sealed")).toHaveLength(2);
    expect(suite.signals.map((summary) => summary.signal)).toEqual(SIGNAL_NAMES);
    for (const run of suite.runs) {
      expect(run).toMatchObject({
        status: "passed",
        expectationMet: true,
        initialStateDigest: fixture.expectedDigests.trialInitialStates[run.trialId],
        resultDigest: fixture.expectedDigests.candidateTrials[run.trialId],
      });
    }
  });

  it.each(scenarioIds)("is byte-for-byte deterministic across repeated runs for %s", async (id) => {
    const fixture = scenario(id);
    const first = canonicalJson({
      baseline: await runScenarioBaseline(fixture),
      suite: await runScenarioSuite(fixture),
    });
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const repeated = canonicalJson({
        baseline: await runScenarioBaseline(fixture),
        suite: await runScenarioSuite(fixture),
      });
      expect(repeated).toBe(first);
    }
  });
});
