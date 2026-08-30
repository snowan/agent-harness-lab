# Agent Harness Lab — Product Requirements Document

**Status:** Challenge MVP specification<br>
**Product type:** Browser-native harness reliability workbench<br>
**Primary demo:** Completion without proof<br>
**Decision owner:** Human reviewer<br>
**Related documents:** [Product proposal](Agent%20Harness%20Lab%20Proposal.md) · [Research brief](Research%20Brief.md) · [Architecture](Architecture.md) · [Implementation plan](Implementation%20Plan.md)

## 1. Product decision

Build a focused laboratory for answering one question:

> When a prompt, skill, memory rule, tool policy, checkpoint, permission, or completion contract changes, did the downstream agent activate it, follow it, improve the mission, and preserve safety?

The challenge MVP is a deterministic browser application. It gives a person and a WebMCP-capable agent one shared, inspectable state. Both can reproduce a built-in failure, inspect evidence, stage a narrow candidate, and run a regression suite. Only the person can promote or reject the candidate.

This is not a generic agent runtime or observability dashboard. It is the decision surface between a reported failure and an accepted harness change.

## 2. Problem

Agent teams can usually read a bad transcript and write a plausible new instruction. They have a harder time proving that the instruction caused the next improvement.

Evidence is fragmented across prompts, skills, memory files, traces, eval datasets, CI, issue threads, and approval messages. That fragmentation produces five expensive failure modes:

1. **False fix:** the candidate sounds better but is never activated.
2. **Adherence gap:** the candidate is loaded but its required behavior is not followed.
3. **Regression blindness:** the target example passes while another workflow breaks.
4. **Final-answer bias:** a polished answer hides an unsafe or incomplete trajectory.
5. **Unreviewable evolution:** persistent agent rules accumulate without a small causal experiment or an accountable promotion decision.

Today, a reviewer must reconstruct the causal story manually. The Lab makes the chain visible:

```text
harness patch → artifact activation → observed adherence → task outcome → safety → human decision
```

## 3. Target users

### 3.1 Primary users

| User | Responsibility | Current pain | Lab value |
| --- | --- | --- | --- |
| Agent platform engineer | Owns agent behavior across tools and workflows | Harness changes are spread across code, prompts, and policy | One controlled comparison with a portable evidence record |
| Eval or reliability engineer | Designs fixtures, assertions, and release gates | Final outcomes do not explain why behavior changed | Separate activation, adherence, outcome, evidence, and safety signals |
| Solo agent builder | Maintains a personal coding or research harness | Lacks a lightweight review and regression workflow | A local, no-account lab with deterministic examples |

### 3.2 Secondary users

- Skill, prompt, and memory authors who need to prove applicability and effect.
- Security reviewers who need to inspect permission and side-effect boundaries.
- Engineering leads who approve persistent agent changes.
- Educators who teach reliable agent design through visible failure cases.

### 3.3 Explicitly unsupported in the MVP

- Teams expecting production telemetry ingestion or hosted collaboration.
- Users who want arbitrary code execution or a general-purpose agent sandbox.
- Benchmark consumers expecting model rankings or statistically significant model comparisons.

## 4. Jobs to be done

### Primary job

> When a harness change looks promising, help me prove what it changed, where it took effect, and whether it is safe to keep—without reconstructing the story across several tools.

### Supporting jobs

- Reproduce a known failure from the same initial state.
- Find the first missing or incorrect harness influence in a trajectory.
- Express a candidate as a narrow, reviewable diff with a causal hypothesis.
- Challenge the candidate with the target case and sealed regression cases.
- Explain improvement without relying on a single aggregate score.
- Preserve provenance, unresolved risks, and a human decision in a portable receipt.

## 5. Product principles

