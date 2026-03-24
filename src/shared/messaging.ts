import type { Step } from "./types";

export type MsgFromContent =
  | { kind: "RECORD_STEP"; step: Omit<Step, "stepId" | "timestamp" | "visualContext" | "url"> & { url?: string; viewport?: { width: number; height: number; devicePixelRatio: number }; sensitive?: boolean; pointer?: { x: number; y: number } } }
  | { kind: "NAVIGATION"; url: string };

export type MsgFromPopup =
  | { kind: "START_RECORDING"; tabId: number }
  | { kind: "STOP_RECORDING" }
  | { kind: "GET_STATUS" }
  | { kind: "GET_CURRENT_RUN" };

export type MsgToPopup =
  | { kind: "ERROR"; message: string }
  | { kind: "STATUS"; isRecording: boolean; runId?: string; stepCount?: number }
  | { kind: "CURRENT_RUN"; runId?: string; steps?: Step[] };
