# Agent Harness Lab

**Prove the harness change before you trust it.**

Agent Harness Lab is a browser-native WebMCP workbench for evaluating changes to the system around an AI agent: instructions, skills, memory rules, tool policies, permissions, checkpoints, retry behavior, and completion gates.

A person and an agent use the same visible workspace to reproduce a failure, inspect its trajectory, stage one harness patch, run target and sealed fixtures, compare causal evidence, and make a promote-or-reject decision. The agent can operate the lab through eight structured WebMCP tools. Promotion and rejection remain human-only.

## Start here

- Open the [interactive mockup](prototype/Agent%20Harness%20Lab.html) in a browser.
- Read the [product requirements](docs/Agent%20Harness%20Lab%20PRD.md).
- Review the [architecture](docs/Architecture.md) and [implementation plan](docs/Implementation%20Plan.md).
- See the concise [product proposal](docs/Agent%20Harness%20Lab%20Proposal.md), [research brief](docs/Research%20Brief.md), and [repository and stack decision](docs/Repository%20and%20Tech%20Stack.md).

## Core demo

The primary fixture, **Completion without proof**, shows a coding agent changing a responsive page, skipping browser QA, missing a 320 px overflow defect, and claiming completion. A candidate harness activates the missing skill and blocks completion until desktop and mobile receipts exist. The lab then runs the original mission plus two sealed cases and compares five signals:

1. Activation
2. Adherence
3. Outcome
4. Evidence
5. Safety

All mockup results are labeled deterministic fixtures. The prototype does not claim to execute a live model or observe production agents.

## Repository map

```text
agent-harness-lab/
├── README.md
├── docs/
│   ├── Agent Harness Lab PRD.md
│   ├── Agent Harness Lab Proposal.md
│   ├── Architecture.md
│   ├── Implementation Plan.md
│   ├── Repository and Tech Stack.md
│   ├── Research Brief.md
│   └── research/
└── prototype/
    ├── Agent Harness Lab.html
    └── _d_meta.json
```

The implementation plan evolves this concept package into a strict TypeScript application with a pure domain core, shared UI/WebMCP command service, deterministic scenario runner, evidence receipts, and contract and browser tests.

## Submission boundary

The development repository starts private. The WebMCP Challenge requires a public repository with an open-source license at submission time. Changing visibility and selecting a license are explicit owner decisions in the final submission gate; they are not performed by the application or its WebMCP tools.

## Challenge

[The WebMCP Challenge](https://openai.com/webmcp-challenge/) asks for apps that become meaningfully better when people and agents use them together. Agent Harness Lab makes that collaboration concrete: the agent performs structured investigation and regression work, while the person owns causal judgment and promotion authority.
