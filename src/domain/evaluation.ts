import {
  SIGNAL_NAMES,
  deepFreeze,
  type AssertionResult,
  type AssertionSpec,
  type CompletionHarnessPolicy,
  type CompletionTrialInput,
  type FactTemplate,
  type FactExpectation,
  type FactValue,
  type HarnessComparison,
  type HarnessDefinition,
  type HarnessPatchIdentity,
  type HarnessRole,
  type RunFact,
  type RunStatus,
  type ScenarioDefinition,
  type SignalComparison,
  type SignalName,
  type SignalSummary,
  type SuiteRun,
  type TrialSpec,
  type TrialRun,
} from "../scenarios/types";

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function normalizeCanonical(value: unknown, seen: Set<object>): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not support non-finite numbers.");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`Canonical JSON does not support ${typeof value} values.`);
  }
  if (seen.has(value)) {
    throw new TypeError("Canonical JSON does not support cyclic values.");
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) {
        throw new TypeError("Canonical JSON does not support sparse arrays.");
      }
      return value.map((item) => normalizeCanonical(item, seen));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON supports only arrays and plain objects.");
    }
    if (Object.getOwnPropertySymbols(value).length) {
      throw new TypeError("Canonical JSON does not support symbol keys.");
    }

    const normalized: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeCanonical(
        (value as Record<string, unknown>)[key],
        seen,
      );
    }
    return normalized;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonical(value, new Set()));
}

export async function canonicalSha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `sha256:${hex}`;
}

function findFact(
  facts: readonly RunFact[],
  expectation: FactExpectation,
  assertionId: string,
): RunFact {
  const fact = facts.find((candidate) => candidate.key === expectation.factKey);
  if (!fact) {
    throw new Error(
      `Assertion ${assertionId} references missing fact ${expectation.factKey}.`,
    );
  }
  return fact;
}

function matches(fact: RunFact, expectation: FactExpectation): boolean {
  return fact.value === expectation.equals;
}

function gradeAssertion(
  runId: string,
  spec: AssertionSpec,
  facts: readonly RunFact[],
): AssertionResult {
  const requirementFact = findFact(facts, spec.requirement, spec.id);
  const evidenceFactIds = [requirementFact.id];

  if (spec.applicableWhen) {
    const applicabilityFact = findFact(facts, spec.applicableWhen, spec.id);
    evidenceFactIds.unshift(applicabilityFact.id);
    if (!matches(applicabilityFact, spec.applicableWhen)) {
      return deepFreeze({
        id: `${runId}:assertion:${spec.id}`,
        assertionId: spec.id,
        signal: spec.signal,
        graderVersion: "1.0.0",
        title: spec.title,
        status: "not_applicable",
        expected: spec.requirement.equals,
        actual: requirementFact.value,
        message: spec.notApplicableMessage ?? "This requirement is not applicable.",
        evidenceFactIds: [...new Set(evidenceFactIds)],
      });
    }
  }

  const passed = matches(requirementFact, spec.requirement);
  return deepFreeze({
    id: `${runId}:assertion:${spec.id}`,
    assertionId: spec.id,
    signal: spec.signal,
    graderVersion: "1.0.0",
    title: spec.title,
    status: passed ? "passed" : "failed",
    expected: spec.requirement.equals,
    actual: requirementFact.value,
    message: passed ? spec.passedMessage : spec.failedMessage,
    evidenceFactIds: [...new Set(evidenceFactIds)],
  });
}

function gradeSignal(
  signal: SignalName,
  runId: string,
  specs: readonly AssertionSpec[],
  facts: readonly RunFact[],
): readonly AssertionResult[] {
  return specs
    .filter((spec) => spec.signal === signal)
    .map((spec) => gradeAssertion(runId, spec, facts));
}

export function gradeActivation(
  runId: string,
  specs: readonly AssertionSpec[],
  facts: readonly RunFact[],
): readonly AssertionResult[] {
  return gradeSignal("activation", runId, specs, facts);
}

export function gradeAdherence(
  runId: string,
  specs: readonly AssertionSpec[],
  facts: readonly RunFact[],
): readonly AssertionResult[] {
  return gradeSignal("adherence", runId, specs, facts);
}

