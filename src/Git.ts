import { Context, Data, Effect, Layer } from "effect"

// --- Errors ---

export class GitError extends Data.TaggedError("GitError")<{
  readonly command: string
  readonly message: string
  readonly stderr?: string
}> {}

// --- Types ---

export interface WorktreeInfo {
  readonly path: string
  readonly branch: string
  readonly head: string
  readonly bare: boolean
}

// --- Service definition ---

export class GitService extends Context.Tag("GitService")<
  GitService,
  {
    /** Get the root of the current git repo */
    readonly repoRoot: () => Effect.Effect<string, GitError>

    /** Create a new worktree with a new branch */
    readonly createWorktree: (
      path: string,
      branch: string
    ) => Effect.Effect<void, GitError>

    /** Remove a worktree */
    readonly removeWorktree: (
      path: string,
      options?: { force?: boolean }
    ) => Effect.Effect<void, GitError>

    /** List all worktrees */
    readonly listWorktrees: () => Effect.Effect<
      ReadonlyArray<WorktreeInfo>,
      GitError
    >

    /** Get diff for a worktree (against its base) */
    readonly diff: (
      worktreePath: string,
      options?: { staged?: boolean }
    ) => Effect.Effect<string, GitError>

    /** Get short diff stat */
    readonly diffStat: (
      worktreePath: string
    ) => Effect.Effect<string, GitError>

    /** Get current branch name */
    readonly currentBranch: (
      cwd?: string
    ) => Effect.Effect<string, GitError>
  }
>() {}

// --- Helpers ---

const runGit = (
  args: ReadonlyArray<string>,
  cwd?: string
): Effect.Effect<string, GitError> =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () => {
        const proc = Bun.spawn(["git", ...args], {
          stdout: "pipe",
          stderr: "pipe",
          cwd,
        })
        return proc.exited.then(async (exitCode) => {
          const stdout = await new Response(proc.stdout).text()
          const stderr = await new Response(proc.stderr).text()
          return { exitCode, stdout, stderr }
        })
      },
      catch: (err) =>
        new GitError({
          command: `git ${args.join(" ")}`,
          message: `Failed to spawn git: ${err}`,
        }),
    })

    if (result.exitCode !== 0) {
      return yield* new GitError({
        command: `git ${args.join(" ")}`,
        message: `git exited with code ${result.exitCode}`,
        stderr: result.stderr,
      })
    }

    return result.stdout.trim()
  })

const runGitVoid = (
  args: ReadonlyArray<string>,
  cwd?: string
): Effect.Effect<void, GitError> => runGit(args, cwd).pipe(Effect.asVoid)

/** Parse `git worktree list --porcelain` output */
const parseWorktreeList = (output: string): ReadonlyArray<WorktreeInfo> => {
  const worktrees: WorktreeInfo[] = []
  const blocks = output.split("\n\n").filter((b) => b.trim().length > 0)

  for (const block of blocks) {
    const lines = block.split("\n")
    let path = ""
    let head = ""
    let branch = ""
    let bare = false

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length)
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length)
      } else if (line.startsWith("branch ")) {
        branch = line.slice("branch ".length).replace("refs/heads/", "")
      } else if (line === "bare") {
        bare = true
      }
    }

    if (path) {
      worktrees.push({ path, head, branch, bare })
    }
  }

  return worktrees
}

// --- Live implementation ---

export const GitServiceLive = Layer.succeed(GitService, {
  repoRoot: () => runGit(["rev-parse", "--show-toplevel"]),

  createWorktree: (path, branch) =>
    runGitVoid(["worktree", "add", path, "-b", branch]),

  removeWorktree: (path, options) =>
    runGitVoid(
      options?.force
        ? ["worktree", "remove", "--force", path]
        : ["worktree", "remove", path]
    ),

  listWorktrees: () =>
    runGit(["worktree", "list", "--porcelain"]).pipe(
      Effect.map(parseWorktreeList)
    ),

  diff: (worktreePath, options) =>
    runGit(
      options?.staged
        ? ["-C", worktreePath, "diff", "--staged"]
        : ["-C", worktreePath, "diff"]
    ),

  diffStat: (worktreePath) =>
    runGit(["-C", worktreePath, "diff", "--stat"]),

  currentBranch: (cwd) =>
    runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
})