1. **Trajectory before verdict.** Show how the run unfolded, not only whether it passed.
2. **Mechanism before score.** A better result is insufficient without activation and adherence evidence.
3. **One change at a time.** The MVP stages one candidate against one baseline.
4. **Visible shared state.** Human controls and WebMCP tools operate the same domain model.
5. **Determinism over spectacle.** Built-in fixtures must replay identically without a model key.
6. **Human authority is a feature.** Promotion and rejection are visible, human-only decisions.
7. **Truthful evidence.** Fixture data is labeled; the product does not imply live telemetry, model execution, or deployment.

## 6. Goals and non-goals

### 6.1 MVP goals

- Make the entire reproduce-to-decision loop understandable in under three minutes.
- Provide four built-in harness failure fixtures with target and sealed cases.
- Expose useful, non-trivial WebMCP tools for the investigation and evaluation workflow.
- Keep UI actions and WebMCP actions behaviorally equivalent.
- Produce a structured evidence receipt with provenance and limitations.
- Demonstrate a clear permission boundary by omitting promotion and deployment from WebMCP.
- Meet keyboard, focus, reduced-motion, and 320 px layout requirements.

### 6.2 Non-goals

- Running arbitrary third-party agents or repositories.
- Calling a live model in the challenge-critical path.
- Replacing CI, production observability, or a full eval platform.
- Claiming statistically valid model or harness benchmarks.
- Automatically modifying source repositories or deploying candidates.
- Multi-user accounts, billing, remote storage, or real-time collaboration.
- Autonomous self-modification without review.

## 7. Core experience

### 7.1 Happy path

```text
Choose mission
  → Reproduce baseline failure
  → Inspect trace and failed assertions
  → Stage one harness patch and hypothesis
  → Run target plus sealed fixtures
  → Compare five evidence signals
  → Human promotes or rejects
  → Export evidence receipt
```

The agent is best suited to scanning structured events, locating the failed gate, staging a hypothesis, and running the matrix. The person is best suited to challenging the explanation, assessing tradeoffs, and owning the irreversible decision.

### 7.2 Primary demonstration

**Completion without proof** begins with an agent changing a responsive page, skipping the browser-QA skill, missing a 320 px overflow defect, and reporting completion.

The candidate patch adds two mechanisms:

- Activate browser QA whenever changed files include UI.
- Block completion until desktop and mobile-320 receipts exist and acceptance checks pass.

The candidate suite shows the skill activating, the overflow being detected and repaired, the acceptance checks passing, and two sealed cases preventing over-triggering or invented repairs. The person then reviews the patch, trace, evidence matrix, and limitations before deciding.

## 8. Functional requirements

### 8.1 Mission and workspace

| ID | Requirement | Acceptance condition |
| --- | --- | --- |
| FR-101 | The app must present the four built-in missions with stable IDs and short failure summaries. | A user can load `completion`, `handoff`, `retry`, or `authority` without reloading the page. |
| FR-102 | Loading a mission must reset candidate and decision state and show the recorded baseline context. | No result or decision from the previous mission remains active. |
| FR-103 | The selected mission must show its failed invariant, harness layer, and baseline/candidate versions. | The reviewer can state what is being tested before running anything. |
| FR-104 | The app must label all built-in results as deterministic fixture data. | No score or event is visually presented as production telemetry. |

### 8.2 Baseline reproduction and trace inspection

| ID | Requirement | Acceptance condition |
| --- | --- | --- |
| FR-201 | A human or agent can replay the selected baseline from a fixed initial state. | Repeated runs yield the same ordered facts and failed assertions. |
| FR-202 | The baseline must fail the scenario's declared invariant by design. | The result is `failed_as_expected`, not a generic runtime error. |
| FR-203 | The app must show a bounded chronological trace with status, event, and evidence fields. | A reviewer can identify the first meaningful failure point. |
| FR-204 | Trace inspection must distinguish missing activation, violated behavior, failed outcome, absent evidence, and safety breach. | Each failure maps to at least one named evidence signal. |

### 8.3 Candidate staging

