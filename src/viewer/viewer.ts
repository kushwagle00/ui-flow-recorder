import type { Run, Step } from "@shared/types";
import { getCurrentRun, setCurrentRun } from "@shared/storage";

const stepListEl = document.getElementById("stepList") as HTMLUListElement;
const countEl = document.getElementById("count")!;
const screenshotEl = document.getElementById("screenshot") as HTMLImageElement;
const pointerEl = document.getElementById("pointer") as HTMLDivElement;
const selectorForm = document.getElementById("selectorForm") as HTMLFormElement;

const stepTypeEl = document.getElementById("stepType")!;
const stepUrlEl = document.getElementById("stepUrl")!;
const stepTimeEl = document.getElementById("stepTime")!;
const viewportEl = document.getElementById("viewport")!;

const prevBtn = document.getElementById("prevBtn") as HTMLButtonElement;
const nextBtn = document.getElementById("nextBtn") as HTMLButtonElement;
const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;

let run: Run | null = null;
let currentIndex = 0;

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
    title.textContent = `#${i + 1} • ${s.type}`;

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

function selectIndex(i: number) {
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

  // Meta
  stepTypeEl.textContent = step.type;
  stepUrlEl.textContent = step.url || "—";
  stepTimeEl.textContent = new Date(step.timestamp).toLocaleString();
  if (step.visualContext?.viewport) {
    const { width, height, devicePixelRatio } = step.visualContext.viewport;
    viewportEl.textContent = `${width}×${height} @ DPR ${devicePixelRatio ?? 1}`;
  } else {
    viewportEl.textContent = "—";
  }

  // Screenshot + pointer
  const dataUrl = step.visualContext?.screenshotDataUrl;
  screenshotEl.src = dataUrl || "";
  pointerEl.hidden = true;

  // Wait for image to compute overlay scaling
  if (dataUrl) {
    screenshotEl.onload = () => {
      drawPointer(step);
    };
  }

  // Selectors
  renderSelectors(step);
}

function drawPointer(step: Step) {
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

  // Compute scale from natural image size → rendered size
  const renderedWidth = img.clientWidth;
  const renderedHeight = img.clientHeight;
  const sx = renderedWidth / img.naturalWidth;
  const sy = renderedHeight / img.naturalHeight;

  // Our coordinates are in viewport pixels (clientX/clientY) during recording.
  // We assume screenshot captured the visible viewport at those dims.
  const x = pointer.x * sx;
  const y = pointer.y * sy;

  pointerEl.style.left = `${x}px`;
  pointerEl.style.top = `${y}px`;
  pointerEl.hidden = false;
}

function renderSelectors(step: Step) {
  selectorForm.innerHTML = "";
  const sel = step.selectors;

  const all = [
    ...(sel?.primary ? [sel.primary] : []),
    ...(sel?.alternatives ?? [])
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
    input.checked = (idx === 0 && sel?.primary === value) || sel?.primary === value;

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

  const primary = (selectorForm.querySelector("input[name='primary']:checked") as HTMLInputElement | null)?.value;
  if (!primary) return;

  // Rebuild selectors: set primary, move others to alternatives (dedupe)
  const current = step.selectors ?? { primary: primary, alternatives: [] };
  const existing = new Set<string>([
    ...(current.alternatives ?? []),
    current.primary
  ]);
  existing.delete(primary);
  const alternatives = Array.from(existing);

  step.selectors = { primary, alternatives };
  await setCurrentRun(run);

  // Refresh list primary text
// --- replace the single assignment with this block ---
const li = stepListEl.children[currentIndex] as HTMLLIElement | undefined;
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