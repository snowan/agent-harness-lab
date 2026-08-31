# Agent Harness Lab — release QA record

> This is an evidence record, not a promise. Mark a row passed only after testing the final release commit in the named environment. Link evidence or record the exact command and result.

## Release identity

| Field | Verified value |
| --- | --- |
| Release commit | `[COMMIT_SHA]` |
| Deployed commit | `[DEPLOYED_COMMIT_SHA]` |
| Public live URL | `[PUBLIC_LIVE_URL]` |
| Public repository | `[PUBLIC_REPOSITORY_URL]` |
| Public demo video | `[PUBLIC_YOUTUBE_URL]` |
| License | `[OWNER_SELECTED_LICENSE]` |
| Tested at | `[ISO_8601_TIMESTAMP]` |

The release passes only when the release commit, default branch, and deployed commit are identical.

## Automated gates

| Gate | Required result | Status | Evidence |
| --- | --- | --- | --- |
| Clean install | No install error; audit result recorded | Pending | `npm ci` and `npm audit` |
| TypeScript | 0 errors | Pending | `npm run typecheck` |
| Unit | All fixtures and domain tests pass | Pending | `npm run test:unit` |
| WebMCP contracts | Discovery, schemas, lifecycle, parity, safety, and output budgets pass | Pending | `npm run test:contract` |
| Production build | Static bundle and hosting metadata emitted | Pending | `npm run build`; inspect `dist/.openai/hosting.json` |
| Browser matrix | Desktop, 390 px, 320 px, and 200% zoom proxy pass | Pending | `npm run test:e2e` |
| Accessibility | Automated serious/critical scan, keyboard focus, reduced motion, and announcements pass | Pending | Playwright report plus manual rows below |
| Diff hygiene | No whitespace errors or unintended generated files | Pending | `git diff --check`; exact staged diff review |

## Deployed smoke tests

Run every row first in a signed-out browser and then in ChatGPT's in-app browser where specified.

| Environment | Check | Status | Evidence or observation |
| --- | --- | --- | --- |
| Signed-out browser | Live URL loads without credentials or redirects | Pending | `[EVIDENCE]` |
| Signed-out browser | No failed first-party request, console error, or page error | Pending | `[EVIDENCE]` |
| Signed-out browser | Manual Completion without proof flow reaches compared state | Pending | `[EVIDENCE]` |
| Signed-out browser | Human promotion and rejection controls remain usable | Pending | `[EVIDENCE]` |
| Signed-out browser | JSON receipt downloads and its canonical digest verifies | Pending | `[EVIDENCE]` |
| ChatGPT in-app browser | Runtime reports exactly eight WebMCP tools | Pending | `[EVIDENCE]` |
| ChatGPT in-app browser | Agent completes baseline → inspect → stage → candidate → compare | Pending | `[EVIDENCE]` |
| ChatGPT in-app browser | Visible state and `agent · webmcp` provenance update after each command | Pending | `[EVIDENCE]` |
| ChatGPT in-app browser | Discovered tools contain no promote, reject, deploy, filesystem, URL-fetch, or code-execution capability | Pending | `[EVIDENCE]` |
| ChatGPT in-app browser | Human decision followed by receipt summary succeeds | Pending | `[EVIDENCE]` |

## Manual accessibility and responsive QA

| Check | Status | Observation |
| --- | --- | --- |
| Keyboard-only primary flow; no keyboard trap | Pending | `[OBSERVATION]` |
| Focus is visible on mission cards, tabs, commands, dialog, and decisions | Pending | `[OBSERVATION]` |
| Dialog focus enters, stays contained, closes with Escape, and returns to opener | Pending | `[OBSERVATION]` |
| Phase, persistence, tool result, and receipt updates are announced appropriately | Pending | `[OBSERVATION]` |
| Reduced-motion mode removes paced transitions without hiding state | Pending | `[OBSERVATION]` |
| 1440×900, 390×844, 320×720, and 720×450 layouts have no page-level horizontal overflow | Pending | `[OBSERVATION]` |
| Evidence table and long hypothesis remain reviewable at narrow widths | Pending | `[OBSERVATION]` |
| Text and interactive control contrast remains legible | Pending | `[OBSERVATION]` |

## Public submission gates

| Gate | Status | Evidence |
| --- | --- | --- |
| Owner selected the license; top-level `LICENSE` matches that choice | Pending | `[EVIDENCE]` |
| GitHub detects the license in the repository About area | Pending | `[EVIDENCE]` |
| Repository is public and a signed-out visitor can clone it | Pending | `[EVIDENCE]` |
| README contains setup, tests, architecture, WebMCP tools, limitations, and live URL | Pending | `[EVIDENCE]` |
| Public source includes all assets and no secret, token, credential, or private note | Pending | `[EVIDENCE]` |
| Public YouTube video is under three minutes, audible, and playable signed out | Pending | `[EVIDENCE]` |
| Devpost draft contains the verified live, repository, and video URLs | Pending | `[EVIDENCE]` |
| Devpost copy matches the implemented release and makes no live-model or production-telemetry claim | Pending | `[EVIDENCE]` |
| Final Devpost preview was shown to and approved by the owner | Pending | `[EVIDENCE]` |
| Submitted project page and all three public URLs were rechecked before the deadline | Pending | `[EVIDENCE]` |

## Freeze rule

After the September 3, 2026 1:00 p.m. PT deadline, do not edit the Devpost entry, submitted repository, or live site during judging. Continue development only in a separate fork or repository while preserving the submitted release.
