# UI Flow Recorder

A Chrome Manifest V3 extension for recording a single tab's clicks, committed form changes, navigation, selectors, and best-effort screenshots. Review flows as a slideshow and export/import JSON. Playback is a visual slideshow, not browser automation.

## Install

Requires Node.js 20+ (tested with Node 24), npm, and Chrome/Chromium.

```sh
git clone https://github.com/kushwagle00/ui-flow-recorder.git
cd ui-flow-recorder
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist`. Pin **UI Flow Recorder** to the toolbar. After rebuilding, click Reload on the extension and refresh the target page. The checked-in `dist` also supports loading without a build.

## Manual QA workflow

- Give the test a name in the popup, then **Start recording this tab**.
- A floating bar on the test page shows **Recording**, session time, and captured step count. The extension icon also shows **REC** (pin it to see the badge).
- Use **Pause** for setup/private actions and **Resume** to continue. Paused navigation is excluded; resuming adds the current page as context. **Move** switches the control bar between lower corners.
- **Stop & review** saves and opens that exact session. Clicks on the recorder's own controls are excluded from captured steps.
- Review plain-language actions and input values. Add **Pass / Fail / Blocked**, expected results, and actual results/notes for each step; click **Save review**. The session can be renamed in the review screen.
- **Download QA report** creates a Markdown reproduction report. **Technical details & export options** contains JSON export (including screenshots), selector editing, and deletion.
- Older recordings remain compatible. The report contains text only; attach the JSON separately when screenshot evidence is needed. Unsaved review changes are guarded when switching steps or sessions.

## Update an already loaded extension

In `chrome://extensions`, click **Reload** on UI Flow Recorder. Refresh the test website and any existing viewer tab so they load the new scripts. This is required after rebuilding an unpacked extension; it does not delete saved sessions. Finish any active recording before reloading.

## Five-minute demo

1. Run `npm run demo` and open http://127.0.0.1:4173.
2. Open the extension popup and click **Start Recording**. The initial navigation is recorded.
3. Enter a fictional name and leave the field, choose a color, toggle Gift wrap, and click Add to cart.
4. Click Checkout (SPA navigation), then Finish and navigate (full-page navigation).
5. Click **Stop & review** on the floating recording bar. Refresh an already-open viewer to load new recordings.
6. Select steps, inspect screenshots/selectors, choose an alternative selector and Save Changes. Play, pause, and resume the slideshow.
7. Export JSON, import it as a separate copy, and reload the viewer to demonstrate persistence. Delete a copy after confirming.

Record only public demo data. Screenshots and ordinary input values can contain private information.

## Behavior and limits

- Recording belongs to the tab where Start was pressed and continues across navigation and background-worker suspension. Closing that tab finalizes the run. Restarting Chrome itself or reloading the extension mid-recording is not a supported demo flow.
- Top-level HTML only: iframe internals, closed shadow DOM, canvas interactions, file/system pages and browser-owned pages are not supported.
- Inputs record on `change` (usually blur), not every keystroke. Blur the last field before stopping. Checkbox/radio values record checked state.
- Screenshots are JPEG, sampled at most once per 600 ms and only while the recorded tab is active. Rapid steps, restricted pages, or capture failures may have no image; screenshot timing is best effort and may show the result of a click.
- Password, payment autocomplete, OTP and file values are redacted. Screenshots are skipped on pages containing recognized password/payment/OTP controls. This is not comprehensive PII detection: arbitrary text, URLs, and screenshots may still contain sensitive information.
- Selectors prefer unique CSS; alternatives may contain `text=` or `xpath=` prefixes. No automatic replay engine is included.
- Stop before editing/deleting a live run. Viewer data is a snapshot; refresh to see updates from another viewer or a newly completed recording.
- Imported files are limited to 20 MB and 10,000 steps. Recordings are stored locally, without automatic retention or cloud sync. Export and delete old runs periodically; large screenshot histories can be slow.

## Permissions

`storage` persists recordings; `unlimitedStorage` avoids the small local quota for screenshot-heavy demos; `tabs` identifies the selected tab/navigation; `scripting` injects listeners into pages already open at installation; `activeTab` supports toolbar-triggered access; `<all_urls>` host access allows reinjection and screenshots after navigation. Recording is still explicitly scoped to the chosen tab. No recording data is uploaded by this extension.

## Development and verification

```sh
npm run typecheck
npx playwright install chromium
npm test
npm audit
```

`npm test` builds and exercises the real extension in an isolated Chromium profile. Tests cover event ordering, worker restart, tab isolation, screenshots, import/export, selector persistence, deletion, slideshow behavior, responsive layout, redaction and invalid inputs. CI repeats the suite on pushes and pull requests.

- `src/background`: serialized message routing and lifecycle
- `src/content`: idempotent event listeners
- `src/shared`: types, selectors, storage, import validation
- `src/popup`, `src/viewer`: extension interfaces
- `demo`: local fictional checkout
- `tests`: Playwright extension regression suite

See [REVIEW.md](REVIEW.md) for the readiness assessment and [TEST_CASES.md](TEST_CASES.md) for a presentation checklist.
