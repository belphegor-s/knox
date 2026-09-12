export interface RuntimeCapabilities {
  language: string;
  displayName: string;
  localExecution: boolean;
  wasm: boolean;
  filesystem: boolean;
  network: boolean;
  interactive: boolean;
  unavailableReason?: string;
}

export type PermissionDecision = "allow" | "ask" | "deny";

export interface AgentPermissions {
  readFiles: PermissionDecision;
  modifyFiles: PermissionDecision;
  runCommands: PermissionDecision;
  networkAccess: PermissionDecision;
  gitCommit: PermissionDecision;
  gitPush: PermissionDecision;
  deleteFiles: PermissionDecision;
}

export const DEFAULT_AGENT_PERMISSIONS: AgentPermissions = {
  readFiles: "allow",
  modifyFiles: "ask",
  runCommands: "ask",
  networkAccess: "deny",
  gitCommit: "ask",
  gitPush: "ask",
  deleteFiles: "ask",
};

// Default sandbox for local execution workers; runtimes must request elevation, never assume it.
export interface ExecutionSandboxPolicy {
  filesystem: "none" | "workspace-only" | "full";
  network: boolean;
  clipboard: boolean;
  camera: boolean;
  microphone: boolean;
  location: boolean;
  timeoutMs: number;
  memoryLimitMb: number;
}

export const DEFAULT_SANDBOX_POLICY: ExecutionSandboxPolicy = {
  filesystem: "workspace-only",
  network: false,
  clipboard: false,
  camera: false,
  microphone: false,
  location: false,
  timeoutMs: 30_000,
  memoryLimitMb: 512,
};
