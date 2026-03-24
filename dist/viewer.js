"use strict";
(() => {
  // src/shared/storage.ts
  var RUN_KEY = "currentRun";
  async function getCurrentRun() {
    const data = await chrome.storage.local.get([RUN_KEY]);
    return data[RUN_KEY] ?? null;
  }
  async function setCurrentRun(run2) {
    if (run2) {
      await chrome.storage.local.set({ [RUN_KEY]: run2 });
    } else {
      await chrome.storage.local.remove([RUN_KEY]);
    }
  }

  // src/viewer/viewer.ts
  var stepListEl = document.getElementById("stepList");
  var countEl = document.getElementById("count");
  var screenshotEl = document.getElementById("screenshot");
  var pointerEl = document.getElementById("pointer");
  var selectorForm = document.getElementById("selectorForm");
  var stepTypeEl = document.getElementById("stepType");
  var stepUrlEl = document.getElementById("stepUrl");
  var stepTimeEl = document.getElementById("stepTime");
  var viewportEl = document.getElementById("viewport");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var exportBtn = document.getElementById("exportBtn");
  var saveBtn = document.getElementById("saveBtn");
  var run = null;
  var currentIndex = 0;
  init().catch(console.error);
  async function init() {
    run = await getCurrentRun();
    renderList();
    bindNav();
    bindActions();
    if (run && run.steps.length > 0) {
      selectIndex(0);
    }
  }
  function bindNav() {
    prevBtn.addEventListener("click", () => {
      if (!run) return;
      selectIndex(Math.max(0, currentIndex - 1));
    });
    nextBtn.addEventListener("click", () => {
      if (!run) return;
      selectIndex(Math.min(run.steps.length - 1, currentIndex + 1));
    });
  }
  function bindActions() {
    exportBtn.addEventListener("click", onExport);
    saveBtn.addEventListener("click", onSave);
  }
  function renderList() {
    stepListEl.innerHTML = "";
    const steps = run?.steps ?? [];
    countEl.textContent = String(steps.length);
    steps.forEach((s, i) => {
      const li = document.createElement("li");
      li.className = "step-item";
      li.dataset.index = String(i);
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = `#${i + 1} \u2022 ${s.type}`;
      const primary = document.createElement("div");
      primary.className = "mono";
      const prim = s.selectors?.primary ?? "(no selector)";
      primary.textContent = prim;
      const ts = document.createElement("div");
      ts.className = "mono";
      ts.textContent = new Date(s.timestamp).toLocaleString();
      li.append(title, primary, ts);
      li.addEventListener("click", () => selectIndex(i));
      stepListEl.appendChild(li);
    });
  }
  function selectIndex(i) {
    currentIndex = i;
    const items = stepListEl.querySelectorAll(".step-item");
    items.forEach((el, idx) => {
      el.classList.toggle("active", idx === i);
    });
    renderDetail();
  }
  function renderDetail() {
    if (!run) return;
    const step = run.steps[currentIndex];
    if (!step) return;
    stepTypeEl.textContent = step.type;
    stepUrlEl.textContent = step.url || "\u2014";
    stepTimeEl.textContent = new Date(step.timestamp).toLocaleString();
    if (step.visualContext?.viewport) {
      const { width, height, devicePixelRatio } = step.visualContext.viewport;
      viewportEl.textContent = `${width}\xD7${height} @ DPR ${devicePixelRatio ?? 1}`;
    } else {
      viewportEl.textContent = "\u2014";
    }
    const dataUrl = step.visualContext?.screenshotDataUrl;
    screenshotEl.src = dataUrl || "";
    pointerEl.hidden = true;
    if (dataUrl) {
      screenshotEl.onload = () => {
        drawPointer(step);
      };
    }
    renderSelectors(step);
  }
  function drawPointer(step) {
    const pointer = step.visualContext?.pointer;
    if (!pointer) {
      pointerEl.hidden = true;
      return;
    }
    const img = screenshotEl;
    if (!img.naturalWidth || !img.naturalHeight) {
      pointerEl.hidden = true;
      return;
    }
    const renderedWidth = img.clientWidth;
    const renderedHeight = img.clientHeight;
    const sx = renderedWidth / img.naturalWidth;
    const sy = renderedHeight / img.naturalHeight;
    const x = pointer.x * sx;
    const y = pointer.y * sy;
    pointerEl.style.left = `${x}px`;
    pointerEl.style.top = `${y}px`;
    pointerEl.hidden = false;
  }
  function renderSelectors(step) {
    selectorForm.innerHTML = "";
    const sel = step.selectors;
    const all = [
      ...sel?.primary ? [sel.primary] : [],
      ...sel?.alternatives ?? []
    ];
    if (all.length === 0) {
      const p = document.createElement("p");
      p.textContent = "(No selectors recorded for this step)";
      selectorForm.appendChild(p);
      return;
    }
    all.forEach((value, idx) => {
      const row = document.createElement("div");
      row.className = "selector-row";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "primary";
      input.value = value;
      input.checked = idx === 0 && sel?.primary === value || sel?.primary === value;
      const code = document.createElement("code");
      code.textContent = value;
      row.append(input, code);
      selectorForm.appendChild(row);
    });
  }
  async function onSave() {
    if (!run) return;
    const step = run.steps[currentIndex];
    if (!step) return;
    const primary = selectorForm.querySelector("input[name='primary']:checked")?.value;
    if (!primary) return;
    const current = step.selectors ?? { primary, alternatives: [] };
    const existing = /* @__PURE__ */ new Set([
      ...current.alternatives ?? [],
      current.primary
    ]);
    existing.delete(primary);
    const alternatives = Array.from(existing);
    step.selectors = { primary, alternatives };
    await setCurrentRun(run);
    const li = stepListEl.children[currentIndex];
    if (li) {
      const mono = li.querySelector(".mono");
      if (mono) mono.textContent = primary;
    }
  }
  async function onExport() {
    if (!run) return;
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ui-flow-${run.runId ?? "run"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
})();
//# sourceMappingURL=viewer.js.map
