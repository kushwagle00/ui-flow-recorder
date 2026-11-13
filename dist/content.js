"use strict";
(() => {
  // src/shared/selectorBuilder.ts
  function cssEscape(s) {
    return CSS.escape ? CSS.escape(s) : s.replace(/(["\\])/g, "\\$1");
  }
  function buildXPath(el) {
    if (el instanceof Document || el === document.documentElement) return "/html";
    const paths = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tag = current.tagName.toLowerCase();
      const index = (() => {
        let i = 1;
        let sib = current.previousElementSibling;
        while (sib) {
          if (sib.tagName.toLowerCase() === tag) i++;
          sib = sib.previousElementSibling;
        }
        return i;
      })();
      paths.unshift(`/${tag}[${index}]`);
      current = current.parentElement;
    }
    return paths.length ? paths.join("") : "/";
  }
  function getElementSnapshot(target) {
    const tag = target.tagName.toLowerCase();
    const attrs = {
      id: target.getAttribute("id") || void 0,
      name: target.getAttribute("name") || void 0,
      class: target.getAttribute("class") || void 0,
      role: target.getAttribute("role") || void 0,
      "aria-label": target.getAttribute("aria-label") || void 0,
      "data-testid": target.dataset?.testid
    };
    const labels = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement ? Array.from(target.labels ?? []).map((label) => label.textContent?.trim()).filter(Boolean).join(" ") : "";
    const text = labels || target.getAttribute("aria-label") || target.innerText?.trim();
    return { tag, text, attributes: attrs };
  }
  function buildSelectors(target) {
    const alts = [];
    const el = target;
    const testid = el.dataset?.testid;
    if (testid) alts.push(`*[data-testid="${cssEscape(testid)}"]`);
    const id = el.id;
    if (id) alts.push(`#${cssEscape(id)}`);
    const name = el.getAttribute("name");
    if (name) alts.push(`${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`);
    const aria = el.getAttribute("aria-label");
    if (aria) alts.push(`*[aria-label="${cssEscape(aria)}"]`);
    const text = el.innerText?.trim();
    if (text && text.length <= 50) {
      alts.push(`text="${text.replace(/\s+/g, " ")}"`);
    }
    alts.push(`xpath=${buildXPath(el)}`);
    const path = [];
    let node = el;
    while (node) {
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(
        (s) => s.tagName === node.tagName
      ) : [node];
      path.unshift(
        `${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`
      );
      node = node.parentElement;
    }
    const unique = alts.find((s) => {
      try {
        return document.querySelectorAll(s).length === 1 && document.querySelector(s) === el;
      } catch {
        return false;
      }
    }) ?? path.join(" > ");
    return {
      primary: unique,
      alternatives: [...new Set(alts)].filter((s) => s !== unique)
    };
  }

  // src/content/content.ts
  var scope = globalThis;
  if (!scope.__uiFlowInstalled) {
    let mount2 = function() {
      if (!recording || !document.documentElement || host?.isConnected) return;
      host = document.createElement("div");
      host.id = "ui-flow-recorder-controls";
      host.style.cssText = "all:initial!important;position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;";
      root = host.attachShadow({ mode: "open" });
      root.innerHTML = `<style>
      :host{color-scheme:light}*{box-sizing:border-box}.bar{font:13px/1.4 system-ui,sans-serif;color:#172033;background:white;border:1px solid #d8deea;border-top:3px solid #dc2626;box-shadow:0 8px 36px #11182735;border-radius:12px;padding:14px;width:min(350px,calc(100vw - 32px))}.bar.paused{border-top-color:#a16207}.heading{display:flex;gap:8px;align-items:center;font-weight:750}.dot{width:9px;height:9px;border-radius:50%;background:#dc2626;box-shadow:0 0 0 4px #fee2e2}.paused .dot{background:#a16207;box-shadow:0 0 0 4px #fef3c7}.name{margin:10px 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meta{color:#536079;font-variant-numeric:tabular-nums}.buttons{display:flex;gap:8px;margin-top:12px}button{font:600 12px system-ui;border-radius:7px;border:1px solid #ccd4e2;background:#f4f6fa;color:#26334a;padding:9px 12px;cursor:pointer}button.stop{background:#172f64;color:white;border-color:#172f64}button:disabled{opacity:.5;cursor:wait}.error{color:#b91c1c;margin-top:8px}.move{margin-left:auto;padding:3px 7px;font-size:11px}</style>
      <section class="bar" aria-label="QA recording controls"><div class="heading"><span class="dot"></span><span id="state" role="status"></span><button class="move" title="Move controls to the other side" aria-label="Move recording controls">Move</button></div><div class="name"></div><div class="meta"></div><div class="buttons"><button id="pause">Pause</button><button class="stop" id="stop">Stop & review</button></div><div class="error" role="alert"></div></section>`;
      document.documentElement.append(host);
      root.querySelector(".move").onclick = () => {
        if (!host) return;
        const left = host.style.left === "16px";
        host.style.setProperty("left", left ? "auto" : "16px", "important");
        host.style.setProperty("right", left ? "16px" : "auto", "important");
      };
      for (const id of ["pause", "stop"])
        root.querySelector(`#${id}`).onclick = async () => {
          const currentRoot = root;
          currentRoot.querySelectorAll("button").forEach((b) => b.disabled = true);
          try {
            await control(
              id === "pause" ? { kind: "SET_PAUSED", paused: !paused } : { kind: "STOP_RECORDING", openViewer: true }
            );
          } catch (error) {
            currentRoot.querySelector(".error").textContent = error.message;
          } finally {
            currentRoot.querySelectorAll("button").forEach((b) => b.disabled = false);
          }
        };
    }, render2 = function() {
      if (!recording) {
        host?.remove();
        return;
      }
      mount2();
      if (!root) return;
      root.querySelector(".bar").classList.toggle("paused", paused);
      root.querySelector("#state").textContent = paused ? "Paused - nothing is being captured" : "Recording this tab";
      root.querySelector(".name").textContent = sessionName;
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1e3));
      root.querySelector(".meta").textContent = `${count} ${count === 1 ? "step" : "steps"} captured \xB7 Session ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
      root.querySelector("#pause").textContent = paused ? "Resume" : "Pause";
    }, update2 = function(state) {
      recording = !!state.active;
      paused = !!state.paused;
      startedAt = state.startedAt ?? Date.now();
      count = state.stepCount ?? 0;
      sessionName = state.title ?? "QA session";
      render2();
    }, record2 = function(event) {
      if (!recording || paused || host && event.composedPath().includes(host))
        return;
      const original = event.target;
      if (!(original instanceof Element)) return;
      const target = event.type === "click" ? original.closest(
        "button, a, input, select, textarea, [role=button], [role=link]"
      ) ?? original : original;
      const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (event.type === "change" && !input) return;
      const sensitive = target.matches(
        'input[type="password"], input[type="hidden"], input[type="file"], [autocomplete="one-time-code"], [autocomplete^="cc-"]'
      );
      const secretOnPage = !!document.querySelector(
        'input[type="password"], [autocomplete="one-time-code"], [autocomplete^="cc-"]'
      );
      let value = input ? target.value : void 0;
      if (target instanceof HTMLInputElement && ["checkbox", "radio"].includes(target.type))
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
              value: sensitive ? "[REDACTED]" : event.type === "change" ? value : void 0,
              sensitive: sensitive || secretOnPage,
              viewport: {
                width: innerWidth,
                height: innerHeight,
                devicePixelRatio
              },
              pointer: event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : void 0
            }
          },
          () => {
            void chrome.runtime.lastError;
          }
        );
      } catch {
      }
    };
    mount = mount2, render = render2, update = update2, record = record2;
    scope.__uiFlowInstalled = true;
    let recording = false;
    let paused = false;
    let startedAt = 0;
    let host;
    let root;
    let count = 0;
    let sessionName = "QA session";
    async function control(message) {
      const response = await chrome.runtime.sendMessage(message);
      if (response?.kind === "ERROR") throw new Error(response.message);
      return response;
    }
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.kind === "RECORDING_STATE") update2(message);
    });
    void control({ kind: "GET_PAGE_STATUS" }).then(update2).catch(() => {
    });
    document.addEventListener("DOMContentLoaded", render2, { once: true });
    const timer = setInterval(() => {
      try {
        if (!chrome.runtime?.id) {
          host?.remove();
          clearInterval(timer);
          return;
        }
        render2();
      } catch {
        host?.remove();
        clearInterval(timer);
      }
    }, 1e3);
    document.addEventListener("click", record2, true);
    document.addEventListener("change", record2, true);
  }
  var mount;
  var render;
  var update;
  var record;
})();
//# sourceMappingURL=content.js.map
