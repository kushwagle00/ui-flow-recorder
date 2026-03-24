"use strict";
(() => {
  // src/popup/popup.ts
  var statusText = document.getElementById("statusText");
  var runIdEl = document.getElementById("runId");
  var stepCountEl = document.getElementById("stepCount");
  var toggleBtn = document.getElementById("toggleBtn");
  var exportBtn = document.getElementById("exportBtn");
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
    statusText.textContent = isRecording ? "Recording\u2026" : "Idle";
    toggleBtn.textContent = isRecording ? "Stop Recording" : "Start Recording";
    runIdEl.textContent = runId ?? "\u2014";
    stepCountEl.textContent = String(stepCount ?? 0);
  }
  async function refresh() {
    const resp = await sendPopupMessage({ kind: "GET_STATUS" });
    if (resp && resp.kind === "STATUS") {
      updateStatusUI(resp.isRecording, resp.runId, resp.stepCount);
    }
  }
  toggleBtn.addEventListener("click", async () => {
    console.log("Popup: toggle");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      }
    } catch {
    }
    const resp = await sendPopupMessage({ kind: "TOGGLE_RECORDING" });
    if (resp && resp.kind === "STATUS") {
      updateStatusUI(resp.isRecording, resp.runId, resp.stepCount);
    }
  });
  toggleBtn.addEventListener("click", async () => {
    const resp = await sendPopupMessage({ kind: "TOGGLE_RECORDING" });
    if (resp && resp.kind === "STATUS") {
      updateStatusUI(resp.isRecording, resp.runId, resp.stepCount);
    }
  });
  exportBtn.addEventListener("click", async () => {
    const resp = await sendPopupMessage({ kind: "STOP_AND_EXPORT" });
    if (resp && resp.kind === "CURRENT_RUN" && resp.steps && resp.runId) {
      const run = {
        runId: resp.runId,
        steps: resp.steps
      };
      const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ui-flow-${resp.runId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await refresh();
    }
  });
  refresh();
})();
//# sourceMappingURL=popup.js.map
