# Agent Harness Lab

**Prove the harness change before you trust it.**

Agent Harness Lab is a browser-native WebMCP workbench for evaluating changes to the system around an AI agent: instructions, skills, memory rules, tool policies, permissions, checkpoints, retry behavior, and completion gates.

The challenge experience is designed for a person and an agent to use the same visible workspace: reproduce a failure, inspect its trajectory, stage one harness patch, run target and sealed fixtures, compare causal evidence, and make a promote-or-reject decision. The page registers eight structured WebMCP tools when the browser supports the draft API; promotion and rejection remain human-only.

[Open the public release](https://agent-harness-lab.xiaoweiwan-michi.chatgpt.site) · [View the public source](https://github.com/snowan/agent-harness-lab) · [MIT License](LICENSE)

## Start here

- Install Node.js 22.13 or newer.
- Run the application locally:

  ```bash
  npm ci
  npm run dev
  ```

- Run the complete verification suite with `npm run test:all`, or run the WebMCP contract harness alone with `npm run test:contract`.
- Use the [interactive mockup](prototype/Agent%20Harness%20Lab.html) as the visual reference.
- Read the [product requirements](docs/Agent%20Harness%20Lab%20PRD.md).
- Review the [architecture](docs/Architecture.md) and [implementation plan](docs/Implementation%20Plan.md).
- See the concise [product proposal](docs/Agent%20Harness%20Lab%20Proposal.md), [research brief](docs/Research%20Brief.md), and [repository and stack decision](docs/Repository%20and%20Tech%20Stack.md).
- Read the [MIT License](LICENSE).
- Review the [third-party notices](THIRD_PARTY_NOTICES.md) before redistributing the repository.

## Core demo

The lab ships four executable deterministic fixtures: **Completion without proof**, **Broken context handoff**, **Lost tool response**, and **Authority drift**. Each reproduces one target failure, stages one declared harness change, and runs the target plus two sealed cases. The comparison keeps five signals separate:

1. Activation
2. Adherence
3. Outcome
4. Evidence
5. Safety

Every fixture generates ordered facts, derives every assertion and five-signal count, and produces reviewed canonical SHA-256 digests. A completed comparison can be downloaded as a strict, versioned JSON receipt with provenance, limitations, candidate diff, human decision when present, and its own canonical digest. Stable workspaces recover from a versioned local snapshot; malformed, stale, structurally invalid, or fixture-digest-mismatched snapshots fall back to a clean mission. Local snapshots are not signed, so recovery does not claim to detect every valid-shape provenance relabeling.

All built-in results are labeled deterministic fixtures. The app does not claim to execute a live model, call an external tool, or observe production agents.

## Repository map

```text
agent-harness-lab/
├── README.md
├── docs/
├── output/playwright/       # Reviewable browser proof by PR
├── prototype/               # Approved visual reference
├── public/
├── scripts/                 # Repeatable proof capture
├── src/
│   ├── app/                 # Commands, guards, store, selectors
│   ├── domain/              # Pure state, transitions, graders, hashing
│   ├── persistence/         # Versioned snapshot validation and recovery status
│   ├── receipts/            # JSON Schema, builder, verifier, download
│   ├── scenarios/           # Immutable fixture contracts and facts
│   └── webmcp/              # Contracts, validation, executors, lifecycle
└── tests/
    ├── contract/            # Discovery, safety, output, lifecycle, parity
    ├── e2e/
    └── unit/
```

The domain core is independent of React, browser storage, and WebMCP. Human controls and WebMCP executors enter through the same command service. Each command commits one complete stable revision or leaves the workspace unchanged; successful agent commands appear immediately in the visible activity provenance as `agent · webmcp`. The receipt schema is the canonical portable-output contract at `src/receipts/receipt.schema.json`; WebMCP returns only its bounded digest-bearing summary and never initiates a download.

The adapter follows the current [`document.modelContext` WebMCP draft](https://webmachinelearning.github.io/webmcp/) and [Chrome's tool-security guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools). It validates inputs again at the application boundary, registers no cross-origin exposure, owns all registrations with one `AbortController`, and keeps each result at or below 1.5K serialized characters. Browsers without WebMCP keep the complete manual workflow.

## Submission boundary

The challenge release is published from the [public repository](https://github.com/snowan/agent-harness-lab) under the [MIT License](LICENSE). Repository visibility, licensing, deployment, and final submission remain explicit human release actions; none is available through the application's WebMCP tools.

## Challenge

[The WebMCP Challenge](https://openai.com/webmcp-challenge/) asks for apps that become meaningfully better when people and agents use them together. Agent Harness Lab makes that collaboration concrete: the agent performs structured investigation and regression work, while the person owns causal judgment and promotion authority.
