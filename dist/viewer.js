"use strict";
(() => {
  // src/shared/storage.ts
  var CURRENT_RUN_KEY = "currentRun";
  var RUNS_KEY = "runs";
  async function getCurrentRun() {
    const obj = await chrome.storage.local.get([CURRENT_RUN_KEY]);
    return obj[CURRENT_RUN_KEY] ?? null;
  }
  async function setCurrentRun(run2) {
    if (run2) {
      await chrome.storage.local.set({ [CURRENT_RUN_KEY]: run2 });
    } else {
      await chrome.storage.local.remove([CURRENT_RUN_KEY]);
    }
  }
  async function getRuns() {
    const obj = await chrome.storage.local.get([RUNS_KEY]);
    return obj[RUNS_KEY] ?? [];
  }
  async function setRuns(runs2) {
    await chrome.storage.local.set({ [RUNS_KEY]: runs2 });
  }
  async function deleteRun(runIdToDelete) {
    const runs2 = await getRuns();
    const filtered = runs2.filter((r) => r.runId !== runIdToDelete);
    await setRuns(filtered);
  }

  // src/viewer/viewer.ts
  var runsListEl = document.getElementById("runsList");
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
  var viewJsonBtn = document.getElementById("viewJsonBtn");
  var importBtn = document.getElementById("importBtn");
  var importFileInput = document.getElementById("importFileInput");
  var saveBtn = document.getElementById("saveBtn");
  var playBtn = document.getElementById("playBtn");
  var deleteBtn = document.getElementById("deleteBtn");
  var pausePlayBtn = document.getElementById("pausePlayBtn");
  var playbackInfoEl = document.getElementById("playbackInfo");
  var playbackStatusEl = document.getElementById("playbackStatus");
  var jsonArea = document.createElement("textarea");
  jsonArea.id = "jsonArea";
  jsonArea.style.width = "100%";
  jsonArea.style.height = "200px";
  jsonArea.style.display = "none";
  jsonArea.style.marginTop = "12px";
  var runs = [];
  var run = null;
  var currentIndex = 0;
  var isPlaying = false;
  var playbackInterval = null;
  var currentRunIdx = 0;
  init().catch(console.error);
  async function init() {
    const currentRun = await getCurrentRun();
    const pastRuns = await getRuns();
    runs = [];
    if (currentRun) {
      runs.push(currentRun);
    }
    runs.push(...pastRuns);
    renderRunsList();
    bindNav();
    bindActions();
    const detail = document.querySelector(".detail");
    detail.appendChild(jsonArea);
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
      runTime.textContent = new Date(r.startedAt).toLocaleDateString() + " " + new Date(r.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const runSteps = document.createElement("div");
      runSteps.className = "run-steps";
      runSteps.textContent = `${r.steps.length} steps`;
      li.append(runId, runTime, runSteps);
      li.addEventListener("click", () => selectRun(idx));
      runsListEl.appendChild(li);
    });
  }
  function selectRun(idx) {
    if (isPlaying) {
      onPlayPause();
    }
    currentRunIdx = idx;
    run = runs[idx] ?? null;
    currentIndex = 0;
    const items = runsListEl.querySelectorAll(".run-item");
    items.forEach((el, i) => {
      el.classList.toggle("active", i === idx);
    });
    renderList();
    if (run && run.steps.length > 0) {
      selectIndex(0);
    } else {
      stepTypeEl.textContent = "\u2014";
      stepUrlEl.textContent = "\u2014";
      stepTimeEl.textContent = "\u2014";
      viewportEl.textContent = "\u2014";
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
    const runIdx = runs.indexOf(run);
    if (runIdx === 0 && !(await getCurrentRun())?.runId) {
      await setCurrentRun(run);
    } else {
      await setRuns(runs.slice(1));
    }
    const li = stepListEl.children[currentIndex];
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
  async function onImportFile(event) {
    const input = event.target;
    if (!input.files || !input.files[0]) return;
    try {
      const file = input.files[0];
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.steps)) {
        throw new Error("Invalid run format");
      }
      runs.push(parsed);
      await setRuns(runs.slice(1));
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
    const confirmed = confirm(`Delete recording "${run.runId.slice(0, 8)}..."?

This cannot be undone.`);
    if (!confirmed) return;
    await deleteRun(run.runId);
    const idx = runs.indexOf(run);
    if (idx >= 0) {
      runs.splice(idx, 1);
    }
    if (isPlaying) {
      onPlayPause();
    }
    renderRunsList();
    if (runs.length > 0) {
      const newIdx = Math.max(0, idx - 1);
      selectRun(newIdx);
    } else {
      run = null;
      renderList();
      stepTypeEl.textContent = "\u2014";
      stepUrlEl.textContent = "\u2014";
      stepTimeEl.textContent = "\u2014";
      viewportEl.textContent = "\u2014";
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
    playbackInterval = setInterval(() => {
      if (currentIndex < run.steps.length - 1) {
        currentIndex++;
        selectIndex(currentIndex);
        updatePlaybackStatus();
      } else {
        onPlayPause();
      }
    }, 2e3);
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
})();
//# sourceMappingURL=viewer.js.map