export function gradeOutcome(
  runId: string,
  specs: readonly AssertionSpec[],
  facts: readonly RunFact[],
): readonly AssertionResult[] {
  return gradeSignal("outcome", runId, specs, facts);
}

export function gradeEvidence(
  runId: string,
  specs: readonly AssertionSpec[],
  facts: readonly RunFact[],
): readonly AssertionResult[] {
  return gradeSignal("evidence", runId, specs, facts);
}

export function gradeSafety(
  runId: string,
  specs: readonly AssertionSpec[],
  facts: readonly RunFact[],
): readonly AssertionResult[] {
  return gradeSignal("safety", runId, specs, facts);
}

const graders = [
  gradeActivation,
  gradeAdherence,
  gradeOutcome,
  gradeEvidence,
  gradeSafety,
] as const;

export function summarizeSignals(
  assertions: readonly AssertionResult[],
): readonly SignalSummary[] {
  return SIGNAL_NAMES.map((signal) => {
    const selected = assertions.filter((result) => result.signal === signal);
    return deepFreeze({
      signal,
      passed: selected.filter((result) => result.status === "passed").length,
      failed: selected.filter((result) => result.status === "failed").length,
      notApplicable: selected.filter(
        (result) => result.status === "not_applicable",
      ).length,
      assertionResultIds: selected.map((result) => result.id),
      evidenceFactIds: [
        ...new Set(selected.flatMap((result) => result.evidenceFactIds)),
      ],
    });
  });
}

type TrialRunWithoutDigest = Omit<TrialRun, "resultDigest">;

export function assertTraceableRun(
  scenario: ScenarioDefinition,
  run: TrialRunWithoutDigest,
): void {
  const trial = scenario.trials.find((candidate) => candidate.id === run.trialId);
  if (!trial) {
    throw new Error(`Run ${run.id} references undeclared trial ${run.trialId}.`);
  }
  const harness = harnessFor(scenario, run.harnessRole);
  const expectedRunId = [
    scenario.id,
    scenario.version,
    run.harnessRole,
    harness.version,
    trial.id,
  ].join(":");
  const expectedMetadata = {
    schemaVersion: 1,
    id: expectedRunId,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    scenarioTitle: scenario.title,
    invariant: scenario.invariant,
    fixtureDisclosure: scenario.fixtureDisclosure,
    harnessId: harness.id,
    harnessVersion: harness.version,
    harnessRole: run.harnessRole,
    trialId: trial.id,
    trialVersion: trial.version,
    trialKind: trial.kind,
    trialTitle: trial.title,
    limitations: scenario.limitations,
  };
  const actualMetadata = {
    schemaVersion: run.schemaVersion,
    id: run.id,
    scenarioId: run.scenarioId,
    scenarioVersion: run.scenarioVersion,
    scenarioTitle: run.scenarioTitle,
    invariant: run.invariant,
    fixtureDisclosure: run.fixtureDisclosure,
    harnessId: run.harnessId,
    harnessVersion: run.harnessVersion,
    harnessRole: run.harnessRole,
    trialId: run.trialId,
    trialVersion: run.trialVersion,
    trialKind: run.trialKind,
    trialTitle: run.trialTitle,
    limitations: run.limitations,
  };
  if (canonicalJson(actualMetadata) !== canonicalJson(expectedMetadata)) {
    throw new Error(`Run ${run.id} metadata does not match the declared fixture.`);
  }

  const expectedFacts = interpretTrial(scenario, harness, trial).map(
    (template, sequence) => ({
      ...template,
      id: `${expectedRunId}:fact:${template.key}`,
      sequence,
    }),
  );
  if (canonicalJson(run.facts) !== canonicalJson(expectedFacts)) {
    throw new Error(`Run ${run.id} facts are not derived from its trial and harness.`);
  }

  const factIds = new Set<string>();
  run.facts.forEach((fact, index) => {
    if (fact.sequence !== index) {
      throw new Error(
        `Run ${run.id} fact ${fact.id} has sequence ${fact.sequence}; expected ${index}.`,
      );
    }
    if (factIds.has(fact.id)) {
      throw new Error(`Run ${run.id} contains duplicate fact ID ${fact.id}.`);
    }
    factIds.add(fact.id);
  });

  const assertionIds = new Set<string>();
  for (const assertion of run.assertions) {
    if (assertionIds.has(assertion.id)) {
      throw new Error(
        `Run ${run.id} contains duplicate assertion result ${assertion.id}.`,
      );
    }
    assertionIds.add(assertion.id);
    const uniqueEvidence = new Set(assertion.evidenceFactIds);
    if (uniqueEvidence.size !== assertion.evidenceFactIds.length) {
      throw new Error(`Assertion ${assertion.id} repeats an evidence fact ID.`);
    }
    for (const evidenceFactId of assertion.evidenceFactIds) {
      if (!factIds.has(evidenceFactId)) {
        throw new Error(
          `Assertion ${assertion.id} references unknown fact ${evidenceFactId}.`,
        );
      }
    }
  }

  const specs = scenario.assertions.filter((spec) => spec.trialId === trial.id);
  const expectedAssertions = graders.flatMap((grader) =>
    grader(expectedRunId, specs, run.facts)
  );
  if (canonicalJson(run.assertions) !== canonicalJson(expectedAssertions)) {
    throw new Error(`Run ${run.id} assertions are not derived from its declared graders.`);
  }

  const expectedSignals = summarizeSignals(expectedAssertions);
  if (canonicalJson(expectedSignals) !== canonicalJson(run.signals)) {
    throw new Error(`Run ${run.id} contains a signal summary that is not derived from its assertions.`);
  }

  const expected = run.harnessRole === "candidate"
    ? "pass"
    : trial.expectedOutcome.baseline;
  const derivedStatus = deriveRunStatus(
    expected,
    expectedAssertions,
    scenario.invariantAssertionId,
  );
  if (
    run.expectation !== expected
    || run.expectationMet !== derivedStatus.expectationMet
    || run.status !== derivedStatus.status
  ) {
    throw new Error(`Run ${run.id} status is not derived from its assertion results.`);
  }
}

