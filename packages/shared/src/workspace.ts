import type { AgentPermissions } from "./capabilities.js";

export type FsBackendKind = "opfs" | "indexeddb" | "file-system-access";

export interface WorkspaceMetadata {
  id: string;
  name: string;
  createdAt: number;
  lastOpenedAt: number;
  fsBackend: FsBackendKind;
  /** Set when opened via the File System Access API; lets us re-request the handle. */
  hasDirectoryHandle: boolean;
  gitRemoteUrl?: string;
  color?: string;
}

export interface EditorSelection {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface OpenTab {
  path: string;
  pinned: boolean;
  preview: boolean;
  cursorLine: number;
  cursorColumn: number;
  selections: EditorSelection[];
  scrollTop: number;
}

export interface PanelLayout {
  sidebarVisible: boolean;
  sidebarWidth: number;
  panelVisible: boolean;
  panelHeight: number;
  aiPanelVisible: boolean;
  aiPanelWidth: number;
  activeActivityView: "explorer" | "search" | "git" | "debug" | "extensions";
  bottomPanelTab: "terminal" | "problems";
}

export interface WorkspaceSession {
  workspaceId: string;
  openTabs: OpenTab[];
  activeTabPath: string | null;
  layout: PanelLayout;
  updatedAt: number;
}

export interface WorkspaceSettings {
  agentPermissions: AgentPermissions;
  aiProviderId: string | null;
  formatOnSave: boolean;
  tabSize: number;
  insertSpaces: boolean;
  eol: "lf" | "crlf";
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  agentPermissions: {
    readFiles: "allow",
    modifyFiles: "ask",
    runCommands: "ask",
    networkAccess: "deny",
    gitCommit: "ask",
    gitPush: "ask",
    deleteFiles: "ask",
  },
  aiProviderId: null,
  formatOnSave: false,
  tabSize: 2,
  insertSpaces: true,
  eol: "lf",
};
