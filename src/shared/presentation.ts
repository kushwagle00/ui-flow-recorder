import type { Run, Step } from "./types";
export function actionLabel(step: Step): string {
  if (step.type === "navigation") {
    try {
      const url = new URL(step.url);
      return `Navigate to ${url.pathname === "/" ? url.hostname : url.pathname}`;
    } catch {
      return "Navigate to page";
    }
  }
  const a = step.element?.attributes;
  const target =
    step.element?.text?.trim().slice(0, 70) ||
    a?.["aria-label"] ||
    a?.name ||
    a?.id ||
    a?.["data-testid"] ||
    step.element?.tag ||
    "element";
  if (step.type === "input") return `Set ${target}`;
  return `Click ${target}`;
}
export function sessionTitle(run: Run): string {
  return (
    run.title || `QA session · ${new Date(run.startedAt).toLocaleString()}`
  );
}
export function qaReport(run: Run): string {
  const lines = [
    `# ${sessionTitle(run)}`,
    "",
    `Recorded: ${new Date(run.startedAt).toISOString()}`,
    `Steps: ${run.steps.length}`,
    "",
    "## Steps to reproduce",
    "",
  ];
  run.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${actionLabel(step)}`, `   URL: ${step.url}`);
    if (step.value !== undefined) lines.push(`   Input: ${step.value}`);
    lines.push(`   Result: ${step.review?.result ?? "not-reviewed"}`);
    if (step.review?.expected)
      lines.push(`   Expected: ${step.review.expected}`);
    if (step.review?.actual)
      lines.push(`   Actual / notes: ${step.review.actual}`);
    lines.push("");
  });
  lines.push(
    "Screenshots are included in the separate JSON export; this report contains text only.",
  );
  return lines.join("\n");
}
