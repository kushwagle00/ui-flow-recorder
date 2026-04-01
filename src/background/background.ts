
// src/background/background.ts

import type { MsgFromContent, MsgFromPopup } from "@shared/messaging";
import type { Step } from "@shared/types";
import {
  getCurrentRun, setCurrentRun, pushStep, finalizeRun,
  startNewRun, getRecordingFlag, setRecordingFlag
} from "@shared/storage";


/**
 * Recording toggle lives in background (service worker)
 */
let isRecording = false;

/**
 * Helpers: Chrome callback APIs → Promises (MV3-safe)
 * NOTE: When windowId is undefined, call the overload WITHOUT a first argument.
 */

function captureVisibleTab(windowId?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const callback = (dataUrl?: string) => {
      if (chrome.runtime.lastError || !dataUrl) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(dataUrl);
      }
    };

    const options: chrome.tabs.CaptureVisibleTabOptions = { format: "png" };

    if (typeof windowId === "number") {
      // Overload: captureVisibleTab(windowId: number, options, callback)
      chrome.tabs.captureVisibleTab(windowId, options, callback);
    } else {
      // Overload: captureVisibleTab(options, callback)  ← NO first arg at all
      chrome.tabs.captureVisibleTab(options, callback);
    }
  });
}

async function getTabSize(tabId?: number): Promise<{ width: number; height: number }> {
  if (typeof tabId !== "number") return { width: 0, height: 0 };
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        resolve({ width: 0, height: 0 });
      } else {
        // width/height aren't consistently typed on chrome.tabs.Tab in @types/chrome for MV3
        resolve({
          width: (tab as any).width ?? 0,
          height: (tab as any).height ?? 0
        });
      }
    });
  });
}

/**
 * Step IDs: stable increasing number
 */
let lastStepId = Date.now();
function nextStepId(): number {
  const now = Date.now();
  if (now <= lastStepId) lastStepId += 1;
  else lastStepId = now;
  return lastStepId;
}

/**
 * Lifecycle: initialize flags
 */

async function hydrateRecordingFlag() {
  // On service worker startup, always reset to false to avoid stale state
  // from a crash or unexpected termination
  isRecording = false;
  await setRecordingFlag(false);
}

// Ensure state is clean on startup
hydrateRecordingFlag();


/**
 * Core message router (popup + content)
 */
chrome.runtime.onMessage.addListener((msg: MsgFromContent | MsgFromPopup, sender, sendResponse) => {
  (async () => {
    // ✅ Guard: ensure msg has a "kind"
    if (!(msg && typeof msg === "object" && "kind" in msg)) {
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // Popup → Status
    // ─────────────────────────────────────────────────────────────
    const popupMsg = msg as MsgFromPopup;

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

    // ─────────────────────────────────────────────────────────────
    // Content → Record an action (click/input) with screenshot
    // ─────────────────────────────────────────────────────────────
    if (msg.kind === "RECORD_STEP") {
      if (!isRecording) {
        sendResponse(undefined);
        return;
      }

      const stepBase = (msg as any).step as {
        type: Step["type"];
        element?: Step["element"];
        selectors?: Step["selectors"];
        value?: string;
        pointer?: { x: number; y: number };
      };

      const tab = sender.tab;
      const windowId = tab?.windowId; // may be undefined
      const tabId = tab?.id;          // may be undefined

      let screenshotDataUrl: string | undefined;
      try {
        // Some pages/windows disallow capture (chrome://, extensions, PDF viewer, Web Store)
        screenshotDataUrl = await captureVisibleTab(windowId);
      } catch {
        // Keep undefined if capture fails
      }

      const { width, height } = await getTabSize(tabId);

      const step: Step = {
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
            devicePixelRatio: 1 // You can improve this via injected script later
          },
          pointer: stepBase.pointer
            ? { x: stepBase.pointer.x, y: stepBase.pointer.y, units: "viewport-px" }
            : undefined
        }
      };

      await pushStep(step);
      sendResponse(undefined);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // Explicit NAVIGATION message (optional; we also capture via tabs.onUpdated)
    // ─────────────────────────────────────────────────────────────
    if (msg.kind === "NAVIGATION") {
      if (!isRecording) {
        sendResponse(undefined);
        return;
      }
      const navUrl = (msg as any).url as string;
      const step: Step = {
        stepId: nextStepId(),
        timestamp: Date.now(),
        type: "navigation",
        url: navUrl
      };
      await pushStep(step);
      sendResponse(undefined);
      return;
    }
  })();

  // Important: keep the message channel open for async sendResponse
  return true;
});

/**
 * Background-level navigation capture:
 * When a tab finishes loading and we're recording, add a navigation step.
 */
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!isRecording) return;
  if (info.status === "complete" && tab.url) {
    const step: Step = {
      stepId: nextStepId(),
      timestamp: Date.now(),
      type: "navigation",
      url: tab.url
    };
    await pushStep(step);
  }
});

export {};
