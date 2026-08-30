# Agent Harness Lab

**Prove the harness change before you trust it.**

Agent Harness Lab is a browser-native WebMCP workbench for evaluating changes to the system around an AI agent: instructions, skills, memory rules, tool policies, permissions, checkpoints, retry behavior, and completion gates.

A person and an agent use the same visible workspace to reproduce a failure, inspect its trajectory, stage one harness patch, run target and sealed fixtures, compare causal evidence, and make a promote-or-reject decision. The agent can operate the lab through eight structured WebMCP tools. Promotion and rejection remain human-only.

## Start here

- Run the application locally:

  ```bash
  npm install
  npm run dev
  ```

- Run the complete verification suite with `npm run test:all`.
- Use the [interactive mockup](prototype/Agent%20Harness%20Lab.html) as the visual reference.
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
├── output/playwright/       # Reviewable browser proof by PR
├── prototype/               # Approved visual reference
├── public/
├── scripts/                 # Repeatable proof capture
├── src/
│   ├── app/                 # Commands, guards, store, selectors
│   └── domain/              # Pure state and transition contracts
└── tests/
    ├── e2e/
    └── unit/
```

The domain core is independent of React, browser storage, and WebMCP. Human controls already use the shared command service; the planned agent adapter will enter through that same boundary. Each command commits one complete stable revision or leaves the workspace unchanged.

## Submission boundary

The WebMCP Challenge requires a public repository with an open-source license at submission time. Repository visibility and license selection are explicit release decisions; they are not performed by the application or its WebMCP tools.

## Challenge

[The WebMCP Challenge](https://openai.com/webmcp-challenge/) asks for apps that become meaningfully better when people and agents use them together. Agent Harness Lab makes that collaboration concrete: the agent performs structured investigation and regression work, while the person owns causal judgment and promotion authority.
