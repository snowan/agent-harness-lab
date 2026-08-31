import type { ScenarioId } from "../domain/types";
import {
  SIGNAL_NAMES,
  deepFreeze,
  type FactTemplate,
  type ScenarioDefinition,
  type SignalName,
  type TrialKind,
} from "./types";

interface RoleObservation {
  readonly value: boolean;
  readonly detail: string;
}

interface SignalFixture {
  readonly key: string;
  readonly label: string;
  readonly title: string;
  readonly baseline: RoleObservation;
  readonly candidate: RoleObservation;
  readonly passedMessage: string;
  readonly failedMessage: string;
}

type TrialSignals = Readonly<Record<SignalName, SignalFixture>>;

interface DeclaredTrialFixture {
  readonly id: string;
  readonly version: string;
  readonly kind: TrialKind;
  readonly title: string;
  readonly purpose: string;
  readonly initialState: Readonly<Record<string, unknown>>;
  readonly baselineExpectation: "pass" | "fail";
  readonly signals: TrialSignals;
}

interface DeclaredHarnessFixture {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly rules: readonly string[];
}

interface DeclaredCandidateFixture extends DeclaredHarnessFixture {
  readonly patch: {
    readonly id: string;
    readonly layer: string;
    readonly hypothesis: string;
    readonly mechanism: string;
    readonly diff: readonly string[];
  };
}

interface DeclaredScenarioFixture {
  readonly id: Exclude<ScenarioId, "completion">;
  readonly version: string;
  readonly code: string;
  readonly title: string;
  readonly invariant: string;
  readonly invariantSignal: SignalName;
  readonly fixtureDisclosure: string;
  readonly baseline: DeclaredHarnessFixture;
  readonly candidate: DeclaredCandidateFixture;
  readonly trials: readonly [
    DeclaredTrialFixture,
    DeclaredTrialFixture,
    DeclaredTrialFixture,
  ];
  readonly expectedDigests: ScenarioDefinition["expectedDigests"];
  readonly limitations: readonly string[];
}

function factsFor(
  signals: TrialSignals,
  role: "baseline" | "candidate",
): readonly FactTemplate[] {
  return SIGNAL_NAMES.map((signal) => ({
    key: signals[signal].key,
    label: signals[signal].label,
    value: signals[signal][role].value,
    detail: signals[signal][role].detail,
  }));
}

export function createDeclaredFactsScenario(
  fixture: DeclaredScenarioFixture,
): ScenarioDefinition {
  const target = fixture.trials.find((trial) => trial.kind === "target");
  if (!target) throw new Error(`Scenario ${fixture.id} requires one target trial.`);
  const invariantAssertionId = `${target.id}.${fixture.invariantSignal}`;
  return deepFreeze({
    schemaVersion: 1,
    id: fixture.id,
    version: fixture.version,
    code: fixture.code,
    title: fixture.title,
    invariant: fixture.invariant,
    invariantAssertionId,
    fixtureDisclosure: fixture.fixtureDisclosure,
    engine: "declared-facts-v1",
    baseline: {
      id: fixture.baseline.id,
      role: "baseline",
      version: fixture.baseline.version,
      title: fixture.baseline.title,
      policy: { rules: fixture.baseline.rules },
    },
    candidate: {
      id: fixture.candidate.id,
      role: "candidate",
      version: fixture.candidate.version,
      title: fixture.candidate.title,
      policy: { rules: fixture.candidate.rules },
      patch: fixture.candidate.patch,
    },
    trials: fixture.trials.map((trial) => ({
      id: trial.id,
      version: trial.version,
      kind: trial.kind,
      title: trial.title,
      purpose: trial.purpose,
      initialState: trial.initialState,
      declaredFacts: {
        baseline: factsFor(trial.signals, "baseline"),
        candidate: factsFor(trial.signals, "candidate"),
      },
      expectedOutcome: {
        baseline: trial.baselineExpectation,
        candidate: "pass",
      },
    })),
    assertions: fixture.trials.flatMap((trial) =>
      SIGNAL_NAMES.map((signal) => {
        const declared = trial.signals[signal];
        return {
          id: `${trial.id}.${signal}`,
          trialId: trial.id,
          signal,
          title: declared.title,
          requirement: { factKey: declared.key, equals: true },
          passedMessage: declared.passedMessage,
          failedMessage: declared.failedMessage,
        };
      })
    ),
    expectedDigests: fixture.expectedDigests,
    limitations: fixture.limitations,
  });
}
