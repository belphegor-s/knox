export type GitFileStatusCode = "modified" | "added" | "deleted" | "untracked" | "unmodified" | "unmerged";

export interface GitFileStatus {
  path: string;
  status: GitFileStatusCode;
  staged: boolean;
}

export interface GitCommitInfo {
  oid: string;
  message: string;
  author: string;
  email: string;
  timestamp: number;
}

export interface GitBranchInfo {
  name: string;
  current: boolean;
}

export interface GitDiffHunk {
  type: "add" | "remove" | "context";
  lines: string[];
}

export interface GitAuthor {
  name: string;
  email: string;
}

export interface GitAuth {
  username: string;
  password: string;
}
