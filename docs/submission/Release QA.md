# Agent Harness Lab — release QA record

> This is an evidence record, not a promise. A row is passed only when the named environment or command produced the recorded result.

## Release identity

| Field | Verified value |
| --- | --- |
| Tested implementation commit | `94e8209edac41d6f3c4710cd77fb870dcb101977` |
| Deployed source commit | `94e8209edac41d6f3c4710cd77fb870dcb101977` |
| Public live URL | https://agent-harness-lab.xiaoweiwan-michi.chatgpt.site |
| Public repository | https://github.com/snowan/agent-harness-lab |
| Public demo video | Pending owner-approved YouTube upload |
| License | MIT |
| Tested at | `2026-08-31T02:15:49Z` |

The deployed source and tested implementation are identical. Before submission, the merged default branch must contain this implementation commit and the remaining public-submission rows must be closed.

## Automated gates

| Gate | Required result | Status | Evidence |
| --- | --- | --- | --- |
| Clean install | No install error; audit result recorded | Passed | `npm ci`: 99 packages installed; `npm audit`: 0 vulnerabilities |
| TypeScript | 0 errors | Passed | `npm run typecheck` |
| Unit | All fixtures and domain tests pass | Passed | 142 tests across 11 files |
| WebMCP contracts | Discovery, schemas, lifecycle, parity, safety, and output budgets pass | Passed | 24 tests across four files |
| Production build | Worker entrypoint, static client, and hosting metadata emitted | Passed | `dist/server/index.js`, `dist/client/index.html`, and `dist/.openai/hosting.json` packaged by the Sites helper |
| Browser matrix | Desktop, 390 px, 320 px, and 200% zoom proxy pass | Passed | 34 passed; two mobile instances of the desktop-only zoom proxy intentionally skipped |
| Accessibility | Automated serious/critical scan, keyboard focus, reduced motion, and announcements pass | Passed | Playwright release suite |
| Diff hygiene | No whitespace errors or unintended generated files | Passed | `git diff --check`, explicit staging, and clean archive inventory |

## Deployed smoke tests

| Environment | Check | Status | Evidence or observation |
| --- | --- | --- | --- |
| Signed-out browser | Live URL loads without credentials or redirects | Passed | Clean Playwright context opened the public Sites URL |
| Signed-out browser | No failed first-party request, console error, or page error | Passed | Deployed proof rejected console, page, request, and HTTP errors |
| Signed-out browser | Completion without proof flow reaches compared state | Passed | Deployed PR6 proof ran baseline → inspect → stage → candidate → compare |
| Signed-out browser | Human promotion and rejection controls remain usable | Passed | Deployed proof promoted; separate in-app manual flow rejected at revision 6 |
| Signed-out browser | JSON receipt downloads and its canonical digest verifies | Passed | Proof parsed two downloads across reload and required the same `sha256:` digest |
| ChatGPT in-app browser | Runtime reports exactly eight WebMCP tools | Passed | Native discovery listed all eight tool contracts from the public origin |
| ChatGPT in-app browser | Agent completes baseline → inspect → stage → candidate → compare | Pending demo take | Native agent invocation must be captured for the narrated challenge demo |
| ChatGPT in-app browser | Visible state and `agent · webmcp` provenance update after each command | Pending demo take | Contract and deployed harness proof passed; native agent take remains |
| ChatGPT in-app browser | Discovered tools contain no promote, reject, deploy, filesystem, URL-fetch, or code-execution capability | Passed | Native discovery set contained only the eight bounded lab tools |
| ChatGPT in-app browser | Human decision followed by receipt summary succeeds | Partial | Manual rejection reached revision 6; native agent receipt-summary take remains |

## Accessibility and responsive QA

| Check | Status | Observation |
| --- | --- | --- |
| Keyboard-only primary flow; no keyboard trap | Passed | Playwright keyboard flow completed |
| Focus is visible on mission cards, tabs, commands, dialog, and decisions | Passed | Roving-tab and focus-visible assertions passed |
| Dialog focus enters, stays contained, closes with Escape, and returns to opener | Passed | Dialog focus contract passed in the browser suite |
| Phase, persistence, tool result, and receipt updates are announced appropriately | Passed | Live-region and save-failure announcement checks passed |
| Reduced-motion mode removes paced transitions without hiding state | Passed | Reduced-motion browser case passed |
| 1440×900, 390×844, 320×720, and 720×450 layouts have no page-level horizontal overflow | Passed | Browser matrix plus deployed proof overflow assertions passed |
| Evidence table and long hypothesis remain reviewable at narrow widths | Passed | 320 px and 200 percent zoom-proxy checks passed |
| Text and interactive control contrast remains legible | Passed | Automated serious/critical accessibility scan and visual proof review passed |

## Public submission gates

| Gate | Status | Evidence |
| --- | --- | --- |
| Owner selected the license; top-level `LICENSE` matches that choice | Passed | Owner selected MIT; PR6 contains the standard MIT text |
| GitHub detects the license in the repository About area | Pending merge | The license is not on `main` until PR6 merges |
| Repository is public and a signed-out visitor can access it | Passed | Anonymous GitHub API returned `private: false`; repository page returned HTTP 200 |
| README contains setup, tests, architecture, WebMCP tools, limitations, and live URL | Passed | Release README reviewed in PR6 |
| Public source includes all assets and no secret, token, credential, or private note | Passed | Working-tree gitleaks scan reported no leaks; third-party boundary documented |
| Public YouTube video is under three minutes, audible, and playable signed out | Pending owner approval | Demo script and take checklist are prepared |
| Devpost draft contains the verified live, repository, and video URLs | Partial | Live and repository URLs are verified; YouTube URL remains pending |
| Devpost copy matches the implemented release and makes no live-model or production-telemetry claim | Passed | Draft reviewed against implementation and fixture labels |
| Final Devpost preview was shown to and approved by the owner | Pending | External submission approval gate |
| Submitted project page and all three public URLs were rechecked before the deadline | Pending | Final submission gate |

## Freeze rule

After the September 3, 2026 1:00 p.m. PT deadline, do not edit the Devpost entry, submitted repository, or live site during judging. Continue development only in a separate fork or repository while preserving the submitted release.
