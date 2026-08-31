# Agent Harness Lab — Devpost draft

> Status: prepared copy. The public app and source are verified; the YouTube URL and final Devpost submission still require owner approval. Do not publish this draft as-is.

## Listing

**Project name:** Agent Harness Lab

**Tagline:** Prove the harness change before you trust it.

**Live app:** https://agent-harness-lab.xiaoweiwan-michi.chatgpt.site

**Source:** https://github.com/snowan/agent-harness-lab

**Demo:** `[PUBLIC_YOUTUBE_URL]`

## What it does

Agent Harness Lab is a browser-native workbench for evaluating changes to the system around an AI agent: instructions, skills, context and memory, tool policy, permissions, retries, checkpoints, and completion gates.

A person and an agent share one visible evaluation workspace. The agent can reproduce a built-in harness failure, inspect observable trace facts, stage one declared harness patch, run the target plus two sealed regression fixtures, compare five separate evidence signals, and produce a digest-bearing receipt summary. The person sees every agent action in the same interface and alone decides whether to promote or reject the candidate.

The release includes four deterministic missions:

- Completion without proof
- Broken context handoff
- Lost tool response
- Authority drift

Each mission separates activation, adherence, outcome, evidence, and safety so a better final answer cannot hide a broken control or a new regression.

## Why WebMCP fits

This is a stateful, ordered investigation rather than a one-shot form fill. Without WebMCP, an agent must infer controls from presentation markup, scrape long traces, and guess which action is legal next. That is fragile precisely where an evaluation product needs explicit contracts.

The page registers eight narrow tools through `document.modelContext`: read the lab state, load a mission, run the baseline, inspect a bounded trace slice, stage the declared patch, run the candidate suite, compare harnesses, and read a receipt summary. Tool inputs are typed, outputs are bounded, and illegal transitions fail without mutating the workspace.

WebMCP also creates a better human experience. Agent actions update the same visible state the person is reviewing; the activity feed identifies `agent · webmcp` provenance; and the person can interrupt, inspect evidence, or continue manually. There is no hidden agent-only copy of the experiment.

## What people and agents do together

The agent handles the repeatable investigation loop: navigation, deterministic replay, trace paging, candidate staging, target and sealed execution, comparison, and receipt summarization. The person contributes the causal judgment that should not be delegated: whether the observed evidence is strong enough to promote the harness change.

Promotion and rejection are intentionally absent from WebMCP discovery. There are also no deployment, arbitrary URL, filesystem, secret, or code-execution tools. This boundary makes the collaboration useful without turning structured access into broad authority.

## How it was built

The app is a static React and TypeScript build. A pure domain reducer owns legal phases and deterministic evaluation. Human controls and WebMCP executors call the same command service, so the two paths cannot silently diverge. The WebMCP adapter validates inputs again at the application boundary, uses request IDs for same-session retry safety, caps every result at 1.5K serialized characters, and unregisters its tools with one `AbortController`.

Every built-in result comes from declared fixture facts—not a live model or fabricated production telemetry. Assertions derive from those facts, reviewed SHA-256 digests detect fixture drift, and the formal JSON receipt includes provenance, limitations, evidence references, unresolved risks, and any human decision. Versioned local snapshots restore stable phases after reload and reject malformed, stale, structurally invalid, or fixture-mismatched state.

## How to try it

1. Open https://agent-harness-lab.xiaoweiwan-michi.chatgpt.site in ChatGPT's in-app browser.
2. Ask the agent: “Use the available Agent Harness Lab tools to evaluate the Completion without proof mission. Inspect the failed trace, stage the declared patch with a concise causal hypothesis, run the candidate suite, and compare the evidence. Do not make the final promotion decision.”
3. Watch the visible phase, evidence, and provenance update as each WebMCP tool runs.
4. Review the five-signal matrix and two sealed cases.
5. Choose **Promote** or **Reject** yourself, then download the verified JSON receipt.

The full workflow also remains usable manually in browsers without WebMCP.

## Limitations

- The four missions are deterministic local teaching and regression fixtures; this release does not benchmark a live model or production harness.
- Local recovery is unsigned convenience state and is not a tamper-proof audit log.
- Request-ID idempotency is page-session scoped; the MVP has no cross-tab or server coordination.
- Receipt summaries are available to the agent, but file download and final decision require explicit human actions.

## Verification snapshot

- 142 unit tests passed across 11 files.
- 24 WebMCP contract tests passed across four files.
- 34 Playwright cases passed across desktop, 390 px, and 320 px projects; the two mobile instances of the desktop-only 200 percent zoom proxy were intentionally skipped.
- Automated serious/critical accessibility scans, keyboard focus, dialog focus, reduced motion, announcements, narrow-width tables, and page-level overflow checks passed.
- A clean browser context completed the deployed comparison, human promotion, receipt download, reload recovery, and stable receipt-digest check with no console, page, request, HTTP, or overflow error.
- ChatGPT's in-app browser discovered exactly the eight intended WebMCP tools on the public release. The discovered set contains no promotion, rejection, deployment, filesystem, URL-fetch, or code-execution capability.
