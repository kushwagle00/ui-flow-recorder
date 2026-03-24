export type ActionType = "click" | "input" | "navigation";

export interface ElementSnapshot {
  tag: string;
  text?: string;
  attributes: Record<string, string | undefined>;
}

export interface Selectors {
  primary: string;
  alternatives: string[];
}

export interface VisualContext {
  screenshotDataUrl?: string; // base64 data URL
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  pointer?: { x: number; y: number; units: "viewport-px" };
}

export interface Step {
  stepId: number;
  timestamp: number;
  type: ActionType;
  url: string;

  element?: ElementSnapshot;
  selectors?: Selectors;

  value?: string; // for input
  visualContext?: VisualContext;
}

export interface Run {
  runId: string;
  startedAt: number;
  stoppedAt?: number;
  steps: Step[];
}
