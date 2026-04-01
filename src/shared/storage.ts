// src/shared/storage.ts
import type { Run, Step } from "./types";

const CURRENT_RUN_KEY = "currentRun";
const RUNS_KEY = "runs";
const RECORDING_FLAG_KEY = "isRecording";

// ---------- Recording flag ----------
export async function getRecordingFlag(): Promise<boolean> {
  const { [RECORDING_FLAG_KEY]: flag } = await chrome.storage.local.get([RECORDING_FLAG_KEY]);
  return Boolean(flag);
}
export async function setRecordingFlag(flag: boolean): Promise<void> {
  await chrome.storage.local.set({ [RECORDING_FLAG_KEY]: flag });
}

// ---------- Runs management ----------
export async function getCurrentRun(): Promise<Run | null> {
  const obj = await chrome.storage.local.get([CURRENT_RUN_KEY]);
  return obj[CURRENT_RUN_KEY] ?? null;
}

export async function setCurrentRun(run: Run | null): Promise<void> {
  if (run) {
    await chrome.storage.local.set({ [CURRENT_RUN_KEY]: run });
  } else {
    await chrome.storage.local.remove([CURRENT_RUN_KEY]);
  }
}

export async function getRuns(): Promise<Run[]> {
  const obj = await chrome.storage.local.get([RUNS_KEY]);
  return obj[RUNS_KEY] ?? [];
}

export async function setRuns(runs: Run[]): Promise<void> {
  await chrome.storage.local.set({ [RUNS_KEY]: runs });
}

export async function deleteRun(runIdToDelete: string): Promise<void> {
  const runs = await getRuns();
  const filtered = runs.filter(r => r.runId !== runIdToDelete);
  await setRuns(filtered);
}

// Always create a fresh run (new runId, empty steps)
export async function startNewRun(): Promise<Run> {
  const run: Run = {
    runId: crypto.randomUUID(),
    startedAt: Date.now(),
    steps: []
  };
  await setCurrentRun(run);
  return run;
}

export async function pushStep(step: Step) {
  const run = await getCurrentRun();
  if (!run) return; // ignore if no active run (e.g., SW restarted and not recording)
  run.steps.push(step);
  await setCurrentRun(run);
}

// Move currentRun into the runs history and keep it in currentRun (optional) or clear
export async function finalizeRun(): Promise<Run | null> {
  const run = await getCurrentRun();
  if (!run) return null;

  run.stoppedAt = Date.now();

  const runs = await getRuns();
  runs.push(run);
  await setRuns(runs);

  // Clear current run so the next Start creates a new runId
  await setCurrentRun(null);

  return run;
}