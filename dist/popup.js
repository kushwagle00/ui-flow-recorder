"use strict";
(() => {
  // src/popup/popup.ts
  var status = document.getElementById("statusText");
  var start = document.getElementById("startBtn");
  var stop = document.getElementById("stopBtn");
  var busy = false;
  async function send(msg) {
    const response = await chrome.runtime.sendMessage(msg);
    if (!response) throw new Error("Recorder unavailable. Reload the extension.");
    if (response.kind === "ERROR") throw new Error(response.message);
    if (response.kind === "STATUS") {
      status.textContent = response.isRecording ? "Recording this tab" : "Idle";
      start.disabled = response.isRecording;
      stop.disabled = !response.isRecording;
      document.getElementById("runId").textContent = response.runId ?? "--";
      document.getElementById("stepCount").textContent = String(response.stepCount ?? 0);
    }
  }
  async function action(task) {
    if (busy) return;
    busy = true;
    start.disabled = stop.disabled = true;
    try {
      await task();
    } catch (error) {
      await send({ kind: "GET_STATUS" }).catch(() => {
      });
      status.textContent = String(error.message);
    } finally {
      busy = false;
    }
  }
  start.addEventListener("click", () => action(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url ?? "")) throw new Error("Open a regular HTTP or HTTPS page first.");
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await send({ kind: "START_RECORDING", tabId: tab.id });
  }));
  stop.addEventListener("click", () => action(() => send({ kind: "STOP_RECORDING" })));
  document.getElementById("openViewerBtn").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") }));
  void action(() => send({ kind: "GET_STATUS" }));
  setInterval(() => {
    if (!busy) void send({ kind: "GET_STATUS" }).catch(() => {
    });
  }, 1e3);
})();
//# sourceMappingURL=popup.js.map
