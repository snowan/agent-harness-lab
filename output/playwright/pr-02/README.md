# PR 2 browser proof

This package records the production-browser proof for the deterministic
**Completion without proof** scenario engine.

## Source identity

- Code commit: `f472efc4ea42bb588b68201cafda753429bd3709`
- Capture command: `npm run proof:pr2`
- Runtime: Vite production preview with strict, project-specific port binding
- Browser: Google Chrome `151.0.7922.174`
- Fixture disclosure: built-in deterministic fixture; no live model or
  production telemetry

The media was regenerated after the code commit above. This README and the
media are added in a separate proof-only commit so reviewers can reproduce the
application state independently.

## Verification gate

`npm run test:all` passed immediately before capture:

- TypeScript typecheck: passed
- Unit tests: 103 passed across 7 files
- Production build: passed
- Playwright: 12 passed across desktop 1440×900, mobile 390×844, and exact
  mobile 320×720 projects

The capture script additionally fails if it observes page-level horizontal
overflow, a browser console error, a page error, an unexpected phase, incorrect
`7/14` derived assertion counts, a malformed SHA-256 result digest, or a missing
assertion-to-fact evidence reference.

## Artifacts

| File | Capture | Size | SHA-256 |
| --- | --- | ---: | --- |
| `baseline-engine-desktop.png` | Full page, 1440×900 viewport | 282377 bytes | `2db5ef9b8e7e99419bd719f8596e1385ff5829b25f22a793aca7faaab190c2db` |
| `baseline-engine-mobile-320.png` | Full page, exact 320×720 viewport | 212014 bytes | `21a70608dc83997e98c31bc3a542678a7abc4a4abe9940cdcd0bbd70657c3c1e` |
| `baseline-engine.webm` | 1280×720, VP8, 25 fps, 2.52 seconds | 172892 bytes | `bc3324e6a359a24f56fbdf00111f38c34f750d8ce73ee3cd3eb3c05814e77d2f` |

The video begins with the runnable mission, executes the baseline, and then
scrolls to hold the failed invariant, full digest, derived counts, and
assertion-to-fact evidence in view.
