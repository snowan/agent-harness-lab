# PR 3 browser proof

This evidence was captured from source commit
`8c31f79ad6675546c710a07ec994004e8d5e1592` with Google Chrome
`151.0.7922.174`.

## Verification

- `npm run test:all`
- `npm run proof:pr3`
- 115 unit tests passed.
- 16 Playwright checks passed; 2 desktop-only zoom checks were expectedly
  skipped in the mobile projects.
- Responsive coverage: 1440 x 900, 390 x 844, and 320 x 720 viewports, plus a
  720 x 450 browser-zoom proxy.
- The proof workflow asserts five evidence rows, two sealed trials, the exact
  compared revision, human promotion, no page overflow, and no browser errors.

## Captured scenes

- `human-decision-evidence-desktop.png`: compared revision with the five-signal
  evidence matrix, target result, two sealed trials, and enabled human decision.
- `human-decision-mobile-320.png`: promoted terminal state at 320 px, retaining
  the comparison evidence and activity provenance.
- `human-decision-flow.webm`: 1280 x 720, 9.48-second walkthrough from baseline
  reproduction through patch staging, candidate evaluation, and human promotion.

The screenshots and sampled video frames were visually inspected after capture.

## Scope boundary

PR 3 does not register WebMCP tools, export receipts, persist workspaces, or make
the three catalog-only scenarios executable. Those capabilities remain assigned
to later PRs.

## SHA-256

```text
2914f5a38c6b171df3fbdb5b97324d43d2f06d79806c18cfaaf0032d8352b2f6  human-decision-evidence-desktop.png
8f66c18ea21afc9fa12188472d4973c35c610c5f6150d1ed0bede9e255eef1f9  human-decision-flow.webm
0e6cab92a41c039532dfa7ed49a6fc47d306e4b6c4c56ccdb3b92130333e0158  human-decision-mobile-320.png
```
