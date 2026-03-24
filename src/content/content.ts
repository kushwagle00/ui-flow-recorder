import { buildSelectors, getElementSnapshot } from "@shared/selectorBuilder";
const scope = globalThis as typeof globalThis & { __uiFlowInstalled?: boolean };
if (!scope.__uiFlowInstalled) {
  scope.__uiFlowInstalled = true;
  function record(event: Event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (event.type === "change" && !input) return;
    const sensitive = target.matches('input[type="password"], input[type="hidden"], input[type="file"], [autocomplete="one-time-code"], [autocomplete^="cc-"]');
    const secretOnPage = !!document.querySelector('input[type="password"], [autocomplete="one-time-code"], [autocomplete^="cc-"]');
    let value = input ? target.value : undefined;
    if (target instanceof HTMLInputElement && ["checkbox", "radio"].includes(target.type)) value = String(target.checked);
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage({ kind: "RECORD_STEP", step: {
        type: event.type === "click" ? "click" : "input", url: location.href,
        element: getElementSnapshot(target), selectors: buildSelectors(target),
        value: sensitive ? "[REDACTED]" : event.type === "change" ? value : undefined,
        sensitive: sensitive || secretOnPage,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        pointer: event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : undefined
      } }, () => { void chrome.runtime.lastError; });
    } catch { /* A reloaded extension must not disrupt the host page. */ }
  }
  document.addEventListener("click", record, true);
  document.addEventListener("change", record, true);
}