export async function verifyTrialRun(
  scenario: ScenarioDefinition,
  run: TrialRun,
): Promise<void> {
  const { resultDigest, ...causalResult } = run;
  assertTraceableRun(scenario, causalResult);
  const trial = scenario.trials.find((candidate) => candidate.id === run.trialId);
  if (!trial) throw new Error(`Run ${run.id} references an unknown trial.`);
  const harness = harnessFor(scenario, run.harnessRole);
  const [initialStateDigest, harnessDefinitionDigest] = await Promise.all([
    canonicalSha256(trial.initialState),
    canonicalSha256(harness),
  ]);
  if (run.initialStateDigest !== initialStateDigest) {
    throw new Error(`Run ${run.id} initial-state digest does not match its trial.`);
  }
  if (run.harnessDefinitionDigest !== harnessDefinitionDigest) {
    throw new Error(`Run ${run.id} harness digest does not match its definition.`);
  }
  const recomputed = await canonicalSha256(causalResult);
  if (resultDigest !== recomputed) {
    throw new Error(`Run ${run.id} result digest does not match its causal data.`);
  }
}

function deriveRunStatus(
  expected: "pass" | "fail",
  assertions: readonly AssertionResult[],
  invariantAssertionId: string,
): { readonly status: RunStatus; readonly expectationMet: boolean } {
  const failed = assertions.some((result) => result.status === "failed");
  if (expected === "fail") {
    const invariant = assertions.find(
      (result) => result.assertionId === invariantAssertionId,
    );
    if (!invariant) {
      throw new Error(`Run is missing invariant assertion ${invariantAssertionId}.`);
    }
    return failed && invariant.status === "failed"
      ? { status: "failed_as_expected", expectationMet: true }
      : { status: "unexpected_pass", expectationMet: false };
  }
  return failed
    ? { status: "failed", expectationMet: false }
    : { status: "passed", expectationMet: true };
}

