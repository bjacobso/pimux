# Configuration & Hooks

## Config File

pimux reads configuration from `.pimux/config.json` in the git repo root.

### Schema

```json
{
  "setup": ["bun install", "bun run build"],
  "teardown": ["bun run clean"]
}
```

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `setup` | `string[]` | `[]` | Commands to run in the worktree before the agent starts |
| `teardown` | `string[]` | `[]` | Commands to run before closing a task |

Both fields are optional. If the config file doesn't exist, defaults to empty arrays.

## ConfigService

Two methods:

- **`load()`** — Reads and validates `.pimux/config.json`, returns a `PimuxConfig` object. Falls back to default config if the file is missing or invalid.
- **`pimuxDir()`** — Returns the absolute path to `.pimux/` directory (based on `git rev-parse --show-toplevel`). Falls back to `process.cwd()` if not in a git repo.

## Hook Execution

The `HookRunner` service executes setup/teardown hooks:

- Commands run **sequentially** (one after another)
- Each command runs via `sh -c "<command>"` in the worktree directory
- stdout/stderr are captured
- A non-zero exit code produces a `HookError`
- Each successful hook is logged: `"Hook completed: <command>"`

### Setup Hooks

Run during task launch, after the worktree is created but before the agent starts. Typical uses:

- Install dependencies (`bun install`, `npm install`)
- Build the project (`bun run build`)
- Generate files
- Set up environment

If a setup hook fails, the task transitions to `failed`.

### Teardown Hooks

Run during task close, before the workspace and worktree are destroyed. Typical uses:

- Clean up build artifacts
- Save logs
- Run final checks

Teardown hook failures are **caught and logged** — they don't prevent the rest of the close flow from completing.

## Directory Structure

```
.pimux/
├── config.json      ← Per-repo configuration (setup/teardown hooks)
├── tasks.json       ← Task registry (managed by TaskManager)
└── worktrees/       ← Git worktrees for active tasks
    ├── task-1/
    └── task-2/
```

The `.pimux/` directory is located at the git repository root.
