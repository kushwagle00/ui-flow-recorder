import type { MsgFromPopup, MsgToPopup } from "@shared/messaging";
import type { Run } from "@shared/types";

const statusText = document.getElementById("statusText")!;
const runIdEl = document.getElementById("runId")!;
const stepCountEl = document.getElementById("stepCount")!;
const toggleBtn = document.getElementById("toggleBtn") as HTMLButtonElement;
const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;
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
  statusText.textContent = isRecording ? "Recording…" : "Idle";
  toggleBtn.textContent = isRecording ? "Stop Recording" : "Start Recording";
  runIdEl.textContent = runId ?? "—";
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
      // Try to inject the latest content script (ignores restricted pages)
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    }
  } catch {
    // Some pages (chrome://, Web Store, PDF) disallow injections—safe to ignore
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
    // Download JSON via Blob without requiring "downloads" permission
    const run: Partial<Run> = {
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
