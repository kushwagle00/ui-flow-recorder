"use strict";
(() => {
  // src/shared/storage.ts
  var CURRENT_RUN_KEY = "currentRun";
  var RUNS_KEY = "runs";
  async function getCurrentRun() {
    const obj = await chrome.storage.local.get([CURRENT_RUN_KEY]);
    return obj[CURRENT_RUN_KEY] ?? null;
  }
  async function getRuns() {
    const obj = await chrome.storage.local.get([RUNS_KEY]);
    return obj[RUNS_KEY] ?? [];
  }

  // src/shared/presentation.ts
  function actionLabel(step) {
    if (step.type === "navigation") {
      try {
        const url = new URL(step.url);
        return `Navigate to ${url.pathname === "/" ? url.hostname : url.pathname}`;
      } catch {
        return "Navigate to page";
      }
    }
    const a = step.element?.attributes;
    const target = step.element?.text?.trim().slice(0, 70) || a?.["aria-label"] || a?.name || a?.id || a?.["data-testid"] || step.element?.tag || "element";
    if (step.type === "input") return `Set ${target}`;
    return `Click ${target}`;
  }
  function sessionTitle(run2) {
    return run2.title || `QA session \xB7 ${new Date(run2.startedAt).toLocaleString()}`;
  }
  function qaReport(run2) {
    const lines = [
      `# ${sessionTitle(run2)}`,
      "",
      `Recorded: ${new Date(run2.startedAt).toISOString()}`,
      `Steps: ${run2.steps.length}`,
      "",
      "## Steps to reproduce",
      ""
    ];
    run2.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${actionLabel(step)}`, `   URL: ${step.url}`);
      if (step.value !== void 0) lines.push(`   Input: ${step.value}`);
      lines.push(`   Result: ${step.review?.result ?? "not-reviewed"}`);
      if (step.review?.expected)
        lines.push(`   Expected: ${step.review.expected}`);
      if (step.review?.actual)
        lines.push(`   Actual / notes: ${step.review.actual}`);
      lines.push("");
    });
    lines.push(
      "Screenshots are included in the separate JSON export; this report contains text only."
    );
    return lines.join("\n");
  }

  // src/shared/validation.ts
  function validateRun(value) {
    const r = value;
    if (!r || typeof r.runId !== "string" || !r.runId || !Number.isFinite(r.startedAt) || !Array.isArray(r.steps) || r.steps.length > 1e4)
      throw new Error("Invalid recording");
    if (r.title !== void 0 && (typeof r.title !== "string" || r.title.length > 120))
      throw new Error("Invalid session name");
    if (r.stoppedAt !== void 0 && !Number.isFinite(r.stoppedAt))
      throw new Error("Invalid stop time");
    const ids = /* @__PURE__ */ new Set();
    for (const s of r.steps) {
      if (!s || !Number.isFinite(s.stepId) || ids.has(s.stepId) || !Number.isFinite(s.timestamp) || !["click", "input", "navigation"].includes(s.type) || typeof s.url !== "string")
        throw new Error("Invalid step");
      ids.add(s.stepId);
      if (s.value !== void 0 && typeof s.value !== "string")
        throw new Error("Invalid input value");
      if (s.element && (typeof s.element.tag !== "string" || s.element.text !== void 0 && typeof s.element.text !== "string" || !s.element.attributes || typeof s.element.attributes !== "object" || Object.values(s.element.attributes).some(
        (v) => v !== void 0 && typeof v !== "string"
      )))
        throw new Error("Invalid element");
      if (s.review && (!["not-reviewed", "pass", "fail", "blocked"].includes(s.review.result) || typeof s.review.expected !== "string" || typeof s.review.actual !== "string" || s.review.expected.length > 1e4 || s.review.actual.length > 1e4))
        throw new Error("Invalid QA review");
      if (s.selectors && (typeof s.selectors.primary !== "string" || !Array.isArray(s.selectors.alternatives) || s.selectors.alternatives.some((v) => typeof v !== "string")))
        throw new Error("Invalid selectors");
      const image = s.visualContext?.screenshotDataUrl;
      if (image && (typeof image !== "string" || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image)))
        throw new Error("Invalid screenshot");
      const viewport = s.visualContext?.viewport;
      if (viewport && ![viewport.width, viewport.height].every(
        (v) => Number.isFinite(v) && v > 0
      ))
        throw new Error("Invalid viewport");
    }
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
  var importFileInput = document.getElementById(
    "importFileInput"
  );
  var saveBtn = document.getElementById("saveBtn");
  var playBtn = document.getElementById("playBtn");
  var deleteBtn = document.getElementById("deleteBtn");
  var pausePlayBtn = document.getElementById(
    "pausePlayBtn"
  );
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
  var reviewDirty = false;
  var reviewSaving = false;
  var sessionTitleInput = document.getElementById(
    "sessionTitle"
  );
  var qaResult = document.getElementById("qaResult");
  var expected = document.getElementById("expected");
  var actual = document.getElementById("actual");
  var saveReviewBtn = document.getElementById(
    "saveReviewBtn"
  );
  var reportBtn = document.getElementById("reportBtn");
  var saveStatus = document.getElementById("saveStatus");
  function mayLeave() {
    if (reviewSaving) return false;
    return !reviewDirty || confirm("Discard unsaved QA review changes?");
  }
  function updateSummary() {
    document.getElementById("sessionSummary").textContent = run ? `${run.steps.length} steps \xB7 ${run.steps.filter((s) => s.review?.result === "pass").length} passed \xB7 ${run.steps.filter((s) => s.review?.result === "fail").length} failed \xB7 ${run.steps.filter((s) => s.review?.result === "blocked").length} blocked \xB7 ${run.steps.filter((s) => !s.review || s.review.result === "not-reviewed").length} not reviewed` : "No session selected. Start recording from your test page or import a session.";
  }
  async function mutate(msg) {
    const result = await chrome.runtime.sendMessage(msg);
    if (!result || result.kind === "ERROR")
      throw new Error(result?.message ?? "Recorder unavailable");
  }
  function report(error) {
    alert(error.message ?? String(error));
  }
  init().catch(report);
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
    importBtn.disabled = false;
    const detail = document.querySelector(".detail");
    detail.appendChild(jsonArea);
    const requested = new URLSearchParams(location.search).get("run");
    selectRun(
      Math.max(
        0,
        runs.findIndex((r) => r.runId === requested)
      )
    );
  }
  function renderRunsList() {
    runsListEl.innerHTML = "";
    if (!runs.length) {
      const empty = document.createElement("li");
      empty.textContent = "No recordings yet. Start from the extension popup, or import a JSON recording.";
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
      runTime.textContent = new Date(r.startedAt).toLocaleDateString() + " " + new Date(r.startedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
      const runSteps = document.createElement("div");
      runSteps.className = "run-steps";
      runSteps.textContent = `${r.steps.length} steps \xB7 ${r.stoppedAt ? "Saved" : r.paused ? "Paused" : "Recording"}`;
      li.append(runId, runTime, runSteps);
      li.addEventListener("click", () => selectRun(idx));
      runsListEl.appendChild(li);
    });
  }
  function selectRun(idx) {
    if (!mayLeave()) return;
    reviewDirty = false;
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
    document.getElementById("liveHint").hidden = !run || !!run.stoppedAt;
    updateSummary();
    reportBtn.disabled = !run;
    saveReviewBtn.disabled = qaResult.disabled = expected.disabled = actual.disabled = !run?.stoppedAt || !run?.steps.length;
    expected.value = actual.value = "";
    qaResult.value = "not-reviewed";
    saveStatus.textContent = "Changes stay local until you export.";
    document.getElementById("stepAction").textContent = "Select a step to review";
    document.getElementById("stepPosition").textContent = "";
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
      stepTypeEl.textContent = "\u2014";
      stepUrlEl.textContent = "\u2014";
      stepTimeEl.textContent = "\u2014";
      viewportEl.textContent = "\u2014";
      screenshotEl.removeAttribute("src");
      screenshotEl.hidden = true;
      document.getElementById("imagePlaceholder").hidden = false;
      document.getElementById("imagePlaceholder").textContent = "Select a recorded step to inspect it.";
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
      const prim = s.review?.result ? s.review.result.replace("-", " ") : "Not reviewed";
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
  function selectIndex(i) {
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
    document.getElementById("stepAction").textContent = actionLabel(step);
    document.getElementById("stepPosition").textContent = `STEP ${currentIndex + 1} OF ${run.steps.length}`;
    document.getElementById("stepValue").textContent = step.value ?? "No input value";
    qaResult.value = step.review?.result ?? "not-reviewed";
    expected.value = step.review?.expected ?? "";
    actual.value = step.review?.actual ?? "";
    saveStatus.textContent = run.stoppedAt ? "Changes stay local until you export." : "Stop recording to review this step.";
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
    pointerEl.hidden = true;
    screenshotEl.onload = () => drawPointer(step);
    screenshotEl.hidden = !dataUrl;
    document.getElementById("imagePlaceholder").hidden = !!dataUrl;
    document.getElementById("imagePlaceholder").textContent = "No screenshot for this step. Event details are available below.";
    if (dataUrl) screenshotEl.src = dataUrl;
    else screenshotEl.removeAttribute("src");
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
    const sx = renderedWidth / (step.visualContext?.viewport?.width || img.naturalWidth);
    const sy = renderedHeight / (step.visualContext?.viewport?.height || img.naturalHeight);
    const x = img.offsetLeft + pointer.x * sx;
    const y = img.offsetTop + pointer.y * sy;
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
      const row = document.createElement("label");
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
    const primary = selectorForm.querySelector(
      "input[name='primary']:checked"
    )?.value;
    if (!primary) return;
    const current = step.selectors ?? { primary, alternatives: [] };
    const existing = /* @__PURE__ */ new Set([
      ...current.alternatives ?? [],
      current.primary
    ]);
    existing.delete(primary);
    const alternatives = Array.from(existing);
    step.selectors = { primary, alternatives };
    await mutate({
      kind: "SAVE_RUN",
      runId: run.runId,
      stepId: step.stepId,
      primary
    });
    const li = stepListEl.children[currentIndex];
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
  async function onImportFile(event) {
    const input = event.target;
    if (!input.files || !input.files[0]) return;
    try {
      const file = input.files[0];
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Import is limited to 20 MB");
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Import is limited to 20 MB");
      validateRun(parsed);
      await mutate({ kind: "IMPORT_RUN", run: parsed });
      const active = await getCurrentRun();
      runs = [...active ? [active] : [], ...await getRuns()];
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
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ui-flow-${run.runId ?? "run"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async function onDelete() {
    if (!mayLeave()) return;
    reviewDirty = false;
    if (!run || !run.runId) return;
    const confirmed = confirm(
      `Delete recording "${run.runId.slice(0, 8)}..."?

This cannot be undone.`
    );
    if (!confirmed) return;
    await mutate({ kind: "DELETE_RUN", runId: run.runId });
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
      selectRun(0);
      renderList();
      stepTypeEl.textContent = "\u2014";
      stepUrlEl.textContent = "\u2014";
      stepTimeEl.textContent = "\u2014";
      viewportEl.textContent = "\u2014";
      screenshotEl.removeAttribute("src");
      screenshotEl.hidden = true;
      document.getElementById("imagePlaceholder").hidden = false;
      document.getElementById("imagePlaceholder").textContent = "Select a recorded step to inspect it.";
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
  document.getElementById("qaForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!run?.stoppedAt || !run.steps[currentIndex]) return;
    const selectedRun = run;
    const step = run.steps[currentIndex];
    const title = sessionTitleInput.value;
    const review = {
      result: qaResult.value,
      expected: expected.value,
      actual: actual.value
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
        review
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
      saveStatus.textContent = error.message;
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
      new Blob([qaReport(run)], { type: "text/markdown" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-report-${run.runId}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  });
  document.getElementById("refreshBtn").addEventListener("click", async () => {
    if (!mayLeave()) return;
    reviewDirty = false;
    const selected = run?.runId;
    const active = await getCurrentRun();
    runs = [...active ? [active] : [], ...await getRuns()];
    renderRunsList();
    selectRun(
      Math.max(
        0,
        runs.findIndex((r) => r.runId === selected)
      )
    );
  });
})();
//# sourceMappingURL=viewer.js.map
