"use strict";
(() => {
  // src/popup/popup.ts
  var status = document.getElementById("statusText");
  var start = document.getElementById("startBtn");
  var stop = document.getElementById("stopBtn");
  var pause = document.getElementById("pauseBtn");
  var focus = document.getElementById("focusBtn");
  var name = document.getElementById("sessionName");
  var errorBox = document.getElementById("error");
  var recordingTab;
  var paused = false;
  var busy = false;
  async function send(msg) {
    const response = await chrome.runtime.sendMessage(msg);
    if (!response) throw new Error("Recorder unavailable. Reload the extension.");
    if (response.kind === "ERROR") throw new Error(response.message);
    if (response.kind === "STATUS") {
      paused = !!response.paused;
      recordingTab = response.tabId;
      status.textContent = response.isRecording ? paused ? "Recording paused" : "Recording in progress" : "Ready to record";
      document.body.dataset.recording = String(response.isRecording);
      document.body.dataset.paused = String(paused);
      document.getElementById("statusHint").textContent = response.isRecording ? paused ? "Actions are not being captured." : "Look for the recording bar on your test page." : "Open your test page, then start here.";
      name.disabled = response.isRecording;
      if (response.isRecording) name.value = response.title ?? "";
      start.hidden = response.isRecording;
      pause.hidden = stop.hidden = focus.hidden = !response.isRecording;
      pause.textContent = paused ? "Resume recording" : "Pause recording";
      start.disabled = response.isRecording;
      stop.disabled = !response.isRecording;
      document.getElementById("runId").textContent = response.runId ?? "--";
      document.getElementById("stepCount").textContent = String(
        response.stepCount ?? 0
      );
    }
  }
  async function action(task) {
    if (busy) return;
    busy = true;
    start.disabled = stop.disabled = true;
    try {
      errorBox.hidden = true;
      await task();
    } catch (error) {
      await send({ kind: "GET_STATUS" }).catch(() => {
      });
      errorBox.textContent = String(error.message);
      errorBox.hidden = false;
    } finally {
      busy = false;
    }
  }
  start.addEventListener(
    "click",
    () => action(async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      if (!tab?.id || !/^https?:/.test(tab.url ?? ""))
        throw new Error("Open a regular HTTP or HTTPS page first.");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      await send({ kind: "START_RECORDING", tabId: tab.id, title: name.value });
    })
  );
  stop.addEventListener(
    "click",
    () => action(() => send({ kind: "STOP_RECORDING", openViewer: true }))
  );
  document.getElementById("openViewerBtn").addEventListener(
    "click",
    () => chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") })
  );
  void action(() => send({ kind: "GET_STATUS" }));
  setInterval(() => {
    if (!busy) void send({ kind: "GET_STATUS" }).catch(() => {
    });
  }, 1e3);
  pause.addEventListener(
    "click",
    () => action(() => send({ kind: "SET_PAUSED", paused: !paused }))
  );
  focus.addEventListener(
    "click",
    () => action(async () => {
      if (recordingTab) {
        const tab = await chrome.tabs.update(recordingTab, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      await send({ kind: "GET_STATUS" });
    })
  );
})();
//# sourceMappingURL=popup.js.map
