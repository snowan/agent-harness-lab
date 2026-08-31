# PR 4 WebMCP proof

This evidence was captured from source commit
`e1b9ec51e78395005e98884a2fe4a5fcab415dce` with Google Chrome
`151.0.7922.174`.

## Capture method

- Capture command: `npm run proof:pr4`
- Runtime: Vite production preview on a strict loopback port
- Browser API harness: Playwright supplies a draft-shaped
  `document.modelContext.registerTool()` surface before page load. The
  application registers its production tool definitions through that public
  surface, and the proof invokes the registered executors by name.
- The harness does not call application internals, run a live model, or claim
  native browser availability outside this controlled proof environment.

The media was generated after the source commit above. This manifest and the
media are added in a separate proof-only commit.

## Verification gate

`npm run test:all` passed immediately before capture:

- TypeScript typecheck: passed
- Unit tests: 116 passed across 8 files
- WebMCP contract tests: 19 passed across 4 files
- Production build: passed
- Playwright: 22 passed with 2 expected desktop-only zoom skips across desktop
  1440 x 900, mobile 390 x 844, and exact mobile 320 x 720 projects

The proof script additionally fails on a browser console error, page error,
page-level horizontal overflow, a registration set other than the exact eight
declared tools, any decision or broad-execution tool, an unexpected revision,
fewer than five evidence signals, fewer than two passing sealed trials, missing
`agent` / `webmcp` provenance, an enabled agent decision capability, or a
receipt whose decision is not attributed to a human.

## Captured scenes

| File | Capture | Size | SHA-256 |
| --- | --- | ---: | --- |
| `webmcp-agent-evidence-desktop.png` | Full page at 1440 x 900 after agent baseline, trace inspection, patch staging, candidate suite, and comparison | 540711 bytes | `6a1f6352789681aaaf8f67772ab6e3a9768c684ddcf8059436f941b52cf65739` |
| `webmcp-human-boundary-mobile-320.png` | Full page at exact 320 x 720 after the human promotion and agent receipt read | 419794 bytes | `493a7ce9ec713c45a82b7e316bf723d5d79cf7f3b4bde5c55cf50fbf7dda9e03` |
| `webmcp-collaboration-flow.webm` | 1280 x 720 VP8 at 25 fps, 8.88 seconds | 1124671 bytes | `bb59b342084dc26cc57ff2d5e0927d1b2ff1ecbd675a3439aad1346793603212` |

The screenshots and a nine-frame video contact sheet were visually inspected
after capture. They show the ready eight-tool runtime, shared evidence state,
agent provenance, the live contract dialog, and the UI-only human decision.

## Scope boundary

PR 4 implements the native-shaped WebMCP adapter and a bounded receipt view for
one executable deterministic mission. PR 5 still owns the checked-in receipt
JSON Schema, downloadable artifact, canonical receipt digest, persistence and
recovery, and additional executable scenarios. Deployment and challenge
submission packaging remain in PR 6.