function harnessFor(
  scenario: ScenarioDefinition,
  role: HarnessRole,
) {
  return role === "baseline" ? scenario.baseline : scenario.candidate;
}

function completionFacts(
  input: CompletionTrialInput,
  policy: CompletionHarnessPolicy,
): readonly FactTemplate[] {
  const changedKinds = new Set(input.changedFiles.map((file) => file.kind));
  const uiChanged = changedKinds.has("ui");
  const browserQaLoaded = policy.activationKinds.some((kind) =>
    changedKinds.has(kind)
  );
  const checkedViewports = new Set<"desktop" | "mobile_320">();
  if (policy.verificationMode === "manual_desktop" && uiChanged) {
    checkedViewports.add("desktop");
  } else if (policy.verificationMode === "when_activated" && browserQaLoaded) {
    for (const viewport of policy.requiredViewports) {
      checkedViewports.add(viewport);
    }
  }

  const overflowDetected = (
    checkedViewports.has("desktop") && input.desktop.overflowPx > 0
  ) || (
    checkedViewports.has("mobile_320") && input.mobile320.overflowPx > 0
  );
  const repairApplied = uiChanged && (
    policy.repairMode === "always"
    || (policy.repairMode === "detected_only" && overflowDetected)
  );
  const recheckedViewports = new Set<"desktop" | "mobile_320">();
  if (repairApplied && policy.recheckAfterRepair) {
    for (const viewport of policy.requiredViewports) {
      if (checkedViewports.has(viewport)) recheckedViewports.add(viewport);
    }
  }
  const repairRechecked = repairApplied
    && policy.requiredViewports.every((viewport) =>
      recheckedViewports.has(viewport)
    );

  const finalDesktop = {
    noOverflow: repairApplied || input.desktop.overflowPx <= 0,
    actionsReachable: repairApplied || input.desktop.actionsReachable,
  };
  const finalMobile = {
    noOverflow: repairApplied || input.mobile320.overflowPx <= 0,
    actionsReachable: repairApplied || input.mobile320.actionsReachable,
  };
  const consoleClean = input.desktop.consoleErrorCount === 0
    && input.mobile320.consoleErrorCount === 0;
  const desktopReceipt = repairApplied
    ? recheckedViewports.has("desktop")
    : checkedViewports.has("desktop");
  const mobileReceipt = repairApplied
    ? recheckedViewports.has("mobile_320")
    : checkedViewports.has("mobile_320");
  const acceptancePassed = finalDesktop.noOverflow
    && finalDesktop.actionsReachable
    && finalMobile.noOverflow
    && finalMobile.actionsReachable
    && consoleClean;
  const receiptsCited = !uiChanged || (
    policy.completionGate === "require_browser_receipts"
    && desktopReceipt
    && mobileReceipt
    && acceptancePassed
  );
  const actualWritePaths = [
    ...input.changedFiles.map((file) => file.path),
    ...policy.additionalWritePaths,
  ];
  const scopePreserved = actualWritePaths.every((path) =>
    input.allowedWritePaths.includes(path)
  );

  const fact = (
    key: string,
    label: string,
    value: FactValue,
    detail: string,
  ): FactTemplate => ({ key, label, value, detail });

  return [
    fact(
      "change.kind",
      "Changed-file category",
      uiChanged ? "ui" : "docs",
      input.changedFiles.map((file) => file.path).join(", "),
    ),
    fact(
      "artifact.browser_qa.loaded",
      "Browser QA activation",
      browserQaLoaded,
      browserQaLoaded
        ? "The harness activation policy loaded browser QA."
        : "The harness activation policy left browser QA inactive.",
    ),
    fact(
      "check.count",
      "Browser check count",
      checkedViewports.size + recheckedViewports.size,
      `${checkedViewports.size} initial and ${recheckedViewports.size} post-repair viewport checks ran.`,
    ),
    fact(
      "check.desktop.executed",
      "Desktop check",
      checkedViewports.has("desktop"),
      checkedViewports.has("desktop")
        ? "The desktop viewport was checked before any repair."
        : "No desktop check ran.",
    ),
    fact(
      "check.mobile_320.executed",
      "320 px check",
      checkedViewports.has("mobile_320"),
      checkedViewports.has("mobile_320")
        ? "The 320 px viewport was checked before any repair."
        : "No 320 px check ran.",
    ),
    fact(
      "repair.applied",
      "Responsive repair",
      repairApplied,
      repairApplied
        ? "The harness repaired overflow detected by its viewport policy."
        : "The harness applied no responsive repair.",
    ),
    fact(
      "repair.rechecked",
      "Repair recheck",
      repairRechecked,
      repairRechecked
        ? "All required viewports were rechecked after repair."
        : "No complete post-repair replay was recorded.",
    ),
    fact(
      "outcome.desktop.no_overflow",
      "Desktop overflow",
      finalDesktop.noOverflow,
      finalDesktop.noOverflow ? "The desktop layout fits." : "The desktop layout overflows.",
    ),
    fact(
      "outcome.desktop.actions_reachable",
      "Desktop actions",
      finalDesktop.actionsReachable,
      finalDesktop.actionsReachable
        ? "Desktop actions remain reachable."
        : "A desktop action is unreachable.",
    ),
    fact(
      "outcome.console_clean",
      "Console health",
      consoleClean,
      consoleClean ? "No console errors were recorded." : "A console error was recorded.",
    ),
    fact(
      "outcome.mobile_320.no_overflow",
      "320 px overflow",
      finalMobile.noOverflow,
      finalMobile.noOverflow
        ? "The 320 px layout fits."
        : `The layout exceeds 320 px by ${input.mobile320.overflowPx}px.`,
    ),
    fact(
      "outcome.mobile_320.actions_reachable",
      "320 px actions",
      finalMobile.actionsReachable,
      finalMobile.actionsReachable
        ? "Mobile actions remain reachable."
        : "Overflow hides a required mobile action.",
    ),
    fact(
      "outcome.documentation_preserved",
      "Documentation result",
      input.documentationValid,
      input.documentationValid
        ? "The documentation remains valid."
        : "The documentation is invalid.",
    ),
    fact(
      "receipt.change",
      "Change receipt",
      input.changedFiles.length > 0,
      "The changed-file set is recorded.",
    ),
    fact(
      "receipt.desktop",
      "Desktop receipt",
      desktopReceipt,
      desktopReceipt ? "A desktop receipt exists." : "The desktop receipt is absent.",
    ),
    fact(
      "receipt.mobile_320",
      "320 px receipt",
      mobileReceipt,
      mobileReceipt ? "A 320 px receipt exists." : "The 320 px receipt is absent.",
    ),
    fact(
      "completion.receipts_cited",
      "Completion evidence",
      receiptsCited,
      receiptsCited
        ? "The completion contract is satisfied."
        : "The completion claim lacks required passing browser receipts.",
    ),
    fact(
      "safety.scope_preserved",
      "Workspace scope",
      scopePreserved,
      scopePreserved
        ? "Every write stays inside the declared workspace scope."
        : "A write falls outside the declared workspace scope.",
    ),
    fact(
      "safety.external_write_absent",
      "External effects",
      policy.externalWriteTargets.length === 0,
      policy.externalWriteTargets.length === 0
        ? "No external write occurred."
        : `External writes targeted ${policy.externalWriteTargets.join(", ")}.`,
    ),
  ];
}

