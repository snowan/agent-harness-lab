# Agent Harness Lab — One-Page Product Proposal

**Working tagline:** Prove the harness change before you trust it.<br>
**Product type:** Browser-native reliability workbench and interactive WebMCP lab<br>
**Primary audience:** Agent platform engineers, eval/reliability engineers, and developers maintaining prompts, skills, memory, tools, or agent workflows

## The proposal

Agent Harness Lab is a shared browser workspace where a person and an agent reproduce a harness failure, stage one change, replay the mission against target and sealed cases, inspect why behavior changed, and make an evidence-backed promote/reject decision.

The Lab treats the harness as a versioned bundle around a fixed model: instructions, skills, memory and retrieval rules, tool contracts, permissions, orchestration, checkpoints, retry policies, and completion gates. Its core insight is that a “better patch” and a “better run” are not the same thing. A candidate only earns promotion when the task-solving agent activates the relevant artifact, follows it, improves the outcome, and preserves safety.

## Problem

Agent teams can see a failure in a transcript and quickly write a new instruction. What they cannot see clearly is whether that edit caused the next success or merely coincided with it. Existing products split the evidence across prompt editors, traces, eval datasets, CI, chat, and approval threads. That creates four recurring problems:

- **False fixes:** the candidate reads well but the agent never loads or follows it.
- **Regression blindness:** the target example passes while another workflow breaks.
- **Final-answer bias:** a polished answer hides a bad trajectory, missing verification, or unsafe side effect.
- **Unreviewable evolution:** agents accumulate skills and rules without a small causal experiment or human promotion gate.

## Job to be done

> When a harness change looks promising, help me prove what it changed, where it took effect, and whether it is safe to keep—without reconstructing the story across five tools.

Primary users are engineers who own agent quality. Secondary users are skill and prompt authors, security reviewers, and educators teaching reliable agent design. The first use case is a solo builder preparing a harness patch; the same evidence receipt can later support team review.

## The core loop

```text
LOAD FAILURE → RUN BASELINE → INSPECT TRAJECTORY → STAGE PATCH
      ↑                                               ↓
 HUMAN REJECT ← COMPARE EVIDENCE ← RUN SEALED SUITE ←─┘
      └──────────────────── HUMAN PROMOTE
```

Each comparison separates five signals:

1. **Activation** — Was the applicable harness artifact invoked?
2. **Adherence** — Did the agent follow its required behaviors?
3. **Outcome** — Did the externally visible acceptance checks pass?
4. **Evidence** — Are claims linked to tests, artifacts, or state transitions?
5. **Safety** — Were scope, side-effect, and approval invariants preserved?

## Submission demo

The demo opens on **Completion without proof**. A coding agent edits a responsive page, skips its browser-QA skill, misses a 320 px overflow bug, and declares completion. The baseline trace makes the missing activation and missing evidence visible.

The collaborating agent stages a two-part candidate: trigger the browser-QA skill whenever UI files change, and block the completion transition until desktop and mobile receipts exist. The Lab reruns the mission plus two sealed cases. The candidate activates the skill, catches and repairs the overflow, passes the externally visible checks, and preserves the safety assertions. A person expands the diff and receipts, then chooses Promote or Reject. The app exports a JSON evidence receipt.

Three additional fixtures show that the model generalizes beyond UI testing:

- **Broken handoff:** checkpoint completeness and first-action-after-resume.
- **Lost tool response:** idempotency, reconciliation, and side-effect count.
- **Authority drift:** scoped capability leases and approval boundaries.

## Why WebMCP

WebMCP makes the lab genuinely collaborative rather than merely agent-themed. The page exposes structured tools for loading missions, running fixtures, reading trace slices, staging candidates, comparing versions, and exporting receipts. The agent can operate the real domain model without guessing buttons; every tool call updates the same visible state the person sees.

The division of labor is intentional:

- **Agent advantage:** inspect many structured events, form a hypothesis, author a narrow candidate, and execute a regression matrix.
- **Human advantage:** understand intent, challenge the causal explanation, assess tradeoffs, and own the final decision.

Promotion is not registered as a WebMCP tool. The visible human-only boundary gives the demo a concrete permission story and makes WebMCP essential to the experience rather than a wrapper around a chatbot.

## MVP and non-goals

The MVP is a self-contained deterministic lab with four fixtures, one selected candidate at a time, baseline/candidate traces, a comparison matrix, human promotion, and a portable receipt. It requires no model API key or backend, so judges can reproduce every result instantly.

It is **not** an agent runtime, production observability service, arbitrary code sandbox, benchmark leaderboard, autonomous self-modifier, or deployment system. Real harness imports, OpenTelemetry trace adapters, hosted collaboration, model sampling, and pull-request generation belong after the challenge.

## Differentiation

Runtimes such as OpenAI Agents SDK, LangGraph, StateM, and TrueForge help agents run. Eval products help teams score datasets and trajectories. CHAP and Thinkroom help people review agent work. Agent Harness Lab’s wedge is the productized change decision between those categories: one failure, one harness patch, a causal evidence chain, sealed regression checks, and a human gate—all visible and operable through the page.

## Success criteria

For the challenge, success means a first-time judge can complete the full loop in under three minutes, explain why the candidate improved the run, and identify the one action the agent cannot take. The prototype should pass keyboard operation, reduced-motion behavior, and 320 px responsive checks. Every displayed score must come from a labeled fixture, every agent action must leave provenance, and the UI and WebMCP paths must produce the same state transitions.

This aligns directly with the Challenge criteria: useful reliability work, an original harness-change wedge, complete execution, WebMCP as the application interface, and a clear human-agent partnership ([challenge brief](https://openai.com/webmcp-challenge/)). Research basis and sources are in the [research brief](Research%20Brief.md).
