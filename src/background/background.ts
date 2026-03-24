import { validateRun } from "@shared/validation";
import type { MsgFromContent, MsgFromPopup } from "@shared/messaging";
import type { Step } from "@shared/types";
import { getCurrentRun, getRuns, setRuns, pushStep, finalizeRun, startNewRun, getRecordingFlag, setRecordingFlag } from "@shared/storage";

// Serialize all storage mutations, including viewer writes and Stop, so in-flight
// captures cannot overwrite events or append to a subsequently started run.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => undefined);
  return result;
}
let lastCapture = 0;
let lastId = Date.now();
const nextId = () => lastId = Math.max(Date.now(), lastId + 1);
async function status() {
  const run = await getCurrentRun();
  return { kind: "STATUS", isRecording: await getRecordingFlag(), runId: run?.runId, stepCount: run?.steps.length ?? 0 };
}
async function handle(msg: any, sender: chrome.runtime.MessageSender) {
  if (!msg || typeof msg.kind !== "string") throw new Error("Invalid message");
  const fromPage = !sender.url?.startsWith(chrome.runtime.getURL(""));
  if (fromPage && !["RECORD_STEP", "NAVIGATION"].includes(msg.kind)) throw new Error("Unsupported page message");
  if (msg.kind === "GET_STATUS") return status();
  if (msg.kind === "START_RECORDING") {
    const tab = await chrome.tabs.get(msg.tabId);
    if (!tab.id || !/^https?:/.test(tab.url ?? "")) throw new Error("Open a regular HTTP or HTTPS page before recording.");
    if (!await getRecordingFlag()) {
      // Recover an interrupted finalization before replacing the current run.
      if (await getCurrentRun()) await finalizeRun();
      await startNewRun(tab.id);
      await setRecordingFlag(true);
      await pushStep({ stepId: nextId(), timestamp: Date.now(), type: "navigation", url: tab.url! });
    }
    return status();
  }
  if (msg.kind === "STOP_RECORDING") {
    await finalizeRun();
    await setRecordingFlag(false);
    return status();
  }
  if (msg.kind === "GET_CURRENT_RUN") {
    const run = await getCurrentRun();
    return { kind: "CURRENT_RUN", runId: run?.runId, steps: run?.steps };
  }
  if (["SAVE_RUN", "IMPORT_RUN", "DELETE_RUN"].includes(msg.kind)) {
    const active = await getCurrentRun();
    const id = msg.runId ?? msg.run?.runId;
    if (active?.runId === id) throw new Error("Stop recording before editing or deleting this run.");
    const runs = await getRuns();
    if (msg.kind === "DELETE_RUN") await setRuns(runs.filter(r => r.runId !== id));
    else if (msg.kind === "IMPORT_RUN") {
      validateRun(msg.run);
      await setRuns([...runs, { ...msg.run, runId: crypto.randomUUID(), tabId: undefined, stoppedAt: msg.run.stoppedAt ?? Date.now() }]);
    } else {
      const index = runs.findIndex(r => r.runId === id);
      if (index < 0) throw new Error("Recording no longer exists. Reload the viewer.");
      // Apply only the selected step's selector choice to the latest saved run.
      const step = runs[index].steps.find(s => s.stepId === msg.stepId);
      if (!step?.selectors || ![step.selectors.primary, ...step.selectors.alternatives].includes(msg.primary)) throw new Error("Invalid selector choice");
      step.selectors = { primary: msg.primary, alternatives: [...new Set([step.selectors.primary, ...step.selectors.alternatives])].filter(v => v !== msg.primary) };
      await setRuns(runs);
    }
    return { kind: "OK" };
  }
  if (!await getRecordingFlag()) return { kind: "IGNORED" };
  const run = await getCurrentRun();
  if (!run || sender.tab?.id !== run.tabId) return { kind: "IGNORED" };
  if (msg.kind === "RECORD_STEP") {
    const data = (msg as Extract<MsgFromContent, {kind: "RECORD_STEP"}>).step;
    if (!data || !["click", "input"].includes(data.type)) throw new Error("Invalid step");
    const tab = await chrome.tabs.get(run.tabId!);
    let screenshotDataUrl: string | undefined;
    // captureVisibleTab captures the active tab, never capture a different tab.
    if (tab.active && !data.sensitive && Date.now() - lastCapture >= 600) {
      lastCapture = Date.now();
      try { screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 65 }); } catch { /* An event remains useful without an image. */ }
    }
    await pushStep({ stepId: nextId(), timestamp: Date.now(), type: data.type, url: data.url ?? sender.tab?.url ?? "", element: data.element, selectors: data.selectors, value: data.value, visualContext: { screenshotDataUrl, viewport: data.viewport, pointer: data.pointer ? { ...data.pointer, units: "viewport-px" } : undefined } });
    return { kind: "OK" };
  }
  return { kind: "IGNORED" };
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  serial(() => handle(msg, sender)).then(respond, error => respond({ kind: "ERROR", message: String(error?.message ?? error) }));
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (!info.url) return;
  serial(async () => {
    const run = await getCurrentRun();
    if (!await getRecordingFlag() || run?.tabId !== tabId) return;
    await pushStep({ stepId: nextId(), timestamp: Date.now(), type: "navigation", url: info.url! });
  }).catch(console.error);
});
chrome.tabs.onRemoved.addListener(tabId => {
  serial(async () => { if ((await getCurrentRun())?.tabId === tabId) { await finalizeRun(); await setRecordingFlag(false); } }).catch(console.error);
});
