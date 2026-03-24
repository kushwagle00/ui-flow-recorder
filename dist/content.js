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
      "data-testid": target.dataset?.testid
    };
    const text = target.innerText?.trim();
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
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter((s) => s.tagName === node.tagName) : [node];
      path.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
      node = node.parentElement;
    }
    const unique = alts.find((s) => {
      try {
        return document.querySelectorAll(s).length === 1 && document.querySelector(s) === el;
      } catch {
        return false;
      }
    }) ?? path.join(" > ");
    return { primary: unique, alternatives: [...new Set(alts)].filter((s) => s !== unique) };
  }

  // src/content/content.ts
  var scope = globalThis;
  if (!scope.__uiFlowInstalled) {
    let record2 = function(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (event.type === "change" && !input) return;
      const sensitive = target.matches('input[type="password"], input[type="hidden"], input[type="file"], [autocomplete="one-time-code"], [autocomplete^="cc-"]');
      const secretOnPage = !!document.querySelector('input[type="password"], [autocomplete="one-time-code"], [autocomplete^="cc-"]');
      let value = input ? target.value : void 0;
      if (target instanceof HTMLInputElement && ["checkbox", "radio"].includes(target.type)) value = String(target.checked);
      try {
        if (!chrome.runtime?.id) return;
        chrome.runtime.sendMessage({ kind: "RECORD_STEP", step: {
          type: event.type === "click" ? "click" : "input",
          url: location.href,
          element: getElementSnapshot(target),
          selectors: buildSelectors(target),
          value: sensitive ? "[REDACTED]" : event.type === "change" ? value : void 0,
          sensitive: sensitive || secretOnPage,
          viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
          pointer: event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : void 0
        } }, () => {
          void chrome.runtime.lastError;
        });
      } catch {
      }
    };
    record = record2;
    scope.__uiFlowInstalled = true;
    document.addEventListener("click", record2, true);
    document.addEventListener("change", record2, true);
  }
  var record;
})();
//# sourceMappingURL=content.js.map
