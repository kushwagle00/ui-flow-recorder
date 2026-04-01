import type { Run, Step } from "@shared/types";
import { getCurrentRun, setCurrentRun, getRuns, setRuns, deleteRun } from "@shared/storage";

const runsListEl = document.getElementById("runsList") as HTMLUListElement;
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
const viewJsonBtn = document.getElementById("viewJsonBtn") as HTMLButtonElement;
const importBtn = document.getElementById("importBtn") as HTMLButtonElement;
const importFileInput = document.getElementById("importFileInput") as HTMLInputElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
const deleteBtn = document.getElementById("deleteBtn") as HTMLButtonElement;
const pausePlayBtn = document.getElementById("pausePlayBtn") as HTMLButtonElement;
const playbackInfoEl = document.getElementById("playbackInfo")!;
const playbackStatusEl = document.getElementById("playbackStatus")!;

const jsonArea = document.createElement("textarea") as HTMLTextAreaElement;
jsonArea.id = "jsonArea";
jsonArea.style.width = "100%";
jsonArea.style.height = "200px";
jsonArea.style.display = "none";
jsonArea.style.marginTop = "12px";

let runs: Run[] = [];
let run: Run | null = null;
let currentIndex = 0;
let isPlaying = false;
let playbackInterval: NodeJS.Timeout | null = null;
let currentRunIdx = 0;

init().catch(console.error);

async function init() {
  // Load current run and all past runs
  const currentRun = await getCurrentRun();
  const pastRuns = await getRuns();
  
  // Combine: current run (if exists) + past runs
  runs = [];
  if (currentRun) {
    runs.push(currentRun);
  }
  runs.push(...pastRuns);

  renderRunsList();
  bindNav();
  bindActions();

  const detail = document.querySelector(".detail") as HTMLElement;
  detail.appendChild(jsonArea);

  // Auto-select first run
  if (runs.length > 0) {
    selectRun(0);
  }
}

