import { validateRun } from "@shared/validation";
import type { MsgFromContent, MsgFromPopup } from "@shared/messaging";
import type { Step } from "@shared/types";
import {
  getCurrentRun,
  setCurrentRun,
  getRuns,
  setRuns,
  pushStep,
  finalizeRun,
  startNewRun,
  getRecordingFlag,
  setRecordingFlag,
} from "@shared/storage";

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
const nextId = () => (lastId = Math.max(Date.now(), lastId + 1));
async function status() {
  const run = await getCurrentRun();
  return {
    kind: "STATUS",
    isRecording: await getRecordingFlag(),
    paused: !!run?.paused,
    title: run?.title,
    tabId: run?.tabId,
    startedAt: run?.startedAt,
    runId: run?.runId,
    stepCount: run?.steps.length ?? 0,
  };
}
async function publishState(previousTabId?: number) {
  const state = await status();
  await chrome.action.setBadgeText({
    text: state.isRecording ? (state.paused ? "II" : "REC") : "",
  });
  await chrome.action.setBadgeBackgroundColor({
    color: state.paused ? "#a16207" : "#dc2626",
  });
  await chrome.action.setTitle({
    title: state.isRecording
      ? `${state.paused ? "Paused" : "Recording"}: ${state.title ?? "QA session"} - ${state.stepCount} steps`
      : "UI Flow Recorder - Start a QA session",
  });
  const ids = new Set([previousTabId, state.tabId]);
  for (const tabId of ids)
    if (typeof tabId === "number") {
      await chrome.tabs
        .sendMessage(tabId, {
          ...state,
          kind: "RECORDING_STATE",
          active: state.isRecording && state.tabId === tabId,
        })
        .catch(() => {});
    }
}
async function handle(msg: any, sender: chrome.runtime.MessageSender) {
  if (!msg || typeof msg.kind !== "string") throw new Error("Invalid message");
  const fromPage = !sender.url?.startsWith(chrome.runtime.getURL(""));
  if (
    fromPage &&
    ![
      "RECORD_STEP",
      "NAVIGATION",
      "GET_PAGE_STATUS",
      "SET_PAUSED",
      "STOP_RECORDING",
    ].includes(msg.kind)
  )
    throw new Error("Unsupported page message");
  if (
    fromPage &&
    ["SET_PAUSED", "STOP_RECORDING"].includes(msg.kind) &&
    (await getCurrentRun())?.tabId !== sender.tab?.id
  )
    throw new Error("This tab is not recording.");
  if (msg.kind === "GET_PAGE_STATUS") {
    const state = await status();
    return state.tabId === sender.tab?.id
      ? { ...state, active: state.isRecording }
      : { active: false };
  }
  if (msg.kind === "SET_PAUSED") {
    const run = await getCurrentRun();
    if (!run || !(await getRecordingFlag()))
      throw new Error("No recording in progress.");
    if (typeof msg.paused !== "boolean") throw new Error("Invalid pause state");
    run.paused = msg.paused;
    await setCurrentRun(run);
    if (!run.paused && run.tabId) {
      const tab = await chrome.tabs.get(run.tabId);
      await pushStep({
        stepId: nextId(),
        timestamp: Date.now(),
        type: "navigation",
        url: tab.url ?? "",
      });
    }
    await publishState();
    return status();
  }
  if (msg.kind === "GET_STATUS") return status();
  if (msg.kind === "START_RECORDING") {
    const tab = await chrome.tabs.get(msg.tabId);
    if (!tab.id || !/^https?:/.test(tab.url ?? ""))
      throw new Error("Open a regular HTTP or HTTPS page before recording.");
    if (!(await getRecordingFlag())) {
      // Recover an interrupted finalization before replacing the current run.
      if (await getCurrentRun()) await finalizeRun();
      const run = await startNewRun(tab.id);
      run.title =
        typeof msg.title === "string" && msg.title.trim()
          ? msg.title.trim().slice(0, 120)
          : `QA session - ${new URL(tab.url!).hostname}`;
      await setCurrentRun(run);
      await setRecordingFlag(true);
      await pushStep({
        stepId: nextId(),
        timestamp: Date.now(),
        type: "navigation",
        url: tab.url!,
      });
    }
    await publishState();
    return status();
  }
  if (msg.kind === "STOP_RECORDING") {
    const finished = await finalizeRun();
    await setRecordingFlag(false);
    await publishState(finished?.tabId);
    if (msg.openViewer && finished)
      await chrome.tabs.create({
        url: chrome.runtime.getURL(
          `viewer.html?run=${encodeURIComponent(finished.runId)}`,
        ),
      });
    return status();
  }
  if (msg.kind === "GET_CURRENT_RUN") {
    const run = await getCurrentRun();
    return { kind: "CURRENT_RUN", runId: run?.runId, steps: run?.steps };
  }
  if (["SAVE_RUN", "SAVE_QA", "IMPORT_RUN", "DELETE_RUN"].includes(msg.kind)) {
    const active = await getCurrentRun();
    const id = msg.runId ?? msg.run?.runId;
    if (active?.runId === id)
      throw new Error("Stop recording before editing or deleting this run.");
    const runs = await getRuns();
    if (msg.kind === "DELETE_RUN")
      await setRuns(runs.filter((r) => r.runId !== id));
    else if (msg.kind === "IMPORT_RUN") {
      validateRun(msg.run);
      await setRuns([
        ...runs,
        {
          ...msg.run,
          runId: crypto.randomUUID(),
          tabId: undefined,
          stoppedAt: msg.run.stoppedAt ?? Date.now(),
        },
      ]);
    } else if (msg.kind === "SAVE_QA") {
      const saved = runs.find((r) => r.runId === id);
      const step = saved?.steps.find((s) => s.stepId === msg.stepId);
      if (!saved || !step)
        throw new Error("Step no longer exists. Refresh the session.");
      if (
        typeof msg.title !== "string" ||
        !msg.title.trim() ||
        msg.title.length > 120
      )
        throw new Error("Enter a session name of up to 120 characters.");
      if (
        !msg.review ||
        !["not-reviewed", "pass", "fail", "blocked"].includes(
          msg.review.result,
        ) ||
        typeof msg.review.expected !== "string" ||
        typeof msg.review.actual !== "string" ||
        msg.review.expected.length > 10000 ||
        msg.review.actual.length > 10000
      )
        throw new Error("Invalid QA review");
      saved.title = msg.title.trim();
      step.review = {
        result: msg.review.result,
        expected: msg.review.expected,
        actual: msg.review.actual,
      };
      await setRuns(runs);
    } else {
      const index = runs.findIndex((r) => r.runId === id);
      if (index < 0)
        throw new Error("Recording no longer exists. Reload the viewer.");
      // Apply only the selected step's selector choice to the latest saved run.
      const step = runs[index].steps.find((s) => s.stepId === msg.stepId);
      if (
        !step?.selectors ||
        ![step.selectors.primary, ...step.selectors.alternatives].includes(
          msg.primary,
        )
      )
        throw new Error("Invalid selector choice");
      step.selectors = {
        primary: msg.primary,
        alternatives: [
          ...new Set([step.selectors.primary, ...step.selectors.alternatives]),
        ].filter((v) => v !== msg.primary),
      };
      await setRuns(runs);
    }
    return { kind: "OK" };
  }
  if (!(await getRecordingFlag())) return { kind: "IGNORED" };
  const run = await getCurrentRun();
  if (!run || run.paused || sender.tab?.id !== run.tabId)
    return { kind: "IGNORED" };
  if (msg.kind === "RECORD_STEP") {
    const data = (msg as Extract<MsgFromContent, { kind: "RECORD_STEP" }>).step;
    if (!data || !["click", "input"].includes(data.type))
      throw new Error("Invalid step");
    const tab = await chrome.tabs.get(run.tabId!);
    let screenshotDataUrl: string | undefined;
    // captureVisibleTab captures the active tab, never capture a different tab.
    if (tab.active && !data.sensitive && Date.now() - lastCapture >= 600) {
      lastCapture = Date.now();
      try {
        screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: "jpeg",
          quality: 65,
        });
      } catch {
        /* An event remains useful without an image. */
      }
    }
    await pushStep({
      stepId: nextId(),
      timestamp: Date.now(),
      type: data.type,
      url: data.url ?? sender.tab?.url ?? "",
      element: data.element,
      selectors: data.selectors,
      value: data.value,
      visualContext: {
        screenshotDataUrl,
        viewport: data.viewport,
        pointer: data.pointer
          ? { ...data.pointer, units: "viewport-px" }
          : undefined,
      },
    });
    await publishState();
    return { kind: "OK" };
  }
  return { kind: "IGNORED" };
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  serial(() => handle(msg, sender)).then(respond, (error) =>
    respond({ kind: "ERROR", message: String(error?.message ?? error) }),
  );
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (!info.url) return;
  serial(async () => {
    const run = await getCurrentRun();
    if (!(await getRecordingFlag()) || run?.tabId !== tabId || run.paused)
      return;
    await pushStep({
      stepId: nextId(),
      timestamp: Date.now(),
      type: "navigation",
      url: info.url!,
    });
    await publishState();
  }).catch(console.error);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  serial(async () => {
    if ((await getCurrentRun())?.tabId === tabId) {
      await finalizeRun();
      await setRecordingFlag(false);
      await publishState(tabId);
    }
  }).catch(console.error);
});

void serial(() => publishState()).catch(console.error);
