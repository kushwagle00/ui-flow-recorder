import type { Run, Step } from "@shared/types";
import { getCurrentRun, getRuns } from "@shared/storage";

import { actionLabel, sessionTitle, qaReport } from "@shared/presentation";
import { validateRun } from "@shared/validation";

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
const importFileInput = document.getElementById(
  "importFileInput",
) as HTMLInputElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
const deleteBtn = document.getElementById("deleteBtn") as HTMLButtonElement;
const pausePlayBtn = document.getElementById(
  "pausePlayBtn",
) as HTMLButtonElement;
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
let playbackInterval: ReturnType<typeof setInterval> | null = null;
let currentRunIdx = 0;
let reviewDirty = false;
let reviewSaving = false;
const sessionTitleInput = document.getElementById(
  "sessionTitle",
) as HTMLInputElement;
const qaResult = document.getElementById("qaResult") as HTMLSelectElement;
const expected = document.getElementById("expected") as HTMLTextAreaElement;
const actual = document.getElementById("actual") as HTMLTextAreaElement;
const saveReviewBtn = document.getElementById(
  "saveReviewBtn",
) as HTMLButtonElement;
const reportBtn = document.getElementById("reportBtn") as HTMLButtonElement;
const saveStatus = document.getElementById("saveStatus")!;
function mayLeave() {
  if (reviewSaving) return false;
  return !reviewDirty || confirm("Discard unsaved QA review changes?");
}
function updateSummary() {
  document.getElementById("sessionSummary")!.textContent = run
    ? `${run.steps.length} steps · ${run.steps.filter((s) => s.review?.result === "pass").length} passed · ${run.steps.filter((s) => s.review?.result === "fail").length} failed · ${run.steps.filter((s) => s.review?.result === "blocked").length} blocked · ${run.steps.filter((s) => !s.review || s.review.result === "not-reviewed").length} not reviewed`
    : "No session selected. Start recording from your test page or import a session.";
}

async function mutate(msg: object) {
  const result = await chrome.runtime.sendMessage(msg);
  if (!result || result.kind === "ERROR")
    throw new Error(result?.message ?? "Recorder unavailable");
}
function report(error: unknown) {
  alert((error as Error).message ?? String(error));
}
init().catch(report);

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
  importBtn.disabled = false;

  const detail = document.querySelector(".detail") as HTMLElement;
  detail.appendChild(jsonArea);

  // Auto-select first run
  const requested = new URLSearchParams(location.search).get("run");
  selectRun(
    Math.max(
      0,
      runs.findIndex((r) => r.runId === requested),
    ),
  );
}

function renderRunsList() {
  runsListEl.innerHTML = "";
  if (!runs.length) {
    const empty = document.createElement("li");
    empty.textContent =
      "No recordings yet. Start from the extension popup, or import a JSON recording.";
    empty.style.padding = "16px";
    runsListEl.appendChild(empty);
  }
  runs.forEach((r, idx) => {
    const li = document.createElement("li");
    li.className = "run-item";
    li.classList.toggle("active", r.runId === run?.runId);
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectRun(idx);
      }
    });
    li.dataset.index = String(idx);

    const runId = document.createElement("div");
    runId.className = "run-id";
    runId.title = r.runId;
    runId.textContent = sessionTitle(r);

    const runTime = document.createElement("div");
    runTime.className = "run-time";
    runTime.textContent =
      new Date(r.startedAt).toLocaleDateString() +
      " " +
      new Date(r.startedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    const runSteps = document.createElement("div");
    runSteps.className = "run-steps";
    runSteps.textContent = `${r.steps.length} steps · ${r.stoppedAt ? "Saved" : r.paused ? "Paused" : "Recording"}`;

    li.append(runId, runTime, runSteps);
    li.addEventListener("click", () => selectRun(idx));
    runsListEl.appendChild(li);
  });
}

