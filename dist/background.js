// src/shared/storage.ts
var CURRENT_RUN_KEY = "currentRun";
var RUNS_KEY = "runs";
var RECORDING_FLAG_KEY = "isRecording";
async function setRecordingFlag(flag) {
  await chrome.storage.local.set({ [RECORDING_FLAG_KEY]: flag });
}
async function getCurrentRun() {
  const obj = await chrome.storage.local.get([CURRENT_RUN_KEY]);
  return obj[CURRENT_RUN_KEY] ?? null;
}
async function setCurrentRun(run) {
  if (run) {
    await chrome.storage.local.set({ [CURRENT_RUN_KEY]: run });
  } else {
    await chrome.storage.local.remove([CURRENT_RUN_KEY]);
  }
}
async function getRuns() {
  const obj = await chrome.storage.local.get([RUNS_KEY]);
  return obj[RUNS_KEY] ?? [];
}
async function setRuns(runs) {
  await chrome.storage.local.set({ [RUNS_KEY]: runs });
}
async function startNewRun() {
  const run = {
    runId: crypto.randomUUID(),
    startedAt: Date.now(),
    steps: []
  };
  await setCurrentRun(run);
  return run;
}
async function pushStep(step) {
  const run = await getCurrentRun();
  if (!run) return;
  run.steps.push(step);
  await setCurrentRun(run);
}
async function finalizeRun() {
  const run = await getCurrentRun();
  if (!run) return null;
  run.stoppedAt = Date.now();
  const runs = await getRuns();
  runs.push(run);
  await setRuns(runs);
  await setCurrentRun(null);
  return run;
}

// src/background/background.ts
var isRecording = false;
function captureVisibleTab(windowId) {
  return new Promise((resolve, reject) => {
    const callback = (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(dataUrl);
      }
    };
    const options = { format: "png" };
    if (typeof windowId === "number") {
      chrome.tabs.captureVisibleTab(windowId, options, callback);
    } else {
      chrome.tabs.captureVisibleTab(options, callback);
    }
  });
}
async function getTabSize(tabId) {
  if (typeof tabId !== "number") return { width: 0, height: 0 };
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        resolve({ width: 0, height: 0 });
      } else {
        resolve({
          width: tab.width ?? 0,
          height: tab.height ?? 0
        });
      }
    });
  });
}
var lastStepId = Date.now();
function nextStepId() {
  const now = Date.now();
  if (now <= lastStepId) lastStepId += 1;
  else lastStepId = now;
  return lastStepId;
}
async function hydrateRecordingFlag() {
  isRecording = false;
  await setRecordingFlag(false);
}
hydrateRecordingFlag();
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!(msg && typeof msg === "object" && "kind" in msg)) {
      return;
    }
    const popupMsg = msg;
    if (popupMsg.kind === "GET_STATUS") {
      const run = await getCurrentRun();
      sendResponse({
        kind: "STATUS",
        isRecording,
        runId: run?.runId,
        stepCount: run?.steps.length ?? 0
      });
      return;
    }
    if (popupMsg.kind === "START_RECORDING") {
      if (!isRecording) {
        isRecording = true;
        await setRecordingFlag(true);
        await startNewRun();
      }
      const run = await getCurrentRun();
      sendResponse({ kind: "STATUS", isRecording, runId: run?.runId, stepCount: run?.steps.length ?? 0 });
      return;
    }
    if (popupMsg.kind === "STOP_RECORDING") {
      if (isRecording) {
        isRecording = false;
        await setRecordingFlag(false);
        await finalizeRun();
      }
      const run = await getCurrentRun();
      sendResponse({ kind: "STATUS", isRecording, runId: run?.runId, stepCount: run?.steps.length ?? 0 });
      return;
    }
    if (popupMsg.kind === "GET_CURRENT_RUN") {
      const run = await getCurrentRun();
      sendResponse({
        kind: "CURRENT_RUN",
        runId: run?.runId,
        steps: run?.steps
      });
      return;
    }
    if (msg.kind === "RECORD_STEP") {
      if (!isRecording) {
        sendResponse(void 0);
        return;
      }
      const stepBase = msg.step;
      const tab = sender.tab;
      const windowId = tab?.windowId;
      const tabId = tab?.id;
      let screenshotDataUrl;
      try {
        screenshotDataUrl = await captureVisibleTab(windowId);
      } catch {
      }
      const { width, height } = await getTabSize(tabId);
      const step = {
        stepId: nextStepId(),
        timestamp: Date.now(),
        type: stepBase.type,
        url: tab?.url || "",
        element: stepBase.element,
        selectors: stepBase.selectors,
        value: stepBase.value,
        visualContext: {
          screenshotDataUrl,
          viewport: {
            width,
            height,
            devicePixelRatio: 1
            // You can improve this via injected script later
          },
          pointer: stepBase.pointer ? { x: stepBase.pointer.x, y: stepBase.pointer.y, units: "viewport-px" } : void 0
        }
      };
      await pushStep(step);
      sendResponse(void 0);
      return;
    }
    if (msg.kind === "NAVIGATION") {
      if (!isRecording) {
        sendResponse(void 0);
        return;
      }
      const navUrl = msg.url;
      const step = {
        stepId: nextStepId(),
        timestamp: Date.now(),
        type: "navigation",
        url: navUrl
      };
      await pushStep(step);
      sendResponse(void 0);
      return;
    }
  })();
  return true;
});
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!isRecording) return;
  if (info.status === "complete" && tab.url) {
    const step = {
      stepId: nextStepId(),
      timestamp: Date.now(),
      type: "navigation",
      url: tab.url
    };
    await pushStep(step);
  }
});
//# sourceMappingURL=background.js.map