function interpretTrial(
  scenario: ScenarioDefinition,
  harness: HarnessDefinition,
  trial: TrialSpec,
): readonly FactTemplate[] {
  switch (scenario.engine) {
    case "completion-v1":
      return completionFacts(
        trial.initialState as CompletionTrialInput,
        harness.policy as CompletionHarnessPolicy,
      );
    case "declared-facts-v1": {
      const declared = trial.declaredFacts?.[harness.role];
      if (!declared) {
        throw new Error(
          `Scenario ${scenario.id} trial ${trial.id} does not declare ${harness.role} facts.`,
        );
      }
      return declared;
    }
  }
}

export async function runScenarioTrial(
  scenario: ScenarioDefinition,
  role: HarnessRole,
  trialId: string,
): Promise<TrialRun> {
  const trial = scenario.trials.find((candidate) => candidate.id === trialId);
  if (!trial) {
    throw new Error(`Scenario ${scenario.id} does not declare trial ${trialId}.`);
  }
  const harness = harnessFor(scenario, role);
  const runId = [
    scenario.id,
    scenario.version,
    role,
    harness.version,
    trial.id,
  ].join(":");
  const factKeys = new Set<string>();
  const facts = interpretTrial(scenario, harness, trial).map((template, sequence) => {
    if (factKeys.has(template.key)) {
      throw new Error(`Run ${runId} declares duplicate fact ${template.key}.`);
    }
    factKeys.add(template.key);
    return deepFreeze({
      ...template,
      id: `${runId}:fact:${template.key}`,
      sequence,
    });
  });
  const specs = scenario.assertions.filter((spec) => spec.trialId === trial.id);
  const assertionIds = new Set<string>();
  for (const spec of specs) {
    if (assertionIds.has(spec.id)) {
      throw new Error(`Run ${runId} declares duplicate assertion ${spec.id}.`);
    }
    assertionIds.add(spec.id);
  }
  const assertions = graders.flatMap((grader) => grader(runId, specs, facts));
  const signals = summarizeSignals(assertions);
  const expected = role === "candidate"
    ? "pass"
    : trial.expectedOutcome.baseline;
  const { status, expectationMet } = deriveRunStatus(
    expected,
    assertions,
    scenario.invariantAssertionId,
  );
  const initialStateDigest = await canonicalSha256(trial.initialState);
  const harnessDefinitionDigest = await canonicalSha256(harness);
  const causalResult = {
    schemaVersion: 1 as const,
    id: runId,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    scenarioTitle: scenario.title,
    invariant: scenario.invariant,
    fixtureDisclosure: scenario.fixtureDisclosure,
    harnessId: harness.id,
    harnessVersion: harness.version,
    harnessDefinitionDigest,
    harnessRole: role,
    trialId: trial.id,
    trialVersion: trial.version,
    trialKind: trial.kind,
    trialTitle: trial.title,
    expectation: expected,
    expectationMet,
    status,
    initialStateDigest,
    facts,
    assertions,
    signals,
    limitations: scenario.limitations,
  };
  assertTraceableRun(scenario, causalResult);
  const resultDigest = await canonicalSha256(causalResult);
  return deepFreeze({ ...causalResult, resultDigest });
}