function selectRun(idx: number) {
  if (!mayLeave()) return;
  reviewDirty = false;
  // Stop playback when switching runs
  if (isPlaying) {
    onPlayPause();
  }

  jsonArea.style.display = "none";
  viewJsonBtn.textContent = "View JSON";
  currentRunIdx = idx;
  run = runs[idx] ?? null;
  currentIndex = 0;
  sessionTitleInput.value = run ? sessionTitle(run) : "";
  sessionTitleInput.disabled = !run?.stoppedAt;
  document.getElementById("liveHint")!.hidden = !run || !!run.stoppedAt;
  updateSummary();
  reportBtn.disabled = !run;
  saveReviewBtn.disabled =
    qaResult.disabled =
    expected.disabled =
    actual.disabled =
      !run?.stoppedAt || !run?.steps.length;
  expected.value = actual.value = "";
  qaResult.value = "not-reviewed";
  saveStatus.textContent = "Changes stay local until you export.";
  document.getElementById("stepAction")!.textContent =
    "Select a step to review";
  document.getElementById("stepPosition")!.textContent = "";

  // Update active state
  const items = runsListEl.querySelectorAll(".run-item");
  items.forEach((el, i) => {
    el.classList.toggle("active", i === idx);
  });

  renderList();
  const hasSteps = !!run?.steps.length;
  playBtn.disabled = !hasSteps;
  exportBtn.disabled = viewJsonBtn.disabled = !run;
  saveBtn.disabled = deleteBtn.disabled = !run || !run.stoppedAt;
  prevBtn.disabled = nextBtn.disabled = !hasSteps;
  if (run && run.steps.length > 0) {
    selectIndex(0);
  } else {
    // Clear detail view
    stepTypeEl.textContent = "—";
    stepUrlEl.textContent = "—";
    stepTimeEl.textContent = "—";
    viewportEl.textContent = "—";
    screenshotEl.removeAttribute("src");
    screenshotEl.hidden = true;
    document.getElementById("imagePlaceholder")!.hidden = false;
    document.getElementById("imagePlaceholder")!.textContent =
      "Select a recorded step to inspect it.";
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
  saveBtn.addEventListener("click", () => onSave().catch(report));
  playBtn.addEventListener("click", onPlayStart);
  pausePlayBtn.addEventListener("click", onPlayPause);
  deleteBtn.addEventListener("click", () => onDelete().catch(report));
}

function renderList() {
  stepListEl.innerHTML = "";
  const steps = run?.steps ?? [];
  countEl.textContent = String(steps.length);

  steps.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "step-item";
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPlayPause();
        selectIndex(i);
      }
    });
    li.dataset.index = String(i);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${i + 1}. ${actionLabel(s)}`;

    const primary = document.createElement("div");
    primary.className = "mono";
    const prim = s.review?.result
      ? s.review.result.replace("-", " ")
      : "Not reviewed";
    primary.classList.add(`result-${s.review?.result ?? "not-reviewed"}`);
    primary.textContent = prim;

    const ts = document.createElement("div");
    ts.className = "mono";
    ts.textContent = new Date(s.timestamp).toLocaleTimeString();

    li.append(title, primary, ts);
    li.addEventListener("click", () => {
      onPlayPause();
      selectIndex(i);
    });
    stepListEl.appendChild(li);
  });
}

function selectIndex(i: number) {
  if (!mayLeave()) {
    onPlayPause();
    return;
  }
  reviewDirty = false;
  sessionTitleInput.value = run ? sessionTitle(run) : "";
  currentIndex = i;
  prevBtn.disabled = i <= 0;
  nextBtn.disabled = !run || i >= run.steps.length - 1;
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

  document.getElementById("stepAction")!.textContent = actionLabel(step);
  document.getElementById("stepPosition")!.textContent =
    `STEP ${currentIndex + 1} OF ${run.steps.length}`;
  document.getElementById("stepValue")!.textContent =
    step.value ?? "No input value";
  qaResult.value = step.review?.result ?? "not-reviewed";
  expected.value = step.review?.expected ?? "";
  actual.value = step.review?.actual ?? "";
  saveStatus.textContent = run.stoppedAt
    ? "Changes stay local until you export."
    : "Stop recording to review this step.";
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
  pointerEl.hidden = true;
  screenshotEl.onload = () => drawPointer(step);
  screenshotEl.hidden = !dataUrl;
  document.getElementById("imagePlaceholder")!.hidden = !!dataUrl;
  document.getElementById("imagePlaceholder")!.textContent =
    "No screenshot for this step. Event details are available below.";
  if (dataUrl) screenshotEl.src = dataUrl;
  else screenshotEl.removeAttribute("src");

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
  const sx =
    renderedWidth / (step.visualContext?.viewport?.width || img.naturalWidth);
  const sy =
    renderedHeight /
    (step.visualContext?.viewport?.height || img.naturalHeight);

  // Our coordinates are in viewport pixels (clientX/clientY) during recording.
  // We assume screenshot captured the visible viewport at those dims.
  const x = img.offsetLeft + pointer.x * sx;
  const y = img.offsetTop + pointer.y * sy;

  pointerEl.style.left = `${x}px`;
  pointerEl.style.top = `${y}px`;
  pointerEl.hidden = false;
}

function renderSelectors(step: Step) {
  selectorForm.innerHTML = "";
  const sel = step.selectors;

  const all = [
    ...(sel?.primary ? [sel.primary] : []),
    ...(sel?.alternatives ?? []),
  ];

  if (all.length === 0) {
    const p = document.createElement("p");
    p.textContent = "(No selectors recorded for this step)";
    selectorForm.appendChild(p);
    return;
  }

  all.forEach((value, idx) => {
    const row = document.createElement("label");
    row.className = "selector-row";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "primary";
    input.value = value;
    input.checked =
      (idx === 0 && sel?.primary === value) || sel?.primary === value;

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

  const primary = (
    selectorForm.querySelector(
      "input[name='primary']:checked",
    ) as HTMLInputElement | null
  )?.value;
  if (!primary) return;

  // Rebuild selectors: set primary, move others to alternatives (dedupe)
  const current = step.selectors ?? { primary: primary, alternatives: [] };
  const existing = new Set<string>([
    ...(current.alternatives ?? []),
    current.primary,
  ]);
  existing.delete(primary);
  const alternatives = Array.from(existing);

  step.selectors = { primary, alternatives };

  await mutate({
    kind: "SAVE_RUN",
    runId: run.runId,
    stepId: step.stepId,
    primary,
  });

  const li = stepListEl.children[currentIndex] as HTMLLIElement | undefined;
  if (li) {
    const mono = li.querySelector(".mono");
    if (mono) saveStatus.textContent = "Selector saved.";
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
  if (!mayLeave()) return;
  reviewDirty = false;
  importFileInput.value = "";
  importFileInput.click();
}

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || !input.files[0]) return;

  try {
    const file = input.files[0];
    if (file.size > 20 * 1024 * 1024)
      throw new Error("Import is limited to 20 MB");
    const text = await file.text();
    const parsed = JSON.parse(text) as Run;

    if (file.size > 20 * 1024 * 1024)
      throw new Error("Import is limited to 20 MB");
    validateRun(parsed);
    await mutate({ kind: "IMPORT_RUN", run: parsed });
    const active = await getCurrentRun();
    runs = [...(active ? [active] : []), ...(await getRuns())];

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
  const blob = new Blob([JSON.stringify(run, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ui-flow-${run.runId ?? "run"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function onDelete() {
  if (!mayLeave()) return;
  reviewDirty = false;
  if (!run || !run.runId) return;

  const confirmed = confirm(
    `Delete recording "${run.runId.slice(0, 8)}..."?\n\nThis cannot be undone.`,
  );
  if (!confirmed) return;

  // Delete from storage
  await mutate({ kind: "DELETE_RUN", runId: run.runId });

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
    selectRun(0);
    renderList();
    stepTypeEl.textContent = "—";
    stepUrlEl.textContent = "—";
    stepTimeEl.textContent = "—";
    viewportEl.textContent = "—";
    screenshotEl.removeAttribute("src");
    screenshotEl.hidden = true;
    document.getElementById("imagePlaceholder")!.hidden = false;
    document.getElementById("imagePlaceholder")!.textContent =
      "Select a recorded step to inspect it.";
    pointerEl.hidden = true;
    selectorForm.innerHTML = "";
    playbackInfoEl.hidden = true;
  }
}

function onPlayStart() {
  if (!mayLeave()) return;
  reviewDirty = false;
  if (!run || run.steps.length === 0) return;

  if (isPlaying) return;
  if (currentIndex >= run.steps.length - 1) currentIndex = 0;
  isPlaying = true;
  playBtn.disabled = true;
  playbackInfoEl.hidden = false;

  selectIndex(currentIndex);
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
  playBtn.disabled = !run?.steps.length;
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
window.addEventListener("resize", () => {
  if (run?.steps[currentIndex]) drawPointer(run.steps[currentIndex]);
});

for (const input of [sessionTitleInput, qaResult, expected, actual])
  input.addEventListener("input", () => {
    onPlayPause();
    reviewDirty = true;
    saveStatus.textContent = "Unsaved changes - save before switching steps.";
  });
window.addEventListener("beforeunload", (e) => {
  if (reviewDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.getElementById("qaForm")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!run?.stoppedAt || !run.steps[currentIndex]) return;
  const selectedRun = run;
  const step = run.steps[currentIndex];
  const title = sessionTitleInput.value;
  const review = {
    result: qaResult.value as "not-reviewed" | "pass" | "fail" | "blocked",
    expected: expected.value,
    actual: actual.value,
  };
  reviewSaving = true;
  saveReviewBtn.disabled = true;
  for (const field of [sessionTitleInput, qaResult, expected, actual])
    field.disabled = true;
  try {
    await mutate({
      kind: "SAVE_QA",
      runId: selectedRun.runId,
      stepId: step.stepId,
      title,
      review,
    });
    selectedRun.title = title;
    step.review = review;
    reviewSaving = false;
    reviewDirty = false;
    renderRunsList();
    renderList();
    selectIndex(currentIndex);
    updateSummary();
    saveStatus.textContent = "Review saved. Included in your QA report.";
  } catch (error) {
    saveStatus.textContent = (error as Error).message;
  } finally {
    reviewSaving = false;
    saveReviewBtn.disabled = false;
    for (const field of [sessionTitleInput, qaResult, expected, actual])
      field.disabled = !run?.stoppedAt;
  }
});
reportBtn.addEventListener("click", () => {
  if (!run) return;
  if (reviewDirty) {
    saveStatus.textContent = "Save your review before downloading the report.";
    return;
  }
  const url = URL.createObjectURL(
    new Blob([qaReport(run)], { type: "text/markdown" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `qa-report-${run.runId}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.getElementById("refreshBtn")!.addEventListener("click", async () => {
  if (!mayLeave()) return;
  reviewDirty = false;
  const selected = run?.runId;
  const active = await getCurrentRun();
  runs = [...(active ? [active] : []), ...(await getRuns())];
  renderRunsList();
  selectRun(
    Math.max(
      0,
      runs.findIndex((r) => r.runId === selected),
    ),
  );
});
