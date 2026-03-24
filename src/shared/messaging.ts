import type { Step } from "./types";

export type MsgFromContent =
  | { kind: "RECORD_STEP"; step: Omit<Step, "stepId" | "timestamp" | "visualContext" | "url"> & { pointer?: { x: number; y: number } } }
  | { kind: "NAVIGATION"; url: string };

export type MsgFromPopup =
  | { kind: "TOGGLE_RECORDING" }
  | { kind: "GET_STATUS" }
  | { kind: "GET_CURRENT_RUN" }
  | { kind: "STOP_AND_EXPORT" };

export type MsgToPopup =
  | { kind: "STATUS"; isRecording: boolean; runId?: string; stepCount?: number }
  | { kind: "CURRENT_RUN"; runId?: string; steps?: Step[] };
