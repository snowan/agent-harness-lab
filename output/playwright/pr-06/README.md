# PR 6 public release proof

This proof was captured from the public Sites deployment of implementation commit `94e8209edac41d6f3c4710cd77fb870dcb101977` with Google Chrome `151.0.7922.174` at `2026-08-31T02:15:49Z`.

## Artifacts

| Artifact | What it demonstrates | SHA-256 |
| --- | --- | --- |
| `release-candidate-desktop.png` | 1440 px deployed comparison with four missions, five separate signals, two sealed trials, human-only decisions, agent provenance, and eight ready WebMCP tools. | `fe45e7bb7d9b2e4ec4d98aa022e5b68051d6d8c2c24a58feb1a46e6990546dd5` |
| `release-candidate-mobile-320.png` | 320 px deployed full-page state after human promotion, receipt download, reload recovery, and a second verified download. | `6363af137e0dad3e0e2fa139aa0d4340fc6bfd0429b7b9dc47c95e0ba5f25361` |
| `release-candidate-flow.webm` | 11.32-second, 1280 × 720 deployed flow through WebMCP-shaped agent actions, human promotion, receipt download, reload recovery, and stable receipt digest. | `85e90a6c5c98ef1e938f923ecc4c56a5d713e4ba6d683715ff58420cc3bdf7c8` |

## Verification recorded before capture

- `AHL_PROOF_BASE_URL=https://agent-harness-lab.xiaoweiwan-michi.chatgpt.site npm run proof:pr6` completed against a clean browser context.
- The proof harness required exactly `get_lab_state`, `load_mission`, `run_baseline`, `inspect_trace`, `stage_harness_patch`, `run_candidate_suite`, `compare_harnesses`, and `export_evidence_receipt`; it rejected decision and broad-execution capabilities.
- The agent-shaped sequence reached compared revision 5 with five signals, two sealed trials, and `agent · webmcp` provenance. Promotion remained a page control and produced human decision revision 6.
- Both downloaded receipt files parsed, matched schema `1.0.0`, identified a human promotion, omitted hidden reasoning, and retained the same canonical digest across reload.
- Desktop and 320 px pages had no page-level horizontal overflow. The run reported no console, page, request, or HTTP error.
- The complete release suite passed: 142 unit tests, 24 WebMCP contract tests, production Worker and client build, and 34 browser cases with two intentional mobile skips.
- ChatGPT's in-app browser independently discovered the same eight native WebMCP contracts from the public origin. A separate manual deployed flow reached human rejection at revision 6.

## Limits

The repeatable proof runner installs a standards-shaped `document.modelContext` harness so it can invoke and assert the page's registered contracts deterministically. Native in-app discovery was verified separately; the narrated challenge demo must still capture a real agent tool sequence. All mission results are built-in deterministic fixtures, not live model execution or production telemetry. The video is implementation proof, not the final narrated submission video.
