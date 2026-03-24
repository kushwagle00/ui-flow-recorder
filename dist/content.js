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
    return {
      primary: alts[0] || buildXPath(el),
      alternatives: alts.slice(1)
    };
  }

  // src/content/content.ts
  function safeSend(msg) {
    try {
      if (!chrome?.runtime?.id) return;
      chrome.runtime.sendMessage(msg, () => {
        void chrome.runtime.lastError;
      });
    } catch {
    }
  }
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!target) return;
    const { primary, alternatives } = buildSelectors(target);
    safeSend({
      kind: "RECORD_STEP",
      step: {
        type: "click",
        element: getElementSnapshot(target),
        selectors: { primary, alternatives },
        pointer: { x: e.clientX, y: e.clientY }
      }
    });
  }, true);
  document.addEventListener("change", (e) => {
    const target = e.target;
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
})();
//# sourceMappingURL=content.js.map
