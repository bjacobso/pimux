// --- File status ---

export type FileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"

export interface FileEntry {
  readonly path: string
  readonly status: FileStatus
  readonly additions: number
  readonly deletions: number
  readonly oldPath?: string
}

// --- Commit ---

export interface CommitEntry {
  readonly hash: string
  readonly subject: string
}

// --- Branch data (all git state for display) ---

export interface GitBranchData {
  readonly branch: string
  readonly upstream: string | null
  readonly ahead: number
  readonly behind: number
  readonly staged: ReadonlyArray<FileEntry>
  readonly unstaged: ReadonlyArray<FileEntry>
  readonly untracked: ReadonlyArray<string>
  readonly commits: ReadonlyArray<CommitEntry>
}

// --- Sections ---

export type SectionId = "staged" | "unstaged" | "untracked" | "commits"

export interface SectionState {
  readonly id: SectionId
  readonly collapsed: boolean
}