export async function runScenarioBaseline(
  scenario: ScenarioDefinition,
): Promise<TrialRun> {
  const target = scenario.trials.find((trial) => trial.kind === "target");
  if (!target) {
    throw new Error(`Scenario ${scenario.id} does not declare a target trial.`);
  }
  return runScenarioTrial(scenario, "baseline", target.id);
}

export async function runScenarioSuite(
  scenario: ScenarioDefinition,
): Promise<SuiteRun> {
  const role = "candidate" as const;
  const runs: TrialRun[] = [];
  for (const trial of scenario.trials) {
    runs.push(await runScenarioTrial(scenario, role, trial.id));
  }
  const targetRuns = runs.filter((run) => run.trialKind === "target");
  const sealedRuns = runs.filter((run) => run.trialKind === "sealed");
  const uniqueTrialIds = new Set(runs.map((run) => run.trialId));
  if (targetRuns.length !== 1 || sealedRuns.length !== 2) {
    throw new Error(
      `Scenario ${scenario.id} suite must contain one target and exactly two sealed trials.`,
    );
  }
  if (uniqueTrialIds.size !== runs.length) {
    throw new Error(`Scenario ${scenario.id} suite contains duplicate trial IDs.`);
  }
  const harness = harnessFor(scenario, role);
  const evaluatedPatch: HarnessPatchIdentity = deepFreeze({
    id: scenario.candidate.patch.id,
    layer: scenario.candidate.patch.layer,
    diff: [...scenario.candidate.patch.diff],
  });
  const suiteId = [
    scenario.id,
    scenario.version,
    role,
    harness.version,
    "suite",
  ].join(":");
  const signals = summarizeSignals(runs.flatMap((run) => run.assertions));
  const causalResult = {
    schemaVersion: 1 as const,
    id: suiteId,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    scenarioTitle: scenario.title,
    harnessId: harness.id,
    harnessVersion: harness.version,
    harnessDefinitionDigest: await canonicalSha256(harness),
    harnessRole: role,
    evaluatedPatch,
    evaluatedPatchDigest: await canonicalSha256(evaluatedPatch),
    status: runs.every((run) => run.status === "passed")
      ? "passed" as const
      : "failed" as const,
    runs,
    signals,
    limitations: scenario.limitations,
  };
  const resultDigest = await canonicalSha256(causalResult);
  const result = deepFreeze({ ...causalResult, resultDigest });
  await verifySuiteRun(scenario, result);
  return result;
}

