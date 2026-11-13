import type { Step } from "./types";

export type MsgFromContent =
  | {
      kind: "RECORD_STEP";
      step: Omit<Step, "stepId" | "timestamp" | "visualContext" | "url"> & {
        url?: string;
        viewport?: { width: number; height: number; devicePixelRatio: number };
        sensitive?: boolean;
        pointer?: { x: number; y: number };
      };
    }
  | { kind: "NAVIGATION"; url: string };

export type MsgFromPopup =
  | { kind: "START_RECORDING"; tabId: number; title?: string }
  | { kind: "STOP_RECORDING"; openViewer?: boolean }
  | { kind: "SET_PAUSED"; paused: boolean }
  | { kind: "GET_STATUS" }
  | { kind: "GET_CURRENT_RUN" };

export type MsgToPopup =
  | { kind: "ERROR"; message: string }
  | {
      kind: "STATUS";
      isRecording: boolean;
      paused?: boolean;
      title?: string;
      tabId?: number;
      startedAt?: number;
      runId?: string;
      stepCount?: number;
    }
  | { kind: "CURRENT_RUN"; runId?: string; steps?: Step[] };