| ID | Requirement | Acceptance condition |
| --- | --- | --- |
| FR-301 | A candidate can be staged only after a baseline exists. | Out-of-order staging returns a safe, visible error without corrupting state. |
| FR-302 | The candidate must include a harness layer, reviewable diff, and causal hypothesis. | The reviewer can explain the expected mechanism before evaluation. |
| FR-303 | The MVP must allow only one active candidate. | Staging another candidate requires resetting or loading a mission. |
| FR-304 | Staging must not imply acceptance, deployment, or source modification. | Candidate status remains `staged`; no external side effect occurs. |

### 8.4 Candidate suite

| ID | Requirement | Acceptance condition |
| --- | --- | --- |
| FR-401 | The suite can run only for a staged candidate. | Out-of-order execution returns a typed domain error. |
| FR-402 | Every suite must include the target case and at least two sealed cases. | Results identify target and sealed outcomes separately. |
| FR-403 | The deterministic engine must generate facts before graders generate observations. | UI code cannot write scores directly. |
| FR-404 | Repeated runs with the same scenario and harness version must produce identical assertion results and content hashes. | Contract tests compare stable snapshots. |

### 8.5 Comparison and explanation

| ID | Requirement | Acceptance condition |
| --- | --- | --- |
| FR-501 | The app must compare baseline and candidate across activation, adherence, outcome, evidence, and safety. | All five signals show counts and supporting observations. |
| FR-502 | Comparison must preserve target and sealed-case results. | A passing target cannot conceal a sealed regression. |
| FR-503 | The app must show a causal chain from patch through decision. | Each link is backed by one or more run facts or assertions. |
| FR-504 | Limitations and unresolved risks must remain visible at comparison time. | The fixture-only and no-live-model limitations cannot be hidden by a pass. |

### 8.6 Human decision and receipt

| ID | Requirement | Acceptance condition |
| --- | --- | --- |
| FR-601 | Promote and Reject controls must be available only after comparison. | Controls are disabled in earlier states. |
| FR-602 | Promotion and rejection must be UI-only and attributed to `human`. | No WebMCP contract or executor can perform either action. |
| FR-603 | A decision must preserve the evaluated evidence rather than erase the run. | The reviewer can inspect the same comparison after deciding. |
| FR-604 | The app must export a versioned JSON evidence receipt. | Receipt schema validation passes and includes provenance and limitations. |
| FR-605 | A receipt must not contain hidden reasoning, secrets, or fabricated telemetry. | Only declared fixture facts, observations, identifiers, and user-visible fields are exported. |

### 8.7 WebMCP collaboration

| ID | Requirement | Acceptance condition |
| --- | --- | --- |
| FR-701 | The page must register eight focused tools when WebMCP is available. | Discovery returns the exact tool set listed below. |
| FR-702 | Tool executors and UI handlers must call the same application service. | Equivalent UI and tool flows produce equal domain snapshots. |
| FR-703 | Read tools must have truthful read-only annotations. | Discovery marks state, trace, comparison, and receipt reads appropriately. |
| FR-704 | Tool inputs must reject unknown fields, invalid IDs, oversized text, and illegal transitions. | Errors are bounded and return the current safe state. |
| FR-705 | Registration must be feature-detected and cleanly unregistered on teardown. | The app still works manually when WebMCP is absent. |
| FR-706 | The page must not expose promotion, rejection, deployment, arbitrary code execution, filesystem access, or cross-origin tools. | A discovery audit finds none of these capabilities. |

Required tool set:

| Tool | Mode | Purpose |
| --- | --- | --- |
| `get_lab_state` | Read | Read the selected mission, phase, runs, patch, and decision state. |
| `load_mission` | Command | Select one built-in failure fixture. |
| `run_baseline` | Command | Replay the original harness. |
| `inspect_trace` | Read | Return a bounded trace slice for a completed run. |
| `stage_harness_patch` | Command | Stage the fixture candidate and causal hypothesis. |
| `run_candidate_suite` | Command | Run the target and two sealed fixtures. |
| `compare_harnesses` | Read | Compare the five evidence signals and unresolved risks. |
| `export_evidence_receipt` | Read | Return a portable structured receipt without deciding or deploying. |

