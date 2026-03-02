# Git Integration

## Strategy

pimux manages git worktrees and branches to give each task an isolated working directory. All git operations are performed by shelling out to the `git` CLI.

## GitService

### Worktree Management

| Method | Git Command | Purpose |
|--------|------------|---------|
| `createWorktree(path, branch)` | `git worktree add <path> -b <branch>` | Create a new worktree with a new branch |
| `removeWorktree(path, opts?)` | `git worktree remove [--force] <path>` | Remove a worktree |
| `listWorktrees()` | `git worktree list --porcelain` | List all worktrees (parsed) |

### Diff & Branch Info

| Method | Git Command | Purpose |
|--------|------------|---------|
| `diff(path, opts?)` | `git -C <path> diff [--staged]` | Get full diff for a worktree |
| `diffStat(path)` | `git -C <path> diff --stat` | Get short diff summary |
| `currentBranch(cwd?)` | `git rev-parse --abbrev-ref HEAD` | Get current branch name |
| `repoRoot()` | `git rev-parse --show-toplevel` | Get the root of the current repo |

## Worktree Layout

All pimux worktrees live under `.pimux/worktrees/` in the repo root:

```
my-repo/
├── .pimux/
│   ├── config.json
│   ├── tasks.json
│   └── worktrees/
│       ├── fix-login-bug/     ← git worktree (branch: pimux/fix-login-bug)
│       ├── add-dark-mode/     ← git worktree (branch: pimux/add-dark-mode)
│       └── refactor-api/      ← git worktree (branch: pimux/refactor-api)
├── src/
├── package.json
└── ...
```

## Branch Naming Convention

All task branches follow the pattern: `pimux/<slug>`

The slug is derived from the task name:
- Lowercased
- Non-alphanumeric characters replaced with hyphens
- Leading/trailing hyphens stripped

Example: `"Fix Login Bug"` → slug `fix-login-bug` → branch `pimux/fix-login-bug`

## Worktree Lifecycle

### Creation (during task launch)
```
git worktree add .pimux/worktrees/fix-login-bug -b pimux/fix-login-bug
```
This creates a new branch from the current HEAD and checks it out in the worktree directory.

### Removal (during task close)
```
git worktree remove --force .pimux/worktrees/fix-login-bug
```
The `--force` flag is used to handle dirty worktrees (uncommitted changes).

**Note:** The branch (`pimux/fix-login-bug`) is NOT deleted — it remains for reference/recovery.

## Porcelain Parsing

`git worktree list --porcelain` output is parsed into structured `WorktreeInfo` objects:

```
worktree /path/to/repo
HEAD abc123def456
branch refs/heads/main

worktree /path/to/repo/.pimux/worktrees/fix-login-bug
HEAD def456abc123
branch refs/heads/pimux/fix-login-bug
```

Each block is parsed for: `path`, `head` (commit hash), `branch` (with `refs/heads/` stripped), and `bare` flag.

## Error Handling

All git operations can fail with `GitError`:
- `command` — the full git command
- `message` — description of the failure
- `stderr` — captured stderr

Common failures: not a git repo, branch already exists, worktree path already in use, dirty worktree on remove.
