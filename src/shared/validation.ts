import type { Run } from "./types";
export function validateRun(value: unknown): asserts value is Run {
  const r = value as Run;
  if (!r || typeof r.runId !== "string" || !r.runId || !Number.isFinite(r.startedAt) || !Array.isArray(r.steps) || r.steps.length > 10000) throw new Error("Invalid recording");
  const ids = new Set<number>();
  for (const s of r.steps) {
    if (!s || !Number.isFinite(s.stepId) || ids.has(s.stepId) || !Number.isFinite(s.timestamp) || !["click", "input", "navigation"].includes(s.type) || typeof s.url !== "string") throw new Error("Invalid step");
    ids.add(s.stepId);
    if (s.selectors && (typeof s.selectors.primary !== "string" || !Array.isArray(s.selectors.alternatives) || s.selectors.alternatives.some(v => typeof v !== "string"))) throw new Error("Invalid selectors");
    const image = s.visualContext?.screenshotDataUrl;
    if (image && (typeof image !== "string" || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image))) throw new Error("Invalid screenshot");
    const viewport = s.visualContext?.viewport;
    if (viewport && (![viewport.width, viewport.height].every(v => Number.isFinite(v) && v > 0))) throw new Error("Invalid viewport");
  }
}