## 9. Built-in scenario requirements

| Scenario | Baseline failure | Harness layer | Target assertion | Sealed-case purpose |
| --- | --- | --- | --- | --- |
| Completion without proof | UI change skips mobile QA and claims completion | Skill trigger + completion contract | Detect, repair, and recheck 320 px overflow | Avoid over-triggering on docs; avoid inventing repairs on passing UI |
| Broken context handoff | New session repeats work and drops a blocker | Checkpoint + context-load policy | Restore all continuity fields before mutation | Continue clean handoff; stop on stale checkpoint hash |
| Lost tool response | Successful write is blindly retried | Tool policy + reconciliation | One intent produces one side effect | Retry true pre-commit failure; stop on mismatched key |
| Authority drift | Broad write access outlives its purpose | Capability lease + approval policy | Complete diagnosis with a narrow, revoked lease | Require approval for repair; reject expired lease reuse |

Each scenario must declare:

- Stable scenario and version identifiers.
- Initial state and baseline harness version.
- Candidate harness diff and expected causal mechanism.
- Ordered baseline and candidate facts.
- Target and sealed trial specifications.
- Required activations and adherence assertions.
- Outcome and safety assertions.
- Expected deterministic hashes.

## 10. Information architecture and interaction requirements

The desktop workspace contains four persistent regions:

1. **Mission rail:** scenario selection, layer tags, and failure summaries.
2. **Run workspace:** invariant, baseline/candidate versions, trajectory, patch, and evidence tabs.
3. **Decision panel:** candidate summary, limitations, Promote, Reject, and receipt export.
4. **WebMCP surface:** tool availability, contract viewer, and activity provenance.

At narrow widths, these regions must become a single reading order. The mobile layout must not use a permanent sidebar or require page-level horizontal scrolling. Tables and traces may use intentional, labeled internal scrolling only when a stacked representation would lose meaning.

All asynchronous actions must announce start, completion, and failure through a screen-reader status region. Focus must remain visible and logical after tabs, dialogs, and decisions.

## 11. Product state model

The canonical states are:

- `mission_loaded`
- `baseline_running`
- `baseline_failed`
- `patch_staged`
- `candidate_running`
- `compared`
- `promoted`
- `rejected`

Runtime errors do not create an acceptance state. They append a bounded error event and return to the last stable state. Loading a mission begins a new workspace state. A decision is terminal for that candidate, but its evidence remains inspectable.

The [architecture document](Architecture.md) owns the exact transition and command contracts.

## 12. Evidence and receipt requirements

Every displayed comparison value must be derived from named assertions over run facts. The receipt must contain:

- Schema version and creation time.
- Scenario ID, version, title, and fixture disclosure.
- Baseline and candidate harness versions.
- Candidate layer, diff digest, and hypothesis.
- Run IDs, initial-state digest, and result digests.
- Target and sealed trial results.
- Five-signal assertion results with evidence references.
- Unresolved risks and product limitations.
- Human decision and timestamp when present.
- Provenance for human and agent commands.

Raw hidden chain-of-thought is neither needed nor allowed. The receipt records observable events and reviewable explanations.

## 13. Non-functional requirements

### Reliability

- A refresh must not leave a partial run presented as completed.
- Commands must be validated and either complete atomically or leave the stable state unchanged.
- Fixture execution must not depend on network, model, clock, or random behavior.
- Receipt hashes must exclude inherently unstable display fields such as the export timestamp.

### Performance

- Initial interactive load target: under 2 seconds on a typical laptop after static assets are cached.
- Command-to-visible-feedback target: under 100 ms, excluding intentional demo pacing.
- Built-in suite target: under 1 second in reduced-motion or test mode.

### Accessibility

