import { buildSelectors, getElementSnapshot } from "@shared/selectorBuilder";
const scope = globalThis as typeof globalThis & { __uiFlowInstalled?: boolean };
if (!scope.__uiFlowInstalled) {
  scope.__uiFlowInstalled = true;
  let recording = false;
  let paused = false;
  let startedAt = 0;
  let host: HTMLDivElement | undefined;
  let root: ShadowRoot | undefined;
  let count = 0;
  let sessionName = "QA session";
  async function control(message: object) {
    const response = await chrome.runtime.sendMessage(message);
    if (response?.kind === "ERROR") throw new Error(response.message);
    return response;
  }
  function mount() {
    if (!recording || !document.documentElement || host?.isConnected) return;
    host = document.createElement("div");
    host.id = "ui-flow-recorder-controls";
    host.style.cssText =
      "all:initial!important;position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      :host{color-scheme:light}*{box-sizing:border-box}.bar{font:13px/1.4 system-ui,sans-serif;color:#172033;background:white;border:1px solid #d8deea;border-top:3px solid #dc2626;box-shadow:0 8px 36px #11182735;border-radius:12px;padding:14px;width:min(350px,calc(100vw - 32px))}.bar.paused{border-top-color:#a16207}.heading{display:flex;gap:8px;align-items:center;font-weight:750}.dot{width:9px;height:9px;border-radius:50%;background:#dc2626;box-shadow:0 0 0 4px #fee2e2}.paused .dot{background:#a16207;box-shadow:0 0 0 4px #fef3c7}.name{margin:10px 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meta{color:#536079;font-variant-numeric:tabular-nums}.buttons{display:flex;gap:8px;margin-top:12px}button{font:600 12px system-ui;border-radius:7px;border:1px solid #ccd4e2;background:#f4f6fa;color:#26334a;padding:9px 12px;cursor:pointer}button.stop{background:#172f64;color:white;border-color:#172f64}button:disabled{opacity:.5;cursor:wait}.error{color:#b91c1c;margin-top:8px}.move{margin-left:auto;padding:3px 7px;font-size:11px}</style>
      <section class="bar" aria-label="QA recording controls"><div class="heading"><span class="dot"></span><span id="state" role="status"></span><button class="move" title="Move controls to the other side" aria-label="Move recording controls">Move</button></div><div class="name"></div><div class="meta"></div><div class="buttons"><button id="pause">Pause</button><button class="stop" id="stop">Stop & review</button></div><div class="error" role="alert"></div></section>`;
    document.documentElement.append(host);
    root.querySelector<HTMLButtonElement>(".move")!.onclick = () => {
      if (!host) return;
      const left = host.style.left === "16px";
      host.style.setProperty("left", left ? "auto" : "16px", "important");
      host.style.setProperty("right", left ? "16px" : "auto", "important");
    };
    for (const id of ["pause", "stop"])
      root.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = async () => {
        const currentRoot = root!;
        currentRoot
          .querySelectorAll("button")
          .forEach((b) => (b.disabled = true));
        try {
          await control(
            id === "pause"
              ? { kind: "SET_PAUSED", paused: !paused }
              : { kind: "STOP_RECORDING", openViewer: true },
          );
        } catch (error) {
          currentRoot.querySelector(".error")!.textContent = (
            error as Error
          ).message;
        } finally {
          currentRoot
            .querySelectorAll("button")
            .forEach((b) => (b.disabled = false));
        }
      };
  }
  function render() {
    if (!recording) {
      host?.remove();
      return;
    }
    mount();
    if (!root) return;
    root.querySelector(".bar")!.classList.toggle("paused", paused);
    root.querySelector("#state")!.textContent = paused
      ? "Paused - nothing is being captured"
      : "Recording this tab";
    root.querySelector(".name")!.textContent = sessionName;
    const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    root.querySelector(".meta")!.textContent =
      `${count} ${count === 1 ? "step" : "steps"} captured · Session ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
    root.querySelector("#pause")!.textContent = paused ? "Resume" : "Pause";
  }
  function update(state: any) {
    recording = !!state.active;
    paused = !!state.paused;
    startedAt = state.startedAt ?? Date.now();
    count = state.stepCount ?? 0;
    sessionName = state.title ?? "QA session";
    render();
  }
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.kind === "RECORDING_STATE") update(message);
  });
  void control({ kind: "GET_PAGE_STATUS" })
    .then(update)
    .catch(() => {});
  document.addEventListener("DOMContentLoaded", render, { once: true });
  const timer = setInterval(() => {
    try {
      if (!chrome.runtime?.id) {
        host?.remove();
        clearInterval(timer);
        return;
      }
      render();
    } catch {
      host?.remove();
      clearInterval(timer);
    }
  }, 1000);
  function record(event: Event) {
    if (!recording || paused || (host && event.composedPath().includes(host)))
      return;
    const original = event.target;
    if (!(original instanceof Element)) return;
    const target =
      event.type === "click"
        ? (original.closest(
            "button, a, input, select, textarea, [role=button], [role=link]",
          ) ?? original)
        : original;
    const input =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    if (event.type === "change" && !input) return;
    const sensitive = target.matches(
      'input[type="password"], input[type="hidden"], input[type="file"], [autocomplete="one-time-code"], [autocomplete^="cc-"]',
    );
    const secretOnPage = !!document.querySelector(
      'input[type="password"], [autocomplete="one-time-code"], [autocomplete^="cc-"]',
    );
    let value = input ? target.value : undefined;
    if (
      target instanceof HTMLInputElement &&
      ["checkbox", "radio"].includes(target.type)
    )
      value = String(target.checked);
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage(
        {
          kind: "RECORD_STEP",
          step: {
            type: event.type === "click" ? "click" : "input",
            url: location.href,
            element: getElementSnapshot(target),
            selectors: buildSelectors(target),
            value: sensitive
              ? "[REDACTED]"
              : event.type === "change"
                ? value
                : undefined,
            sensitive: sensitive || secretOnPage,
            viewport: {
              width: innerWidth,
              height: innerHeight,
              devicePixelRatio,
            },
            pointer:
              event instanceof MouseEvent
                ? { x: event.clientX, y: event.clientY }
                : undefined,
          },
        },
        () => {
          void chrome.runtime.lastError;
        },
      );
    } catch {
      /* A reloaded extension must not disrupt the host page. */
    }
  }
  document.addEventListener("click", record, true);
  document.addEventListener("change", record, true);
}
