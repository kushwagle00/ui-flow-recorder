# Demo acceptance checklist

Run `npm test` for automated regression results. These manual items are a checklist, not claims of completed testing.

- [ ] Load `dist` in current stable Chrome and pin the extension.
- [ ] Start on the bundled demo page, record a short journey, and stop.
- [ ] Confirm each click appears once and the last changed field is captured after blur.
- [ ] Check screenshots and pointer alignment at the display scaling used for the presentation.
- [ ] Keep another browser tab open and confirm its clicks are excluded.
- [ ] Play, pause, resume, navigate manually and switch runs.
- [ ] Save a selector, reload the viewer and confirm it persists.
- [ ] Export/import JSON into an empty library and into a library with existing runs.
- [ ] Cancel deletion, then confirm deletion of a disposable copy.
- [ ] Try Start on a restricted page and check the readable error.

Automated coverage lives in `tests/extension.spec.js`. Browser-owned toolbar invocation, manual stable-Chrome loading, and OS display-scale checks remain manual.

## Manual QA controls

- [ ] Pin the extension and verify the REC badge and floating page bar after Start.
- [ ] Pause, navigate and interact; confirm the step count stays unchanged. Resume.
- [ ] Move the bar if it covers a page control; stop and confirm the correct session opens.
- [ ] Name the session, mark a failed step, write expected/actual results and save.
- [ ] Download the QA report and confirm notes are included. Export JSON separately for screenshots.