export function assertTraceableSuite(
  scenario: ScenarioDefinition,
  suite: SuiteRun,
): void {
  const harness = scenario.candidate;
  const expectedId = [
    scenario.id,
    scenario.version,
    "candidate",
    harness.version,
    "suite",
  ].join(":");
  const expectedMetadata = {
    schemaVersion: 1,
    id: expectedId,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    scenarioTitle: scenario.title,
    harnessId: harness.id,
    harnessVersion: harness.version,
    harnessRole: "candidate",
    limitations: scenario.limitations,
  };
  const actualMetadata = {
    schemaVersion: suite.schemaVersion,
    id: suite.id,
    scenarioId: suite.scenarioId,
    scenarioVersion: suite.scenarioVersion,
    scenarioTitle: suite.scenarioTitle,
    harnessId: suite.harnessId,
    harnessVersion: suite.harnessVersion,
    harnessRole: suite.harnessRole,
    limitations: suite.limitations,
  };
  if (canonicalJson(actualMetadata) !== canonicalJson(expectedMetadata)) {
    throw new Error(`Suite ${suite.id} metadata does not match the candidate fixture.`);
  }
  const expectedPatch: HarnessPatchIdentity = {
    id: scenario.candidate.patch.id,
    layer: scenario.candidate.patch.layer,
    diff: scenario.candidate.patch.diff,
  };
  if (canonicalJson(suite.evaluatedPatch) !== canonicalJson(expectedPatch)) {
    throw new Error(`Suite ${suite.id} is not bound to the declared candidate patch.`);
  }
  if (
    suite.runs.length !== scenario.trials.length
    || suite.runs.some((run, index) => run.trialId !== scenario.trials[index]?.id)
  ) {
    throw new Error(`Suite ${suite.id} does not preserve the declared trial order.`);
  }
  const targetCount = suite.runs.filter((run) => run.trialKind === "target").length;
  const sealedCount = suite.runs.filter((run) => run.trialKind === "sealed").length;
  if (targetCount !== 1 || sealedCount !== 2) {
    throw new Error(`Suite ${suite.id} must contain one target and exactly two sealed runs.`);
  }
  for (const run of suite.runs) {
    if (run.harnessRole !== "candidate") {
      throw new Error(`Suite ${suite.id} contains non-candidate run ${run.id}.`);
    }
    const { resultDigest: _resultDigest, ...causalResult } = run;
    assertTraceableRun(scenario, causalResult);
  }
  const expectedSignals = summarizeSignals(
    suite.runs.flatMap((run) => run.assertions),
  );
  if (canonicalJson(suite.signals) !== canonicalJson(expectedSignals)) {
    throw new Error(`Suite ${suite.id} signal summary is not derived from its runs.`);
  }
  const expectedStatus = suite.runs.every((run) => run.status === "passed")
    ? "passed"
    : "failed";
  if (suite.status !== expectedStatus) {
    throw new Error(`Suite ${suite.id} status is not derived from its trial runs.`);
  }
}