function renderRunsList() {
  runsListEl.innerHTML = "";
  runs.forEach((r, idx) => {
    const li = document.createElement("li");
    li.className = "run-item";
    li.dataset.index = String(idx);

    const runId = document.createElement("div");
    runId.className = "run-id";
    runId.title = r.runId;
    runId.textContent = r.runId?.slice(0, 8) + "...";

    const runTime = document.createElement("div");
    runTime.className = "run-time";
    runTime.textContent = new Date(r.startedAt).toLocaleDateString() + " " +
                          new Date(r.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const runSteps = document.createElement("div");
    runSteps.className = "run-steps";
    runSteps.textContent = `${r.steps.length} steps`;

    li.append(runId, runTime, runSteps);
    li.addEventListener("click", () => selectRun(idx));
    runsListEl.appendChild(li);
  });
}

function selectRun(idx: number) {
  // Stop playback when switching runs
  if (isPlaying) {
    onPlayPause();
  }

  currentRunIdx = idx;
  run = runs[idx] ?? null;
  currentIndex = 0;

  // Update active state
  const items = runsListEl.querySelectorAll(".run-item");
  items.forEach((el, i) => {
    el.classList.toggle("active", i === idx);
  });

  renderList();
  if (run && run.steps.length > 0) {
    selectIndex(0);
  } else {
    // Clear detail view
    stepTypeEl.textContent = "—";
    stepUrlEl.textContent = "—";
    stepTimeEl.textContent = "—";
    viewportEl.textContent = "—";
    screenshotEl.src = "";
    pointerEl.hidden = true;
    selectorForm.innerHTML = "";
  }
}

function bindNav() {
  prevBtn.addEventListener("click", () => {
    if (!run) return;
    if (isPlaying) onPlayPause();
    selectIndex(Math.max(0, currentIndex - 1));
  });
  nextBtn.addEventListener("click", () => {
    if (!run) return;
    if (isPlaying) onPlayPause();
    selectIndex(Math.min(run.steps.length - 1, currentIndex + 1));
  });
}

function bindActions() {
  exportBtn.addEventListener("click", onExport);
  viewJsonBtn.addEventListener("click", onViewJson);
  importBtn.addEventListener("click", onImportTrigger);
  importFileInput.addEventListener("change", onImportFile);
  saveBtn.addEventListener("click", onSave);
  playBtn.addEventListener("click", onPlayStart);
  pausePlayBtn.addEventListener("click", onPlayPause);
  deleteBtn.addEventListener("click", onDelete);
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

  // Save the updated run
  const runIdx = runs.indexOf(run);
  if (runIdx === 0 && !(await getCurrentRun())?.runId) {
    // First run might be current run
    await setCurrentRun(run);
  } else {
    // Save to past runs
    await setRuns(runs.slice(1)); // Keep all runs except current
  }

  const li = stepListEl.children[currentIndex] as HTMLLIElement | undefined;
  if (li) {
    const mono = li.querySelector(".mono");
    if (mono) mono.textContent = primary;
  }
}

function onViewJson() {
  if (!run) return;
  if (jsonArea.style.display === "none") {
    jsonArea.value = JSON.stringify(run, null, 2);
    jsonArea.style.display = "block";
    viewJsonBtn.textContent = "Hide JSON";
  } else {
    jsonArea.style.display = "none";
    viewJsonBtn.textContent = "View JSON";
  }
}

function onImportTrigger() {
  importFileInput.value = "";
  importFileInput.click();
}

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || !input.files[0]) return;

  try {
    const file = input.files[0];
    const text = await file.text();
    const parsed = JSON.parse(text) as Run;

    if (!parsed || !Array.isArray(parsed.steps)) {
      throw new Error("Invalid run format");
    }

    // Add to runs list
    runs.push(parsed);
    await setRuns(runs.slice(1)); // Save all except potential current run

    renderRunsList();
    selectRun(runs.length - 1);

    jsonArea.value = JSON.stringify(parsed, null, 2);
    jsonArea.style.display = "block";
    viewJsonBtn.textContent = "Hide JSON";
  } catch (error) {
    console.error("Failed to import JSON", error);
    alert("Invalid JSON file. Please select a valid run export.");
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

async function onDelete() {
  if (!run || !run.runId) return;
  
  const confirmed = confirm(`Delete recording "${run.runId.slice(0, 8)}..."?\n\nThis cannot be undone.`);
  if (!confirmed) return;

  // Delete from storage
  await deleteRun(run.runId);

  // Remove from runs array
  const idx = runs.indexOf(run);
  if (idx >= 0) {
    runs.splice(idx, 1);
  }

  // Stop playback if active
  if (isPlaying) {
    onPlayPause();
  }

  // Render updated list and select a different run
  renderRunsList();
  if (runs.length > 0) {
    const newIdx = Math.max(0, idx - 1);
    selectRun(newIdx);
  } else {
    run = null;
    renderList();
    stepTypeEl.textContent = "—";
    stepUrlEl.textContent = "—";
    stepTimeEl.textContent = "—";
    viewportEl.textContent = "—";
    screenshotEl.src = "";
    pointerEl.hidden = true;
    selectorForm.innerHTML = "";
    playbackInfoEl.hidden = true;
  }
}

function onPlayStart() {
  if (!run || run.steps.length === 0) return;
  
  currentIndex = 0;
  isPlaying = true;
  playBtn.disabled = true;
  playbackInfoEl.hidden = false;
  
  selectIndex(0);
  updatePlaybackStatus();
  
  // Auto-advance every 2 seconds
  playbackInterval = setInterval(() => {
    if (currentIndex < run!.steps.length - 1) {
      currentIndex++;
      selectIndex(currentIndex);
      updatePlaybackStatus();
    } else {
      // End of playback
      onPlayPause();
    }
  }, 2000);
}

function onPlayPause() {
  isPlaying = false;
  playBtn.disabled = false;
  playbackInfoEl.hidden = true;
  
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
}

function updatePlaybackStatus() {
  if (!run) return;
  const total = run.steps.length;
  const current = currentIndex + 1;
  playbackStatusEl.textContent = `Playing: ${current}/${total}`;
}

export {};