- Complete workflow operable by keyboard.
- Visible focus for every interactive element.
- Semantic headings, tabs, dialog, tables, buttons, and status announcements.
- Sufficient contrast in both normal and failure states.
- Motion removed or shortened under `prefers-reduced-motion`.
- No page-level overflow at 320 px, 390 px, desktop, or 200% zoom.

### Compatibility

- Manual controls work in current evergreen browsers without WebMCP.
- WebMCP is progressively enhanced in ChatGPT's in-app browser and supported test environments.
- Static hosting requires no server secret or authenticated backend.

## 14. Trust and safety requirements

- Imported or fixture text is display data, not executable instruction.
- Tool inputs are schema-validated and treated as untrusted.
- The MVP exposes only same-page, same-origin capabilities.
- No tool can access arbitrary URLs, local files, credentials, or environment variables.
- No tool can create a repository change, deploy a harness, or contact a third party.
- Promotion is an application decision only; it does not alter production systems.
- The UI must distinguish fixture completion from real-world validation.

## 15. Success measures

### Challenge demo measures

- A first-time viewer completes the primary loop in under three minutes.
- The viewer can name the baseline failure, candidate mechanism, sealed checks, and human-only action.
- The agent can complete all structured investigation and evaluation steps without guessing UI coordinates.
- The human can see every agent-caused state transition and its provenance.
- The equivalent UI and WebMCP workflows end in equal pre-decision snapshots.

### Engineering quality measures

- 100% of legal and illegal domain transitions covered by unit tests.
- 100% of WebMCP contracts validated against input/output fixtures.
- Four scenarios deterministic over at least 20 repeated suite executions in CI.
- Zero console errors in the primary flow.
- Zero critical or serious automated accessibility findings in the tested screens.
- Receipt schema validates for undecided, promoted, and rejected examples.

These are product acceptance targets, not claims about production agent reliability.

## 16. Challenge acceptance checklist

The MVP is complete only when all of the following are true:

- The live URL loads without an account or secret.
- The four scenarios are present and clearly labeled as fixtures.
- The primary loop works through both human controls and registered WebMCP tools.
- Illegal tool order fails safely and visibly.
- Promotion and rejection are absent from WebMCP discovery.
- The evidence matrix traces every signal to an observation.
- JSON receipts validate and expose limitations.
- Keyboard, reduced-motion, console, desktop, 390 px, 320 px, and zoom checks pass.
- The public repository contains source, run instructions, and a visible open-source license.
- A public demo video with audio is shorter than three minutes.

## 17. Risks and product responses

| Risk | Consequence | Product response |
| --- | --- | --- |
| The lab looks like fabricated production telemetry | Loss of trust | Label fixtures at the dataset, run, metric, and receipt levels |
| WebMCP appears bolted on | Weak challenge fit | Let the agent perform the complete investigation and evaluation loop through domain tools |
| Deterministic fixtures feel too scripted | Low perceived ambition | Make the causal mechanics and sealed-case regression logic inspectable; describe real adapters as post-MVP |
| One aggregate score hides tradeoffs | Unsafe promotion | Keep five signals and target/sealed results separate |
| Agent can approve its own change | Broken accountability story | Omit decision capabilities from WebMCP and record human provenance |
| Scope expands into a runtime or eval platform | Missed deadline | Keep real agents, imports, backend, accounts, and deployment outside the challenge critical path |

## 18. Future roadmap

After the challenge, preserve the deterministic lab and add adapters around it:

1. Import OpenTelemetry-compatible agent traces and external harness bundles.
2. Run controlled trials against real Codex, Claude Code, Pi, or custom harness adapters behind a server boundary.
3. Add team workspaces, reviewer assignments, and signed evidence receipts.
4. Generate a reviewable pull request only after a human approves the proposed source diff.
5. Build a reusable scenario-authoring kit and community fixture library.

Real integrations must not bypass the evidence model or the human decision boundary.
