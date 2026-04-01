"use strict";
(() => {
  // src/popup/popup.ts
  var statusText = document.getElementById("statusText");
  var runIdEl = document.getElementById("runId");
  var stepCountEl = document.getElementById("stepCount");
  var startBtn = document.getElementById("startBtn");
  var stopBtn = document.getElementById("stopBtn");
  var openViewerBtn = document.getElementById("openViewerBtn");
  openViewerBtn.addEventListener("click", async () => {
    const url = chrome.runtime.getURL("viewer.html");
    await chrome.tabs.create({ url });
  });
  function sendPopupMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => resolve(resp));
    });
  }
  function updateStatusUI(isRecording, runId, stepCount) {
    statusText.textContent = isRecording ? "\u{1F534} Recording..." : "\u26AA Idle";
    statusText.className = isRecording ? "status-recording" : "status-idle";
    startBtn.disabled = isRecording;
    stopBtn.disabled = !isRecording;
    runIdEl.textContent = runId ?? "\u2014";
    stepCountEl.textContent = String(stepCount ?? 0);
  }
  async function refresh() {
    const resp = await sendPopupMessage({ kind: "GET_STATUS" });
    if (resp && resp.kind === "STATUS") {
      updateStatusUI(resp.isRecording, resp.runId, resp.stepCount);
    }
  }
  startBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      } catch {
      }
    }
    const resp = await sendPopupMessage({ kind: "START_RECORDING" });
    if (resp && resp.kind === "STATUS") {
      updateStatusUI(resp.isRecording, resp.runId, resp.stepCount);
    }
  });
  stopBtn.addEventListener("click", async () => {
    const resp = await sendPopupMessage({ kind: "STOP_RECORDING" });
    if (resp && resp.kind === "STATUS") {
      updateStatusUI(resp.isRecording, resp.runId, resp.stepCount);
    }
  });
  refresh();
})();
//# sourceMappingURL=popup.js.map
