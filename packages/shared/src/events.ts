/**
 * The canonical set of cross-subsystem event names (SPEC section 57).
 * Payload types live next to each name so producers/consumers stay in sync
 * without importing each other's internals.
 */

import type { FileChangeEvent } from "./vfs.js";

export interface WorkspaceLoadedPayload {
  workspaceId: string;
  rootPath: string;
}

export interface FileOpenedPayload {
  path: string;
}

export interface FileClosedPayload {
  path: string;
}

export interface RuntimeStartedPayload {
  language: string;
  sessionId: string;
}

export interface RuntimeStoppedPayload {
  language: string;
  sessionId: string;
  exitCode: number | null;
}

export interface TerminalOutputPayload {
  sessionId: string;
  stream: "stdout" | "stderr";
  data: string;
}

export interface GitStatusChangedPayload {
  branch: string | null;
  changedFiles: number;
}

export interface SyncPayload {
  reason?: string;
}

export interface AiRequestStartedPayload {
  requestId: string;
  kind: string;
}

export interface AiRequestCompletedPayload {
  requestId: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
}

export interface KnoxEventMap {
  FILE_CHANGED: FileChangeEvent;
  FILE_OPENED: FileOpenedPayload;
  FILE_CLOSED: FileClosedPayload;
  WORKSPACE_LOADED: WorkspaceLoadedPayload;
  RUNTIME_STARTED: RuntimeStartedPayload;
  RUNTIME_STOPPED: RuntimeStoppedPayload;
  TERMINAL_OUTPUT: TerminalOutputPayload;
  GIT_STATUS_CHANGED: GitStatusChangedPayload;
  SYNC_STARTED: SyncPayload;
  SYNC_COMPLETED: SyncPayload;
  SYNC_FAILED: SyncPayload & { error: string };
  AI_REQUEST_STARTED: AiRequestStartedPayload;
  AI_REQUEST_COMPLETED: AiRequestCompletedPayload;
}

export type KnoxEventName = keyof KnoxEventMap;
