import type { Run } from "./types";
export function validateRun(value: unknown): asserts value is Run {
  const r = value as Run;
  if (
    !r ||
    typeof r.runId !== "string" ||
    !r.runId ||
    !Number.isFinite(r.startedAt) ||
    !Array.isArray(r.steps) ||
    r.steps.length > 10000
  )
    throw new Error("Invalid recording");
  if (
    r.title !== undefined &&
    (typeof r.title !== "string" || r.title.length > 120)
  )
    throw new Error("Invalid session name");
  if (r.stoppedAt !== undefined && !Number.isFinite(r.stoppedAt))
    throw new Error("Invalid stop time");
  const ids = new Set<number>();
  for (const s of r.steps) {
    if (
      !s ||
      !Number.isFinite(s.stepId) ||
      ids.has(s.stepId) ||
      !Number.isFinite(s.timestamp) ||
      !["click", "input", "navigation"].includes(s.type) ||
      typeof s.url !== "string"
    )
      throw new Error("Invalid step");
    ids.add(s.stepId);
    if (s.value !== undefined && typeof s.value !== "string")
      throw new Error("Invalid input value");
    if (
      s.element &&
      (typeof s.element.tag !== "string" ||
        (s.element.text !== undefined && typeof s.element.text !== "string") ||
        !s.element.attributes ||
        typeof s.element.attributes !== "object" ||
        Object.values(s.element.attributes).some(
          (v) => v !== undefined && typeof v !== "string",
        ))
    )
      throw new Error("Invalid element");
    if (
      s.review &&
      (!["not-reviewed", "pass", "fail", "blocked"].includes(s.review.result) ||
        typeof s.review.expected !== "string" ||
        typeof s.review.actual !== "string" ||
        s.review.expected.length > 10000 ||
        s.review.actual.length > 10000)
    )
      throw new Error("Invalid QA review");
    if (
      s.selectors &&
      (typeof s.selectors.primary !== "string" ||
        !Array.isArray(s.selectors.alternatives) ||
        s.selectors.alternatives.some((v) => typeof v !== "string"))
    )
      throw new Error("Invalid selectors");
    const image = s.visualContext?.screenshotDataUrl;
    if (
      image &&
      (typeof image !== "string" ||
        !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image))
    )
      throw new Error("Invalid screenshot");
    const viewport = s.visualContext?.viewport;
    if (
      viewport &&
      ![viewport.width, viewport.height].every(
        (v) => Number.isFinite(v) && v > 0,
      )
    )
      throw new Error("Invalid viewport");
  }
}
