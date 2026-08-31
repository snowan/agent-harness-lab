# PR 5 browser proof

This proof was captured from implementation commit `a46d9de9caae2fe5b09d0f644df4a17ed4953f94` with Google Chrome `151.0.7922.174`. The capture script rebuilt the production bundle before opening the app.

## Artifacts

| Artifact | What it demonstrates | SHA-256 |
| --- | --- | --- |
| `four-scenario-evidence-desktop.png` | 1440 px desktop view of the Broken context handoff comparison: four executable missions, five separate signals, one target, two passing sealed trials, local recovery status, receipt control, human-only decision boundary, and activity provenance. | `3ac8212454d5635f61032f2793f3d3c85bd9ae97bee3fe5b71f7d18ab9c9c1bc` |
| `receipt-recovery-mobile-320.png` | 320 px full-page view after restoring a compared Completion without proof workspace and downloading its validated JSON receipt. | `67dc036bafe9c48e4dafbe673629e099bca3e10f7b52b5470281cb1898c7d33e` |
| `scenario-receipt-recovery-flow.webm` | Nine-second, 1280 × 720 flow from the handoff baseline through candidate comparison, receipt download, reload recovery, and a second receipt download. The script parses both files and requires their canonical receipt digests to match. | `50e2e241da871305834e3f266e423bb7a2b71a82c5394a5c7c2acdfe16746f89` |

## Validation recorded before capture

- TypeScript typecheck passed.
- 142 unit tests passed.
- 24 WebMCP contract tests passed.
- Production build passed.
- 34 Playwright cases passed across Chrome at 1440 px, 390 px, and 320 px; the two mobile instances of the desktop-only zoom proxy were intentionally skipped.
- The browser suite includes accessibility checks, keyboard/focus behavior, page overflow checks, reduced motion, all four deterministic fixtures, stale receipt rejection, snapshot recovery, invalid-snapshot fallback, save-failure announcement, formal receipt digest recomputation, and the human-only decision boundary.
- Two independent read-only re-reviews returned clean verdicts after the receipt, provenance, persistence, and causal-view fixes.

## Limits

These artifacts exercise built-in deterministic fixtures in a local static app. They do not claim live model execution, production telemetry, external tool mutation, cross-tab coordination, or signed snapshot provenance. The video is implementation proof, not the narrated challenge-submission demo.
