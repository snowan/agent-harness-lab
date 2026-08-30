# PR 1 verification evidence

**Scope:** Application shell and pure domain core

## Automated verification

- `npm run typecheck` — passed
- `npm run test:unit` — 76 tests passed across reducer, guards, command service, store, and dependency boundaries
- `npm run build` — production bundle completed
- `npm run test:e2e` — 4 browser tests passed across desktop Chrome and 390 px mobile Chrome
- Browser assertions cover UI-to-command-to-store state updates, keyboard operation, visible focus, console errors, and page-level overflow.

## Visual evidence

- [Desktop screenshot](app-shell.png) — 1440 px workspace after loading Broken context handoff
- [Mobile screenshot](app-shell-mobile.png) — 390 px workspace after loading Authority drift
- [Interaction video](app-shell.webm) — initial state through the committed mission transition

The video is a 1280 × 720 VP8 WebM recording produced by Playwright. The proof command is `npm run proof:pr1`.

## Verified boundary

This slice proves the browser shell, shared state subscription, atomic mission-load command, append-only provenance, and human-only decision contract. It does not claim scenario execution or evaluation results; the deterministic runner and graders belong to PR 2.
