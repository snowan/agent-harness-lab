# Agent Harness Lab — Repository and Technology One-Pager

**Architecture decision:** Ship the challenge MVP as a static, browser-local TypeScript application. Keep domain transitions pure and framework-independent; let both the visible UI and WebMCP tools call the same application service. Add a backend only when real shared workspaces or long-running external trials require it.

**Related documents:** [PRD](Agent%20Harness%20Lab%20PRD.md) · [Architecture](Architecture.md) · [Implementation plan](Implementation%20Plan.md)

## Why this shape

The challenge deadline favors a small system that judges can run without accounts, API keys, or flaky model calls. Deterministic fixtures make the causal story reproducible. A static app also matches WebMCP’s strength: page-local tools can operate the same state and render every agent action immediately.

The boundary that matters most is not client/server. It is:

```text
UI controls ───────┐
                   ├─→ application commands → pure domain reducer → new lab state
WebMCP executors ──┘                                  │
                                                     ├─→ visible render
                                                     └─→ evidence receipt
```

No UI component and no WebMCP executor may mutate state directly. This guarantees parity between what a person clicks and what an agent calls.

## Proposed repository

The first review branch contains the product documents and validated standalone prototype. Implementation pull requests then add the application and test directories shown below.

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
├── prototype/
│   ├── Agent Harness Lab.html
│   └── _d_meta.json
├── public/
│   └── favicon.svg
├── src/
│   ├── app/
│   │   ├── commands.ts          # validated application commands
│   │   ├── create-store.ts      # reducer, subscriptions, persistence
│   │   └── selectors.ts         # compact UI and tool result views
│   ├── domain/
│   │   ├── harness.ts           # layers, versions, candidate patches
│   │   ├── mission.ts           # fixtures and acceptance checks
│   │   ├── run.ts               # events, checkpoints, artifacts
│   │   ├── evaluation.ts        # activation/adherence/outcome/safety
│   │   ├── decision.ts          # human-only promote/reject records
│   │   └── reducer.ts           # pure state transition function
│   ├── scenarios/
│   │   ├── completion-without-proof.ts
│   │   ├── broken-handoff.ts
│   │   ├── lost-tool-response.ts
│   │   └── authority-drift.ts
│   ├── webmcp/
│   │   ├── contracts.ts         # short names, descriptions, JSON schemas
│   │   ├── execute.ts           # maps tools to application commands
│   │   ├── register.ts          # feature detection and cleanup
│   │   └── results.ts           # bounded, structured tool responses
│   ├── receipts/
│   │   ├── build-receipt.ts
│   │   └── receipt.schema.json
│   ├── ui/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── styles/
│   │   └── accessibility.ts
│   ├── main.tsx
│   └── types.ts
├── tests/
│   ├── unit/                     # reducers, graders, receipts
│   ├── contract/                 # WebMCP schema and UI/tool parity
│   ├── e2e/                      # complete human and agent flows
│   └── fixtures/                 # expected traces and snapshots
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── playwright.config.ts
└── LICENSE                         # owner-selected before public submission
```

## Technology choices

| Layer | Choice | Reason |
| --- | --- | --- |
| Language | TypeScript with strict settings | One domain model for UI, fixtures, receipts, and WebMCP contracts |
| Build | Vite | Fast local loop and simple static deployment |
| UI | React with semantic HTML and plain CSS | Component clarity without adopting a large design-system dependency |
| State | `useSyncExternalStore` over a small reducer store | Inspectable transitions; no state library needed for the MVP |
| Fixtures | Typed TypeScript objects plus JSON receipt schema | Deterministic, reviewable, and easy to test |
| WebMCP | Imperative `document.modelContext.registerTool()` with feature detection | Same-domain commands can update the visible app immediately |
| Unit/contract tests | Vitest | Fast reducer, grader, and schema tests |
| Browser tests | Playwright plus axe-core | Full workflow, focus, viewport overflow, and accessibility checks |
| Persistence | Versioned `localStorage` snapshot; downloadable JSON receipt | Resumable demo without accounts or a database |
| Hosting | Static deployment on one challenge-supported host | No secrets, cold starts, or backend availability risk |

Avoid a chart library for the MVP; the trace and evidence matrix are better expressed with accessible HTML, CSS grid, and small inline SVG connectors. Avoid an agent SDK in the browser prototype because the Lab evaluates fixture behavior rather than pretending to run a real model. A later adapter can invoke actual agents behind a server boundary.

## Domain contracts

The domain should expose a small command union such as `LOAD_MISSION`, `RUN_BASELINE`, `STAGE_PATCH`, `RUN_CANDIDATE_SUITE`, `PROMOTE_CANDIDATE`, and `REJECT_CANDIDATE`. Every command returns the next state plus append-only events. `PROMOTE_CANDIDATE` and `REJECT_CANDIDATE` are callable only from the human UI module; they are deliberately absent from `webmcp/contracts.ts`.

Evaluation is assertion-based. Each scenario declares target and sealed trials, required activations, allowed trajectories, outcome checks, and safety invariants. A run produces facts; graders produce observations from facts. The UI never stores a manually entered score.

Receipts include schema version, scenario and harness versions, candidate diff, run identifiers, assertion results, unresolved risks, provenance, decision, and deterministic content hashes. Raw model reasoning is not required and should not be exported.

## WebMCP implementation rules

- Register compact tools: `get_lab_state`, `load_mission`, `run_baseline`, `inspect_trace`, `stage_harness_patch`, `run_candidate_suite`, `compare_harnesses`, and `export_evidence_receipt`.
- Keep tool descriptions under Chrome’s recommended character budgets, return bounded summaries rather than the entire trace, and enforce the 1.5K serialized result ceiling at the executor boundary.
- Mark true reads with `readOnlyHint`; mark state and receipt reads with `untrustedContentHint` because they can contain a user-authored hypothesis.
- Reuse the validated command layer. Reject invalid scenario IDs, patch layers, and out-of-order actions.
- Use an `AbortController` to unregister tools on hot reload or page teardown.
- Do not expose tools across origins for the MVP.
- Do not register promotion, deployment, arbitrary code execution, filesystem access, or secret-bearing actions.

## Verification and release gates

The challenge branch is ready only when:

1. All scenario runs are deterministic across repeated executions.
2. UI clicks and equivalent WebMCP calls produce identical state snapshots.
3. A candidate cannot run before a baseline and cannot be promoted before comparison.
4. The human-only decision is absent from discovered WebMCP tools.
5. Receipts validate against their schema and contain no fabricated or hidden telemetry.
6. The complete demo works with keyboard only, visible focus, reduced motion, and screen-reader status announcements.
7. Desktop, 390 px, 320 px, and zoomed layouts have no page-level horizontal overflow.
8. The console has no errors, the static build succeeds, and the deployed URL completes the same flow.

## Post-challenge evolution

Phase two can add import adapters for OpenTelemetry/agent traces and harness bundles from Codex, Claude Code, and Pi. Phase three can add a small authenticated service for shared projects, remote trial workers, and reviewable pull requests. Keep those adapters outside the pure domain core so the deterministic local lab remains useful for demos, education, regression fixtures, and offline review.
