export type OutputStream = "stdout" | "stderr";
export type OutputHandler = (stream: OutputStream, text: string) => void;

export interface RunOptions {
  language: "javascript" | "typescript";
  code: string;
  timeoutMs?: number;
  onOutput?: OutputHandler;
}

export interface RunResult {
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}
