// src/shared/validation.ts
function validateRun(value) {
  const r = value;
  if (!r || typeof r.runId !== "string" || !r.runId || !Number.isFinite(r.startedAt) || !Array.isArray(r.steps) || r.steps.length > 1e4) throw new Error("Invalid recording");
  const ids = /* @__PURE__ */ new Set();
  for (const s of r.steps) {
    if (!s || !Number.isFinite(s.stepId) || ids.has(s.stepId) || !Number.isFinite(s.timestamp) || !["click", "input", "navigation"].includes(s.type) || typeof s.url !== "string") throw new Error("Invalid step");
    ids.add(s.stepId);
    if (s.selectors && (typeof s.selectors.primary !== "string" || !Array.isArray(s.selectors.alternatives) || s.selectors.alternatives.some((v) => typeof v !== "string"))) throw new Error("Invalid selectors");
    const image = s.visualContext?.screenshotDataUrl;
    if (image && (typeof image !== "string" || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image))) throw new Error("Invalid screenshot");
    const viewport = s.visualContext?.viewport;
    if (viewport && ![viewport.width, viewport.height].every((v) => Number.isFinite(v) && v > 0)) throw new Error("Invalid viewport");
  }
}

// src/shared/storage.ts
var CURRENT_RUN_KEY = "currentRun";
var RUNS_KEY = "runs";
var RECORDING_FLAG_KEY = "isRecording";
async function getRecordingFlag() {
  const { [RECORDING_FLAG_KEY]: flag } = await chrome.storage.local.get([RECORDING_FLAG_KEY]);
  return Boolean(flag);
}
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
async function startNewRun(tabId) {
  const run = {
    runId: crypto.randomUUID(),
    tabId,
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
  const existing = runs.findIndex((r) => r.runId === run.runId);
  if (existing >= 0) runs[existing] = run;
  else runs.push(run);
  await chrome.storage.local.set({ runs, isRecording: false });
  await setCurrentRun(null);
  return run;
}

// src/background/background.ts
var queue = Promise.resolve();
function serial(task) {
  const result = queue.then(task);
  queue = result.catch(() => void 0);
  return result;
}
var lastCapture = 0;
var lastId = Date.now();
var nextId = () => lastId = Math.max(Date.now(), lastId + 1);
async function status() {
  const run = await getCurrentRun();
  return { kind: "STATUS", isRecording: await getRecordingFlag(), runId: run?.runId, stepCount: run?.steps.length ?? 0 };
}
async function handle(msg, sender) {
  if (!msg || typeof msg.kind !== "string") throw new Error("Invalid message");
  const fromPage = !sender.url?.startsWith(chrome.runtime.getURL(""));
  if (fromPage && !["RECORD_STEP", "NAVIGATION"].includes(msg.kind)) throw new Error("Unsupported page message");
  if (msg.kind === "GET_STATUS") return status();
  if (msg.kind === "START_RECORDING") {
    const tab = await chrome.tabs.get(msg.tabId);
    if (!tab.id || !/^https?:/.test(tab.url ?? "")) throw new Error("Open a regular HTTP or HTTPS page before recording.");
    if (!await getRecordingFlag()) {
      if (await getCurrentRun()) await finalizeRun();
      await startNewRun(tab.id);
      await setRecordingFlag(true);
      await pushStep({ stepId: nextId(), timestamp: Date.now(), type: "navigation", url: tab.url });
    }
    return status();
  }
  if (msg.kind === "STOP_RECORDING") {
    await finalizeRun();
    await setRecordingFlag(false);
    return status();
  }
  if (msg.kind === "GET_CURRENT_RUN") {
    const run2 = await getCurrentRun();
    return { kind: "CURRENT_RUN", runId: run2?.runId, steps: run2?.steps };
  }
  if (["SAVE_RUN", "IMPORT_RUN", "DELETE_RUN"].includes(msg.kind)) {
    const active = await getCurrentRun();
    const id = msg.runId ?? msg.run?.runId;
    if (active?.runId === id) throw new Error("Stop recording before editing or deleting this run.");
    const runs = await getRuns();
    if (msg.kind === "DELETE_RUN") await setRuns(runs.filter((r) => r.runId !== id));
    else if (msg.kind === "IMPORT_RUN") {
      validateRun(msg.run);
      await setRuns([...runs, { ...msg.run, runId: crypto.randomUUID(), tabId: void 0, stoppedAt: msg.run.stoppedAt ?? Date.now() }]);
    } else {
      const index = runs.findIndex((r) => r.runId === id);
      if (index < 0) throw new Error("Recording no longer exists. Reload the viewer.");
      const step = runs[index].steps.find((s) => s.stepId === msg.stepId);
      if (!step?.selectors || ![step.selectors.primary, ...step.selectors.alternatives].includes(msg.primary)) throw new Error("Invalid selector choice");
      step.selectors = { primary: msg.primary, alternatives: [.../* @__PURE__ */ new Set([step.selectors.primary, ...step.selectors.alternatives])].filter((v) => v !== msg.primary) };
      await setRuns(runs);
    }
    return { kind: "OK" };
  }
  if (!await getRecordingFlag()) return { kind: "IGNORED" };
  const run = await getCurrentRun();
  if (!run || sender.tab?.id !== run.tabId) return { kind: "IGNORED" };
  if (msg.kind === "RECORD_STEP") {
    const data = msg.step;
    if (!data || !["click", "input"].includes(data.type)) throw new Error("Invalid step");
    const tab = await chrome.tabs.get(run.tabId);
    let screenshotDataUrl;
    if (tab.active && !data.sensitive && Date.now() - lastCapture >= 600) {
      lastCapture = Date.now();
      try {
        screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 65 });
      } catch {
      }
    }
    await pushStep({ stepId: nextId(), timestamp: Date.now(), type: data.type, url: data.url ?? sender.tab?.url ?? "", element: data.element, selectors: data.selectors, value: data.value, visualContext: { screenshotDataUrl, viewport: data.viewport, pointer: data.pointer ? { ...data.pointer, units: "viewport-px" } : void 0 } });
    return { kind: "OK" };
  }
  return { kind: "IGNORED" };
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  serial(() => handle(msg, sender)).then(respond, (error) => respond({ kind: "ERROR", message: String(error?.message ?? error) }));
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (!info.url) return;
  serial(async () => {
    const run = await getCurrentRun();
    if (!await getRecordingFlag() || run?.tabId !== tabId) return;
    await pushStep({ stepId: nextId(), timestamp: Date.now(), type: "navigation", url: info.url });
  }).catch(console.error);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  serial(async () => {
    if ((await getCurrentRun())?.tabId === tabId) {
      await finalizeRun();
      await setRecordingFlag(false);
    }
  }).catch(console.error);
});
//# sourceMappingURL=background.js.map