export async function verifySuiteRun(
  scenario: ScenarioDefinition,
  suite: SuiteRun,
): Promise<void> {
  assertTraceableSuite(scenario, suite);
  const harness = scenario.candidate;
  const expectedPatch: HarnessPatchIdentity = {
    id: scenario.candidate.patch.id,
    layer: scenario.candidate.patch.layer,
    diff: scenario.candidate.patch.diff,
  };
  const expectedPatchDigest = await canonicalSha256(expectedPatch);
  if (suite.evaluatedPatchDigest !== expectedPatchDigest) {
    throw new Error(`Suite ${suite.id} patch digest does not match its candidate patch.`);
  }
  for (const run of suite.runs) {
    await verifyTrialRun(scenario, run);
  }
  const harnessDefinitionDigest = await canonicalSha256(harness);
  if (suite.harnessDefinitionDigest !== harnessDefinitionDigest) {
    throw new Error(`Suite ${suite.id} harness digest does not match its definition.`);
  }
  const { resultDigest, ...causalResult } = suite;
  const recomputed = await canonicalSha256(causalResult);
  if (resultDigest !== recomputed) {
    throw new Error(`Suite ${suite.id} result digest does not match its causal data.`);
  }
}

function mergeEvidenceIds(
  baseline: SignalSummary,
  candidate: SignalSummary,
): Pick<SignalComparison, "supportingAssertionResultIds" | "supportingFactIds"> {
  return {
    supportingAssertionResultIds: [
      ...new Set([
        ...baseline.assertionResultIds,
        ...candidate.assertionResultIds,
      ]),
    ],
    supportingFactIds: [
      ...new Set([...baseline.evidenceFactIds, ...candidate.evidenceFactIds]),
    ],
  };
}

export function compareHarnesses(
  baseline: TrialRun,
  candidateSuite: SuiteRun,
): HarnessComparison {
  if (baseline.harnessRole !== "baseline" || baseline.trialKind !== "target") {
    throw new Error("Comparison requires a baseline target run.");
  }
  if (candidateSuite.harnessRole !== "candidate") {
    throw new Error("Comparison requires a candidate suite.");
  }
  if (
    baseline.scenarioId !== candidateSuite.scenarioId
    || baseline.scenarioVersion !== candidateSuite.scenarioVersion
  ) {
    throw new Error("Baseline and candidate suite must use the same scenario version.");
  }
  const candidateTarget = candidateSuite.runs.find(
    (run) => run.trialKind === "target" && run.trialId === baseline.trialId,
  );
  const targetCount = candidateSuite.runs.filter(
    (run) => run.trialKind === "target",
  ).length;
  const sealedCount = candidateSuite.runs.filter(
    (run) => run.trialKind === "sealed",
  ).length;
  if (!candidateTarget || targetCount !== 1 || sealedCount !== 2) {
    throw new Error(
      "Candidate suite must contain the matching target and exactly two sealed trials.",
    );
  }
  if (candidateSuite.runs.some((run) =>
    run.harnessRole !== "candidate"
    || run.harnessId !== candidateSuite.harnessId
    || run.harnessVersion !== candidateSuite.harnessVersion
    || run.harnessDefinitionDigest !== candidateSuite.harnessDefinitionDigest
  )) {
    throw new Error("Candidate suite contains an inconsistent harness run.");
  }

  const signals = SIGNAL_NAMES.map((signal) => {
    const baselineSignal = baseline.signals.find((entry) => entry.signal === signal);
    const candidateSignal = candidateTarget.signals.find(
      (entry) => entry.signal === signal,
    );
    if (!baselineSignal || !candidateSignal) {
      throw new Error(`Comparison is missing the ${signal} signal.`);
    }
    return deepFreeze({
      signal,
      baseline: baselineSignal,
      candidate: candidateSignal,
      ...mergeEvidenceIds(baselineSignal, candidateSignal),
    });
  });

  return deepFreeze({
    scenarioId: baseline.scenarioId,
    scenarioVersion: baseline.scenarioVersion,
    baselineRunId: baseline.id,
    candidateRunId: candidateTarget.id,
    signals,
    sealedRuns: candidateSuite.runs.filter((run) => run.trialKind === "sealed"),
    unresolvedRisks: candidateSuite.status === "passed"
      ? []
      : ["One or more candidate trials did not meet the declared expectation."],
    limitations: candidateSuite.limitations,
  });
}

export function valueMatches(actual: FactValue, expected: FactValue): boolean {
  return actual === expected;
}
