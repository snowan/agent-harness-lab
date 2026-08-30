# Agent Harness Lab — Research Brief

**Research completed:** August 30, 2026<br>
**Decision:** Build a browser-native laboratory for evaluating changes to an agent harness, not another agent runtime or trace viewer.

## Executive conclusion

The strongest version of Agent Harness Lab answers one narrow, expensive question:

> When a prompt, skill, memory rule, tool policy, checkpoint, or completion contract changes, did the downstream agent actually activate it, follow it, improve the mission, and avoid a regression?

That question is not well served by today’s adjacent categories. Runtimes execute agents. Trace viewers show what happened. Eval platforms score experiments. Human-review protocols record approvals. Agent Harness Lab connects those pieces into a visible, replayable change decision: reproduce a failure, stage one harness patch, run the same mission plus sealed checks, compare evidence, and leave promotion to a person.

This is a good WebMCP Challenge concept because both collaborators have a distinct advantage in the same browser workspace. An agent can inspect structured state, propose a narrow patch, and run a matrix of deterministic tests. A person can see the trajectory, challenge the causal story, and make the irreversible promote/reject decision. The Challenge explicitly rewards apps that become meaningfully better when people and agents use them together, along with thoughtful WebMCP use and human-agent experience ([OpenAI](https://openai.com/webmcp-challenge/)).

## What “agent harness” means here

An agent harness is the editable system around a model that shapes how work is performed: instructions, skills, tool contracts, context and retrieval rules, permissions, orchestration, checkpoints, retry behavior, completion gates, and evidence requirements. This is broader than a prompt and narrower than the entire product.

The distinction matters because the model can stay fixed while the harness changes. Recent research separates two capabilities that normal pass/fail evals blur together:

1. **Harness updating:** can an agent or engineer produce a useful persistent change?
2. **Harness benefit:** does the task-solving agent activate and faithfully follow that change?

The authors found that weak benefit can come from either failing to activate an applicable harness artifact or activating it without following it. That gives the Lab its most original measurement model: update quality, activation, adherence, outcome, and safety are separate observations ([Lin et al., 2026](https://arxiv.org/abs/2605.30621)).

## Evidence: the recurring failures are ordinary and systemic

Anthropic’s long-running-agent work reports four practical failure modes: declaring victory early, leaving a dirty or undocumented state, marking features complete without sufficient verification, and forcing later sessions to reconstruct how the app works. Their mitigation uses durable progress artifacts, incremental tasks, git history, and user-facing verification—not simply a larger context window ([Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)). A later article notes that harness assumptions can themselves become stale as models improve, reinforcing the need to retest policies rather than accumulate them forever ([Anthropic](https://www.anthropic.com/engineering/managed-agents)).

Agent eval guidance also argues against grading only the final answer. An agent trial includes a trajectory of messages, tool calls, intermediate results, and environment changes; useful evaluation combines deterministic assertions, task outcomes, and qualitative graders where appropriate ([Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)). LangSmith similarly distinguishes final-response, single-step, and full-trajectory evaluation, and supports strict, unordered, subset, and superset trajectory matching ([LangSmith](https://docs.langchain.com/langsmith/trajectory-evals)).

The last-30-days scan found the same pressure in practitioner discussions: stale or contradictory memory in long threads, uncertainty about context handoffs, demand for explicit state machines when steps are known, and work to keep raw harness transcripts source-neutral. These are directional community signals, not benchmark evidence. The scan covered Reddit, Hacker News, GitHub, Digg, and YouTube; X was unavailable and YouTube transcript coverage was degraded. See the [raw research capture](research/agent-harness-reliability-evaluation-context-continuity-human-approval-raw-v3.md).

## Adjacent landscape and the product gap

| Category | Representative evidence | What it already does well | Gap the Lab should own |
| --- | --- | --- | --- |
| Agent SDK/runtime | [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/), [TrueForge](https://github.com/truefoundry/trueforge) | Model/tool loops, guardrails, sessions, approvals, sandboxing, tracing | Not a focused, shared decision surface for one harness change |
| Durable state machine | [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence), [StateM](https://github.com/henryqin1997/statem) | Checkpoints, replay, legal transitions, evidence gates, context recovery | Runs the workflow; does not compare a proposed harness version across a compact causal test |
| Observability and evals | [OpenAI tracing](https://openai.github.io/openai-agents-python/tracing/), [LangSmith evaluation](https://docs.langchain.com/langsmith/evaluation) | Rich traces, datasets, evaluators, online/offline experiments | Powerful infrastructure, but not an opinionated browser-native harness-patch review loop |
| Human-agent accountability | [CHAP](https://github.com/BrightbeamAI/chap), [Thinkroom](https://github.com/kieranklaassen/thinkroom) | Approvals, overrides, provenance, review state, shared artifacts | Records collaboration; does not diagnose activation/adherence or run a harness regression matrix |
| Telemetry standardization | [OpenTelemetry GenAI conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/) | Shared names for agent, workflow, and tool-call telemetry | Data vocabulary, not a product workflow or causal decision |

**Inference from the landscape:** a generic AgentOps dashboard would be crowded and too broad for the challenge. A small “harness change laboratory” is more original, easier to demo end to end, and legible in under three minutes.

## Recommended product thesis

Every Lab session is a controlled comparison with five gates:

1. **Reproduce:** run a deterministic baseline mission and reveal the failed invariant.
2. **Explain:** inspect the trajectory and identify which harness layer should have influenced the run.
3. **Patch:** stage one reviewable change with a hypothesis and expected mechanism.
4. **Challenge:** run the original mission plus sealed regression cases.
5. **Decide:** compare activation, adherence, outcome, evidence, and safety; a person promotes or rejects.

The causal chain must stay visible:

`harness patch → artifact activation → observed adherence → task outcome → human decision`

This protects the product from a common mistake: treating a plausible text edit or a better aggregate score as proof that the harness caused the improvement.

## The four launch scenarios

| Scenario | Baseline failure | Harness layer under test | Deterministic evidence |
| --- | --- | --- | --- |
| Completion without proof | Agent says “done” before browser QA and misses mobile overflow | Skill activation + completion contract | Required tool calls, viewport assertions, final claim coverage |
| Broken handoff | Fresh session repeats work and drops an unresolved blocker | Checkpoint + context-loading policy | Checkpoint fields, first actions after resume, duplicated work |
| Lost tool response | Successful write is retried after a dropped response | Retry + reconciliation policy | Operation key, side-effect count, read-before-retry path |
| Authority drift | Broad tool access remains active beyond the mission | Capability lease + approval rule | Granted scope, expiry event, forbidden-call assertion |

The first scenario should drive the submission demo because it is visual, understandable without specialist knowledge, and directly shows why final-answer grading is insufficient.

## Measurement contract

The MVP should report fixture results, never invented production telemetry:

- **Activation:** Was the relevant skill, memory, policy, or checkpoint loaded at the required moment?
- **Adherence:** Which required behaviors were followed, skipped, or contradicted?
- **Outcome:** Did the mission’s externally visible acceptance checks pass?
- **Evidence coverage:** Are completion claims linked to checks or artifacts?
- **Safety invariants:** Were forbidden actions avoided and scoped capabilities contained?
- **Regression delta:** Did the candidate improve the target without breaking sealed cases?

All scores in the prototype must be labeled **built-in deterministic fixture**. Cost, latency, model quality, and production reliability are out of scope unless measured by a real integration.

## Why WebMCP is structural, not decorative

WebMCP lets the page expose narrow, structured actions through `document.modelContext.registerTool()` instead of making an agent infer the UI. The standard’s imperative API lets those tools call the same client-side application logic as the visible controls ([WebMCP draft](https://github.com/webmachinelearning/webmcp)). Chrome’s guidance recommends truthful read-only and untrusted-content annotations, narrow exposure, and concise contracts ([Chrome](https://developer.chrome.com/docs/ai/webmcp/secure-tools)).

Recommended page tools:

- `get_lab_state` — read the selected mission, runs, patch, and decision state.
- `load_mission` — select one built-in failure fixture.
- `run_baseline` — execute the original harness against the visible mission.
- `inspect_trace` — return a compact slice of events and failed assertions.
- `stage_harness_patch` — create a visible candidate with hypothesis and layer.
- `run_candidate_suite` — run the target and sealed regression fixtures.
- `compare_harnesses` — return the evidence matrix and unresolved risks.
- `export_evidence_receipt` — download a portable, reviewable JSON record.

There should be **no** `promote_candidate` WebMCP tool. Promotion is intentionally a human-only control in the visible page. This is the same useful asymmetry seen in agent-native workspaces: agents contribute structured work and provenance; people retain judgment ([Thinkroom](https://github.com/kieranklaassen/thinkroom)).

## Scope boundary

The challenge MVP is a deterministic teaching and prototyping environment. It does not execute arbitrary third-party agents, claim model benchmarks, ingest secrets, replace CI, or deploy harness changes. A later version could import OpenTelemetry-compatible traces, run adapters for Codex/Claude/Pi, connect real eval suites, and open a reviewable pull request. Those capabilities should not dilute the challenge demo.
