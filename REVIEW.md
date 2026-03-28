# Demo readiness review - 2026-11-13

## Verdict

The original main branch (`423f8aa`) was not reliable enough for a demo. The corrected build is suitable for a controlled demonstration of recording, inspecting and exchanging short top-level web flows. It is not a production-certified recorder or an automated replay engine.

Repository creation metadata: March 24, 2026. This review and its fixes were implemented on November 13, 2026. At the repository owner's request, the single implementation commit was reorganized into four logical commits with historical author dates of March 24-27, 2026. These author dates are presentation metadata, not evidence that the fixes existed then. The committer dates retain the actual rewrite time. The two original project commits are unchanged. A fifth follow-up commit, author-dated March 28, fixes an initialization race discovered by CI during the rewrite; it was also implemented on November 13.

## Findings and changes

| Severity | Original problem | Resolution |
| --- | --- | --- |
| High | Worker startup reset recording to false | Read persisted run/recording state on every operation; verified after worker termination |
| High | Concurrent events and Stop raced through storage read/modify/write | Single background queue serializes recording, finalization and viewer mutations |
| High | Import/save assumed array index zero was an active run, dropping history or resurrecting completed runs | Save by run/step identity; imports get a fresh ID; history preserved |
| High | All tabs contributed events and screenshots could show an unrelated tab | Bind each run to its originating tab and capture only when that tab is active |
| High | Password and payment values could be stored verbatim | Redact recognized sensitive fields; skip screenshots on recognized sensitive forms |
| Medium | Reinjecting listeners doubled captured events | Per-document installation guard |
| Medium | TypeScript failed on browser use of NodeJS.Timeout | Browser-compatible timer type; typecheck gates builds |
| Medium | Popup silently accepted restricted-page failures | Validate target and show readable errors |
| Medium | Screenshot permissions did not cover navigation reliably | Explicit host permission and documented permission use |
| Medium | Imported structures were barely validated and could load remote image URLs | Validate run/step/selector/image data and limit imports |
| Medium | Slideshow resumed from zero; hidden controls displayed due to CSS | Resume from selected position, pause on manual selection, enforce hidden styles |
| Medium | Pointer scaling assumed DPR 1 | Capture page viewport/DPR and map pointer against viewport with image offsets |
| Medium | Selector primary could be a non-unique name or unsupported text pseudo-selector | Prefer unique CSS with a structural CSS fallback |
| Medium | node_modules was committed; unused dependencies carried audit findings | Remove tracked dependencies and unused packages; reproducible npm lockfile |
| Low | No repeatable demo, stale manual test claims, poor narrow-screen layout | Demo checkout, current docs/checklist, responsive styles and keyboard selection |

## Validation

Real Chromium extension tests cover rapid events without losses, duplicate injection, unrelated tabs, screenshots, SPA navigation, actual worker shutdown/wakeup, stop/finalization, saved selector persistence, export contents, empty/nonempty-library import, deletion persistence, malformed imports, password redaction, live-run edit guards, slideshow resume/pause, narrow layout, and popup start/stop/error flows. Local validation passed all 6 Chromium scenarios, strict TypeScript checking, and the production build. npm audit reported 0 vulnerabilities. Screenshots of the populated viewer were visually inspected. GitHub Actions repeats checks on push.

## Remaining presentation constraints

Use fictional data on the bundled HTTP demo and stop before opening the viewer. Test loading in the stable Chrome version and display scaling used for the presentation. Browser toolbar invocation and OS scaling are manual acceptance items; automated tests exercise popup content in an extension page. Screenshots are sampled and best effort; not every step has an image. Blur fields to commit input changes. Refresh an open viewer for new runs. Frames, closed shadow DOM, full browser restart recovery, long-session performance/retention, comprehensive PII detection, and automatic replay remain outside this demo's supported scope. See README for details.
