/**
 * Every code-execution runtime (local WASM or cloud container) declares what
 * it can actually do. The UI reads this instead of assuming - see
 * SPEC section 10/11 ("never grant powerful browser APIs implicitly").
 */
export interface RuntimeCapabilities {
  language: string;
  displayName: string;
  localExecution: boolean;
  wasm: boolean;
  filesystem: boolean;
  network: boolean;
  interactive: boolean;
  /** Why local execution is unavailable, shown verbatim to the user. */
  unavailableReason?: string;
}

export type PermissionDecision = "allow" | "ask" | "deny";

/**
 * Explicit, user-editable permission grants for the AI agent. Nothing here
 * is implicit - see SPEC section 22.
 */
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

/**
 * Sandbox boundaries applied to every local execution worker by default.
 * Runtimes may request elevation; the UI must surface that request, never
 * grant it silently.
 */
export interface ExecutionSandboxPolicy {
  filesystem: "none" | "workspace-only" | "full";
  network: boolean;
  clipboard: boolean;
  camera: boolean;
  microphone: boolean;
  location: boolean;
  /** Wall-clock execution timeout in ms. */
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
