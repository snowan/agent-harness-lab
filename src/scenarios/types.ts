export const SIGNAL_NAMES = [
  "activation",
  "adherence",
  "outcome",
  "evidence",
  "safety",
] as const;

export type SignalName = (typeof SIGNAL_NAMES)[number];
export type HarnessRole = "baseline" | "candidate";
export type TrialKind = "target" | "sealed";
export type FactValue = boolean | number | string;
export type AssertionStatus = "passed" | "failed" | "not_applicable";
export type RunStatus =
  | "passed"
  | "failed_as_expected"
  | "failed"
  | "unexpected_pass";

export type ChangeKind = "ui" | "docs";
export type ViewportId = "desktop" | "mobile_320";

export interface CompletionTrialInput {
  readonly changedFiles: readonly {
    readonly path: string;
    readonly kind: ChangeKind;
  }[];
  readonly allowedWritePaths: readonly string[];
  readonly desktop: {
    readonly overflowPx: number;
    readonly actionsReachable: boolean;
    readonly consoleErrorCount: number;
  };
  readonly mobile320: {
    readonly overflowPx: number;
    readonly actionsReachable: boolean;
    readonly consoleErrorCount: number;
  };
  readonly documentationValid: boolean;
}

export interface CompletionHarnessPolicy {
  readonly activationKinds: readonly ChangeKind[];
  readonly verificationMode: "manual_desktop" | "when_activated";
  readonly requiredViewports: readonly ViewportId[];
  readonly repairMode: "never" | "detected_only" | "always";
  readonly recheckAfterRepair: boolean;
  readonly completionGate: "advisory" | "require_browser_receipts";
  readonly additionalWritePaths: readonly string[];
  readonly externalWriteTargets: readonly string[];
}

export interface HarnessDefinition {
  readonly id: string;
  readonly role: HarnessRole;
  readonly version: string;
  readonly title: string;
  readonly policy: CompletionHarnessPolicy;
}

export interface HarnessPatchIdentity {
  readonly id: string;
  readonly layer: string;
  readonly diff: readonly string[];
}

export interface CandidateDefinition extends HarnessDefinition {
  readonly role: "candidate";
  readonly patch: HarnessPatchIdentity & {
    readonly hypothesis: string;
    readonly mechanism: string;
  };
}

export interface TrialSpec {
  readonly id: string;
  readonly version: string;
  readonly kind: TrialKind;
  readonly title: string;
  readonly purpose: string;
  readonly initialState: CompletionTrialInput;
  readonly expectedOutcome: {
    readonly baseline: "pass" | "fail";
    readonly candidate: "pass";
  };
}

export interface FactTemplate {
  readonly key: string;
  readonly label: string;
  readonly value: FactValue;
  readonly detail: string;
}

export interface FactExpectation {
  readonly factKey: string;
  readonly equals: FactValue;
}

export interface AssertionSpec {
  readonly id: string;
  readonly trialId: string;
  readonly signal: SignalName;
  readonly title: string;
  readonly requirement: FactExpectation;
  readonly applicableWhen?: FactExpectation;
  readonly passedMessage: string;
  readonly failedMessage: string;
  readonly notApplicableMessage?: string;
}

export interface ScenarioDefinition {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly code: string;
  readonly title: string;
  readonly invariant: string;
  readonly invariantAssertionId: string;
  readonly fixtureDisclosure: string;
  readonly engine: "completion-v1";
  readonly baseline: HarnessDefinition & { readonly role: "baseline" };
  readonly candidate: CandidateDefinition;
  readonly trials: readonly TrialSpec[];
  readonly assertions: readonly AssertionSpec[];
  readonly expectedDigests: {
    readonly baselineHarnessDefinition: string;
    readonly candidateHarnessDefinition: string;
    readonly evaluatedPatch: string;
    readonly trialInitialStates: Readonly<Record<string, string>>;
    readonly baselineTarget: string;
    readonly candidateTrials: Readonly<Record<string, string>>;
    readonly candidateSuite: string;
  };
  readonly limitations: readonly string[];
}

export interface RunFact extends FactTemplate {
  readonly id: string;
  readonly sequence: number;
}

export interface AssertionResult {
  readonly id: string;
  readonly assertionId: string;
  readonly signal: SignalName;
  readonly graderVersion: "1.0.0";
  readonly title: string;
  readonly status: AssertionStatus;
  readonly expected: FactValue;
  readonly actual: FactValue;
  readonly message: string;
  readonly evidenceFactIds: readonly string[];
}

export interface SignalSummary {
  readonly signal: SignalName;
  readonly passed: number;
  readonly failed: number;
  readonly notApplicable: number;
  readonly assertionResultIds: readonly string[];
  readonly evidenceFactIds: readonly string[];
}

export interface TrialRun {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scenarioTitle: string;
  readonly invariant: string;
  readonly fixtureDisclosure: string;
  readonly harnessId: string;
  readonly harnessVersion: string;
  readonly harnessDefinitionDigest: string;
  readonly harnessRole: HarnessRole;
  readonly trialId: string;
  readonly trialVersion: string;
  readonly trialKind: TrialKind;
  readonly trialTitle: string;
  readonly expectation: "pass" | "fail";
  readonly expectationMet: boolean;
  readonly status: RunStatus;
  readonly initialStateDigest: string;
  readonly facts: readonly RunFact[];
  readonly assertions: readonly AssertionResult[];
  readonly signals: readonly SignalSummary[];
  readonly limitations: readonly string[];
  readonly resultDigest: string;
}

export interface SuiteRun {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scenarioTitle: string;
  readonly harnessId: string;
  readonly harnessVersion: string;
  readonly harnessDefinitionDigest: string;
  readonly harnessRole: HarnessRole;
  readonly evaluatedPatch: HarnessPatchIdentity;
  readonly evaluatedPatchDigest: string;
  readonly status: "passed" | "failed";
  readonly runs: readonly TrialRun[];
  readonly signals: readonly SignalSummary[];
  readonly limitations: readonly string[];
  readonly resultDigest: string;
}

export interface SignalComparison {
  readonly signal: SignalName;
  readonly baseline: SignalSummary;
  readonly candidate: SignalSummary;
  readonly supportingAssertionResultIds: readonly string[];
  readonly supportingFactIds: readonly string[];
}

export interface HarnessComparison {
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly baselineRunId: string;
  readonly candidateRunId: string;
  readonly signals: readonly SignalComparison[];
  readonly sealedRuns: readonly TrialRun[];
  readonly unresolvedRisks: readonly string[];
  readonly limitations: readonly string[];
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
