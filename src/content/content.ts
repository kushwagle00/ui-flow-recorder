import type { MsgFromContent } from "@shared/messaging";
import { buildSelectors, getElementSnapshot } from "@shared/selectorBuilder";

function safeSend(msg: any) {
  try {
    // If the extension has been reloaded, chrome.runtime.id is undefined
    if (!chrome?.runtime?.id) return;

    chrome.runtime.sendMessage(msg, () => {
      // Swallow runtime errors that can occur when SW is asleep / context invalidated
      // e.g., "Extension context invalidated", "Receiving end does not exist"
      // Accessing lastError is enough to clear Chrome's error state.
      void chrome.runtime.lastError;
    });
  } catch {
    // No-op: page keeps functioning, we just don't record this event
  }
}

document.addEventListener("click", (e) => {
  const target = e.target as Element | null;
  if (!target) return;
  const { primary, alternatives } = buildSelectors(target);

  safeSend({
    kind: "RECORD_STEP",
    step: {
      type: "click",
      element: getElementSnapshot(target),
      selectors: { primary, alternatives },
      pointer: { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY }
    }
  });
}, true);

document.addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!target) return;
  const { primary, alternatives } = buildSelectors(target);

  safeSend({
    kind: "RECORD_STEP",
    step: {
      type: "input",
      element: getElementSnapshot(target),
      selectors: { primary, alternatives },
      value: target.value
    }
  });
}, true);

// Optional: you can also capture key presses and group them later.
// Optional: observe URL changes via history API hijack if you want finer granularity.

