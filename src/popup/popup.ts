import type { MsgFromPopup, MsgToPopup } from "@shared/messaging";
import type { Run } from "@shared/types";

const statusText = document.getElementById("statusText")!;
const runIdEl = document.getElementById("runId")!;
const stepCountEl = document.getElementById("stepCount")!;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
const openViewerBtn = document.getElementById("openViewerBtn") as HTMLButtonElement;

openViewerBtn.addEventListener("click", async () => {
  const url = chrome.runtime.getURL("viewer.html");
  await chrome.tabs.create({ url });
});

function sendPopupMessage<T extends MsgFromPopup>(msg: T): Promise<MsgToPopup | undefined> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp: MsgToPopup | undefined) => resolve(resp));
  });
}

function updateStatusUI(isRecording: boolean, runId?: string, stepCount?: number) {
  statusText.textContent = isRecording ? "🔴 Recording..." : "⚪ Idle";
  statusText.className = isRecording ? "status-recording" : "status-idle";
  startBtn.disabled = isRecording;
  stopBtn.disabled = !isRecording;
  runIdEl.textContent = runId ?? "—";
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
      // Ignore restricted pages (chrome://, Web Store, PDF)
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
